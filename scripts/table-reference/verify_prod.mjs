/**
 * Structural checks on the LIVE production page, from the DOM.
 *
 * Division of labour, because mixing these up produces false failures:
 *   banddiff.py       how close the rendered pixels are to the template overall
 *   plateprofile.py   per-plate ink edges, template vs build
 *   this script       facts only the DOM can state -- what is beside what, which
 *                     image files actually loaded, how many seats exist
 *
 * In particular this does NOT compare element rects against the template
 * coordinates in the README. Those are gold-INK bounds: they include the plate's
 * box-shadow glow, which spills about 10px past the border box on each side and
 * about 5px top and bottom. getBoundingClientRect returns the border box. The
 * two disagree by that margin on every plate, consistently, and neither is
 * wrong. Ink is compared against ink in plateprofile.py.
 *
 * Exits non-zero, with the reason, if any check fails.
 *
 *   node scripts/table-reference/verify_prod.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.PROD_URL || 'https://smarter.poker/hub/training/table-reference.html';

// Non-letter glyphs the design itself calls for: card pips, and the XP bolt and
// gem that are drawn in the template's header chips. Anything pictographic
// outside this set is a placeholder that was never replaced.
const DESIGN_GLYPHS = new Set(['♥', '♦', '♣', '♠', '⚡', '◆']);

const launch = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 873, height: 1224 } });

const failures = [];
const responses = [];
page.on('response', (r) => responses.push([r.status(), r.url()]));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(600);

// --- unit scale: the whole geometry argument rests on --u being exactly 1 here
const u = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')),
);
if (Math.abs(u - 1) > 0.001) failures.push(`--u is ${u}, expected 1 at 873x1224`);

const rects = await page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const seats = [...document.querySelectorAll('.seat')].map((s) => ({
    name: s.querySelector('.pname')?.textContent ?? null,
    bb: s.querySelector('.pbb')?.textContent ?? null,
    hero: s.classList.contains('hero'),
    portrait: s.querySelector('img.portrait')?.getAttribute('src') ?? null,
    decoded: !!s.querySelector('img.portrait')?.naturalWidth,
    plate: box(s.querySelector('.plate')),
  }));
  return {
    seats,
    holecards: box(document.querySelector('.holecards')),
    cards: [...document.querySelectorAll('.holecards .card')].map(box),
    images: [...document.images].map((i) => ({
      src: i.getAttribute('src'),
      nw: i.naturalWidth,
      nh: i.naturalHeight,
    })),
    // any emoji / pictographic codepoint rendered as text anywhere on the page
    pictographs: (document.body.innerText.match(/\p{Extended_Pictographic}/gu) || []),
  };
});

const hero = rects.seats.find((s) => s.hero);
const hc = rects.holecards;
if (!hero) failures.push('no .seat.hero found');
if (!hc) failures.push('no .holecards found');

// --- CHECK 1: cards BESIDE the hero box, not above it
if (hero && hc) {
  const p = hero.plate;
  const gap = hc.x - p.right;
  // "beside" = starts to the right of the plate, and overlaps it vertically.
  const overlap = Math.min(hc.bottom, p.bottom) - Math.max(hc.y, p.y);
  const beside = hc.x >= p.right && overlap > 0;
  console.log(
    `cards beside hero: gap ${gap.toFixed(1)}px to the right, ` +
      `vertical overlap ${overlap.toFixed(1)}px   ${beside ? 'BESIDE' : 'NOT BESIDE'}`,
  );
  if (!beside) failures.push('hole cards are not beside the hero plate');
  if (hc.bottom <= p.y) failures.push('hole cards sit entirely above the hero plate');
}

// --- CHECK 2: real portrait art everywhere, no emoji standing in for a face
const bad = responses.filter(([s]) => s >= 400);
if (bad.length) failures.push(`${bad.length} responses >= 400: ${bad.map((b) => b.join(' ')).join(', ')}`);

const undecoded = rects.images.filter((i) => !i.nw);
if (undecoded.length) failures.push(`images failed to decode: ${undecoded.map((i) => i.src).join(', ')}`);

const nonPortrait = rects.images.filter((i) => !/^\/avatars\/portrait\/[a-z]+\.webp$/.test(i.src));
if (nonPortrait.length) failures.push(`unexpected image sources: ${nonPortrait.map((i) => i.src).join(', ')}`);

const stray = [...new Set(rects.pictographs)].filter((c) => !DESIGN_GLYPHS.has(c));
if (stray.length) failures.push(`unexpected pictographic characters on page: ${stray.join(' ')}`);
console.log(
  `\nglyphs: ${[...new Set(rects.pictographs)].join(' ')}` +
    ` (card pips + header chip icons, all present in the template; ${stray.length} stray)`,
);

console.log(`\n${rects.images.length} images, all from /avatars/portrait/, all decoded:`);
for (const i of rects.images) console.log(`  ${i.src.padEnd(34)} ${i.nw}x${i.nh}`);

console.log('\nseats:');
for (const s of rects.seats) {
  console.log(
    `  ${(s.hero ? 'HERO ' : '     ') + (s.name ?? '?').padEnd(11)} ${(s.bb ?? '').padEnd(7)}` +
      ` ${String(s.portrait).padEnd(32)} plate ${s.plate.x.toFixed(0)},${s.plate.y.toFixed(0)}` +
      ` ${s.plate.w.toFixed(0)}x${s.plate.h.toFixed(0)}  art ${s.decoded ? 'decoded' : 'BROKEN'}`,
  );
}
if (rects.seats.filter((s) => s.hero).length !== 1) failures.push('expected exactly one hero seat');
if (rects.seats.length !== 9) failures.push(`expected 9 seats, found ${rects.seats.length}`);
if (rects.seats.some((s) => !s.decoded)) failures.push('a seat portrait did not decode');

await browser.close();

console.log('');
if (failures.length) {
  console.error('FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED against ' + URL);
