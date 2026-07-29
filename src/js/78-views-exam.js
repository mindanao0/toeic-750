/* ============================================================
   78-views-exam — สอบเสมือนจริง (จับเวลา 2 ชม.) + ทดสอบจัดระดับ
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

const LISTEN_MS = 45 * 60 * 1000;
const READ_MS = 75 * 60 * 1000;

/* ---------- หน้าเลือกชุดสอบ ---------- */

App.Views.exam = function (root) {
  const st = App.Store.state();
  root.appendChild(U.topbar('สอบเสมือนจริง', 'ฟัง 45 นาที + อ่าน 75 นาที เหมือนสนามจริง'));

  const tests = App.Data.testList().filter((n) => n !== 'placement').sort();
  if (!tests.length) {
    root.appendChild(U.emptyState('⏳',
      'ชุดสอบเต็มกำลังจัดทำ<br><span class="small">ระหว่างนี้ฝึกรายส่วนที่หน้า "ฝึกทำ" ไปก่อนได้</span>',
      h('button.btn.primary', { onclick: () => App.go('#/drill') }, 'ไปหน้าฝึกทำ')));
    return;
  }

  root.appendChild(h('div.card', { style: { borderColor: 'var(--warn)' } },
    h('div.b', '⏱ ก่อนเริ่ม'),
    h('ul.small.muted', { style: { margin: '8px 0 0', paddingLeft: '18px', lineHeight: '1.9' } },
      h('li', 'เตรียมหูฟัง เสียงเปิดครั้งเดียวเหมือนสอบจริง'),
      h('li', 'หาเวลาว่างต่อเนื่อง 2 ชั่วโมง ห้ามหยุดกลางคัน'),
      h('li', 'ไม่มีเฉลยระหว่างทำ — จะเฉลยทั้งหมดตอนจบ'),
      h('li', 'ถ้าออกกลางคัน ผลจะไม่ถูกบันทึก'))));

  tests.forEach((name) => {
    const prev = st.exams.filter((e) => e.testId === name);
    const best = prev.length ? Math.max(...prev.map((e) => e.scaled.total)) : null;
    root.appendChild(h('div.card.tight',
      h('div.row',
        h('div.grow',
          h('div.b', 'ชุดที่ ' + name.replace(/[^0-9]/g, '')),
          h('div.tiny.faint', prev.length ? `เคยทำ ${prev.length} ครั้ง · ดีที่สุด ${best}` : 'ยังไม่เคยทำ')),
        h('button.btn.primary.sm', { onclick: () => confirmStart(name) }, prev.length ? 'ทำอีกครั้ง' : 'เริ่มสอบ'))));
  });

  if (st.exams.length) {
    root.appendChild(h('div.sec-title', 'ผลสอบย้อนหลัง'));
    st.exams.slice().reverse().forEach((e) => {
      root.appendChild(h('div.card.tight',
        h('div.row',
          h('div.grow',
            h('div.b', String(e.scaled.total) + ' คะแนน'),
            h('div.tiny.faint', `${App.thaiDate(App.ymd(e.ts))} · ${e.testId} · ใช้เวลา ${App.fmtDur(e.durationMs)}`)),
          h('div', { style: { textAlign: 'right' } },
            h('div.tiny.faint', 'ฟัง / อ่าน'),
            h('div.small.b', `${e.scaled.L} / ${e.scaled.R}`)))));
    });
  }

  function confirmStart(name) {
    App.confirmBox('เริ่มสอบเสมือนจริง',
      'ใช้เวลาต่อเนื่อง 2 ชั่วโมง เริ่มจากส่วนการฟัง 45 นาที แล้วต่อด้วยการอ่าน 75 นาที พร้อมแล้วใช่ไหม',
      () => startExam(name), 'เริ่มเลย');
  }
};

function startExam(name) {
  App.toast('กำลังโหลดชุดสอบ…');
  App.Data.loadTest(name).then((t) => {
    if (!t || !t.units.length) return App.toast('โหลดชุดสอบไม่สำเร็จ', 'bad');
    const listen = t.units.filter((u) => u.part <= 4);
    const read = t.units.filter((u) => u.part >= 5);
    const t0 = Date.now();

    const runRead = (lRes) => {
      App.Quiz.start({
        units: read,
        mode: 'exam',
        title: 'สอบเสมือนจริง',
        sub: 'ส่วนที่ 2 · การอ่าน (Reading)',
        sectionLabel: 'Reading 75 นาที',
        timeLimitMs: READ_MS,
        backTo: '#/exam',
        onExit: () => App.go('#/exam'),
        onFinish: (rRes) => finishExam(name, lRes, rRes, Date.now() - t0),
      });
    };

    if (!listen.length) return runRead({ items: [], byPart: {} });

    App.Quiz.start({
      units: listen,
      mode: 'exam',
      title: 'สอบเสมือนจริง',
      sub: 'ส่วนที่ 1 · การฟัง (Listening)',
      sectionLabel: 'Listening 45 นาที',
      timeLimitMs: LISTEN_MS,
      backTo: '#/exam',
      onExit: () => App.go('#/exam'),
      onFinish: (lRes) => {
        const body = h('div.center',
          h('div', { style: { fontSize: '2.6rem' } }, '✅'),
          h('p', 'จบส่วนการฟังแล้ว'),
          h('p.small.muted', 'ต่อไปคือส่วนการอ่าน 75 นาที ในสนามจริงจะต่อกันทันทีโดยไม่มีพัก'));
        App.modal('ส่วนที่ 1 เสร็จแล้ว', body, [
          { label: 'เริ่มส่วนการอ่าน →', kind: 'primary', onclick: () => runRead(lRes) },
        ]);
      },
    });
  });
}

function finishExam(name, lRes, rRes, durationMs) {
  const items = lRes.items.concat(rRes.items);
  const lN = lRes.items.length || 1;
  const rN = rRes.items.length || 1;
  const lC = lRes.items.filter((i) => i.ok).length;
  const rC = rRes.items.filter((i) => i.ok).length;

  // ปรับให้เทียบเท่าข้อสอบจริงฝั่งละ 100 ข้อ
  const rawL = (lC / lN) * 100;
  const rawR = (rC / rN) * 100;
  const scaled = App.Score.scaledFromRaw(rawL, rawR);

  const byPart = {};
  items.forEach((i) => {
    const o = byPart[i.part] || (byPart[i.part] = { n: 0, correct: 0 });
    o.n++;
    if (i.ok) o.correct++;
  });

  const st = App.Store.state();
  st.exams.push({
    ts: Date.now(), testId: name, durationMs,
    raw: { L: lC, R: rC, nL: lN, nR: rN },
    scaled, byPart,
  });
  App.Store.addAttempt({ mode: 'exam', label: name, items, ms: durationMs });
  App.Store.addXP(App.Store.XP.exam);
  App.Store.save(true);

  App.pendingExamResult = { name, scaled, byPart, items, durationMs, units: (lRes.units || []).concat(rRes.units || []) };
  App.go('#/examresult');
}

/* ---------- ผลสอบเต็มชุด ---------- */

App.Views.examresult = function (root) {
  const r = App.pendingExamResult;
  if (!r) {
    root.appendChild(U.emptyState('📊', 'ไม่มีผลสอบที่จะแสดง', h('button.btn.primary', { onclick: () => App.go('#/exam') }, 'ไปหน้าสอบ')));
    return;
  }
  const band = App.Score.scoreBand(r.scaled.total);
  const gap = 750 - r.scaled.total;

  root.appendChild(U.topbar('ผลสอบเสมือนจริง', r.name));

  root.appendChild(h('div.card', { style: { textAlign: 'center' } },
    h('div.tiny.faint', 'คะแนนประมาณการ'),
    h('div', { style: { fontSize: '3.4rem', fontWeight: '800', lineHeight: '1.1', color: band.color } }, String(r.scaled.total)),
    h('div.b', band.th),
    h('div.row', { style: { justifyContent: 'center', marginTop: '12px' } },
      h('span.pill', `ฟัง ${r.scaled.L}`),
      h('span.pill', `อ่าน ${r.scaled.R}`)),
    h('div.small.muted', { style: { marginTop: '10px' } },
      gap > 0 ? `ยังห่างเป้า 750 อยู่ ${gap} คะแนน` : '🎉 ถึงเป้า 750 แล้ว!'),
    h('div.tiny.faint', { style: { marginTop: '6px' } }, 'เป็นการประมาณการ คลาดเคลื่อนได้ราว ±25 คะแนน')));

  // รายส่วน
  root.appendChild(h('div.card',
    h('h2', 'ทำได้แค่ไหนในแต่ละส่วน'),
    U.hbars(Object.keys(r.byPart).sort().map((p) => ({
      label: App.Score.PART_SHORT[p],
      pct: App.pct(r.byPart[p].correct, r.byPart[p].n),
      value: `${r.byPart[p].correct}/${r.byPart[p].n}`,
    })))));

  // แนะนำสิ่งที่ควรทำต่อ
  const weakest = Object.entries(r.byPart)
    .map(([p, v]) => ({ p: Number(p), rate: v.correct / v.n, n: v.n }))
    .filter((x) => x.n >= 4)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  if (weakest.length) {
    root.appendChild(h('div.card', { style: { borderColor: 'var(--brand)' } },
      h('h2', '📌 ควรทุ่มเวลาให้ส่วนไหนต่อ'),
      h('div.small.muted', { style: { marginBottom: '10px' } },
        'เรียงจากส่วนที่คุณเสียคะแนนมากที่สุด — แก้ตรงนี้ก่อนจะขึ้นเร็วที่สุด'),
      h('div', weakest.map((w, i) =>
        h('div.task', { onclick: () => goDrill(w.p) },
          h('div.t-ic', String(i + 1)),
          h('div.t-body',
            h('div.t-title', App.Score.PART_NAME[w.p]),
            h('div.t-meta', `ตอนนี้ถูก ${Math.round(w.rate * 100)}% · เสียไป ${Math.round((1 - w.rate) * App.Score.PART_N[w.p])} ข้อจากข้อสอบจริง`)),
          h('div.t-chk', '→'))))));
  }

  const wrongN = r.items.filter((i) => !i.ok).length;
  root.appendChild(h('div.row.mt',
    h('button.btn.grow', { onclick: () => reviewExamWrong(r) }, `🔧 ดูเฉลยข้อที่ผิด (${wrongN})`),
    h('button.btn.primary.grow', { onclick: () => { App.pendingExamResult = null; App.go('#/stats'); } }, 'ดูสถิติ')));

  function goDrill(p) {
    App.pendingExamResult = null;
    App.go('#/drill');
  }
};

function reviewExamWrong(r) {
  const wrongIds = new Set(r.items.filter((i) => !i.ok).map((i) => i.qid));
  const units = (r.units || []).filter((u) => u.qs.some((q) => wrongIds.has(q.qid)));
  if (!units.length) return App.toast('ไม่พบข้อที่ผิด', 'bad');
  App.pendingExamResult = null;
  App.Quiz.start({
    units, mode: 'practice', title: 'เฉลยข้อที่ผิด', backTo: '#/exam',
    onExit: () => App.go('#/exam'),
    onFinish: (res) => {
      App.Store.addAttempt({ mode: 'review', items: res.items, ms: res.ms });
      App.pendingResult = res;
      App.go('#/result');
    },
  });
}

/* ---------- ทดสอบจัดระดับ ---------- */

App.Views.placement = function (root) {
  const st = App.Store.state();
  root.appendChild(U.topbar('ทดสอบจัดระดับ', '45 ข้อ · 35 นาที'));

  if (!App.Data.filesOf('tests').includes('placement')) {
    root.appendChild(U.emptyState('⏳', 'ข้อสอบจัดระดับกำลังจัดทำ'));
    return;
  }

  if (st.placement) {
    const p = st.placement;
    root.appendChild(h('div.card', { style: { textAlign: 'center' } },
      h('div.tiny.faint', 'ผลจัดระดับเมื่อ ' + App.thaiDate(App.ymd(p.ts))),
      h('div', { style: { fontSize: '2.6rem', fontWeight: '800' } }, String(p.scaled.total)),
      h('div.small.muted', App.Score.scoreBand(p.scaled.total).th)));
  }

  root.appendChild(h('div.card',
    h('div.b', 'ทดสอบนี้ทำเพื่ออะไร'),
    h('ul.small.muted', { style: { margin: '8px 0 0', paddingLeft: '18px', lineHeight: '1.9' } },
      h('li', 'บอกว่าตอนนี้คุณอยู่ประมาณกี่คะแนนจริงๆ'),
      h('li', 'บอกว่าควรทุ่มเวลาให้ส่วนไหนก่อน'),
      h('li', 'ใช้เป็นจุดเริ่มต้นเทียบความก้าวหน้าใน 30 วัน')),
    h('div.small', { style: { marginTop: '12px', color: 'var(--warn)' } },
      '⚠️ ตอบตามที่รู้จริง ห้ามเดามั่วทุกข้อ ไม่งั้นแผนจะถูกจัดผิด — ข้อไหนไม่รู้เลยให้เดาไปตามปกติได้ แต่อย่าเปิดดูคำตอบ'),
    h('button.btn.primary.block.lg.mt', { onclick: start }, st.placement ? 'ทำใหม่อีกครั้ง' : 'เริ่มทดสอบ')));

  function start() {
    App.Data.loadTest('placement').then((t) => {
      if (!t || !t.units.length) return App.toast('โหลดข้อสอบไม่สำเร็จ', 'bad');
      App.Quiz.start({
        units: t.units,
        mode: 'exam',
        title: 'ทดสอบจัดระดับ',
        sub: '45 ข้อ · 35 นาที',
        sectionLabel: 'ไล่จากง่ายไปยาก',
        timeLimitMs: 35 * 60 * 1000,
        backTo: '#/placement',
        onExit: () => App.go('#/'),
        onFinish: finishPlacement,
      });
    });
  }
};

function finishPlacement(res) {
  const byPart = {};
  res.items.forEach((i) => {
    const o = byPart[i.part] || (byPart[i.part] = { n: 0, correct: 0 });
    o.n++;
    if (i.ok) o.correct++;
  });

  const rate = (parts) => {
    const its = res.items.filter((i) => parts.includes(i.part));
    return its.length ? its.filter((i) => i.ok).length / its.length : 0.25;
  };
  // หักส่วนที่เดาได้ออก เพื่อไม่ให้ประเมินสูงเกินจริง
  const adj = (r, guess) => App.clamp((r - guess) / (1 - guess), 0, 1);
  const rawL = adj(rate([1, 2, 3, 4]), 0.28) * 100;
  const rawR = adj(rate([5, 6, 7]), 0.25) * 100;
  const scaled = App.Score.scaledFromRaw(rawL, rawR);

  const st = App.Store.state();
  st.placement = { ts: Date.now(), byPart, raw: { L: Math.round(rawL), R: Math.round(rawR) }, scaled };
  App.Store.addAttempt({ mode: 'exam', label: 'placement', items: res.items, ms: res.ms });
  App.Store.addXP(60);
  App.Store.save(true);

  // ทำเครื่องหมายภารกิจวันที่ 1
  App.Data.plan().then((p) => {
    const d = (p.days || []).find((x) => x.d === 1);
    const t = d && (d.tasks || []).find((x) => x.type === 'placement');
    if (t) App.Store.markTaskDone(1, t);
  });

  App.pendingPlacement = { scaled, byPart, items: res.items, ms: res.ms };
  App.go('#/placementresult');
}

App.Views.placementresult = function (root) {
  const r = App.pendingPlacement;
  if (!r) return App.go('#/');
  const total = r.scaled.total;
  const band = App.Score.scoreBand(total);
  const gap = 750 - total;
  const perDay = Math.max(0, Math.round(gap / 29));

  root.appendChild(U.topbar('ผลจัดระดับ', 'จุดเริ่มต้นของคุณ'));

  root.appendChild(h('div.card', { style: { textAlign: 'center' } },
    h('div.tiny.faint', 'คะแนนประมาณการ ณ วันนี้'),
    h('div', { style: { fontSize: '3.4rem', fontWeight: '800', color: band.color, lineHeight: '1.1' } }, String(total)),
    h('div.b', band.th),
    h('div.row', { style: { justifyContent: 'center', marginTop: '10px' } },
      h('span.pill', `ฟัง ${r.scaled.L}`), h('span.pill', `อ่าน ${r.scaled.R}`))));

  root.appendChild(h('div.card', { style: { borderColor: gap > 400 ? 'var(--warn)' : 'var(--brand)' } },
    h('h2', 'ระยะทางถึงเป้า 750'),
    h('div.row',
      h('div.grow', h('div.small.muted', 'ต้องขึ้นอีก'), h('div', { style: { fontSize: '1.9rem', fontWeight: '800' } }, `${Math.max(0, gap)} คะแนน`)),
      h('div', h('div.small.muted', 'เฉลี่ยต่อวัน'), h('div', { style: { fontSize: '1.9rem', fontWeight: '800' } }, `+${perDay}`))),
    h('div.small.muted', { style: { marginTop: '10px' } },
      gap > 400
        ? '⚠️ ระยะห่างนี้ถือว่าไกลมากสำหรับ 30 วัน เป็นไปได้แต่ต้องทำครบทุกวันจริงๆ และควรเผื่อใจว่าอาจต้องเลื่อนสอบ'
        : gap > 200
          ? 'ระยะนี้ทำได้ถ้าทำครบทุกวัน โดยเฉพาะการทวนศัพท์ที่ห้ามขาด'
          : 'ระยะนี้อยู่ในวิสัยที่ทำได้สบายถ้าทำตามแผน')));

  const parts = Object.keys(r.byPart).map(Number).sort((a, b) => a - b);
  root.appendChild(h('div.card',
    h('h2', 'ทำได้แค่ไหนในแต่ละส่วน'),
    U.hbars(parts.map((p) => ({
      label: App.Score.PART_SHORT[p],
      pct: App.pct(r.byPart[p].correct, r.byPart[p].n),
      value: `${r.byPart[p].correct}/${r.byPart[p].n}`,
    })))));

  root.appendChild(h('button.btn.primary.block.lg.mt', { onclick: () => { App.pendingPlacement = null; App.go('#/'); } },
    'เริ่มเรียนวันที่ 1 →'));
};
