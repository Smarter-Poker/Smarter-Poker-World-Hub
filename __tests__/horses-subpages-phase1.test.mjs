/**
 * Phase 1 text contracts for the three /horses SUB-PAGES, plus unit coverage of
 * the pure pager arithmetic they share.
 *
 * Most of these are deliberately text assertions over the source rather than
 * render tests: the pages cannot be rendered here (no node_modules, no DOM, and
 * the RPCs they read are SECURITY DEFINER against production). What CAN be
 * checked without any of that is exactly the set of rules that were being
 * broken silently:
 *
 *   - no raw hex in pages/horses/*.js (the rule stated in horsesAdminTokens)
 *   - no em dash anywhere in the files this phase owns (PLAYBOOK RULE 0)
 *   - no emoji in src/lib/antiAbuse.js (CLAUDE.md section 3 rule 7)
 *   - src/lib/horsePresence.js is gone and nothing references it
 *   - every T.<name> a page uses actually exists on T
 *   - every var(--...) T points at is declared IN THE BLOCK THAT CARRIES
 *     .tokenScope, and every full-page root of every sub-page carries that class
 *
 * The last one is the pair that matters most, and the 2026-09-02 review showed
 * why the earlier version of it was worthless. A token that resolves to nothing
 * does not throw and does not warn: the element renders with an inherited or
 * default colour, which on a dark panel usually means invisible text. Asserting
 * that the class appears ONCE in a file, and that the property is declared
 * SOMEWHERE in the stylesheet, catches neither "a new root forgot the class"
 * nor "the property is declared on .dashboard only". Both are checked properly
 * below: every root is enumerated, and only the token block is harvested.
 *
 * Whitespace-shape assertions (`/if \(x\) \{\s*\n\s*await y\(/`) are avoided
 * throughout: a formatter or one inserted comment breaks them with behaviour
 * unchanged, which teaches the next agent that the test is noise.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pagerModel } from '../src/components/horses/pagerModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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
const EM_DASH = '—';

// ── The files still contain their subject matter ───────────────────────────
// Five of the checks below (no hex, no em dash, no emoji, no single-row read)
// are satisfied by an EMPTY FILE. This one is what stops that: if a page is
// truncated to nothing, every negative assertion goes green and only this
// fails.

test('each sub-page is still a real page, so the negative checks mean something', () => {
  for (const rel of SUB_PAGES) {
    const body = read(rel);
    assert.ok(body.length > 4000, `${rel} is ${body.length} bytes; it has been gutted`);
    assert.match(body, /export default function \w+/, `${rel} lost its default-exported component`);
    assert.match(body, /useState\(/, `${rel} lost its state`);
  }
  const css = read('pages/horses/horses.module.css');
  assert.ok(css.length > 2000, 'horses.module.css has been gutted');
});

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
  // Not "some hex somewhere": the PALETTE is what has to be here, so the
  // check is against the surface and accent tokens by name.
  for (const name of ['--bg-page', '--accent', '--danger', '--text']) {
    assert.match(css, new RegExp(`\\${name}\\s*:\\s*#[0-9a-fA-F]{3,8}`), `${name} must be declared as a hex literal here`);
  }
});

// ── Em dash ────────────────────────────────────────────────────────────────

test('no em dash in any file this phase owns', () => {
  for (const rel of OWNED) {
    const body = read(rel);
    const at = body.indexOf(EM_DASH);
    assert.equal(at, -1, `${rel} contains an em dash at offset ${at}; use a hyphen.`);
  }
});

test('the sub-pages keep their copy ASCII, ellipsis included', () => {
  // Finding 11 of the review: hg-moderation used U+2026 in ten places while
  // the other two pages used "...". Box drawing (U+2500-U+257F) is the comment
  // banner style of this repo and stays.
  for (const rel of SUB_PAGES) {
    const bad = [...read(rel)]
      .map((ch, i) => [ch, i])
      .filter(([ch]) => ch.codePointAt(0) > 127)
      .filter(([ch]) => !(ch.codePointAt(0) >= 0x2500 && ch.codePointAt(0) <= 0x257f))
      .map(([ch, i]) => `U+${ch.codePointAt(0).toString(16).toUpperCase()}@${i}`);
    assert.deepEqual(bad, [], `${rel} carries non-ASCII copy: ${bad.join(', ')}`);
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
  assert.equal(src.includes(EM_DASH), false);
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

/**
 * The declarations inside the ONE rule block whose selector list contains
 * .tokenScope. Harvesting `--foo:` from the whole stylesheet (what this test
 * used to do) proves the name exists somewhere, not that it is in scope where
 * the sub-pages render - and scope is the only property that matters.
 */
function tokenScopeBlock() {
  const css = read('pages/horses/horses.module.css');
  // Strip comments first: they contain braces and the word .tokenScope.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const at = clean.indexOf('.tokenScope');
  assert.ok(at > -1, 'horses.module.css must declare .tokenScope');
  const open = clean.indexOf('{', at);
  assert.ok(open > at, '.tokenScope must be part of a rule block');
  // The selector list is everything back to the previous } or the file start.
  const prevClose = clean.lastIndexOf('}', at);
  const selector = clean.slice(prevClose + 1, open);
  assert.ok(
    selector.includes('.tokenScope'),
    'the .tokenScope found is not part of the selector list of the block that follows it'
  );
  const close = clean.indexOf('}', open);
  assert.ok(close > open, 'the token block is not terminated');
  const block = clean.slice(open + 1, close);
  assert.equal(block.includes('{'), false, 'the token block should be a flat declaration list');
  return { selector, block };
}

test('every T.<name> used by the sub-pages exists on T', () => {
  const keys = tokenKeys();
  assert.ok(keys.size >= 20, `expected a populated token set, got ${keys.size}`);
  for (const rel of SUB_PAGES) {
    const used = new Set([...read(rel).matchAll(/\bT\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    assert.ok(used.size >= 10, `${rel} appears to have stopped using T entirely`);
    for (const name of used) {
      assert.ok(keys.has(name), `${rel} uses T.${name}, which is not a key of T`);
    }
  }
});

test('every var(--...) named on T is declared in the .tokenScope block itself', () => {
  const { block } = tokenScopeBlock();
  const declared = new Set([...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const referenced = [...read('src/lib/horsesAdminTokens.js').matchAll(/var\((--[a-z0-9-]+)\)/g)].map(
    (m) => m[1]
  );
  assert.ok(referenced.length > 0, 'T should reference custom properties');
  for (const name of referenced) {
    assert.ok(
      declared.has(name),
      `T points at ${name}, which is not declared on the selector block carrying .tokenScope. ` +
        'Declaring it on .dashboard only means every sub-page renders that colour as nothing.'
    );
  }
});

// ── Scope coverage: EVERY root, not just one mention ───────────────────────

/**
 * Opening `<div ...>` tags, brace-aware so an arrow function or a template
 * literal in an attribute cannot end the tag early.
 */
function openingDivTags(body) {
  const tags = [];
  let i = 0;
  while ((i = body.indexOf('<div', i)) !== -1) {
    let depth = 0;
    let j = i + 4;
    let end = -1;
    while (j < body.length) {
      const ch = body[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) { end = j; break; }
      j += 1;
    }
    if (end === -1) break;
    tags.push({ start: i, end: end + 1, text: body.slice(i, end + 1) });
    i = end + 1;
  }
  return tags;
}

/**
 * A full-page root is any element that paints the whole viewport. Every state
 * these pages can return is one: the loading state, the auth-failure state,
 * the 403 and the page itself. That is the property the class has to hold on,
 * and it is discovered from the source rather than hard-coded, so a NEW root
 * is checked the day it is added.
 */
function fullPageRoots(body) {
  return openingDivTags(body).filter((t) => /minHeight:\s*'100vh'/.test(t.text));
}

// The branches each page can return through, from the review's own inventory.
// The assertion is >= so a new state is caught by the per-root check rather
// than by an equality that a legitimate addition would break.
const ROOT_EXPECTATIONS = {
  'pages/horses/sql-console.js': {
    min: 3,
    states: ['Authenticating Agent', 'This Is A Failure To Ask The Route'],
  },
  'pages/horses/hg-moderation.js': {
    min: 4,
    states: ['Verifying Access', 'Could Not Verify Your Role', '403 - Operator Access Required'],
  },
  'pages/horses/hand-reviews.js': {
    min: 3,
    states: ['Authenticating', 'Could Not Verify Your Role'],
  },
};

test('the stylesheet declares .tokenScope as one of the token-block selectors', () => {
  const { selector } = tokenScopeBlock();
  assert.match(selector, /(^|,|\s)\.tokenScope\s*(,|$)/, 'the selector list must name .tokenScope');
});

test('EVERY full-page root of EVERY sub-page carries styles.tokenScope', () => {
  // This is the test the whole .tokenScope design exists for, stated at
  // horsesAdminTokens.js and again in horses.module.css: "a new root without
  // that class renders uncoloured". Asserting the class appears once per file
  // could not see that. Every root is enumerated and checked individually.
  for (const rel of SUB_PAGES) {
    const body = read(rel);
    assert.match(
      body,
      /import\s+styles\s+from\s+['"]\.\/horses\.module\.css['"]/,
      `${rel} must import the module`
    );

    const roots = fullPageRoots(body);
    const expected = ROOT_EXPECTATIONS[rel];
    assert.ok(
      roots.length >= expected.min,
      `${rel} exposes ${roots.length} full-page roots; at least ${expected.min} were expected ` +
        '(loading, auth failure, 403 where present, and the page). If a root was removed, ' +
        'lower the expectation deliberately; do not delete the check.'
    );

    roots.forEach((root, i) => {
      assert.match(
        root.text,
        /styles\.tokenScope/,
        `${rel}: full-page root #${i + 1} at offset ${root.start} does not carry styles.tokenScope, ` +
          `so every var() inside it resolves to nothing. Tag: ${root.text.slice(0, 120)}`
      );
    });

    // And the named states really are among those roots, so a page cannot pass
    // by rendering one root and dropping the early-return branches entirely.
    for (const marker of expected.states) {
      // The copy is usually quoted in a comment as well as rendered, so every
      // occurrence is considered and at least one has to sit inside a root.
      const offsets = [];
      for (let at = body.indexOf(marker); at !== -1; at = body.indexOf(marker, at + 1)) offsets.push(at);
      assert.ok(offsets.length > 0, `${rel} lost the "${marker}" state`);

      const owners = offsets
        .map((at) => {
          const before = roots.filter((r) => r.start < at);
          if (before.length === 0) return null;
          const nearest = before[before.length - 1];
          const next = roots.find((r) => r.start > nearest.start);
          // Inside this root's region, and not merely somewhere after it.
          return !next || at < next.start ? nearest : null;
        })
        .filter(Boolean);

      assert.ok(
        owners.length > 0,
        `${rel}: "${marker}" is not rendered inside any full-page root, so that state paints ` +
          'nothing full-bleed and the token scope cannot reach it'
      );
      for (const owner of owners) {
        assert.match(
          owner.text,
          /styles\.tokenScope/,
          `${rel}: the root rendering "${marker}" is missing styles.tokenScope`
        );
      }
    }
  }
});

// ── Pager arithmetic (pure unit) ───────────────────────────────────────────
// The highest-severity finding of the review was a Next button permanently
// disabled on a full queue, and nothing could have caught it because the four
// lines of arithmetic lived inside a component that cannot be rendered here.
// They now live in src/components/horses/pagerModel.js, shared by the console
// Pager component and by hg-moderation's inline-styled one.

test('pagerModel: total null plus a full page means there MIGHT be more', () => {
  const m = pagerModel({ offset: 0, count: 50, total: null, limit: 50, hasMore: true, noun: 'Reports' });
  assert.equal(m.totalKnown, false);
  assert.equal(m.hasNext, true, 'Next must be enabled when the route says there is more');
  assert.equal(m.hasPrevious, false, 'the first page has no Previous');
  assert.equal(m.first, 1);
  assert.equal(m.last, 50);
});

test('pagerModel: total null and the route says no more means no more', () => {
  const m = pagerModel({ offset: 100, count: 50, total: null, limit: 50, hasMore: false, noun: 'Reports' });
  assert.equal(m.hasNext, false, "the route's hasMore is authoritative when total is unknown");
  assert.equal(m.hasPrevious, true);
});

test('pagerModel: total null with no hasMore at all falls back to the full-page heuristic', () => {
  const full = pagerModel({ offset: 0, count: 50, total: null, limit: 50 });
  const short = pagerModel({ offset: 0, count: 12, total: null, limit: 50 });
  assert.equal(full.hasNext, true, 'a full page might have more behind it');
  assert.equal(short.hasNext, false, 'a short page is the last page');
});

test('pagerModel: a known total decides Next on its own when the route sends no flag', () => {
  const last = pagerModel({ offset: 50, count: 50, total: 100, limit: 50 });
  assert.equal(last.totalKnown, true);
  assert.equal(last.hasNext, false, 'last === total means there is no next page');
  assert.equal(last.hasPrevious, true);

  const middle = pagerModel({ offset: 50, count: 50, total: 260, limit: 50 });
  assert.equal(middle.hasNext, true, 'a known total says there are 160 rows to come');
});

test('pagerModel: the fabricated total that caused the bug is why the route must send null', () => {
  // The route used to send total = offset + rows.length. That is finite, so
  // last < total is false on EVERY page and Next is dead however full the
  // queue is. Reproduced here so the shape stays recognisable.
  const fabricated = pagerModel({ offset: 0, count: 50, total: 50, limit: 50 });
  assert.equal(fabricated.hasNext, false, 'a fabricated total does disable Next: the route must send null');
  const honest = pagerModel({ offset: 0, count: 50, total: null, limit: 50, hasMore: true });
  assert.equal(honest.hasNext, true);
});

test('pagerModel: the label never invents a denominator', () => {
  const known = pagerModel({ offset: 0, count: 50, total: 260, limit: 50, noun: 'Reports' }).label;
  assert.match(known, /^Showing 1-50 Of 260\b/, `known-total label was ${JSON.stringify(known)}`);

  const unknown = pagerModel({ offset: 50, count: 50, total: null, limit: 50, hasMore: true, noun: 'Reports' }).label;
  assert.match(unknown, /^Showing 51-100\b/, `unknown-total label was ${JSON.stringify(unknown)}`);
  assert.equal(
    /\bOf\b/.test(unknown),
    false,
    `an unknown total must not print "Of <anything>"; got ${JSON.stringify(unknown)}`
  );

  const empty = pagerModel({ offset: 100, count: 0, total: null, limit: 50, noun: 'Appeals' }).label;
  assert.match(empty, /\b0\b/, 'an empty page must say so');
  assert.match(empty, /Appeals/, 'the label must name what is being counted');
});

test('pagerModel: an empty first page offers neither direction', () => {
  const m = pagerModel({ offset: 0, count: 0, total: 0, limit: 50, noun: 'Reports' });
  assert.equal(m.hasPrevious, false);
  assert.equal(m.hasNext, false);
  assert.equal(m.first, 0);
  assert.equal(m.last, 0);
});

test("hg-moderation's Pager can never click Previous below zero", () => {
  // The component derives the offsets itself, so the clamp is asserted on the
  // source rather than through the model.
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /const\s+prevOffset\s*=\s*Math\.max\(\s*0\s*,\s*offset\s*-\s*pageSize\s*\)/);
  assert.equal(
    /onOffset\(\s*offset\s*-\s*pageSize\s*\)/.test(body),
    false,
    'an unclamped Previous can send a negative offset to the route'
  );
});

test("hg-moderation's rewind guard is honest about a failed load", () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /function\s+shouldRewind\s*\(/, 'the rewind rule must be a named, readable predicate');
  const fn = body.slice(body.indexOf('function shouldRewind'));
  const guard = fn.slice(0, fn.indexOf('}\n') + 1);
  assert.match(guard, /if\s*\(\s*loading\s*\|\|\s*error\s*\)\s*return false/, 'never rewind mid-load or on an error');
  assert.match(guard, /offset\s*>\s*0\s*&&\s*count\s*===\s*0/, 'rewind only an empty page past the start');
});

// ── hg-moderation ──────────────────────────────────────────────────────────

test('hg-moderation has a Pager that uses the shared arithmetic', () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /function\s+Pager\s*\(/, 'a Pager component must exist');
  assert.match(
    body,
    /import\s*\{[^}]*\bpagerModel\b[^}]*\}\s*from\s*['"][^'"]*pagerModel['"]/,
    'the Pager must use the unit-tested helper rather than re-deriving the arithmetic inline'
  );
  assert.match(body, /Previous/);
  assert.match(body, /Next/);
  // The range line is rendered from the model, so the wording is asserted in
  // the pagerModel tests above rather than by grepping a template literal.
  assert.match(body, /\blabel\b/, 'the pager must render the model label');
});

test('hg-moderation treats an unknown total as unknown on BOTH tabs', () => {
  const body = read('pages/horses/hg-moderation.js');
  // Finding 7: the two tabs guarded `total` differently, so a string or object
  // total rendered as "[object Object] Reports In This Queue" on one of them.
  const guards = body.match(/setTotal\(\s*Number\.isFinite\(\s*d\.total\s*\)\s*\?\s*d\.total\s*:\s*null\s*\)/g) || [];
  assert.equal(guards.length, 2, `both tabs must guard total numerically, found ${guards.length}`);
  assert.equal(
    /setTotal\(\s*d\.total\s*\?\?\s*null\s*\)/.test(body),
    false,
    'the unguarded `d.total ?? null` form must be gone'
  );
  // Finding 1: Next comes from the route's hasMore when total is unknown.
  const reads = body.match(/d\.hasMore/g) || [];
  assert.equal(reads.length >= 2, true, 'both tabs must read hasMore from the route');
  const passed = body.match(/hasMore=\{hasMore\}/g) || [];
  assert.equal(passed.length, 2, `both pagers must be given hasMore, found ${passed.length}`);
});

test('hg-moderation rewinds an offset that has fallen off the end of a queue', () => {
  const body = read('pages/horses/hg-moderation.js');
  // Finding 9: resolve the last report on the last page, refresh, and the page
  // showed "No Reports On This Page" with Next disabled and only Previous to
  // recover. Both tabs now step back.
  const rewinds = body.match(/if\s*\(\s*shouldRewind\(/g) || [];
  assert.equal(rewinds.length, 2, `both tabs must reconcile offset after a load, found ${rewinds.length}`);
  assert.match(body, /setOffset\(\s*\(o\)\s*=>\s*Math\.max\(\s*0\s*,\s*o\s*-\s*PAGE_SIZE\s*\)\s*\)/);
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

test('hg-moderation resets the offset when the filter changes', () => {
  const body = read('pages/horses/hg-moderation.js');
  // Otherwise switching status on page 4 lands on page 4 of the new queue,
  // which is usually empty and reads as "no reports".
  const resets =
    body.match(/const\s+changeStatus\s*=\s*\([^)]*\)\s*=>\s*\{\s*setOffset\(0\);\s*setStatus\(/g) || [];
  assert.equal(resets.length, 2, `both tabs must reset the offset on a filter change, found ${resets.length}`);
});

test('hg-moderation renders Onboarding and GDPR as labelled rows, not raw JSON', () => {
  const body = read('pages/horses/hg-moderation.js');
  assert.match(body, /function\s+KeyValueRows\s*\(/);
  const uses = body.match(/<KeyValueRows\b/g) || [];
  assert.equal(uses.length, 2, `expected KeyValueRows in both tabs, found ${uses.length}`);
  assert.match(body, /rawLabel="Raw Onboarding Payload"/);
  assert.match(body, /rawLabel="Raw Erasure Counts"/);
  assert.match(body, /<details/);
});

test('an irreversible erase and an onboarding lookup always render a receipt', () => {
  const body = read('pages/horses/hg-moderation.js');
  // Finding 2: `{result && ...}` rendered NOTHING when the payload was null,
  // 0 or false. hg-gdpr-erase returns whatever the RPC returned, and
  // hg-onboarding-status legitimately returns null for a user with no row, so
  // a successful legal erasure could leave a blank panel behind it.
  assert.equal(
    /\{\s*result\s*&&\s*\(/.test(body),
    false,
    'the panels must not be keyed on the truthiness of the payload'
  );
  const doneGates = body.match(/\{\s*done\s*&&\s*\(/g) || [];
  assert.equal(doneGates.length, 2, `both receipts must render on completion, found ${doneGates.length}`);
  const setsDone = body.match(/setDone\(\s*true\s*\)/g) || [];
  assert.equal(setsDone.length, 2, 'both success paths must record completion');
  // And the empty payload has to say so in words.
  assert.match(body, /emptyLabel=/, 'KeyValueRows must be told what to say for an empty payload');
  assert.match(body, /No Onboarding Record For That User/);
  assert.match(body, /Returned No Counts/);
});

test('KeyValueRows tells the truth about an array payload', () => {
  const body = read('pages/horses/hg-moderation.js');
  // Finding 8: an array fell to `entries = []` and the panel asserted "The
  // Response Carried No Fields." while the Raw disclosure right below showed
  // the array.
  assert.match(body, /Array\.isArray\(data\)/, 'the component must branch on an array payload');
  assert.match(body, /The Response Was A List Of /, 'an array must be described as a list');
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
    /\{\s*horses\.slice\(\s*0\s*,\s*40\s*\)\.map\(/.test(body),
    false,
    'the silent 40-row truncation must be gone from the render'
  );
  assert.match(body, /const\s+FLEET_PREVIEW\s*=\s*40\s*;/, 'the cap must be a named constant');
  assert.match(body, /visibleHorses\.map\(/, 'the table must render the toggled slice');
});

test('hand-reviews exports every table to CSV', () => {
  const body = read('pages/horses/hand-reviews.js');
  assert.match(body, /downloadCsv/);
  assert.match(body, /toCsv/);
  assert.match(body, /stampedName/);
  const buttons = body.match(/<ExportCsvButton\b/g) || [];
  // Daily audit, telemetry, data ledger (2026-09-04), league card, leak-tag
  // rates, fleet summary, flagged hands, and from 2026-09-06 the tournament
  // scoreboard, the frequency leaks and the solver agreement: ten tables,
  // ten exports.
  assert.equal(buttons.length, 10, `expected ten CSV exports, found ${buttons.length}`);
});

test('hand-reviews declares explicit [key, header] export columns', () => {
  const body = read('pages/horses/hand-reviews.js');
  for (const name of [
    'AUDIT_COLUMNS',
    'TELEMETRY_COLUMNS',
    'LEAGUE_COLUMNS',
    'TREND_COLUMNS',
    'FLEET_COLUMNS',
    'HAND_COLUMNS',
    'TOURNAMENT_COLUMNS',
    'FREQUENCY_COLUMNS',
    'AGREEMENT_COLUMNS',
  ]) {
    assert.match(body, new RegExp(`const\\s+${name}\\s*=\\s*\\[`), `${name} must be declared`);
  }
});

test('hand-reviews paging is honest about what it does not know', () => {
  const body = read('pages/horses/hand-reviews.js');
  assert.match(body, /rows\.length\s*===\s*PAGE_SIZE\s*&&/, 'More must render only on a full page');
  assert.match(body, /Page \$\{\s*page\s*\+\s*1\s*\}/, 'the position must read Page N');
  assert.equal(
    /rows\.length\s*<\s*PAGE_SIZE/.test(body),
    false,
    'the old disabled-Older heuristic must be gone'
  );
});

// ── sql-console ────────────────────────────────────────────────────────────

test('sql-console exports the current result set', () => {
  const body = read('pages/horses/sql-console.js');
  assert.match(body, /downloadCsv/);
  assert.match(body, /toCsv/);
  assert.match(body, /stampedName\(\s*'sql-console-result'\s*\)/);
});

test('sql-console DATA_MUTATED handler does something an operator can see', () => {
  const body = read('pages/horses/sql-console.js');
  assert.match(body, /Data Changed By Another Console Since This Query Ran/);
  assert.match(body, /setStaleSince/);
  assert.equal(
    /console\.log\(\s*'Global data mutation detected/.test(body),
    false,
    'the dead console.log handler must be gone'
  );
});

test('sql-console cannot raise a stale alarm about its own commit', () => {
  const body = read('pages/horses/sql-console.js');
  // Finding 6: `event?.source || event?.payload?.source` short-circuits on an
  // envelope that carries the EMITTER name ('SQLConsole') as its source, so
  // the payload tag is never consulted and the console warns about itself.
  assert.equal(
    /event\?\.source\s*\|\|\s*event\?\.payload\?\.source/.test(body),
    false,
    'the two shapes must be tested independently, not with ||'
  );
  assert.match(
    body,
    /event\?\.source[\s\S]{0,200}event\?\.payload\?\.source/,
    'both the envelope and the payload must be read'
  );
  // One tag, used by the emit and by the suppression, so they cannot drift.
  assert.match(body, /const\s+SELF_EMIT_TAG\s*=\s*'sql-console-execution'\s*;/);
  const tagUses = body.match(/SELF_EMIT_TAG/g) || [];
  assert.ok(tagUses.length >= 4, `the tag constant must be used by both sides, found ${tagUses.length} mentions`);
  assert.equal(
    (body.match(/'sql-console-execution'/g) || []).length,
    1,
    'the literal tag must appear once, on the constant'
  );
});

test('sql-console keeps its commit gate exactly as designed', () => {
  const body = read('pages/horses/sql-console.js');
  // The three properties the gate depends on. This test exists so a later
  // edit to this file cannot quietly weaken them.
  assert.match(body, /confirmText\.trim\(\)\s*===\s*pendingSql/, 'commit must require a verbatim retype');
  assert.match(
    body,
    /disabled=\{\s*!confirmMatches\s*\|\|\s*isRunning\s*\}/,
    'Commit must stay disabled until it matches'
  );
  assert.match(
    body,
    /if\s*\(\s*data\.success\s*&&\s*data\.committed\s*&&\s*data\.mutating\s*\)/,
    'only a real commit may broadcast'
  );
});

// ── Route contracts these pages are built against ──────────────────────────
// PHASE1-CONTRACTS.md addendum 15 and 19. Both routes are owned by other
// agents this phase; the assertions are written to the contract, so they go
// red until those land and stay red if either regresses.

/** The body of every `if (<condition>) { ... }` whose condition matches. */
function conditionalBlocks(src, conditionRe) {
  const out = [];
  const re = new RegExp(conditionRe.source, `${conditionRe.flags.replace('g', '')}g`);
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) { out.push(src.slice(open, i + 1)); break; }
      }
    }
  }
  return out;
}

test('hg-reports and hg-appeals never fabricate a total, and do return hasMore', () => {
  for (const rel of ['pages/api/horses/hg-reports.js', 'pages/api/horses/hg-appeals.js']) {
    const src = read(rel);
    assert.equal(
      /total\s*=\s*rpcTotal\s*===\s*null\s*\?\s*page\.offset\s*\+\s*rows\.length/.test(src),
      false,
      `${rel} synthesises a total from offset + rows.length. That number is not a count: it makes ` +
        'last < total false on every page, which disables the pager Next button forever.'
    );
    assert.equal(
      /page\.offset\s*\+\s*rows\.length\s*(:|,|;|\))/.test(src.replace(/hasMore[\s\S]{0,80}/g, '')),
      false,
      `${rel} still derives a row-count figure from the offset outside hasMore`
    );
    assert.match(src, /hasMore\s*:/, `${rel} must return hasMore`);
    assert.match(
      src,
      /rows\.length\s*===\s*page\.limit/,
      `${rel} must compute hasMore from a full page, which is the only honest signal without a count`
    );
  }
});

test('execute-sql writes exactly ONE audit row per committed mutation', () => {
  const src = read('pages/api/admin/execute-sql.js');
  // Addendum 19. The pre-existing direct insert filed admin.sql_mutation_committed
  // and the shared helper files sql.commit under the SAME condition, so every
  // commit was double-counted and split across two action namespaces that the
  // console's Audit tab filters separately.
  const commitBlocks = conditionalBlocks(src, /if\s*\(\s*mutating\s*&&\s*!\s*dryRun\s*\)\s*\{/);
  assert.ok(commitBlocks.length > 0, 'the committed-mutation audit branch was not found');
  const commitPath = commitBlocks.join('\n');

  const helperCalls = (commitPath.match(/auditOperatorAction\s*\(/g) || []).length;
  assert.equal(helperCalls, 1, `expected one auditOperatorAction call in the commit path, found ${helperCalls}`);

  assert.equal(
    /admin_audit_log/.test(commitPath),
    false,
    'the direct admin_audit_log insert for commits must be gone; the shared helper writes that row now'
  );

  // Finding 5: the row carried a fabricated role, discarding the one the
  // handler had already read and checked.
  assert.equal(
    /role:\s*sessionUserId\s*\?\s*'admin'/.test(commitPath),
    false,
    "actor_role must be the profile's real role, not the literal 'admin'"
  );

  // A dry run still writes nothing through the helper.
  const allHelperCalls = (src.match(/auditOperatorAction\s*\(/g) || []).length;
  assert.equal(allHelperCalls, 1, `auditOperatorAction must be called from exactly one site, found ${allHelperCalls}`);
});

// ── Shared house rules ─────────────────────────────────────────────────────

test('the sub-pages never use the throwing single-row read', () => {
  // The pattern is assembled rather than written out, so this file does not
  // trip the repo's own CHECK 1 grep while asserting against it.
  const BANNED = new RegExp('\\.' + 'single' + '\\(\\s*\\)');
  for (const rel of SUB_PAGES) {
    assert.equal(BANNED.test(read(rel)), false, `${rel} must use the maybe-single read instead`);
  }
});

test('each sub-page takes the route\'s answer on who is an operator, on a live line', () => {
  // Re-verification M-1. The three legacy profile roles were the gate, and
  // that list is exactly what Phase 2 made incomplete: requireOperator admits
  // an active ca_operator_grants row too. So the pages ask
  // GET operator-admin?section=policy through operatorGate, and the
  // client-side role list is gone from every executable line.
  const ROLES = /\[\s*(['"])admin\1\s*,\s*(['"])superadmin\2\s*,\s*(['"])god\3\s*\]/;
  for (const rel of SUB_PAGES) {
    const lines = read(rel).split('\n');
    // A commented-out gate is not a gate. Only executable lines count.
    const live = lines.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    assert.equal(
      live.filter((l) => ROLES.test(l)).length,
      0,
      `${rel} still gates on the legacy profile-role list`
    );
    assert.equal(
      live.filter((l) => /from\(\s*(['"])profiles\1\s*\)/.test(l)).length,
      0,
      `${rel} still reads the role from profiles for itself`
    );
    assert.ok(
      live.some((l) => /import \{ operatorGate \} from '\.\.\/\.\.\/src\/components\/horses\/operatorAdmin'/.test(l)),
      `${rel} must import operatorGate`
    );
    assert.ok(
      live.some((l) => /await operatorGate\(token\)/.test(l)),
      `${rel} must ask the route with the bearer`
    );
    // Denied goes away; not-verified gets the retry screen, never a denial.
    assert.ok(live.some((l) => /gate\.denied/.test(l)), `${rel} must branch on gate.denied`);
    assert.ok(live.some((l) => /gate\.ok/.test(l)), `${rel} must branch on gate.ok`);
  }
});
