// Service worker: la red primero (siempre la versión más reciente) y la caché como respaldo sin conexión.
const V = 'refcom-v4';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/util.js', 'js/store.js', 'js/github.js', 'js/views.js', 'js/forms.js', 'js/inv.js', 'js/stock.js',
  'data.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const key = r.mode === 'navigate' ? 'index.html' : u.pathname.endsWith('/data.json') ? 'data.json' : r;
  e.respondWith(fetch(r, { cache: 'no-store' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(key, cp)); }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
