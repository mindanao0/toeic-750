/* ============================================================
   90-app — ตัวจัดเส้นทางหน้าจอ และการเริ่มต้นแอป
   ============================================================ */
'use strict';

const ROUTES = [
  { re: /^\/$/,                    view: () => App.Views.home,        nav: '/' },
  { re: /^\/learn$/,               view: () => App.Views.learn,       nav: '/learn' },
  { re: /^\/lesson\/([\w-]+)$/,    view: () => App.Views.lesson,      nav: '/learn', keys: ['id'] },
  { re: /^\/drill$/,               view: () => App.Views.drill,       nav: '/drill' },
  { re: /^\/cards$/,               view: () => App.Views.cards,       nav: '/cards' },
  { re: /^\/stats$/,               view: () => App.Views.stats,       nav: '/stats' },
  { re: /^\/quiz$/,                view: () => App.Quiz.render },
  { re: /^\/result$/,              view: () => App.Views.result },
  { re: /^\/review$/,              view: () => App.Views.review,      nav: '/drill' },
  { re: /^\/mistakes$/,            view: () => App.Views.mistakes,    nav: '/drill' },
  { re: /^\/exam$/,                view: () => App.Views.exam },
  { re: /^\/exam\/([\w-]+)$/,      view: () => App.Views.exam,        keys: ['testId'] },
  { re: /^\/examresult$/,          view: () => App.Views.examresult },
  { re: /^\/placement$/,           view: () => App.Views.placement },
  { re: /^\/placementresult$/,     view: () => App.Views.placementresult },
  { re: /^\/cheatsheet$/,          view: () => App.Views.cheatsheet },
  { re: /^\/examinfo$/,            view: () => App.Views.examinfo },
  { re: /^\/settings$/,            view: () => App.Views.settings },
];

let currentPath = null;

function path() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

function go(href) {
  const p = String(href).replace(/^#/, '');
  if (location.hash === '#' + p) render();
  else location.hash = p;
}

function match(p) {
  for (const r of ROUTES) {
    const m = r.re.exec(p);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => (params[k] = m[i + 1]));
      return { route: r, params };
    }
  }
  return null;
}

function render() {
  const p = path();
  const found = match(p);
  const root = App.$('#app');
  App.clear(root);

  // ออกจากชุดข้อสอบถ้าเปลี่ยนหน้าไปที่อื่น
  if (p !== '/quiz' && App.Quiz.active()) App.Quiz.exit(true);
  if (App._quizKeyHandler) {
    document.removeEventListener('keydown', App._quizKeyHandler);
    App._quizKeyHandler = null;
  }
  // หยุดเสียงเฉพาะตอนเปลี่ยนหน้าจริง — ถ้าวาดใหม่ในหน้าเดิม (เช่นกดปุ่มช่วยเหลือ)
  // แล้วไปตัดเสียงทิ้ง ผู้เรียนจะเสียโอกาสฟังไปทั้งชุด
  if (currentPath !== p) App.TTS.stop();

  if (!found) {
    root.appendChild(App.UI.emptyState('🧭', 'ไม่พบหน้านี้', App.h('button.btn.primary', { onclick: () => go('#/') }, 'กลับหน้าแรก')));
    return;
  }

  const fn = found.route.view();
  if (typeof fn !== 'function') {
    root.appendChild(App.UI.emptyState('⏳', 'หน้านี้ยังไม่พร้อม'));
    return;
  }

  try {
    fn(root, found.params || {});
  } catch (e) {
    console.error(e);
    App.clear(root);
    root.appendChild(App.UI.emptyState('💥',
      'เกิดข้อผิดพลาดในหน้านี้<br><span class="small">' + App.esc(e.message) + '</span>',
      App.h('button.btn.primary', { onclick: () => go('#/') }, 'กลับหน้าแรก')));
  }

  // แถบล่าง
  const nav = App.$('#nav');
  const isQuiz = p === '/quiz';
  nav.hidden = isQuiz;
  App.$$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (found.route.nav || p)));

  if (currentPath !== p) {
    currentPath = p;
    if (!isQuiz) App.scrollTop();
  }
}

function rerender() {
  render();
}

/* ---------- ธีม ---------- */

function applyTheme() {
  const s = App.Store.state().settings;
  let t = s.theme;
  if (t === 'auto') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.setProperty('--fs', String(s.fontScale || 1));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#f4f6fa' : '#0e1117');
}

/* ---------- service worker + การอัปเดตเวอร์ชัน ---------- */

const BUILD = window.__BUILD__ || 'dev';

function registerSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const base = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);

  navigator.serviceWorker
    .register(base + 'sw.js')
    .then((reg) => {
      // ถ้ามีตัวใหม่รออยู่ตั้งแต่แรก แจ้งเลย
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg);

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg);
        });
      });

      // เช็คเวอร์ชันใหม่ทุกครั้งที่กลับมาที่แอป
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      setTimeout(() => reg.update().catch(() => {}), 4000);
    })
    .catch(() => {});

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

let updateOffered = false;
function offerUpdate(reg) {
  if (updateOffered) return;
  updateOffered = true;
  const bar = App.h(
    'div.toast.ok',
    { style: { cursor: 'pointer', bottom: 'calc(var(--nav-h) + 58px)' } },
    '🎉 มีเวอร์ชันใหม่ — กดที่นี่เพื่ออัปเดต',
  );
  bar.addEventListener('click', () => {
    bar.textContent = 'กำลังอัปเดต…';
    if (reg.waiting) reg.waiting.postMessage('skipWaiting');
    setTimeout(() => location.reload(), 900);
  });
  document.body.appendChild(bar);
  setTimeout(() => {
    if (bar.parentNode) bar.style.opacity = '.85';
  }, 6000);
}

/* ---------- เริ่มต้น ---------- */

function boot() {
  App.Store.load();
  applyTheme();
  App.TTS.init();

  window.addEventListener('hashchange', render);
  window.addEventListener('error', (e) => console.error('uncaught', e.error || e.message));

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => {
      if (App.Store.state().settings.theme === 'auto') applyTheme();
    });
  }

  registerSW();

  render();

  // เกณฑ์เหรียญตราต้องอิงจำนวนเนื้อหาที่มีจริง
  Promise.all([App.Data.planLessonIds(), App.Data.vocab()])
    .then(([ids, v]) => App.Store.setContent({ lessons: ids.length || 19, vocab: v.length || 0 }))
    .catch(() => {});

  App.Sync.boot();
  App.Notify.schedule();
  App.Notify.inAppNudge();

  // เตือนวันสอบ
  const st = App.Store.state();
  if (st.plan.examDate) {
    const left = App.daysBetween(App.today(), st.plan.examDate);
    if (left >= 0 && left <= 3) setTimeout(() => App.toast(`อีก ${left} วันสอบแล้ว!`, 'ok'), 900);
  }
}

Object.assign(App, { go, render, rerender, applyTheme, boot, BUILD });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
