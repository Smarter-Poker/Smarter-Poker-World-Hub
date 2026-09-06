/**
 * EVERY LITERAL PUBLIC ASSET PATH IN THE SOURCE MUST EXIST IN public/.
 *
 * The general form of `every-avatar-path-resolves`, written 2026-09-06 after
 * the second webp conversion in one day. Converting an image is two edits - the
 * file and every reference to it - and the second one is invisible: a missed
 * reference does not fail a build, fail a test, or log anything. It renders a
 * grey box for a user, and only for a user.
 *
 * This session produced three separate instances of exactly that:
 *   - 25 references reverted by a `git checkout --` that was undoing an
 *     unrelated mistake, in files that then looked untouched;
 *   - `/avatars/default.png`, referenced 7 times across 4 files, which has
 *     never existed - and is the FALLBACK, so it failed precisely when
 *     something else had already gone wrong;
 *   - `/avatars/free/rabbit.webp`, whose sibling in AVATAR_LIBRARY had been
 *     repointed away in August with a comment calling it "the one broken tile
 *     in the gallery", while the pool listing the same file was left alone.
 *
 * All three were found by a test like this one, not by review.
 *
 * ── WHAT IS DELIBERATELY NOT CHECKED ─────────────────────────────────────────
 * Template literals (`/images/${slug}.webp`) cannot be resolved statically and
 * are skipped here; `every-avatar-path-resolves` covers the three runtime
 * builders that matter by enumerating their inputs. Paths under public/ that
 * nothing references are also not an error - that is the public-budget script's
 * job, and a file with no reference is waste rather than breakage.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

/**
 * A RATCHET, not a clean sweep. 27 paths were already broken the day this test
 * was written; each needs its own judgement (see the file's _readme), and
 * fixing 27 of those blind at the end of a session is how a real defect gets
 * introduced while tidying. So they are baselined, a pull request may not add
 * to the list, and a fixed one must be deleted from it in the same commit.
 */
const KNOWN = new Set(
  JSON.parse(readFileSync(join(ROOT, '__tests__/known-broken-asset-paths.json'), 'utf8')).paths
);

/** Directories under public/ whose contents are addressed from source. */
const ASSET_PREFIXES = ['/images/', '/assets/', '/avatars/', '/videos/', '/cards/', '/fonts/'];

const EXT = /\.(png|webp|avif|jpg|jpeg|gif|svg|mp4|webm|woff2?)$/i;

function sources(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sources(rel, out);
    else if (/\.(js|jsx|ts|tsx|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('every literal public asset path in the source exists on disk', () => {
  const files = [...sources('src'), ...sources('pages'), ...sources('styles')];
  const missing = new Map();

  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    // Quoted string literals, and url(...) in CSS.
    const patterns = [
      /['"`](\/[A-Za-z0-9_@./-]+)['"`]/g,
      /url\(\s*['"]?(\/[A-Za-z0-9_@./-]+)['"]?\s*\)/g,
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const url = m[1];
        if (url.includes('${')) continue;
        if (!ASSET_PREFIXES.some((p) => url.startsWith(p))) continue;
        if (!EXT.test(url)) continue;
        if (!existsSync(join(ROOT, 'public', url))) {
          if (!missing.has(url)) missing.set(url, new Set());
          missing.get(url).add(file);
        }
      }
    }
  }

  const fresh = [...missing.entries()].filter(([url]) => !KNOWN.has(url));
  const report = fresh
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, where]) => `  ${url}\n      ${[...where].sort().join('\n      ')}`);

  assert.deepEqual(
    report,
    [],
    `NEW asset paths referenced in source but absent from public/:\n${report.join('\n')}\n\n` +
      `Each renders as a broken image for a user and for nobody else - no build ` +
      `fails, no test fails, nothing is logged. If you just converted a format, ` +
      `the file moved and a reference did not.`
  );

  // The list must not rot the other way either: an entry that now resolves is
  // a fix somebody made without claiming it, and leaving it here quietly widens
  // the hole the next person is allowed to dig.
  const stillMissing = new Set(missing.keys());
  const healed = [...KNOWN].filter((url) => !stillMissing.has(url));
  assert.deepEqual(
    healed.sort(),
    [],
    `these are in known-broken-asset-paths.json but now resolve - delete them ` +
      `from that file in the commit that fixed them:\n  ${healed.sort().join('\n  ')}`
  );
});

test('no source still points at a PNG whose webp replaced it', () => {
  // The other half of a conversion: the reference was updated but the original
  // was left behind, or vice versa. Either way public/ carries both formats and
  // the next reader cannot tell which one is live - the state avatars/table sat
  // in for months while the database had already moved to webp.
  const files = [...sources('src'), ...sources('pages'), ...sources('styles')];
  const stale = new Map();

  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/['"`](\/[A-Za-z0-9_@./-]+\.png)['"`]/g)) {
      const url = m[1];
      if (!ASSET_PREFIXES.some((p) => url.startsWith(p))) continue;
      const webp = join(ROOT, 'public', url.replace(/\.png$/, '.webp'));
      const png = join(ROOT, 'public', url);
      // Only complain when the webp exists AND the png is gone: that is a
      // reference left behind by a conversion. Both present is a separate
      // (untidy but working) state, and png-only is simply not converted yet.
      if (existsSync(webp) && !existsSync(png)) {
        if (!stale.has(url)) stale.set(url, new Set());
        stale.get(url).add(file);
      }
    }
  }

  const report = [...stale.entries()].map(([url, where]) => `  ${url} <- ${[...where].join(', ')}`);
  assert.deepEqual(report, [], `references to a PNG that a webp has replaced:\n${report.join('\n')}`);
});
