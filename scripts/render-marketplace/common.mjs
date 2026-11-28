// Shared helpers for the marketplace render harness: CLI args, Playwright and
// browser resolution, viewports, and the pre-screenshot settle step.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv, usage) {
  const opts = { base: null, out: null, only: null, widths: [393, 1280] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--help' || flag === '-h') { console.log(usage); process.exit(0); }
    if (!['--base', '--out', '--only', '--widths'].includes(flag)) {
      console.error(`Unknown argument: ${flag}\n${usage}`);
      process.exit(1);
    }
    if (value === undefined) { console.error(`Missing value for ${flag}\n${usage}`); process.exit(1); }
    i += 1;
    if (flag === '--base') opts.base = value.replace(/\/+$/, '');
    if (flag === '--out') opts.out = path.resolve(value);
    if (flag === '--only') opts.only = value.split(',').map((s) => s.trim()).filter(Boolean);
    if (flag === '--widths') opts.widths = value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (!opts.base || !opts.out || !opts.widths.length) { console.error(usage); process.exit(1); }
  return opts;
}

// --only matches by substring, so "club-shop" selects every club-shop state.
export const selected = (name, only) => !only || only.some((f) => name.includes(f));

// 393 -> "phone" (393x852 @2x), 1280 -> "desk" (1280x900 @1x); any other width
// gets tag w<width>, with phone-like settings below 768px.
export function viewportFor(width) {
  const mobile = width < 768;
  const tag = width === 393 ? 'phone' : width === 1280 ? 'desk' : `w${width}`;
  return { width, height: mobile ? 852 : 900, dpr: mobile ? 2 : 1, tag };
}

// Playwright comes from the repo being rendered (run from the repo root).
export function loadPlaywright() {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  try {
    return require('playwright');
  } catch (e) {
    console.error(`Could not resolve playwright from ${process.cwd()}. Run from the repo root after npm install.\n${e.message}`);
    process.exit(1);
  }
}

const SYSTEM_CHROMES = [
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// CHROME_PATH, else Playwright's bundled chromium, else a system Chrome.
export function resolveExecutable(chromium) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const bundled = chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {}
  const system = SYSTEM_CHROMES.find((p) => fs.existsSync(p));
  if (system) return system;
  console.error('No browser found. Set CHROME_PATH, run `npx playwright install chromium`, or install Google Chrome.');
  process.exit(1);
}

export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  const executablePath = resolveExecutable(chromium);
  return chromium.launch({ executablePath, args: ['--no-sandbox'] });
}

// Supabase origin the dev build talks to (mocked in fixtures.prep).
export function supabaseUrl() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
  try {
    const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const m = env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^"'\s]+)/m);
    if (m) return m[1].replace(/\/+$/, '');
  } catch {}
  return 'http://127.0.0.1:54399';
}

// Run before every screenshot: hide the Next dev overlay and force lazy images
// to load, otherwise full-page captures show empty frames below the fold.
export async function settleForShot(page) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; })).catch(() => {});
  await page.waitForTimeout(1200);
}
