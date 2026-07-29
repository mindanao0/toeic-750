/* ============================================================
   76-views-cards — แฟลชการ์ดคำศัพท์แบบทวนอัจฉริยะ (SRS)
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

App.Views.cards = function (root) {
  const cfg = App.pendingCards || {};
  App.pendingCards = null;

  root.appendChild(U.topbar('คำศัพท์', 'ทวนแบบเว้นระยะ — คำที่ผิดจะโผล่มาบ่อยขึ้น'));
  const wrap = h('div', h('div.empty', 'กำลังโหลดคลังคำศัพท์…'));
  root.appendChild(wrap);

  App.Data.vocab().then((all) => {
    App.clear(wrap);
    if (!all.length) {
      wrap.appendChild(U.emptyState('⏳', 'คลังคำศัพท์กำลังจัดทำ'));
      return;
    }
    const stt = App.SRS.stats(all);
    const queue = App.SRS.due(all, cfg.n || 20, cfg.n ? cfg.n + 10 : 60);

    if (!queue.length) {
      wrap.appendChild(U.emptyState('✅',
        `ทวนครบแล้วสำหรับวันนี้<br><span class="small">จำได้แน่นแล้ว ${stt.mature} คำ · กำลังจำ ${stt.young + stt.learning} คำ</span>`,
        h('button.btn', { onclick: () => startSession(App.pick(all, 20), all, cfg) }, 'ทวนเพิ่มแบบสุ่ม 20 คำ')));
      renderStats(wrap, stt, all);
      return;
    }

    wrap.appendChild(h('div.card',
      h('div.row',
        h('div.grow',
          h('div.b', `พร้อมทวน ${queue.length} คำ`),
          h('div.small.muted', `ครบกำหนด ${stt.dueNow} คำ · คำใหม่ ${Math.max(0, queue.length - stt.dueNow)} คำ`)),
        h('span.pill.ok', `จำได้แล้ว ${stt.mature}`)),
      h('button.btn.primary.block.lg.mt', { onclick: () => startSession(queue, all, cfg) }, 'เริ่มทวน →')));

    renderStats(wrap, stt, all);
    wrap.appendChild(h('button.btn.block.mt', { onclick: () => browse(all) }, '📚 เปิดดูคลังคำศัพท์ทั้งหมด'));
  });
};

function renderStats(wrap, stt, all) {
  wrap.appendChild(h('div.sec-title', 'ความคืบหน้าคำศัพท์'));
  wrap.appendChild(h('div.card',
    U.hbars([
      { label: 'จำได้แน่น', pct: App.pct(stt.mature, stt.total), value: stt.mature, color: 'var(--ok)' },
      { label: 'กำลังจำ', pct: App.pct(stt.young, stt.total), value: stt.young, color: 'var(--brand)' },
      { label: 'เพิ่งเริ่ม', pct: App.pct(stt.learning, stt.total), value: stt.learning, color: 'var(--warn)' },
      { label: 'ยังไม่เจอ', pct: App.pct(stt.untouched, stt.total), value: stt.untouched, color: 'var(--line)' },
    ]),
    h('div.small.faint.mt', `คลังทั้งหมด ${stt.total} คำ`)));
}

/* ---------- ตัวรันแฟลชการ์ด ---------- */

function startSession(queue, all, cfg) {
  const root = App.$('#app');
  let list = queue.slice();
  let i = 0;
  let revealed = false;
  let done = 0;
  let againQueue = [];
  const startTs = Date.now();

  draw();

  function current() {
    if (i < list.length) return list[i];
    if (againQueue.length) {
      list = againQueue;
      againQueue = [];
      i = 0;
      return list[0];
    }
    return null;
  }

  function draw() {
    App.clear(root);
    const w = current();
    if (!w) return finish();

    const total = queue.length;
    root.appendChild(U.topbar('ทวนคำศัพท์', `${done + 1} / ${total}`,
      h('button.btn.icon.ghost', { onclick: () => finish(true) }, '✕')));
    root.appendChild(h('div.bar.thin', { style: { marginBottom: '14px' } },
      h('i', { style: { width: App.pct(done, total) + '%' } })));

    const card = h('div.fc');
    card.appendChild(h('div.w', w.w));
    if (w.ipa) card.appendChild(h('div.ipa', w.ipa));
    if (w.th) card.appendChild(h('div.thr', { html: App.mdBold(w.th) }));
    card.appendChild(h('button.btn.sm.ghost', { onclick: () => App.TTS.say(w.w, 'US'), style: { marginTop: '4px' } }, '🔊 ฟัง'));

    if (revealed) {
      card.appendChild(h('hr.sep', { style: { width: '100%' } }));
      if (w.pos) card.appendChild(h('div.pos', w.pos));
      card.appendChild(h('div.mean', w.mean));
      if (w.ex) {
        card.appendChild(h('div.ex', { onclick: () => App.TTS.say(w.ex, 'US') }, '"' + w.ex + '" 🔊'));
        if (w.exTh) card.appendChild(h('div.exth', w.exTh));
      }
    }
    root.appendChild(card);

    const c = App.SRS.get(w.id);
    root.appendChild(h('div.row.tiny.faint', { style: { justifyContent: 'center', marginTop: '8px' } },
      h('span', c ? `เคยทวน ${c.reps} ครั้ง · ระยะถัดไป ${c.iv} วัน` : 'คำใหม่'),
    ));

    if (!revealed) {
      root.appendChild(h('button.btn.primary.block.lg.mt', { onclick: () => { revealed = true; draw(); } }, 'ดูความหมาย'));
      root.appendChild(h('div.center.tiny.faint.mt', 'ลองนึกความหมายในใจก่อนกด — จะจำได้ดีกว่ามาก'));
    } else {
      const G = App.SRS.GRADE;
      root.appendChild(h('div.grid2.mt',
        gbtn('😵 ไม่รู้เลย', G.again, 'danger'),
        gbtn('😐 นึกออกยาก', G.hard, ''),
        gbtn('🙂 จำได้', G.good, ''),
        gbtn('😎 ง่ายมาก', G.easy, 'ok')));
    }

    function gbtn(label, grade, kind) {
      return h('button.btn' + (kind ? '.' + kind : ''), { onclick: (ev) => grade_(w, grade, ev) }, label);
    }
  }

  function grade_(w, g, ev) {
    App.SRS.review(w.id, g);
    App.Store.addXP(App.Store.XP.cardReview, ev);
    if (g === App.SRS.GRADE.again) againQueue.push(w);
    else done++;
    i++;
    revealed = false;
    draw();
  }

  function finish(early) {
    App.Store.markStudiedToday();
    App.Store.checkBadges();
    if (cfg && cfg.onDone && !early) cfg.onDone();
    App.clear(root);
    root.appendChild(U.topbar('ทวนคำศัพท์เสร็จ', ''));
    root.appendChild(h('div.card', { style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '3rem' } }, done >= queue.length ? '🎉' : '👍'),
      h('div', { style: { fontSize: '2rem', fontWeight: '800' } }, `${done} คำ`),
      h('div.small.muted', `ใช้เวลา ${App.fmtDur(Date.now() - startTs)}`)));
    root.appendChild(h('div.row.mt',
      h('button.btn.grow', { onclick: () => App.go('#/cards') }, 'ทวนต่อ'),
      h('button.btn.primary.grow', { onclick: () => App.go('#/') }, 'กลับหน้าแรก')));
  }
}

/* ---------- เปิดดูคลังคำศัพท์ ---------- */

function browse(all) {
  const root = App.$('#app');
  App.clear(root);
  let q = '';
  let tag = '';

  const tags = App.uniq(all.flatMap((w) => w.tags || [])).sort();

  const listWrap = h('div');
  const input = h('input', { type: 'text', placeholder: 'ค้นหาคำศัพท์ / ความหมายไทย…', oninput: (e) => { q = e.target.value.trim().toLowerCase(); redraw(); } });

  root.appendChild(U.topbar('คลังคำศัพท์', `${all.length} คำ`, U.backBtn('#/cards')));
  root.appendChild(h('div.card.tight', input,
    h('div.row.wrap', { style: { marginTop: '9px' } },
      [h('button.btn.sm', { onclick: () => { tag = ''; redraw(); } }, 'ทั้งหมด')].concat(
        tags.map((t) => h('button.btn.sm', { onclick: () => { tag = t; redraw(); } }, t))))));
  root.appendChild(listWrap);
  redraw();

  function redraw() {
    App.clear(listWrap);
    const st = App.Store.state();
    const rows = all.filter((w) => {
      if (tag && !(w.tags || []).includes(tag)) return false;
      if (!q) return true;
      return w.w.toLowerCase().includes(q) || String(w.mean).toLowerCase().includes(q);
    });
    listWrap.appendChild(h('div.small.faint', { style: { margin: '10px 2px' } }, `พบ ${rows.length} คำ`));
    rows.slice(0, 400).forEach((w) => {
      const c = st.srs[w.id];
      const lvl = !c ? '' : c.iv >= 7 ? 'ok' : c.iv >= 2 ? 'on' : 'warn';
      listWrap.appendChild(h('div.card.tight',
        h('div.row',
          h('div.grow',
            h('div', h('b', w.w), ' ', h('span.tiny.faint', w.ipa || '')),
            h('div.tiny', { style: { color: 'var(--brand)' }, html: App.mdBold(w.th || '') }),
            h('div.small.muted', (w.pos ? w.pos + ' ' : '') + w.mean)),
          h('button.btn.sm.ghost', { onclick: () => App.TTS.say(w.w, 'US') }, '🔊'),
          lvl ? h('span.pill.' + lvl, c.iv >= 7 ? 'จำได้' : c.iv >= 2 ? 'กำลังจำ' : 'เพิ่งเริ่ม') : null),
        w.ex ? h('div.tiny.faint', { style: { marginTop: '5px', fontStyle: 'italic' } }, w.ex) : null));
    });
    if (rows.length > 400) listWrap.appendChild(h('div.small.faint.center', 'แสดง 400 คำแรก — ใช้ช่องค้นหาเพื่อกรอง'));
  }
}
