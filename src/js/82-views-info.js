/* ============================================================
   82-views-info — สรุปไวยากรณ์ / ข้อมูลการสอบ / ตั้งค่า
   ============================================================ */
'use strict';

const h = App.h;
const U = App.UI;

/* ---------- สรุปไวยากรณ์ ---------- */

App.Views.cheatsheet = function (root) {
  root.appendChild(U.topbar('สรุปไวยากรณ์', 'เปิดดูเร็ว ใช้ทวนก่อนสอบ',
    h('button.btn.icon.ghost', { onclick: () => window.print(), title: 'พิมพ์' }, '🖨')));
  const wrap = h('div', h('div.empty', 'กำลังโหลด…'));
  root.appendChild(wrap);

  App.Data.staticDoc('cheatsheet').then((doc) => {
    App.clear(wrap);
    if (!doc || !doc.sections) {
      wrap.appendChild(U.emptyState('⏳', 'สรุปไวยากรณ์กำลังจัดทำ'));
      return;
    }
    // สารบัญ
    const toc = h('div.card.tight',
      h('div.tiny.b.faint', { style: { marginBottom: '8px' } }, 'สารบัญ'),
      h('div.row.wrap', doc.sections.map((s, i) =>
        h('button.btn.sm', { onclick: () => { const t = App.$('#cs-' + i); if (t) t.scrollIntoView({ behavior: 'smooth' }); } }, s.title))));
    wrap.appendChild(toc);

    doc.sections.forEach((s, i) => {
      const card = h('div.card', { id: 'cs-' + i });
      card.appendChild(h('h2', s.title));
      (s.blocks || []).forEach((b) => card.appendChild(App.Views.blockEl(b)));
      wrap.appendChild(card);
    });
  });
};

/* บล็อกเนื้อหาที่ใช้ร่วมกับบทเรียน */
App.Views.blockEl = function (b) {
  switch (b.type) {
    case 'text': return h('p.lb-text', { html: App.mdBold(b.th || b.text || '') });
    case 'example': {
      const el = h('div.lb-ex',
        h('div.en', b.en), b.th ? h('div.th', b.th) : null,
        b.note ? h('div.nt', { html: App.mdBold(b.note) }) : null);
      const btn = h('button.btn.sm.ghost', { onclick: () => App.TTS.say(b.en, 'US'), style: { float: 'right', marginLeft: '8px' } }, '🔊');
      el.insertBefore(btn, el.firstChild);
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
        r.forEach((c) => tr.appendChild(h('td', { html: App.mdBold(String(c)) })));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      w.appendChild(t);
      return w;
    }
    case 'tip': return h('div.lb-tip', h('span', '💡'), h('div', { html: App.mdBold(b.th || '') }));
    case 'warn': return h('div.lb-warn', h('span', '⚠️'), h('div', { html: App.mdBold(b.th || '') }));
    default: return h('p.lb-text', { html: App.mdBold(b.th || b.text || '') });
  }
};

/* ---------- ข้อมูลการสอบจริง ---------- */

App.Views.examinfo = function (root) {
  root.appendChild(U.topbar('ข้อมูลการสอบจริง', 'TOEIC Listening & Reading ในประเทศไทย'));
  const wrap = h('div', h('div.empty', 'กำลังโหลด…'));
  root.appendChild(wrap);

  App.Data.staticDoc('examinfo').then((doc) => {
    App.clear(wrap);

    // ส่วนที่แอปรู้แน่นอน (โครงสร้างข้อสอบ) แสดงเสมอ
    wrap.appendChild(h('div.card',
      h('h2', 'โครงสร้างข้อสอบ'),
      App.Views.blockEl({
        type: 'table',
        head: ['ส่วน', 'จำนวนข้อ', 'เวลา'],
        rows: [
          ['Part 1 · รูปภาพ', '6', 'รวมฝั่งฟัง 45 นาที'],
          ['Part 2 · ถาม-ตอบ', '25', ''],
          ['Part 3 · บทสนทนา', '39', ''],
          ['Part 4 · บทพูด', '30', ''],
          ['Part 5 · เติมคำในประโยค', '30', 'รวมฝั่งอ่าน 75 นาที'],
          ['Part 6 · เติมคำในบทความ', '16', ''],
          ['Part 7 · อ่านจับใจความ', '54', ''],
          ['**รวม**', '**200**', '**2 ชั่วโมง**'],
        ],
      }),
      h('div.small.muted', 'คะแนนฝั่งละ 5–495 รวม 10–990 · ตอบผิดไม่ติดลบ จึงต้องฝนให้ครบทุกข้อเสมอ')));

    wrap.appendChild(h('div.card',
      h('h2', 'คะแนนแต่ละช่วงหมายถึงอะไร'),
      App.Views.blockEl({
        type: 'table',
        head: ['ช่วงคะแนน', 'ความหมาย'],
        rows: [
          ['905–990', 'ใช้งานได้ใกล้เคียงเจ้าของภาษา'],
          ['785–900', 'สื่อสารในงานได้คล่อง — บริษัทส่วนใหญ่พอใจระดับนี้'],
          ['**605–780**', '**สื่อสารในงานได้ระดับพื้นฐาน — เป้า 750 อยู่ในช่วงนี้**'],
          ['405–600', 'สื่อสารเรื่องง่ายๆ ได้บ้าง'],
          ['255–400', 'เริ่มต้น เข้าใจประโยคสั้นๆ'],
          ['10–250', 'ยังต้องสร้างพื้นฐาน'],
        ],
      })));

    if (!doc || !doc.sections) {
      wrap.appendChild(h('div.card', { style: { borderColor: 'var(--warn)' } },
        h('div.b', '⏳ ข้อมูลศูนย์สอบกำลังจัดทำ'),
        h('div.small.muted', { style: { marginTop: '6px' } },
          'ค่าสอบ วันสอบ และวิธีสมัครเปลี่ยนแปลงได้ตลอด จึงต้องตรวจสอบกับศูนย์สอบโดยตรง ' +
          'ค้นหา "TOEIC ศูนย์สอบ ประเทศไทย" หรือดูที่ ets.org')));
      return;
    }

    if (doc.disclaimer) {
      wrap.appendChild(h('div.card', { style: { borderColor: 'var(--warn)', background: 'var(--warn-sf)' } },
        h('div.small', '⚠️ ' + doc.disclaimer),
        doc.updatedAt ? h('div.tiny.faint', { style: { marginTop: '4px' } }, 'ข้อมูลรวบรวมเมื่อ ' + doc.updatedAt) : null));
    }

    doc.sections.forEach((s) => {
      const card = h('div.card');
      card.appendChild(h('h2', s.title));
      (s.blocks || []).forEach((b) => card.appendChild(App.Views.blockEl(b)));
      wrap.appendChild(card);
    });

    if (doc.links && doc.links.length) {
      wrap.appendChild(h('div.card',
        h('h2', 'ลิงก์ที่เกี่ยวข้อง'),
        h('div', doc.links.map((l) =>
          h('div', { style: { padding: '5px 0' } },
            h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label + ' ↗'))))));
    }
  });
};

/* ---------- ตั้งค่า ---------- */

App.Views.settings = function (root) {
  const st = App.Store.state();
  const s = st.settings;

  root.appendChild(U.topbar('ตั้งค่า', ''));

  /* --- หน้าตา --- */
  root.appendChild(h('div.card',
    h('h2', 'หน้าตา'),
    h('label.field',
      h('span', 'ธีม'),
      h('div.seg',
        segBtn('มืด', s.theme === 'dark', () => setTheme('dark')),
        segBtn('สว่าง', s.theme === 'light', () => setTheme('light')),
        segBtn('ตามเครื่อง', s.theme === 'auto', () => setTheme('auto')))),
    h('label.field',
      h('span', `ขนาดตัวอักษร — ${Math.round(s.fontScale * 100)}%`),
      h('input', {
        type: 'range', min: '0.85', max: '1.45', step: '0.05', value: String(s.fontScale),
        oninput: (e) => { s.fontScale = Number(e.target.value); App.applyTheme(); App.Store.save(); App.rerender(); },
      }))));

  /* --- เสียง --- */
  const voiceCard = h('div.card', h('h2', 'เสียงอ่าน (Listening)'));
  root.appendChild(voiceCard);

  voiceCard.appendChild(h('label.field',
    h('span', `ความเร็วเสียง — ${s.ttsRate}x`),
    h('input', {
      type: 'range', min: '0.7', max: '1.3', step: '0.05', value: String(s.ttsRate),
      oninput: (e) => { s.ttsRate = Number(e.target.value); App.Store.save(); e.target.previousSibling.textContent = `ความเร็วเสียง — ${s.ttsRate}x`; },
    })));

  voiceCard.appendChild(h('label.field',
    h('span', 'สำเนียง'),
    h('div.seg',
      segBtn('สลับ 4 สำเนียง (เหมือนของจริง)', s.accentMode === 'mixed', () => { s.accentMode = 'mixed'; App.Store.save(); App.rerender(); }),
      segBtn('อเมริกันอย่างเดียว', s.accentMode === 'us', () => { s.accentMode = 'us'; App.Store.save(); App.rerender(); }))));

  const SAMPLE = 'The quarterly sales report is due on Friday afternoon.';
  const diag = h('div', h('div.small.faint', 'กำลังตรวจเสียงในเครื่อง…'));
  voiceCard.appendChild(diag);

  const drawDiag = () => {
    App.clear(diag);
    if (!App.TTS.supported()) {
      diag.appendChild(h('div.lb-warn', h('span', '⚠️'),
        h('div', 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน — ใช้ Chrome, Edge หรือ Safari รุ่นใหม่')));
      return;
    }

    const q = App.TTS.quality();
    if (q.level === 'poor' || q.level === 'none') {
      diag.appendChild(h('div.lb-warn', h('span', q.level === 'none' ? '⏳' : '🤖'), h('div', q.msg)));
    } else if (q.level === 'ok') {
      diag.appendChild(h('div.small.faint', 'ℹ️ ' + q.msg));
    } else {
      diag.appendChild(h('div.small', { style: { color: 'var(--ok)' } }, '✓ ' + q.msg));
    }

    const av = App.TTS.availableAccents();
    const all = App.TTS.listVoices();

    diag.appendChild(h('div.small.faint', { style: { margin: '12px 0 6px' } },
      'แต่ละสำเนียง — กดลำโพงเพื่อฟัง เปลี่ยนเสียงได้ถ้าไม่ถูกใจ'));

    ['US', 'UK', 'CA', 'AU'].forEach((a) => {
      const info = av[a];
      const pinned = s.voiceMap[a] || '';
      const auto = App.TTS.voiceFor(a);

      const sel = h('select', {
        style: { flex: '1', minWidth: '0' },
        onchange: (e) => {
          if (e.target.value) s.voiceMap[a] = e.target.value;
          else delete s.voiceMap[a];
          App.Store.save(true);
          App.TTS.say(SAMPLE, a);
        },
      },
        h('option', { value: '' }, `อัตโนมัติ${auto ? ' — ' + auto.name : ''}`),
        all
          .slice()
          .sort((x, y) => App.TTS.voiceScore(y) - App.TTS.voiceScore(x))
          .map((v) => h('option', { value: v.voiceURI, selected: pinned === v.voiceURI },
            `${v.name} (${v.lang})${App.TTS.voiceScore(v) <= -100 ? ' ⚠️ หุ่นยนต์' : App.TTS.voiceScore(v) >= 60 ? ' ⭐' : ''}`)));

      const badge = info.quality === 'good' ? h('span.pill.ok', 'ดี')
        : info.quality === 'poor' ? h('span.pill.bad', 'หุ่นยนต์')
        : info.ok ? h('span.pill', 'ใช้ได้')
        : h('span.pill.warn', 'ไม่มี → ใช้เสียงใกล้เคียง');

      diag.appendChild(h('div', { style: { marginBottom: '10px' } },
        h('div.row', { style: { marginBottom: '4px' } },
          h('span.small.b', { style: { flex: '0 0 78px' } }, App.TTS.ACCENT_TH[a]),
          badge),
        h('div.row',
          h('button.btn.sm', { onclick: () => App.TTS.say(SAMPLE, a) }, '🔊'),
          sel)));
    });

    diag.appendChild(h('div.tiny.faint',
      'เสียงที่ขึ้น ⭐ คือเสียงคุณภาพสูง · เสียงที่ขึ้น ⚠️ เป็นเสียงสังเคราะห์พื้นฐานที่ฟังเป็นหุ่นยนต์ ' +
      'ถ้าในลิสต์ไม่มีเสียงดีเลย ให้ลองเปิดแอปบนมือถือ เสียงในมือถือดีกว่าคอมมาก'));

    diag.appendChild(h('button.btn.sm.block.mt', {
      onclick: () => {
        App.TTS.speakSeq([
          { text: 'Where did you put the sales report?', accent: 'US', sp: 'M', gap: 800 },
          { text: 'On your desk, next to the printer.', accent: 'AU', sp: 'W', gap: 600 },
          { text: 'Yes, I finished it yesterday.', accent: 'AU', sp: 'W', gap: 600 },
          { text: 'It was very informative.', accent: 'AU', sp: 'W' },
        ]);
      },
    }, '🎧 ลองฟังแบบข้อสอบ Part 2 จริง (คำถาม + 3 ตัวเลือก)'));
  };

  drawDiag();
  setTimeout(drawDiag, 900);
  setTimeout(drawDiag, 2200);

  /* --- การเรียน --- */
  root.appendChild(h('div.card',
    h('h2', 'การเรียน'),
    sw('ปุ่มช่วยเหลือในโหมดฝึก', 'ปุ่มดูคำแปลและตัดตัวเลือกผิด (โหมดสอบจะปิดเสมอ)', s.helpBtn, (v) => { s.helpBtn = v; App.Store.save(); }),
    h('label.field', { style: { marginTop: '10px' } },
      h('span', 'วันเริ่มต้นแผน 30 วัน'),
      h('input', {
        type: 'date', value: st.plan.startDate,
        onchange: (e) => {
          if (!e.target.value) return;
          st.plan.startDate = e.target.value;
          App.Store.save(true);
          App.toast('ปรับวันเริ่มต้นแล้ว', 'ok');
          App.rerender();
        },
      })),
    h('label.field',
      h('span', 'วันสอบจริง (ถ้าจองแล้ว)'),
      h('input', {
        type: 'date', value: st.plan.examDate || '',
        onchange: (e) => { st.plan.examDate = e.target.value || null; App.Store.save(true); App.rerender(); },
      })),
    st.plan.examDate
      ? h('div.small', { style: { color: 'var(--brand)' } },
          `เหลืออีก ${Math.max(0, App.daysBetween(App.today(), st.plan.examDate))} วันถึงวันสอบ`)
      : null));

  /* --- แจ้งเตือน --- */
  const nCard = h('div.card', h('h2', 'แจ้งเตือนรายวัน'));
  root.appendChild(nCard);
  nCard.appendChild(sw('เปิดแจ้งเตือน', 'เตือนให้เข้ามาเรียนทุกวัน', s.reminderOn, (v) => {
    s.reminderOn = v;
    App.Store.save();
    if (v) App.Notify.enable();
  }));
  nCard.appendChild(h('label.field', { style: { marginTop: '10px' } },
    h('span', 'เวลาแจ้งเตือน'),
    h('input', {
      type: 'time', value: s.reminderTime,
      onchange: (e) => { s.reminderTime = e.target.value || '20:00'; App.Store.save(true); App.Notify.enable(); App.toast('ตั้งเวลาแล้ว', 'ok'); },
    })));
  const nStat = h('div.small.faint');
  nCard.appendChild(nStat);
  nStat.textContent = App.Notify.statusText();
  nCard.appendChild(h('button.btn.sm.mt', { onclick: () => App.Notify.test() }, 'ทดสอบแจ้งเตือน'));

  /* --- ซิงก์ข้ามเครื่อง --- */
  root.appendChild(syncCard());

  /* --- ข้อมูล --- */
  root.appendChild(h('div.card',
    h('h2', 'ข้อมูลของคุณ'),
    h('div.small.muted', { style: { marginBottom: '10px' } },
      'ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีการส่งออกไปที่ไหน ' +
      'ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ข้อมูลจะหาย — ควรกดสำรองไว้เป็นระยะ'),
    h('div.grid2',
      h('button.btn', { onclick: backup }, '💾 สำรองข้อมูล'),
      h('button.btn', { onclick: restore }, '📥 กู้คืนข้อมูล')),
    h('div.small.faint.mt',
      `เริ่มใช้เมื่อ ${App.thaiDate(App.ymd(st.createdAt))} · ทำข้อสอบแล้ว ${App.Store.totalAnswered(st)} ข้อ · ` +
      `ขนาดข้อมูล ~${Math.round(App.Store.exportJSON().length / 1024)} KB`),
    h('button.btn.danger.block.mt', { onclick: resetAsk }, '🗑 ล้างข้อมูลทั้งหมด')));

  root.appendChild(h('div.card',
    h('h2', 'เกี่ยวกับ'),
    h('div.small.muted',
      'TOEIC 750 in 30 Days · ข้อสอบทั้งหมดในแอปนี้เขียนขึ้นใหม่โดยเลียนแบบรูปแบบและระดับความยากของข้อสอบจริง ' +
      'ไม่ได้คัดลอกจากข้อสอบของ ETS · TOEIC เป็นเครื่องหมายการค้าของ ETS ซึ่งไม่มีส่วนเกี่ยวข้องกับแอปนี้'),
    h('div.tiny.faint.mt', `เวอร์ชันแอป ${App.BUILD || 'dev'} · เวอร์ชันข้อมูล ${st.v}`),
    h('button.btn.sm.block.mt', {
      onclick: () => {
        if (!('serviceWorker' in navigator)) return App.toast('เวอร์ชันนี้ไม่ได้ติดตั้งเป็นแอป', 'bad');
        navigator.serviceWorker.getRegistration().then((r) => {
          if (!r) return App.toast('ยังไม่ได้ติดตั้งเป็นแอป', 'bad');
          App.toast('กำลังตรวจเวอร์ชันใหม่…');
          r.update().then(() => setTimeout(() => {
            if (!r.waiting && !r.installing) App.toast('ใช้เวอร์ชันล่าสุดอยู่แล้ว', 'ok');
          }, 2500));
        });
      },
    }, '🔄 ตรวจหาเวอร์ชันใหม่')));

  /* ---------- การ์ดซิงก์ข้ามเครื่อง ---------- */
  function syncCard() {
    const card = h('div.card');
    const draw = () => {
      App.clear(card);
      const st2 = App.Sync.status();
      card.appendChild(h('h2', 'ซิงก์ข้ามเครื่อง'));

      if (!st2.available) {
        card.appendChild(h('div.lb-warn', h('span', '🔒'),
          h('div', 'หน้านี้เปิดจากลิงก์ Artifact ซึ่งถูกบล็อกไม่ให้ต่ออินเทอร์เน็ตออกไปไหน ' +
            'ซิงก์จึงใช้ที่นี่ไม่ได้ — ให้เปิดจากลิงก์ GitHub Pages แทน แล้วใช้ลิงก์นั้นเป็นหลักทุกเครื่อง')));
        card.appendChild(h('div.small.muted', { style: { marginTop: '8px' } },
          'ระหว่างนี้ยังใช้ปุ่มสำรอง/กู้คืนข้อมูลด้านล่างย้ายข้อมูลด้วยมือได้'));
        return;
      }

      if (!st2.connected) {
        card.appendChild(h('div.small.muted', { style: { marginBottom: '12px' } },
          'เก็บความคืบหน้าไว้ใน gist ส่วนตัวของบัญชี GitHub ของคุณเอง เปิดเครื่องไหนก็ต่อกัน ' +
          'ไม่มีค่าใช้จ่าย และไม่มีใครเห็นข้อมูลนอกจากคุณ'));

        card.appendChild(h('div.card.flat.tight.small',
          h('div.b', { style: { marginBottom: '6px' } }, 'วิธีเอาโทเคน (ทำครั้งเดียว)'),
          h('div', { style: { lineHeight: '1.9' } },
            '1. เปิด ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=gist&description=TOEIC750%20sync', target: '_blank', rel: 'noopener noreferrer' }, 'หน้าสร้างโทเคนของ GitHub ↗'), h('br'),
            '2. ช่อง Expiration เลือก 90 days (หรือมากกว่า)', h('br'),
            '3. ติ๊กเฉพาะช่อง ', h('b', 'gist'), ' ช่องเดียว ห้ามติ๊กอย่างอื่น', h('br'),
            '4. กด Generate token แล้วคัดลอกรหัสที่ขึ้นต้นด้วย ghp_', h('br'),
            '5. เอามาวางในช่องข้างล่างนี้')));

        const inp = h('input', { type: 'text', placeholder: 'ghp_xxxxxxxxxxxx', autocomplete: 'off', spellcheck: 'false' });
        const btn = h('button.btn.primary.block.mt', 'เชื่อมต่อ');
        btn.addEventListener('click', () => {
          const v = inp.value.trim();
          if (!v) return App.toast('ยังไม่ได้ใส่โทเคน', 'bad');
          btn.disabled = true;
          btn.textContent = 'กำลังเชื่อมต่อ…';
          App.Sync.connect(v)
            .then((r) => {
              App.toast(`เชื่อมกับบัญชี ${r.login} แล้ว`, 'ok');
              return App.Sync.syncNow();
            })
            .then(draw)
            .catch((e) => {
              btn.disabled = false;
              btn.textContent = 'เชื่อมต่อ';
              App.toast('เชื่อมไม่สำเร็จ: ' + e.message, 'bad');
            });
        });
        card.appendChild(h('label.field', { style: { marginTop: '12px' } }, h('span', 'โทเคน GitHub (สิทธิ์ gist เท่านั้น)'), inp));
        card.appendChild(btn);
        card.appendChild(h('div.tiny.faint.mt',
          '⚠️ โทเคนถูกเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ถูกส่งขึ้น gist และไม่ติดไปกับไฟล์สำรอง ' +
          'ถ้าเครื่องหาย ให้เข้า GitHub แล้วกด Revoke โทเคนตัวนี้ทิ้ง'));
        return;
      }

      const when = st2.lastAt ? new Date(st2.lastAt) : null;
      const pad = (n) => String(n).padStart(2, '0');
      card.appendChild(h('div.row',
        h('span.pill.ok', '✓ เชื่อมต่อแล้ว'),
        h('span.grow'),
        h('span.tiny.faint', when ? `ล่าสุด ${pad(when.getHours())}:${pad(when.getMinutes())} น.` : 'ยังไม่เคยซิงก์')));

      if (st2.lastErr) {
        card.appendChild(h('div.lb-warn', { style: { marginTop: '10px' } }, h('span', '⚠️'), h('div', st2.lastErr)));
      }

      card.appendChild(h('div.small.muted', { style: { margin: '10px 0' } },
        'ระบบจะดึงของเครื่องอื่นมารวมให้ตอนเปิดแอป และส่งขึ้นให้เองหลังหยุดใช้งานสักครู่ ' +
        'ข้อมูลรวมกันแบบไม่ทับของเดิม — ประวัติการทำข้อสอบรวมกัน คำศัพท์เอาอันที่ทวนล่าสุด'));

      const sBtn = h('button.btn.grow', st2.busy ? 'กำลังซิงก์…' : '🔄 ซิงก์เดี๋ยวนี้');
      sBtn.disabled = st2.busy;
      sBtn.addEventListener('click', () => {
        sBtn.disabled = true;
        sBtn.textContent = 'กำลังซิงก์…';
        App.Sync.syncNow().then(draw).catch(draw);
      });

      card.appendChild(h('div.row',
        sBtn,
        h('button.btn.danger', {
          onclick: () => App.confirmBox('ปิดซิงก์',
            'ข้อมูลในเครื่องนี้จะยังอยู่ครบ และข้อมูลใน gist ก็ยังอยู่ แค่หยุดส่งขึ้น-ดึงลง ต้องการปิดไหม',
            () => { App.Sync.disconnect(true); draw(); }, 'ปิดซิงก์'),
        }, 'ปิด')));

      card.appendChild(h('div.tiny.faint.mt',
        `เก็บที่ gist ${st2.gistId.slice(0, 8)}… (ส่วนตัว) · ` +
        'เปิดแอปเครื่องใหม่แล้วใส่โทเคนเดิม ข้อมูลจะตามไปเอง'));
    };

    draw();
    App.Sync.onChange(() => { if (card.isConnected) draw(); });
    return card;
  }

  function segBtn(label, on, fn) {
    return h('button' + (on ? '.on' : ''), { onclick: fn, class: on ? 'on' : '' }, label);
  }
  function sw(label, sub, val, fn) {
    const inp = h('input', { type: 'checkbox', onchange: (e) => fn(e.target.checked) });
    inp.checked = !!val;
    return h('div.switch', h('div.lbl', label, sub ? h('small', sub) : null), inp);
  }
  function setTheme(t) {
    s.theme = t;
    App.applyTheme();
    App.Store.save();
    App.rerender();
  }
  function backup() {
    const name = `toeic750-backup-${App.today()}.json`;
    App.Store.download(name, App.Store.exportJSON());
    App.toast('ดาวน์โหลดไฟล์สำรองแล้ว', 'ok');
  }
  function restore() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          App.Store.importJSON(String(r.result));
          App.toast('กู้คืนข้อมูลสำเร็จ', 'ok');
          setTimeout(() => location.reload(), 700);
        } catch (e) {
          App.toast('ไฟล์ไม่ถูกต้อง: ' + e.message, 'bad');
        }
      };
      r.readAsText(f);
    });
    inp.click();
  }
  function resetAsk() {
    App.confirmBox('ล้างข้อมูลทั้งหมด',
      'สถิติ ความคืบหน้า คำศัพท์ที่จำได้ และสมุดข้อผิดจะหายทั้งหมด กู้คืนไม่ได้ แนะนำให้กดสำรองข้อมูลก่อน',
      () => { App.Store.resetAll(); location.reload(); }, 'ล้างทั้งหมด');
  }
};
