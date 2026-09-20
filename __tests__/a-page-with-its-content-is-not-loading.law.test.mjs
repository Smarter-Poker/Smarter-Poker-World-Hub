/**
 * A PAGE WITH ITS CONTENT IS NOT ALSO LOADING (AEO phase 3, 2026-09-19).
 *
 * All 1,191 sitemap routes were fetched as OAI-SearchBot with scripts
 * stripped and searched for a loading state in the server HTML. 259 pages
 * had one:
 *
 *     225  "Loading Series Details..."
 *      28  "Loading Tour Details..."
 *       6  one page each: the World Hub, Reels, Club Shop, Promotions,
 *          Pages and the Trivia Leaderboard
 *
 * The 253 in the first two lines are the ones that matter, because those
 * pages now carry their schedules. A series page rendered its venue, its
 * dates, its buy ins and all of its events, and then, underneath, in the
 * present tense: "Loading Series Details...". The document says two
 * opposite things and the contradiction is the last thing in it.
 *
 * A spinner is a promise to someone who is waiting. Nothing waits on the
 * server: the fetch it describes has not started and cannot start until a
 * browser runs the page.
 *
 * THIS LAW covers the two detail families, which is 253 of the 259. The
 * other six are one page each and a different shape, most of them a
 * dynamic() loading component rather than a branch; they are recorded in
 * .agent/audits/2026-09-19-aeo-a-page-is-not-loading.md rather than
 * exempted here, because an exemption list is a list and this programme has
 * learned what those are worth.
 *
 * Reads source; no install, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRaw = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Comments are stripped line by line, never with a block regex. The first
 * run of this law found "Loading Series Details..." in the comment that
 * explains why it is guarded, three hundred lines above the guarded JSX, and
 * accused the page of the thing it had just been fixed for. The block regex
 * version of this stripper ate 33,000 of USRobots.js's 37,000 characters
 * earlier in this programme; neither mistake is repeated here.
 */
function read(file) {
  const kept = [];
  let inBlock = false;
  for (const line of readRaw(file).split('\n')) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * The two pages that serve a detail family. Between them they are 253 of
 * the 1,191 routes in the sitemap, and they are the two that render their
 * content on the server, which is what makes a spinner beside it a
 * contradiction rather than merely noise.
 */
const DETAIL_PAGES = [
  { file: 'pages/hub/series/[id].js', text: 'Loading Series Details...', routes: 225 },
  { file: 'pages/hub/tours/[code].js', text: 'Loading Tour Details...', routes: 28 },
];

test('the detail pages do not tell a crawler they are still loading', () => {
  const offenders = [];
  for (const page of DETAIL_PAGES) {
    const src = read(page.file);
    const at = src.indexOf(page.text);
    if (at === -1) continue; // the spinner is gone entirely, which is fine
    // The guard has to be the nearest opening brace expression above it.
    const before = src.slice(Math.max(0, at - 700), at);
    if (!/hasMounted\s*&&/.test(before)) {
      offenders.push(`${page.file}: "${page.text}" reaches the server HTML of `
        + `${page.routes} routes that already carry their content`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'A spinner is a promise to someone who is waiting, and nothing waits on '
      + 'the server:\n  ' + offenders.join('\n  '),
  );
});

test('the mount flag flips after hydration, not during render', () => {
  const hook = readRaw('src/hooks/useHasMounted.js');
  assert.match(hook, /useState\(false\)/, 'it starts false, which is what the server renders');
  assert.match(
    hook,
    /useEffect\(\(\) => \{\s*setMounted\(true\);?\s*\}, \[\]\)/,
    'and flips in an effect. Flipping during render, or reading '
      + 'typeof window at render time, would make the client render something '
      + 'the server did not and hand React a hydration mismatch, which is a '
      + 'worse bug than the one this fixes.',
  );
});

test('both detail pages actually use it', () => {
  for (const page of DETAIL_PAGES) {
    const src = read(page.file);
    assert.match(src, /import useHasMounted from/, `${page.file} imports the hook`);
    assert.match(src, /const hasMounted = useHasMounted\(\);/, `${page.file} calls it`);
  }
});
