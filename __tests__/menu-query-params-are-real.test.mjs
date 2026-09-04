/**
 * MENU QUERY PARAMS ARE REAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-04. menu-routes-exist.test.mjs strips `?query` and `#hash` BEFORE
 * resolving an href (see its resolve step), so it only ever proved that a FILE
 * exists. Every one of these shipped green and did nothing:
 *
 *   /hub/settings?section=delete-account   settings.js accepts 'delete'.
 *                                          The only route to account deletion
 *                                          in the entire menu system opened
 *                                          whatever section the user last had.
 *   /hub/settings?section=payments         -> 'billing'
 *   /hub/settings?section=table  (x2)      -> 'gameplay'
 *   /hub/settings?section=content          not a section at all
 *   /hub/friends?tab=suggestions|all       friends.js VALID_TABS has neither
 *   /hub/diamond-store?category=...        the store reads ?tab= and splits
 *                                          into five real routes; ?category=
 *                                          is read nowhere in the file
 *   /hub/news?source=wpt                   VALID_SOURCES has no WPT
 *   /hub/help#contact                      help.js declared no id= at all
 *
 * The row navigated, the page loaded, the filter never applied — indistinguish-
 * able from the unfiltered row above it. A menu whose params are load-bearing
 * needs the params checked, not just the file.
 *
 * This test reads the whitelist out of each page rather than restating it, so
 * it cannot go stale when a page adds or renames a section.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CONFIGS = read('src/config/hamburgerMenus.js');

/** Every internal href in the menu config, query string intact. */
function menuHrefs() {
  const out = [];
  const re = /'(\/hub\/[^']*)'/g;
  let m;
  while ((m = re.exec(CONFIGS)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

/** Pull a string-array literal named `name` out of a page's source. */
function arrayLiteral(src, name) {
  const i = src.indexOf(name);
  assert.notEqual(i, -1, `${name} must exist — this test reads it, not a copy`);
  const open = src.indexOf('[', i);
  const close = src.indexOf(']', open);
  return [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const hrefs = menuHrefs();
const withParam = (page, param) =>
  hrefs
    .filter((h) => h.split('?')[0] === page && h.includes(`${param}=`))
    .map((h) => ({ href: h, value: new URLSearchParams(h.split('?')[1]).get(param) }));

test('every ?section= the menu sends is one Settings accepts', () => {
  const valid = arrayLiteral(read('pages/hub/settings.js'), 'const validSections');
  assert.ok(valid.length > 5, 'sanity: validSections should be a real list');
  for (const { href, value } of withParam('/hub/settings', 'section')) {
    assert.ok(
      valid.includes(value),
      `${href} sends section="${value}", which pages/hub/settings.js ignores. ` +
        `Valid: ${valid.join(', ')}. The row navigates and the user's persisted ` +
        'section renders instead — the click looks like it did nothing.'
    );
  }
});

test('every ?tab= the menu sends to Friends is one Friends accepts', () => {
  const src = read('pages/hub/friends.js');
  const valid = [...src.slice(src.indexOf('VALID_TABS')).slice(0, 200).matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(valid.length > 2, 'sanity: VALID_TABS should be a real list');
  for (const { href, value } of withParam('/hub/friends', 'tab')) {
    assert.ok(valid.includes(value),
      `${href} sends tab="${value}"; friends.js VALID_TABS = ${valid.join(', ')}`);
  }
});

test('every ?source= the menu sends to News is one News can filter by', () => {
  const src = read('pages/hub/news.js');
  const valid = arrayLiteral(src, 'const VALID_SOURCES').map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const { href, value } of withParam('/hub/news', 'source')) {
    const norm = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    assert.ok(valid.includes(norm),
      `${href} sends source="${value}", which news.js VALID_SOURCES cannot match, ` +
        'so parseSourceQuery returns [] and the row renders the unfiltered feed');
  }
});

test('the Diamond Store is linked by its real routes, not a param it never reads', () => {
  const src = read('pages/hub/diamond-store.js');
  assert.ok(!/router\.query\.category/.test(src),
    'sanity: diamond-store still does not read ?category=');
  const offenders = hrefs.filter((h) => h.startsWith('/hub/diamond-store') && h.includes('category='));
  assert.deepEqual(offenders, [],
    'the store splits into five real routes (TAB_ROUTES) and reads ?tab=; ' +
      `?category= is read nowhere. Offending rows: ${offenders.join(', ')}`);
});

test('every #anchor the menu links to exists on its page', () => {
  const anchors = hrefs.filter((h) => h.includes('#'));
  for (const href of anchors) {
    const [path, hash] = href.split('#');
    const file = `pages${path}.js`;
    let src;
    try { src = read(file); } catch { continue; } // route guard owns file existence
    assert.match(src, new RegExp(`id=["'{\`]?${hash}\\b`),
      `${href} points at #${hash}, but ${file} defines no such id — the browser ` +
        'silently opens the page at the top');
  }
});
