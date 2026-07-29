/* ============================================================
   72-views-learn — รายการบทเรียน + หน้าอ่านบทเรียน + สรุปผล
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

/* ---------- รายการบทเรียน ---------- */

App.Views.learn = function (root) {
  const st = App.Store.state();
  const day = App.Store.planDay();

  root.appendChild(U.topbar('บทเรียน', 'เรียงตามลำดับที่ควรเรียน ห้ามข้าม'));

  const wrap = h('div');
  root.appendChild(wrap);
  wrap.appendChild(h('div.empty', 'กำลังโหลด…'));

  Promise.all([App.Data.plan(), App.Data.lessons()]).then(([plan, lessons]) => {
    App.clear(wrap);
    const byId = {};
    lessons.forEach((l) => (byId[l.id] = l));

    const doneN = Object.keys(st.progress.lessonsDone).length;
    wrap.appendChild(h('div.card.tight',
      h('div.row', h('span.grow.small', `เรียนแล้ว ${doneN} จาก 30 บท`), h('span.pill', `${Math.round((doneN / 30) * 100)}%`)),
      h('div.bar.thin', { style: { marginTop: '8px' } }, h('i', { style: { width: (doneN / 30) * 100 + '%' } }))));

    let curWeek = 0;
    (plan.days || []).forEach((d) => {
      const lt = (d.tasks || []).find((t) => t.type === 'lesson');
      if (!lt) return;
      if (d.week !== curWeek) {
        curWeek = d.week;
        wrap.appendChild(h('div.sec-title', `สัปดาห์ที่ ${curWeek}`));
      }
      const L = byId[lt.id];
      const done = !!st.progress.lessonsDone[lt.id];
      const locked = d.d > day + 2;
      const el = h('div.task' + (done ? '.done' : ''),
        h('div.t-ic', done ? '✅' : locked ? '🔒' : L ? '📖' : '⏳'),
        h('div.t-body',
          h('div.t-title', `วันที่ ${d.d} · ${L ? L.title : d.title}`),
          h('div.t-meta', L ? `${L.minutes || 30} นาที · ${(L.quiz || []).length} ข้อท้ายบท` : 'กำลังจัดทำเนื้อหา')),
        h('div.t-chk', '✓'));
      if (L) el.addEventListener('click', () => App.go('#/lesson/' + L.id));
      else el.style.opacity = '.45';
      wrap.appendChild(el);
    });
  });
};

/* ---------- หน้าอ่านบทเรียน ---------- */

App.Views.lesson = function (root, params) {
  const id = params.id;
  root.appendChild(U.topbar('บทเรียน', id, U.backBtn('#/learn')));
  const wrap = h('div');
  root.appendChild(wrap);
  wrap.appendChild(h('div.empty', 'กำลังโหลด…'));

  App.Data.lesson(id).then((L) => {
    App.clear(wrap);
    if (!L) {
      wrap.appendChild(U.emptyState('⏳', 'บทนี้กำลังจัดทำอยู่<br>จะเพิ่มให้ในรอบอัปเดตถัดไป',
        h('button.btn.primary', { onclick: () => App.go('#/learn') }, 'กลับไปเลือกบทอื่น')));
      return;
    }

    App.$('.topbar h1').textContent = L.title;
    App.$('.topbar .sub').textContent = `วันที่ ${L.day} · ${L.minutes || 30} นาที`;

    wrap.appendChild(h('div.card', { style: { borderColor: 'var(--brand)', background: 'var(--brand-sf)' } },
      h('div.tiny.b', { style: { color: 'var(--brand)' } }, '🎯 จบบทนี้แล้วคุณจะ'),
      h('div.small', { style: { marginTop: '4px' } }, L.goalTh)));

    const body = h('div.card');
    (L.blocks || []).forEach((b) => body.appendChild(blockEl(b)));
    wrap.appendChild(body);

    const quiz = L.quiz || [];
    if (quiz.length) {
      wrap.appendChild(h('div.card', { style: { textAlign: 'center' } },
        h('div.b', `แบบฝึกท้ายบท ${quiz.length} ข้อ`),
        h('div.small.muted', { style: { margin: '6px 0 12px' } }, 'ทำเลยตอนที่เพิ่งอ่านจบ จะจำได้แน่นกว่ามาก'),
        h('button.btn.primary.block.lg', { onclick: () => startLessonQuiz(L) }, 'เริ่มทำแบบฝึก →')));
    } else {
      wrap.appendChild(h('button.btn.primary.block.lg', { onclick: () => completeLesson(L) }, 'เรียนจบบทนี้แล้ว ✓'));
    }
  });
};

function blockEl(b) {
  switch (b.type) {
    case 'text':
      return h('p.lb-text', { html: App.mdBold(b.th || '') });
    case 'example': {
      const el = h('div.lb-ex',
        h('button.btn.sm.ghost.lb-spk', { onclick: () => App.TTS.say(b.en, 'US'), title: 'ฟัง' }, '🔊'),
        h('div.en', b.en),
        b.th ? h('div.th', b.th) : null,
        b.note ? h('div.nt', { html: App.mdBold(b.note) }) : null);
      const btn = el.querySelector('button');
      btn.style.float = 'right';
      btn.style.marginLeft = '8px';
      return el;
    }
    case 'table': {
      const w = h('div.tbl-wrap');
      const t = h('table.lb-tbl');
      if (b.head) {
        const tr = h('tr');
        b.head.forEach((x) => tr.appendChild(h('th', x)));
        t.appendChild(h('thead', tr));
      }
      const tb = h('tbody');
      (b.rows || []).forEach((r) => {
        const tr = h('tr');
        r.forEach((c) => tr.appendChild(h('td', { html: App.mdBold(c) })));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      w.appendChild(t);
      return w;
    }
    case 'tip':
      return h('div.lb-tip', h('span', '💡'), h('div', { html: App.mdBold(b.th || '') }));
    case 'warn':
      return h('div.lb-warn', h('span', '⚠️'), h('div', { html: App.mdBold(b.th || '') }));
    default:
      return h('p.lb-text', { html: App.mdBold(b.th || b.text || '') });
  }
}

function startLessonQuiz(L) {
  const units = (L.quiz || []).map((it) => App.Data.toUnit(it, 'lesson:' + L.id)).filter(Boolean);
  if (!units.length) return completeLesson(L);
  App.Quiz.start({
    units,
    mode: 'practice',
    title: 'แบบฝึกท้ายบท',
    backTo: '#/lesson/' + L.id,
    onExit: () => App.go('#/lesson/' + L.id),
    onFinish: (res) => {
      App.Store.addAttempt({ mode: 'lesson', label: L.id, items: res.items, ms: res.ms });
      completeLesson(L, true);
      App.pendingResult = res;
      App.go('#/result');
    },
  });
}

function completeLesson(L, silent) {
  const st = App.Store.state();
  if (!st.progress.lessonsDone[L.id]) {
    st.progress.lessonsDone[L.id] = Date.now();
    App.Store.addXP(App.Store.XP.lesson);
    App.Store.save(true);
    if (!silent) {
      App.toast(`เรียนจบบท ${L.id} แล้ว +${App.Store.XP.lesson} XP`, 'ok');
      setTimeout(() => App.go('#/learn'), 700);
    }
  } else if (!silent) {
    App.go('#/learn');
  }
  // ทำเครื่องหมายภารกิจในแผนวันนี้ให้ด้วย
  App.Data.plan().then((p) => {
    const d = (p.days || []).find((x) => x.d === App.Store.planDay());
    if (!d) return;
    const t = (d.tasks || []).find((x) => x.type === 'lesson' && x.id === L.id);
    if (t) App.Store.markTaskDone(d.d, t);
  });
}

/* ---------- สรุปผลหลังทำชุด ---------- */

App.Views.result = function (root) {
  const res = App.pendingResult;
  if (!res) {
    root.appendChild(U.emptyState('📊', 'ไม่มีผลลัพธ์ที่จะแสดง', h('button.btn.primary', { onclick: () => App.go('#/') }, 'กลับหน้าแรก')));
    return;
  }
  const n = res.items.length;
  const c = res.items.filter((i) => i.ok).length;
  const p = App.pct(c, n);
  const good = p >= 75;

  root.appendChild(U.topbar('สรุปผล', res.title || ''));

  root.appendChild(h('div.card', { style: { textAlign: 'center' } },
    h('div', { style: { fontSize: '3rem' } }, p >= 90 ? '🏆' : p >= 75 ? '🎉' : p >= 50 ? '💪' : '📚'),
    h('div', { style: { fontSize: '2.6rem', fontWeight: '800', color: good ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)' } },
      `${c}/${n}`),
    h('div.b', `ถูก ${p}%`),
    h('div.small.muted', { style: { marginTop: '6px' } },
      `ใช้เวลา ${App.fmtDur(res.ms)} · เฉลี่ย ${App.fmtDur(res.ms / Math.max(1, n))} ต่อข้อ`)));

  // รายส่วน
  const parts = Object.keys(res.byPart || {});
  if (parts.length > 1) {
    root.appendChild(h('div.card',
      h('h2', 'แยกตามส่วน'),
      U.hbars(parts.map((k) => ({
        label: App.Score.PART_SHORT[k],
        pct: App.pct(res.byPart[k].correct, res.byPart[k].n),
        value: `${res.byPart[k].correct}/${res.byPart[k].n}`,
      })))));
  }

  // หัวข้อที่ควรกลับไปทวน
  const wrongTopics = {};
  res.items.filter((i) => !i.ok && i.topic).forEach((i) => {
    wrongTopics[i.topic] = (wrongTopics[i.topic] || { n: 0, th: i.topicTh || i.topic });
    wrongTopics[i.topic].n++;
  });
  const wt = Object.entries(wrongTopics).sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  if (wt.length) {
    root.appendChild(h('div.card',
      h('h2', 'หัวข้อที่ควรกลับไปทวน'),
      h('div.row.wrap', wt.map(([k, v]) => h('span.pill.bad', `${v.th} × ${v.n}`)))));
  }

  const wrongs = res.items.filter((i) => !i.ok);
  root.appendChild(h('div.row.mt',
    wrongs.length
      ? h('button.btn.grow', { onclick: () => reviewWrongNow(res) }, `🔧 ทำข้อที่ผิดซ้ำ (${wrongs.length})`)
      : null,
    h('button.btn.primary.grow', { onclick: () => { App.pendingResult = null; App.go('#/'); } }, 'กลับหน้าแรก')));
};

function reviewWrongNow(res) {
  const ids = res.items.filter((i) => !i.ok).map((i) => i.qid);
  const unitMap = new Map();
  (res.units || []).forEach((u) => u.qs.forEach((q) => unitMap.set(q.qid, u)));
  const units = App.uniq(ids.map((id) => unitMap.get(id)).filter(Boolean));
  if (!units.length) return App.toast('ไม่พบข้อที่จะทวน', 'bad');
  App.pendingResult = null;
  App.Quiz.start({
    units,
    mode: 'practice',
    title: 'ทำข้อที่ผิดซ้ำ',
    backTo: '#/',
    onExit: () => App.go('#/'),
    onFinish: (r) => {
      App.Store.addAttempt({ mode: 'review', items: r.items, ms: r.ms });
      App.pendingResult = r;
      App.go('#/result');
    },
  });
}
