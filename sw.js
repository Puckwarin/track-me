// Service worker: ทำให้เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต
// - App shell (index.html ฯลฯ): network-first แล้ว fallback เป็นแคช
// - ไลบรารีจาก CDN (Tailwind, FontAwesome, Google Fonts, Firebase SDK): stale-while-revalidate
// - Firestore / Gemini: ไม่ยุ่ง (Firestore จัดการแคชข้อมูลเองด้วย IndexedDB)
const VERSION = 'trackme-v3';

const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

const CDN_PRECACHE = [
  // [url, mode]
  ['https://cdn.tailwindcss.com', 'no-cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'no-cors'],
  ['https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap', 'no-cors'],
  // ES modules ต้องใช้ CORS
  ['https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js', 'cors'],
  ['https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js', 'cors'],
];

const CDN_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // CDN: พลาดบางตัวได้ ไม่ให้ install ล้ม (runtime caching จะเก็บให้ตอนใช้งานจริง)
    await Promise.allSettled(CDN_PRECACHE.map(async ([url, mode]) => {
      const res = await fetch(new Request(url, { mode }));
      if (res.ok || res.type === 'opaque') await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // หน้าเว็บหลัก: ลองเน็ตก่อน ถ้าไม่ได้ใช้แคช
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) ||
               (await caches.match('./index.html')) ||
               Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.has(url.hostname)) return; // Firestore, Gemini ฯลฯ ผ่านตามปกติ

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
