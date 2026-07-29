/* ============================================================
   70-views-home — หน้าแรก: ภารกิจวันนี้ + คะแนนคาดการณ์
   ============================================================ */
'use strict';

const V = (App.Views = App.Views || {});

const TASK_META = {
  placement:  { ic: '🎯', name: 'ทดสอบจัดระดับ',            min: 35 },
  lesson:     { ic: '📖', name: 'บทเรียน',                  min: 30 },
  vocab:      { ic: '🃏', name: 'ทวนคำศัพท์',                min: 12 },
  drill:      { ic: '✏️', name: 'ฝึกทำข้อสอบ',               min: 18 },
  review:     { ic: '🔧', name: 'ทบทวนข้อที่เคยผิด',          min: 15 },
  exam:       { ic: '📝', name: 'สอบเสมือนจริง',             min: 120 },
  checkpoint: { ic: '📊', name: 'ทดสอบย่อย',                 min: 20 },
  weakspot:   { ic: '🎯', name: 'ซัดจุดอ่อนของคุณ',           min: 35 },
  cheatsheet: { ic: '📋', name: 'อ่านสรุปไวยากรณ์',           min: 20 },
  examinfo:   { ic: 'ℹ️', name: 'อ่านข้อมูลการสอบจริง',       min: 10 },
};

V.home = function (root) {
  const st = App.Store.state();
  const day = App.Store.planDay();
  const calDay = App.Store.calendarDay();
  const p = App.Score.predict(st);
  const band = App.Score.scoreBand(p.total);
  const target = App.Score.targetOnDay(day, st.placement ? st.placement.scaled.total : 300);

  root.appendChild(
    App.UI.topbar(
      `วันที่ ${day} จาก 30`,
      `${App.thaiDate(App.today(), { dow: true })}${calDay > 30 ? ' · เลยแผนมา ' + (calDay - 30) + ' วัน' : ''}`,
      App.h('button.btn.icon.ghost', { onclick: () => App.go('#/settings'), title: 'ตั้งค่า' }, '⚙️'),
    ),
  );

  /* ---- การ์ดคะแนน ---- */
  const diff = p.total - target;
  const onTrack = diff >= -40;
  const scoreCard = App.h('div.card',
    App.h('div.row',
      App.h('div.grow',
        App.h('div.tiny.faint', 'คะแนนคาดการณ์ตอนนี้'),
        App.h('div', { style: { fontSize: '2.5rem', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-.03em', color: band.color } },
          p.dataPoints < 15 ? '—' : String(p.total)),
        App.h('div.small.muted', p.dataPoints < 15 ? 'ทำข้อสอบสัก 20 ข้อ แล้วตัวเลขจะขึ้น' : band.th)),
      App.h('div', { style: { textAlign: 'right' } },
        App.h('div.tiny.faint', 'ควรอยู่ที่'),
        App.h('div', { style: { fontSize: '1.35rem', fontWeight: '700' } }, String(target)),
        p.dataPoints >= 15
          ? App.h('div.pill.' + (onTrack ? 'ok' : 'bad'), { style: { marginTop: '4px' } }, (diff >= 0 ? '+' : '') + diff)
          : null)),
  );

  const barWrap = App.h('div', { style: { marginTop: '14px' } });
  barWrap.appendChild(App.h('div.bar' + (onTrack ? '.ok' : '.warn'),
    App.h('i', { style: { width: App.clamp((p.total / 990) * 100, 2, 100) + '%' } })));
  barWrap.appendChild(App.h('div.row.tiny.faint', { style: { marginTop: '5px' } },
    App.h('span', '10'), App.h('span.grow'), App.h('span', { style: { color: 'var(--ok)' } }, '🎯 750'),
    App.h('span.grow'), App.h('span', '990')));
  scoreCard.appendChild(barWrap);

  if (p.dataPoints >= 15) {
    scoreCard.appendChild(App.h('div.row.tiny.faint.mt',
      App.h('span', `ฟัง ~${p.L}`), App.h('span', '·'), App.h('span', `อ่าน ~${p.R}`),
      App.h('span.grow'),
      App.h('span', p.confidence === 'low' ? 'ข้อมูลยังน้อย คลาดเคลื่อนสูง' : p.confidence === 'mid' ? 'ประมาณการ ±40' : 'ประมาณการ ±25')));
  }
  root.appendChild(scoreCard);

  /* ---- คำเตือนเชิงกลยุทธ์ ---- */
  if (day >= 20 && p.dataPoints >= 60 && p.total < 650) {
    root.appendChild(App.h('div.card', { style: { borderColor: 'var(--warn)', background: 'var(--warn-sf)' } },
      App.h('div.b', '⚠️ ควรพิจารณาเลื่อนวันสอบ'),
      App.h('div.small', { style: { marginTop: '6px' } },
        `เหลือ ${30 - day} วัน คะแนนคาดการณ์อยู่ที่ ${p.total} การขึ้นถึง 750 ในเวลาที่เหลือเป็นไปได้ยากมาก ` +
        'ถ้ายังไม่จองสอบ แนะนำให้เผื่อเวลาอีก 3-4 สัปดาห์ คะแนนจะต่างกันมาก'),
    ));
  }

  /* ---- ตัวเลขสรุป ---- */
  root.appendChild(App.h('div.tiles',
    tile(String(st.progress.streak), 'วันติดกัน 🔥', 'gold'),
    tile(String(st.progress.xp), 'XP', 'br'),
    tile(String(App.Store.daysLeft()), 'วันที่เหลือ', ''),
  ));

  /* ---- ทดสอบจัดระดับ ---- */
  if (!st.placement) {
    root.appendChild(App.h('div.card', { style: { borderColor: 'var(--brand)' } },
      App.h('div.b', '🎯 เริ่มจากตรงนี้: ทดสอบจัดระดับ'),
      App.h('div.small.muted', { style: { margin: '6px 0 12px' } },
        'ใช้เวลา 35 นาที 45 ข้อ ไล่จากง่ายมากไปถึงระดับข้อสอบจริง ผลจะบอกว่าตอนนี้คุณอยู่ประมาณกี่คะแนน และควรทุ่มเวลาให้ส่วนไหนก่อน'),
      App.h('button.btn.primary.block', { onclick: () => App.go('#/placement') }, 'เริ่มทดสอบจัดระดับ')));
  }

  /* ---- ภารกิจวันนี้ ---- */
  root.appendChild(App.h('div.sec-title', 'ภารกิจวันนี้'));
  const list = App.h('div');
  root.appendChild(list);
  list.appendChild(App.h('div.empty', 'กำลังโหลดแผน…'));

  Promise.all([App.Data.plan(), App.Data.inventory()]).then(([plan, inv]) => {
    App.clear(list);
    const dayPlan = (plan.days || []).find((x) => x.d === day);
    if (!dayPlan) {
      list.appendChild(App.UI.emptyState('🎉', 'จบแผน 30 วันแล้ว! ทวนข้อที่ผิดและคำศัพท์ต่อได้เลย'));
      return;
    }

    list.appendChild(App.h('div.card.tight',
      App.h('div.b', dayPlan.title),
      App.h('div.small.muted', { style: { marginTop: '4px' } }, '💡 ' + dayPlan.why)));

    let totalMin = 0;
    let doneCount = 0;
    dayPlan.tasks.forEach((t) => {
      if (t.type === 'placement' && st.placement) return;
      const meta = TASK_META[t.type] || { ic: '•', name: t.type, min: 15 };
      const avail = taskAvailable(t, inv);
      const done = App.Store.isTaskDone(day, t);
      if (done) doneCount++;
      const min = t.type === 'vocab' ? Math.max(8, Math.round(t.n * 0.5)) : t.type === 'drill' ? Math.max(8, Math.round(t.n * 0.75)) : meta.min;
      totalMin += min;

      const el = App.h('div.task' + (done ? '.done' : ''),
        App.h('div.t-ic', meta.ic),
        App.h('div.t-body',
          App.h('div.t-title', taskTitle(t, meta)),
          App.h('div.t-meta', avail.ok ? `~${min} นาที${t.n ? ' · ' + t.n + ' ข้อ' : ''}` : '⏳ ' + avail.msg)),
        App.h('div.t-chk', '✓'));
      if (avail.ok) el.addEventListener('click', () => runTask(t, day, dayPlan));
      else el.style.opacity = '.5';
      list.appendChild(el);
    });

    const allDone = doneCount >= dayPlan.tasks.filter((t) => !(t.type === 'placement' && st.placement)).length;
    list.appendChild(App.h('div.row.small.faint', { style: { marginTop: '8px' } },
      App.h('span', `รวมประมาณ ${App.fmtMin(totalMin)}`),
      App.h('span.grow'),
      App.h('span', `เสร็จ ${doneCount}/${dayPlan.tasks.length}`)));

    if (allDone) {
      list.appendChild(App.h('div.card.mt', { style: { borderColor: 'var(--ok)', background: 'var(--ok-sf)', textAlign: 'center' } },
        App.h('div', { style: { fontSize: '2rem' } }, '🎉'),
        App.h('div.b', 'ทำครบภารกิจวันนี้แล้ว'),
        App.h('div.small', 'อยากทำเพิ่มก็เข้าหน้า "ฝึกทำ" ได้เลย')));
    }
  });

  /* ---- ทางลัด ---- */
  root.appendChild(App.h('div.sec-title', 'ทางลัด'));
  root.appendChild(App.h('div.grid2',
    quick('✏️', 'ฝึกทำข้อสอบ', '#/drill'),
    quick('🔧', 'สมุดข้อที่ผิด', '#/mistakes'),
    quick('📝', 'สอบเสมือนจริง', '#/exam'),
    quick('📋', 'สรุปไวยากรณ์', '#/cheatsheet'),
    quick('📊', 'สถิติย้อนหลัง', '#/stats'),
    quick('ℹ️', 'ข้อมูลการสอบ', '#/examinfo'),
  ));

  function tile(v, k, cls) {
    return App.h('div.tile', App.h('div.v' + (cls ? '.' + cls : ''), v), App.h('div.k', k));
  }
  function quick(ic, label, href) {
    return App.h('button.btn', { onclick: () => App.go(href), style: { textAlign: 'left' } },
      App.h('span', { style: { marginRight: '7px' } }, ic), label);
  }
};

function taskTitle(t, meta) {
  if (t.type === 'lesson') return `บทเรียน: ${t.id}`;
  if (t.type === 'drill') {
    const tier = { easy: 'ง่าย', medium: 'กลาง', real: 'ระดับจริง' }[t.tier] || '';
    return `ฝึก ${App.Score.PART_SHORT[t.part]} (${tier})`;
  }
  if (t.type === 'vocab') return `ทวนคำศัพท์ ${t.n} คำ`;
  if (t.type === 'review') return `ทบทวนข้อที่เคยผิด ${t.n} ข้อ`;
  if (t.type === 'exam') return `สอบเสมือนจริง (${t.testId})`;
  if (t.type === 'checkpoint') return t.label || 'ทดสอบย่อย';
  return meta.name;
}

function taskAvailable(t, inv) {
  if (t.type === 'lesson') {
    return App.Data.filesOf('lessons').includes(t.id)
      ? { ok: true }
      : { ok: false, msg: `บท ${t.id} กำลังจัดทำ` };
  }
  if (t.type === 'exam') {
    return App.Data.filesOf('tests').includes(t.testId)
      ? { ok: true }
      : { ok: false, msg: `ชุดสอบ ${t.testId} กำลังจัดทำ` };
  }
  if (t.type === 'placement') {
    return App.Data.filesOf('tests').includes('placement') ? { ok: true } : { ok: false, msg: 'กำลังจัดทำ' };
  }
  if (t.type === 'drill' || t.type === 'checkpoint') {
    const c = inv.drills[t.part];
    if (!c || !c.total) return { ok: false, msg: `ข้อ ${App.Score.PART_SHORT[t.part]} กำลังจัดทำ` };
    if (t.tier && !c[t.tier]) return { ok: false, msg: 'ระดับนี้กำลังจัดทำ' };
    return { ok: true };
  }
  if (t.type === 'vocab') return inv.vocab ? { ok: true } : { ok: false, msg: 'คลังศัพท์กำลังจัดทำ' };
  if (t.type === 'cheatsheet') return App.Data.filesOf('static').includes('cheatsheet') ? { ok: true } : { ok: false, msg: 'กำลังจัดทำ' };
  if (t.type === 'examinfo') return App.Data.filesOf('static').includes('examinfo') ? { ok: true } : { ok: false, msg: 'กำลังจัดทำ' };
  return { ok: true };
}

function runTask(t, day, dayPlan) {
  const finishTask = () => App.Store.markTaskDone(day, t);

  switch (t.type) {
    case 'placement':
      return App.go('#/placement');
    case 'lesson':
      return App.go('#/lesson/' + t.id);
    case 'vocab':
      App.pendingCards = { n: t.n, onDone: finishTask };
      return App.go('#/cards');
    case 'cheatsheet':
      finishTask();
      return App.go('#/cheatsheet');
    case 'examinfo':
      finishTask();
      return App.go('#/examinfo');
    case 'exam':
      return App.go('#/exam/' + t.testId);
    case 'review':
      App.pendingReview = { n: t.n, onDone: finishTask };
      return App.go('#/review');
    case 'weakspot':
      return startWeakspot(t, finishTask);
    case 'drill':
    case 'checkpoint':
      return startPlanDrill(t, finishTask);
  }
}

function startPlanDrill(t, onDone) {
  App.Data.selectDrill({ part: t.part, tier: t.tier, topic: t.topic, n: t.n }).then((units) => {
    if (!units.length) return App.toast('ยังไม่มีข้อสอบส่วนนี้ในคลัง', 'bad');
    App.Quiz.start({
      units,
      mode: 'practice',
      title: t.label || `ฝึก ${App.Score.PART_SHORT[t.part]}`,
      backTo: '#/',
      onExit: () => App.go('#/'),
      onFinish: (res) => {
        App.Store.addAttempt({ mode: 'drill', part: t.part, tier: t.tier, topic: t.topic, items: res.items, ms: res.ms });
        App.Store.addXP(App.Store.XP.drillSet);
        if (onDone) onDone();
        App.pendingResult = res;
        App.go('#/result');
      },
    });
  });
}

function startWeakspot(t, onDone) {
  const st = App.Store.state();
  const acc = App.Score.accuracyByTopic(st);
  const weak = Object.entries(acc)
    .filter(([, v]) => v.n >= 5)
    .map(([k, v]) => ({ topic: k, rate: v.correct / v.n }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5)
    .map((x) => x.topic);

  const load = weak.length
    ? Promise.all(weak.map((tp) => App.Data.selectDrill({ topic: tp, n: Math.ceil(t.n / weak.length) }))).then((a) => a.flat())
    : App.Data.selectDrill({ n: t.n });

  load.then((units) => {
    if (!units.length) return App.toast('ยังไม่มีข้อมูลพอจะหาจุดอ่อน — ทำข้อสอบเพิ่มก่อน', 'bad');
    App.Quiz.start({
      units: App.shuffle(units).slice(0, Math.ceil(t.n / 1.2)),
      mode: 'practice',
      title: 'ซัดจุดอ่อนของคุณ',
      backTo: '#/',
      onExit: () => App.go('#/'),
      onFinish: (res) => {
        App.Store.addAttempt({ mode: 'drill', label: 'weakspot', items: res.items, ms: res.ms });
        App.Store.addXP(App.Store.XP.drillSet);
        if (onDone) onDone();
        App.pendingResult = res;
        App.go('#/result');
      },
    });
  });
}

App.Views.TASK_META = TASK_META;
App.Views.startPlanDrill = startPlanDrill;
