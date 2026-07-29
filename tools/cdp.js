/* ============================================================
   cdp.js — ไคลเอนต์ Chrome DevTools Protocol แบบเล็กที่สุด
   ใช้ร่วมกันโดย smoke.js / flow.js / probe.js (ไม่มี dependency)
   ============================================================ */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function findChrome() {
  const r = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(r)) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJSON = (url) =>
  new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => {
          try { res(JSON.parse(b)); } catch (e) { rej(e); }
        });
      })
      .on('error', rej);
  });

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let buf = Buffer.alloc(0);
    let up = false;
    const hs = [];
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!up) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        up = true;
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
        const pl = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if (op === 1) hs.forEach((f) => f(pl.toString('utf8')));
        if (op === 8) sock.destroy();
      }
    });
    sock.on('error', reject);
    const api = {
      send(str) {
        const p = Buffer.from(str, 'utf8');
        const mask = crypto.randomBytes(4);
        let head;
        if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
        else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(p.length, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(p.length), 2); }
        const m = Buffer.alloc(p.length);
        for (let i = 0; i < p.length; i++) m[i] = p[i] ^ mask[i % 4];
        sock.write(Buffer.concat([head, mask, m]));
      },
      onMessage: (f) => hs.push(f),
      close: () => sock.destroy(),
    };
  });
}

/**
 * เปิด chromium headless แล้วคืน { cmd, evalJS, errors, close, setMobile }
 */
async function launch(opts) {
  opts = opts || {};
  const bin = findChrome();
  if (!bin) return null;
  const port = opts.port || 9400 + Math.floor(Math.random() * 400);

  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--disable-dev-shm-usage', '--no-first-run', '--disable-extensions',
    `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });

  const kill = () => { try { proc.kill(); } catch (e) {} };
  process.on('exit', kill);

  for (let i = 0; i < 80; i++) {
    try { await getJSON(`http://127.0.0.1:${port}/json/version`); break; } catch (e) { await sleep(250); }
  }
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const page = list.find((t) => t.type === 'page');
  if (!page) { kill(); throw new Error('ไม่พบ page target'); }
  const ws = await wsConnect(page.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onMessage((raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push({ type: 'console', text: (m.params.args || []).map((a) => a.value || a.description || '').join(' ') });
    }
  });

  const cmd = (method, params) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });

  const evalJS = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await cmd('Runtime.enable');
  await cmd('Page.enable');

  const setMobile = (w, hgt) =>
    cmd('Emulation.setDeviceMetricsOverride', { width: w || 390, height: hgt || 844, deviceScaleFactor: 2, mobile: true });

  return {
    cmd, evalJS, errors, sleep,
    setMobile,
    goto: async (url, waitMs) => { await cmd('Page.navigate', { url }); await sleep(waitMs == null ? 1800 : waitMs); },
    reload: async (waitMs) => { await cmd('Page.reload'); await sleep(waitMs == null ? 1700 : waitMs); },
    close: () => { ws.close(); kill(); },
  };
}

module.exports = { launch, findChrome, sleep };
