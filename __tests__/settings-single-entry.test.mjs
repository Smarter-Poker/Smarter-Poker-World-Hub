/**
 * ONE SETTINGS, AND IT IS THE ACCOUNT (Dan, 2026-11-05).
 * "If I'm inside the World Hub and I click Settings, it should be settings for
 * the World Hub, my account, and never a random World Hub page settings!"
 *
 * Run: node --test __tests__/settings-single-entry.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_SETTINGS_HREF, enforceAccountSettingsEntry,
  sanitizeFallbackMenuConfig, sanitizeProvidedMenuConfig,
} from '../src/config/fallbackMenuSafety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const settingsRows = (cfg) => [
  ...cfg.menuItems.flatMap((i) => (i.type === 'grid' ? i.items : [i])),
  ...cfg.bottomLinks,
].filter((i) => typeof i?.href === 'string' && /^\/hub\/settings(?:[?#]|$)/.test(i.href));

const messy = () => ({
  menuItems: [
    { type: 'section', label: 'Settings' },
    { type: 'navigation', label: 'Privacy Settings', href: '/hub/settings?section=privacy' },
    { type: 'navigation', label: 'Blocked Users', href: '/hub/settings?section=blocked' },
    { type: 'divider' },
    { type: 'grid', items: [{ label: 'Settings', href: '/hub/settings' }, { label: 'News', href: '/hub/news' }] },
    { type: 'section', label: 'Training Settings' },
    { type: 'toggle', label: 'Sound', checked: true, onChange: () => {} },
    { type: 'navigation', label: 'Device Notifications', href: '/hub/settings/notifications' },
    { type: 'navigation', label: 'Settings', href: '/hub/settings', icon: 'gear' },
  ],
  bottomLinks: [{ label: 'Help', href: '/hub/help' }, { label: 'Settings', href: '/hub/settings' }],
});

test('every drawer ends with exactly one Settings, to the account tab', () => {
  for (const sanitize of [sanitizeFallbackMenuConfig, sanitizeProvidedMenuConfig, enforceAccountSettingsEntry]) {
    const out = sanitize(messy());
    const rows = settingsRows(out);
    assert.equal(rows.length, 1, 'one way into Settings');
    assert.equal(rows[0].href, ACCOUNT_SETTINGS_HREF);
    assert.equal(rows[0].label, 'Settings');
    assert.equal(out.bottomLinks.at(-1).href, ACCOUNT_SETTINGS_HREF, 'it is the footer link');
  }
  assert.equal(ACCOUNT_SETTINGS_HREF, '/hub/settings?section=account');
});

test('a drawer with no Settings at all still gets one', () => {
  const out = sanitizeFallbackMenuConfig({ menuItems: [{ type: 'navigation', label: 'News', href: '/hub/news' }], bottomLinks: [] });
  assert.deepEqual(settingsRows(out).map((r) => r.href), [ACCOUNT_SETTINGS_HREF]);
});

test('page toggle groups are Preferences, never Settings; device push page is kept', () => {
  const out = sanitizeProvidedMenuConfig(messy());
  const labels = out.menuItems.filter((i) => i.type === 'section').map((i) => i.label);
  assert.ok(labels.every((l) => !/settings/i.test(l)), labels.join());
  assert.ok(labels.includes('Training Preferences'));
  assert.ok(out.menuItems.some((i) => i.href === '/hub/settings/notifications'));
  assert.ok(!labels.includes('Preferences') || out.menuItems[out.menuItems.findIndex((i) => i.label === 'Preferences') + 1]?.type !== 'divider', 'no empty heading left behind');
});

test('the account page opens on Account and never restores a remembered tab', () => {
  const page = read('pages/hub/settings.js');
  assert.doesNotMatch(page, /usePersistedState\(\s*'sp-settings-active-section'/);
  assert.match(page, /const \[activeSection, setActiveSection\] = useState\('account'\)/);
  assert.match(page, /getMenuConfig\('hub-home'/, 'its drawer is the World Hub menu, not a second tab list');
});

test('no drawer config or hand-built Settings link points anywhere but the account', () => {
  const menus = read('src/config/hamburgerMenus.js');
  assert.doesNotMatch(menus, /'settings': \(user/, 'the duplicate settings drawer is gone');
  assert.doesNotMatch(menus, /section\('(?:Training )?Settings'\)/);
  assert.doesNotMatch(menus, /href: '\/hub\/settings'/);
  assert.match(read('pages/hub/social-media/index.js'), /href="\/hub\/settings\?section=account"/);
  assert.match(read('pages/hub/help.js'), /href="\/hub\/settings\?section=account"/);
  assert.match(read('src/stores/pageOverlayStore.js'), /settings: \{ url: '\/hub\/settings\?section=account'/);
});
