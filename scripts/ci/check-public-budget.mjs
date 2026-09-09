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
 *   1. A modern format. 268 files have been converted; 141 PNGs over 200 KB
 *      still have no .webp or .avif sibling, worth ~111 MB. Two things in that
 *      remainder must NOT be converted, and both are laws rather than taste:
 *        - public/images/footers/footer-*-v2.png are pinned by SHA-256 in
 *          __tests__/bottom-nav-clearance.test.mjs, which also asserts the
 *          bytes ARE PNG and reads width/height out of the PNG header for the
 *          hit-zone geometry.
 *        - public/images/global-header/** is pinned by three separate laws.
 *          Read Club Arena CLAUDE.md 10.7 before going near it.
 *      public/images/og-default.png stays PNG too: Open Graph scrapers are
 *      unreliable with webp, and a broken social preview is invisible to us.
 *   2. Somewhere that is not the build. Supabase Storage serves the GTO panels;
 *      commander.smarter.poker serves the Commander images; ca-static serves
 *      Club Arena. A file only belongs in public/ if the Next app itself must
 *      serve it.
 */
import { readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Bytes. Set 2026-09-05 after removing 244 MB of unreferenced media, with ~5%
 * of headroom so an ordinary asset addition is not a build failure - only an
 * unnoticed accumulation is.
 *
 * RAISED ONCE, ON 2026-09-09, 260 -> 272 MB: the OCR engine. Receipt and
 * dealer-document scanning used to photograph a player's tax form and send it
 * to a vision model. Tesseract compiled to WebAssembly now reads it on the
 * player's own device, and the engine has to be served from our own origin or
 * it comes from somebody else's CDN. That is 14.1 MB, generated into
 * public/tesseract by scripts/copy-tesseract-assets.mjs, and it is counted
 * below whether or not that script has run yet.
 *
 * LOWERED TWICE ON 2026-09-06. First 406 -> 300 MB: 200 avatar PNGs became
 * webp, 117.9 -> 11.6 MB. Then 300 -> 260 MB: another 68 across images/pitch,
 * lobby-pods, video-sources and assets/club-arena, 41.1 -> 4.3 MB. Both times
 * the room freed is taken away in the same commit, which is the whole point of
 * a ratchet - and both times this script's own LOWER THE PUBLIC BUDGET notice
 * is what said to do it.
 *
 * THE NUMBER GOES DOWN. If you lower it, say in the commit what you removed.
 */
const BUDGET_BYTES = 272_000_000;

/** Also a ratchet: a thousand new files is a problem a size cap can miss. */
const BUDGET_FILES = 1_850;

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

const walked = walk('public');
const { biggest, symlinks } = walked;

/**
 * Assets that are GENERATED into public/ at build time, counted here even
 * when they are not on disk yet.
 *
 * This script walks the checkout. The OCR engine is copied out of
 * node_modules by `prebuild`, so on a fresh CI checkout it is not there, and
 * without this the 14 MB it adds to every Vercel deploy would be invisible to
 * a ratchet whose entire purpose is that nothing arrives unnoticed.
 */
let generatedBytes = 0;
let generatedFiles = 0;
const generatedNotes = [];
for (const [dir, script] of [['tesseract', '../copy-tesseract-assets.mjs'], ['pdfjs', '../copy-pdfjs-assets.mjs']]) {
  if (existsSync(join('public', dir))) continue;
  try {
    const { generatedBytes: measure } = await import(script);
    const measured = measure();
    if (measured) {
      generatedBytes += measured.bytes;
      generatedFiles += measured.files;
      generatedNotes.push(`${mb(measured.bytes)} into public/${dir}`);
    } else {
      generatedNotes.push(`public/${dir} could not be measured; run npm ci`);
    }
  } catch (err) {
    generatedNotes.push(`public/${dir} could not be measured: ${err.message}`);
  }
}
const generatedNote = generatedNotes.length ? ` (+ ${generatedNotes.join('; ')} at build time)` : '';

const bytes = walked.bytes + generatedBytes;
const files = walked.files + generatedFiles;
const overBytes = bytes - BUDGET_BYTES;
const overFiles = files - BUDGET_FILES;

console.log(`public/ is ${mb(bytes)} across ${files} files${generatedNote}.`);
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
