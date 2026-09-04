#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  check-icon-button-sizing — an inline width on .sp-icon-btn does nothing
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `.sp-icon-btn` in src/index.css declares
 *
 *     width:  var(--sp-btn-size, 32px) !important;
 *     height: var(--sp-btn-size, 32px) !important;
 *
 * and a stylesheet `!important` BEATS AN INLINE STYLE. So a component that
 * writes `style={{ width: 48, height: 48 }}` on that class is not making a
 * 48px button. It is making a 32px button and a comment that lies.
 *
 * That is not hypothetical. InteractiveTutorial's close button carried
 *
 *     // The parent spring enters at scale .95. Use 48px so the effective
 *     // hit area never drops below 44px while that animation settles.
 *     width: 48, height: 48,
 *
 * and rendered at 32px - 31.84px mid-spring, which is precisely the failure
 * that comment was written to prevent. It failed the Poker Near Me touch
 * target spec on every run, and a red Playwright suite makes every open pull
 * request "unstable", which GitHub refuses to enable auto-merge on. One
 * silently-discarded CSS declaration stopped the estate from merging.
 *
 * THE FIX IS THE VARIABLE, not the property: `'--sp-btn-size': '48px'` makes
 * the !important rule itself compute the size you asked for. That is the
 * extension point the utility was written with.
 *
 * This check does not fail on the existing ones - most are decorative buttons
 * where 32px is a deliberate desktop choice and changing all of them at once
 * is a visual decision, not a lint. It fails when the count GROWS, so the trap
 * cannot be re-laid quietly.
 *
 * Run: node scripts/ci/check-icon-button-sizing.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['src', 'pages', 'components'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SKIP = new Set(['node_modules', 'dist', '.next', 'test-results', '_to_delete']);

/** Recorded on 2026-09-03. This number may SHRINK, never grow. */
const BASELINE = 20;

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(e))) acc.push(full);
  }
  return acc;
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('sp-icon-btn')) continue;
    // Look at each place the class is applied, then at the style object that
    // follows it. A width the cascade will discard is the thing we report.
    const re = /className\s*=\s*["'{][^>]{0,400}?sp-icon-btn/g;
    let m;
    while ((m = re.exec(src))) {
      const seg = src.slice(m.index, m.index + 1200);
      const setsWidth = /\bwidth\s*:\s*(\d+|['"]\d+px)/.test(seg);
      const setsVar = seg.includes('--sp-btn-size');
      if (setsWidth && !setsVar) { offenders.push(file); break; }
    }
  }
}

const unique = [...new Set(offenders)].sort();
if (unique.length > BASELINE) {
  console.error(
    `check-icon-button-sizing FAILED - ${unique.length} file(s) set an inline width on\n` +
    `.sp-icon-btn without --sp-btn-size, up from a baseline of ${BASELINE}.\n\n` +
    `An inline width does NOTHING there: the class declares\n` +
    `  width: var(--sp-btn-size, 32px) !important\n` +
    `and a stylesheet !important beats an inline style. The button renders at\n` +
    `32px and the code says 48.\n\n` +
    `Fix: set the variable instead -  '--sp-btn-size': '48px'  - which makes the\n` +
    `!important rule compute the size you asked for.\n`
  );
  for (const f of unique) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `check-icon-button-sizing: OK - ${unique.length} known file(s) set a discarded inline ` +
  `width on .sp-icon-btn (baseline ${BASELINE}); none added.`
);
