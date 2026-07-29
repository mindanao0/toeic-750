#!/usr/bin/env node
/* ============================================================
   smoke.js — เปิดทุกหน้าจอด้วย headless chromium แล้วเช็คว่า
   เรนเดอร์ได้จริงและไม่มี error ใน console
   รัน: node tools/smoke.js [baseUrl]
   ============================================================ */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080/';
const ROUTES = [
  '/', '/learn', '/drill', '/cards', '/stats', '/mistakes',
  '/exam', '/placement', '/cheatsheet', '/examinfo', '/settings', '/result', '/nope',
];

function findChrome() {
  const roots = [path.join(os.homedir(), '.cache/ms-playwright')];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r)) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = path.join(r, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('ไม่พบ chromium — ข้ามการทดสอบหน้าจอ');
  process.exit(0);
}

const PORT = 9333;
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

process.on('exit', () => proc.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try { return await httpJSON(`http://127.0.0.1:${PORT}/json/version`); } catch (e) { await sleep(250); }
  }
  throw new Error('เชื่อมต่อ chromium ไม่ได้');
}

/* --- ไคลเอนต์ CDP แบบเล็กที่สุด (WebSocket เขียนเอง) --- */
const net = require('net');
const crypto = require('crypto');

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const handlers = { message: [] };

    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        upgraded = true;
        buf = buf.slice(i + 4);
        resolve(api);
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if (op === 1) handlers.message.forEach((f) => f(payload.toString('utf8')));
      }
    });
    sock.on('error', reject);

    function send(str) {
      const p = Buffer.from(str, 'utf8');
      const mask = crypto.randomBytes(4);
      let head;
      if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
      else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(p.length, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(p.length), 2); }
      const masked = Buffer.alloc(p.length);
      for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i % 4];
      sock.write(Buffer.concat([head, mask, masked]));
    }

    const api = {
      send,
      onMessage: (f) => handlers.message.push(f),
      close: () => sock.destroy(),
    };
  });
}

async function main() {
  await waitDevtools();
  const targets = await httpJSON(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  const ws = await wsConnect(page.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onMessage((raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push({ type: m.params.type, text: (m.params.args || []).map((a) => a.value || a.description || '').join(' ') });
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
    }
  });

  const cmd = (method, params) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });

  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Log.enable');

  let bad = 0;
  for (const r of ROUTES) {
    logs.length = 0;
    await cmd('Page.navigate', { url: BASE + '#' + r });
    await sleep(120);
    await cmd('Runtime.evaluate', { expression: `location.hash='${r}';` });
    await sleep(1500);

    const ev = await cmd('Runtime.evaluate', {
      expression: `(()=>{const a=document.getElementById('app');
        return JSON.stringify({t:(a.innerText||'').slice(0,180), n:a.querySelectorAll('*').length});})()`,
      returnByValue: true,
    });
    const info = JSON.parse(ev.result.result.value);
    const errs = logs.filter((l) => l.type !== 'warning');
    const crashed = /เกิดข้อผิดพลาดในหน้านี้/.test(info.t);
    const stuck = /^\s*📘?\s*กำลังโหลด…\s*$/.test(info.t);

    if (crashed || stuck || errs.length) {
      bad++;
      console.log(`❌ ${r}`);
      if (crashed) console.log(`   หน้าพัง: ${info.t.replace(/\n/g, ' ').slice(0, 140)}`);
      if (stuck) console.log('   ค้างที่หน้าโหลด');
      errs.slice(0, 3).forEach((e) => console.log(`   ${e.type}: ${String(e.text).split('\n')[0].slice(0, 180)}`));
    } else {
      console.log(`✅ ${r.padEnd(14)} ${info.n} elements · ${info.t.replace(/\n/g, ' · ').slice(0, 60)}`);
    }
  }

  ws.close();
  proc.kill();
  console.log(bad ? `\n❌ มีปัญหา ${bad} หน้า` : '\n✅ ทุกหน้าเรนเดอร์ได้ ไม่มี error');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
