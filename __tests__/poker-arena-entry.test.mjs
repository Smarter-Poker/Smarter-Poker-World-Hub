import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const read = file => readFileSync(file, 'utf8');
test('only the shared Poker Arena entrance is advertised', () => {
  const registry = read('src/orbs/manifest/registry.ts');
  assert.match(registry, /id: 'club-arena',[\s\S]*?label: 'Poker Arena'/);
  assert.doesNotMatch(registry, /id: 'diamond-arena'/);
  for (const file of ['src/config/hamburgerMenus.js', 'src/config/world-footer-navigation.json', 'src/config/bottom-nav-routes.json', 'pages/sitemap.xml.js']) {
    assert.ok(!read(file).includes('/hub/diamond-arena'), file);
  }
  for (const suffix of ['', '/history', '/leaderboard', '/schedule', '/stats', '/table-settings']) {
    assert.equal(existsSync(`pages/hub/diamond-arena${suffix}.js`), false);
  }
  assert.equal(existsSync('public/cards/diamond-arena.png'), true, 'approved original artwork is retained');
  assert.equal(existsSync('public/cards/poker-arena.png'), true);
});
test('retired or cached unknown world URLs return 404 while valid worlds and aliases survive', async () => {
  const source = read('pages/hub/[orbId].js');
  const fn = source.slice(source.indexOf('export async function getServerSideProps'), source.indexOf('export default function OrbPage'))
    .replace('export async function', 'async function');
  const context = vm.createContext({ ORB_METADATA: { training: {} }, getOrbById: key => key === 'news' });
  vm.runInContext(fn, context);
  for (const key of ['diamond-arena', 'DIAMOND-ARENA', 'retired-card']) {
    assert.equal((await context.getServerSideProps({ params: { orbId: key } })).notFound, true);
  }
  for (const key of ['training', 'news', 'venues']) {
    assert.ok((await context.getServerSideProps({ params: { orbId: key } })).props);
  }
});
