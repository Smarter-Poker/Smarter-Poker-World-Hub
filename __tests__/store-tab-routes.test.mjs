/**
 * STORE TAB ROUTES — THE URL IS THE SOURCE OF TRUTH
 * ─────────────────────────────────────────────────────────────────────────
 * The diamond store was one URL with five tabs of component state, and the
 * active tab was persisted in localStorage with a 30-day TTL. On 2026-08-25
 * each tab became its own page (/hub/vip-membership, /hub/merch-store,
 * /hub/smarter-rewards, /hub/club-shop), and that combination is a trap:
 *
 *   a member who last viewed the VIP tab opens /hub/diamond-store and is
 *   shown VIP — under a tab titled "Diamond Store", with diamond-store meta
 *   in the head and a diamond-store URL to copy. The screen and the address
 *   disagree, and the address is the part the user chose.
 *
 * These are source-level assertions on purpose: the decision lives in a
 * 3,000-line client component whose imports reach Supabase and the DOM, so
 * importing it in a unit test would prove less and break more. What actually
 * regresses is someone re-adding `activeTab` to the persisted defaults, or
 * re-introducing a setter that lets stale state win. Both are visible here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STORE = readFileSync(join(ROOT, 'pages/hub/diamond-store.js'), 'utf8');

const TABS = ['diamonds', 'vip', 'merch', 'rewards', 'club-shop'];
const ROUTES = {
  diamonds: '/hub/diamond-store',
  vip: '/hub/vip-membership',
  merch: '/hub/merch-store',
  rewards: '/hub/smarter-rewards',
  'club-shop': '/hub/club-shop',
};

test('activeTab is NOT persisted — stale localStorage cannot pick the tab', () => {
  const call = STORE.match(/usePersistedFilters\(\s*'diamond-store',\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(call, 'usePersistedFilters call for diamond-store not found');
  assert.ok(
    !/\bactiveTab\b/.test(call[1]),
    'activeTab is back in the persisted defaults. A 30-day localStorage entry would ' +
      'then override the URL and show the wrong tab under the right address.'
  );
});

test('activeTab is derived from the route, never from persisted filters', () => {
  assert.match(
    STORE,
    /const activeTab = initialTab \|\| 'diamonds';/,
    'activeTab must come from the initialTab prop with a literal fallback'
  );
  assert.ok(
    !/const activeTab = initialTab \|\| filters\.activeTab/.test(STORE),
    'activeTab must not fall back to the persisted filter'
  );
  assert.ok(
    !/setActiveTab/.test(STORE),
    'setActiveTab is gone: nothing may mutate the tab behind the URL'
  );
});

test('legacy ?tab= links REDIRECT to the canonical route rather than swapping a tab', () => {
  assert.match(STORE, /router\.replace\(TAB_ROUTES\[tab\]\)/, 'must redirect to the tab route');
  assert.ok(
    !/if \(typeof tab === 'string' && STORE_TABS\.includes\(tab\)\) \{\s*setActiveTab/.test(STORE),
    'the old "set state and stay on diamond-store" branch must be gone'
  );
});

test('every tab has a route, a meta entry, and a real page file behind it', () => {
  for (const tab of TABS) {
    assert.ok(
      STORE.includes(`'${tab}': '${ROUTES[tab]}'`) || STORE.includes(`${tab}: '${ROUTES[tab]}'`),
      `TAB_ROUTES is missing ${tab} -> ${ROUTES[tab]}`
    );
    const file = join(ROOT, 'pages', `${ROUTES[tab].replace(/^\/hub\//, 'hub/')}.js`);
    assert.ok(existsSync(file), `no page file for ${ROUTES[tab]} (looked for ${file})`);
  }
  const meta = STORE.match(/export const TAB_META = \{([\s\S]*?)\n\};/);
  assert.ok(meta, 'TAB_META not found');
  for (const tab of TABS) {
    assert.ok(
      new RegExp(`(^|\\s)'?${tab}'?:`, 'm').test(meta[1]),
      `TAB_META is missing ${tab}, so that route would inherit the wrong <title>`
    );
  }
});

test('each wrapper page passes its own initialTab and nothing else', () => {
  for (const tab of TABS.filter((t) => t !== 'diamonds')) {
    const src = readFileSync(join(ROOT, 'pages', `${ROUTES[tab].replace(/^\/hub\//, 'hub/')}.js`), 'utf8');
    assert.match(
      src,
      new RegExp(`initialTab=["']${tab}["']`),
      `${ROUTES[tab]} must render DiamondStorePage with initialTab="${tab}"`
    );
  }
});

test('a blocked popup still navigates — openTab has a same-tab fallback', () => {
  assert.match(
    STORE,
    /const win = window\.open\([\s\S]{0,80}?\);\s*\n\s*if \(!win\) window\.location\.href = href;/,
    'openTab must fall back to same-tab navigation when window.open returns null'
  );
});
