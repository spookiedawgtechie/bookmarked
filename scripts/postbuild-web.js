// Runs after `expo export --platform web`: copies public/ assets into dist
// and injects PWA + Open Graph tags that Expo's single-output HTML lacks.
const fs = require('fs');
const path = require('path');

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
].join('');

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('</head>', tags + '</head>');
fs.writeFileSync(indexPath, html);
console.log('postbuild-web: copied public assets and injected PWA/OG tags');
