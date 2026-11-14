// Bundles the app into one HTML fragment for publishing as a Claude artifact.
// Usage: node tools/build-artifact.mjs <out.html> [artifact-url]
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const [out, url = ''] = process.argv.slice(2);
const js = (await build({ entryPoints: ['js/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2022' })).outputFiles[0].text;
const css = readFileSync('css/app.css', 'utf8').replace(/@font-face[^}]*}\n?/g, '');
const qr = readFileSync('js/vendor/qrcode.js', 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
writeFileSync(out, `<title>Payoza</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400..800&family=Rubik:wght@500..800&display=swap">
<style>${css}</style>
<div dir="rtl" lang="he">
<div class="sky" aria-hidden="true"><i></i><i></i><i></i></div>
<main id="app"></main>
<div id="sheets"></div>
<div id="toasts" role="status" aria-live="polite"></div>
<canvas id="fx" aria-hidden="true"></canvas>
</div>
<script>window.PZ_URL=${JSON.stringify(url)};</script>
<script>${safe(qr)}</script>
<script>${safe(js)}</script>
`);
