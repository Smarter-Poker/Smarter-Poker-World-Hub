/**
 * NOTIFICATIONS IS THE TOP SETTING IN THE WORLD HUB HAMBURGER MENU.
 *
 * Dan, 2026-11-07, verbatim: "THE TOP SETTING IN THE WORLD HUB HAMBURGER MENU
 * NEEDS TO BE 'NOTIFICATIONS'. CURRENTLY ITS NOT EVEN IN THE HAMBURGER MENU."
 *
 * The drawer renders the row itself, ahead of every other block in its
 * non-search body, so no world's menu config can demote or drop it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/ui/HamburgerMenu.jsx', import.meta.url), 'utf8');
// The drawer body is `{searching ? ( results ) : ( <> ...everything else... </> )}`.
// This is the second branch: what a player sees whenever they are not searching.
const afterSearching = src.slice(src.indexOf('{searching ? ('));
const branch = afterSearching.search(/\n\s*\) : \(\n\s*<>/);
const nonSearchBody = branch > 0 ? afterSearching.slice(branch) : '';

test('the row is Notifications and opens the notification settings screen', () => {
  const def = src.slice(src.indexOf('export const NOTIFICATIONS_MENU_ROW'));
  assert.match(def, /label: 'Notifications',/);
  assert.match(def, /href: '\/hub\/settings\/notifications',/);
  assert.ok(existsSync(new URL('../pages/hub/settings/notifications.js', import.meta.url)),
    'the destination route exists');
});

test('it is the first thing the drawer body renders, above shortcuts and every config item', () => {
  const nonSearch = nonSearchBody;
  assert.ok(nonSearch, 'the non-search drawer body was found');
  const row = nonSearch.indexOf('renderNavigation(NOTIFICATIONS_MENU_ROW');
  assert.ok(row > 0, 'the drawer renders the Notifications row');
  for (const later of ['shortcutItems.length > 0', 'Favourites', 'Recently visited', '{/* Menu Items */}']) {
    const at = nonSearch.indexOf(later);
    assert.ok(at > row, `Notifications renders before ${later}`);
  }
  const between = nonSearch.slice(0, row);
  assert.doesNotMatch(between, /renderMenuItem|renderNavigation\((?!NOTIFICATIONS_MENU_ROW)/,
    'nothing renders a menu row ahead of Notifications');
});

test('it is unconditional: no config, user or world can hide it', () => {
  const nonSearch = nonSearchBody;
  const before = nonSearch.slice(0, nonSearch.indexOf('renderNavigation(NOTIFICATIONS_MENU_ROW'));
  assert.doesNotMatch(before, /&&\s*\(\s*$/, 'the row is not behind a condition');
});
