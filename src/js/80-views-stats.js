/* ============================================================
   80-views-stats — สถิติย้อนหลังทั้งหมด
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

App.Views.stats = function (root) {
  const st = App.Store.state();
  const p = App.Score.predict(st);
  const band = App.Score.scoreBand(p.total);
  const day = App.Store.planDay();
  const target = App.Score.targetOnDay(day, st.placement ? st.placement.scaled.total : 300);

  root.appendChild(U.topbar('สถิติย้อนหลัง', `เก็บมาแล้ว ${st.attempts.length} ครั้ง`));

  const answered = App.Store.totalAnswered(st);
  if (!answered) {
    root.appendChild(U.emptyState('📊',
      'ยังไม่มีข้อมูล<br><span class="small">ทำข้อสอบสักชุด แล้วกลับมาดูที่นี่</span>',
      h('button.btn.primary', { onclick: () => App.go('#/drill') }, 'ไปฝึกทำข้อสอบ')));
    return;
  }

  /* ---- สรุปบนสุด ---- */
  root.appendChild(h('div.tiles',
    tile(p.dataPoints < 15 ? '—' : String(p.total), 'คะแนนคาดการณ์', 'br'),
    tile(String(answered), 'ข้อที่ทำแล้ว', ''),
    tile(String(st.progress.bestStreak), 'สถิติวันติดกัน', 'gold')));

  /* ---- กราฟแนวโน้ม ---- */
  const trend = App.Score.scoreTrend(st);
  root.appendChild(h('div.card',
    h('h2', 'แนวโน้มคะแนนคาดการณ์'),
    trend.length >= 2
      ? U.lineChart(trend.map((t) => ({ y: t.total, label: t.date.slice(5).replace('-', '/') })), { min: 100, max: 990 })
      : h('div.empty.small', 'ต้องมีข้อมูลอย่างน้อย 2 วัน กราฟจึงจะขึ้น'),
    h('div.row.tiny.faint.mt',
      h('span', `ตอนนี้ ${p.total}`), h('span', '·'),
      h('span', `ควรอยู่ที่ ${target} ในวันที่ ${day}`), h('span.grow'),
      h('span', p.confidence === 'low' ? 'ข้อมูลยังน้อย' : p.confidence === 'mid' ? '±40' : '±25'))));

  /* ---- รายส่วน ---- */
  const acc = App.Score.accuracyByPart(st);
  const rows = [1, 2, 3, 4, 5, 6, 7].filter((x) => acc[x]).map((x) => ({
    label: App.Score.PART_SHORT[x],
    pct: App.pct(acc[x].correct, acc[x].n),
    value: `${App.pct(acc[x].correct, acc[x].n)}%`,
  }));
  if (rows.length) {
    root.appendChild(h('div.card',
      h('h2', 'ความแม่นยำรายส่วน'),
      U.hbars(rows),
      h('div.tiny.faint.mt', 'อ้างอิงจากข้อล่าสุดของแต่ละส่วน (ไม่นับโหมดทวนข้อผิด)')));
  }

  /* ---- เวลาต่อข้อ ---- */
  const timeRows = [5, 6, 7].filter((x) => acc[x] && acc[x].n >= 5).map((x) => {
    const avg = acc[x].ms / acc[x].n / 1000;
    const budget = { 5: 20, 6: 25, 7: 55 }[x];
    return { part: x, avg, budget };
  });
  if (timeRows.length) {
    root.appendChild(h('div.card',
      h('h2', 'ความเร็วในการทำข้อ (ฝั่งอ่าน)'),
      h('div.small.muted', { style: { marginBottom: '10px' } },
        'ในสนามจริงมีเวลา 75 นาทีสำหรับ 100 ข้อ ถ้าช้ากว่างบเวลา จะทำ Part 7 ไม่ทัน'),
      h('div', timeRows.map((r) =>
        h('div.row.small', { style: { padding: '5px 0' } },
          h('span', { style: { flex: '0 0 90px' } }, App.Score.PART_SHORT[r.part]),
          h('span.grow.b', `${r.avg.toFixed(1)} วิ/ข้อ`),
          h('span.pill.' + (r.avg <= r.budget ? 'ok' : 'bad'), `งบ ${r.budget} วิ`))))));
  }

  /* ---- หัวข้อที่แม่น / ไม่แม่น ---- */
  const at = App.Score.accuracyByTopic(st);
  const list = Object.entries(at).filter(([, v]) => v.n >= 4)
    .map(([k, v]) => ({ k, th: v.topicTh || k, rate: v.correct / v.n, n: v.n }))
    .sort((a, b) => a.rate - b.rate);
  if (list.length) {
    root.appendChild(h('div.card',
      h('h2', 'จุดอ่อนที่ควรแก้ก่อน'),
      U.hbars(list.slice(0, 8).map((x) => ({ label: x.th, pct: Math.round(x.rate * 100), value: `${Math.round(x.rate * 100)}% (${x.n})` }))),
      list.length > 8 ? h('div', null) : null,
      h('button.btn.block.mt', { onclick: () => App.go('#/drill') }, 'ไปฝึกหัวข้อเหล่านี้')));

    if (list.length > 8) {
      const strong = list.slice(-5).reverse();
      root.appendChild(h('div.card',
        h('h2', 'หัวข้อที่แม่นแล้ว'),
        U.hbars(strong.map((x) => ({ label: x.th, pct: Math.round(x.rate * 100), value: `${Math.round(x.rate * 100)}%`, color: 'var(--ok)' })))));
    }
  }

  /* ---- ความสม่ำเสมอ ---- */
  root.appendChild(h('div.card',
    h('h2', 'ความสม่ำเสมอ 30 วัน'),
    U.streakGrid(st.plan.startDate, st.progress.studyDates),
    h('div.row.tiny.faint.mt',
      h('span', '🟩 เรียนแล้ว'), h('span', '🟥 ขาด'), h('span', '⬜ ยังไม่ถึง'),
      h('span.grow'), h('span', `เรียนไปแล้ว ${st.progress.studyDates.length} วัน`))));

  /* ---- คำศัพท์ ---- */
  const vw = h('div.card', h('h2', 'คำศัพท์'), h('div.empty.small', 'กำลังโหลด…'));
  root.appendChild(vw);
  App.Data.vocab().then((all) => {
    App.clear(vw);
    const s = App.SRS.stats(all);
    vw.appendChild(h('h2', 'คำศัพท์'));
    vw.appendChild(U.hbars([
      { label: 'จำได้แน่น', pct: App.pct(s.mature, s.total), value: s.mature, color: 'var(--ok)' },
      { label: 'กำลังจำ', pct: App.pct(s.young, s.total), value: s.young, color: 'var(--brand)' },
      { label: 'เพิ่งเริ่ม', pct: App.pct(s.learning, s.total), value: s.learning, color: 'var(--warn)' },
    ]));
    vw.appendChild(h('div.small.faint.mt', `ครบกำหนดทวนวันนี้ ${s.dueNow} คำ`));
  });

  /* ---- เหรียญตรา ---- */
  const have = new Set(st.progress.badges.map((b) => b.id));
  root.appendChild(h('div.card',
    h('h2', `เหรียญตรา ${have.size}/${App.Store.BADGES.length}`),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(76px,1fr))', gap: '10px' } },
      App.Store.BADGES.map((b) => {
        const on = have.has(b.id);
        return h('div', {
          title: b.name + ' — ' + App.Store.badgeDesc(b),
          style: { textAlign: 'center', opacity: on ? '1' : '.28', filter: on ? '' : 'grayscale(1)' },
        },
          h('div', { style: { fontSize: '1.8rem' } }, b.icon),
          h('div.tiny', { style: { lineHeight: '1.3' } }, b.name));
      }))));

  /* ---- ประวัติล่าสุด ---- */
  root.appendChild(h('div.sec-title', 'ประวัติล่าสุด'));
  const hist = st.attempts.slice(-25).reverse();
  hist.forEach((a) => {
    const modeTh = { drill: 'ฝึกทำ', lesson: 'แบบฝึกท้ายบท', exam: 'สอบเสมือน', review: 'ทวนข้อผิด' }[a.mode] || a.mode;
    root.appendChild(h('div.card.tight',
      h('div.row',
        h('div.grow',
          h('div.small.b', `${modeTh}${a.label ? ' · ' + a.label : ''}${a.part ? ' · ' + App.Score.PART_SHORT[a.part] : ''}`),
          h('div.tiny.faint', `${App.thaiDate(a.date || App.ymd(a.ts))} · ${App.fmtDur(a.ms)}`)),
        h('span.pill.' + (App.pct(a.correct, a.n) >= 75 ? 'ok' : App.pct(a.correct, a.n) >= 50 ? 'warn' : 'bad'),
          `${a.correct}/${a.n}`))));
  });

  function tile(v, k, cls) {
    return h('div.tile', h('div.v' + (cls ? '.' + cls : ''), v), h('div.k', k));
  }
};
