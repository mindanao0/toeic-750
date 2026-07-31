/* service worker — ใช้ออฟไลน์ได้ แต่ต้องได้ของใหม่ทันทีเมื่อ deploy */
const CACHE = 'toeic750-v20260731.2028';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./data/drills/p1e-01.json","./data/drills/p2e-01.json","./data/drills/p2m-01.json","./data/drills/p3e-01.json","./data/drills/p3m-01.json","./data/drills/p3m-02.json","./data/drills/p5e-01.json","./data/drills/p5e-02.json","./data/drills/p5e-03.json","./data/drills/p5m-01.json","./data/drills/p5m-02.json","./data/drills/p6m-01.json","./data/drills/p6m-02.json","./data/drills/p7e-01.json","./data/drills/p7m-01.json","./data/tests/placement.json","./data/tests/test1.json","./data/lessons/L01.json","./data/lessons/L02.json","./data/lessons/L03.json","./data/lessons/L04.json","./data/lessons/L05.json","./data/lessons/L06.json","./data/lessons/L07.json","./data/lessons/L08.json","./data/lessons/L09.json","./data/lessons/L10.json","./data/lessons/L11.json","./data/lessons/L12.json","./data/lessons/L13.json","./data/vocab/vocab-01.json","./data/vocab/vocab-02.json","./data/vocab/vocab-03.json","./data/vocab/vocab-04.json","./data/static/cheatsheet.json","./data/static/examinfo.json","./data/static/plan30.json"];

/* แคชแบบทีละไฟล์ ถ้าไฟล์ใดพลาดก็ไม่ล้มทั้งการติดตั้ง */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isPage = e.request.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);

  // หน้าเว็บ: เอาของใหม่ก่อนเสมอ (ไม่งั้นผู้ใช้ติดเวอร์ชันเก่าจน SW ตัวใหม่ทำงาน)
  if (isPage) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // ไฟล์ข้อมูล/ไอคอน: ใช้ของในแคชก่อนเพื่อความเร็ว แล้วอัปเดตเบื้องหลัง
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      if (hit) net.catch(() => {});
      return hit || net;
    }),
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'toeic-daily') {
    e.waitUntil(self.registration.showNotification('ถึงเวลาเรียนแล้ว', { body: 'เข้ามาทำสัก 20 นาทีก็ยังดี', tag: 'toeic-daily' }));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((ws) => (ws.length ? ws[0].focus() : clients.openWindow('./'))));
});
