// Runs after `expo export --platform web`: copies public/ assets into dist
// and injects PWA + Open Graph tags that Expo's single-output HTML lacks.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pub = path.join(root, 'public');

for (const f of fs.readdirSync(pub)) {
  fs.copyFileSync(path.join(pub, f), path.join(dist, f));
}

const SITE = 'https://bookmarked-psi.vercel.app';
const tags = [
  '<link rel="manifest" href="/manifest.json"/>',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
  '<meta name="theme-color" content="#000000"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>',
  '<meta name="apple-mobile-web-app-title" content="Bookmarked"/>',
  '<meta name="description" content="A personal Letterboxd for books - track reading, ratings and yearly recaps."/>',
  '<meta property="og:title" content="Bookmarked"/>',
  '<meta property="og:description" content="A personal Letterboxd for books - track reading, ratings and yearly recaps."/>',
  `<meta property="og:image" content="${SITE}/og-image.png"/>`,
  `<meta property="og:url" content="${SITE}"/>`,
  '<meta property="og:type" content="website"/>',
  '<meta name="twitter:card" content="summary_large_image"/>',
  '<script src="/register-sw.js" defer></script>',
].join('');

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('</head>', tags + '</head>');
fs.writeFileSync(indexPath, html);

// Register a generated service worker from a same-origin external script so
// the production CSP can keep blocking inline JavaScript.
const registration = `if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}\n`;
fs.writeFileSync(path.join(dist, 'register-sw.js'), registration);

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

const precache = walkFiles(dist)
  .filter((file) => path.basename(file) !== 'sw.js')
  .map((file) => '/' + path.relative(dist, file).replace(/\\/g, '/'));
const cacheVersion = crypto
  .createHash('sha256')
  .update(html + JSON.stringify(precache))
  .digest('hex')
  .slice(0, 12);

const serviceWorker = `const CACHE = 'bookmarked-${cacheVersion}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('bookmarked-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  if (url.hostname === 'openlibrary.org' || url.hostname === 'covers.openlibrary.org') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
`;
fs.writeFileSync(path.join(dist, 'sw.js'), serviceWorker);

console.log('postbuild-web: copied assets, injected metadata, and generated offline shell');
