#!/usr/bin/env node
/* ============================================================
   audit.js — ตรวจ "คุณภาพเฉลย" ด้วยกฎที่พิสูจน์ได้ (ต่างจาก validate.js ที่ตรวจโครงสร้าง)
   หากลุ่มข้อที่มีแนวโน้มว่าเฉลยผิด เพื่อส่งให้คนตรวจซ้ำ

   รัน: node tools/audit.js [--json]
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const AS_JSON = process.argv.includes('--json');

const findings = [];
const flag = (sev, file, id, rule, msg) => findings.push({ sev, file, id, rule, msg });

/* ---------- ตารางความรู้ที่ใช้ตรวจ ---------- */

/* วลีที่บุพบทตายตัว — ถ้าโจทย์มีวลีนี้ คำตอบต้องเป็นบุพบทที่กำหนด */
const FIXED_PREP = [
  [/\bin charge\s+_{3,}/i, 'of'], [/\bresponsible\s+_{3,}/i, 'for'],
  [/\baccording\s+_{3,}/i, 'to'], [/\bdue\s+_{3,}/i, 'to'],
  [/\bprior\s+_{3,}/i, 'to'], [/\bon behalf\s+_{3,}/i, 'of'],
  [/\bin addition\s+_{3,}/i, 'to'], [/\binterested\s+_{3,}/i, 'in'],
  [/\bdepends?\s+_{3,}/i, 'on'], [/\bconsists?\s+_{3,}/i, 'of'],
  [/\bparticipate[ds]?\s+_{3,}/i, 'in'], [/\bcompl(y|ies|ied)\s+_{3,}/i, 'with'],
  [/\bappl(y|ies|ied)\s+_{3,}/i, 'for'], [/\blook(ing|s|ed)?\s+forward\s+_{3,}/i, 'to'],
  [/\bfamiliar\s+_{3,}/i, 'with'], [/\bcapable\s+_{3,}/i, 'of'],
  [/\bin compliance\s+_{3,}/i, 'with'], [/\bregardless\s+_{3,}/i, 'of'],
  [/\bin spite\s+_{3,}/i, 'of'], [/\bcontribute[ds]?\s+_{3,}/i, 'to'],
  [/\bsubject\s+_{3,}/i, 'to'], [/\bconcerned\s+_{3,}/i, 'about'],
  [/\bsucceed(ed|s)?\s+_{3,}/i, 'in'], [/\bspecialize[ds]?\s+_{3,}/i, 'in'],
  [/\bequipped\s+_{3,}/i, 'with'], [/\bopposed\s+_{3,}/i, 'to'],
  [/\baccustomed\s+_{3,}/i, 'to'], [/\bresult(ed|s)?\s+_{3,}/i, 'in'],
  [/\brely\s+_{3,}/i, 'on'], [/\breplied\s+_{3,}/i, 'to'],
];

/* กริยาอปกติ: base -> past */
const IRREG = {
  be: ['was', 'were'], begin: ['began'], break: ['broke'], bring: ['brought'], build: ['built'],
  buy: ['bought'], catch: ['caught'], choose: ['chose'], come: ['came'], cost: ['cost'],
  cut: ['cut'], do: ['did'], draw: ['drew'], drive: ['drove'], eat: ['ate'], fall: ['fell'],
  feel: ['felt'], find: ['found'], fly: ['flew'], forget: ['forgot'], get: ['got'], give: ['gave'],
  go: ['went'], grow: ['grew'], have: ['had'], hear: ['heard'], hold: ['held'], keep: ['kept'],
  know: ['knew'], leave: ['left'], lend: ['lent'], let: ['let'], lose: ['lost'], make: ['made'],
  meet: ['met'], pay: ['paid'], put: ['put'], read: ['read'], ride: ['rode'], run: ['ran'],
  say: ['said'], see: ['saw'], sell: ['sold'], send: ['sent'], set: ['set'], show: ['showed'],
  sit: ['sat'], sleep: ['slept'], speak: ['spoke'], spend: ['spent'], stand: ['stood'],
  take: ['took'], teach: ['taught'], tell: ['told'], think: ['thought'], understand: ['understood'],
  wear: ['wore'], win: ['won'], write: ['wrote'], rise: ['rose'], hire: ['hired'],
};

const PAST_MARKER = /\b(yesterday|last (night|week|month|year|quarter|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(\d+|two|three|four|five|six|seven|ten|several) (days?|weeks?|months?|years?|hours?|minutes?) ago|in (19|20)\d\d)\b/i;
const AUX_BEFORE = /\b(is|are|am|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|should|to|not|never)\s+_{3,}/i;

const WH_INFO = /^(what|where|when|who|whom|whose|which|how)\b/i;
const WH_EXCEPT = /^(how about|what about|why don'?t|how would you like|what do you say|would|could|can|do you|did you|have you|is there|are there|should we)/i;
const YESNO_ANSWER = /^\s*(yes|no|sure|of course|certainly|absolutely|definitely)\b/i;

const STOP = new Set(('a an the is are was were be been being am do does did to of in on at for with by from and or but not this that these those there here it its his her their our your my he she they we you i as' +
  ' will would can could may might must should have has had').split(' '));

/* ---------- helper ---------- */

function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}
function stemOf(w) {
  return w.replace(/(ing|ed|es|s|ly)$/, '');
}
function overlap(a, b) {
  const A = new Set(words(a).map(stemOf));
  const B = words(b).map(stemOf);
  let n = 0;
  for (const w of B) if (A.has(w)) n++;
  return n;
}

/* ---------- ตรวจรายข้อ ---------- */

function auditQ(file, id, q, part, raw) {
  const ch = q.choices || [];
  const a = q.answer;
  if (typeof a !== 'number' || !ch[a]) return;
  const ans = String(ch[a]);
  const e = q.explain || {};
  const stem = String(raw.stem || q.q || '');

  /* --- กฎ 1: บุพบทในวลีตายตัว --- */
  if (part === 5 || part === 6) {
    for (const [re, need] of FIXED_PREP) {
      if (re.test(stem)) {
        const hit = ch.findIndex((c) => String(c).trim().toLowerCase() === need);
        if (hit >= 0 && hit !== a) {
          flag('HIGH', file, id, 'fixed-prep',
            `โจทย์มีวลีตายตัวที่ต้องใช้ "${need}" (ตัวเลือก ${'ABCD'[hit]}) แต่เฉลยเป็น ${'ABCD'[a]}="${ans}"`);
        }
        break;
      }
    }
  }

  /* --- กฎ 2: คำบอกเวลาอดีตต้องคู่กับกริยาช่อง 2 --- */
  if ((part === 5 || part === 6) && PAST_MARKER.test(stem) && !AUX_BEFORE.test(stem)) {
    const lowers = ch.map((c) => String(c).trim().toLowerCase());
    // หาว่าตัวเลือกเป็นรูปผันของคำเดียวกันหรือไม่
    const roots = new Set(lowers.map((w) => w.replace(/(ing|ed|es|s)$/, '')));
    const oneLemma = roots.size <= 2 && lowers.every((w) => /^[a-z]+$/.test(w));
    if (oneLemma) {
      const pastIdx = lowers.findIndex((w, i) => {
        if (/ed$/.test(w)) return true;
        for (const base in IRREG) if (IRREG[base].includes(w)) return true;
        return false;
      });
      if (pastIdx >= 0 && pastIdx !== a) {
        flag('HIGH', file, id, 'past-marker',
          `โจทย์มีคำบอกเวลาอดีต แต่เฉลยเป็น ${'ABCD'[a]}="${ans}" ทั้งที่มีรูปอดีต ${'ABCD'[pastIdx]}="${ch[pastIdx]}"`);
      }
    }
  }

  /* --- กฎ 3: a / an ตามเสียงสระ --- */
  if (part === 5 || part === 6) {
    const lowers = ch.map((c) => String(c).trim().toLowerCase());
    if (lowers.includes('a') && lowers.includes('an')) {
      const m = /_{3,}\s+([A-Za-z]+)/.exec(stem);
      if (m) {
        const nxt = m[1].toLowerCase();
        const vowelSound = /^[aeiou]/.test(nxt) && !/^(uni|use|user|eu|one|once)/.test(nxt);
        const hSilent = /^(hour|honest|honor|heir)/.test(nxt);
        const need = vowelSound || hSilent ? 'an' : 'a';
        const wantIdx = lowers.indexOf(need);
        if (lowers[a] === 'a' || lowers[a] === 'an') {
          if (lowers[a] !== need) {
            flag('HIGH', file, id, 'article-an',
              `คำถัดจากช่องว่างคือ "${m[1]}" ควรใช้ "${need}" (ตัวเลือก ${'ABCD'[wantIdx]}) แต่เฉลยเป็น "${lowers[a]}"`);
          }
        }
      }
    }
  }

  /* --- กฎ 4: Part 2 คำถาม WH ต้องไม่ตอบ Yes/No --- */
  if (part === 2) {
    const p = String(raw.prompt || '').trim();
    if (WH_INFO.test(p) && !WH_EXCEPT.test(p) && YESNO_ANSWER.test(ans)) {
      flag('HIGH', file, id, 'wh-yesno',
        `คำถาม WH ("${p.slice(0, 40)}…") แต่เฉลยเป็นคำตอบ Yes/No: "${ans}"`);
    }
    // ตัวลวงที่ควรผิดแต่กลับไม่มีเหตุผลกำกับ
    ch.forEach((c, i) => {
      if (i === a) return;
      if (WH_INFO.test(p) && !WH_EXCEPT.test(p) && YESNO_ANSWER.test(String(c))) {
        const r = (e.wrong || {})[String(i)] || '';
        if (!/yes|no|ตอบรับ|ตอบว่าใช่|yes\/no|ใช่หรือไม่|ตอบใช่/i.test(r)) {
          flag('LOW', file, id, 'wh-yesno-reason',
            `ตัวลวง ${'ABCD'[i]} เป็น Yes/No กับคำถาม WH แต่คำอธิบายไม่ได้ชี้จุดนี้`);
        }
      }
    });
  }

  /* --- กฎ 5: Part 1 คำตอบต้องตรงกับภาพมากที่สุด --- */
  if (part === 1 && raw.sceneEn) {
    const scores = ch.map((c) => overlap(raw.sceneEn, c));
    const best = Math.max(...scores);
    if (scores[a] < best) {
      const better = scores.map((s, i) => [s, i]).filter(([s]) => s === best).map(([, i]) => 'ABCD'[i]);
      flag('MED', file, id, 'scene-match',
        `ตัวเลือก ${better.join('/')} ตรงกับคำบรรยายภาพมากกว่าเฉลย ${'ABCD'[a]} (${scores[a]} vs ${best}) — อาจสลับเฉลย`);
    }
  }

  /* --- กฎ 6: คำอธิบายอ้างถึงตัวเลือกอื่นแทนคำตอบ --- */
  if (e.why && ch.length >= 3) {
    const why = String(e.why).toLowerCase();
    const evid = String(e.evidence || '').toLowerCase();
    const cite = ch.map((c) => {
      const t = String(c).trim().toLowerCase();
      if (t.length < 2) return false;
      return why.includes(t) || evid.includes(t);
    });
    if (!cite[a] && cite.filter(Boolean).length === 1) {
      const other = cite.findIndex(Boolean);
      flag('HIGH', file, id, 'why-cites-other',
        `explain.why อ้างถึง "${ch[other]}" (${'ABCD'[other]}) แต่ไม่พูดถึงคำตอบ "${ans}" (${'ABCD'[a]})`);
    }
  }

  /* --- กฎ 7: เหตุผลของตัวลวงไปตรงกันกับคำตอบ --- */
  const w = e.wrong || {};
  for (const k in w) {
    const kk = Number(k);
    if (kk === a) continue;
    const txt = String(w[k]);
    if (txt.length < 15) flag('LOW', file, id, 'thin-reason', `เหตุผลของตัวลวง ${'ABCD'[kk]} สั้นเกินไป (${txt.length} ตัวอักษร)`);
  }

  /* --- กฎ 8: คำแปลไทยของตัวเลือกซ้ำกันหมด --- */
  const thc = (q.th && q.th.choices) || [];
  if (thc.length === ch.length && thc.length >= 3 && new Set(thc.map((x) => String(x).trim())).size === 1) {
    flag('LOW', file, id, 'th-choices-same', 'คำแปลไทยของทุกตัวเลือกเหมือนกันหมด แยกไม่ออกว่าต่างกันตรงไหน');
  }

  /* --- กฎ 9: ช่องว่างหายไปแต่เป็นข้อเติมคำ --- */
  if (part === 5 && !/_{3,}/.test(stem)) {
    flag('MED', file, id, 'no-blank', 'ข้อ Part 5 ไม่มีช่องว่างในโจทย์');
  }

  /* --- กฎ 10: ตัวเลือกยาวผิดปกติเทียบกันเอง (คำตอบเด่นเกินไป) --- */
  if (ch.length === 4) {
    const lens = ch.map((c) => String(c).length);
    const maxI = lens.indexOf(Math.max(...lens));
    const others = lens.filter((_, i) => i !== maxI);
    if (maxI === a && Math.max(...lens) > Math.max(...others) * 1.9 && Math.max(...lens) > 30) {
      flag('LOW', file, id, 'answer-longest', 'คำตอบยาวกว่าตัวลวงอื่นเกือบเท่าตัว เดาได้จากความยาว');
    }
  }
}

/* ---------- เดินไฟล์ ---------- */

function auditItem(file, it) {
  const part = Number(it.part);
  if (Array.isArray(it.questions)) {
    it.questions.forEach((q, i) => auditQ(file, `${it.id}#${i + 1}`, q, part, it));
  } else {
    auditQ(file, it.id, it, part, it);
  }
}

function run() {
  const files = [];
  for (const kind of ['drills', 'tests', 'lessons']) {
    const dir = path.join(DATA, kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      files.push([`${kind}/${f}`, path.join(dir, f)]);
    }
  }

  let total = 0;
  for (const [name, p] of files) {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
    for (const it of (obj.items || []).concat(obj.quiz || [])) {
      total += Array.isArray(it.questions) ? it.questions.length : 1;
      auditItem(name, it);
    }
  }

  /* ตรวจข้อซ้ำข้ามไฟล์ */
  const seen = new Map();
  for (const [name, p] of files) {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
    for (const it of (obj.items || []).concat(obj.quiz || [])) {
      const key = String(it.stem || it.prompt || (it.passage || '').slice(0, 80) || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || key.length < 15) continue;
      if (seen.has(key)) flag('MED', name, it.id, 'dup-stem', `โจทย์ซ้ำกับ ${seen.get(key)}`);
      else seen.set(key, `${name}:${it.id}`);
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ total, findings }, null, 1));
    return;
  }

  const bySev = { HIGH: [], MED: [], LOW: [] };
  findings.forEach((f) => bySev[f.sev].push(f));

  console.log(`\n🔍 ตรวจเชิงเนื้อหา ${total} ข้อ\n`);
  for (const sev of ['HIGH', 'MED', 'LOW']) {
    const list = bySev[sev];
    const label = { HIGH: '🔴 น่าจะเฉลยผิดจริง', MED: '🟠 น่าสงสัย', LOW: '🟡 คุณภาพ' }[sev];
    console.log(`${label} — ${list.length} รายการ`);
    const byRule = {};
    list.forEach((f) => (byRule[f.rule] = byRule[f.rule] || []).push(f));
    for (const r in byRule) {
      console.log(`   [${r}] ${byRule[r].length}`);
      byRule[r].slice(0, sev === 'LOW' ? 3 : 12).forEach((f) => console.log(`     · ${f.file} ${f.id}: ${f.msg}`));
      if (byRule[r].length > (sev === 'LOW' ? 3 : 12)) console.log(`     … อีก ${byRule[r].length - (sev === 'LOW' ? 3 : 12)} ข้อ`);
    }
    console.log('');
  }
  const hard = bySev.HIGH.length + bySev.MED.length;
  console.log(hard ? `⚠️ ต้องให้คนตรวจซ้ำ ${hard} ข้อ` : '✅ ไม่พบข้อที่น่าสงสัยว่าเฉลยผิด');
  process.exitCode = bySev.HIGH.length ? 1 : 0;
}

run();
