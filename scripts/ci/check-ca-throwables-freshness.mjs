#!/usr/bin/env node
/**
 * check-ca-throwables-freshness.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * STALE-BUNDLE GATE for the Club Arena build in public/hub/club-arena/.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-08-21)
 * The 49-item dynamic throwables system (3D Supabase renders, per-item
 * physics/impact signatures, per-item procedural SFX) was built, pushed to
 * Smarter-Poker-Club-Arena main, CI-synced here, and verified live. Hours
 * later production REGRESSED to the retired hand-drawn SVG throwables.
 *
 * Nothing in either repo's SOURCE was reverted. What happened is that a
 * deploy loop on the Mac rebuilt Club Arena from a LOCAL checkout that had
 * never pulled the cloud-pushed work, and committed that months-old bundle
 * straight over public/hub/club-arena/ ("sync build font fix and stats fix",
 * f7e15f7, then 4f9643d). A stale build silently replaced a current one, and
 * every existing gate passed: the bundle was valid, within budget, and had
 * no lint errors. It was just OLD.
 *
 * WHAT THIS CHECKS
 * The deployed TablePage CSS chunk must contain markers that ONLY the
 * current throwables system emits. They are load-bearing selectors, not
 * decoration — if they are absent, the bundle predates the rebuild:
 *
 *   data-throwable            per-item signature blocks (49 of them)
 *   throw-animation__fxi      the impact FX layer
 *   --impact-dur              the per-item timing engine
 *
 * It also fails if the bundle still carries `throwable-selector__fallback`
 * WITHOUT the markers above, which is the retired SVG-icon selector.
 *
 * HOW TO FIX A FAILURE (do not delete this gate)
 * The bundle is stale, not the source. On the machine that produced it:
 *     cd ~/Documents/club-arena && git pull
 * then rebuild, or simply let the Club Arena repo's build-for-world-hub
 * workflow sync from canonical main — that is the only sanctioned path per
 * CLAUDE.md section 1.1. Never "fix" this by editing public/hub/club-arena
 * by hand; that directory is build output.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ASSETS = path.join(process.cwd(), 'public', 'hub', 'club-arena', 'assets');

/** Markers only the post-2026-08-20 throwables system emits. */
const REQUIRED = ['data-throwable', 'throw-animation__fxi', '--impact-dur'];

function fail(lines) {
  console.error('\n✗ Club Arena throwables freshness: FAILED\n');
  for (const l of lines) console.error('  ' + l);
  console.error(
    '\n  The deployed bundle is STALE — it predates the 49-item dynamic\n' +
      '  throwables rebuild. This is the 2026-08-21 regression signature: a\n' +
      '  local checkout that never pulled main was rebuilt over the synced\n' +
      '  output.\n\n' +
      '  FIX: `git pull` in the Club Arena checkout and rebuild, or let\n' +
      '  build-for-world-hub sync from canonical main (CLAUDE.md 1.1).\n' +
      '  Do NOT hand-edit public/hub/club-arena — it is build output.\n'
  );
  process.exit(1);
}

if (!existsSync(ASSETS)) {
  // Nothing deployed in this checkout — not this gate's business.
  console.log('✓ Club Arena assets not present in this checkout; skipping.');
  process.exit(0);
}

const tableCss = readdirSync(ASSETS).filter((f) => /^TablePage-[A-Za-z0-9_-]+\.css$/.test(f));

if (tableCss.length === 0) {
  fail(['No TablePage-*.css chunk found in public/hub/club-arena/assets/.']);
}

// The build emits more than one hashed TablePage chunk (see the note in
// check-ca-bundle-size.mjs — they are all referenced, none are orphans), so
// the markers must be present across the set, not necessarily in every file.
const combined = tableCss.map((f) => readFileSync(path.join(ASSETS, f), 'utf8')).join('\n');

const missing = REQUIRED.filter((m) => !combined.includes(m));

if (missing.length > 0) {
  const detail = [
    `Scanned ${tableCss.length} TablePage CSS chunk(s): ${tableCss.join(', ')}`,
    `Missing marker(s): ${missing.join(', ')}`,
  ];
  if (combined.includes('throwable-selector__fallback')) {
    detail.push('Bundle still contains the RETIRED SVG-icon selector styles.');
  }
  fail(detail);
}

// Count signature blocks as a second signal: the system defines one per item.
const sigCount = (combined.match(/data-throwable=/g) || []).length;
if (sigCount < 40) {
  fail([
    `Only ${sigCount} per-item throwable signature selectors found (expect ~49).`,
    'The bundle carries a partial or older version of the signature stylesheet.',
  ]);
}

console.log(
  `✓ Club Arena throwables freshness: current bundle ` +
    `(${sigCount} per-item signatures, all markers present)`
);
process.exit(0);
