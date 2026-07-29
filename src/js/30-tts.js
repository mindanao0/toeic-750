/* ============================================================
   30-tts — อ่านออกเสียงภาษาอังกฤษด้วยเสียงในเบราว์เซอร์ (Web Speech API)
   รองรับ 4 สำเนียงเหมือนข้อสอบจริง: US / UK / CA / AU
   ============================================================ */
'use strict';

const LANG_OF = { US: 'en-US', UK: 'en-GB', CA: 'en-CA', AU: 'en-AU' };
const ACCENT_TH = { US: 'อเมริกัน', UK: 'อังกฤษ', CA: 'แคนาดา', AU: 'ออสเตรเลีย' };
const FALLBACK = { CA: ['en-US', 'en-GB'], AU: ['en-GB', 'en-US'], UK: ['en-US'], US: ['en-GB'] };

let voices = [];
let ready = false;
let readyWaiters = [];
let currentSeq = 0;
let onStateChange = null;

const synth = () => window.speechSynthesis;

function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function loadVoices() {
  if (!supported()) return;
  const v = synth().getVoices() || [];
  if (v.length) {
    voices = v.filter((x) => /^en(-|_|$)/i.test(x.lang));
    if (!voices.length) voices = v;
    ready = true;
    readyWaiters.splice(0).forEach((fn) => fn());
  }
}

function whenReady() {
  return new Promise((res) => {
    if (ready || !supported()) return res();
    readyWaiters.push(res);
    setTimeout(res, 1600); // กันค้างถ้าเบราว์เซอร์ไม่ยิง event
  });
}

function init() {
  if (!supported()) return;
  loadVoices();
  synth().addEventListener?.('voiceschanged', loadVoices);
  if ('onvoiceschanged' in synth()) synth().onvoiceschanged = loadVoices;
  // iOS/Safari บางรุ่นต้องกระตุ้นครั้งแรกด้วย gesture
  const kick = () => {
    loadVoices();
    document.removeEventListener('pointerdown', kick);
  };
  document.addEventListener('pointerdown', kick, { once: true });
}

function listVoices() {
  return voices.slice();
}

/** เลือกเสียงที่เหมาะกับสำเนียง โดยเคารพเสียงที่ผู้ใช้ตั้งเองไว้ */
function voiceFor(accent) {
  const st = App.Store.state();
  const acc = st.settings.accentMode === 'us' ? 'US' : accent || 'US';
  const pinned = st.settings.voiceMap && st.settings.voiceMap[acc];
  if (pinned) {
    const v = voices.find((x) => x.voiceURI === pinned);
    if (v) return v;
  }
  const want = LANG_OF[acc] || 'en-US';
  const norm = (s) => String(s || '').replace('_', '-').toLowerCase();

  let v = voices.find((x) => norm(x.lang) === want.toLowerCase() && x.localService);
  if (!v) v = voices.find((x) => norm(x.lang) === want.toLowerCase());
  if (!v) {
    for (const fb of FALLBACK[acc] || ['en-US']) {
      v = voices.find((x) => norm(x.lang) === fb.toLowerCase());
      if (v) break;
    }
  }
  if (!v) v = voices.find((x) => norm(x.lang).startsWith('en'));
  return v || voices[0] || null;
}

/** สำเนียงที่เครื่องนี้รองรับจริง */
function availableAccents() {
  const out = {};
  for (const a in LANG_OF) {
    const v = voices.find((x) => String(x.lang).replace('_', '-').toLowerCase() === LANG_OF[a].toLowerCase());
    out[a] = { ok: !!v, name: v ? v.name : null };
  }
  return out;
}

function stop() {
  currentSeq++;
  try { synth().cancel(); } catch (e) {}
  setState(false);
}

function setState(playing) {
  if (onStateChange) onStateChange(playing);
}

/** พูดข้อความเดียว */
function say(text, accent, opts) {
  return speakSeq([{ text, accent }], opts);
}

/**
 * พูดหลายบรรทัดต่อกัน (ใช้กับ Part 3/4)
 * @param {Array<{text:string, accent?:string}>} lines
 * @param {{rate?:number, gap?:number, onLine?:(i:number)=>void}} opts
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

  return whenReady().then(
    () =>
      new Promise((resolve) => {
        setState(true);
        let i = 0;
        let watchdog = null;

        const finish = (okDone) => {
          clearTimeout(watchdog);
          if (mySeq === currentSeq) setState(false);
          resolve(okDone);
        };

        const next = () => {
          if (mySeq !== currentSeq) return resolve(false);
          if (i >= lines.length) return finish(true);
          const ln = lines[i];
          const idx = i;
          i++;
          if (opts.onLine) opts.onLine(idx);

          const u = new SpeechSynthesisUtterance(String(ln.text || '').trim());
          const v = voiceFor(ln.accent);
          if (v) {
            u.voice = v;
            u.lang = v.lang;
          } else {
            u.lang = LANG_OF[ln.accent] || 'en-US';
          }
          u.rate = App.clamp(rate, 0.5, 2);
          u.pitch = ln.pitch != null ? ln.pitch : ln.sp === 'W' ? 1.12 : ln.sp === 'M' ? 0.9 : 1;
          u.volume = 1;

          let advanced = false;
          const go = () => {
            if (advanced) return;
            advanced = true;
            clearTimeout(watchdog);
            const gap = opts.gap != null ? opts.gap : 380;
            setTimeout(next, gap);
          };
          u.onend = go;
          u.onerror = (e) => {
            if (e && e.error === 'interrupted') return resolve(false);
            console.warn('tts error', e);
            go();
          };

          // กันเคสเบราว์เซอร์ไม่ยิง onend (พบใน Chrome บางเวอร์ชัน)
          const est = 900 + (String(ln.text || '').length / Math.max(0.6, u.rate)) * 78;
          clearTimeout(watchdog);
          watchdog = setTimeout(go, est + 3500);

          try {
            synth().speak(u);
          } catch (e) {
            console.warn(e);
            go();
          }
        };
        next();
      }),
  );
}

/** แปลง group ของ Part 3/4 เป็นรายการบรรทัดสำหรับอ่าน */
function linesOf(group) {
  const ls = (group.audio && group.audio.lines) || [];
  return ls.map((l) => ({ text: l.text, accent: l.accent || 'US', sp: l.sp }));
}

/** สร้างรายการบรรทัดของ Part 1 (ตัวเลือก A–D) */
function part1Lines(item) {
  const acc = item.accent || 'US';
  return item.choices.map((c, i) => ({ text: `(${'ABCD'[i]})  ${c}`, accent: acc }));
}

/** สร้างรายการบรรทัดของ Part 2 (คำถาม + 3 ตัวเลือก) */
function part2Lines(item) {
  const qa = item.promptAccent || 'US';
  const ca = item.choicesAccent || 'UK';
  return [{ text: item.prompt, accent: qa }].concat(
    item.choices.map((c, i) => ({ text: `(${'ABC'[i]})  ${c}`, accent: ca })),
  );
}

Object.assign(App, {
  TTS: {
    init, supported, say, speakSeq, stop, listVoices, voiceFor, availableAccents,
    linesOf, part1Lines, part2Lines,
    ACCENT_TH, LANG_OF,
    set onState(fn) { onStateChange = fn; },
    get onState() { return onStateChange; },
  },
});
