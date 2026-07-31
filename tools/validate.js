#!/usr/bin/env node
/* ============================================================
   validate.js — ตรวจไฟล์เนื้อหาทั้งหมดว่าตรงสคีมาและใช้งานได้จริง
   รัน: node tools/validate.js  [--fix-ids]
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const KINDS = ['drills', 'tests', 'lessons', 'vocab', 'static'];
const CHOICE_N = { 1: 4, 2: 3, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 };

let errors = [];
let warns = [];
const seenIds = new Map();
const seenWords = new Map();   // คำศัพท์ -> ไฟล์:id (ตรวจซ้ำข้ามไฟล์)
const seenIPA = new Map();

const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warns.push(`${file}: ${msg}`);

function main() {
  const summary = {};

  for (const kind of KINDS) {
    const dir = path.join(DATA, kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const file = `${kind}/${f}`;
      let obj;
      try {
        obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (e) {
        err(file, 'JSON เสีย — ' + e.message);
        continue;
      }
      const s = checkFile(file, kind, obj);
      summary[file] = s;
    }
  }

  console.log('\n📋 สรุปไฟล์เนื้อหา\n');
  let totalQ = 0;
  for (const f in summary) {
    const s = summary[f];
    totalQ += s.q || 0;
    console.log(`  ${f.padEnd(28)} ${String(s.q || s.n || 0).padStart(5)} ${s.label}`);
  }
  console.log(`  ${''.padEnd(28)} ${String(totalQ).padStart(5)} ข้อรวมทั้งหมด`);

  if (warns.length) {
    console.log(`\n⚠️  คำเตือน ${warns.length} รายการ`);
    warns.slice(0, 60).forEach((w) => console.log('   • ' + w));
    if (warns.length > 60) console.log(`   … อีก ${warns.length - 60} รายการ`);
  }

  if (errors.length) {
    console.log(`\n❌ พบข้อผิดพลาด ${errors.length} รายการ`);
    errors.slice(0, 80).forEach((e) => console.log('   • ' + e));
    if (errors.length > 80) console.log(`   … อีก ${errors.length - 80} รายการ`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ ผ่านทั้งหมด');
  }
}

function checkFile(file, kind, obj) {
  if (kind === 'vocab') return checkVocab(file, obj);
  if (kind === 'static') return { n: (obj.sections || []).length, label: 'หัวข้อ' };
  if (kind === 'lessons') return checkLesson(file, obj);

  const items = obj.items || [];
  if (!Array.isArray(items) || !items.length) {
    err(file, 'ไม่มี items');
    return { q: 0, label: 'ข้อ' };
  }
  let q = 0;
  const answerDist = {};
  const byPart = {};
  for (const it of items) {
    const n = checkItem(file, it, answerDist);
    q += n;
    byPart[it.part] = (byPart[it.part] || 0) + n;
  }
  checkDistribution(file, answerDist, q);

  // ชุดสอบเต็มต้องมีสัดส่วนตรงข้อสอบจริง
  if (/^tests\/test\d+\.json$/.test(file)) {
    const TARGET = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
    for (const p of Object.keys(TARGET)) {
      const got = byPart[p] || 0;
      if (got !== TARGET[p]) err(file, `Part ${p} มี ${got} ข้อ แต่ข้อสอบจริงมี ${TARGET[p]} ข้อ`);
    }
    if (q !== 200) err(file, `ชุดสอบเต็มต้องมี 200 ข้อ แต่มี ${q} ข้อ`);
  }

  return { q, label: 'ข้อ' };
}

function checkLesson(file, L) {
  if (!L.id) err(file, 'ไม่มี id');
  if (!L.day) warn(file, 'ไม่มี day');
  if (!Array.isArray(L.blocks) || L.blocks.length < 4) warn(file, `blocks น้อยเกินไป (${(L.blocks || []).length})`);
  for (const b of L.blocks || []) {
    if (!b.type) err(file, 'block ไม่มี type');
    if (b.type === 'table' && (!Array.isArray(b.rows) || !b.rows.length)) err(file, 'table ไม่มี rows');
    if (b.type === 'example' && !b.en) err(file, 'example ไม่มี en');
    if (b.type === 'table' && b.head && b.rows) {
      const w = b.head.length;
      b.rows.forEach((r, i) => { if (r.length !== w) warn(file, `table แถวที่ ${i + 1} มี ${r.length} ช่อง แต่หัวตารางมี ${w}`); });
    }
  }
  let q = 0;
  const dist = {};
  for (const it of L.quiz || []) q += checkItem(file, it, dist);
  if (q < 5) warn(file, `แบบฝึกท้ายบทมีแค่ ${q} ข้อ (ควร ≥ 5)`);
  return { q, label: `ข้อท้ายบท · ${(L.blocks || []).length} บล็อก` };
}

function checkVocab(file, obj) {
  const items = obj.items || [];
  if (!items.length) err(file, 'ไม่มี items');
  const words = new Set();
  for (const w of items) {
    const id = w.id || '(ไม่มี id)';
    if (!w.id) err(file, 'คำศัพท์ไม่มี id');
    else dupCheck(file, w.id);
    for (const k of ['w', 'th', 'mean', 'pos', 'ex', 'exTh']) {
      if (!w[k]) err(file, `${id} ขาด field "${k}"`);
    }
    if (!w.ipa) warn(file, `${id} (${w.w}) ไม่มี IPA`);
    if (w.w) {
      const lw = String(w.w).toLowerCase().trim();
      if (words.has(lw)) err(file, `คำซ้ำในไฟล์: ${w.w}`);
      words.add(lw);
      // ซ้ำข้ามไฟล์ — ผู้เรียนจะได้คำใหม่น้อยกว่าที่คลังอ้าง
      if (seenWords.has(lw)) err(file, `${id} คำ "${w.w}" ซ้ำกับ ${seenWords.get(lw)}`);
      else seenWords.set(lw, `${file}:${id}`);
    }
    // คำอ่านไทยต้องมีจำนวนพยางค์เท่า IPA (ไม่งั้นผู้เรียนจำการออกเสียงผิด)
    if (w.ipa && w.th) {
      const thSyl = String(w.th).replace(/\*\*/g, '').split('-').filter(Boolean).length;
      const ipaSyl = countIPASyllables(w.ipa);
      // เตือนเฉพาะที่ต่างกันชัดเจน — การถอดเสียงไทยยุบพยางค์ได้บ้างตามธรรมชาติ
      if (ipaSyl && Math.abs(thSyl - ipaSyl) >= 2) {
        warn(file, `${id} (${w.w}) คำอ่านไทย ${thSyl} พยางค์ แต่ IPA ${w.ipa} มี ${ipaSyl} พยางค์`);
      }
    }
    if (w.ipa && !/^\/.*\/$/.test(String(w.ipa).trim())) {
      warn(file, `${id} (${w.w}) IPA ควรอยู่ในเครื่องหมาย / / — ได้ "${w.ipa}"`);
    }
    // ตัวอย่างต้องมีคำนั้นอยู่ — เทียบด้วยรากคำเพื่อรองรับการผัน (copy -> copies, arrive -> arrived)
    if (w.ex && w.w) {
      // กริยาวลี (sign up) เทียบเฉพาะคำแรก เพราะประโยคจริงมักผัน (signed up)
      const head = String(w.w).toLowerCase().split(/\s+/)[0];
      const stem = head.replace(/(y|e)$/, '');
      const need = stem.length >= 3 ? stem : String(w.w).toLowerCase();
      if (!String(w.ex).toLowerCase().includes(need)) {
        warn(file, `${id} (${w.w}) ประโยคตัวอย่างอาจไม่มีคำนี้อยู่`);
      }
    }
    if (w.th && !/[฀-๿]/.test(w.th)) err(file, `${id} คำอ่านไทยไม่ใช่ภาษาไทย: ${w.th}`);
    if (w.mean && !/[฀-๿]/.test(w.mean)) err(file, `${id} ความหมายไม่ใช่ภาษาไทย`);
  }
  return { n: items.length, q: 0, label: 'คำศัพท์' };
}

/**
 * นับพยางค์จาก IPA: นับกลุ่มสระ แล้วบวกพยัญชนะที่ทำหน้าที่เป็นพยางค์
 * (syllabic consonant เช่น /ˈɔːfn/ often = ออฟ-เฟิ่น 2 พยางค์ ไม่ใช่ 1)
 */
function countIPASyllables(ipa) {
  const s = String(ipa).replace(/[\/\[\]ˈˌ.]/g, '');
  const VOWEL = 'ɪɛæʌʊəɒaeiouɜɑɔ';
  const m = s.match(/(?:eɪ|aɪ|ɔɪ|aʊ|oʊ|ɪə|eə|ʊə|iː|uː|ɑː|ɔː|ɜː|[ɪɛæʌʊəɒaeiouɜɑɔ])/g);
  let n = m ? m.length : 0;
  // พยัญชนะ + n/l/m ที่ไม่มีสระคั่น = อีกหนึ่งพยางค์
  const syllabic = s.match(new RegExp('[^' + VOWEL + 'ː]([nlm])(?![' + VOWEL + '])', 'g'));
  if (syllabic) n += syllabic.length;
  return n;
}

function dupCheck(file, id) {
  if (seenIds.has(id)) err(file, `id ซ้ำกับ ${seenIds.get(id)}: ${id}`);
  else seenIds.set(id, file);
}

function checkItem(file, it, dist) {
  if (!it || typeof it !== 'object') { err(file, 'item ไม่ใช่ object'); return 0; }
  const id = it.id || '(ไม่มี id)';
  if (!it.id) err(file, 'item ไม่มี id');
  else dupCheck(file, it.id);

  const part = Number(it.part);
  if (!part || part < 1 || part > 7) { err(file, `${id} part ไม่ถูกต้อง: ${it.part}`); return 0; }
  if (it.tier && !['easy', 'medium', 'real'].includes(it.tier)) err(file, `${id} tier ไม่ถูกต้อง: ${it.tier}`);

  const isGroup = Array.isArray(it.questions);

  if (part === 1) {
    if (!it.svg) err(file, `${id} Part 1 ไม่มี svg`);
    else checkSVG(file, id, it.svg);
    if (!it.sceneTh) warn(file, `${id} Part 1 ไม่มี sceneTh`);
  }
  if (part === 2 && !it.prompt) err(file, `${id} Part 2 ไม่มี prompt`);
  if (part === 5 && !it.stem) err(file, `${id} Part 5 ไม่มี stem`);
  if (part === 5 && it.stem && !/_{3,}/.test(it.stem)) warn(file, `${id} Part 5 ไม่มีช่องว่าง _____ ในโจทย์`);
  if ((part === 3 || part === 4) && !(it.audio && Array.isArray(it.audio.lines) && it.audio.lines.length)) {
    err(file, `${id} Part ${part} ไม่มี audio.lines`);
  }
  if (part === 6 && !it.passage) err(file, `${id} Part 6 ไม่มี passage`);
  if (part === 6 && it.passage) {
    for (let b = 1; b <= 4; b++) if (!it.passage.includes(`[[${b}]]`)) warn(file, `${id} Part 6 บทความไม่มีมาร์ก [[${b}]]`);
  }
  if (part === 7 && !(Array.isArray(it.passages) && it.passages.length)) err(file, `${id} Part 7 ไม่มี passages`);

  if (isGroup) {
    if (!it.questions.length) err(file, `${id} questions ว่าง`);
    if ((part === 3 || part === 4) && it.questions.length !== 3) warn(file, `${id} Part ${part} ควรมี 3 คำถาม (มี ${it.questions.length})`);
    if (part === 6 && it.questions.length !== 4) warn(file, `${id} Part 6 ควรมี 4 คำถาม (มี ${it.questions.length})`);
    let n = 0;
    it.questions.forEach((q, i) => { n += checkQ(file, `${id}#${i + 1}`, q, part, dist) ? 1 : 0; });
    return n;
  }
  return checkQ(file, id, it, part, dist) ? 1 : 0;
}

function checkQ(file, id, q, part, dist) {
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length < 2) { err(file, `${id} ไม่มี choices`); return false; }
  const want = CHOICE_N[part];
  if (want && ch.length !== want) err(file, `${id} ควรมี ${want} ตัวเลือก แต่มี ${ch.length}`);
  if (new Set(ch.map((x) => String(x).trim().toLowerCase())).size !== ch.length) err(file, `${id} มีตัวเลือกซ้ำกัน`);

  const a = q.answer;
  if (typeof a !== 'number' || a < 0 || a >= ch.length) { err(file, `${id} answer ไม่ถูกต้อง: ${a}`); return false; }
  dist[a] = (dist[a] || 0) + 1;

  const e = q.explain || {};
  if (!e.why) err(file, `${id} ไม่มี explain.why`);
  if (!e.point) warn(file, `${id} ไม่มี explain.point`);
  if (!e.trick) warn(file, `${id} ไม่มี explain.trick`);
  const w = e.wrong || {};
  for (let i = 0; i < ch.length; i++) {
    if (i === a) continue;
    if (!w[String(i)]) err(file, `${id} ขาดคำอธิบาย explain.wrong["${i}"]`);
  }
  for (const k in w) {
    if (Number(k) === a) err(file, `${id} explain.wrong มี key ของคำตอบที่ถูก (${k})`);
    if (Number(k) >= ch.length) err(file, `${id} explain.wrong key เกินจำนวนตัวเลือก (${k})`);
  }

  const th = q.th || {};
  if (th.choices && th.choices.length !== ch.length) err(file, `${id} th.choices จำนวนไม่ตรงกับ choices`);
  const thaiRe = /[฀-๿]/;
  if (e.why && !thaiRe.test(e.why)) err(file, `${id} explain.why ไม่ใช่ภาษาไทย`);
  for (const k in w) if (!thaiRe.test(w[k])) err(file, `${id} explain.wrong[${k}] ไม่ใช่ภาษาไทย`);

  // ตัวเลือกภาษาอังกฤษต้องเป็นอังกฤษ
  ch.forEach((c, i) => { if (thaiRe.test(String(c))) err(file, `${id} ตัวเลือก ${i} เป็นภาษาไทย (ต้องเป็นอังกฤษ)`); });

  return true;
}

function checkSVG(file, id, svg) {
  const s = String(svg);
  if (!/^<svg[\s>]/i.test(s.trim())) err(file, `${id} svg ไม่ได้ขึ้นต้นด้วย <svg`);
  if (!/viewBox\s*=/.test(s)) err(file, `${id} svg ไม่มี viewBox`);
  for (const bad of ['<script', '<image', '<foreignObject', '<use', 'href=', 'onload', 'onclick']) {
    if (s.toLowerCase().includes(bad.toLowerCase())) err(file, `${id} svg มี "${bad}" ซึ่งไม่อนุญาต`);
  }
  if (s.includes('<text')) warn(file, `${id} svg มี <text> — อาจเฉลยคำตอบในภาพ`);
  const open = (s.match(/<[a-zA-Z]/g) || []).length;
  const close = (s.match(/<\/[a-zA-Z]/g) || []).length + (s.match(/\/>/g) || []).length;
  if (open !== close) warn(file, `${id} svg แท็กเปิด/ปิดไม่สมดุล (${open}/${close})`);
  if (s.length < 200) warn(file, `${id} svg สั้นมาก (${s.length} ตัวอักษร) อาจวาดไม่เป็นรูป`);
}

function checkDistribution(file, dist, total) {
  if (total < 20) return;
  const keys = Object.keys(dist);
  const maxK = keys.reduce((a, b) => (dist[a] > dist[b] ? a : b), keys[0]);
  const share = dist[maxK] / total;
  if (share > 0.42) warn(file, `ตำแหน่งคำตอบเบ้: ข้อ ${'ABCD'[maxK]} เป็นคำตอบ ${Math.round(share * 100)}% ของไฟล์`);
}

main();
