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

  // 13. ภาพ Part 1 ต้องมีขนาดจริง (บั๊กเก่า: inline SVG สูง 0 บน Safari)
  const p1 = await evalJS(`App.Data.selectDrill({part:1,n:2}).then(u=>{
    if(!u.length) return JSON.stringify({skip:true});
    App.Quiz.start({units:u,mode:'practice',title:'p1',backTo:'#/',onExit:()=>{},onFinish:()=>{}});
    return new Promise(r=>setTimeout(()=>{
      const box=document.querySelector('.scene-box');
      const svg=document.querySelector('.scene-box > svg');
      const bb=box?box.getBoundingClientRect():null;
      const sb=svg?svg.getBoundingClientRect():null;
      r(JSON.stringify({
        box: bb?{w:Math.round(bb.width),h:Math.round(bb.height)}:null,
        svg: sb?{w:Math.round(sb.width),h:Math.round(sb.height)}:null,
        w:svg?svg.getAttribute('width'):null, hh:svg?svg.getAttribute('height'):null,
        par:svg?svg.getAttribute('preserveAspectRatio'):null,
        pad: box?box.style.getPropertyValue('--ar-pad'):null,
        ar: box?box.style.aspectRatio:null}));
    },700));
  })`);
  const p1o = JSON.parse(p1);
  if (!p1o.skip) {
    check('ภาพ Part 1 มีความสูงจริง (ไม่ใช่ 0)', p1o.box && p1o.box.h > 100 && p1o.svg && p1o.svg.h > 100, p1);
    check('ภาพ Part 1 อัตราส่วนถูก 4:3', p1o.box && Math.abs(p1o.box.h / p1o.box.w - 0.75) < 0.05, JSON.stringify(p1o.box));
    check('svg ถูกบังคับ width/height/preserveAspectRatio',
      p1o.w === '100%' && p1o.hh === '100%' && /xMidYMid/.test(p1o.par || ''), `w=${p1o.w} h=${p1o.hh} par=${p1o.par}`);
    check('มี --ar-pad สำรองสำหรับเบราว์เซอร์เก่า', /%$/.test(p1o.pad || ''), 'pad=' + p1o.pad);
  }

  // 14. เสียงต้องไม่อ่านตัวอักษร "(A)" ออกเสียง และต้องมี choice index ให้ไฮไลต์
  const tts = await evalJS(`App.Data.selectDrill({part:1,n:1}).then(async u1=>{
    const u2=await App.Data.selectDrill({part:2,n:1});
    const l1=u1.length?App.TTS.part1Lines(u1[0].raw):[];
    const l2=u2.length?App.TTS.part2Lines(u2[0].raw):[];
    return JSON.stringify({
      l1:l1.map(x=>({t:x.text.slice(0,28),c:x.choice})),
      l2:l2.map(x=>({t:x.text.slice(0,28),c:x.choice,sp:x.sp})),
      norm:[App.TTS.normalizeText('(A) He is typing'),
            App.TTS.normalizeText('Mr. Lee will arrive at 3 p.m.'),
            App.TTS.normalizeText('Send it to R&D  #3')],
    });})`);
  const tt = JSON.parse(tts);
  const allLines = (tt.l1 || []).concat(tt.l2 || []);
  check('ไม่มี "(A)" ในข้อความที่ส่งให้เสียงอ่าน',
    allLines.length > 0 && !allLines.some((x) => /^\s*\(?[A-D]\)/.test(x.t)),
    JSON.stringify(allLines.slice(0, 3)));
  check('ทุกตัวเลือกมี choice index ให้ไฮไลต์',
    (tt.l1 || []).every((x) => x.c != null) && (tt.l2 || []).filter((x) => x.sp === 'W').every((x) => x.c != null),
    JSON.stringify(tt.l2));
  check('ปรับข้อความก่อนอ่าน (ตัดตัวอักษร/ขยายคำย่อ)',
    tt.norm[0] === 'He is typing.' && /Mister/.test(tt.norm[1]) && /P M/.test(tt.norm[1]) && /and/.test(tt.norm[2]) && /number 3/.test(tt.norm[2]),
    JSON.stringify(tt.norm));

  // 15. เลือกเสียงตามคุณภาพ ไม่ใช่ตามลำดับที่เจอ
  const vq = await evalJS(`(()=>{
    const fake=[{name:'eSpeak English',lang:'en-US',voiceURI:'a',localService:true},
                {name:'Google US English',lang:'en-US',voiceURI:'b',localService:false},
                {name:'Microsoft Aria Online (Natural)',lang:'en-US',voiceURI:'c',localService:false},
                {name:'Microsoft Guy Online (Natural)',lang:'en-US',voiceURI:'d',localService:false}];
    const sc=fake.map(v=>({n:v.name,s:App.TTS.voiceScore(v),g:App.TTS.genderOf(v)}));
    return JSON.stringify(sc);})()`);
  const vqo = JSON.parse(vq);
  const espeak = vqo.find((x) => /espeak/i.test(x.n));
  const natural = vqo.filter((x) => /Natural/.test(x.n));
  check('ให้คะแนนเสียง eSpeak ต่ำสุด', espeak.s < Math.min(...vqo.filter((x) => x !== espeak).map((x) => x.s)), vq);
  check('แยกเพศผู้พูดจากชื่อเสียงได้', natural.some((x) => x.g === 'W') && natural.some((x) => x.g === 'M'), vq);

  // 16. ไฮไลต์ตัวเลือกตอนเสียงอ่านถึง
  const hl = await evalJS(`App.Data.selectDrill({part:2,n:1}).then(u=>{
    if(!u.length) return JSON.stringify({skip:true});
    App.Quiz.start({units:u,mode:'practice',title:'p2',backTo:'#/',onExit:()=>{},onFinish:()=>{}});
    return new Promise(r=>setTimeout(()=>{
      const btns=[...document.querySelectorAll('.choices .choice')];
      btns.forEach((b,k)=>b.classList.toggle('speaking',k===1));
      const on=btns.filter(b=>b.classList.contains('speaking')).length;
      const cs=btns[1]?getComputedStyle(btns[1]):null;
      r(JSON.stringify({n:btns.length,on,shadow:cs?cs.boxShadow!=='none':false,
        hidden:btns[0]?/ฟังจากเสียง/.test(btns[0].innerText):false}));
    },600));})`);
  const hlo = JSON.parse(hl);
  if (!hlo.skip) {
    check('Part 2 ซ่อนข้อความตัวเลือกไว้ (ต้องฟังเอง)', hlo.hidden, hl);
    check('ไฮไลต์ตัวเลือกที่กำลังอ่านได้', hlo.on === 1 && hlo.shadow, hl);
  }

  // 17. หัวข้อที่มีข้อไม่พอ ต้องเติมจากหัวข้ออื่นใน Part/ระดับเดียวกันจนครบโดส
  const topup = await evalJS(`(async()=>{
    const ts=await App.Data.drillTopics();
    const small=ts.filter(t=>t.n>=5 && t.n<=12)[0];
    if(!small) return JSON.stringify({skip:true});
    const part=small.parts[0], tier=small.tiers[0];
    const want=small.n+8;
    const got=await App.Data.selectDrill({part,tier,topic:small.topic,n:want});
    const strict=await App.Data.selectDrill({part,tier,topic:small.topic,n:want,strictTopic:true});
    const count=(u)=>u.reduce((a,x)=>a+x.n,0);
    // ข้อของหัวข้อที่ขอต้องมาก่อนตัวเติมทั้งหมด (ห้ามมีตัวเติมแทรกก่อนข้อในหัวข้อ)
    const flags=got.map(u=>u.topic===small.topic);
    const firstOff=flags.indexOf(false);
    const orderOk = firstOff<0 || !flags.slice(firstOff).includes(true);
    return JSON.stringify({topic:small.topic,have:small.n,want,
      got:count(got), strict:count(strict),
      onTopicUnits:flags.filter(Boolean).length, orderOk, firstIsOnTopic:flags[0]===true});
  })()`);
  const tu = JSON.parse(topup);
  if (!tu.skip) {
    check('หัวข้อที่ข้อไม่พอ เติมจากหัวข้ออื่นจนครบโดส', tu.got >= tu.want - 4 && tu.got > tu.have,
      `หัวข้อ ${tu.topic} มี ${tu.have} ข้อ ขอ ${tu.want} ได้ ${tu.got}`);
    check('strictTopic บังคับให้ได้เฉพาะหัวข้อนั้นได้', tu.strict <= tu.have, `strict=${tu.strict} have=${tu.have}`);
    check('ข้อของหัวข้อที่ขอมาก่อนตัวเติมเสมอ', tu.orderOk && tu.firstIsOnTopic, topup);
  }

  // 18. โหมดสอบ: กดตอบต้องไม่ตัดเสียงที่กำลังเล่น (ข้อสอบจริงเปิดเสียงครั้งเดียว)
  const examAudio = await evalJS(`App.Data.loadTest('placement').then(t=>{
    const u=t.units.filter(x=>x.part===3||x.part===4)[0] || t.units.filter(x=>x.part<=4)[0];
    if(!u) return JSON.stringify({skip:true});
    window.__stops=0;
    const realStop=App.TTS.stop;
    App.TTS.stop=function(){window.__stops++;return realStop.apply(this,arguments);};
    App.Quiz.start({units:[u],mode:'exam',title:'ex',timeLimitMs:600000,backTo:'#/',
      onExit:()=>{},onFinish:()=>{}});
    return new Promise(r=>setTimeout(()=>{
      const before=window.__stops;
      const c=document.querySelectorAll('.choices .choice')[1];
      if(c) c.click();
      setTimeout(()=>{
        const after=window.__stops;
        const sel=document.querySelectorAll('.choices .choice.sel').length;
        const palette=[...document.querySelectorAll('.timerbar button')].map(b=>b.innerText).join('');
        App.TTS.stop=realStop;
        r(JSON.stringify({before,after,sel,palette,
          stillHasAudio:!!document.querySelector('.audiobox')}));
      },350);
    },900));
  })`);
  const ea = JSON.parse(examAudio);
  if (!ea.skip) {
    check('โหมดสอบ: กดตอบแล้วเสียงไม่ถูกตัด', ea.after === ea.before,
      `TTS.stop ถูกเรียก ${ea.after - ea.before} ครั้งตอนกดตอบ`);
    check('โหมดสอบ: ตัวเลือกที่กดถูกทำเครื่องหมายไว้', ea.sel === 1, examAudio);
    check('โหมดสอบ: ตัวนับข้อที่ตอบแล้วอัปเดตทันที', /1\//.test(ea.palette), 'palette=' + ea.palette);
  }

  // 19. การรวมข้อมูลข้ามเครื่อง — จุดที่พลาดแล้วข้อมูลหาย
  const sync = await evalJS(`(()=>{
    const T=Date.now();
    const day=(n)=>App.addDays(App.today(),n);
    const A={  // เครื่อง A
      settings:{theme:'dark',fontScale:1.2,ttsRate:0.9,voiceMap:{US:'a-voice'}},
      plan:{startDate:day(-5),examDate:null},
      progress:{xp:300,streak:2,bestStreak:4,lastStudyDate:day(-1),
        studyDates:[day(-4),day(-1)],lessonsDone:{L01:1000,L02:2000},
        doneTasks:{'1:lesson:L01:':500},badges:[{id:'first-step',ts:900}]},
      attempts:[{id:'a1',ts:T-5000,date:day(-1),mode:'drill',n:2,correct:1,items:[{qid:'q1',ok:true},{qid:'q2',ok:false}]},
                {id:'a2',ts:T-4000,date:day(-1),mode:'drill',n:1,correct:1,items:[{qid:'q3',ok:true}]}],
      exams:[{ts:T-9000,testId:'test1',scaled:{L:300,R:300,total:600}}],
      srs:{w1:{iv:5,last:T-1000},w2:{iv:2,last:T-9000}},
      mistakes:{q2:{n:1,lastTs:T-5000,resolved:false}},
      seen:{q1:3,q2:1},
      notes:{q2:'จำ tense ไม่ได้'},
      placement:{ts:T-99000,scaled:{L:200,R:200,total:400}},
      sync:{on:true,token:'SECRET_TOKEN',gistId:'g1',device:'A'},
    };
    const B={  // เครื่อง B
      settings:{theme:'light',fontScale:1,ttsRate:1.2,voiceMap:{US:'b-voice'}},
      plan:{startDate:day(-7),examDate:day(20)},
      progress:{xp:250,streak:1,bestStreak:2,lastStudyDate:day(0),
        studyDates:[day(-3),day(-2),day(0)],lessonsDone:{L01:800,L03:3000},
        doneTasks:{'2:vocab::':600},badges:[{id:'streak-3',ts:1500}]},
      attempts:[{id:'a2',ts:T-4000,date:day(-1),mode:'drill',n:1,correct:1,items:[]},
                {id:'a3',ts:T-3000,date:day(0),mode:'drill',n:2,correct:2,items:[{qid:'q4',ok:true},{qid:'q5',ok:true}]}],
      exams:[{ts:T-9000,testId:'test1',scaled:{L:300,R:300,total:600}},
             {ts:T-2000,testId:'test2',scaled:{L:350,R:350,total:700}}],
      srs:{w1:{iv:9,last:T-500},w3:{iv:1,last:T-100}},
      mistakes:{q2:{n:2,lastTs:T-8000,resolved:true,resolvedTs:T-1000},q9:{n:1,lastTs:T-100,resolved:false}},
      seen:{q1:1,q4:2},
      notes:{q2:'ลืม since'},
      placement:{ts:T-50000,scaled:{L:250,R:250,total:500}},
    };
    const m=App.Sync.mergeStates(A,B);
    const packed=App.Sync.pack(A);
    return JSON.stringify({
      attemptIds:m.attempts.map(x=>x.id).sort(),
      a2HasItems:(m.attempts.find(x=>x.id==='a2').items||[]).length,
      exams:m.exams.length,
      xp:m.progress.xp,
      dates:m.progress.studyDates.length,
      streak:m.progress.streak,
      best:m.progress.bestStreak,
      lessons:Object.keys(m.progress.lessonsDone).sort(),
      lessonL01Ts:m.progress.lessonsDone.L01,
      tasks:Object.keys(m.progress.doneTasks).length,
      badges:m.progress.badges.map(b=>b.id).sort(),
      srsW1:m.srs.w1.iv, srsKeys:Object.keys(m.srs).sort(),
      q2resolved:m.mistakes.q2.resolved, q2n:m.mistakes.q2.n, mistakeKeys:Object.keys(m.mistakes).sort(),
      seenQ1:m.seen.q1, seenQ4:m.seen.q4,
      noteQ2:m.notes.q2,
      placementTs:m.placement.ts===A.placement.ts?'A':'B',
      startDate:m.plan.startDate===day(-7)?'earliest':'wrong',
      examDate:m.plan.examDate===day(20)?'kept':'lost',
      theme:m.settings.theme, font:m.settings.fontScale, voice:m.settings.voiceMap.US,
      packHasToken:JSON.stringify(packed).includes('SECRET_TOKEN'),
      exportHasToken:App.Store.exportJSON().includes('SECRET_TOKEN'),
    });
  })()`);
  const sy = JSON.parse(sync);
  check('รวมประวัติทำข้อสอบครบทุกครั้ง ไม่ทับกัน',
    sy.attemptIds.join(',') === 'a1,a2,a3', 'ได้ ' + sy.attemptIds.join(','));
  check('ครั้งที่มีรายละเอียดชนะครั้งที่ถูกตัดรายละเอียด', sy.a2HasItems === 1, 'items=' + sy.a2HasItems);
  check('ผลสอบไม่ซ้ำและไม่หาย', sy.exams === 2, 'exams=' + sy.exams);
  check('XP ไม่ลดลง', sy.xp === 300, 'xp=' + sy.xp);
  check('วันที่เรียนรวมกันครบ', sy.dates === 5, 'dates=' + sy.dates);
  // A มี day(-4),day(-1) · B มี day(-3),day(-2),day(0) → รวมแล้วต่อกัน 5 วันถึงวันนี้
  check('คิด streak ใหม่จากวันที่รวมแล้ว (ได้ streak จริงคืนมา)', sy.streak === 5, 'streak=' + sy.streak);
  check('สถิติ streak สูงสุดไม่ลดลง', sy.best === 5, 'best=' + sy.best);
  check('บทเรียนที่เรียนจบรวมกันครบ', sy.lessons.join(',') === 'L01,L02,L03', sy.lessons.join(','));
  check('บทที่เรียนทั้งสองเครื่องเก็บเวลาที่เร็วกว่า', sy.lessonL01Ts === 800, 'ts=' + sy.lessonL01Ts);
  check('ภารกิจที่ทำแล้วรวมกัน', sy.tasks === 2, 'tasks=' + sy.tasks);
  check('เหรียญตรารวมกันไม่ซ้ำ', sy.badges.join(',') === 'first-step,streak-3', sy.badges.join(','));
  check('คำศัพท์เอาการ์ดที่ทวนล่าสุด', sy.srsW1 === 9 && sy.srsKeys.join(',') === 'w1,w2,w3', sync.slice(0, 120));
  check('ข้อที่ผิดเอาสถานะล่าสุด (แก้ได้แล้วไม่กลับมาค้าง)',
    sy.q2resolved === true && sy.q2n === 2 && sy.mistakeKeys.join(',') === 'q2,q9', `resolved=${sy.q2resolved} n=${sy.q2n}`);
  check('จำนวนครั้งที่เจอข้อเอาค่ามากกว่า', sy.seenQ1 === 3 && sy.seenQ4 === 2, `q1=${sy.seenQ1} q4=${sy.seenQ4}`);
  check('โน้ตสองเครื่องไม่ทับกัน', /ลืม since/.test(sy.noteQ2) && /จำ tense/.test(sy.noteQ2), sy.noteQ2);
  check('ผลจัดระดับเอาครั้งล่าสุด', sy.placementTs === 'B', sy.placementTs);
  check('วันเริ่มแผนเอาวันที่เร็วที่สุด', sy.startDate === 'earliest', sy.startDate);
  check('วันสอบที่ตั้งไว้อีกเครื่องไม่หาย', sy.examDate === 'kept', sy.examDate);
  check('การตั้งค่าเป็นของเฉพาะเครื่อง ไม่ถูกทับ',
    sy.theme === 'dark' && sy.font === 1.2 && sy.voice === 'a-voice', JSON.stringify([sy.theme, sy.font, sy.voice]));
  check('โทเคนไม่ถูกส่งขึ้น gist', sy.packHasToken === false);
  check('โทเคนไม่ติดไปกับไฟล์สำรอง', sy.exportHasToken === false);

  const syncEnv = await evalJS(`JSON.stringify(App.Sync.status())`);
  check('ตรวจได้ว่าหน้านี้ซิงก์ได้หรือไม่', JSON.parse(syncEnv).available === true, syncEnv);

  // 20. h() ต้องไม่กลืนลูกที่ส่งมาเป็น array (บั๊กเงียบที่ทำให้ปุ่มในกล่องยืนยันหายทั้งแอป)
  const hTest = await evalJS(`(()=>{
    const h=App.h;
    const arr2nd = h('div', [h('span','a'), h('span','b')]);
    const arr3rd = h('div', {id:'x'}, [h('span','a'), h('span','b')]);
    const nested = h('div', [[h('span','a')], h('span','b')]);
    const mixed  = h('div', h('span','a'), [h('span','b'), h('span','c')]);
    const props  = h('div', {title:'t'}, 'x');
    return JSON.stringify({
      arr2nd:arr2nd.children.length, arr3rd:arr3rd.children.length,
      nested:nested.children.length, mixed:mixed.children.length,
      propsKept: props.getAttribute('title')==='t' && props.textContent==='x',
      noJunkAttr: arr2nd.attributes.length===0,
    });
  })()`);
  const ht = JSON.parse(hTest);
  check('h() รับ array เป็นลูกได้ทั้งตำแหน่งที่ 2 และ 3',
    ht.arr2nd === 2 && ht.arr3rd === 2, hTest);
  check('h() รองรับ array ซ้อนและแบบผสม', ht.nested === 2 && ht.mixed === 3, hTest);
  check('h() ยังแยก props ออกจากลูกได้ถูก', ht.propsKept && ht.noJunkAttr, hTest);

  // 21. กล่องยืนยันต้องมีปุ่มจริง (จุดที่บั๊กข้างบนทำพัง)
  const cb = await evalJS(`(()=>{
    App.confirmBox('t','m',()=>{},'เริ่มเลย');
    const btns=[...document.querySelectorAll('.modal button')].map(x=>x.innerText.trim());
    const bg=document.querySelector('.modal-bg'); if(bg) bg.remove();
    return JSON.stringify(btns);
  })()`);
  check('กล่องยืนยันมีปุ่มครบ', JSON.parse(cb).length === 2 && JSON.parse(cb).includes('เริ่มเลย'), cb);

  // 22. ปุ่มเลือกหัวข้อในหน้าฝึกทำต้องขึ้นจริง
  await evalJS(`location.hash='/drill'`);
  await sleep(1200);
  const drillUI = await evalJS(`JSON.stringify({
    topicBtns:[...document.querySelectorAll('.card .btn.sm')].length,
    partCards:[...document.querySelectorAll('.card')].length,
  })`);
  check('หน้าฝึกทำแสดงปุ่มเลือกระดับ/หัวข้อ', JSON.parse(drillUI).topicBtns >= 10, drillUI);

  // 23. เกณฑ์เหรียญตราและแถบความคืบหน้าต้องอิงเนื้อหาที่มีจริง (เดิมฮาร์ดโค้ด 30 บท / 600 คำ = ได้ไม่ได้เลย)
  const goals = await evalJS(`(async()=>{
    const ids=await App.Data.planLessonIds();
    const v=await App.Data.vocab();
    const s=App.Store.state();
    ids.forEach(id=>s.progress.lessonsDone[id]=Date.now());
    v.forEach(w=>s.srs[w.id]={ef:2.5,iv:10,due:App.today(),reps:5,lapses:0,last:Date.now()});
    App.Store.setContent({lessons:ids.length, vocab:v.length});
    const have=new Set(s.progress.badges.map(x=>x.id));
    const bg=document.querySelector('.modal-bg'); if(bg) bg.remove();
    location.hash='/learn';
    await new Promise(r=>setTimeout(r,1100));
    return JSON.stringify({
      planLessons:ids.length, vocab:v.length,
      lessonAll:have.has('lesson-all'), vocabAll:have.has('vocab-600'),
      learnText:(document.querySelector('.card.tight')||{}).innerText||'',
    });
  })()`);
  const g = JSON.parse(goals);
  check('เหรียญ "จบทุกบท" ได้จริงเมื่อเรียนครบตามแผน', g.lessonAll === true, `บทตามแผน ${g.planLessons}`);
  check('เหรียญ "ศัพท์ครบคลัง" ได้จริงเมื่อจำครบ', g.vocabAll === true, `คลัง ${g.vocab} คำ`);
  check('แถบความคืบหน้าบทเรียนเต็ม 100% ได้',
    g.learnText.includes(`${g.planLessons} จาก ${g.planLessons} บท`) && g.learnText.includes('100%'),
    g.learnText.replace(/\n/g, ' ').slice(0, 80));

  // 24. ไม่มี error ค้างอยู่
  check('ไม่มี JS error ตลอดการทดสอบ', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 200));

  ws.close(); proc.kill();
  console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
