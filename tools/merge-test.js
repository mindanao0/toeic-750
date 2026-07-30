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
const TEST_ID = process.argv[2] || 'test1';
const SRC = path.join(ROOT, '.work', TEST_ID);
const OUT = path.join(ROOT, 'data', 'tests', TEST_ID + '.json');

/* สัดส่วนข้อสอบจริง (รูปแบบตั้งแต่ปี 2016) */
const TARGET = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const TOTAL = 200;

if (!fs.existsSync(SRC)) {
  console.error(`ไม่พบโฟลเดอร์ ${SRC}`);
  process.exit(1);
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
if (!files.length) {
  console.error('ไม่พบไฟล์ชิ้นส่วนใน ' + SRC);
  process.exit(1);
}

const items = [];
for (const f of files) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  } catch (e) {
    console.error(`✗ ${f} — JSON เสีย: ${e.message}`);
    process.exit(1);
  }
  const got = obj.items || [];
  console.log(`  ${f.padEnd(12)} ${String(got.length).padStart(3)} รายการ`);
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

console.log('\n  สัดส่วนข้อ');
let mismatch = 0;
for (const p of [1, 2, 3, 4, 5, 6, 7]) {
  const got = count[p] || 0;
  const want = TARGET[p];
  const ok = got === want;
  if (!ok) mismatch++;
  console.log(`    Part ${p}: ${String(got).padStart(3)} / ${String(want).padStart(3)} ${ok ? '✓' : '✗'}`);
}
console.log(`    รวม  : ${String(total).padStart(3)} / ${TOTAL} ${total === TOTAL ? '✓' : '✗'}`);

/* id ซ้ำ */
const ids = new Set();
const dup = [];
for (const it of items) {
  if (ids.has(it.id)) dup.push(it.id);
  ids.add(it.id);
}
if (dup.length) console.log(`\n  ⚠️ id ซ้ำ ${dup.length} รายการ: ${dup.slice(0, 8).join(', ')}`);

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
console.log(`\n✓ เขียน ${path.relative(ROOT, OUT)} · ${items.length} หน่วย · ${total} ข้อ`);

if (mismatch || total !== TOTAL || dup.length) {
  console.log('\n⚠️ สัดส่วนยังไม่ตรงข้อสอบจริง — ต้องเติม/ตัดก่อนใช้เป็นชุดสอบเสมือน');
  process.exitCode = 1;
} else {
  console.log('✅ สัดส่วนตรงข้อสอบจริงทุกพาร์ต');
}
