#!/usr/bin/env node
/* ============================================================
   merge-test.js — ประกอบชิ้นส่วนชุดสอบใน .work/<testId>/ เป็นชุดสอบเต็ม
   เรียงตามลำดับ Part จริง แล้วตรวจว่าสัดส่วนตรงข้อสอบจริง

   รัน: node tools/merge-test.js test1
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* สัดส่วนข้อสอบจริง (รูปแบบตั้งแต่ปี 2016) */
const TARGET = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const TOTAL = 200;

function mergeTest(TEST_ID, opts) {
const quiet = opts && opts.quiet;
const say = (...a) => { if (!quiet) console.log(...a); };
const SRC = path.join(ROOT, '.work', TEST_ID);
const OUT = path.join(ROOT, 'data', 'tests', TEST_ID + '.json');

if (!fs.existsSync(SRC)) {
  if (!quiet) console.error(`ไม่พบโฟลเดอร์ ${SRC}`);
  return null;
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
if (!files.length) {
  if (!quiet) console.error('ไม่พบไฟล์ชิ้นส่วนใน ' + SRC);
  return null;
}

const items = [];
for (const f of files) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  } catch (e) {
    console.error(`✗ ${TEST_ID}/${f} — JSON เสีย: ${e.message}`);
    return null;
  }
  const got = obj.items || [];
  // ไฟล์ว่างคือเศษจาก agent ที่ถูกตัดกลางคัน — ข้ามไป ไม่ให้ปนเข้าชุดสอบ
  if (!got.length) {
    console.log(`  ⚠️ ${TEST_ID}/${f} ว่างเปล่า — ข้าม (เศษจากงานที่ไม่จบ)`);
    continue;
  }
  say(`  ${f.padEnd(12)} ${String(got.length).padStart(3)} รายการ`);
  items.push(...got);
}

/* เรียงตาม Part แล้วตามลำดับเดิมภายใน Part */
items.forEach((it, i) => (it.__i = i));
items.sort((a, b) => Number(a.part) - Number(b.part) || a.__i - b.__i);
items.forEach((it) => delete it.__i);

/* นับจำนวนคำถามจริงรายพาร์ต */
const count = {};
let total = 0;
for (const it of items) {
  const n = Array.isArray(it.questions) ? it.questions.length : 1;
  count[it.part] = (count[it.part] || 0) + n;
  total += n;
}

say('\n  สัดส่วนข้อ');
let mismatch = 0;
for (const p of [1, 2, 3, 4, 5, 6, 7]) {
  const got = count[p] || 0;
  const want = TARGET[p];
  const ok = got === want;
  if (!ok) mismatch++;
  say(`    Part ${p}: ${String(got).padStart(3)} / ${String(want).padStart(3)} ${ok ? '✓' : '✗'}`);
}
say(`    รวม  : ${String(total).padStart(3)} / ${TOTAL} ${total === TOTAL ? '✓' : '✗'}`);

/* id ซ้ำ */
const ids = new Set();
const dup = [];
for (const it of items) {
  if (ids.has(it.id)) dup.push(it.id);
  ids.add(it.id);
}
if (dup.length) console.log(`\n  ⚠️ ${TEST_ID}: id ซ้ำ ${dup.length} รายการ: ${dup.slice(0, 8).join(', ')}`);

const out = {
  meta: {
    testId: TEST_ID,
    title: 'ชุดสอบเสมือนจริงชุดที่ ' + TEST_ID.replace(/[^0-9]/g, ''),
    count: total,
    byPart: count,
    listeningMin: 45,
    readingMin: 75,
  },
  items,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
say(`\n✓ เขียน ${path.relative(ROOT, OUT)} · ${items.length} หน่วย · ${total} ข้อ`);

const okAll = !mismatch && total === TOTAL && !dup.length;
if (!okAll) console.log(`⚠️ ${TEST_ID}: สัดส่วนยังไม่ตรงข้อสอบจริง (${total}/${TOTAL}) — ต้องเติม/ตัดก่อนใช้`);
else say('✅ สัดส่วนตรงข้อสอบจริงทุกพาร์ต');
return { testId: TEST_ID, total, ok: okAll, units: items.length };
}

/** ประกอบชุดสอบใหม่ทุกชุดที่ชิ้นส่วนใหม่กว่าไฟล์ผลลัพธ์ (กันการ deploy ของเก่าโดยไม่รู้ตัว) */
function mergeStale(opts) {
  const workDir = path.join(ROOT, '.work');
  if (!fs.existsSync(workDir)) return [];
  const done = [];
  for (const d of fs.readdirSync(workDir).filter((x) => /^test\d+$/.test(x)).sort()) {
    const src = path.join(workDir, d);
    const out = path.join(ROOT, 'data', 'tests', d + '.json');
    const parts = fs.readdirSync(src).filter((f) => f.endsWith('.json'));
    if (!parts.length) continue;
    const newest = Math.max(...parts.map((f) => fs.statSync(path.join(src, f)).mtimeMs));
    const cur = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
    if (newest > cur) {
      const r = mergeTest(d, opts);
      if (r) done.push(r);
    }
  }
  return done;
}

module.exports = { mergeTest, mergeStale, TARGET, TOTAL };

if (require.main === module) {
  const id = process.argv[2];
  if (id) {
    const r = mergeTest(id);
    process.exitCode = r && r.ok ? 0 : 1;
  } else {
    const done = mergeStale();
    console.log(done.length ? `ประกอบใหม่ ${done.length} ชุด` : 'ทุกชุดสอบเป็นเวอร์ชันล่าสุดแล้ว');
    process.exitCode = done.every((r) => r.ok) ? 0 : 1;
  }
}
