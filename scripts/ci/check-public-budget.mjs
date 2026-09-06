/**
 * public/ HAS A BUDGET, AND THE NUMBER ONLY GOES DOWN.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Everything in `public/` is cloned, traced, deployed and cached by Vercel on
 * EVERY build, whether or not a byte of it changed. Measured 2026-09-05 from
 * the build events of a real production deployment:
 *
 *   cloning 15.1s · compile 30.4s · finalizing page optimization 32.4s
 *   collecting build traces 22.2s · deploying outputs 28.5s
 *   creating build cache 16.8s · uploading 644 MB of build cache 7.4s
 *
 * At that point `public/` held 632 MB across 2,357 files - and an audit could
 * not find a single serving reference to 244 MB of it: 137 loose PNGs dumped
 * into images/training by a one-off importer (69 of them literal
 * `_<timestamp>.png` duplicates of the other 68), 78 GTO panels whose runtime
 * reads Supabase Storage instead, 93 Club Commander images that
 * commander.smarter.poker already serves, 33 `*-review.html` dev artifacts
 * publicly reachable on the production domain, and thirteen intro videos whose
 * consumers were deleted in "remove intro videos from hub pages".
 *
 * None of that arrived deliberately. It arrived one commit at a time, because
 * nothing ever said no.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * This is a RATCHET, not a limit - the same shape as
 * scripts/ci/e2e-not-in-post-deploy.json in the Club Arena repo. The baseline
 * below is the size on the day it was set. A pull request may not exceed it.
 * When you legitimately remove weight, LOWER the baseline in the same pull
 * request, so the room you freed cannot be silently refilled by the next one.
 *
 * Adding a genuinely needed asset is not forbidden - it is forbidden to add it
 * without noticing. Raise the baseline deliberately, in a commit that says why,
 * and the reviewer sees the trade. That is the whole mechanism.
 *
 * ── BEFORE YOU RAISE IT ──────────────────────────────────────────────────────
 * Two cheaper answers almost always apply first:
 *   1. A modern format. 655 PNGs over 200 KB (478 MB) have no .webp or .avif
 *      sibling; avatars/vip alone is 86.6 MB at an average of 1.14 MB per
 *      avatar. avatars/table already proves the pattern works here.
 *   2. Somewhere that is not the build. Supabase Storage serves the GTO panels;
 *      commander.smarter.poker serves the Commander images; ca-static serves
 *      Club Arena. A file only belongs in public/ if the Next app itself must
 *      serve it.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Bytes. Set 2026-09-05 immediately after removing 244 MB of unreferenced
 * media, with ~5% of headroom so an ordinary asset addition is not a build
 * failure - only an unnoticed accumulation is.
 *
 * THE NUMBER GOES DOWN. If you lower it, say in the commit what you removed.
 */
const BUDGET_BYTES = 406_000_000;

/** Also a ratchet: a thousand new files is a problem a size cap can miss. */
const BUDGET_FILES = 2_050;

function walk(dir) {
  let bytes = 0;
  let files = 0;
  const biggest = [];
  const symlinks = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walk(path);
      bytes += sub.bytes;
      files += sub.files;
      biggest.push(...sub.biggest);
      symlinks.push(...sub.symlinks);
    } else if (entry.isFile()) {
      const size = statSync(path).size;
      bytes += size;
      files += 1;
      biggest.push({ path, size });
    } else if (entry.isSymbolicLink()) {
      symlinks.push(path);
    }
  }
  biggest.sort((a, b) => b.size - a.size);
  return { bytes, files, biggest: biggest.slice(0, 10), symlinks };
}

const mb = (n) => `${(n / 1_000_000).toFixed(1)} MB`;

const { bytes, files, biggest, symlinks } = walk('public');
const overBytes = bytes - BUDGET_BYTES;
const overFiles = files - BUDGET_FILES;

console.log(`public/ is ${mb(bytes)} across ${files} files.`);
console.log(`budget:  ${mb(BUDGET_BYTES)} across ${BUDGET_FILES} files.`);

if (symlinks.length > 0) {
  console.error('');
  console.error('::error title=public/ CONTAINS SYMBOLIC LINKS::Vercel production packaging requires real public assets. Symbolic links can resolve differently or point at deleted files during artifact collection.');
  console.error('');
  console.error('Replace or remove these symbolic links:');
  for (const path of symlinks.sort()) console.error(`  ${path}`);
  process.exit(1);
}

if (overBytes <= 0 && overFiles <= 0) {
  const slack = mb(-overBytes);
  console.log(`OK - ${slack} and ${-overFiles} files under budget.`);
  // The ratchet only bites if somebody tightens it. Say so when the gap grows.
  if (-overBytes > 30_000_000) {
    console.log(
      `::notice title=LOWER THE PUBLIC BUDGET::public/ is ${slack} under its budget. ` +
        `Tighten BUDGET_BYTES in scripts/ci/check-public-budget.mjs so the room cannot be refilled unnoticed.`
    );
  }
  process.exit(0);
}

console.error('');
console.error(`::error title=public/ IS OVER BUDGET::public/ is ${mb(bytes)} (${files} files) against a budget of ${mb(BUDGET_BYTES)} (${BUDGET_FILES} files). Everything here is cloned, traced, deployed and cached on EVERY Vercel build.`);
console.error('');
console.error('The ten largest files in public/ right now:');
for (const f of biggest) console.error(`  ${mb(f.size).padStart(9)}  ${f.path}`);
console.error('');
console.error('Before raising the budget, try: a .webp/.avif instead of a PNG, or');
console.error('serving the file from Supabase Storage / commander.smarter.poker /');
console.error('ca-static.smarter.poker instead of from this build. If it genuinely');
console.error('belongs here, raise BUDGET_BYTES in the same commit and say why.');
process.exit(1);
