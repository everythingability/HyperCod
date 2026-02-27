const CACHE_NAME = 'hypercod-v4';
const ASSETS = [
    './',
    './index.html',
    './app.css',
    './app.js',
    './db.js',
    './model.js',
    './engine.js',
    './ui.js',
    './dialogs.js',
    './messagebox.js',
    './paint.js',
    './help.js',
    './cardlist.js',
    './dither.js',
    './manifest.json',
    './hypercod_700x700.png',
    './hypercode_favicon_192x192.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
            // Only attempt to cache http/https requests from the network
            try {
                const reqUrl = new URL(e.request.url);
                if (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => { /* ignore cache failures */ });
                }
            } catch (err) {
                // If URL parsing fails, skip caching
            }
            return resp;
        }))
    );
});
