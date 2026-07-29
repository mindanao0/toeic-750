#!/usr/bin/env node
/* เสิร์ฟ dist/web ในเครื่อง — เปิดจากมือถือในวง Wi-Fi เดียวกันได้ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(__dirname, '..', 'dist', 'web');
const PORT = Number(process.env.PORT || process.argv[2] || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

if (!fs.existsSync(DIR)) {
  console.error('ยังไม่มี dist/web — รัน `node build.js` ก่อน');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = path.join(DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('ไม่พบไฟล์');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);
    console.log(`\n  เปิดบนคอมนี้:   http://localhost:${PORT}`);
    ips.forEach((ip) => console.log(`  เปิดบนมือถือ:   http://${ip}:${PORT}   (ต้องอยู่ Wi-Fi เดียวกัน)`));
    console.log('\n  กด Ctrl+C เพื่อหยุด\n');
  });
