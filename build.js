#!/usr/bin/env node
/* ============================================================
   build.js — รวมไฟล์ทั้งหมดเป็นเว็บที่ใช้งานได้จริง (ไม่มี dependency)

   ผลลัพธ์ 2 แบบ:
     dist/web/     — สำหรับ GitHub Pages: index.html + data/*.json + sw.js + manifest (ติดตั้งเป็นแอปได้)
     dist/single/  — ไฟล์ index.html ไฟล์เดียวจบ ฝังข้อมูลทั้งหมด (สำหรับ Artifact / เปิดจากไฟล์)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');

const KINDS = ['drills', 'tests', 'lessons', 'vocab', 'static'];

/* ---------- helpers ---------- */

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

function rmrf(p) {
  if (exists(p)) fs.rmSync(p, { recursive: true, force: true });
}
function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}
function listJson(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

/* ---------- รวบรวมโค้ด ---------- */

/**
 * แต่ละไฟล์ถูกห่อด้วย IIFE เพื่อไม่ให้ตัวแปรระดับบนสุดชนกัน
 * (หลายไฟล์ประกาศ `const h = App.h` เหมือนกัน) — สื่อสารกันผ่าน window.App เท่านั้น
 */
function collectJS() {
  const dir = path.join(SRC, 'js');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  return files
    .map((f) => `\n/* ===== ${f} ===== */\n;(function(){\n${read(path.join(dir, f))}\n})();`)
    .join('\n');
}

function collectCSS() {
  return read(path.join(SRC, 'css', 'styles.css'));
}

/* ---------- รวบรวมข้อมูล ---------- */

function collectData() {
  const manifest = {};
  const blobs = {};
  const stats = { files: 0, bytes: 0, items: 0 };

  for (const kind of KINDS) {
    const dir = path.join(DATA, kind);
    const names = [];
    for (const f of listJson(dir)) {
      const name = f.replace(/\.json$/, '');
      const raw = read(path.join(dir, f));
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        console.error(`  ✗ ${kind}/${f} — JSON เสีย: ${e.message}`);
        continue;
      }
      names.push(name);
      blobs[kind + '/' + name] = obj;
      stats.files++;
      stats.bytes += Buffer.byteLength(raw);
      stats.items += countItems(obj);
    }
    manifest[kind] = names;
  }
  return { manifest, blobs, stats };
}

function countItems(obj) {
  let n = 0;
  const add = (arr) => {
    for (const it of arr || []) n += Array.isArray(it.questions) ? it.questions.length : 1;
  };
  add(obj.items);
  add(obj.quiz);
  return n;
}

/* ---------- ไอคอน PNG (เขียนเองด้วย zlib ไม่ง้อไลบรารี) ---------- */

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** วาดไอคอน: พื้นน้ำเงินโค้งมน + เอกสารสีขาว + เครื่องหมายถูก */
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255;
    px[i] = Math.round(px[i] * (1 - na) + r * na);
    px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
    px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
    px[i + 3] = Math.max(px[i + 3], a);
  };
  const rect = (x0, y0, w, hgt, r, g, b, rad) => {
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < w; x++) {
        if (rad) {
          const dx = Math.min(x, w - 1 - x), dy = Math.min(y, hgt - 1 - y);
          if (dx < rad && dy < rad) {
            const d = Math.hypot(rad - dx, rad - dy);
            if (d > rad) continue;
          }
        }
        set(x0 + x, y0 + y, r, g, b, 255);
      }
    }
  };

  const S = size / 512;
  // พื้นหลัง
  rect(0, 0, size, size, 0x1f, 0x6f, 0xdc, Math.round(112 * S));
  // เอกสารสีขาว
  const dw = Math.round(232 * S), dh = Math.round(292 * S);
  const dx0 = Math.round((size - dw) / 2), dy0 = Math.round(96 * S);
  rect(dx0, dy0, dw, dh, 255, 255, 255, Math.round(20 * S));
  // บรรทัดในเอกสาร
  const lh = Math.max(2, Math.round(18 * S));
  for (let i = 0; i < 4; i++) {
    const w = i === 3 ? Math.round(dw * 0.45) : Math.round(dw * 0.68);
    rect(dx0 + Math.round(dw * 0.16), dy0 + Math.round(48 * S) + i * Math.round(46 * S), w, lh, 0xc3, 0xd4, 0xe8, lh / 2);
  }
  // เครื่องหมายถูกสีเขียว
  const cx = Math.round(size * 0.66), cy = Math.round(size * 0.68), rr = Math.round(84 * S);
  for (let y = -rr; y <= rr; y++) {
    for (let x = -rr; x <= rr; x++) {
      if (x * x + y * y <= rr * rr) set(cx + x, cy + y, 0x12, 0xa0, 0x5e, 255);
    }
  }
  const t = Math.max(3, Math.round(16 * S));
  for (let i = 0; i < Math.round(38 * S); i++) {
    for (let k = 0; k < t; k++) set(cx - Math.round(34 * S) + i, cy + Math.round(2 * S) + i + k, 255, 255, 255, 255);
  }
  for (let i = 0; i < Math.round(62 * S); i++) {
    for (let k = 0; k < t; k++) set(cx + Math.round(4 * S) + i, cy + Math.round(40 * S) - i + k, 255, 255, 255, 255);
  }

  // เข้ารหัส PNG
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- ประกอบ HTML ---------- */

function buildHTML({ css, js, manifest, dataScript, manifestLink, build }) {
  let html = read(path.join(SRC, 'index.html'));
  html = html.replace('<!--MANIFEST-->', manifestLink || '');
  html = html.replace('/*<!--CSS-->*/', () => css);
  html = html.replace(
    '/*<!--DATA-->*/',
    () =>
      `window.__BUILD__=${JSON.stringify(build)};window.__MANIFEST__=${JSON.stringify(manifest)};` +
      (dataScript || ''),
  );
  html = html.replace('/*<!--JS-->*/', () => js);
  return html;
}

/** เลขเวอร์ชันจากวันเวลา build — ใช้โชว์ในหน้าตั้งค่าและตั้งชื่อแคช */
function buildStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
}

/* ---------- service worker ---------- */

function swSource(version, assets) {
  return `/* service worker — ใช้ออฟไลน์ได้ แต่ต้องได้ของใหม่ทันทีเมื่อ deploy */
const CACHE = 'toeic750-v${version}';
const ASSETS = ${JSON.stringify(assets, null, 0)};

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

  const isPage = e.request.mode === 'navigate' || /\\/(index\\.html)?$/.test(url.pathname);

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
`;
}

/* ---------- main ---------- */

function main() {
  console.log('▶ กำลังสร้างไฟล์…\n');

  const css = collectCSS();
  const js = collectJS();
  const { manifest, blobs, stats } = collectData();
  const build = buildStamp();
  console.log(`  เวอร์ชัน: ${build}`);

  console.log(`  เนื้อหา: ${stats.files} ไฟล์ · ${stats.items.toLocaleString()} ข้อ/รายการ · ${(stats.bytes / 1048576).toFixed(2)} MB`);
  for (const k of KINDS) console.log(`    ${k.padEnd(8)} ${manifest[k].length} ไฟล์`);

  rmrf(DIST);

  /* ---- web (GitHub Pages) ---- */
  const webDir = path.join(DIST, 'web');
  mkdirp(webDir);

  const webHtml = buildHTML({
    css,
    js,
    manifest,
    build,
    dataScript: '',
    manifestLink: '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-192.png">',
  });
  fs.writeFileSync(path.join(webDir, 'index.html'), webHtml);

  for (const kind of KINDS) {
    if (!manifest[kind].length) continue;
    mkdirp(path.join(webDir, 'data', kind));
    for (const name of manifest[kind]) {
      fs.writeFileSync(path.join(webDir, 'data', kind, name + '.json'), JSON.stringify(blobs[kind + '/' + name]));
    }
  }

  const webmanifest = {
    name: 'TOEIC 750 ใน 30 วัน',
    short_name: 'TOEIC 750',
    description: 'ติว TOEIC 750+ ใน 30 วัน สำหรับคนไทยที่เริ่มจากศูนย์',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e1117',
    theme_color: '#0e1117',
    lang: 'th',
    dir: 'ltr',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(webDir, 'manifest.webmanifest'), JSON.stringify(webmanifest, null, 2));
  fs.writeFileSync(path.join(webDir, 'icon-192.png'), makeIcon(192));
  fs.writeFileSync(path.join(webDir, 'icon-512.png'), makeIcon(512));
  fs.writeFileSync(path.join(webDir, '.nojekyll'), '');

  const swAssets = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'].concat(
    KINDS.flatMap((k) => manifest[k].map((n) => `./data/${k}/${n}.json`)),
  );
  fs.writeFileSync(path.join(webDir, 'sw.js'), swSource(build, swAssets));

  const webSize = dirSize(webDir);
  console.log(`\n  ✓ dist/web/          ${(webSize / 1048576).toFixed(2)} MB  (GitHub Pages / ติดตั้งเป็นแอปได้)`);

  /* ---- single file (Artifact) ---- */
  const singleDir = path.join(DIST, 'single');
  mkdirp(singleDir);
  const dataScript = 'window.__DATA__=' + JSON.stringify(blobs) + ';';
  const singleHtml = buildHTML({ css, js, manifest, build, dataScript, manifestLink: '' });
  fs.writeFileSync(path.join(singleDir, 'index.html'), singleHtml);

  const singleSize = Buffer.byteLength(singleHtml);
  console.log(`  ✓ dist/single/index.html  ${(singleSize / 1048576).toFixed(2)} MB  (ไฟล์เดียวจบ)`);
  if (singleSize > 9 * 1048576) {
    console.log('  ⚠️  ไฟล์เดียวใหญ่เกิน 9 MB — อาจโหลดช้าบนมือถือ ควรใช้เวอร์ชัน web แทน');
  }

  console.log('\n✅ เสร็จ');
}

function dirSize(dir) {
  let n = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    n += f.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

main();
