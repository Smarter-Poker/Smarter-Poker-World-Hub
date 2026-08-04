/**
 * Screenshot the LIVE production page, not the local file.
 *
 * shot.mjs proves the committed HTML is right. This proves production actually
 * serves it -- correct bytes, portraits resolving over the CDN, no 404s.
 *
 *   node scripts/table-reference/shot_prod.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR || path.join(HERE, 'shots');
const URL = process.env.PROD_URL || 'https://smarter.poker/hub/training/table-reference.html';

fs.mkdirSync(OUT, { recursive: true });
const launch = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);

for (const [w, h, name] of [[873, 1224, 'ref_full'], [390, 844, 'ref_390']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(600);
  const broken = await page.evaluate(
    () => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src),
  );
  const count = await page.evaluate(() => document.images.length);
  if (bad.length || broken.length) {
    console.error('ASSET PROBLEMS:', [...bad, ...broken].join('\n  '));
    process.exitCode = 1;
  } else {
    console.log(`${name}: ${count} images, all decoded, no >=400 responses`);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.close();
}

await browser.close();
