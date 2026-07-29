/* service worker — แคชไว้ใช้ออฟไลน์ */
const CACHE = 'toeic750-vms62o2cl';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./data/drills/p5e-01.json","./data/drills/p5e-02.json","./data/tests/placement.json","./data/lessons/L01.json","./data/lessons/L02.json","./data/lessons/L03.json","./data/lessons/L04.json","./data/lessons/L05.json","./data/lessons/L06.json","./data/lessons/L07.json","./data/vocab/vocab-01.json","./data/vocab/vocab-02.json","./data/static/plan30.json"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
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
