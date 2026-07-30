/* ============================================================
   40-data — โหลดคลังเนื้อหา (ทำงานได้ทั้งแบบฝังในไฟล์เดียวและแบบโหลดทีละไฟล์)
   ============================================================ */
'use strict';

const MANIFEST = window.__MANIFEST__ || { drills: [], tests: [], lessons: [], vocab: [], static: [], plan: null };
const INLINE = window.__DATA__ || null;

const cache = new Map();      // "kind/name" -> object
const unitIndex = new Map();  // qid -> unit
const qIndex = new Map();     // qid -> {unit, qi}
let loadedAll = false;

const baseUrl = () => {
  const p = location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
};

function loadFile(kind, name) {
  const key = kind + '/' + name;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (INLINE) {
    const obj = INLINE[key] || null;
    cache.set(key, obj);
    return Promise.resolve(obj);
  }
  return fetch(`${baseUrl()}data/${kind}/${name}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((obj) => {
      cache.set(key, obj);
      return obj;
    });
}

function filesOf(kind) {
  return (MANIFEST[kind] || []).slice();
}

function loadKind(kind) {
  return Promise.all(filesOf(kind).map((n) => loadFile(kind, n))).then((a) => a.filter(Boolean));
}

/* ---------- normalize ---------- */

const GROUP_PARTS = new Set([3, 4, 6, 7]);

/**
 * แปลง item ดิบเป็น "unit" ที่ตัวรันข้อสอบใช้
 * single = 1 คำถาม / group = หลายคำถามใช้เนื้อหาร่วมกัน
 */
function toUnit(raw, src) {
  if (!raw || typeof raw !== 'object') return null;
  const part = Number(raw.part);
  if (!part) return null;
  const isGroup = Array.isArray(raw.questions) && raw.questions.length > 0;

  const u = {
    id: raw.id,
    part,
    tier: raw.tier || 'medium',
    topic: raw.topic || null,
    topicTh: raw.topicTh || null,
    src: src || null,
    kind: isGroup ? 'group' : 'single',
    raw,
  };

  if (isGroup) {
    u.qs = raw.questions.map((q, i) => ({
      qid: `${raw.id}#${i + 1}`,
      idx: i,
      q: q.q || (q.blank ? `ช่องว่างที่ ${q.blank}` : ''),
      blank: q.blank || null,
      kindQ: q.kind || null,
      choices: q.choices || [],
      answer: q.answer,
      th: q.th || {},
      explain: q.explain || {},
    }));
  } else {
    u.qs = [
      {
        qid: raw.id,
        idx: 0,
        q: raw.stem || raw.prompt || '',
        choices: raw.choices || [],
        answer: raw.answer,
        th: raw.th || {},
        explain: raw.explain || {},
      },
    ];
  }
  u.n = u.qs.length;
  return u;
}

function indexUnits(units) {
  for (const u of units) {
    unitIndex.set(u.id, u);
    u.qs.forEach((q, qi) => qIndex.set(q.qid, { unit: u, qi }));
  }
}

/* ---------- ดริล ---------- */

let drillUnits = null;

function loadDrills() {
  if (drillUnits) return Promise.resolve(drillUnits);
  return loadKind('drills').then((files) => {
    const out = [];
    for (const f of files) {
      const src = (f.meta && f.meta.batch) || 'drill';
      for (const it of f.items || []) {
        const u = toUnit(it, src);
        if (u) out.push(u);
      }
    }
    drillUnits = out;
    indexUnits(out);
    return out;
  });
}

/** รวมข้อจากบทเรียน (quiz ท้ายบท) เข้าคลังด้วย เผื่อใช้ทบทวน */
let lessonUnits = null;
function loadLessonQuizUnits() {
  if (lessonUnits) return Promise.resolve(lessonUnits);
  return loadKind('lessons').then((files) => {
    const out = [];
    for (const f of files) {
      for (const it of f.quiz || []) {
        const u = toUnit(it, 'lesson:' + f.id);
        if (u) out.push(u);
      }
    }
    lessonUnits = out;
    indexUnits(out);
    return out;
  });
}

/**
 * เลือกข้อสำหรับฝึก
 *
 * ถ้าระบุ topic แล้วข้อในหัวข้อนั้นไม่พอตามจำนวนที่ขอ จะเติมจากหัวข้ออื่น
 * ใน Part/ระดับเดียวกันจนครบ — ดีกว่าให้ผู้เรียนได้ทำน้อยกว่าที่แผนตั้งไว้
 * (และการสลับหัวข้อยังช่วยความจำระยะยาวมากกว่าการฝึกหัวข้อเดียวรวด)
 *
 * @param {{part?:number|number[], tier?:string, topic?:string, n?:number,
 *          preferUnseen?:boolean, seed?:number, strictTopic?:boolean}} opt
 */
function selectDrill(opt) {
  opt = opt || {};
  return loadDrills().then((all) => {
    const parts = opt.part == null ? null : Array.isArray(opt.part) ? opt.part : [opt.part];
    const inScope = (u) => {
      if (parts && !parts.includes(u.part)) return false;
      if (opt.tier && u.tier !== opt.tier) return false;
      return true;
    };

    const scoped = all.filter(inScope);
    if (!scoped.length) return [];

    const primary = opt.topic ? scoped.filter((u) => u.topic === opt.topic) : scoped;
    const backup = opt.topic && !opt.strictTopic ? scoped.filter((u) => u.topic !== opt.topic) : [];
    if (!primary.length && !backup.length) return [];

    const st = App.Store.state();
    const rnd = App.mulberry32(opt.seed != null ? opt.seed : Date.now() & 0xffffff);

    // ข้อที่ยังไม่เคยเจอมาก่อน แล้วค่อยวนกลับไปข้อที่เจอมาน้อยที่สุด
    const order = (list) => {
      if (opt.preferUnseen === false) return App.shuffle(list, rnd);
      const seenCount = (u) => App.sum(u.qs.map((q) => st.seen[q.qid] || 0));
      const fresh = App.shuffle(list.filter((u) => seenCount(u) === 0), rnd);
      const rest = App.shuffle(list.filter((u) => seenCount(u) > 0), rnd)
        .sort((a, b) => seenCount(a) - seenCount(b));
      return fresh.concat(rest);
    };

    const want = opt.n || 20;
    const out = [];
    let cnt = 0;
    for (const list of [order(primary), order(backup)]) {
      for (const u of list) {
        if (cnt >= want) break;
        out.push(u);
        cnt += u.n;
      }
      if (cnt >= want) break;
    }
    return out;
  });
}

/** หัวข้อทั้งหมดที่มีในคลัง พร้อมจำนวนข้อ */
function drillTopics() {
  return loadDrills().then((all) => {
    const map = {};
    for (const u of all) {
      if (!u.topic) continue;
      const k = u.topic;
      const o = map[k] || (map[k] = { topic: k, topicTh: u.topicTh || k, n: 0, parts: new Set(), tiers: new Set() });
      o.n += u.n;
      o.parts.add(u.part);
      o.tiers.add(u.tier);
      if (u.topicTh) o.topicTh = u.topicTh;
    }
    return Object.values(map)
      .map((o) => ({ ...o, parts: Array.from(o.parts), tiers: Array.from(o.tiers) }))
      .sort((a, b) => b.n - a.n);
  });
}

/** จำนวนข้อที่มีในคลัง แยกตาม part/tier */
function drillCounts() {
  return loadDrills().then((all) => {
    const out = {};
    for (const u of all) {
      const p = (out[u.part] = out[u.part] || { total: 0, easy: 0, medium: 0, real: 0 });
      p.total += u.n;
      p[u.tier] = (p[u.tier] || 0) + u.n;
    }
    return out;
  });
}

/* ---------- ชุดสอบ ---------- */

function loadTest(name) {
  return loadFile('tests', name).then((f) => {
    if (!f) return null;
    const units = (f.items || []).map((it) => toUnit(it, name)).filter(Boolean);
    indexUnits(units);
    return { meta: f.meta || {}, units, name };
  });
}

function testList() {
  return filesOf('tests');
}

/* ---------- บทเรียน ---------- */

function lessons() {
  return loadKind('lessons').then((a) => a.sort((x, y) => (x.day || 0) - (y.day || 0)));
}
function lesson(id) {
  return loadFile('lessons', id);
}

/* ---------- คำศัพท์ ---------- */

let vocabAll = null;
function vocab() {
  if (vocabAll) return Promise.resolve(vocabAll);
  return loadKind('vocab').then((files) => {
    const out = [];
    for (const f of files) for (const it of f.items || []) out.push({ ...it, batch: (f.meta && f.meta.batch) || '' });
    const seenId = new Set();
    vocabAll = out.filter((x) => (seenId.has(x.id) ? false : (seenId.add(x.id), true)));
    return vocabAll;
  });
}

/* ---------- เอกสารคงที่ ---------- */

function staticDoc(name) {
  return loadFile('static', name);
}

/* ---------- แผน 30 วัน ---------- */

let planCache = null;
function plan() {
  if (planCache) return Promise.resolve(planCache);
  return loadFile('static', 'plan30').then((p) => {
    planCache = p || { days: [] };
    return planCache;
  });
}

/* ---------- ค้นหาข้อจาก qid (ใช้กับสมุดข้อผิด) ---------- */

function ensureAll(onProgress) {
  if (loadedAll) return Promise.resolve();
  const jobs = [loadDrills(), loadLessonQuizUnits()].concat(filesOf('tests').map((n) => loadTest(n)));
  let done = 0;
  return Promise.all(
    jobs.map((p) =>
      p.then((r) => {
        done++;
        if (onProgress) onProgress(done, jobs.length);
        return r;
      }),
    ),
  ).then(() => {
    loadedAll = true;
  });
}

function findQ(qid) {
  return qIndex.get(qid) || null;
}
function findUnit(id) {
  return unitIndex.get(id) || null;
}

/* ---------- สรุปว่ามีเนื้อหาอะไรพร้อมแล้วบ้าง ---------- */

function inventory() {
  return Promise.all([drillCounts(), vocab(), lessons()]).then(([dc, vc, ls]) => {
    const drillTotal = App.sum(Object.values(dc).map((x) => x.total));
    return {
      drills: dc,
      drillTotal,
      vocab: vc.length,
      lessons: ls.length,
      tests: filesOf('tests').filter((n) => n !== 'placement').length,
      hasPlacement: filesOf('tests').includes('placement'),
    };
  });
}

Object.assign(App, {
  Data: {
    MANIFEST, filesOf, loadFile, loadKind,
    loadDrills, selectDrill, drillTopics, drillCounts,
    loadTest, testList,
    lessons, lesson, loadLessonQuizUnits,
    vocab, staticDoc, plan,
    ensureAll, findQ, findUnit, toUnit, inventory,
    GROUP_PARTS,
  },
});
