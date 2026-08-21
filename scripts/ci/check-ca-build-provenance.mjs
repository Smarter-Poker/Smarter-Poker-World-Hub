#!/usr/bin/env node
/**
 * check-ca-build-provenance.mjs — LAYER 2, the monotonic deploy gate
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE GUARD THAT PROTECTS EVERY FEATURE, INCLUDING ONES NOT WRITTEN YET.
 *
 * Rule: a Club Arena bundle may never be replaced by one built from OLDER
 * source. Deploys move forward or stand still. They never time-travel.
 *
 * WHY (2026-08-21): production silently lost the 49-item dynamic throwables.
 * Nothing was reverted in source. A deploy loop rebuilt Club Arena from a
 * local checkout 96 commits BEHIND origin/main and committed that bundle over
 * the current one. Every gate passed — the bundle was valid, in budget and
 * lint-clean. It was simply OLD, and no gate could tell, because a built
 * bundle carried no memory of its source.
 *
 * Feature-marker gates (check-ca-protected-features.mjs) protect the features
 * someone remembered to register. THIS protects everything at once: if the
 * incoming build's source commit is older than the deployed one, whatever
 * landed in between is about to be erased — no matter which feature it was.
 *
 * HOW IT WORKS
 * Club Arena's build writes dist/build-info.json (scripts/stamp-build-
 * provenance.mjs) recording the source commit and its committer timestamp.
 * That file rides into public/hub/club-arena/. This compares the WORKING-TREE
 * copy (what is about to be committed/deployed) against the copy in git HEAD
 * (what is already deployed):
 *
 *   incoming.commitTime  <  deployed.commitTime   -> BLOCK (time travel)
 *   incoming.commit      == deployed.commit       -> allow (rebuild, no-op)
 *   incoming.commitTime  >= deployed.commitTime   -> allow (forward)
 *
 * It compares SOURCE commit time, not build time: a stale checkout produces a
 * brand-new build time from ancient source, which is precisely the failure.
 *
 * DEGRADED CASES
 * - No build-info in HEAD (first rollout): allow, and say so.
 * - No build-info in the working tree: allow with a warning — an older Club
 *   Arena that predates stamping. Becomes blocking once stamping has shipped
 *   everywhere (flip REQUIRE_STAMP).
 * - Unparseable/unknown provenance: BLOCK. "Cannot prove it is newer" is not
 *   the same as "is newer".
 *
 * OVERRIDE (deliberate rollback): ALLOW_CA_ROLLBACK=1. Intentionally rolling
 * production back to older Club Arena source is legitimate; doing it BY
 * ACCIDENT is what this stops. The override is loud and leaves a trail.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// ca-provenance.json is written by the Club Arena build itself and carries the
// SOURCE commit + its committer time. build-info.json is the older file written
// by build-for-world-hub.yml; it records ca_sha and BUILD time, and build time
// cannot order deploys (a stale checkout builds "now" from ancient source), so
// it is only ever a fallback that warns.
const REL = 'public/hub/club-arena/ca-provenance.json';
const ABS = path.join(process.cwd(), REL);
const LEGACY_REL = 'public/hub/club-arena/build-info.json';
const REQUIRE_STAMP = false; // flip to true once every builder stamps

function parse(raw, where) {
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('not an object');
    return j;
  } catch (err) {
    console.error(`✗ Club Arena provenance: ${where} build-info.json is unreadable (${err.message}).`);
    process.exit(1);
  }
}

function timeOf(info, where) {
  const t = Date.parse(info?.commitTime ?? '');
  if (!Number.isFinite(t)) {
    console.error(
      `✗ Club Arena provenance: ${where} build-info.json has no usable commitTime ` +
        `(got ${JSON.stringify(info?.commitTime)}).\n` +
        `  Unknown provenance cannot be proven newer, so it is refused.`
    );
    process.exit(1);
  }
  return t;
}

// ── incoming: the working-tree copy about to be committed/deployed ──────────
if (!existsSync(ABS)) {
  const legacy = path.join(process.cwd(), LEGACY_REL);
  const hint = existsSync(legacy)
    ? `\n  (Found the older ${LEGACY_REL}, which records BUILD time, not source time.\n` +
      `   Build time cannot order deploys: a stale checkout builds "now" from old\n` +
      `   source. Ordering resumes on the next sync from a Club Arena that stamps.)`
    : '';
  const msg =
    `Club Arena provenance: no ${REL} in the working tree.\n` +
    `  This build predates provenance stamping (scripts/stamp-build-provenance.mjs\n` +
    `  in the Club Arena repo). Rebuild with a current Club Arena checkout.` + hint;
  if (REQUIRE_STAMP) {
    console.error('✗ ' + msg);
    process.exit(1);
  }
  console.warn('! ' + msg);
  process.exit(0);
}
const incoming = parse(readFileSync(ABS, 'utf8'), 'incoming');

// ── deployed: the copy already committed at HEAD ────────────────────────────
let deployedRaw = null;
try {
  deployedRaw = execSync(`git show HEAD:${REL}`, {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
} catch {
  deployedRaw = null;
}

if (!deployedRaw) {
  // Nothing stamped at HEAD yet: this is the first stamped bundle. Allow, and
  // from here on every subsequent deploy is ordered against it.
  console.log(
    `✓ Club Arena provenance: first stamped bundle ` +
      `(${String(incoming.commit).slice(0, 8)} @ ${incoming.commitTime}). Nothing to compare against yet.`
  );
  process.exit(0);
}

const deployed = parse(deployedRaw, 'deployed');
const tIn = timeOf(incoming, 'incoming');
const tOut = timeOf(deployed, 'deployed');

const short = (c) => String(c ?? 'unknown').slice(0, 8);

if (incoming.commit && deployed.commit && incoming.commit === deployed.commit) {
  console.log(
    `✓ Club Arena provenance: same source commit ${short(incoming.commit)} — rebuild, no move.`
  );
  process.exit(0);
}

if (tIn < tOut) {
  const days = ((tOut - tIn) / 86400000).toFixed(2);
  const behind =
    typeof incoming.behindMain === 'number' ? `\n  Its checkout was ${incoming.behindMain} commit(s) behind origin/main.` : '';
  console.error(
    `\n✗ Club Arena provenance: DEPLOY WOULD MOVE PRODUCTION BACKWARDS\n\n` +
      `  deployed now : ${short(deployed.commit)}  ${deployed.commitTime}\n` +
      `  incoming     : ${short(incoming.commit)}  ${incoming.commitTime}\n` +
      `  regression   : ${days} day(s) of source history would be erased.${behind}\n\n` +
      `  This is the 2026-08-21 signature: a bundle built from a checkout that\n` +
      `  never pulled. Everything merged in between — every feature, not just\n` +
      `  the one you noticed — disappears from production.\n\n` +
      `  FIX: in the Club Arena checkout run\n` +
      `         git pull --rebase origin main\n` +
      `       then rebuild, or let build-for-world-hub sync from canonical main.\n\n` +
      `  Deliberately rolling back? Re-run with ALLOW_CA_ROLLBACK=1.\n`
  );
  if (process.env.ALLOW_CA_ROLLBACK === '1') {
    console.error('  ALLOW_CA_ROLLBACK=1 set — proceeding with a DELIBERATE rollback.\n');
    process.exit(0);
  }
  process.exit(1);
}

console.log(
  `✓ Club Arena provenance: moves forward ` +
    `(${short(deployed.commit)} ${deployed.commitTime} -> ${short(incoming.commit)} ${incoming.commitTime})`
);
process.exit(0);
