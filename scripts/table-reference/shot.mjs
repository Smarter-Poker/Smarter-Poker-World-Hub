/**
 * Screenshot the table reference at desktop and mobile size.
 *
 * The page is served over a throwaway static server rooted at public/ rather
 * than opened as file://, because the portrait <img> sources are site-absolute
 * (/avatars/portrait/*.webp) and file:// would resolve those against the
 * filesystem root and render nine broken images.
 *
 * Desktop is exactly 873 x 1224 -- the template's own size -- so at that
 * viewport --u is exactly 1px and the screenshot can be diffed against the
 * template pixel for pixel. deviceScaleFactor 2 then gives the measurement
 * scripts a 2x image to downsample, which removes most of the aliasing noise.
 *
 *   node scripts/table-reference/shot.mjs
 *   npx playwright install chromium   # once, if chromium is missing
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || path.resolve(HERE, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = process.env.SHOT_DIR || path.join(HERE, 'shots');
const PAGE = '/hub/training/table-reference.html';

const TYPES = {
  '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css',
  '.js': 'text/javascript', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

fs.mkdirSync(OUT, { recursive: true });
const launch = {
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
};
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);

for (const [w, h, name] of [[873, 1224, 'ref_full'], [390, 844, 'ref_390']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const missing = [];
  page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + PAGE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const broken = await page.evaluate(
    () => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src),
  );
  if (missing.length || broken.length) {
    console.error('ASSET PROBLEMS:', [...missing, ...broken].join('\n  '));
  }
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  await page.close();
  console.log(`wrote ${file}  (${w} x ${h} @2x)`);
}

await browser.close();
server.close();
