#!/usr/bin/env node
/**
 * check-ca-protected-features.mjs — LAYER 3 at the deploy boundary
 * ═══════════════════════════════════════════════════════════════════════════
 * Enforces the Club Arena PROTECTED FEATURE REGISTRY against the bundle that
 * is actually being deployed.
 *
 * The registry lives in the Club Arena repo at tests/protected-features.json
 * and rides into the build output at public/hub/club-arena/protected-features.json.
 * Each entry may list `bundleMarkers`: strings that must survive minification
 * into the shipped CSS/JS. If a registered feature's markers are missing, the
 * bundle does not contain that feature and must not be deployed.
 *
 * RELATIONSHIP TO THE OTHER GUARDS
 *   check-ca-build-provenance.mjs   refuses a bundle built from OLDER source —
 *                                   protects every feature at once, including
 *                                   unregistered ones. That is the primary net.
 *   THIS FILE                       names the feature that went missing, which
 *                                   is what makes a failure actionable, and
 *                                   catches losses that are not time-travel
 *                                   (a bad merge, a botched manual edit).
 *   Club Arena tests/protectedFeatures.test.ts   the same registry at source
 *                                                level, before anything builds.
 *
 * This replaces the feature-specific check-ca-throwables-freshness.mjs: that
 * script protected one feature; this protects every registered one, and
 * adding a feature is one entry in the registry rather than a new script.
 *
 * ON A FAILURE: do not weaken the registry. The bundle is wrong, not the rule.
 * Rebuild from a current Club Arena checkout (`git pull --rebase origin main`)
 * or let build-for-world-hub sync from canonical main.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'hub', 'club-arena');
const REGISTRY = path.join(ROOT, 'protected-features.json');
const ASSETS = path.join(ROOT, 'assets');

if (!existsSync(ROOT)) {
  console.log('✓ Club Arena not present in this checkout; skipping feature gate.');
  process.exit(0);
}

if (!existsSync(REGISTRY)) {
  // Older bundles predate the registry. The provenance gate is the backstop.
  console.warn(
    '! Club Arena features: no protected-features.json in the bundle.\n' +
      '  This build predates the registry. Rebuild from a current Club Arena\n' +
      '  checkout to enable per-feature enforcement.'
  );
  process.exit(0);
}

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
} catch (err) {
  console.error(`✗ Club Arena features: registry is unreadable (${err.message}).`);
  process.exit(1);
}

const features = Array.isArray(registry?.features) ? registry.features : [];
const guarded = features.filter((f) => Array.isArray(f.bundleMarkers) && f.bundleMarkers.length);

// ── SELF-REFERENCE GUARD (audit fix, 2026-08-21) ────────────────────────────
// The registry is read FROM THE BUNDLE, which means a stale build overwrites
// the registry along with everything else — shipping an OLD registry that no
// longer lists the features it dropped, and passing its own check. Compare the
// incoming registry against the one already committed: features may be added,
// and may be removed DELIBERATELY (which is a source change in the Club Arena
// repo), but a bundle that silently forgets features it used to protect is the
// signature of an older tree.
const committed = (() => {
  try {
    const raw = execSync('git show HEAD:public/hub/club-arena/protected-features.json', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const j = JSON.parse(raw);
    return Array.isArray(j?.features) ? j.features : null;
  } catch {
    return null; // first rollout, or not a git checkout
  }
})();

if (committed) {
  const incomingIds = new Set(features.map((f) => f.id));
  const vanished = committed.map((f) => f.id).filter((id) => !incomingIds.has(id));
  if (vanished.length) {
    console.error(
      `\n✗ Club Arena registry SHRANK — the incoming bundle no longer protects:\n` +
        vanished.map((id) => `    ${id}`).join('\n') +
        `\n\n  A registry that forgets its own entries is what a stale build looks\n` +
        `  like: the old tree never had them. If these features were removed on\n` +
        `  purpose, that removal belongs in the Club Arena repo (delete the entry\n` +
        `  in the same commit as the code) and this bundle should be rebuilt from\n` +
        `  that source.\n`
    );
    process.exit(1);
  }
}

if (!existsSync(ASSETS)) {
  console.error('✗ Club Arena features: no assets/ directory in the bundle.');
  process.exit(1);
}

// Read every emitted CSS/JS chunk once. The build splits by route, so a
// marker may live in any chunk; correctness needs the union, not per-file.
let haystack = '';
for (const name of readdirSync(ASSETS)) {
  if (!/\.(css|js)$/.test(name)) continue;
  const p = path.join(ASSETS, name);
  if (!statSync(p).isFile()) continue;
  haystack += readFileSync(p, 'utf8');
}

if (!haystack) {
  console.error('✗ Club Arena features: no CSS/JS chunks found to scan.');
  process.exit(1);
}

const failures = [];
for (const f of guarded) {
  const missing = f.bundleMarkers.filter((m) => !haystack.includes(m));
  if (missing.length) failures.push({ id: f.id, title: f.title, missing });
}

if (failures.length) {
  console.error('\n✗ Club Arena protected features MISSING from the deployed bundle\n');
  for (const f of failures) {
    console.error(`  ${f.id} — ${f.title}`);
    console.error(`    missing marker(s): ${f.missing.join(', ')}\n`);
  }
  console.error(
    '  A registered feature is not in the bundle being deployed. The usual cause\n' +
      '  is a build from a checkout that never pulled (the 2026-08-21 regression),\n' +
      '  which silently reverts whatever landed since.\n\n' +
      '  FIX: in the Club Arena checkout run `git pull --rebase origin main` and\n' +
      '  rebuild, or let build-for-world-hub sync from canonical main.\n' +
      '  Do NOT delete the registry entry to go green — that hides the loss.\n'
  );
  process.exit(1);
}

console.log(
  `✓ Club Arena protected features: ${guarded.length} guarded feature(s) present ` +
    `(${features.length} registered in total)`
);
process.exit(0);
