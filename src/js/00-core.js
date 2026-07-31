/* ============================================================
   00-core — ยูทิลิตี้พื้นฐาน, DOM helper, วันที่, สุ่ม
   ============================================================ */
'use strict';

const App = (window.App = {});

/* ---------- DOM ---------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/**
 * สร้าง element แบบสั้น: h('div.card', {onclick}, 'text', childEl)
 * tag รองรับ  div  div.a.b  div#id.a  หรือแค่ .card (= div.card)
 */
function h(tag, props, ...kids) {
  const m = /^([a-z0-9]*)(#[^.]+)?((?:\.[^.#]+)*)$/i.exec(String(tag || 'div')) || [null, 'div', '', ''];
  const el = document.createElement(m[1] || 'div');
  if (m[2]) el.id = m[2].slice(1);
  if (m[3]) el.className = m[3].slice(1).split('.').join(' ');

  // อาร์กิวเมนต์ที่สองเป็น props ก็ต่อเมื่อเป็น plain object เท่านั้น
  // array และ Node ถือเป็นลูก — ถ้าไม่กันตรงนี้ h('div', [el1, el2]) จะกลืนลูกทิ้งเงียบๆ
  if (props != null && (Array.isArray(props) || typeof props !== 'object' || props instanceof Node)) {
    kids.unshift(props);
    props = null;
  }
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        // Object.assign ตั้งค่า CSS custom property (--x) ไม่ได้ ต้องใช้ setProperty
        for (const sk in v) {
          if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]);
          else el.style[sk] = v[sk];
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += ' ' + v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** แปลง **ตัวหนา** เป็น <b> (ใช้กับคำอ่านไทยและคำอธิบาย) */
const mdBold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
};

/* ---------- วันที่ (ยึดเวลาท้องถิ่นของเครื่อง) ---------- */

const DAY_MS = 86400000;

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function today() {
  return ymd(new Date());
}

/** จำนวนวันเต็มระหว่าง 2 วันที่แบบ YYYY-MM-DD (b - a) */
function daysBetween(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / DAY_MS);
}

function addDays(dateStr, n) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2] + n);
  return ymd(d);
}

const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_DOW = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function thaiDate(dateStr, opts) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const be = p[0] + 543;
  const core = `${p[2]} ${TH_MONTH[p[1] - 1]} ${be}`;
  return opts && opts.dow ? `วัน${TH_DOW[d.getDay()]}ที่ ${core}` : core;
}

/** 3725000 -> "1:02:05" ; 65000 -> "1:05" */
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

function fmtMin(min) {
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

/* ---------- สุ่ม (seeded เพื่อให้ชุดข้อสอบซ้ำได้) ---------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let hp = 0;
  for (let i = 0; i < s.length; i++) hp = (Math.imul(31, hp) + s.charCodeAt(i)) | 0;
  return hp >>> 0;
}

function shuffle(arr, rnd) {
  const r = rnd || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr, n, rnd) => shuffle(arr, rnd).slice(0, n);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const uniq = (a) => Array.from(new Set(a));

function groupBy(arr, fn) {
  const o = {};
  for (const x of arr) {
    const k = fn(x);
    (o[k] || (o[k] = [])).push(x);
  }
  return o;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ---------- UI helpers ---------- */

let toastTimer = null;
function toast(msg, kind) {
  const old = $('.toast');
  if (old) old.remove();
  clearTimeout(toastTimer);
  const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

function modal(title, bodyEl, actions) {
  const bg = h('div.modal-bg', {
    onclick: (e) => {
      if (e.target === bg) close();
    },
  });
  const close = () => {
    bg.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  const box = h('div.modal', title ? h('h2', title) : null, bodyEl);
  if (actions && actions.length) {
    box.appendChild(
      h(
        'div.row.mt',
        actions.map((a) =>
          h(
            'button.btn.grow' + (a.kind ? '.' + a.kind : ''),
            {
              onclick: () => {
                if (!a.onclick || a.onclick() !== false) close();
              },
            },
            a.label,
          ),
        ),
      ),
    );
  }
  bg.appendChild(box);
  document.body.appendChild(bg);
  return { close, box };
}

function confirmBox(title, msg, onYes, yesLabel) {
  modal(title, h('p.small.muted', { style: { margin: '0' } }, msg), [
    { label: 'ยกเลิก', kind: 'ghost' },
    { label: yesLabel || 'ยืนยัน', kind: 'danger', onclick: onYes },
  ]);
}

function flyXP(n, x, y) {
  const el = h('div.xpfly', `+${n} XP`);
  el.style.left = (x || window.innerWidth / 2) + 'px';
  el.style.top = (y || window.innerHeight / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

Object.assign(App, {
  $, $$, h, esc, mdBold, clear,
  ymd, today, daysBetween, addDays, thaiDate, fmtDur, fmtMin, TH_MONTH, TH_DOW,
  mulberry32, hashStr, shuffle, pick, clamp, sum, uniq, groupBy, pct,
  toast, modal, confirmBox, flyXP, scrollTop,
});
