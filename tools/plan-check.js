#!/usr/bin/env node
/* ============================================================
   plan-check.js — ตรวจว่าแผน 30 วันมีเนื้อหารองรับครบไหม
   บอกว่าวันไหนทำได้เต็ม วันไหนขาดอะไร
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = (k) => path.join(ROOT, 'data', k);

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const list = (k) => (fs.existsSync(D(k)) ? fs.readdirSync(D(k)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : []);

const plan = readJSON(path.join(D('static'), 'plan30.json'));
if (!plan) { console.error('ไม่พบ plan30.json'); process.exit(1); }

/* คลังข้อ: part -> tier -> topic -> จำนวน */
const bank = {};
let vocabN = 0;
for (const n of list('drills')) {
  const f = readJSON(path.join(D('drills'), n + '.json'));
  for (const it of (f && f.items) || []) {
    const p = it.part, t = it.tier || 'medium', tp = it.topic || '-';
    const n2 = Array.isArray(it.questions) ? it.questions.length : 1;
    bank[p] = bank[p] || {};
    bank[p][t] = bank[p][t] || { total: 0, topics: {} };
    bank[p][t].total += n2;
    bank[p][t].topics[tp] = (bank[p][t].topics[tp] || 0) + n2;
  }
}
for (const n of list('vocab')) {
  const f = readJSON(path.join(D('vocab'), n + '.json'));
  vocabN += ((f && f.items) || []).length;
}
const lessons = new Set(list('lessons'));
const tests = new Set(list('tests'));
const statics = new Set(list('static'));

const have = (t) => {
  switch (t.type) {
    case 'lesson': return lessons.has(t.id) ? null : `ไม่มีบทเรียน ${t.id}`;
    case 'exam': return tests.has(t.testId) ? null : `ไม่มีชุดสอบ ${t.testId}`;
    case 'placement': return tests.has('placement') ? null : 'ไม่มีข้อสอบจัดระดับ';
    case 'cheatsheet': return statics.has('cheatsheet') ? null : 'ไม่มีสรุปไวยากรณ์';
    case 'examinfo': return statics.has('examinfo') ? null : 'ไม่มีข้อมูลการสอบ';
    case 'vocab': return vocabN >= 1 ? (vocabN < 600 ? null : null) : 'ไม่มีคลังคำศัพท์';
    case 'review': case 'weakspot': return null;
    case 'drill': case 'checkpoint': {
      const p = bank[t.part];
      if (!p) return `ไม่มีข้อ ${'Part ' + t.part}`;
      if (t.tier && !p[t.tier]) return `ไม่มีข้อ Part ${t.part} ระดับ ${t.tier}`;
      const poolTotal = t.tier ? p[t.tier].total : Object.values(p).reduce((a, x) => a + x.total, 0);
      if (t.topic) {
        const pool = t.tier ? p[t.tier] : Object.values(p).reduce((a, x) => { for (const k in x.topics) a[k] = (a[k] || 0) + x.topics[k]; return a; }, {});
        const topics = t.tier ? pool.topics : pool;
        if (!topics[t.topic]) return `ไม่มีข้อหัวข้อ "${t.topic}" (Part ${t.part}${t.tier ? '/' + t.tier : ''})`;
        // selectDrill เติมจากหัวข้ออื่นใน part/tier เดียวกันจนครบโดส จึงติดเฉพาะตอนคลังรวมไม่พอ
        if (poolTotal < t.n) return `Part ${t.part}${t.tier ? '/' + t.tier : ''} มีรวม ${poolTotal} ข้อ (แผนขอ ${t.n})`;
        if (topics[t.topic] < Math.ceil(t.n / 2)) return `หัวข้อ "${t.topic}" มีแค่ ${topics[t.topic]} ข้อ จาก ${t.n} ที่แผนขอ (ที่เหลือเติมจากหัวข้ออื่น)`;
      } else if (t.tier && p[t.tier].total < t.n) {
        return `Part ${t.part}/${t.tier} มีแค่ ${p[t.tier].total} ข้อ (แผนขอ ${t.n})`;
      }
      return null;
    }
    default: return null;
  }
};

let full = 0, partial = 0, blocked = 0;
const gaps = {};
console.log('\n📅 ความพร้อมของแผน 30 วัน\n');
for (const d of plan.days) {
  const miss = (d.tasks || []).map(have).filter(Boolean);
  const total = (d.tasks || []).length;
  const icon = !miss.length ? '✅' : miss.length === total ? '⛔' : '⚠️';
  if (!miss.length) full++; else if (miss.length === total) blocked++; else partial++;
  const label = `วันที่ ${String(d.d).padStart(2)} ${icon} ${d.title}`;
  if (miss.length) {
    console.log(label);
    miss.forEach((m) => { console.log('        ↳ ' + m); gaps[m] = (gaps[m] || 0) + 1; });
  } else {
    console.log(label);
  }
}

console.log(`\nสรุป: ทำได้เต็ม ${full} วัน · ทำได้บางส่วน ${partial} วัน · ยังทำไม่ได้ ${blocked} วัน`);
console.log(`คลังตอนนี้: คำศัพท์ ${vocabN} คำ · บทเรียน ${lessons.size} บท · ชุดสอบเต็ม ${[...tests].filter((t) => t !== 'placement').length} ชุด`);
console.log('\nสิ่งที่ต้องเติม (เรียงตามจำนวนวันที่ติด):');
Object.entries(gaps).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(2)} วัน — ${k}`));
