/* ============================================================
   85-notify — แจ้งเตือนรายวัน
   ข้อจำกัดจริง: เบราว์เซอร์ยิงแจ้งเตือนตามเวลาได้ก็ต่อเมื่อมี service worker
   ที่ยังทำงานอยู่ ถ้าเครื่องปิดแอปสนิทอาจไม่เด้ง จึงเสริมด้วยการเตือนในแอปด้วย
   ============================================================ */
'use strict';

let timer = null;

function supported() {
  return typeof Notification !== 'undefined';
}

function statusText() {
  if (!supported()) return 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน';
  if (Notification.permission === 'granted') return '✓ อนุญาตแล้ว — จะเตือนเมื่อเปิดแอปค้างไว้ หรือเมื่อระบบปลุก service worker';
  if (Notification.permission === 'denied') return '⚠️ ถูกปิดกั้นไว้ ต้องไปเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์';
  return 'ยังไม่ได้ขออนุญาต — กดเปิดแจ้งเตือนเพื่ออนุญาต';
}

function enable() {
  if (!supported()) return Promise.resolve(false);
  return Notification.requestPermission().then((p) => {
    if (p === 'granted') {
      schedule();
      registerPeriodic();
      App.toast('เปิดแจ้งเตือนแล้ว', 'ok');
      return true;
    }
    App.toast('ไม่ได้รับอนุญาตให้แจ้งเตือน', 'bad');
    return false;
  });
}

function fire(title, body) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, { body, tag: 'toeic-daily', badge: undefined, icon: undefined });
      }).catch(() => new Notification(title, { body }));
    } else {
      new Notification(title, { body });
    }
  } catch (e) {
    /* บางเบราว์เซอร์ห้ามสร้างตรงๆ */
  }
}

function test() {
  if (!supported()) return App.toast('เบราว์เซอร์นี้ไม่รองรับ', 'bad');
  if (Notification.permission !== 'granted') return enable().then((ok) => ok && fire('ทดสอบแจ้งเตือน', 'ถ้าเห็นข้อความนี้แปลว่าใช้งานได้'));
  fire('ทดสอบแจ้งเตือน', 'ถ้าเห็นข้อความนี้แปลว่าใช้งานได้');
  App.toast('ส่งแจ้งเตือนทดสอบแล้ว', 'ok');
}

/** ตั้งเวลายิงเตือนครั้งถัดไป (ทำงานเมื่อแอปยังเปิดค้างอยู่) */
function schedule() {
  clearTimeout(timer);
  const s = App.Store.state().settings;
  if (!s.reminderOn || !supported() || Notification.permission !== 'granted') return;

  const [hh, mm] = String(s.reminderTime || '20:00').split(':').map(Number);
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 20, mm || 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);

  const wait = at - now;
  if (wait > 0x7fffffff) return; // เกินขีดจำกัดของ setTimeout
  timer = setTimeout(() => {
    const st = App.Store.state();
    if (st.progress.lastStudyDate !== App.today()) {
      const day = App.Store.planDay();
      fire(`วันที่ ${day} จาก 30 — ยังไม่ได้เรียนวันนี้`,
        st.progress.streak > 0 ? `อย่าให้สถิติ ${st.progress.streak} วันติดขาดนะ` : 'เข้ามาทำสัก 20 นาทีก็ยังดี');
    }
    schedule();
  }, wait);
}

function registerPeriodic() {
  if (!('serviceWorker' in navigator) || !('periodicSync' in ServiceWorkerRegistration.prototype)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.periodicSync.register('toeic-daily', { minInterval: 20 * 60 * 60 * 1000 }))
    .catch(() => {});
}

/** เตือนในแอปเมื่อเปิดมาแล้วยังไม่ได้เรียนและเลยเวลาที่ตั้งไว้ */
function inAppNudge() {
  const st = App.Store.state();
  if (st.progress.lastStudyDate === App.today()) return;
  const [hh] = String(st.settings.reminderTime || '20:00').split(':').map(Number);
  if (new Date().getHours() < hh) return;
  if (sessionStorage.getItem('nudged')) return;
  sessionStorage.setItem('nudged', '1');
  setTimeout(() => {
    App.toast(`วันนี้ยังไม่ได้เรียน — เหลืออีก ${App.Store.daysLeft()} วัน`, 'bad');
  }, 1200);
}

Object.assign(App, { Notify: { enable, schedule, fire, test, statusText, supported, inAppNudge } });
