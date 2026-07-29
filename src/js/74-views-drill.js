/* ============================================================
   74-views-drill — เลือกชุดฝึก + ทบทวนข้อที่เคยผิด + สมุดข้อผิด
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

const TIER_TH = { easy: 'ง่าย', medium: 'กลาง', real: 'ระดับจริง' };

App.Views.drill = function (root) {
  root.appendChild(U.topbar('ฝึกทำข้อสอบ', 'เลือกส่วนและระดับที่อยากซ้อม'));

  const wrap = h('div');
  root.appendChild(wrap);
  wrap.appendChild(h('div.empty', 'กำลังโหลดคลังข้อสอบ…'));

  Promise.all([App.Data.drillCounts(), App.Data.drillTopics()]).then(([counts, topics]) => {
    App.clear(wrap);
    const st = App.Store.state();
    const acc = App.Score.accuracyByPart(st);

    const total = App.sum(Object.values(counts).map((c) => c.total));
    if (!total) {
      wrap.appendChild(U.emptyState('⏳', 'คลังข้อสอบกำลังจัดทำ<br>ลองเข้าหน้านี้อีกครั้งหลังอัปเดต'));
      return;
    }

    wrap.appendChild(h('div.card.tight.small.muted', `คลังข้อสอบตอนนี้มี ${total.toLocaleString('th-TH')} ข้อ พร้อมเฉลยละเอียดทุกข้อ`));

    // ---- แยกตาม Part ----
    wrap.appendChild(h('div.sec-title', 'เลือกตามส่วนของข้อสอบ'));
    [1, 2, 3, 4, 5, 6, 7].forEach((p) => {
      const c = counts[p];
      const a = acc[p];
      const card = h('div.card.tight');
      card.appendChild(h('div.row',
        h('div.grow',
          h('div.b', App.Score.PART_NAME[p]),
          h('div.tiny.faint', c ? `มี ${c.total} ข้อในคลัง · ข้อสอบจริง ${App.Score.PART_N[p]} ข้อ` : 'กำลังจัดทำ')),
        a && a.n >= 3
          ? h('span.pill.' + (a.correct / a.n >= .75 ? 'ok' : a.correct / a.n >= .5 ? 'warn' : 'bad'),
              `${App.pct(a.correct, a.n)}%`)
          : null));

      if (c) {
        const row = h('div.row.wrap', { style: { marginTop: '9px' } });
        ['easy', 'medium', 'real'].forEach((t) => {
          if (!c[t]) return;
          row.appendChild(h('button.btn.sm', { onclick: () => openStart(p, t, c[t]) }, `${TIER_TH[t]} (${c[t]})`));
        });
        row.appendChild(h('button.btn.sm.primary', { onclick: () => openStart(p, null, c.total) }, 'คละระดับ'));
        card.appendChild(row);
      } else {
        card.style.opacity = '.5';
      }
      wrap.appendChild(card);
    });

    // ---- แยกตามหัวข้อไวยากรณ์ ----
    if (topics.length) {
      wrap.appendChild(h('div.sec-title', 'เลือกตามหัวข้อไวยากรณ์'));
      const tw = h('div.card.tight');
      const accT = App.Score.accuracyByTopic(st);
      const rows = topics.slice(0, 40).map((t) => {
        const a = accT[t.topic];
        const rate = a && a.n >= 4 ? App.pct(a.correct, a.n) : null;
        return h('button.btn.sm', {
          onclick: () => openStart(null, null, t.n, t.topic, t.topicTh),
          style: {
            margin: '0 6px 6px 0',
            borderColor: rate == null ? 'var(--line)' : rate >= 75 ? 'var(--ok)' : rate >= 50 ? 'var(--warn)' : 'var(--bad)',
          },
        }, `${t.topicTh} (${t.n})${rate != null ? ' · ' + rate + '%' : ''}`);
      });
      tw.appendChild(h('div.row.wrap', rows));
      tw.appendChild(h('div.tiny.faint.mt', '🟩 แม่นแล้ว · 🟨 ต้องทวน · 🟥 จุดอ่อน · ขาว = ยังไม่เคยฝึก'));
      wrap.appendChild(tw);
    }

    // ---- ชุดพิเศษ ----
    wrap.appendChild(h('div.sec-title', 'ชุดพิเศษ'));
    wrap.appendChild(h('div.grid2',
      h('button.btn', { onclick: () => startWeak(30), style: { textAlign: 'left' } }, '🎯 ซัดจุดอ่อน 30 ข้อ'),
      h('button.btn', { onclick: () => App.go('#/review'), style: { textAlign: 'left' } }, '🔧 ทวนข้อที่เคยผิด'),
      h('button.btn', { onclick: () => startMixed(50), style: { textAlign: 'left' } }, '🎲 คละทุกส่วน 50 ข้อ'),
      h('button.btn', { onclick: () => startSpeed(), style: { textAlign: 'left' } }, '⚡ ซ้อมความเร็ว Part 5')));
  });

  function openStart(part, tier, avail, topic, topicTh) {
    const label = topic ? topicTh : `${App.Score.PART_SHORT[part]}${tier ? ' · ' + TIER_TH[tier] : ''}`;
    const opts = [10, 20, 30, 50].filter((x) => x <= Math.max(10, avail));
    const body = h('div',
      h('div.small.muted', { style: { marginBottom: '12px' } }, `มีในคลัง ${avail} ข้อ · เฉลยทันทีทีละข้อ`),
      h('div.row.wrap', opts.map((n) =>
        h('button.btn.grow', { onclick: () => { m.close(); go(part, tier, topic, n, label); } }, `${n} ข้อ`))));
    const m = App.modal('เริ่มฝึก: ' + label, body, [{ label: 'ยกเลิก', kind: 'ghost' }]);
  }

  function go(part, tier, topic, n, label) {
    App.Data.selectDrill({ part, tier, topic, n }).then((units) => {
      if (!units.length) return App.toast('ไม่พบข้อในคลัง', 'bad');
      App.Quiz.start({
        units, mode: 'practice', title: label, backTo: '#/drill',
        onExit: () => App.go('#/drill'),
        onFinish: (res) => {
          App.Store.addAttempt({ mode: 'drill', part, tier, topic, label, items: res.items, ms: res.ms });
          App.Store.addXP(App.Store.XP.drillSet);
          App.pendingResult = res;
          App.go('#/result');
        },
      });
    });
  }

  function startMixed(n) {
    App.Data.selectDrill({ n }).then((units) => {
      if (!units.length) return App.toast('ไม่พบข้อในคลัง', 'bad');
      App.Quiz.start({
        units: App.shuffle(units), mode: 'practice', title: 'คละทุกส่วน', backTo: '#/drill',
        onExit: () => App.go('#/drill'),
        onFinish: (res) => {
          App.Store.addAttempt({ mode: 'drill', label: 'mixed', items: res.items, ms: res.ms });
          App.Store.addXP(App.Store.XP.drillSet);
          App.pendingResult = res;
          App.go('#/result');
        },
      });
    });
  }

  function startSpeed() {
    App.Data.selectDrill({ part: 5, n: 30 }).then((units) => {
      if (!units.length) return App.toast('ไม่พบข้อในคลัง', 'bad');
      App.toast('เป้าหมาย: 20 วินาทีต่อข้อ');
      App.Quiz.start({
        units, mode: 'practice', title: '⚡ ซ้อมความเร็ว Part 5', backTo: '#/drill',
        onExit: () => App.go('#/drill'),
        onFinish: (res) => {
          App.Store.addAttempt({ mode: 'drill', part: 5, label: 'speed', items: res.items, ms: res.ms });
          App.pendingResult = res;
          App.go('#/result');
        },
      });
    });
  }

  function startWeak(n) {
    App.Views.startPlanDrill({ type: 'weakspot', n }, null);
    const st = App.Store.state();
    const acc = App.Score.accuracyByTopic(st);
    const weak = Object.entries(acc).filter(([, v]) => v.n >= 4)
      .map(([k, v]) => ({ topic: k, rate: v.correct / v.n })).sort((a, b) => a.rate - b.rate).slice(0, 5);
    if (!weak.length) {
      App.toast('ยังไม่มีข้อมูลพอ — ทำข้อสอบสัก 40 ข้อก่อน', 'bad');
      return;
    }
    Promise.all(weak.map((w) => App.Data.selectDrill({ topic: w.topic, n: Math.ceil(n / weak.length) })))
      .then((a) => {
        const units = App.shuffle(a.flat());
        if (!units.length) return App.toast('ไม่พบข้อในคลัง', 'bad');
        App.Quiz.start({
          units, mode: 'practice', title: '🎯 ซัดจุดอ่อน', backTo: '#/drill',
          onExit: () => App.go('#/drill'),
          onFinish: (res) => {
            App.Store.addAttempt({ mode: 'drill', label: 'weakspot', items: res.items, ms: res.ms });
            App.pendingResult = res;
            App.go('#/result');
          },
        });
      });
  }
};

/* ---------- ทวนข้อที่เคยผิด (โหมดทำ) ---------- */

App.Views.review = function (root) {
  const cfg = App.pendingReview || {};
  App.pendingReview = null;
  root.appendChild(U.topbar('ทบทวนข้อที่เคยผิด', 'กำลังค้นหาข้อจากคลัง…'));
  const wrap = h('div', h('div.empty', 'กำลังโหลด…'));
  root.appendChild(wrap);

  App.Data.ensureAll().then(() => {
    const st = App.Store.state();
    const ids = Object.keys(st.mistakes).filter((k) => !st.mistakes[k].resolved);
    if (!ids.length) {
      App.clear(wrap);
      wrap.appendChild(U.emptyState('✨', 'ไม่มีข้อที่ค้างอยู่เลย<br>เยี่ยมมาก!',
        h('button.btn.primary', { onclick: () => App.go('#/drill') }, 'ไปฝึกข้อใหม่')));
      return;
    }
    // เรียงให้ข้อที่ผิดบ่อยและผิดนานแล้วขึ้นก่อน
    ids.sort((a, b) => {
      const ma = st.mistakes[a], mb = st.mistakes[b];
      return (mb.n || 0) - (ma.n || 0) || (ma.lastTs || 0) - (mb.lastTs || 0);
    });
    const want = cfg.n || 20;
    const units = [];
    const seenU = new Set();
    for (const id of ids) {
      const f = App.Data.findQ(id);
      if (!f || seenU.has(f.unit.id)) continue;
      seenU.add(f.unit.id);
      units.push(f.unit);
      if (App.sum(units.map((u) => u.n)) >= want) break;
    }
    if (!units.length) {
      App.clear(wrap);
      wrap.appendChild(U.emptyState('🤔', 'หาข้อเดิมไม่พบในคลัง<br>(อาจเป็นข้อจากชุดที่ถูกอัปเดตไปแล้ว)'));
      return;
    }
    App.Quiz.start({
      units, mode: 'practice', title: '🔧 ทวนข้อที่เคยผิด', backTo: '#/mistakes',
      onExit: () => App.go('#/mistakes'),
      onFinish: (res) => {
        App.Store.addAttempt({ mode: 'review', items: res.items, ms: res.ms });
        if (cfg.onDone) cfg.onDone();
        App.pendingResult = res;
        App.go('#/result');
      },
    });
  });
};

/* ---------- สมุดข้อผิด ---------- */

App.Views.mistakes = function (root) {
  const st = App.Store.state();
  root.appendChild(U.topbar('สมุดข้อที่ผิด', 'ทวนตรงนี้ให้คะแนนมากกว่าทำข้อใหม่',
    h('button.btn.icon.ghost', { onclick: () => window.print(), title: 'พิมพ์ / บันทึกเป็น PDF' }, '🖨')));

  const wrap = h('div', h('div.empty', 'กำลังโหลด…'));
  root.appendChild(wrap);

  App.Data.ensureAll().then(() => {
    App.clear(wrap);
    const all = Object.entries(st.mistakes);
    const open = all.filter(([, m]) => !m.resolved);
    const fixed = all.filter(([, m]) => m.resolved);

    wrap.appendChild(h('div.tiles',
      tile(String(open.length), 'ยังค้าง', open.length ? 'bad' : 'ok'),
      tile(String(fixed.length), 'แก้ได้แล้ว', 'ok'),
      tile(App.pct(fixed.length, all.length) + '%', 'อัตราแก้ได้', 'br')));

    if (!all.length) {
      wrap.appendChild(U.emptyState('📖', 'ยังไม่มีข้อที่ผิด<br>เมื่อทำข้อสอบแล้วตอบผิด ข้อนั้นจะถูกเก็บไว้ที่นี่อัตโนมัติ'));
      return;
    }

    if (open.length) {
      wrap.appendChild(h('button.btn.primary.block.lg.mt',
        { onclick: () => { App.pendingReview = { n: Math.min(30, open.length) }; App.go('#/review'); } },
        `🔧 ทวนข้อที่ค้าง ${Math.min(30, open.length)} ข้อ`));
    }

    // จัดกลุ่มตามหัวข้อ
    const byTopic = {};
    open.forEach(([qid, m]) => {
      const k = m.topic || ('part' + m.part);
      (byTopic[k] || (byTopic[k] = [])).push([qid, m]);
    });
    const groups = Object.entries(byTopic).sort((a, b) => b[1].length - a[1].length);

    if (groups.length) {
      wrap.appendChild(h('div.sec-title', 'ข้อที่ค้าง แยกตามหัวข้อ'));
      groups.forEach(([k, list]) => {
        const first = App.Data.findQ(list[0][0]);
        const name = (first && first.unit.topicTh) || k;
        const card = h('div.card.tight');
        card.appendChild(h('div.row',
          h('div.grow.b', name),
          h('span.pill.bad', list.length + ' ข้อ'),
          h('button.btn.sm', { onclick: () => reviewGroup(list) }, 'ทวนกลุ่มนี้')));
        wrap.appendChild(card);
      });
    }

    // รายการข้อแบบเต็ม (พิมพ์ได้)
    wrap.appendChild(h('div.sec-title', 'รายการข้อที่ค้างทั้งหมด'));
    const listWrap = h('div');
    wrap.appendChild(listWrap);
    open.slice(0, 120).forEach(([qid, m]) => {
      const f = App.Data.findQ(qid);
      if (!f) return;
      const q = f.unit.qs[f.qi];
      const card = h('div.card.tight');
      card.appendChild(h('div.row.tiny.faint',
        h('span.tag', App.Score.PART_SHORT[f.unit.part]),
        f.unit.topicTh ? h('span.tag', f.unit.topicTh) : null,
        h('span.grow'),
        h('span', `ผิด ${m.n} ครั้ง`)));
      card.appendChild(h('div', { style: { margin: '7px 0', fontWeight: '550' }, html: U.stemHTML(q.q || '(เป็นข้อฟัง)') }));
      card.appendChild(h('div.small',
        h('span', { style: { color: 'var(--ok)' } }, `✓ ${U.LETTERS[q.answer]}. ${q.choices[q.answer]}`)));
      if (m.lastCh != null && m.lastCh >= 0 && m.lastCh !== q.answer) {
        card.appendChild(h('div.small', h('span', { style: { color: 'var(--bad)' } },
          `✕ คุณตอบ ${U.LETTERS[m.lastCh]}. ${q.choices[m.lastCh]}`)));
      }
      if (q.explain && q.explain.why) card.appendChild(h('div.small.muted', { style: { marginTop: '6px' } }, '💡 ' + q.explain.why));
      if (st.notes[qid]) card.appendChild(h('div.small', { style: { marginTop: '6px', color: 'var(--warn)' } }, '📝 ' + st.notes[qid]));
      listWrap.appendChild(card);
    });
    if (open.length > 120) {
      listWrap.appendChild(h('div.small.faint.center', `แสดง 120 ข้อแรกจาก ${open.length} ข้อ`));
    }
  });

  function tile(v, k, cls) {
    return h('div.tile', h('div.v' + (cls ? '.' + cls : ''), v), h('div.k', k));
  }

  function reviewGroup(list) {
    const units = [];
    const seen = new Set();
    list.forEach(([qid]) => {
      const f = App.Data.findQ(qid);
      if (f && !seen.has(f.unit.id)) { seen.add(f.unit.id); units.push(f.unit); }
    });
    if (!units.length) return App.toast('ไม่พบข้อในคลัง', 'bad');
    App.Quiz.start({
      units, mode: 'practice', title: '🔧 ทวนกลุ่ม', backTo: '#/mistakes',
      onExit: () => App.go('#/mistakes'),
      onFinish: (res) => {
        App.Store.addAttempt({ mode: 'review', items: res.items, ms: res.ms });
        App.pendingResult = res;
        App.go('#/result');
      },
    });
  }
};
