#!/usr/bin/env node
/**
 * PREFLOP CHARTS KEEPS ITS FONTS, LIVE (2026-11-28).
 *
 * The #SmarterDesign pass on Preflop Charts (#3216, #3240, #3264) removed
 * the old Orbitron console face, and found the shared FAQ falling back to
 * Times New Roman. Both were found by hand, in a browser, after a deploy.
 * This runs after every successful production deployment (the Live SEO
 * Contract workflow) and fails if any visible text on Preflop Charts or its
 * four sub pages computes to Orbitron or a serif face, at phone width.
 *
 * Usage: node scripts/ci/check-live-preflop-fonts.mjs [--base URL] [--sha SHA]
 *   --sha waits (up to 6 minutes) for /api/health to report that revision,
 *   so the check reads the deployment that triggered it.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREFLOP_PAGES = [
  '/hub/preflop-charts',
  '/hub/preflop-charts/stats',
  '/hub/preflop-charts/achievements',
  '/hub/preflop-charts/leaderboard',
  '/hub/preflop-charts/tutorial',
];

const SERIF_FIRST = /^(?:serif|times|times new roman|georgia|garamond|cambria|book antiqua|palatino|palatino linotype)$/i;

/** Why a computed font-family is not allowed here, or null when it is. */
export function fontViolation(fontFamily) {
  const families = String(fontFamily || '')
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  if (families.some((f) => /orbitron/i.test(f))) return 'Orbitron';
  if (!families.length || SERIF_FIRST.test(families[0])) return `serif (${families[0] || 'browser default'})`;
  return null;
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function waitForRevision(base, sha) {
  if (!sha) return null;
  const deadline = Date.now() + 6 * 60 * 1000;
  let seen = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { cache: 'no-store' });
      const body = await res.json();
      seen = body.commitSha || body.version || null;
      if (seen && (seen === sha || seen.startsWith(sha) || sha.startsWith(seen))) return seen;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error(`/api/health still reports ${seen} after 6 minutes, not ${sha}`);
}

async function main() {
  const base = arg('--base', 'https://smarter.poker').replace(/\/$/, '');
  const sha = arg('--sha');
  const live = await waitForRevision(base, sha);
  if (live) console.log(`  /api/health reports ${live}`);
  // CI installs Playwright into its own folder (PLAYWRIGHT_DIR) so the
  // browser it downloads and the library this script loads are one copy.
  const pwDir = process.env.PLAYWRIGHT_DIR;
  const { chromium } = pwDir
    ? createRequire(path.join(pwDir, 'package.json'))('playwright')
    : await import('playwright');
  // CI installs Playwright's Chromium; a machine with only Chrome can point
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE at it.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const failures = [];
  try {
    for (const route of PREFLOP_PAGES) {
      const page = await context.newPage();
      const res = await page.goto(`${base}${route}?font-check=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
      if (!res || res.status() !== 200) {
        failures.push(`${route}: answered ${res ? res.status() : 'nothing'}`);
        await page.close();
        continue;
      }
      await page.waitForTimeout(3000);
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const nodes = await page.evaluate(() => {
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const text = n.textContent.trim();
          if (!text) continue;
          const el = n.parentElement;
          if (!el || ['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
          if (!el.getClientRects().length) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          out.push({ tag: el.tagName, text: text.slice(0, 50), fontFamily: style.fontFamily });
        }
        return out;
      });
      const { fontViolation: check } = await import(import.meta.url);
      const bad = nodes.map((node) => ({ ...node, why: check(node.fontFamily) })).filter((node) => node.why);
      console.log(`  ${route}: ${nodes.length} visible text nodes, ${bad.length} in a banned face`);
      for (const b of bad.slice(0, 10)) failures.push(`${route}: <${b.tag}> "${b.text}" is ${b.why} (${b.fontFamily})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error('\nPREFLOP CHARTS FONTS BROKEN');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nPreflop Charts and its sub pages render no Orbitron and no serif text.');
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
