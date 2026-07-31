#!/usr/bin/env node
/* ============================================================
   exam-run.js — รันข้อสอบเต็มชุด 200 ข้อจริงตั้งแต่ต้นจนจบ
   ตรวจว่า: เดินครบทุกหน้า, สลับจากฟังไปอ่านได้, ส่งคำตอบแล้วคิดคะแนนถูก,
   บันทึกผลลง localStorage, และหน้าผลสอบแสดงครบ

   รัน: node tools/exam-run.js [baseUrl] [testId]
   ============================================================ */
'use strict';

const { launch } = require('./cdp');

const BASE = process.argv[2] || 'http://localhost:8080/';
const TEST_ID = process.argv[3] || 'test1';

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const b = await launch();
  if (!b) { console.log('ไม่พบ chromium — ข้าม'); process.exit(0); }
  await b.setMobile(390, 844);
  await b.goto(BASE);

  console.log(`\n▶ รันข้อสอบเต็มชุด ${TEST_ID}\n`);

  const has = await b.evalJS(`JSON.stringify(App.Data.testList())`);
  if (!JSON.parse(has).includes(TEST_ID)) {
    console.log(`  ⏭  ยังไม่มีชุดสอบ ${TEST_ID} — ข้าม`);
    b.close();
    process.exit(0);
  }

  /* ---- เริ่มสอบ: ปิดเสียงทิ้งเพื่อให้รันเร็ว แต่ยังเดินตามโฟลว์จริงทุกขั้น ---- */
  const meta = await b.evalJS(`(async()=>{
    localStorage.removeItem('toeic750.state');
    location.reload();
    return 1;
  })()`);
  await b.sleep(1800);

  await b.evalJS(`(()=>{
    // ทำให้เสียงจบทันที (ไม่งั้นต้องรอ TTS จริงหลายสิบนาที) — ส่วนอื่นเดินตามโฟลว์จริงทั้งหมด
    App.TTS.speakSeq = () => Promise.resolve(true);
    App.TTS.say = () => Promise.resolve(true);
    window.__sections = [];
    window.__finished = null;
    return 1;
  })()`);

  const t = await b.evalJS(`App.Data.loadTest('${TEST_ID}').then(t=>JSON.stringify({
    units:t.units.length,
    listen:t.units.filter(u=>u.part<=4).length,
    read:t.units.filter(u=>u.part>=5).length,
    q:t.units.reduce((a,u)=>a+u.n,0),
    byPart:t.units.reduce((o,u)=>{o[u.part]=(o[u.part]||0)+u.n;return o;},{})
  }))`);
  const T = JSON.parse(t);
  check('ชุดสอบมี 200 ข้อ', T.q === 200, `${T.q} ข้อ`);
  check('สัดส่วนรายพาร์ตตรงข้อสอบจริง',
    JSON.stringify(T.byPart) === JSON.stringify({ 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 }),
    JSON.stringify(T.byPart));

  /* ---- เดินตามปุ่มจริงในหน้าจอ ---- */
  await b.evalJS(`location.hash='/exam'`);
  await b.sleep(700);
  await b.evalJS(`(()=>{const bs=[...document.querySelectorAll('button')].filter(x=>/เริ่มสอบ|ทำอีกครั้ง/.test(x.innerText));
    if(bs.length) bs[0].click(); return bs.length;})()`);
  await b.sleep(400);
  await b.evalJS(`(()=>{const b=[...document.querySelectorAll('.modal button')].find(x=>/เริ่มเลย/.test(x.innerText));
    if(b) b.click(); return !!b;})()`);
  await b.sleep(1200);

  const started = await b.evalJS(`JSON.stringify({hash:location.hash,
    sub:(document.querySelector('.topbar .sub')||{}).innerText||'',
    timer:!!document.querySelector('.timerbar')})`);
  const S1 = JSON.parse(started);
  check('เข้าโหมดสอบและตัวจับเวลาขึ้น', S1.hash === '#/quiz' && S1.timer, started);
  check('เริ่มที่ส่วนการฟัง', /การฟัง|Listening/.test(S1.sub), S1.sub);

  /* ---- ตอบทุกข้อจนจบทั้งสองส่วน ---- */
  let screens = 0;
  let answered = 0;
  let sectionBreak = false;
  const t0 = Date.now();

  for (let i = 0; i < 400; i++) {
    const step = await b.evalJS(`(()=>{
      if(location.hash==='#/examresult') return JSON.stringify({done:true});
      // กล่องสลับส่วน
      const mb=[...document.querySelectorAll('.modal button')].find(x=>/ส่วนการอ่าน/.test(x.innerText));
      if(mb){mb.click();return JSON.stringify({sectionBreak:true});}
      const sb=[...document.querySelectorAll('.modal button')].find(x=>/ส่งเลย|ส่งคำตอบ/.test(x.innerText));
      if(sb){sb.click();return JSON.stringify({submitted:true});}
      // ตอบทุกคำถามในหน้านี้
      let n=0;
      document.querySelectorAll('.choices').forEach(g=>{
        const cs=g.querySelectorAll('.choice');
        if(cs.length && !g.querySelector('.choice.sel')){ cs[Math.floor(Math.random()*cs.length)].click(); n++; }
      });
      const next=[...document.querySelectorAll('button')].find(x=>/ถัดไป →/.test(x.innerText));
      const submit=[...document.querySelectorAll('button')].find(x=>/^ส่งคำตอบ$/.test(x.innerText.trim()));
      if(next){next.click();return JSON.stringify({answered:n,advanced:true});}
      if(submit){submit.click();return JSON.stringify({answered:n,submit:true});}
      return JSON.stringify({answered:n,stuck:true});
    })()`);
    const st = JSON.parse(step);
    if (st.done) break;
    if (st.sectionBreak) { sectionBreak = true; await b.sleep(900); continue; }
    if (st.submitted) { await b.sleep(1200); continue; }
    answered += st.answered || 0;
    if (st.advanced || st.submit) screens++;
    if (st.stuck) { await b.sleep(400); }
    await b.sleep(90);
  }

  check('มีกล่องแจ้งสลับไปส่วนการอ่าน', sectionBreak);
  check('เดินครบทุกหน้าจอของชุดสอบ', screens >= T.units - 2, `เดินไป ${screens} หน้า จาก ${T.units} ชุด`);
  check('ตอบครบ 200 ข้อ', answered === 200, `ตอบไป ${answered} ข้อ`);
  check('เข้าหน้าผลสอบ', await b.evalJS(`location.hash==='#/examresult'`));

  /* ---- ตรวจผลลัพธ์ ---- */
  const res = await b.evalJS(`(()=>{
    const s=App.Store.state();
    const e=s.exams[s.exams.length-1];
    const txt=document.getElementById('app').innerText;
    return JSON.stringify({
      exams:s.exams.length,
      scaled:e&&e.scaled, raw:e&&e.raw, byPart:e&&e.byPart,
      attempts:s.attempts.length,
      answered:App.Store.totalAnswered(s),
      xp:s.progress.xp,
      showsScore:/คะแนนประมาณการ/.test(txt),
      showsParts:/ทำได้แค่ไหนในแต่ละส่วน/.test(txt),
      showsAdvice:/ควรทุ่มเวลาให้ส่วนไหนต่อ/.test(txt),
      bars:document.querySelectorAll('.hbar .r').length,
    });
  })()`);
  const R = JSON.parse(res);

  check('บันทึกผลสอบลงเครื่อง', R.exams === 1 && R.attempts >= 1, `exams=${R.exams} attempts=${R.attempts}`);
  check('นับข้อที่ทำครบ 200', R.answered === 200, 'answered=' + R.answered);
  check('คะแนนอยู่ในช่วงที่เป็นไปได้',
    R.scaled && R.scaled.total >= 10 && R.scaled.total <= 990 && R.scaled.L + R.scaled.R === R.scaled.total,
    JSON.stringify(R.scaled));
  check('แยกคะแนนฟัง/อ่านคนละ 5-495',
    R.scaled && R.scaled.L >= 5 && R.scaled.L <= 495 && R.scaled.R >= 5 && R.scaled.R <= 495,
    JSON.stringify(R.scaled));
  check('เก็บคะแนนดิบครบทั้งสองฝั่ง',
    R.raw && R.raw.nL === 100 && R.raw.nR === 100, JSON.stringify(R.raw));
  check('สรุปผลรายพาร์ตครบ 7 ส่วน', R.byPart && Object.keys(R.byPart).length === 7, JSON.stringify(R.byPart));
  check('หน้าผลสอบแสดงคะแนน รายส่วน และคำแนะนำ',
    R.showsScore && R.showsParts && R.showsAdvice && R.bars >= 7,
    `score=${R.showsScore} parts=${R.showsParts} advice=${R.showsAdvice} bars=${R.bars}`);
  check('ได้ XP จากการสอบ', R.xp > 0, 'xp=' + R.xp);

  /* ---- ดูเฉลยข้อที่ผิดต่อได้ ---- */
  await b.evalJS(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/ดูเฉลยข้อที่ผิด/.test(x.innerText));
    if(b) b.click(); return !!b;})()`);
  await b.sleep(900);
  const rev = await b.evalJS(`JSON.stringify({hash:location.hash,
    choices:document.querySelectorAll('.choices .choice').length,
    hasStem:!!document.querySelector('.qstem')})`);
  const RV = JSON.parse(rev);
  check('กดดูเฉลยข้อที่ผิดแล้วเข้าโหมดฝึกได้', RV.hash === '#/quiz' && RV.choices > 0, rev);

  console.log(`\nใช้เวลารัน ${Math.round((Date.now() - t0) / 1000)} วินาที`);
  console.log('errors:', JSON.stringify(b.errors).slice(0, 300));
  if (b.errors.length) fail++;
  console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
  b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
