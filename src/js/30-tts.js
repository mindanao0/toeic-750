/* ============================================================
   30-tts — อ่านออกเสียงภาษาอังกฤษด้วยเสียงในเบราว์เซอร์ (Web Speech API)
   รองรับ 4 สำเนียงเหมือนข้อสอบจริง: US / UK / CA / AU

   จุดที่ตั้งใจทำให้ฟังเป็นธรรมชาติ:
   - ไม่อ่านตัวอักษร "(A)" ออกเสียง (เสียงสังเคราะห์อ่านวงเล็บเป็นคำ) แต่ไปไฮไลต์ตัวเลือกในหน้าจอแทน
   - เลือกเสียงคุณภาพสูงก่อน (Natural/Neural/Google) และหลบเสียง eSpeak ที่ฟังเป็นหุ่นยนต์
   - บทสนทนาใช้เสียงคนละคนจริงๆ สำหรับผู้ชาย/ผู้หญิง ไม่ใช่เสียงเดียวแล้วบิด pitch
   - จัดช่องว่างระหว่างประโยคให้เหมือนจังหวะข้อสอบจริง
   ============================================================ */
'use strict';

const LANG_OF = { US: 'en-US', UK: 'en-GB', CA: 'en-CA', AU: 'en-AU' };
const ACCENT_TH = { US: 'อเมริกัน', UK: 'อังกฤษ', CA: 'แคนาดา', AU: 'ออสเตรเลีย' };
const FALLBACK = { CA: ['en-US', 'en-GB'], AU: ['en-GB', 'en-US'], UK: ['en-US', 'en-AU'], US: ['en-GB', 'en-CA'] };

/* ชื่อเสียงที่รู้ว่าเป็นหญิง/ชาย ในระบบปฏิบัติการที่พบบ่อย */
const FEMALE = /(female|aria|jenny|zira|hazel|susan|catherine|linda|samantha|karen|moira|tessa|fiona|serena|kate|sonia|libby|michelle|natasha|clara|emily|joanna|salli|kimberly|ivy|amy|nicky|allison|ava|nora|luciana)/i;
const MALE = /(male|guy|david|mark|george|james|ryan|christopher|eric|steffan|alex|daniel|fred|rishi|oliver|thomas|gordon|liam|william|brian|matthew|justin|joey|arthur|tom|reed|roger)/i;
const GOOD_NAMES = /(natural|neural|google|siri|premium|enhanced|eloquence)/i;
const BAD_NAMES = /(espeak|festival|flite|pico|compact|robot)/i;

let voices = [];
let ready = false;
let readyWaiters = [];
let currentSeq = 0;
let onStateChange = null;
let lastCancelAt = 0;

const synth = () => window.speechSynthesis;
const normLang = (s) => String(s || '').replace('_', '-').toLowerCase();

function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/* ---------- โหลดรายการเสียง ---------- */

function loadVoices() {
  if (!supported()) return;
  const v = synth().getVoices() || [];
  if (!v.length) return;
  const en = v.filter((x) => /^en(-|_|$)/i.test(x.lang));
  voices = (en.length ? en : v).slice();
  ready = true;
  readyWaiters.splice(0).forEach((fn) => fn());
}

function whenReady() {
  return new Promise((res) => {
    if (ready || !supported()) return res();
    readyWaiters.push(res);
    setTimeout(res, 2000); // กันค้างถ้าเบราว์เซอร์ไม่ยิง event
  });
}

function init() {
  if (!supported()) return;
  loadVoices();
  if (synth().addEventListener) synth().addEventListener('voiceschanged', loadVoices);
  if ('onvoiceschanged' in synth()) synth().onvoiceschanged = loadVoices;
  // เบราว์เซอร์บางตัวคืนรายการเสียงหลัง gesture แรกเท่านั้น
  const kick = () => loadVoices();
  document.addEventListener('pointerdown', kick, { once: true });
  setTimeout(loadVoices, 400);
  setTimeout(loadVoices, 1500);
}

function listVoices() {
  return voices.slice();
}

/* ---------- ให้คะแนนคุณภาพเสียง ---------- */

function voiceScore(v) {
  let s = 0;
  const n = String(v.name || '');
  if (GOOD_NAMES.test(n)) s += 80;
  if (BAD_NAMES.test(n)) s -= 200;
  if (/google/i.test(n)) s += 20;
  if (v.default) s += 5;
  if (v.localService) s += 8; // ทำงานออฟไลน์ได้ ถือว่าดีกว่าเล็กน้อย
  return s;
}

function genderOf(v) {
  const n = String(v.name || '');
  if (FEMALE.test(n)) return 'W';
  if (MALE.test(n)) return 'M';
  return null;
}

/** เสียงทั้งหมดที่ตรงภาษาที่ต้องการ เรียงจากดีที่สุด */
function candidates(accent) {
  const st = App.Store.state();
  const acc = st.settings.accentMode === 'us' ? 'US' : accent || 'US';
  const chain = [LANG_OF[acc] || 'en-US'].concat(FALLBACK[acc] || ['en-US']);

  for (const lang of chain) {
    const hit = voices.filter((v) => normLang(v.lang) === lang.toLowerCase());
    if (hit.length) return hit.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
  }
  const anyEn = voices.filter((v) => normLang(v.lang).startsWith('en'));
  return (anyEn.length ? anyEn : voices).slice().sort((a, b) => voiceScore(b) - voiceScore(a));
}

/**
 * เลือกเสียงที่เหมาะกับสำเนียงและเพศผู้พูด
 * @param {string} accent US|UK|CA|AU
 * @param {string} [speaker] 'M' | 'W'
 */
function voiceFor(accent, speaker) {
  const st = App.Store.state();
  const acc = st.settings.accentMode === 'us' ? 'US' : accent || 'US';

  const pinned = st.settings.voiceMap && st.settings.voiceMap[acc];
  if (pinned) {
    const v = voices.find((x) => x.voiceURI === pinned);
    if (v) return v;
  }

  const list = candidates(acc);
  if (!list.length) return null;
  if (speaker === 'M' || speaker === 'W') {
    const match = list.find((v) => genderOf(v) === speaker);
    if (match) return match;
  }
  return list[0];
}

/** สำเนียงที่เครื่องนี้รองรับจริง + คุณภาพ */
function availableAccents() {
  const out = {};
  for (const a in LANG_OF) {
    const exact = voices
      .filter((v) => normLang(v.lang) === LANG_OF[a].toLowerCase())
      .sort((x, y) => voiceScore(y) - voiceScore(x));
    const best = exact[0] || null;
    out[a] = {
      ok: !!best,
      name: best ? best.name : null,
      quality: !best ? 'none' : voiceScore(best) >= 60 ? 'good' : voiceScore(best) <= -100 ? 'poor' : 'ok',
      count: exact.length,
    };
  }
  return out;
}

/** สรุปคุณภาพเสียงโดยรวมของเครื่องนี้ */
function quality() {
  if (!supported()) return { level: 'none', msg: 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน' };
  if (!voices.length) return { level: 'none', msg: 'ยังตรวจไม่พบเสียงในเครื่อง' };
  const best = Math.max(...voices.map(voiceScore));
  if (best >= 60) return { level: 'good', msg: 'เครื่องนี้มีเสียงคุณภาพสูง' };
  if (best <= -100) return {
    level: 'poor',
    msg: 'เครื่องนี้มีแต่เสียงสังเคราะห์พื้นฐาน (eSpeak) ซึ่งฟังเป็นหุ่นยนต์มาก — ' +
      'แนะนำให้เปิดแอปบนมือถือ (Android/iOS เสียงดีกว่ามาก) หรือใช้ Chrome ตอนต่อเน็ต',
  };
  return { level: 'ok', msg: 'เสียงในเครื่องใช้ได้ แต่ไม่ใช่เสียงคุณภาพสูงสุด' };
}

/* ---------- เตรียมข้อความให้อ่านออกเสียงได้ดี ---------- */

const ABBR = [
  [/\bMr\./g, 'Mister'], [/\bMrs\./g, 'Missus'], [/\bMs\./g, 'Miss'], [/\bDr\./g, 'Doctor'],
  [/\bSt\./g, 'Street'], [/\bAve\./g, 'Avenue'], [/\bRd\./g, 'Road'], [/\bDept\./g, 'Department'],
  [/\bInc\./g, 'Incorporated'], [/\bLtd\./g, 'Limited'], [/\bCo\./g, 'Company'], [/\bNo\./g, 'Number'],
  [/\ba\.m\./gi, 'A M'], [/\bp\.m\./gi, 'P M'], [/\bA\.M\./g, 'A M'], [/\bP\.M\./g, 'P M'],
  [/&/g, ' and '], [/#(\d)/g, 'number $1'], [/\$/g, ' dollars '],
];

function normalizeText(t) {
  let s = String(t == null ? '' : t);
  s = s.replace(/^\s*\(?[A-D]\)?[.)]\s+/, '');   // ตัด "(A) " / "A. " ที่หน้าประโยคออก
  s = s.replace(/\*\*/g, '').replace(/\[\[?\d+\]?\]/g, ' ');
  for (const [re, rep] of ABBR) s = s.replace(re, rep);
  s = s.replace(/\s+/g, ' ').trim();
  if (s && !/[.!?…]$/.test(s)) s += '.';
  return s;
}

/* ---------- เล่นเสียง ---------- */

function setState(playing) {
  if (onStateChange) onStateChange(playing);
}

function stop() {
  currentSeq++;
  try {
    synth().cancel();
    lastCancelAt = Date.now();
  } catch (e) {}
  setState(false);
}

function say(text, accent, opts) {
  return speakSeq([{ text, accent }], opts);
}

/**
 * พูดหลายบรรทัดต่อกัน
 * @param {Array<{text:string, accent?:string, sp?:string, gap?:number, choice?:number}>} lines
 * @param {{rate?:number, gap?:number, onLine?:(i:number, line:object)=>void, onDone?:Function}} opts
 */
function speakSeq(lines, opts) {
  opts = opts || {};
  if (!supported()) {
    App.toast('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน — กดดูสคริปต์แทนได้', 'bad');
    return Promise.resolve(false);
  }
  stop();
  const mySeq = ++currentSeq;
  const st = App.Store.state();
  const rate = opts.rate != null ? opts.rate : st.settings.ttsRate;

  // Chrome มีบั๊ก: cancel() แล้ว speak() ทันทีจะเงียบ — เว้นจังหวะสั้นๆ ก่อน
  const settle = Math.max(0, 140 - (Date.now() - lastCancelAt));

  return whenReady().then(
    () =>
      new Promise((resolve) => {
        setState(true);
        let i = 0;
        let watchdog = null;

        const finish = (ok) => {
          clearTimeout(watchdog);
          if (mySeq === currentSeq) setState(false);
          if (opts.onDone) opts.onDone(ok);
          resolve(ok);
        };

        const next = () => {
          if (mySeq !== currentSeq) return resolve(false);
          if (i >= lines.length) return finish(true);

          const ln = lines[i];
          const idx = i;
          i++;
          if (opts.onLine) opts.onLine(idx, ln);

          const text = normalizeText(ln.text);
          if (!text) return setTimeout(next, 40);

          const u = new SpeechSynthesisUtterance(text);
          const v = voiceFor(ln.accent, ln.sp);
          if (v) {
            u.voice = v;
            u.lang = v.lang;
          } else {
            u.lang = LANG_OF[ln.accent] || 'en-US';
          }
          u.rate = App.clamp(rate, 0.5, 2);
          u.volume = 1;
          // บิด pitch เฉพาะตอนที่หาเสียงคนละคนไม่ได้จริงๆ
          const sameVoiceClash = ln.sp && v && genderOf(v) !== ln.sp;
          u.pitch = sameVoiceClash ? (ln.sp === 'W' ? 1.18 : 0.86) : 1;

          let advanced = false;
          const go = () => {
            if (advanced) return;
            advanced = true;
            clearTimeout(watchdog);
            const gap = ln.gap != null ? ln.gap : opts.gap != null ? opts.gap : 320;
            setTimeout(next, gap);
          };
          u.onend = go;
          u.onerror = (e) => {
            if (e && (e.error === 'interrupted' || e.error === 'canceled')) return resolve(false);
            console.warn('tts error', e && e.error);
            go();
          };

          // กันเคสเบราว์เซอร์ไม่ยิง onend
          const est = 1200 + (text.length / Math.max(0.6, u.rate)) * 85;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            if (synth().speaking) {
              watchdog = setTimeout(go, 4000);
              return;
            }
            go();
          }, est + 2500);

          try {
            synth().speak(u);
          } catch (e) {
            console.warn(e);
            go();
          }
        };

        setTimeout(next, settle);
      }),
  );
}

/* ---------- สร้างรายการบรรทัดของแต่ละ Part ---------- */

/** Part 3/4 — บทสนทนา/บทพูด */
function linesOf(group) {
  const ls = (group.audio && group.audio.lines) || [];
  return ls.map((l, i) => ({
    text: l.text,
    accent: l.accent || 'US',
    sp: l.sp,
    gap: i === ls.length - 1 ? 0 : 230,   // จังหวะสลับคนพูดแบบธรรมชาติ
  }));
}

/**
 * Part 1 — 4 ประโยคเรียงกัน ไม่อ่านตัวอักษร A-D ออกเสียง (เหมือนข้อสอบจริง)
 * ใส่ choice ไว้ให้หน้าจอไฮไลต์ว่ากำลังอ่านตัวเลือกไหน
 */
function part1Lines(item) {
  const acc = item.accent || 'US';
  return item.choices.map((c, i) => ({ text: c, accent: acc, choice: i, gap: i === item.choices.length - 1 ? 0 : 620 }));
}

/** Part 2 — คำถาม แล้วเว้นจังหวะ แล้ว 3 ตัวเลือก */
function part2Lines(item) {
  const qa = item.promptAccent || 'US';
  const ca = item.choicesAccent || 'UK';
  return [{ text: item.prompt, accent: qa, sp: 'M', gap: 900 }].concat(
    item.choices.map((c, i) => ({
      text: c, accent: ca, sp: 'W', choice: i,
      gap: i === item.choices.length - 1 ? 0 : 620,
    })),
  );
}

Object.assign(App, {
  TTS: {
    init, supported, say, speakSeq, stop, listVoices, voiceFor, availableAccents, quality,
    linesOf, part1Lines, part2Lines, normalizeText, voiceScore, genderOf,
    ACCENT_TH, LANG_OF,
    set onState(fn) { onStateChange = fn; },
    get onState() { return onStateChange; },
  },
});
