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
test('the last traces of the standalone Diamond Arena stay removed', async () => {
  assert.ok(!read('next.config.js').includes('diamond.smarter.poker'), 'the retired iframe origin is not an image host');
  const search = read('src/world/components/GlobalSearch.tsx');
  const mock = search.slice(search.indexOf('const mockResults = ['), search.indexOf('].filter('));
  assert.match(mock, /'Poker Arena'/);
  assert.doesNotMatch(mock, /Diamond Arena/, 'Diamond Arena is a selection inside Poker Arena, not its own search result');
  const { DIAMOND_ENTRIES } = await import('../src/lib/geevesKB/trainingAndDiamonds.js');
  const entry = DIAMOND_ENTRIES.find(item => item.id === 'ds-3');
  assert.ok(entry, 'ds-3 keeps its id');
  const spoken = [entry.answer, ...entry.followUps].join('\n');
  for (const retired of ['Table Settings', 'Schedule', 'Leaderboard', 'History', 'leaderboard', 'schedule', 'buy-in']) {
    assert.ok(!spoken.includes(retired), `ds-3 no longer describes ${retired}`);
  }
  assert.match(entry.answer, /Poker Arena/);
  assert.match(entry.answer, /\/hub\/club-arena/);
  assert.ok(!spoken.includes('—'), 'no em dash in player-facing copy');
  assert.ok(!read('src/lib/geevesKB/worldHub.js').includes('Biggest diamond earners'), 'the leaderboards page has no Diamond Arena category');
});
