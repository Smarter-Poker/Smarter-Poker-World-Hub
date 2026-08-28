import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Hub loads the shared ClubButtons material system and production shells', () => {
  assert.match(read('pages/_app.js'), /vendor\/commander-shared\/src\/components\/club-buttons\/club-buttons\.css/);
  for (const asset of ['action-primary-shell.webp', 'club-utility-shell.webp', 'club-nav-shell.webp', 'wallet-row-shell.webp']) {
    assert.ok(existsSync(join(root, 'public/assets/club-buttons', asset)), `${asset} is missing`);
  }
});

test('persistent Hub navigation uses Hub mode without changing routes or unread behavior', () => {
  const nav = read('src/components/ui/BottomNavBar.jsx');
  assert.match(nav, /cb-mode-hub hub-bottom-nav/);
  assert.match(nav, /cb-nav-item/);
  assert.match(nav, /aria-current=\{active \? 'page'/);
  assert.match(nav, /notificationCount/);
  assert.match(nav, /router\.prefetch\(href\)/);
  assert.match(nav, /href: '\/hub\/social-media'/);
});

test('global Hub controls keep their live data and click handlers under hardware shells', () => {
  const header = read('src/components/ui/UniversalHeader.js');
  assert.match(header, /universal-header cb-surface cb-mode-hub/);
  assert.match(header, /useDiamondBalance\(user\?\.id\)/);
  assert.match(header, /markAllNotificationsRead\(\)/);
  assert.match(header, /router\.push\('\/hub\/messenger'\)/);
  assert.match(header, /className="orb-btn cb-icon-control"/);
});

