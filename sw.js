/* Grochu life — service worker: aplikacja działa offline. Dane zostają w localStorage, tu tylko pliki aplikacji. */
const VERSION = 'v9';
const CACHE = `glife-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/base.css?v=9',
  'css/shell.css?v=9',
  'css/sec-habits.css?v=9',
  'css/sec-diet.css?v=9',
  'css/sec-gym.css?v=9',
  'css/sec-recipes.css?v=9',
  'css/sec-verses.css?v=9',
  'css/sec-account.css?v=9',
  'css/look.css?v=9',
  'js/core.js?v=9',
  'js/gym-exercises.js?v=9',
  'js/gym-exercises-pl.js?v=9',
  'js/sec-gym.js?v=9',
  'js/sec-habits.js?v=9',
  'js/sec-diet.js?v=9',
  'js/sec-recipes.js?v=9',
  'js/sec-verses.js?v=9',
  'js/sec-account.js?v=9',
  'manifest.webmanifest',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('glife-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pliki aplikacji: najpierw sieć (zmiany docierają od razu), bez sieci z pamięci.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});

// Klik w powiadomienie (koniec przerwy, koniec licznika nawyku): wraca do aplikacji.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
