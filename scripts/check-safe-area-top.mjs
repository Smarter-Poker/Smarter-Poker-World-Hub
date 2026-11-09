#!/usr/bin/env node
/**
 * scripts/check-safe-area-top.mjs
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SAFE-AREA TOP GUARD (SAFE-AREA-TOP-GUARD)                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE LAW THIS ENFORCES
 * ---------------------
 * The viewport is `viewport-fit=cover` (pages/_app.js), so the page starts
 * UNDER the iPhone status bar / Dynamic Island. src/index.css deliberately
 * does NOT put `padding-top: env(safe-area-inset-top)` on <body> — that was
 * removed 2026-09-07 because it double-counted against every bar that applies
 * its own inset (the "header sits too low" bug: 59 + 59 = 118px).
 *
 * The contract since then is exactly one sentence:
 *
 *     EVERY TOP-ANCHORED BAR OWNS ITS OWN env(safe-area-inset-top).
 *     THE BODY OWNS NONE.
 *
 * On 2026-11-09 five bars were found that never claimed one. The worst was the
 * landing page nav: Sign Up and Sign In painted under the clock and Wi-Fi icons
 * and could not be tapped at all. This script exists so that can never ship
 * again — in either direction.
 *
 * WHAT IT CHECKS
 * --------------
 *   PART 1 — CONTRACTS. Named bars that are the topmost chrome on their screen
 *            must still carry their exact inset expression. Deleting or
 *            rewriting one fails CI.
 *   PART 2 — BODY LAW. src/index.css must NOT reintroduce a top inset on
 *            <body>. That is the other half of the bug: it double-counts.
 *   PART 3 — NEW OFFENDERS. Any NEW top-anchored bar (position fixed/sticky,
 *            top:0, not a full-screen overlay) that does not carry the inset
 *            fails, measured against scripts/safe-area-top-baseline.json.
 *   PART 4 — DORMANT BARS. Two components are real top bars with no inset that
 *            nothing currently renders. Wiring one up would ship the bug all
 *            over again, so importing one fails until it is given its inset.
 *
 * RUNNING IT
 * ----------
 *   node scripts/check-safe-area-top.mjs            → check (exit 1 on failure)
 *   node scripts/check-safe-area-top.mjs --update   → rewrite the baseline
 *
 * WHEN THIS FAILS ON YOUR PR
 * --------------------------
 *   Part 1/2 failure → you removed an inset, or put one back on <body>. Don't.
 *       If the removal is deliberate, delete that entry from CONTRACTS in the
 *       SAME PR, with a comment saying why the bar is no longer topmost.
 *   Part 3 failure  → you added a new top bar. Give it:
 *           padding-top: calc(<its own padding> + env(safe-area-inset-top, 0px));
 *           box-sizing: border-box;
 *       …and the failure goes away on its own.
 *       ONLY if the bar genuinely is NOT the topmost chrome (it sits below
 *       UniversalHeader, or it is a centred modal, a print style, or a 2-3px
 *       decorative hairline with no tap target) run `--update` to baseline it,
 *       and say in the PR why it is exempt. Baselining a real top bar
 *       reintroduces the exact bug this guard exists to stop.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'safe-area-top-baseline.json');
const UPDATE = process.argv.includes('--update');

const INSET = 'safe-area-inset-top';

// ───────────────────────────────────────────────────────────────────────────
// PART 1 — CONTRACTS
// Each bar below is the TOPMOST chrome on its screen: nothing renders above
// it, so it is the one element that must reserve the status bar. The exact
// string is what must survive. Verified live on production 2026-11-09 by
// measuring each control with a simulated 59px Dynamic Island inset.
// ───────────────────────────────────────────────────────────────────────────
const CONTRACTS = [
  {
    file: 'pages/index.js',
    bar: 'landing page nav (Sign Up / Sign In)',
    why: 'THE reported bug — both buttons were unreachable under the status bar',
    must: [`paddingTop: 'calc(12px + env(${INSET}, 0px))'`],
  },
  {
    file: 'pages/index.js',
    bar: 'landing page feature-overlay backdrop',
    why: 'its close (x) button is the ONLY way out of the overlay',
    must: [`paddingTop: 'env(${INSET}, 0px)'`],
  },
  {
    file: 'pages/USRobots.js',
    bar: 'pitch deck top bar + scroll progress bar',
    why: '--topbar carries the inset so every consumer below it offsets too',
    must: [
      `--topbar: calc(54px + env(${INSET}, 0px))`,
      `--topbar:calc(48px + env(${INSET}, 0px))`,
      `padding-top:env(${INSET}, 0px)`,
      `top:env(${INSET}, 0px)`,
    ],
  },
  {
    file: 'pages/horses/horses.module.css',
    bar: 'Stable Admin console header',
    why: 'topmost chrome on that page — it renders no global header',
    must: [`padding-top: calc(16px + env(${INSET}, 0px))`],
  },
  {
    file: 'src/components/ui/ChunkLoadRecovery.jsx',
    bar: 'stale-chunk recovery banner',
    why: 'mounts at top:0 on EVERY page and carries the only control on it',
    must: [`paddingTop: 'calc(14px + env(${INSET}, 0px))'`],
  },
  {
    file: 'src/components/ui/UniversalHeader.js',
    bar: 'the global header every hub page renders',
    why: 'if this loses its inset, every signed-in page breaks at once',
    must: [
      `padding-top: calc(8px + env(${INSET}, 0px))`,
      `padding-top: env(${INSET}, 0px)`,
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// PART 3 — SCAN CONFIG
// ───────────────────────────────────────────────────────────────────────────
const SCAN_ROOTS = ['pages', 'src', 'styles'];
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'archive', '_legacy_backups',
  '__tests__', 'tests', 'e2e', '_to_delete_r4', 'dist', 'build', 'vendor',
]);
const EXTS = ['.js', '.jsx', '.ts', '.tsx', '.css'];

// ───────────────────────────────────────────────────────────────────────────
// PART 4 — DORMANT TOP BARS
// These two ARE top-anchored bars with no inset, but nothing imports them, so
// they ship to nobody and were left alone rather than refactored blind on
// 2026-11-09. MultiTableView in particular drives sibling offsets from a
// TAB_BAR_HEIGHT constant, which would have to grow with the inset too.
// The moment a page renders one, the landing-page bug is back — so importing
// one fails this guard until it is given its inset.
// ───────────────────────────────────────────────────────────────────────────
const DORMANT = [
  {
    file: 'src/components/navigation/WorldNavHeader.jsx',
    symbol: 'WorldNavHeader',
    note: 'fixed top:0, height 60 — offset consumers must shift with the inset',
  },
  {
    file: 'src/components/poker/MultiTableView.jsx',
    symbol: 'MultiTableView',
    note: 'fixed top:0 tab bar — TAB_BAR_HEIGHT offsets must grow with the inset',
  },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Every brace-delimited block in the text, with its 1-based start line. */
function blocks(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) break; }
    }
    if (j < text.length && j - i < 3000) {
      const line = text.slice(0, i).split('\n').length;
      out.push({ line, body: text.slice(i, j + 1) });
    }
  }
  return out;
}

const RE_POSITION = /position:\s*['"]?(fixed|sticky)/;
const RE_TOP_ZERO = /\btop:\s*['"]?0/;
const RE_BOTTOM_ZERO = /\bbottom:\s*['"]?0/;
const RE_INSET_ZERO = /\binset:\s*['"]?0/;
const RE_FULL_HEIGHT = /height:\s*['"]?(100%|100vh|100dvh)/;

/** Top-anchored bars with no inset of their own. Full-screen overlays excluded. */
function offendersIn(text) {
  const found = [];
  for (const { line, body } of blocks(text)) {
    if (!RE_POSITION.test(body)) continue;
    if (!RE_TOP_ZERO.test(body)) continue;
    if (RE_BOTTOM_ZERO.test(body)) continue;   // full-screen overlay
    if (RE_INSET_ZERO.test(body)) continue;    // full-screen overlay
    if (RE_FULL_HEIGHT.test(body)) continue;   // full-screen layer
    if (body.includes(INSET)) continue;        // already owns its inset
    found.push(line);
  }
  return found;
}

function scan() {
  const counts = {};
  for (const root of SCAN_ROOTS) {
    for (const abs of walk(join(ROOT, root))) {
      const text = readFileSync(abs, 'utf8');
      if (text.includes(INSET) && offendersIn(text).length === 0) continue;
      const hits = offendersIn(text);
      if (hits.length === 0) continue;
      counts[relative(ROOT, abs).split(sep).join('/')] = hits.length;
    }
  }
  return counts;
}

// ───────────────────────────────────────────────────────────────────────────
const failures = [];
const read = (rel) => {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; }
};

// PART 1
for (const c of CONTRACTS) {
  const text = read(c.file);
  if (text === null) {
    failures.push(`${c.file} is gone — it held: ${c.bar}\n    ${c.why}`);
    continue;
  }
  for (const needle of c.must) {
    if (!text.includes(needle)) {
      failures.push(
        `${c.file} — ${c.bar}\n` +
        `    lost its status-bar inset. Expected to find:\n` +
        `      ${needle}\n` +
        `    ${c.why}`
      );
    }
  }
}

// PART 2 — the body must still own NO top inset.
const indexCss = read('src/index.css');
if (indexCss === null) {
  failures.push('src/index.css is missing — the body safe-area law lives there.');
} else {
  const bodyBlocks = indexCss.match(/body\s*\{[^}]*\}/g) || [];
  const offending = bodyBlocks.filter((b) => /padding-top:\s*[^;]*env\(\s*safe-area-inset-top/.test(b));
  if (offending.length > 0) {
    failures.push(
      'src/index.css — <body> has a top safe-area inset again.\n' +
      '    Removed 2026-09-07: it double-counts against every bar that owns\n' +
      '    its own inset (59 + 59 = 118px of empty page above the header).\n' +
      '    The bars own the inset. The body owns none.'
    );
  }
}

// PART 3
const current = scan();
if (UPDATE) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({
      _README: [
        'Files with top-anchored bars that do NOT carry env(safe-area-inset-top),',
        'and are allowed not to: bars below UniversalHeader, centred modals,',
        'print stylesheets, dev-only banners, and decorative hairlines with no',
        'tap target. The value is how many such blocks that file has.',
        'A NEW path here, or a HIGHER count, fails CI — see',
        'scripts/check-safe-area-top.mjs. Regenerate with --update, and say in',
        'the PR why the new bar is exempt.',
      ],
      files: current,
    }, null, 2) + '\n',
    'utf8'
  );
  console.log(`[safe-area-top] baseline written: ${Object.keys(current).length} file(s)`);
}

let baseline = { files: {} };
try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch {
  if (!UPDATE) failures.push(`${relative(ROOT, BASELINE_PATH)} is missing — run --update to create it.`);
}

const known = baseline.files || {};
for (const [path, count] of Object.entries(current)) {
  const was = known[path];
  if (was === undefined) {
    failures.push(
      `${path} — NEW top-anchored bar with no status-bar inset.\n` +
      `    Give it:  padding-top: calc(<its padding> + env(${INSET}, 0px));\n` +
      `              box-sizing: border-box;\n` +
      `    If it genuinely is not the topmost chrome, run\n` +
      `      node scripts/check-safe-area-top.mjs --update\n` +
      `    and say in the PR why it is exempt.`
    );
  } else if (count > was) {
    failures.push(
      `${path} — gained ${count - was} more top-anchored bar(s) with no inset ` +
      `(was ${was}, now ${count}).\n` +
      `    Same fix as above, or --update with a reason if exempt.`
    );
  }
}

// PART 4 — dormant bars must stay dormant until they own an inset.
const allFiles = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));
for (const d of DORMANT) {
  const own = read(d.file);
  if (own === null) continue;              // deleted outright: fine
  if (own.includes(INSET)) continue;       // somebody gave it its inset: fine
  const importers = allFiles.filter((abs) => {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel === d.file) return false;
    const t = readFileSync(abs, 'utf8');
    return new RegExp(`import\\s+${d.symbol}\\b|from\\s+['"\`][^'"\`]*${d.symbol}['"\`]`).test(t);
  }).map((abs) => relative(ROOT, abs).split(sep).join('/'));
  if (importers.length > 0) {
    failures.push(
      `${d.file} — ${d.symbol} is a top bar with NO status-bar inset, and it is\n` +
      `    now imported by: ${importers.join(', ')}\n` +
      `    ${d.note}\n` +
      `    Give it its inset before rendering it, or the landing-page bug ships again.`
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error('');
  console.error('SAFE-AREA TOP GUARD FAILED');
  console.error('Every top-anchored bar owns its own env(safe-area-inset-top).');
  console.error('The body owns none. See scripts/check-safe-area-top.mjs.');
  console.error('');
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
    console.error('');
  }
  process.exit(1);
}

console.log('[safe-area-top] OK');
console.log(`  ${CONTRACTS.length} named top bar(s) still carry their inset`);
console.log('  <body> still carries none');
console.log(`  ${Object.keys(current).length} baselined exempt file(s), no new offenders`);
console.log(`  ${DORMANT.length} dormant top bar(s) still unrendered`);
