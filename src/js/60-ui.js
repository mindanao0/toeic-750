/* ============================================================
   60-ui — ชิ้นส่วนหน้าจอที่ใช้ร่วมกัน (โจทย์, เฉลย, กราฟ, เสียง)
   ============================================================ */
'use strict';

const { h, esc, mdBold } = App;
const LETTERS = 'ABCDEFGH';

/* ---------- แถบหัวข้อ ---------- */

function topbar(title, sub, right) {
  return h(
    'div.topbar',
    h('div.grow', h('h1', title), sub ? h('div.sub', sub) : null),
    right || null,
  );
}

function backBtn(to) {
  return h('button.btn.icon.ghost', { onclick: () => (to ? App.go(to) : history.back()), title: 'ย้อนกลับ' }, '←');
}

/* ---------- เสียง ---------- */

/**
 * กล่องเล่นเสียง
 * @param {Array} lines รายการบรรทัดสำหรับ TTS
 * @param {{scriptLines?:Array<{sp?:string,en:string,th?:string}>, hint?:string,
 *          autoplay?:boolean, allowScript?:boolean, onPlayed?:Function, playsLeft?:number}} opt
 */
function audioBox(lines, opt) {
  opt = opt || {};
  let playing = false;
  let plays = 0;

  const btn = h('button.big', { title: 'เล่นเสียง' }, '▶');
  const hint = h('div.hint', opt.hint || 'กดเพื่อฟัง');
  const scriptWrap = h('div.hidden');
  const box = h('div.audiobox', btn, hint);

  const limited = opt.playsLeft != null && opt.playsLeft > 0;

  const setPlaying = (p) => {
    playing = p;
    btn.textContent = p ? '■' : '▶';
    btn.classList.toggle('playing', p);
    if (!p && opt.onChoice) opt.onChoice(null);
  };

  const play = () => {
    if (playing) {
      App.TTS.stop();
      setPlaying(false);
      return;
    }
    if (limited && plays >= opt.playsLeft) {
      App.toast(`โหมดนี้ฟังได้ ${opt.playsLeft} ครั้ง`, 'bad');
      return;
    }
    plays++;
    setPlaying(true);
    App.TTS.speakSeq(lines, {
      onLine: (i, ln) => {
        const el = scriptWrap.querySelectorAll('.ln')[i];
        App.$$('.ln', scriptWrap).forEach((x) => (x.style.background = ''));
        if (el) el.style.background = 'var(--brand-sf)';
        // ไฮไลต์ตัวเลือกที่กำลังอ่าน (แทนการอ่านตัวอักษร A-D ออกเสียง)
        if (opt.onChoice) opt.onChoice(ln && ln.choice != null ? ln.choice : null);
      },
    }).then(() => {
      setPlaying(false);
      App.$$('.ln', scriptWrap).forEach((x) => (x.style.background = ''));
      if (opt.onPlayed) opt.onPlayed(plays);
      if (limited) {
        const left = opt.playsLeft - plays;
        hint.textContent = left > 0 ? `ฟังได้อีก ${left} ครั้ง` : 'ครบจำนวนครั้งที่ฟังได้แล้ว';
      }
    });
  };

  btn.addEventListener('click', play);

  const tools = h('div.row', { style: { justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' } });

  // ปรับความเร็ว
  const rates = [0.8, 0.95, 1.1, 1.25];
  const st = App.Store.state();
  const rateBtn = h(
    'button.btn.sm.ghost',
    {
      onclick: () => {
        const cur = st.settings.ttsRate;
        let i = rates.findIndex((r) => Math.abs(r - cur) < 0.03);
        i = (i + 1) % rates.length;
        st.settings.ttsRate = rates[i];
        App.Store.save();
        rateBtn.textContent = `⚡ ${rates[i]}x`;
        App.toast(`ความเร็วเสียง ${rates[i]}x`);
      },
    },
    `⚡ ${st.settings.ttsRate}x`,
  );
  tools.appendChild(rateBtn);

  if (opt.allowScript !== false && opt.scriptLines && opt.scriptLines.length) {
    const sBtn = h(
      'button.btn.sm.ghost',
      {
        onclick: () => {
          const showing = !scriptWrap.classList.contains('hidden');
          scriptWrap.classList.toggle('hidden', showing);
          sBtn.textContent = showing ? '📄 ดูสคริปต์' : '📄 ซ่อนสคริปต์';
        },
      },
      '📄 ดูสคริปต์',
    );
    tools.appendChild(sBtn);

    const inner = h('div.script-box');
    for (const l of opt.scriptLines) {
      inner.appendChild(
        h(
          'div.ln',
          l.sp ? h('span.sp', (l.sp === 'W' ? '👩 ' : l.sp === 'M' ? '👨 ' : '') ) : null,
          h('span', l.en),
          l.th ? h('span.th', l.th) : null,
        ),
      );
    }
    scriptWrap.appendChild(inner);
  }

  box.appendChild(tools);
  box.appendChild(scriptWrap);

  if (opt.autoplay) setTimeout(play, 420);
  return { el: box, play, stop: () => { App.TTS.stop(); setPlaying(false); }, revealScript: () => scriptWrap.classList.remove('hidden') };
}

/* ---------- เนื้อหาร่วมของ unit (ภาพ / บทความ) ---------- */

function stemHTML(text) {
  return esc(text).replace(/_{3,}/g, '<span class="blank">_____</span>');
}

/**
 * กล่องภาพของ Part 1
 * inline SVG ที่มีแต่ viewBox จะสูงเป็น 0 บน Safari/iOS ถ้าใช้ height:auto
 * จึงต้องกำหนดอัตราส่วนที่กล่องครอบ และบังคับให้ svg เต็มกล่อง
 */
function sceneEl(raw) {
  if (!raw.svg) return null;
  const clean = sanitizeSVG(raw.svg);

  const vb = /viewBox\s*=\s*["']\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(clean);
  const vw = vb ? parseFloat(vb[3]) : 400;
  const vh = vb ? parseFloat(vb[4]) : 300;
  const ratio = vh > 0 && vw > 0 ? vh / vw : 0.75;

  const box = h('div.scene-box', {
    style: { aspectRatio: `${vw} / ${vh}`, '--ar-pad': (ratio * 100).toFixed(3) + '%' },
  });
  box.innerHTML = clean;

  const svg = box.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    if (!svg.getAttribute('preserveAspectRatio')) svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('style');
  } else {
    // กันกรณี SVG เสียจนเบราว์เซอร์ parse ไม่ได้
    box.textContent = '';
    box.appendChild(h('div.scene-fail', '⚠️ แสดงภาพไม่ได้'));
  }

  return h('div.scene', box);
}

/** ตัดสิ่งที่ไม่ปลอดภัย/ไม่อนุญาตออกจาก SVG ที่มาจากคลังเนื้อหา */
function sanitizeSVG(svg) {
  let s = String(svg);
  s = s.replace(/<\s*(script|foreignObject|style|image|use|iframe)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|foreignObject|style|image|use|iframe)[^>]*\/?>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return s;
}

function passageEl(raw, opts) {
  opts = opts || {};
  const wrap = h('div');

  // Part 6 — บทความเดียวมีช่องว่าง
  if (raw.part === 6 && raw.passage) {
    const p = h('div.passage');
    if (raw.docType) p.appendChild(h('span.p-kind', docKindTh(raw.docType)));
    const body = h('div');
    body.innerHTML = esc(raw.passage).replace(/\[\[(\d+)\]\]/g, (m, n) => `<span class="mark" data-blank="${n}">( ${n} )</span>`);
    p.appendChild(body);
    if (opts.showThai && raw.th && raw.th.passage) p.appendChild(h('div.th-tr', raw.th.passage));
    wrap.appendChild(p);
    return wrap;
  }

  // Part 7 — หนึ่งถึงสามบทความ
  if (raw.part === 7 && Array.isArray(raw.passages)) {
    raw.passages.forEach((pg, i) => {
      const p = h('div.passage');
      p.appendChild(h('span.p-kind', `${raw.passages.length > 1 ? 'เอกสารที่ ' + (i + 1) + ' · ' : ''}${docKindTh(pg.kind)}`));
      if (pg.header && Object.keys(pg.header).length) {
        const hd = h('div.p-head');
        for (const k in pg.header) hd.appendChild(h('div', h('b', k + ': '), pg.header[k]));
        p.appendChild(hd);
      }
      const body = h('div');
      body.innerHTML = esc(pg.body || '').replace(/\[(\d)\]/g, (m, n) => `<span class="mark">[${n}]</span>`);
      p.appendChild(body);
      const thP = raw.th && raw.th.passages && raw.th.passages[i];
      if (opts.showThai && thP && thP.body) p.appendChild(h('div.th-tr', thP.body));
      wrap.appendChild(p);
    });
    return wrap;
  }

  return null;
}

const DOC_KIND_TH = {
  email: 'อีเมล', letter: 'จดหมาย', notice: 'ประกาศ', advertisement: 'โฆษณา',
  article: 'บทความ', memo: 'บันทึกภายใน', form: 'แบบฟอร์ม', invoice: 'ใบแจ้งหนี้',
  schedule: 'ตารางเวลา', chat: 'แชท', receipt: 'ใบเสร็จ', webpage: 'หน้าเว็บ',
  report: 'รายงาน', review: 'รีวิว',
};
const docKindTh = (k) => DOC_KIND_TH[k] || k || 'เอกสาร';

/* ---------- ตัวเลือก ---------- */

/**
 * @param {object} q คำถาม (จาก unit.qs[i])
 * @param {{hideText?:boolean, chosen?:number, revealed?:boolean, showThai?:boolean,
 *          onPick?:(i:number, ev:Event)=>void, disabled?:boolean}} o
 */
function choicesEl(q, o) {
  o = o || {};
  const wrap = h('div.choices');
  const thc = (q.th && q.th.choices) || [];

  q.choices.forEach((c, i) => {
    const cls = ['choice'];
    if (o.revealed) {
      if (i === q.answer) cls.push('right');
      else if (i === o.chosen) cls.push('wrong');
      else cls.push('dim');
    } else if (o.chosen === i) cls.push('sel');

    const showText = !o.hideText || o.revealed;
    const btn = h(
      'button',
      { disabled: o.disabled || o.revealed ? true : false },
      h('span.k', LETTERS[i]),
      h(
        'span.c-tx',
        showText ? c : h('span.faint', '(ฟังจากเสียง)'),
        o.revealed && o.showThai && thc[i] ? h('span.c-th', thc[i]) : null,
      ),
    );
    btn.className = cls.join(' ');
    if (!o.disabled && !o.revealed && o.onPick) btn.addEventListener('click', (ev) => o.onPick(i, ev));
    wrap.appendChild(btn);
  });
  return wrap;
}

/* ---------- เฉลย ---------- */

function explainEl(q, chosen, unit) {
  const ok = chosen === q.answer;
  const e = q.explain || {};
  const box = h('div.exp');

  box.appendChild(
    h(
      'div.exp-head.' + (ok ? 'ok' : 'bad'),
      h('span', ok ? '✅' : '❌'),
      h('span', ok ? 'ถูกต้อง!' : `ผิด — คำตอบคือ ${LETTERS[q.answer]}`),
      h('span.spacer', { style: { flex: '1' } }),
      h('span.tag', `ตอบ ${LETTERS[q.answer]}`),
    ),
  );

  const body = h('div.exp-body');

  if (unit && unit.raw && unit.raw.part === 1 && unit.raw.sceneTh) {
    body.appendChild(sec('🖼', 'ในภาพคืออะไร', unit.raw.sceneTh));
  }

  if (q.th && q.th.q) {
    body.appendChild(sec('📄', 'คำแปลโจทย์', q.th.q));
  } else if (unit && unit.raw && unit.raw.th && unit.raw.th.stem) {
    body.appendChild(sec('📄', 'คำแปลโจทย์', unit.raw.th.stem));
  } else if (unit && unit.raw && unit.raw.th && unit.raw.th.prompt) {
    body.appendChild(sec('📄', 'คำแปลคำถาม', unit.raw.th.prompt));
  }

  if (e.why) body.appendChild(sec('💡', 'ทำไมตอบข้อนี้', e.why));

  if (e.evidence) {
    body.appendChild(
      h('div.exp-sec',
        h('div.lbl', '🔍 ประโยคที่เป็นหลักฐานในบทความ'),
        h('p', { style: { fontStyle: 'italic', color: 'var(--tx-dim)' } }, '"' + e.evidence + '"')),
    );
  }

  if (e.wrong && Object.keys(e.wrong).length) {
    const w = h('div.exp-wrong');
    Object.keys(e.wrong)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((k) => {
        w.appendChild(h('div.w', h('b', LETTERS[Number(k)] + ')'), h('span', e.wrong[k])));
      });
    body.appendChild(h('div.exp-sec', h('div.lbl', '✂️ ทำไมข้ออื่นผิด'), w));
  }

  if (e.point) {
    body.appendChild(
      h('div.exp-point', h('div.lbl', '📌 จุดที่ข้อนี้วัด'), h('p', e.point)),
    );
  }
  if (e.trick) {
    body.appendChild(
      h('div.exp-trick', h('div.lbl', '⚡ เทคนิคตอบเร็ว'), h('p', e.trick)),
    );
  }

  const vocab = (unit && unit.raw && unit.raw.vocab) || [];
  if (vocab.length) {
    const vw = h('div');
    vocab.forEach((v) => vw.appendChild(vocabChip(v)));
    body.appendChild(h('div.exp-sec', h('div.lbl', '📚 ศัพท์ที่ควรเก็บ (กดเพื่อฟัง)'), vw));
  }

  box.appendChild(body);
  return box;

  function sec(icon, label, text) {
    return h('div.exp-sec', h('div.lbl', `${icon} ${label}`), h('p', text));
  }
}

function vocabChip(v) {
  const el = h(
    'div.vocab-chip',
    { onclick: () => App.TTS.say(v.w, 'US') },
    h('b', v.w + ' 🔊'),
    v.ipa || v.th ? h('span.ph', { html: [v.ipa ? esc(v.ipa) : '', v.th ? mdBold(v.th) : ''].filter(Boolean).join(' · ') }) : null,
    h('span.mn', (v.pos ? v.pos + ' ' : '') + (v.mean || '')),
  );
  return el;
}

/* ---------- กราฟ (SVG เขียนเอง ไม่พึ่งไลบรารีภายนอก) ---------- */

function lineChart(points, opt) {
  opt = opt || {};
  const W = opt.w || 640, H = opt.h || 210;
  const pad = { l: 40, r: 12, t: 14, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

  if (!points.length) return h('div.empty', 'ยังไม่มีข้อมูลพอจะวาดกราฟ — ทำข้อสอบสัก 20 ข้อก่อน');

  const ys = points.map((p) => p.y);
  const lo = opt.min != null ? opt.min : Math.min(...ys, 200) - 20;
  const hi = opt.max != null ? opt.max : Math.max(...ys, 800) + 20;
  const X = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v) => pad.t + ih - ((App.clamp(v, lo, hi) - lo) / (hi - lo)) * ih;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.style.minWidth = Math.min(W, 640) + 'px';

  const mk = (n, at) => {
    const e = document.createElementNS(NS, n);
    for (const k in at) e.setAttribute(k, at[k]);
    return e;
  };

  // เส้นกริดแนวนอน
  const ticks = opt.ticks || [200, 400, 600, 750, 900];
  ticks.forEach((t) => {
    if (t < lo || t > hi) return;
    svg.appendChild(mk('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': t === 750 ? '5 3' : '' }));
    const tx = mk('text', { x: 4, y: Y(t) + 4, fill: t === 750 ? 'var(--ok)' : 'var(--tx-faint)', 'font-size': 10 });
    tx.textContent = t;
    svg.appendChild(tx);
  });

  // พื้นที่ใต้เส้น
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  svg.appendChild(mk('path', {
    d: `${d} L${X(points.length - 1).toFixed(1)},${pad.t + ih} L${X(0).toFixed(1)},${pad.t + ih} Z`,
    fill: 'var(--brand)', opacity: .12,
  }));
  svg.appendChild(mk('path', { d, fill: 'none', stroke: 'var(--brand)', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  points.forEach((p, i) => {
    svg.appendChild(mk('circle', { cx: X(i), cy: Y(p.y), r: 3.6, fill: 'var(--brand)', stroke: 'var(--bg)', 'stroke-width': 1.5 }));
    if (points.length <= 12 || i === 0 || i === points.length - 1) {
      const tx = mk('text', { x: X(i), y: H - 8, fill: 'var(--tx-faint)', 'font-size': 9, 'text-anchor': 'middle' });
      tx.textContent = p.label || '';
      svg.appendChild(tx);
    }
  });

  const wrap = h('div.chart');
  wrap.appendChild(svg);
  return wrap;
}

function hbars(rows) {
  const wrap = h('div.hbar');
  rows.forEach((r) => {
    const p = App.clamp(r.pct, 0, 100);
    const color = r.color || (p >= 75 ? 'var(--ok)' : p >= 50 ? 'var(--brand)' : p >= 30 ? 'var(--warn)' : 'var(--bad)');
    wrap.appendChild(
      h('div.r',
        h('span.lb', r.label),
        h('span.tr', h('i', { style: { width: p + '%', background: color } })),
        h('span.vl', r.value != null ? r.value : p + '%')),
    );
  });
  return wrap;
}

/** ปฏิทินความสม่ำเสมอ 30 วัน */
function streakGrid(startDate, studyDates) {
  const set = new Set(studyDates);
  const wrap = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '5px' } });
  for (let i = 0; i < 30; i++) {
    const d = App.addDays(startDate, i);
    const isPast = App.daysBetween(d, App.today()) >= 0;
    const done = set.has(d);
    const el = h('div', {
      title: `วันที่ ${i + 1} · ${App.thaiDate(d)}${done ? ' · เรียนแล้ว' : ''}`,
      style: {
        aspectRatio: '1',
        borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '.66rem', fontWeight: '700',
        background: done ? 'var(--ok)' : isPast ? 'var(--bad-sf)' : 'var(--card-2)',
        color: done ? '#fff' : isPast ? 'var(--bad)' : 'var(--tx-faint)',
        border: d === App.today() ? '2px solid var(--brand)' : '1px solid var(--line)',
      },
    }, String(i + 1));
    wrap.appendChild(el);
  }
  return wrap;
}

/* ---------- โครงหน้าจอ ---------- */

function view(...kids) {
  const f = document.createDocumentFragment();
  kids.forEach((k) => k && f.appendChild(k));
  return f;
}

function emptyState(icon, msg, action) {
  return h('div.empty', h('span.big', icon), h('div', { html: msg }), action ? h('div.mt', action) : null);
}

function tierPill(tier) {
  const m = { easy: ['ง่าย', 'ok'], medium: ['กลาง', 'warn'], real: ['ระดับจริง', 'bad'] };
  const x = m[tier] || ['—', ''];
  return h('span.pill.' + x[1], x[0]);
}

Object.assign(App, {
  UI: {
    topbar, backBtn, audioBox, sceneEl, passageEl, choicesEl, explainEl,
    vocabChip, lineChart, hbars, streakGrid, view, emptyState, stemHTML,
    tierPill, sanitizeSVG, docKindTh, LETTERS,
  },
});
