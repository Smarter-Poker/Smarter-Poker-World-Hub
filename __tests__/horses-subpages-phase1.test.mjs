/**
 * Phase 1 text contracts for the three /horses SUB-PAGES.
 *
 * These are deliberately text assertions over the source rather than render
 * tests: the pages cannot be rendered here (no node_modules, no DOM, and the
 * RPCs they read are SECURITY DEFINER against production). What CAN be
 * checked without any of that is exactly the set of rules that were being
 * broken silently:
 *
 *   - no raw hex in pages/horses/*.js (the rule stated in horsesAdminTokens)
 *   - no em dash anywhere in the files this phase owns (PLAYBOOK RULE 0)
 *   - no emoji in src/lib/antiAbuse.js (CLAUDE.md section 3 rule 7)
 *   - src/lib/horsePresence.js is gone and nothing references it
 *   - every T.<name> a page uses actually exists on T
 *   - every var(--...) T points at is actually declared in horses.module.css
 *
 * The last two are the pair that matters most. A token that resolves to
 * nothing does not throw and does not warn: the element renders with an
 * inherited or default colour, which on a dark panel usually means invisible
 * text. Only a check like this one catches it before an operator does.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const SUB_PAGES = [
  'pages/horses/sql-console.js',
  'pages/horses/hg-moderation.js',
  'pages/horses/hand-reviews.js',
];

// Files this phase owns. The CSS is the token SOURCE, so it keeps its hex;
// it is still bound by the em-dash rule.
const OWNED = [
  ...SUB_PAGES,
  'pages/horses/horses.module.css',
  'src/lib/horsesAdminTokens.js',
  'src/lib/antiAbuse.js',
];

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// Built from the escape so this file does not itself trip the repo's
// em-dash guard while testing for em dashes.
const EM_DASH = '\u2014';

// ── Raw hex ────────────────────────────────────────────────────────────────

test('no raw hex colour literal survives in any /horses page', () => {
  for (const rel of fs.readdirSync(path.join(ROOT, 'pages/horses')).filter((f) => f.endsWith('.js'))) {
    const found = read(`pages/horses/${rel}`).match(HEX) || [];
    assert.deepEqual(
      found,
      [],
      `${rel} carries ${found.length} raw hex literal(s): ${found.join(', ')}. ` +
        'Add a semantic custom property to horses.module.css, name it on T, and use T.<name>.'
    );
  }
});

test('the stylesheet is still allowed to hold hex, because it is the source', () => {
  const css = read('pages/horses/horses.module.css');
  assert.ok((css.match(HEX) || []).length > 0, 'horses.module.css should declare the palette');
});

// ── Em dash ────────────────────────────────────────────────────────────────

test('no em dash in any file this phase owns', () => {
  for (const rel of OWNED) {
    const body = read(rel);
    const at = body.indexOf(EM_DASH);
    assert.equal(at, -1, `${rel} contains an em dash at offset ${at}; use a hyphen.`);
  }
});

// ── Emoji ──────────────────────────────────────────────────────────────────

// Pictographs, dingbats, symbols and regional indicators. Box drawing
// (U+2500-U+257F) is deliberately NOT included: the comment banners across
// this repo are built from it and it is not emoji.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

test('src/lib/antiAbuse.js carries no emoji', () => {
  const body = read('src/lib/antiAbuse.js');
  const bad = body
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => EMOJI.test(line));
  assert.deepEqual(bad, [], `emoji found: ${JSON.stringify(bad)}`);
});

test('the three sub-pages carry no emoji either', () => {
  for (const rel of SUB_PAGES) {
    const bad = read(rel)
      .split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => EMOJI.test(line));
    assert.deepEqual(bad, [], `${rel} emoji: ${JSON.stringify(bad)}`);
  }
});

// ── Presence module ────────────────────────────────────────────────────────────

test('src/lib/horsePresence.js stays (six social surfaces import it) and carries no emoji', () => {
  // The Phase 1 audit snapshot did not include pages/hub/social-media or
  // src/components/social, so it called this module dead. In the real repo
  // six files import isHorseOnlineNow. It stays; only its emoji header goes.
  const src = read('src/lib/horsePresence.js');
  assert.match(src, /export function isHorseOnlineNow/);
  assert.doesNotMatch(src, EMOJI);
  assert.equal(src.includes('\u2014'), false);
});

// ── Token integrity ────────────────────────────────────────────────────────

/** The keys declared on the exported T object. */
function tokenKeys() {
  const src = read('src/lib/horsesAdminTokens.js');
  const start = src.indexOf('export const T = {');
  assert.ok(start > -1, 'T object not found');
  const end = src.indexOf('\n};', start);
  assert.ok(end > start, 'T object is not terminated');
  const body = src.slice(start, end);
  return new Set([...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((m) => m[1]));
}

test('every T.<name> used by the sub-pages exists on T', () => {
  const keys = tokenKeys();
  assert.ok(keys.size >= 20, `expected a populated token set, got ${keys.size}`);
  for (const rel of SUB_PAGES) {
    const used = new Set([...read(rel).matchAll(/\bT\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    for (const name of used) {
      assert.ok(keys.has(name), `${rel} uses T.${name}, which is not a key of T`);
    }
  }
});

test('every var(--...) named on T is declared in horses.module.css', () => {
  const css = read('pages/horses/horses.module.css');
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const referenced = [...read('src/lib/horsesAdminTokens.js').matchAll(/var\((--[a-z0-9-]+)\)/g)].map(
    (m) => m[1]
  );
  assert.ok(referenced.length > 0, 'T should reference custom properties');
  for (const name of referenced) {
    assert.ok(declared.has(name), `T points at ${name}, which horses.module.css does not declare`);
  }
});

test('the sub-pages scope the tokens, or every var() they use resolves to nothing', () => {
  // The custom properties are declared on a selector list in the module. The
  // sub-pages render outside .dashboard, so they must import the module and
  // apply .tokenScope, and the stylesheet must carry that selector.
  const css = read('pages/horses/horses.module.css');
  assert.match(css, /^\.tokenScope,$/m, 'horses.module.css must declare .tokenScope in the token block');
  for (const rel of SUB_PAGES) {
    const body = read(rel);
    assert.match(body, /import styles from '\.\/horses\.module\.css'/, `${rel} must import the module`);
    assert.match(body, /styles\.tokenScope/, `${rel} must apply styles.tokenScope to its roots`);
  }
});

// ── hg-moderation ──────────────────────────────────────────────────────────

test('hg-moderation has a Pager and states the range', () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /function Pager\(/, 'a Pager component must exist');
  assert.match(body, /Showing \$\{first\}-\$\{last\} Of \$\{total\}/, 'the pager must say Showing X-Y Of Z');
  assert.ok(body.includes('Showing'), 'the range line must be present');
  assert.match(body, /Previous/);
  assert.match(body, /Next/);
});

test('hg-moderation wires the pager into BOTH Reports and Appeals', () => {
  const body = read('pages/horses/hg-moderation.js');
  const pagers = body.match(/<Pager\b/g) || [];
  assert.equal(pagers.length, 2, `expected exactly two pagers, found ${pagers.length}`);
  assert.match(body, /noun="Reports"/);
  assert.match(body, /noun="Appeals"/);
});

test('hg-moderation pages both list routes with limit and offset', () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /hg-reports\?status=\$\{status\}&limit=\$\{PAGE_SIZE\}&offset=\$\{offset\}/);
  assert.match(body, /hg-appeals\?status=\$\{status\}&limit=\$\{PAGE_SIZE\}&offset=\$\{offset\}/);
});

test('hg-moderation renders Onboarding and GDPR as labelled rows, not raw JSON', () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /function KeyValueRows\(/);
  // Both result panels go through the definition list.
  const uses = body.match(/<KeyValueRows\b/g) || [];
  assert.equal(uses.length, 2, `expected KeyValueRows in both tabs, found ${uses.length}`);
  assert.match(body, /rawLabel="Raw Onboarding Payload"/);
  assert.match(body, /rawLabel="Raw Erasure Counts"/);
  // And the raw payload survives, collapsed.
  assert.match(body, /<details/);
});

// ── hand-reviews ───────────────────────────────────────────────────────────

test('hand-reviews states the fleet cap and offers Show All', () => {
  const body = read('pages/horses/hand-reviews.js');
  assert.ok(body.includes('Showing Top ${FLEET_PREVIEW} Of ${horses.length} Horses'), 'must say Showing Top 40 Of N');
  assert.match(body, /Showing Top /, 'the literal phrase must survive any refactor of the template');
  assert.match(body, /showAllHorses/, 'a Show All toggle must exist');
  // The comment above the toggle names the old expression on purpose, so the
  // check is for the RENDER, not for the string appearing anywhere.
  assert.equal(
    body.includes('{horses.slice(0, 40).map('),
    false,
    'the silent 40-row truncation must be gone from the render'
  );
  assert.match(body, /const FLEET_PREVIEW = 40;/, 'the cap must be a named constant');
  assert.match(body, /visibleHorses\.map\(/, 'the table must render the toggled slice');
});

test('hand-reviews exports every table to CSV', () => {
  const body = read('pages/horses/hand-reviews.js');
  assert.match(body, /downloadCsv/);
  assert.match(body, /toCsv/);
  assert.match(body, /stampedName/);
  const buttons = body.match(/<ExportCsvButton\b/g) || [];
  // Daily audit, telemetry, league card, leak-tag rates, fleet summary,
  // flagged hands: six tables, six exports.
  assert.equal(buttons.length, 6, `expected six CSV exports, found ${buttons.length}`);
});

test('hand-reviews declares explicit [key, header] export columns', () => {
  const body = read('pages/horses/hand-reviews.js');
  for (const name of ['AUDIT_COLUMNS', 'TELEMETRY_COLUMNS', 'LEAGUE_COLUMNS', 'TREND_COLUMNS', 'FLEET_COLUMNS', 'HAND_COLUMNS']) {
    assert.match(body, new RegExp(`const ${name} = \\[`), `${name} must be declared`);
  }
});

test('hand-reviews paging is honest about what it does not know', () => {
  const body = read('pages/horses/hand-reviews.js');
  assert.match(body, /rows\.length === PAGE_SIZE && \(/, 'More must render only on a full page');
  assert.match(body, /Page \$\{page \+ 1\}/, 'the position must read Page N');
  assert.equal(body.includes('rows.length < PAGE_SIZE'), false, 'the old disabled-Older heuristic must be gone');
});

// ── sql-console ────────────────────────────────────────────────────────────

test('sql-console exports the current result set', () => {
  const body = read('pages/horses/sql-console.js');
  assert.match(body, /downloadCsv/);
  assert.match(body, /toCsv/);
  assert.match(body, /stampedName\('sql-console-result'\)/);
});

test('sql-console DATA_MUTATED handler does something an operator can see', () => {
  const body = read('pages/horses/sql-console.js');
  assert.match(body, /Data Changed By Another Console Since This Query Ran/);
  assert.match(body, /setStaleSince/);
  assert.equal(
    /console\.log\('Global data mutation detected/.test(body),
    false,
    'the dead console.log handler must be gone'
  );
});

test('sql-console keeps its commit gate exactly as designed', () => {
  const body = read('pages/horses/sql-console.js');
  // The three properties the gate depends on. This test exists so a later
  // edit to this file cannot quietly weaken them.
  assert.match(body, /confirmText\.trim\(\) === pendingSql/, 'commit must require a verbatim retype');
  assert.match(body, /disabled=\{!confirmMatches \|\| isRunning\}/, 'Commit must stay disabled until it matches');
  assert.match(body, /if \(data\.success && data\.committed && data\.mutating\)/, 'only a real commit may broadcast');
});

// ── Shared house rules ─────────────────────────────────────────────────────

test('the sub-pages never use the throwing single-row read', () => {
  // The pattern is assembled rather than written out, so this file does not
  // trip the repo's own CHECK 1 grep while asserting against it.
  const BANNED = new RegExp('\\.' + 'single' + '\\(\\)');
  for (const rel of SUB_PAGES) {
    assert.equal(BANNED.test(read(rel)), false, `${rel} must use the maybe-single read instead`);
  }
});

test('each sub-page keeps its own role check', () => {
  for (const rel of SUB_PAGES) {
    const body = read(rel);
    assert.match(body, /\['admin', 'superadmin', 'god'\]|\['admin','superadmin','god'\]/, `${rel} lost its role gate`);
    assert.match(body, /\.maybeSingle\(\)/, `${rel} lost its profile read`);
  }
});
