/* ============================================================
   20-score — แปลงคะแนนดิบเป็นคะแนน TOEIC (ประมาณการ)

   TOEIC จริงใช้ตารางแปลงที่ต่างกันเล็กน้อยในแต่ละครั้งสอบ
   ตัวเลขที่ได้จากที่นี่จึงเป็น "ประมาณการ" คลาดเคลื่อนได้ราว ±25 คะแนน
   จุดยึด (anchor) ด้านล่างอิงจากช่วงคะแนนที่ ETS เผยแพร่ในชุดฝึกอย่างเป็นทางการ
   ============================================================ */
'use strict';

/* raw (0–100) -> scaled (5–495) : จุดยึดแล้ว interpolate เชิงเส้น */
const ANCHOR_L = [
  [0, 5], [5, 5], [10, 25], [15, 50], [20, 75], [25, 100], [30, 125],
  [35, 150], [40, 185], [45, 210], [50, 235], [55, 260], [60, 285],
  [65, 310], [70, 335], [75, 360], [80, 385], [85, 410], [90, 435],
  [95, 460], [98, 480], [100, 495],
];

const ANCHOR_R = [
  [0, 5], [5, 5], [10, 30], [15, 55], [20, 75], [25, 100], [30, 125],
  [35, 150], [40, 175], [45, 200], [50, 230], [55, 255], [60, 285],
  [65, 310], [70, 340], [75, 365], [80, 395], [85, 420], [90, 445],
  [95, 470], [98, 485], [100, 495],
];

function interp(anchors, raw) {
  const x = App.clamp(raw, 0, 100);
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return Math.round((y0 + t * (y1 - y0)) / 5) * 5;
    }
  }
  return 495;
}

const scaleL = (raw) => App.clamp(interp(ANCHOR_L, raw), 5, 495);
const scaleR = (raw) => App.clamp(interp(ANCHOR_R, raw), 5, 495);

/** rawL, rawR = จำนวนข้อถูกจาก 100 ข้อ */
function scaledFromRaw(rawL, rawR) {
  const L = scaleL(rawL);
  const R = scaleR(rawR);
  return { L, R, total: L + R };
}

/* จำนวนข้อจริงในแต่ละ Part */
const PART_N = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const LISTEN_PARTS = [1, 2, 3, 4];
const READ_PARTS = [5, 6, 7];

const PART_NAME = {
  1: 'Part 1 · รูปภาพ',
  2: 'Part 2 · ถาม-ตอบ',
  3: 'Part 3 · บทสนทนา',
  4: 'Part 4 · บทพูด',
  5: 'Part 5 · เติมคำในประโยค',
  6: 'Part 6 · เติมคำในบทความ',
  7: 'Part 7 · อ่านจับใจความ',
};

const PART_SHORT = {
  1: 'P1 รูปภาพ', 2: 'P2 ถาม-ตอบ', 3: 'P3 สนทนา', 4: 'P4 บทพูด',
  5: 'P5 เติมคำ', 6: 'P6 บทความ', 7: 'P7 อ่าน',
};

/**
 * ประมาณคะแนนจากผลการฝึกที่ผ่านมา
 * ใช้ % ความแม่นยำล่าสุดของแต่ละ Part ถ่วงน้ำหนักตามจำนวนข้อจริง
 * Part ที่ยังไม่เคยฝึก จะประมาณจากค่าเฉลี่ยของฝั่งเดียวกัน หรือค่าตั้งต้น 25% (เดาสุ่ม)
 */
function predict(state) {
  const acc = accuracyByPart(state, 220); // ดู 220 ข้อล่าสุดต่อ Part
  const guessFloor = { 1: 0.25, 2: 0.333, 3: 0.25, 4: 0.25, 5: 0.25, 6: 0.25, 7: 0.25 };

  const fill = (parts) => {
    const known = parts.filter((p) => acc[p] && acc[p].n >= 5);
    const avg = known.length
      ? App.sum(known.map((p) => acc[p].correct)) / App.sum(known.map((p) => acc[p].n))
      : null;
    const out = {};
    for (const p of parts) {
      if (acc[p] && acc[p].n >= 5) out[p] = acc[p].correct / acc[p].n;
      else if (avg != null) out[p] = App.clamp(avg * 0.92, guessFloor[p], 1); // ยังไม่เคยฝึก = หักลบเล็กน้อย
      else out[p] = guessFloor[p];
    }
    return out;
  };

  const rl = fill(LISTEN_PARTS);
  const rr = fill(READ_PARTS);

  const rawL = App.sum(LISTEN_PARTS.map((p) => rl[p] * PART_N[p]));
  const rawR = App.sum(READ_PARTS.map((p) => rr[p] * PART_N[p]));

  const sc = scaledFromRaw(rawL, rawR);
  const dataPoints = App.sum(Object.values(acc).map((a) => a.n));

  return {
    ...sc,
    rawL: Math.round(rawL),
    rawR: Math.round(rawR),
    rateL: rl,
    rateR: rr,
    dataPoints,
    confidence: dataPoints < 60 ? 'low' : dataPoints < 250 ? 'mid' : 'high',
  };
}

/** ความแม่นยำรายส่วนจากประวัติล่าสุด (ไม่นับโหมดทบทวนข้อผิด เพราะจะเบ้ต่ำ) */
function accuracyByPart(state, limitPerPart) {
  const out = {};
  const lim = limitPerPart || 999999;
  for (let i = state.attempts.length - 1; i >= 0; i--) {
    const a = state.attempts[i];
    if (a.mode === 'review') continue;
    for (const it of a.items) {
      const p = it.part;
      if (!p) continue;
      const o = out[p] || (out[p] = { n: 0, correct: 0, ms: 0 });
      if (o.n >= lim) continue;
      o.n += 1;
      o.ms += it.ms || 0;
      if (it.ok) o.correct += 1;
    }
  }
  return out;
}

/** ความแม่นยำรายหัวข้อไวยากรณ์ — ใช้หา "จุดอ่อน" */
function accuracyByTopic(state) {
  const out = {};
  for (const a of state.attempts) {
    for (const it of a.items) {
      if (!it.topic) continue;
      const o = out[it.topic] || (out[it.topic] = { n: 0, correct: 0, topicTh: it.topicTh || '' });
      o.n += 1;
      if (it.ok) o.correct += 1;
      if (it.topicTh) o.topicTh = it.topicTh;
    }
  }
  return out;
}

/** เส้นแนวโน้มคะแนนตามวัน (ใช้ทำกราฟ) */
function scoreTrend(state) {
  const byDate = {};
  for (const a of state.attempts) {
    if (a.mode === 'review') continue;
    const d = a.date || App.ymd(a.ts);
    const o = byDate[d] || (byDate[d] = {});
    for (const it of a.items) {
      if (!it.part) continue;
      const p = o[it.part] || (o[it.part] = { n: 0, c: 0 });
      p.n += 1;
      if (it.ok) p.c += 1;
    }
  }
  const dates = Object.keys(byDate).sort();
  const pts = [];
  const cum = {}; // สะสมแบบถ่วงน้ำหนักล่าสุด เพื่อให้เส้นไม่กระโดด
  for (const d of dates) {
    for (const p in byDate[d]) {
      const c = cum[p] || (cum[p] = { n: 0, c: 0 });
      c.n = c.n * 0.55 + byDate[d][p].n;
      c.c = c.c * 0.55 + byDate[d][p].c;
    }
    const rate = (p) => (cum[p] && cum[p].n >= 3 ? cum[p].c / cum[p].n : null);
    const side = (parts) => {
      const k = parts.filter((p) => rate(p) != null);
      if (!k.length) return null;
      const avg = App.sum(k.map((p) => rate(p) * PART_N[p])) / App.sum(k.map((p) => PART_N[p]));
      return App.sum(parts.map((p) => (rate(p) != null ? rate(p) : avg * 0.92) * PART_N[p]));
    };
    const rl = side(LISTEN_PARTS);
    const rr = side(READ_PARTS);
    if (rl == null && rr == null) continue;
    const sc = scaledFromRaw(rl == null ? 25 : rl, rr == null ? 25 : rr);
    pts.push({ date: d, total: sc.total, L: sc.L, R: sc.R });
  }
  return pts;
}

/** ระดับความหมายของคะแนน (ตามเกณฑ์ที่ ETS ใช้สื่อสาร) */
function scoreBand(total) {
  if (total >= 905) return { th: 'ใช้งานได้ใกล้เคียงเจ้าของภาษา', color: 'var(--gold)' };
  if (total >= 785) return { th: 'สื่อสารในงานได้คล่อง', color: 'var(--ok)' };
  if (total >= 605) return { th: 'สื่อสารในงานได้ในระดับพื้นฐาน', color: 'var(--brand)' };
  if (total >= 405) return { th: 'สื่อสารเรื่องง่ายๆ ได้บ้าง', color: 'var(--warn)' };
  if (total >= 255) return { th: 'เริ่มต้น เข้าใจประโยคสั้นๆ', color: 'var(--warn)' };
  return { th: 'ยังต้องสร้างพื้นฐาน', color: 'var(--bad)' };
}

/** เป้าหมายรายวัน: ควรอยู่ที่เท่าไหร่ในวันที่ n เพื่อจะถึง 750 ในวันที่ 30 */
function targetOnDay(day, startScore) {
  const s = startScore || 300;
  const t = App.clamp((day - 1) / 29, 0, 1);
  // โตแบบ ease-out: ช่วงแรกขึ้นเร็ว (ไวยากรณ์+ศัพท์คุ้มที่สุด) แล้วค่อยชะลอ
  const eased = 1 - Math.pow(1 - t, 1.55);
  return Math.round((s + (750 - s) * eased) / 5) * 5;
}

Object.assign(App, {
  Score: {
    scaleL, scaleR, scaledFromRaw,
    PART_N, PART_NAME, PART_SHORT, LISTEN_PARTS, READ_PARTS,
    predict, accuracyByPart, accuracyByTopic, scoreTrend, scoreBand, targetOnDay,
  },
});
