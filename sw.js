// Service worker: la red primero (siempre la versión más reciente) y la caché como respaldo sin conexión.
const V = 'refcom-v6';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/util.js', 'js/store.js', 'js/github.js', 'js/views.js', 'js/forms.js', 'js/inv.js', 'js/stock.js', 'js/xls.js',
  'data.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V && x !== 'refcom-share').map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  // Archivo compartido desde otra app (Android, app instalada): se guarda y se abre en el visor de Excel
  if (r.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await r.formData(), f = fd.get('file');
        if (f && f.size) {
          const c = await caches.open('refcom-share');
          await c.put('shared-file', new Response(f, { headers: { 'X-File-Name': encodeURIComponent(f.name || 'compartido.xlsx'), 'Content-Type': f.type || 'application/octet-stream' } }));
        }
      } catch { /* sin archivo */ }
      return Response.redirect(new URL('./?shared=1#/excel', self.registration.scope).href, 303);
    })());
    return;
  }
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const key = r.mode === 'navigate' ? 'index.html' : u.pathname.endsWith('/data.json') ? 'data.json' : r;
  e.respondWith(fetch(r, { cache: 'no-store' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(key, cp)); }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
