/* ============================================================
   50-srs — ระบบทวนคำศัพท์แบบเว้นระยะ (ดัดแปลงจาก SM-2)
   ปรับให้ระยะสั้นกว่าปกติ เพราะมีเวลาเตรียมตัวแค่ 30 วัน
   ============================================================ */
'use strict';

/* ระยะทวนสูงสุดจำกัดที่ 12 วัน — เกินกว่านั้นจะไม่ทันได้ทวนก่อนสอบ */
const MAX_IV = 12;

const GRADE = {
  again: 0, // ไม่รู้เลย
  hard: 1,  // นึกออกยาก
  good: 2,  // นึกออก
  easy: 3,  // ง่ายมาก
};

function newCard() {
  return { ef: 2.4, iv: 0, due: App.today(), reps: 0, lapses: 0, last: null };
}

function get(id) {
  const s = App.Store.state();
  return s.srs[id] || null;
}

/** อัปเดตการ์ดตามผลการทวน แล้วคืนการ์ดใหม่ */
function review(id, grade) {
  const s = App.Store.state();
  const c = s.srs[id] || newCard();

  if (grade === GRADE.again) {
    c.lapses += 1;
    c.ef = Math.max(1.4, c.ef - 0.22);
    c.iv = 0;
    c.due = App.today(); // ทวนซ้ำในรอบเดียวกัน
  } else {
    const q = grade === GRADE.hard ? 3 : grade === GRADE.good ? 4 : 5;
    c.ef = App.clamp(c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), 1.4, 2.7);

    if (c.reps === 0 || c.iv === 0) c.iv = grade === GRADE.easy ? 2 : 1;
    else if (c.iv === 1) c.iv = grade === GRADE.hard ? 1 : grade === GRADE.easy ? 4 : 2;
    else c.iv = Math.round(c.iv * (grade === GRADE.hard ? 1.25 : c.ef) * (grade === GRADE.easy ? 1.25 : 1));

    c.iv = App.clamp(c.iv, 1, MAX_IV);
    c.due = App.addDays(App.today(), c.iv);
    c.reps += 1;
  }

  c.last = Date.now();
  s.srs[id] = c;
  App.Store.save();
  return c;
}

/**
 * เลือกการ์ดสำหรับทวนวันนี้
 * ลำดับ: ครบกำหนดทวน (เก่าสุดก่อน) → คำใหม่ (เรียงตามความถี่ที่ออกสอบ)
 */
function due(allWords, limitNew, limitTotal) {
  const s = App.Store.state();
  const t = App.today();
  const dueList = [];
  const fresh = [];

  for (const w of allWords) {
    const c = s.srs[w.id];
    if (!c) fresh.push(w);
    else if (c.due <= t) dueList.push(w);
  }

  dueList.sort((a, b) => {
    const ca = s.srs[a.id], cb = s.srs[b.id];
    if (ca.due !== cb.due) return ca.due < cb.due ? -1 : 1;
    return (cb.lapses || 0) - (ca.lapses || 0);
  });

  fresh.sort((a, b) => (b.freq || 3) - (a.freq || 3) || String(a.id).localeCompare(String(b.id)));

  const nNew = Math.max(0, limitNew == null ? 20 : limitNew);
  const out = dueList.concat(fresh.slice(0, nNew));
  return limitTotal ? out.slice(0, limitTotal) : out;
}

function stats(allWords) {
  const s = App.Store.state();
  const t = App.today();
  let learning = 0, young = 0, mature = 0, dueNow = 0, untouched = 0;
  for (const w of allWords) {
    const c = s.srs[w.id];
    if (!c) { untouched++; continue; }
    if (c.due <= t) dueNow++;
    if (c.iv >= 7) mature++;
    else if (c.iv >= 2) young++;
    else learning++;
  }
  return { total: allWords.length, learning, young, mature, dueNow, untouched, started: allWords.length - untouched };
}

/** ตัวเลือกลวงสำหรับโหมด "เลือกความหมาย" */
function distractors(word, allWords, n) {
  const same = allWords.filter((w) => w.id !== word.id && w.pos === word.pos);
  const pool = (same.length >= n ? same : allWords.filter((w) => w.id !== word.id));
  return App.pick(pool, n || 3);
}

Object.assign(App, {
  SRS: { GRADE, newCard, get, review, due, stats, distractors, MAX_IV },
});
