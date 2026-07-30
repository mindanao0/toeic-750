/* ============================================================
   65-quiz — ตัวรันข้อสอบ
   โหมด practice = เฉลยทันทีทีละข้อ / โหมด exam = จับเวลา ไม่เฉลยระหว่างทำ
   ============================================================ */
'use strict';

const { h, esc } = App;
const U = App.UI;

let session = null;

/**
 * @param {{units:Array, mode:'practice'|'exam'|'review', title:string, sub?:string,
 *          timeLimitMs?:number, sections?:Array, onFinish:Function, onExit?:Function,
 *          autoAudio?:boolean, allowScript?:boolean}} cfg
 */
function start(cfg) {
  const flat = [];
  cfg.units.forEach((u, ui) => {
    u.qs.forEach((q, qi) => flat.push({ ui, qi, u, q }));
  });

  session = {
    cfg,
    units: cfg.units,
    flat,
    answers: {},        // qid -> chosen index
    times: {},          // qid -> ms
    flags: {},          // qid -> true
    revealed: {},       // qid -> true (practice)
    stepUnit: 0,        // exam: ดัชนี unit
    stepQ: 0,           // practice: ดัชนีใน flat
    startTs: Date.now(),
    qStartTs: Date.now(),
    audioPlayedFor: {}, // unitId -> true
    finished: false,
    deadline: cfg.timeLimitMs ? Date.now() + cfg.timeLimitMs : null,
  };
  App.go('#/quiz');
}

function active() {
  return session;
}

function exit(silent) {
  App.TTS.stop();
  const s = session;
  session = null;
  if (s && s.cfg.onExit && !silent) s.cfg.onExit();
}

/* ---------- หน้าจอหลัก ---------- */

function render(root) {
  if (!session) {
    root.appendChild(U.emptyState('🤔', 'ไม่มีชุดข้อสอบที่กำลังทำอยู่', h('button.btn.primary', { onclick: () => App.go('#/') }, 'กลับหน้าแรก')));
    return;
  }
  if (session.cfg.mode === 'exam') renderExam(root);
  else renderPractice(root);
}

/* ---------- โหมดฝึก: ทีละข้อ เฉลยทันที ---------- */

function renderPractice(root) {
  const s = session;
  const cur = s.flat[s.stepQ];
  if (!cur) return finish();

  const { u, q, qi } = cur;
  const revealed = !!s.revealed[q.qid];
  const chosen = s.answers[q.qid];
  const isFirstOfUnit = qi === 0;

  root.appendChild(
    U.topbar(
      s.cfg.title,
      `ข้อ ${s.stepQ + 1} จาก ${s.flat.length}`,
      h('button.btn.icon.ghost', { onclick: askExit, title: 'ออก' }, '✕'),
    ),
  );

  // แถบความคืบหน้า
  const done = s.flat.filter((f) => s.revealed[f.q.qid]).length;
  const nCorrect = s.flat.filter((f) => s.revealed[f.q.qid] && s.answers[f.q.qid] === f.q.answer).length;
  root.appendChild(
    h('div.row', { style: { marginBottom: '12px' } },
      h('span.bar.thin.grow', h('i', { style: { width: (s.stepQ / s.flat.length) * 100 + '%' } })),
      h('span.pill.ok', `✓ ${nCorrect}`),
      h('span.pill.bad', `✕ ${done - nCorrect}`)),
  );

  const card = h('div.qwrap');

  card.appendChild(
    h('div.qhead',
      h('span.tag', App.Score.PART_SHORT[u.part] || 'Part ' + u.part),
      U.tierPill(u.tier),
      u.topicTh ? h('span.tag', u.topicTh) : null),
  );

  // เสียง (Part 1-4)
  if (u.part <= 4) {
    const lines = audioLinesFor(u, q);
    const script = scriptLinesFor(u, q);
    const ab = U.audioBox(lines, {
      scriptLines: script,
      autoplay: isFirstOfUnit && !s.audioPlayedFor[u.id],
      hint: u.part <= 2 ? 'ตัวเลือกที่กำลังอ่านจะสว่างขึ้นให้เห็น' : 'กดฟังบทสนทนา',
      allowScript: s.cfg.allowScript !== false,
      onChoice: highlightChoice,
    });
    s.audioPlayedFor[u.id] = true;
    card.appendChild(ab.el);
    session.audioCtl = ab;
  }

  // ภาพ Part 1
  if (u.part === 1) {
    const sc = U.sceneEl(u.raw);
    if (sc) card.insertBefore(sc, card.querySelector('.audiobox'));
  }

  // บทความ Part 6/7
  const pg = U.passageEl(u.raw, { showThai: !!s.showThai });
  if (pg) card.appendChild(pg);

  // โจทย์
  if (u.part === 1) {
    card.appendChild(h('div.qstem', 'ฟังทั้ง 4 ประโยค แล้วเลือกข้อที่ตรงกับภาพมากที่สุด'));
  } else if (u.part === 2) {
    card.appendChild(h('div.qstem', 'ฟังคำถาม แล้วเลือกคำตอบที่เหมาะสมที่สุด'));
  } else if (u.part === 5) {
    card.appendChild(h('div.qstem', { html: U.stemHTML(q.q) }));
  } else if (u.part === 6) {
    card.appendChild(h('div.qstem', `ช่องว่างที่ ( ${q.blank} ) ควรเติมอะไร`));
  } else {
    card.appendChild(h('div.qstem', q.q));
  }

  if (s.showThai && u.part === 5 && u.raw.th && u.raw.th.stem) {
    card.appendChild(h('div.small.faint', { style: { marginTop: '-10px', marginBottom: '14px' } }, u.raw.th.stem));
  }
  if (s.showThai && q.th && q.th.q) {
    card.appendChild(h('div.small.faint', { style: { marginTop: '-10px', marginBottom: '14px' } }, q.th.q));
  }

  // ตัวเลือก
  const hideText = (u.part === 1 || u.part === 2) && !revealed;
  const chEl = U.choicesEl(q, {
    hideText,
    chosen,
    revealed,
    showThai: true,
    onPick: (i, ev) => pickPractice(i, ev),
  });
  if (s.hintOut != null && !revealed) {
    const btns = chEl.querySelectorAll('.choice');
    if (btns[s.hintOut]) {
      btns[s.hintOut].classList.add('dim');
      btns[s.hintOut].disabled = true;
    }
  }
  card.appendChild(chEl);

  // ปุ่มช่วยเหลือ
  if (!revealed && App.Store.state().settings.helpBtn) {
    const tools = h('div.row.wrap', { style: { marginTop: '12px', justifyContent: 'center' } });
    if (u.part >= 5 || u.part === 6 || u.part === 7) {
      tools.appendChild(h('button.btn.sm.ghost', {
        onclick: () => { s.showThai = !s.showThai; App.rerender(); },
      }, s.showThai ? '🇹🇭 ซ่อนคำแปล' : '🇹🇭 ดูคำแปล'));
    }
    if (s.hintOut == null && q.choices.length > 2) {
      tools.appendChild(h('button.btn.sm.ghost', {
        onclick: () => {
          const wrongs = q.choices.map((_, i) => i).filter((i) => i !== q.answer);
          s.hintOut = wrongs[Math.floor(Math.random() * wrongs.length)];
          App.toast('ตัดตัวเลือกที่ผิดออกให้ 1 ตัว');
          App.rerender();
        },
      }, '✂️ ตัดตัวเลือกผิด 1 ตัว'));
    }
    if (tools.children.length) card.appendChild(tools);
  }

  // เฉลย
  if (revealed) {
    card.appendChild(U.explainEl(q, chosen, u));
    const isLast = s.stepQ >= s.flat.length - 1;
    card.appendChild(
      h('div.row.mt',
        h('button.btn.ghost', { onclick: () => addNote(q.qid) }, '📝'),
        h('button.btn.primary.grow.lg', { onclick: nextPractice }, isLast ? 'ดูสรุปผล →' : 'ข้อต่อไป →')),
    );
  }

  root.appendChild(card);

  // คีย์ลัด
  bindKeys(q, revealed);
}

function pickPractice(i, ev) {
  const s = session;
  const cur = s.flat[s.stepQ];
  if (!cur || s.revealed[cur.q.qid]) return;
  s.answers[cur.q.qid] = i;
  s.revealed[cur.q.qid] = true;
  s.times[cur.q.qid] = Date.now() - s.qStartTs;
  App.TTS.stop();

  const ok = i === cur.q.answer;
  App.Store.addXP(ok ? App.Store.XP.correct : App.Store.XP.wrong, ev);
  App.rerender();
  setTimeout(() => {
    const exp = App.$('.exp');
    if (exp) exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
}

function nextPractice() {
  const s = session;
  s.hintOut = null;
  s.showThai = false;
  s.qStartTs = Date.now();
  if (s.stepQ >= s.flat.length - 1) return finish();
  s.stepQ++;
  App.scrollTop();
  App.rerender();
}

/* ---------- โหมดสอบ: ทีละชุด จับเวลา ไม่เฉลย ---------- */

let timerHandle = null;

function renderExam(root) {
  const s = session;
  const u = s.units[s.stepUnit];
  if (!u) return finish();

  root.appendChild(
    U.topbar('สอบเสมือนจริง', s.cfg.sub || '', h('button.btn.icon.ghost', { onclick: askExit, title: 'ออก' }, '✕')),
  );

  // ตัวจับเวลา
  const tEl = h('span.t', '—');
  const bar = h('div.timerbar',
    h('span', '⏱'),
    tEl,
    h('span.lbl.grow', s.cfg.sectionLabel || ''),
    h('button.btn.sm.ghost', { onclick: showPalette }, `📋 ${answeredCount()}/${s.flat.length}`));
  root.appendChild(bar);

  clearInterval(timerHandle);
  const tick = () => {
    if (!session || session.finished) return clearInterval(timerHandle);
    const left = s.deadline - Date.now();
    tEl.textContent = App.fmtDur(Math.max(0, left));
    bar.classList.toggle('low', left < 5 * 60000);
    if (left <= 0) {
      clearInterval(timerHandle);
      App.toast('หมดเวลา — ระบบส่งคำตอบให้อัตโนมัติ', 'bad');
      finish();
    }
  };
  tick();
  timerHandle = setInterval(tick, 1000);

  const card = h('div.qwrap');
  card.appendChild(
    h('div.qhead',
      h('span.tag', App.Score.PART_SHORT[u.part] || 'Part ' + u.part),
      h('span.faint', `ชุดที่ ${s.stepUnit + 1}/${s.units.length}`)),
  );

  if (u.part === 1) {
    const sc = U.sceneEl(u.raw);
    if (sc) card.appendChild(sc);
  }

  if (u.part <= 4) {
    const played = !!s.audioPlayedFor[u.id];
    const lines = audioLinesFor(u, u.qs[0]);
    const ab = U.audioBox(lines, {
      autoplay: !played,
      allowScript: false,
      playsLeft: 1,
      hint: played ? 'ข้อสอบจริงเปิดเสียงครั้งเดียว' : 'กำลังเล่น — ข้อสอบจริงเปิดครั้งเดียว',
      onChoice: highlightChoice,
    });
    s.audioPlayedFor[u.id] = true;
    card.appendChild(ab.el);
  }

  const pg = U.passageEl(u.raw, { showThai: false });
  if (pg) card.appendChild(pg);

  // หมายเหตุ: โหมดสอบต้อง **ไม่** เรียก rerender ตอนเลือกคำตอบ
  // เพราะ render() จะสั่งหยุดเสียง — ข้อสอบจริงเปิดเสียงครั้งเดียว ถ้าตัดกลางคันคือเสียทั้งชุด
  const paletteBtn = bar.querySelector('button');
  const refreshPalette = () => {
    paletteBtn.textContent = `📋 ${answeredCount()}/${s.flat.length}`;
  };

  u.qs.forEach((q, i) => {
    const wrap = h('div', { style: { marginBottom: '20px' } });
    let label;
    if (u.part === 1) label = 'ฟังแล้วเลือกข้อที่ตรงกับภาพ';
    else if (u.part === 2) label = 'เลือกคำตอบที่เหมาะสมที่สุด';
    else if (u.part === 5) label = null;
    else if (u.part === 6) label = `ช่องว่างที่ ( ${q.blank} )`;
    else label = q.q;

    if (u.part === 5) wrap.appendChild(h('div.qstem', { html: U.stemHTML(q.q) }));
    else wrap.appendChild(h('div.qstem', { style: { fontSize: '1rem' } }, `${i + 1}. ${label}`));

    const chEl = U.choicesEl(q, {
      hideText: u.part === 1 || u.part === 2,
      chosen: s.answers[q.qid],
      onPick: (ci) => {
        s.answers[q.qid] = ci;
        s.times[q.qid] = Date.now() - s.qStartTs;
        App.$$('.choice', chEl).forEach((b, k) => b.classList.toggle('sel', k === ci));
        refreshPalette();
      },
    });
    wrap.appendChild(chEl);

    const flagBtn = h('button.btn.sm.ghost', {
      onclick: () => {
        s.flags[q.qid] = !s.flags[q.qid];
        flagBtn.textContent = s.flags[q.qid] ? '🚩 ทำเครื่องหมายไว้' : '🏳️ ทำเครื่องหมายกลับมาดู';
      },
    }, s.flags[q.qid] ? '🚩 ทำเครื่องหมายไว้' : '🏳️ ทำเครื่องหมายกลับมาดู');
    wrap.appendChild(h('div.row', { style: { marginTop: '6px' } }, flagBtn));
    card.appendChild(wrap);
  });

  const isLast = s.stepUnit >= s.units.length - 1;
  card.appendChild(
    h('div.row.mt',
      h('button.btn.grow', { disabled: s.stepUnit === 0, onclick: () => { s.stepUnit--; App.scrollTop(); App.rerender(); } }, '← ก่อนหน้า'),
      isLast
        ? h('button.btn.primary.grow', { onclick: confirmSubmit }, 'ส่งคำตอบ')
        : h('button.btn.primary.grow', { onclick: () => { s.stepUnit++; s.qStartTs = Date.now(); App.scrollTop(); App.rerender(); } }, 'ถัดไป →')),
  );

  root.appendChild(card);
}

function answeredCount() {
  const s = session;
  return s.flat.filter((f) => s.answers[f.q.qid] != null).length;
}

function showPalette() {
  const s = session;
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '6px' } });
  s.flat.forEach((f, i) => {
    const ans = s.answers[f.q.qid] != null;
    const flag = s.flags[f.q.qid];
    grid.appendChild(
      h('button.btn.sm', {
        style: {
          padding: '7px 0',
          background: flag ? 'var(--warn-sf)' : ans ? 'var(--ok-sf)' : 'var(--card-2)',
          borderColor: flag ? 'var(--warn)' : ans ? 'var(--ok)' : 'var(--line)',
        },
        onclick: () => { s.stepUnit = f.ui; App.scrollTop(); App.rerender(); m.close(); },
      }, String(i + 1)),
    );
  });
  const m = App.modal(`ตอบแล้ว ${answeredCount()}/${s.flat.length}`, h('div', grid,
    h('div.small.faint.mt', '🟩 ตอบแล้ว · 🟨 ทำเครื่องหมายไว้ · ⬜ ยังไม่ตอบ')), [{ label: 'ปิด' }]);
}

function confirmSubmit() {
  const left = session.flat.length - answeredCount();
  if (left > 0) {
    App.confirmBox('ส่งคำตอบเลยไหม', `ยังไม่ได้ตอบอีก ${left} ข้อ ข้อที่ไม่ตอบจะนับเป็นผิด`, finish, 'ส่งเลย');
  } else {
    App.confirmBox('ส่งคำตอบ', 'ตรวจครบทุกข้อแล้ว ส่งคำตอบเลยไหม', finish, 'ส่งคำตอบ');
  }
}

/* ---------- ปิดท้าย ---------- */

function finish() {
  const s = session;
  if (!s || s.finished) return;
  s.finished = true;
  clearInterval(timerHandle);
  App.TTS.stop();

  const items = s.flat.map((f) => ({
    qid: f.q.qid,
    ch: s.answers[f.q.qid] != null ? s.answers[f.q.qid] : -1,
    ok: s.answers[f.q.qid] === f.q.answer,
    ms: s.times[f.q.qid] || 0,
    part: f.u.part,
    tier: f.u.tier,
    topic: f.u.topic,
    topicTh: f.u.topicTh,
  }));

  const result = {
    mode: s.cfg.mode,
    title: s.cfg.title,
    items,
    ms: Date.now() - s.startTs,
    units: s.units,
    answers: s.answers,
    byPart: App.Score.LISTEN_PARTS.concat(App.Score.READ_PARTS).reduce((o, p) => {
      const its = items.filter((i) => i.part === p);
      if (its.length) o[p] = { n: its.length, correct: its.filter((i) => i.ok).length };
      return o;
    }, {}),
  };

  const cb = s.cfg.onFinish;
  session = null;
  if (cb) cb(result);
}

function askExit() {
  const s = session;
  if (!s) return App.go('#/');
  const answered = s.flat.filter((f) => s.answers[f.q.qid] != null).length;
  if (!answered) {
    exit();
    return App.go(s.cfg.backTo || '#/');
  }
  App.confirmBox('ออกจากชุดนี้', `ทำไปแล้ว ${answered} ข้อ ถ้าออกตอนนี้ ${s.cfg.mode === 'exam' ? 'ผลสอบจะไม่ถูกบันทึก' : 'ระบบจะบันทึกเท่าที่ทำไปแล้ว'}`, () => {
    if (s.cfg.mode !== 'exam' && answered) {
      s.flat = s.flat.filter((f) => s.answers[f.q.qid] != null);
      finish();
    } else {
      const back = s.cfg.backTo || '#/';
      exit();
      App.go(back);
    }
  }, 'ออก');
}

function addNote(qid) {
  const st = App.Store.state();
  const ta = h('textarea', { rows: 4, placeholder: 'เช่น "ลืมว่า since ต้องใช้กับ present perfect"' });
  ta.value = st.notes[qid] || '';
  App.modal('โน้ตของข้อนี้', ta, [
    { label: 'ยกเลิก', kind: 'ghost' },
    {
      label: 'บันทึก', kind: 'primary',
      onclick: () => {
        if (ta.value.trim()) st.notes[qid] = ta.value.trim();
        else delete st.notes[qid];
        App.Store.save(true);
        App.toast('บันทึกโน้ตแล้ว', 'ok');
      },
    },
  ]);
}

/* ---------- ตัวช่วย ---------- */

/** ทำให้ตัวเลือกที่กำลังถูกอ่านออกเสียงสว่างขึ้น (แทนการอ่าน "(A)" ออกเสียง) */
function highlightChoice(i) {
  const btns = App.$$('.choices .choice');
  btns.forEach((b, k) => b.classList.toggle('speaking', i != null && k === i));
}

function audioLinesFor(u, q) {
  if (u.part === 1) return App.TTS.part1Lines(u.raw);
  if (u.part === 2) return App.TTS.part2Lines(u.raw);
  if (u.part === 3 || u.part === 4) return App.TTS.linesOf(u.raw);
  return [];
}

function scriptLinesFor(u, q) {
  if (u.part === 1) {
    const th = (u.raw.th && u.raw.th.choices) || [];
    return [{ en: '🖼 ' + (u.raw.sceneTh || ''), th: '' }].concat(
      u.raw.choices.map((c, i) => ({ en: `(${U.LETTERS[i]}) ${c}`, th: th[i] || '' })),
    );
  }
  if (u.part === 2) {
    const th = u.raw.th || {};
    return [{ en: 'Q: ' + u.raw.prompt, th: th.prompt || '' }].concat(
      u.raw.choices.map((c, i) => ({ en: `(${U.LETTERS[i]}) ${c}`, th: (th.choices || [])[i] || '' })),
    );
  }
  const ls = (u.raw.audio && u.raw.audio.lines) || [];
  const th = (u.raw.th && u.raw.th.lines) || [];
  return ls.map((l, i) => ({ sp: l.sp, en: l.text, th: th[i] || '' }));
}

function bindKeys(q, revealed) {
  if (App._quizKeyHandler) document.removeEventListener('keydown', App._quizKeyHandler);
  const fn = (e) => {
    if (!session || session.cfg.mode === 'exam') return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toUpperCase();
    if (!revealed) {
      const i = U.LETTERS.indexOf(k);
      if (i >= 0 && i < q.choices.length) { e.preventDefault(); pickPractice(i, e); }
      if (/^[1-4]$/.test(k) && Number(k) <= q.choices.length) { e.preventDefault(); pickPractice(Number(k) - 1, e); }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextPractice();
    }
    if (k === 'R' && session) {
      const b = App.$('.audiobox .big');
      if (b) b.click();
    }
  };
  App._quizKeyHandler = fn;
  document.addEventListener('keydown', fn);
}

Object.assign(App, { Quiz: { start, render, active, exit, finish } });
