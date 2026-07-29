/* ============================================================
   10-store — สถานะทั้งหมดของผู้ใช้ + บันทึกลง localStorage
   ============================================================ */
'use strict';

const STORE_KEY = 'toeic750.state';
const STORE_VERSION = 1;

const DEFAULT_STATE = () => ({
  v: STORE_VERSION,
  createdAt: new Date().toISOString(),
  settings: {
    theme: 'dark',          // dark | light | auto
    fontScale: 1,           // 0.9 – 1.4
    ttsRate: 0.95,          // 0.7 – 1.3
    accentMode: 'mixed',    // mixed | us
    voiceMap: {},           // 'US' -> voiceURI
    reminderOn: true,
    reminderTime: '20:00',
    helpBtn: true,          // ปุ่มช่วยเหลือในโหมดฝึก
    showThaiChoices: true,  // แสดงคำแปลตัวเลือกในเฉลย
  },
  plan: {
    startDate: null,        // ตั้งครั้งแรกที่เปิดแอป
    examDate: null,
  },
  progress: {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    lastStudyDate: null,
    studyDates: [],
    doneTasks: {},          // "3:drill:p5:easy" -> ts
    lessonsDone: {},        // "L01" -> ts
    badges: [],             // [{id, ts}]
  },
  placement: null,          // {ts, byPart:{}, raw:{L,R}, scaled:{L,R,total}, level}
  attempts: [],             // ดูรูปแบบใน addAttempt()
  exams: [],
  srs: {},                  // wordId -> {ef, iv, due, reps, lapses, last}
  mistakes: {},             // qid -> {n, lastTs, part, tier, topic, resolved}
  seen: {},                 // qid -> จำนวนครั้งที่เคยเจอ
  notes: {},                // qid -> โน้ตส่วนตัว
});

let S = null;
let saveTimer = null;

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch (e) {
    /* โหมดส่วนตัวบางเบราว์เซอร์ปิด localStorage */
  }
  if (!raw) {
    S = DEFAULT_STATE();
  } else {
    try {
      S = migrate(JSON.parse(raw));
    } catch (e) {
      console.error('อ่านข้อมูลเดิมไม่ได้ เริ่มใหม่', e);
      S = DEFAULT_STATE();
    }
  }
  // เติม field ที่อาจหายไปจากเวอร์ชันเก่า
  const d = DEFAULT_STATE();
  for (const k in d) if (!(k in S)) S[k] = d[k];
  for (const k in d.settings) if (!(k in S.settings)) S.settings[k] = d.settings[k];
  for (const k in d.progress) if (!(k in S.progress)) S.progress[k] = d.progress[k];
  for (const k in d.plan) if (!(k in S.plan)) S.plan[k] = d.plan[k];

  if (!S.plan.startDate) S.plan.startDate = App.today();
  return S;
}

function migrate(s) {
  // เผื่อไว้สำหรับเวอร์ชันในอนาคต
  if (!s.v || s.v < 1) s.v = STORE_VERSION;
  return s;
}

function save(now) {
  clearTimeout(saveTimer);
  const doIt = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch (e) {
      App.toast('บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็ม', 'bad');
      console.error(e);
    }
  };
  if (now) doIt();
  else saveTimer = setTimeout(doIt, 350);
}

const state = () => S;

/* ---------- แผน 30 วัน ---------- */

/** วันที่เท่าไหร่ของแผน (1-based) — ไม่เกิน 30 */
function planDay() {
  const n = App.daysBetween(S.plan.startDate, App.today()) + 1;
  return App.clamp(n, 1, 30);
}

/** วันที่จริงตามปฏิทิน (อาจเกิน 30 ถ้าเรียนช้ากว่าแผน) */
function calendarDay() {
  return App.daysBetween(S.plan.startDate, App.today()) + 1;
}

function daysLeft() {
  return Math.max(0, 30 - planDay());
}

/* ---------- streak / XP ---------- */

const XP = {
  correct: 3,
  wrong: 1,
  lesson: 40,
  cardReview: 1,
  drillSet: 15,
  exam: 120,
  dayComplete: 60,
};

function markStudiedToday() {
  const t = App.today();
  const p = S.progress;
  if (p.lastStudyDate === t) return false;

  if (p.lastStudyDate && App.daysBetween(p.lastStudyDate, t) === 1) p.streak += 1;
  else p.streak = 1;

  p.bestStreak = Math.max(p.bestStreak, p.streak);
  p.lastStudyDate = t;
  if (!p.studyDates.includes(t)) p.studyDates.push(t);
  save();
  return true;
}

function addXP(n, ev) {
  S.progress.xp += n;
  markStudiedToday();
  if (ev && ev.clientX != null) App.flyXP(n, ev.clientX, ev.clientY);
  save();
  checkBadges();
}

/* ---------- เหรียญตรา ---------- */

const BADGES = [
  { id: 'first-step',  icon: '👟', name: 'ก้าวแรก',        desc: 'ทำข้อสอบข้อแรกสำเร็จ',            test: (s) => s.attempts.length >= 1 },
  { id: 'streak-3',    icon: '🔥', name: 'ติดกัน 3 วัน',    desc: 'เรียนติดต่อกัน 3 วัน',            test: (s) => s.progress.bestStreak >= 3 },
  { id: 'streak-7',    icon: '🔥', name: 'ครบสัปดาห์',      desc: 'เรียนติดต่อกัน 7 วัน',            test: (s) => s.progress.bestStreak >= 7 },
  { id: 'streak-14',   icon: '💎', name: 'สองสัปดาห์รวด',   desc: 'เรียนติดต่อกัน 14 วัน',           test: (s) => s.progress.bestStreak >= 14 },
  { id: 'streak-30',   icon: '👑', name: 'ครบ 30 วันไม่ขาด', desc: 'เรียนติดต่อกัน 30 วัน',          test: (s) => s.progress.bestStreak >= 30 },
  { id: 'q-100',       icon: '💯', name: '100 ข้อ',        desc: 'ทำข้อสอบครบ 100 ข้อ',            test: (s) => totalAnswered(s) >= 100 },
  { id: 'q-500',       icon: '🎯', name: '500 ข้อ',        desc: 'ทำข้อสอบครบ 500 ข้อ',            test: (s) => totalAnswered(s) >= 500 },
  { id: 'q-1000',      icon: '🏆', name: '1,000 ข้อ',      desc: 'ทำข้อสอบครบ 1,000 ข้อ',          test: (s) => totalAnswered(s) >= 1000 },
  { id: 'lesson-7',    icon: '📖', name: 'จบสัปดาห์แรก',    desc: 'เรียนครบบทที่ 1–7',              test: (s) => Object.keys(s.progress.lessonsDone).length >= 7 },
  { id: 'lesson-all',  icon: '🎓', name: 'จบทุกบท',         desc: 'เรียนครบทั้ง 30 บท',             test: (s) => Object.keys(s.progress.lessonsDone).length >= 30 },
  { id: 'vocab-100',   icon: '🗂️', name: 'ศัพท์ 100 คำ',    desc: 'จำศัพท์ได้ 100 คำ',              test: (s) => matureWords(s) >= 100 },
  { id: 'vocab-300',   icon: '📚', name: 'ศัพท์ 300 คำ',    desc: 'จำศัพท์ได้ 300 คำ',              test: (s) => matureWords(s) >= 300 },
  { id: 'vocab-600',   icon: '🧠', name: 'ศัพท์ครบ 600 คำ',  desc: 'จำศัพท์ได้ครบ 600 คำ',           test: (s) => matureWords(s) >= 600 },
  { id: 'exam-1',      icon: '📝', name: 'สอบเสมือนครั้งแรก', desc: 'ทำข้อสอบเต็มชุดจบ 1 ครั้ง',      test: (s) => s.exams.length >= 1 },
  { id: 'exam-3',      icon: '⏱️', name: 'ซ้อมสนามจริง',     desc: 'ทำข้อสอบเต็มชุดจบ 3 ครั้ง',      test: (s) => s.exams.length >= 3 },
  { id: 'score-500',   icon: '📈', name: 'ผ่าน 500',        desc: 'คะแนนประเมินแตะ 500',            test: (s) => bestScore(s) >= 500 },
  { id: 'score-650',   icon: '🚀', name: 'ผ่าน 650',        desc: 'คะแนนประเมินแตะ 650',            test: (s) => bestScore(s) >= 650 },
  { id: 'score-750',   icon: '🥇', name: 'ถึงเป้า 750!',     desc: 'คะแนนประเมินแตะ 750',            test: (s) => bestScore(s) >= 750 },
  { id: 'fix-50',      icon: '🔧', name: 'แก้ข้อผิด 50 ข้อ',  desc: 'ทบทวนข้อที่เคยผิดจนถูก 50 ข้อ',  test: (s) => Object.values(s.mistakes).filter((m) => m.resolved).length >= 50 },
];

function totalAnswered(s) {
  return App.sum(s.attempts.map((a) => a.n || 0));
}
function matureWords(s) {
  return Object.values(s.srs).filter((c) => c.iv >= 7).length;
}
function bestScore(s) {
  const fromExam = s.exams.map((e) => e.scaled.total);
  const fromPl = s.placement ? [s.placement.scaled.total] : [];
  return Math.max(0, ...fromExam, ...fromPl);
}

function checkBadges() {
  const have = new Set(S.progress.badges.map((b) => b.id));
  const won = [];
  for (const b of BADGES) {
    if (have.has(b.id)) continue;
    let pass = false;
    try { pass = b.test(S); } catch (e) { /* ข้ามถ้าโครงสร้างยังไม่พร้อม */ }
    if (pass) {
      S.progress.badges.push({ id: b.id, ts: Date.now() });
      won.push(b);
    }
  }
  if (won.length) {
    save();
    setTimeout(() => showBadgeWin(won), 400);
  }
  return won;
}

function showBadgeWin(list) {
  const body = App.h(
    'div.center',
    list.map((b) =>
      App.h(
        'div',
        { style: { margin: '14px 0' } },
        App.h('div', { style: { fontSize: '3rem', lineHeight: '1.2' } }, b.icon),
        App.h('div.b', { style: { fontSize: '1.1rem' } }, b.name),
        App.h('div.small.muted', b.desc),
      ),
    ),
  );
  App.modal('🎉 ได้เหรียญใหม่!', body, [{ label: 'เยี่ยม!', kind: 'primary' }]);
}

/* ---------- บันทึกการทำข้อสอบ ---------- */

/**
 * @param {{mode:string, part?:number, tier?:string, topic?:string, label?:string,
 *          items:Array<{qid,ch,ok,ms,part,tier,topic}>, ms:number}} a
 */
function addAttempt(a) {
  const rec = {
    id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    ts: Date.now(),
    date: App.today(),
    mode: a.mode,
    part: a.part || null,
    tier: a.tier || null,
    topic: a.topic || null,
    label: a.label || '',
    n: a.items.length,
    correct: a.items.filter((i) => i.ok).length,
    ms: a.ms || 0,
    items: a.items,
  };
  S.attempts.push(rec);
  if (S.attempts.length > 800) S.attempts = S.attempts.slice(-800);

  for (const it of a.items) {
    S.seen[it.qid] = (S.seen[it.qid] || 0) + 1;
    if (it.ok) {
      const m = S.mistakes[it.qid];
      if (m && !m.resolved) {
        m.resolved = true;
        m.resolvedTs = Date.now();
      }
    } else {
      const m = S.mistakes[it.qid] || {
        n: 0, part: it.part, tier: it.tier, topic: it.topic, resolved: false,
      };
      m.n += 1;
      m.lastTs = Date.now();
      m.lastCh = it.ch;
      m.resolved = false;
      m.part = it.part != null ? it.part : m.part;
      m.tier = it.tier || m.tier;
      m.topic = it.topic || m.topic;
      S.mistakes[it.qid] = m;
    }
  }
  markStudiedToday();
  save(true);
  checkBadges();
  return rec;
}

function taskKey(day, t) {
  return `${day}:${t.type}:${t.id || t.part || ''}:${t.tier || ''}`;
}
function isTaskDone(day, t) {
  return !!S.progress.doneTasks[taskKey(day, t)];
}
function markTaskDone(day, t) {
  const k = taskKey(day, t);
  if (S.progress.doneTasks[k]) return false;
  S.progress.doneTasks[k] = Date.now();
  save();
  return true;
}

/* ---------- นำเข้า / ส่งออก ---------- */

function exportJSON() {
  return JSON.stringify(S, null, 1);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function importJSON(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || !obj.progress || !obj.settings) {
    throw new Error('ไฟล์ไม่ใช่ข้อมูลสำรองของแอปนี้');
  }
  S = migrate(obj);
  const d = DEFAULT_STATE();
  for (const k in d) if (!(k in S)) S[k] = d[k];
  save(true);
  return S;
}

function resetAll() {
  S = DEFAULT_STATE();
  S.plan.startDate = App.today();
  save(true);
}

Object.assign(App, {
  Store: {
    load, save, state, resetAll,
    planDay, calendarDay, daysLeft,
    markStudiedToday, addXP, XP,
    addAttempt, taskKey, isTaskDone, markTaskDone,
    checkBadges, BADGES, totalAnswered, matureWords, bestScore,
    exportJSON, importJSON, download,
    STORE_KEY,
  },
});
