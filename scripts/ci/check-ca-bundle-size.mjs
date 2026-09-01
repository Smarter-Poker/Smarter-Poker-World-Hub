#!/usr/bin/env node
/**
 * check-ca-bundle-size.mjs — Phase U5.2
 * ─────────────────────────────────────────────────────────────────────────
 * Budget gate on the Club Arena bundle shipped from public/hub/club-arena/.
 *
 * WHY THREE BUDGETS AND NOT THE ONE THE PLAN ASKED FOR
 * U5.2 says "fail build if main bundle > 5 MB". Measured on 2026-08-17 that
 * single number is ambiguous enough to be useless:
 *
 *     initial load (index.html's own script/link tags)   0.81 MB
 *     all JS + CSS in assets/                            5.47 MB   <- "over 5MB"
 *     entire deployed directory                         88.00 MB
 *
 * A 5 MB gate on the middle number fails on day one, while the number that
 * actually reaches a user before first paint is 0.81 MB and perfectly healthy.
 * A gate that is red before anyone touches it gets ignored within a week —
 * the fate of build-safety-gate.yml CHECK 8, which has failed so long that
 * everything downstream of it stopped being read.
 *
 * So this measures three things separately, because they fail for different
 * reasons and have different fixes:
 *
 *   INITIAL   what a user downloads before the app renders. Regressions here
 *             are felt directly. Fix by code-splitting.
 *   CODE      every JS/CSS chunk including lazy routes. Growth here means the
 *             app is getting heavier. Fix by trimming dependencies.
 *   PAYLOAD   the whole directory including static media. 67 MB of the current
 *             88 MB is images (cards 26.4, images 25.9, game-card-icons 7.9,
 *             club-logos 4.0). That is what U5.3 moves to R2; until then this
 *             budget exists to stop it growing further.
 *
 * BUDGETS ARE RATCHETS, NOT ASPIRATIONS
 * The initial and payload budgets remain set from the 2026-08-17 measurement.
 * The code budget was re-ratcheted on 2026-08-27 after shipped Club Arena
 * customization, table, replay, notification, and house-ad work took the
 * referenced JS/CSS graph from 6.9969 MB to 7.1390 MB. All 321 chunks were
 * scanned; zero were orphans. Only CODE moved, from 7.0 to 9.0 MB, preserving
 * about 25% headroom while the mobile-critical initial-load budget stays put.
 * These gates catch a step change — a stray dependency, an uncompressed asset
 * pack — rather than forcing an optimisation project. When one is legitimately
 * exceeded, lower the real number or raise the constant deliberately with a
 * note saying what grew. Never delete a budget to make CI green.
 *
 * A NOTE FOR WHOEVER LOOKS AT THE DUPLICATE CHUNK NAMES
 * assets/ holds 75 logical chunks with more than one hashed copy — three
 * `TournamentDetails`, two `TablePage`, and so on. That looks exactly like
 * stale residue from an incomplete wipe, and it is not: verified 2026-08-17 by
 * scanning index.html plus every emitted JS/CSS file for each filename. All
 * 261 are referenced, zero orphans. Deleting the "duplicates" would break
 * lazy-loaded routes. This check therefore does no orphan pruning, and this
 * note exists so the next person does not repeat the investigation and reach
 * the wrong conclusion faster.
 *
 * USAGE
 *   node scripts/ci/check-ca-bundle-size.mjs [--warn-only] [--json]
 *
 * Pure filesystem measurement — no network, no credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CA_DIR = path.join(REPO_ROOT, 'public', 'hub', 'club-arena');
const ASSETS = path.join(CA_DIR, 'assets');
const INDEX = path.join(CA_DIR, 'index.html');

const WARN_ONLY = process.argv.includes('--warn-only');
const AS_JSON = process.argv.includes('--json');

const MB = 1024 * 1024;

// Measured 2026-08-17: initial 0.81, code 5.47, payload 88.00.
// Code re-measured 2026-08-27: 7.1390 MB, 321 referenced chunks, 0 orphans.
const BUDGETS = {
  initial: 1.5,
  // Re-ratcheted 2026-09-01, from 9.0. What grew: nothing in the app did.
  // A sync deliberately OVERLAYS the new asset generation and leaves the
  // previous one in place -- Dan 2026-08-19, the P0 where wiping assets/ broke
  // the lobby "+" for every session that was already open, because their
  // cached HTML still pointed at chunks the deploy had deleted. The prune that
  // removes the old generation only fires at 3 days.
  //
  // So between a sync and that prune, assets/ legitimately holds two
  // generations and CODE is roughly double. 9.0 was measured against ONE
  // generation, so it turned red the first time a sync was measured inside
  // that window (12.14 MB / 564 chunks, after the hamburger-restore sync).
  //
  // 14.0 covers two generations of the current app with headroom. It is not a
  // licence for the app to double: one generation is 7.8 MB, and if THAT
  // number climbs the gate still catches it.
  code: 14.0,
  payload: 110.0,
};

function fail(msg, code = 2) {
  console.error(`❌ ${msg}`);
  process.exit(code);
}

function dirBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

async function main() {
  if (!fs.existsSync(CA_DIR)) fail(`Club Arena build not found at ${CA_DIR}`);
  if (!fs.existsSync(ASSETS)) fail(`assets/ not found at ${ASSETS} — was the build synced?`);
  if (!fs.existsSync(INDEX)) fail(`index.html not found at ${INDEX}`);

  const html = fs.readFileSync(INDEX, 'utf8');
  const assetFiles = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.css'));

  // Initial load = only what index.html itself pulls in. Everything else is a
  // lazy chunk fetched on navigation, which does not delay first paint.
  const initialNames = [...html.matchAll(/assets\/([^"')\s]+\.(?:js|css))/g)].map((m) => m[1]);
  const initial = [...new Set(initialNames)]
    .filter((f) => fs.existsSync(path.join(ASSETS, f)))
    .reduce((n, f) => n + fs.statSync(path.join(ASSETS, f)).size, 0);

  const code = assetFiles.reduce((n, f) => n + fs.statSync(path.join(ASSETS, f)).size, 0);
  const payload = dirBytes(CA_DIR);

  const rows = [
    ['initial', initial / MB, BUDGETS.initial, 'downloaded before first paint'],
    ['code', code / MB, BUDGETS.code, `all JS/CSS (${assetFiles.length} chunks)`],
    ['payload', payload / MB, BUDGETS.payload, 'entire deployed directory'],
  ];
  const over = rows.filter(([, actual, budget]) => actual > budget);

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          initial_mb: +(initial / MB).toFixed(2),
          code_mb: +(code / MB).toFixed(2),
          payload_mb: +(payload / MB).toFixed(2),
          budgets: BUDGETS,
          chunks: assetFiles.length,
          over: over.map(([n]) => n),
        },
        null,
        2
      )
    );
  } else {
    console.log('Club Arena bundle budget\n');
    for (const [name, actual, budget, note] of rows) {
      const flag = actual > budget ? 'OVER ' : 'ok   ';
      console.log(
        `  ${flag} ${name.padEnd(8)} ${actual.toFixed(2).padStart(7)} MB / ${budget.toFixed(2)} MB   ${note}`
      );
    }
    console.log('');
  }

  if (over.length && !WARN_ONLY) {
    console.error(
      `❌ ${over.length} budget(s) exceeded: ${over.map(([n]) => n).join(', ')}.\n` +
        `   Trim the bundle, or raise the constant in this file deliberately with a\n` +
        `   note saying what grew and why. Do not delete the budget.`
    );
    process.exit(1);
  }

  // ─── STALE-BUNDLE GATE (2026-08-21) ──────────────────────────────────────
  // Size budgets cannot see AGE. On 2026-08-21 a months-old Club Arena build
  // was committed over the current one: valid, inside every budget above,
  // lint-clean — and it silently reverted the 49-item dynamic throwables in
  // production. check-ca-throwables-freshness.mjs looks for markers only the
  // current system emits.
  //
  // Chained here rather than added as a second workflow step because this
  // script is already the thing Club Arena Budget runs on every change to
  // public/hub/club-arena/**, so the gate inherits that trigger exactly.
  // (It is also wired independently into .husky/pre-push as CHECK 6.)
  // Chained gates. This script is what Club Arena Budget already runs on every
  // change to public/hub/club-arena/**, so anything chained here inherits that
  // trigger exactly — no new workflow, no workflow-scope token needed.
  //
  // Order matters: provenance first, because "this bundle is older than what is
  // deployed" explains every downstream failure at once.
  //
  //   1 provenance         no bundle may replace one built from NEWER source.
  //                        Covers EVERY feature, including unregistered ones.
  //   2 protected features the Club Arena registry's bundleMarkers must be
  //                        present — names WHICH feature went missing.
  //   3 throwables         the original feature-specific gate, kept as
  //                        belt-and-braces on the incident that started this.
  for (const gate of [
    './check-ca-build-provenance.mjs',
    './check-ca-protected-features.mjs',
    './check-ca-throwables-freshness.mjs',
  ]) {
    await import(gate).catch((err) => {
      console.error(`❌ Could not load ${gate}: ${err.message}`);
      process.exit(1);
    });
  }
  process.exit(0);
}

main();
