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
 * incoming build's source commit is older than the one it replaces, whatever
 * landed in between is about to be erased — no matter which feature it was.
 *
 * ── WHAT IS COMPARED (rewritten 2026-08-21 after an audit found the v1
 *    comparison could never fire) ────────────────────────────────────────────
 * v1 compared the WORKING TREE against `git show HEAD`. That is wrong in both
 * places this actually runs:
 *
 *   pre-push  the hook runs AFTER the commit, so the new bundle is already at
 *             HEAD and the working tree matches it — v1 saw "same commit" and
 *             waved every push through.
 *   CI        Actions checks out the pushed commit, so HEAD is again the new
 *             bundle. Same blind spot.
 *
 * The meaningful question is "does this change to the bundle move it
 * backwards?", so the baseline must be the PREVIOUS REVISION OF THE FILE, not
 * the current one:
 *
 *   incoming  the working-tree copy when it differs from HEAD (a build that is
 *             staged but not yet committed), otherwise the copy at HEAD.
 *   baseline  the copy at the last commit that changed the file before that.
 *
 * Then:
 *   incoming.commitTime  <  baseline.commitTime  -> BLOCK (time travel)
 *   incoming.commit      == baseline.commit      -> allow (rebuild, no move)
 *   incoming.commitTime  >= baseline.commitTime  -> allow (forward)
 *
 * It compares SOURCE commit time, not build time: a stale checkout produces a
 * brand-new build time from ancient source, which is precisely the failure.
 *
 * DEGRADED CASES
 * - No provenance anywhere yet (first rollout): allow, and say so.
 * - No provenance in the incoming bundle: allow with a warning — a Club Arena
 *   that predates stamping. Flip REQUIRE_STAMP once every builder stamps.
 * - Unparseable or timeless provenance: BLOCK. "Cannot prove it is newer" is
 *   not the same as "is newer".
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

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return null;
  }
};

function parse(raw, where) {
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('not an object');
    return j;
  } catch (err) {
    console.error(`✗ Club Arena provenance: the ${where} ca-provenance.json is unreadable (${err.message}).`);
    process.exit(1);
  }
}

function timeOf(info, where) {
  const t = Date.parse(info?.commitTime ?? '');
  if (!Number.isFinite(t)) {
    console.error(
      `✗ Club Arena provenance: the ${where} ca-provenance.json has no usable commitTime ` +
        `(got ${JSON.stringify(info?.commitTime)}).\n` +
        `  Unknown provenance cannot be proven newer, so it is refused.`
    );
    process.exit(1);
  }
  return t;
}

const short = (c) => String(c ?? 'unknown').slice(0, 8);

// ── INCOMING ────────────────────────────────────────────────────────────────
// Prefer the working tree (a build staged but not yet committed); fall back to
// HEAD (the normal case in CI and in pre-push, which runs after the commit).
const headRaw = git(`show HEAD:${REL}`);
let incomingRaw = null;
let incomingWhere = '';

if (existsSync(ABS)) {
  incomingRaw = readFileSync(ABS, 'utf8');
  incomingWhere = 'working tree';
} else if (headRaw) {
  incomingRaw = headRaw;
  incomingWhere = 'HEAD';
}

if (!incomingRaw) {
  const legacy = path.join(process.cwd(), LEGACY_REL);
  const hint =
    existsSync(legacy) || git(`show HEAD:${LEGACY_REL}`)
      ? `\n  (Found the older ${LEGACY_REL}, which records BUILD time, not source time.\n` +
        `   Build time cannot order deploys: a stale checkout builds "now" from old\n` +
        `   source. Ordering resumes on the next sync from a Club Arena that stamps.)`
      : '';
  const msg =
    `Club Arena provenance: no ${REL} found.\n` +
    `  This bundle predates provenance stamping (scripts/stamp-build-provenance.mjs\n` +
    `  in the Club Arena repo). Rebuild from a current Club Arena checkout.` + hint;
  if (REQUIRE_STAMP) {
    console.error('✗ ' + msg);
    process.exit(1);
  }
  console.warn('! ' + msg);
  process.exit(0);
}

const incoming = parse(incomingRaw, incomingWhere);

// ── BASELINE ────────────────────────────────────────────────────────────────
// The revision this bundle is REPLACING.
//   - working tree differs from HEAD -> baseline is HEAD
//   - otherwise                      -> baseline is the previous commit that
//                                       touched the file
let baselineRaw = null;
let baselineWhere = '';

if (incomingWhere === 'working tree' && headRaw && headRaw !== incomingRaw) {
  baselineRaw = headRaw;
  baselineWhere = 'HEAD';
} else {
  const log = git(`log --format=%H -- ${REL}`);
  const commits = (log || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  // commits[0] is the commit that introduced the CURRENT content; the one
  // before it is what production was serving until this change.
  for (let i = 1; i < commits.length; i++) {
    const prev = git(`show ${commits[i]}:${REL}`);
    if (prev && prev !== incomingRaw) {
      baselineRaw = prev;
      baselineWhere = `commit ${short(commits[i])}`;
      break;
    }
  }
}

if (!baselineRaw) {
  console.log(
    `✓ Club Arena provenance: first stamped bundle ` +
      `(${short(incoming.commit)} @ ${incoming.commitTime}). Nothing to compare against yet.`
  );
  process.exit(0);
}

const baseline = parse(baselineRaw, baselineWhere);
const tIn = timeOf(incoming, incomingWhere);
const tOut = timeOf(baseline, baselineWhere);

if (incoming.commit && baseline.commit && incoming.commit === baseline.commit) {
  console.log(
    `✓ Club Arena provenance: same source commit ${short(incoming.commit)} — rebuild, no move.`
  );
  process.exit(0);
}

if (tIn < tOut) {
  const hours = ((tOut - tIn) / 3600000).toFixed(1);
  const behind =
    typeof incoming.behindMain === 'number' && incoming.behindMain > 0
      ? `\n  Its checkout was ${incoming.behindMain} commit(s) behind origin/main.`
      : '';
  const dirty = incoming.dirty ? '\n  It also had uncommitted changes.' : '';
  console.error(
    `\n✗ Club Arena provenance: DEPLOY WOULD MOVE PRODUCTION BACKWARDS\n\n` +
      `  replacing : ${short(baseline.commit)}  ${baseline.commitTime}  (${baselineWhere})\n` +
      `  incoming  : ${short(incoming.commit)}  ${incoming.commitTime}  (${incomingWhere})\n` +
      `  regression: ${hours} hour(s) of source history would be erased.${behind}${dirty}\n\n` +
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
    `(${short(baseline.commit)} ${baseline.commitTime} -> ${short(incoming.commit)} ${incoming.commitTime})`
);
process.exit(0);
