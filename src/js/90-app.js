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
  App.TTS.stop();

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

  // service worker (เฉพาะเวอร์ชันที่ deploy เป็นเว็บ)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const base = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
    navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
  }

  render();
  App.Notify.schedule();
  App.Notify.inAppNudge();

  // เตือนวันสอบ
  const st = App.Store.state();
  if (st.plan.examDate) {
    const left = App.daysBetween(App.today(), st.plan.examDate);
    if (left >= 0 && left <= 3) setTimeout(() => App.toast(`อีก ${left} วันสอบแล้ว!`, 'ok'), 900);
  }
}

Object.assign(App, { go, render, rerender, applyTheme, boot });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
