/* ============================================================
   55-sync — ซิงก์ความคืบหน้าข้ามเครื่องผ่าน GitHub Gist (ส่วนตัว)

   ทำไมเลือก Gist: ผู้ใช้มีบัญชี GitHub อยู่แล้ว ไม่ต้องสมัครบริการเพิ่ม ไม่มีค่าใช้จ่าย
   และ GitHub API เปิด CORS ให้เรียกจากเบราว์เซอร์ได้ตรงๆ

   ข้อจำกัด: หน้า Artifact ของ claude.ai ถูก CSP บล็อกการต่อออกภายนอกทั้งหมด
   ซิงก์จึงทำงานได้เฉพาะเวอร์ชันที่ deploy เป็นเว็บ (GitHub Pages / เซิร์ฟเวอร์ในเครื่อง)

   วิธีรวมข้อมูล: รวมแบบ "ไม่ทับของเดิม" ทุก field — ประวัติการทำข้อสอบรวมกันตาม id,
   คำศัพท์เอาอันที่ทวนล่าสุด, ข้อที่ผิดเอาสถานะล่าสุด, วันที่เรียนรวมกันแล้วคิด streak ใหม่
   ============================================================ */
'use strict';

const API = 'https://api.github.com';
const GIST_DESC = 'toeic750-sync · ความคืบหน้าติว TOEIC (สร้างโดยแอป อย่าลบ)';
const GIST_FILE = 'toeic750-progress.json';

/* จำนวนครั้งล่าสุดที่ยังเก็บรายละเอียดรายข้อไว้ (กันไฟล์ gist โตเกิน 1 MB) */
const KEEP_DETAIL = 150;
const MAX_BYTES = 900 * 1024;

let busy = false;
let pushTimer = null;
let listeners = [];

const cfg = () => {
  const s = App.Store.state();
  s.sync = s.sync || { on: false, token: '', gistId: '', lastAt: 0, lastErr: '', device: '' };
  if (!s.sync.device) s.sync.device = 'd' + Math.random().toString(36).slice(2, 8);
  return s.sync;
};

const enabled = () => {
  const c = cfg();
  return !!(c.on && c.token && c.gistId);
};

/** ซิงก์ต่อเน็ตได้ไหมในสภาพแวดล้อมนี้ (Artifact ถูก CSP บล็อก) */
function available() {
  return location.protocol.startsWith('http') && !/claude\.ai$/.test(location.hostname);
}

function onChange(fn) {
  listeners.push(fn);
  return () => (listeners = listeners.filter((f) => f !== fn));
}
const emit = (st) => listeners.forEach((f) => { try { f(st); } catch (e) {} });

/* ---------- เรียก GitHub API ---------- */

async function gh(path, opt) {
  const c = cfg();
  const res = await fetch(API + path, {
    ...opt,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + c.token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opt && opt.body ? { 'Content-Type': 'application/json' } : {}),
      ...((opt && opt.headers) || {}),
    },
  });
  if (res.status === 401) throw new Error('โทเคนไม่ถูกต้องหรือหมดอายุ');
  if (res.status === 403) throw new Error('โทเคนไม่มีสิทธิ์ gist หรือถูกจำกัดจำนวนครั้ง');
  if (res.status === 404) throw new Error('ไม่พบ gist (อาจถูกลบไปแล้ว)');
  if (!res.ok) throw new Error(`GitHub ตอบกลับ ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** ตรวจโทเคน แล้วหา/สร้าง gist สำหรับเก็บข้อมูล */
async function connect(token) {
  const c = cfg();
  c.token = String(token || '').trim();
  if (!c.token) throw new Error('ยังไม่ได้ใส่โทเคน');

  const me = await gh('/user');

  const gists = await gh('/gists?per_page=100');
  let found = (gists || []).find((g) => g.files && g.files[GIST_FILE]);
  if (!found) {
    found = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: GIST_DESC,
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, updatedAt: Date.now(), state: pack(App.Store.state()) }) } },
      }),
    });
  }

  c.gistId = found.id;
  c.on = true;
  c.lastErr = '';
  App.Store.save(true);
  return { login: me.login, gistId: found.id, created: !gists.some((g) => g.id === found.id) };
}

function disconnect(wipeToken) {
  const c = cfg();
  c.on = false;
  if (wipeToken) { c.token = ''; c.gistId = ''; }
  App.Store.save(true);
  emit(status());
}

/* ---------- ย่อ/ขยายข้อมูลก่อนส่ง ---------- */

/** ตัดรายละเอียดรายข้อของครั้งเก่าๆ ทิ้ง เพื่อไม่ให้ไฟล์โตเกินขีดของ gist */
function pack(state) {
  const s = JSON.parse(JSON.stringify(state));
  delete s.sync; // ห้ามส่งโทเคนขึ้นไปเด็ดขาด

  const at = s.attempts || [];
  const cut = Math.max(0, at.length - KEEP_DETAIL);
  s.attempts = at.map((a, i) => (i < cut ? { ...a, items: [] } : a));

  let json = JSON.stringify(s);
  let drop = KEEP_DETAIL;
  while (json.length > MAX_BYTES && drop > 20) {
    drop = Math.floor(drop / 2);
    const c2 = Math.max(0, at.length - drop);
    s.attempts = at.map((a, i) => (i < c2 ? { ...a, items: [] } : a));
    json = JSON.stringify(s);
  }
  if (json.length > MAX_BYTES) s.attempts = s.attempts.slice(-drop);
  return s;
}

/* ---------- รวมข้อมูลสองเครื่อง ---------- */

function mergeStates(local, remote) {
  if (!remote) return local;
  const out = JSON.parse(JSON.stringify(local));

  /* การตั้งค่าเป็นของเฉพาะเครื่อง (เสียง ขนาดตัวอักษร ธีม) — ไม่รวม */

  /* ประวัติการทำข้อสอบ: รวมตาม id ครั้งที่มีรายละเอียดชนะครั้งที่ถูกตัดรายละเอียด */
  const byId = new Map();
  for (const a of (remote.attempts || []).concat(local.attempts || [])) {
    const cur = byId.get(a.id);
    if (!cur || (a.items || []).length > (cur.items || []).length) byId.set(a.id, a);
  }
  out.attempts = Array.from(byId.values()).sort((x, y) => x.ts - y.ts).slice(-800);

  /* ผลสอบเต็มชุด: รวมตามเวลาที่สอบ */
  const exById = new Map();
  for (const e of (remote.exams || []).concat(local.exams || [])) exById.set(e.ts + ':' + e.testId, e);
  out.exams = Array.from(exById.values()).sort((x, y) => x.ts - y.ts);

  /* คำศัพท์: เอาการ์ดที่ทวนล่าสุด */
  out.srs = { ...(remote.srs || {}) };
  for (const k in local.srs || {}) {
    const a = local.srs[k], b = out.srs[k];
    if (!b || (a.last || 0) >= (b.last || 0)) out.srs[k] = a;
  }

  /* ข้อที่ผิด: เอาสถานะล่าสุด และถ้าฝั่งใดแก้ได้แล้วโดยเกิดทีหลัง ให้ถือว่าแก้ได้ */
  out.mistakes = { ...(remote.mistakes || {}) };
  for (const k in local.mistakes || {}) {
    const a = local.mistakes[k], b = out.mistakes[k];
    if (!b) { out.mistakes[k] = a; continue; }
    const aT = Math.max(a.lastTs || 0, a.resolvedTs || 0);
    const bT = Math.max(b.lastTs || 0, b.resolvedTs || 0);
    const win = aT >= bT ? a : b;
    out.mistakes[k] = { ...win, n: Math.max(a.n || 0, b.n || 0) };
  }

  /* จำนวนครั้งที่เคยเจอข้อนั้น: เอาค่ามากกว่า */
  out.seen = { ...(remote.seen || {}) };
  for (const k in local.seen || {}) out.seen[k] = Math.max(out.seen[k] || 0, local.seen[k] || 0);

  /* โน้ตส่วนตัว: ฝั่งที่มีข้อความชนะ ถ้ามีทั้งคู่และต่างกัน ให้ต่อกัน */
  out.notes = { ...(remote.notes || {}) };
  for (const k in local.notes || {}) {
    const a = local.notes[k], b = out.notes[k];
    out.notes[k] = !b ? a : a === b ? a : `${b}\n${a}`;
  }

  /* ความคืบหน้า */
  const lp = local.progress || {}, rp = remote.progress || {};
  const dates = App.uniq((rp.studyDates || []).concat(lp.studyDates || [])).sort();
  out.progress = {
    ...lp,
    xp: Math.max(lp.xp || 0, rp.xp || 0),
    studyDates: dates,
    lastStudyDate: dates.length ? dates[dates.length - 1] : null,
    streak: streakFrom(dates),
    bestStreak: Math.max(lp.bestStreak || 0, rp.bestStreak || 0, streakFrom(dates)),
    lessonsDone: mergeEarliest(lp.lessonsDone, rp.lessonsDone),
    doneTasks: mergeEarliest(lp.doneTasks, rp.doneTasks),
    badges: mergeBadges(lp.badges, rp.badges),
  };

  /* ผลจัดระดับ: เอาครั้งล่าสุด */
  if (rp && remote.placement) {
    if (!local.placement || remote.placement.ts > local.placement.ts) out.placement = remote.placement;
  }

  /* แผน: วันเริ่มเอาวันที่เร็วที่สุด วันสอบเอาอันที่มีค่า */
  out.plan = { ...(local.plan || {}) };
  if (remote.plan) {
    if (remote.plan.startDate && (!out.plan.startDate || remote.plan.startDate < out.plan.startDate)) {
      out.plan.startDate = remote.plan.startDate;
    }
    if (!out.plan.examDate && remote.plan.examDate) out.plan.examDate = remote.plan.examDate;
  }

  return out;
}

function mergeEarliest(a, b) {
  const o = { ...(b || {}) };
  for (const k in a || {}) o[k] = o[k] ? Math.min(o[k], a[k]) : a[k];
  return o;
}
function mergeBadges(a, b) {
  const m = new Map();
  for (const x of (b || []).concat(a || [])) {
    const cur = m.get(x.id);
    if (!cur || x.ts < cur.ts) m.set(x.id, x);
  }
  return Array.from(m.values());
}

/** คิด streak ปัจจุบันจากรายการวันที่เรียน (ต่อเนื่องถึงวันนี้หรือเมื่อวาน) */
function streakFrom(dates) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const today = App.today();
  let cur = set.has(today) ? today : App.addDays(today, -1);
  if (!set.has(cur)) return 0;
  let n = 0;
  while (set.has(cur)) {
    n++;
    cur = App.addDays(cur, -1);
  }
  return n;
}

/* ---------- ดึง / ส่ง ---------- */

async function readRemote() {
  const c = cfg();
  const g = await gh('/gists/' + c.gistId);
  const f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  let content = f.content;
  if (f.truncated && f.raw_url) {
    const r = await fetch(f.raw_url);
    content = await r.text();
  }
  if (!content) return null;
  const obj = JSON.parse(content);
  return obj.state || null;
}

async function writeRemote(state) {
  const c = cfg();
  await gh('/gists/' + c.gistId, {
    method: 'PATCH',
    body: JSON.stringify({
      description: GIST_DESC,
      files: {
        [GIST_FILE]: {
          content: JSON.stringify({ v: 1, updatedAt: Date.now(), device: c.device, state: pack(state) }),
        },
      },
    }),
  });
}

/**
 * ดึงของเครื่องอื่นมารวม แล้วส่งผลรวมกลับขึ้นไป
 * @param {{silent?:boolean}} opt
 */
async function syncNow(opt) {
  opt = opt || {};
  const c = cfg();
  if (!enabled()) throw new Error('ยังไม่ได้เปิดซิงก์');
  if (!available()) throw new Error('หน้านี้ต่ออินเทอร์เน็ตออกไม่ได้ (ใช้ลิงก์ GitHub Pages แทน)');
  if (busy) return { skipped: true };
  busy = true;
  emit(status());
  try {
    const remote = await readRemote();
    const before = App.Store.state();
    const merged = mergeStates(before, remote);
    merged.sync = before.sync;
    App.Store.replaceState(merged);
    await writeRemote(merged);

    c.lastAt = Date.now();
    c.lastErr = '';
    App.Store.save(true);

    const gained = (merged.attempts || []).length - (before.attempts || []).length;
    if (!opt.silent) {
      App.toast(gained > 0 ? `ซิงก์แล้ว — ดึงมาเพิ่ม ${gained} ครั้ง` : 'ซิงก์แล้ว', 'ok');
    }
    if (gained > 0 && App.rerender) App.rerender();
    return { ok: true, gained };
  } catch (e) {
    c.lastErr = e.message || String(e);
    App.Store.save(true);
    if (!opt.silent) App.toast('ซิงก์ไม่สำเร็จ: ' + c.lastErr, 'bad');
    throw e;
  } finally {
    busy = false;
    emit(status());
  }
}

/** ตั้งเวลาส่งขึ้นหลังผู้ใช้หยุดทำอะไรสักพัก */
function schedulePush() {
  if (!enabled() || !available()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow({ silent: true }).catch(() => {}), 25000);
}

function status() {
  const c = cfg();
  return {
    available: available(),
    on: !!c.on,
    connected: enabled(),
    busy,
    lastAt: c.lastAt || 0,
    lastErr: c.lastErr || '',
    gistId: c.gistId || '',
  };
}

/** เรียกตอนเปิดแอป: ดึงของเครื่องอื่นมารวมทันที */
function boot() {
  if (!enabled() || !available()) return;
  setTimeout(() => syncNow({ silent: true }).catch(() => {}), 1500);

  // ส่งขึ้นก่อนปิดแท็บ/สลับไปแอปอื่น
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(pushTimer);
      syncNow({ silent: true }).catch(() => {});
    }
  });
}

Object.assign(App, {
  Sync: {
    connect, disconnect, syncNow, schedulePush, status, boot, onChange,
    available, enabled, mergeStates, streakFrom, pack,
    GIST_FILE,
  },
});
