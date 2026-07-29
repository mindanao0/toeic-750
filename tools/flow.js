#!/usr/bin/env node
/* ============================================================
   flow.js — ทดสอบการใช้งานจริงแบบต่อเนื่อง:
   ทำดริล → ตอบ → เห็นเฉลย → จบชุด → บันทึกสถิติ → ทวนข้อผิด → แฟลชการ์ด
   รัน: node tools/flow.js [baseUrl]
   ============================================================ */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080/';
const PORT = 9334;

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
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium']) if (fs.existsSync(p)) return p;
  return null;
}

const CHROME = findChrome();
if (!CHROME) { console.error('ไม่พบ chromium — ข้าม'); process.exit(0); }

const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => proc.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJSON = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
});

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0), up = false;
    const hs = [];
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = true; buf = buf.slice(i + 4); resolve(api); }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (op === 1) hs.forEach((f) => f(pl.toString('utf8')));
      }
    });
    sock.on('error', reject);
    const api = {
      send(str) {
        const p = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
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

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  for (let i = 0; i < 60; i++) { try { await httpJSON(`http://127.0.0.1:${PORT}/json/version`); break; } catch (e) { await sleep(250); } }
  const list = await httpJSON(`http://127.0.0.1:${PORT}/json/list`);
  const ws = await wsConnect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onMessage((raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
  });
  const cmd = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Page.navigate', { url: BASE });
  await sleep(1800);

  console.log('\n▶ ทดสอบการใช้งานจริง\n');

  // 1. คลังข้อมูลโหลดได้
  const inv = await evalJS(`App.Data.inventory().then(i=>JSON.stringify(i))`);
  const invO = JSON.parse(inv);
  check('โหลดคลังข้อมูลได้', invO.drillTotal > 0 || invO.vocab > 0, JSON.stringify(invO).slice(0, 120));

  // 2. เริ่มดริล
  await evalJS(`App.Data.selectDrill({part:5,n:5}).then(u=>{
    window.__U=u;
    App.Quiz.start({units:u,mode:'practice',title:'ทดสอบ',backTo:'#/drill',
      onExit:()=>App.go('#/drill'),
      onFinish:(res)=>{App.Store.addAttempt({mode:'drill',part:5,items:res.items,ms:res.ms});
        window.__RES=res;App.pendingResult=res;App.go('#/result');}});
    return 1;})`);
  await sleep(700);
  const q1 = await evalJS(`(()=>{const c=document.querySelectorAll('.choice');
    return JSON.stringify({n:c.length, stem:(document.querySelector('.qstem')||{}).innerText||''});})()`);
  const q1o = JSON.parse(q1);
  check('แสดงโจทย์และตัวเลือก', q1o.n === 4 && q1o.stem.length > 3, JSON.stringify(q1o).slice(0, 140));

  // 3. ตอบข้อแรก -> ต้องเห็นเฉลย
  await evalJS(`document.querySelectorAll('.choice')[0].click();`);
  await sleep(400);
  const exp = await evalJS(`(()=>{const e=document.querySelector('.exp');
    return JSON.stringify({has:!!e, head:e?e.querySelector('.exp-head').innerText:'',
      secs:e?e.querySelectorAll('.exp-sec,.exp-point,.exp-trick,.exp-wrong').length:0});})()`);
  const expO = JSON.parse(exp);
  check('เฉลยขึ้นทันทีหลังตอบ', expO.has && expO.secs >= 3, JSON.stringify(expO).slice(0, 140));
  check('เฉลยบอกถูก/ผิดชัดเจน', /ถูกต้อง|ผิด/.test(expO.head), expO.head);

  // 4. ทำจนจบชุด
  for (let i = 0; i < 12; i++) {
    const done = await evalJS(`(()=>{
      if(location.hash==='#/result') return 'done';
      const c=document.querySelectorAll('.choice:not([disabled])');
      if(c.length){c[Math.floor(Math.random()*c.length)].click();return 'ans';}
      const b=[...document.querySelectorAll('button')].find(x=>/ข้อต่อไป|ดูสรุปผล/.test(x.innerText));
      if(b){b.click();return 'next';}
      return 'stuck';})()`);
    await sleep(300);
    if (done === 'done') break;
  }
  check('ทำครบชุดแล้วเข้าหน้าสรุปผล', await evalJS(`location.hash==='#/result'`));

  const resTxt = await evalJS(`document.getElementById('app').innerText.slice(0,200)`);
  check('หน้าสรุปผลแสดงคะแนน', /\d+\/\d+/.test(resTxt), resTxt.replace(/\n/g, ' ').slice(0, 100));

  // 5. สถิติถูกบันทึก
  const st = await evalJS(`(()=>{const s=App.Store.state();
    return JSON.stringify({attempts:s.attempts.length, answered:App.Store.totalAnswered(s),
      xp:s.progress.xp, mistakes:Object.keys(s.mistakes).length,
      seen:Object.keys(s.seen).length, streak:s.progress.streak});})()`);
  const stO = JSON.parse(st);
  check('บันทึกสถิติลง localStorage', stO.attempts >= 1 && stO.answered >= 5 && stO.xp > 0, st);
  check('นับ streak เป็นวันแรก', stO.streak === 1, 'streak=' + stO.streak);

  // 6. ข้อมูลอยู่รอดหลังรีเฟรช
  await cmd('Page.reload');
  await sleep(1600);
  const st2 = await evalJS(`JSON.stringify({a:App.Store.state().attempts.length, xp:App.Store.state().progress.xp})`);
  check('ข้อมูลอยู่รอดหลังรีเฟรชหน้า', JSON.parse(st2).a >= 1 && JSON.parse(st2).xp > 0, st2);

  // 7. คะแนนคาดการณ์คำนวณได้
  const pred = await evalJS(`JSON.stringify(App.Score.predict(App.Store.state()))`);
  const p = JSON.parse(pred);
  check('คำนวณคะแนนคาดการณ์ได้', p.total >= 10 && p.total <= 990 && p.L + p.R === p.total, `total=${p.total} L=${p.L} R=${p.R}`);

  // 8. ตารางแปลงคะแนนสมเหตุสมผล
  const conv = await evalJS(`JSON.stringify([App.Score.scaledFromRaw(0,0),App.Score.scaledFromRaw(50,50),App.Score.scaledFromRaw(100,100)])`);
  const cv = JSON.parse(conv);
  check('ตารางแปลงคะแนน 0/50/100 ถูกช่วง',
    cv[0].total === 10 && cv[2].total === 990 && cv[1].total > 400 && cv[1].total < 550, conv);

  // 9. แฟลชการ์ด SRS
  const srs = await evalJS(`App.Data.vocab().then(v=>{
    if(!v.length) return JSON.stringify({skip:true});
    const w=v[0];
    App.SRS.review(w.id, App.SRS.GRADE.good);
    const c1=JSON.parse(JSON.stringify(App.SRS.get(w.id)));
    App.SRS.review(w.id, App.SRS.GRADE.good);
    const c2=JSON.parse(JSON.stringify(App.SRS.get(w.id)));
    App.SRS.review(w.id, App.SRS.GRADE.again);
    const c3=JSON.parse(JSON.stringify(App.SRS.get(w.id)));
    return JSON.stringify({c1,c2,c3,due:App.SRS.due(v,10,20).length});})`);
  const sr = JSON.parse(srs);
  if (!sr.skip) {
    check('SRS ระยะทวนเพิ่มขึ้นเมื่อจำได้', sr.c2.iv > sr.c1.iv, `${sr.c1.iv} → ${sr.c2.iv}`);
    check('SRS รีเซ็ตเมื่อจำไม่ได้', sr.c3.iv === 0 && sr.c3.lapses === 1, JSON.stringify(sr.c3));
    check('คิวทวนวันนี้มีคำ', sr.due > 0, 'due=' + sr.due);
  }

  // 10. สมุดข้อผิด + โหมดทวน
  const mk = await evalJS(`App.Data.ensureAll().then(()=>{
    const s=App.Store.state();
    const ids=Object.keys(s.mistakes);
    const found=ids.filter(id=>!!App.Data.findQ(id)).length;
    return JSON.stringify({total:ids.length, found});})`);
  const mkO = JSON.parse(mk);
  check('ค้นหาข้อที่ผิดกลับมาได้จาก qid', mkO.total === 0 || mkO.found === mkO.total, mk);

  // 11. สำรอง/กู้คืนข้อมูล
  const bk = await evalJS(`(()=>{const j=App.Store.exportJSON();
    const before=App.Store.state().progress.xp;
    App.Store.state().progress.xp=99999;
    App.Store.importJSON(j);
    return JSON.stringify({before, after:App.Store.state().progress.xp});})()`);
  const bkO = JSON.parse(bk);
  check('สำรอง/กู้คืนข้อมูลถูกต้อง', bkO.before === bkO.after, bk);

  // 12. บทเรียนเปิดได้
  const lessonOK = await evalJS(`(async()=>{const ls=App.Data.filesOf('lessons');
    if(!ls.length) return 'skip';
    location.hash='/lesson/'+ls[0];
    await new Promise(r=>setTimeout(r,900));
    const t=document.getElementById('app').innerText;
    return JSON.stringify({len:t.length, hasBlocks:document.querySelectorAll('.lb-text,.lb-ex,.lb-tbl,.lb-tip,.lb-warn').length});})()`);
  if (lessonOK !== 'skip') {
    const lo = JSON.parse(lessonOK);
    check('บทเรียนแสดงเนื้อหาครบ', lo.hasBlocks >= 5, lessonOK);
  }

  // 13. ไม่มี error ค้างอยู่
  check('ไม่มี JS error ตลอดการทดสอบ', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 200));

  ws.close(); proc.kill();
  console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
