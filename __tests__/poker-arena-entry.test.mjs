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
test('Geeves only promises what Diamonds and the leaderboards actually do today', async () => {
  const { DIAMOND_ENTRIES } = await import('../src/lib/geevesKB/trainingAndDiamonds.js');
  const { WORLD_HUB_ENTRIES } = await import('../src/lib/geevesKB/worldHub.js');
  const say = entry => [entry.answer, ...entry.followUps].join('\n');
  const find = (list, id) => {
    const entry = list.find(item => item.id === id);
    assert.ok(entry, `${id} keeps its id`);
    return entry;
  };
  const store = read('src/data/diamondStoreData.js');
  for (const [list, id] of [[DIAMOND_ENTRIES, 'ds-1'], [DIAMOND_ENTRIES, 'ds-2'], [WORLD_HUB_ENTRIES, 'wh-20']]) {
    const spoken = say(find(list, id));
    assert.doesNotMatch(spoken, /Diamond Arena/i, `${id} does not sell the arena as a way to spend Diamonds`);
    assert.doesNotMatch(spoken, /arena (tournament|entry|buy-?in)|tournament buy-?in|Club Arena entry fee/i, `${id} promises no arena buy-ins`);
    assert.ok(!spoken.includes('—'), `${id} has no em dash`);
  }
  const ds1 = find(DIAMOND_ENTRIES, 'ds-1').answer;
  for (const invented of ['Starter', 'Elite', 'Avatar upgrades', 'Exclusive features', 'Premium training content']) {
    assert.ok(!ds1.includes(invented), `ds-1 no longer invents ${invented}`);
  }
  // The package range the entry quotes is the catalog's own first and last package.
  assert.match(store, /id: 'micro',[\s\S]*?diamonds: 100,\s*price: 1\.0,/);
  assert.match(store, /id: 'whale',[\s\S]*?diamonds: 50000,\s*price: 500\.0,/);
  assert.match(ds1, /100 Diamonds \(\$1\)/);
  assert.match(ds1, /50,000 Diamonds \(\$500\)/);

  // wh-14 lists exactly the tabs and periods pages/hub/leaderboards.js renders.
  const page = read('pages/hub/leaderboards.js');
  const labels = name => {
    const block = page.slice(page.indexOf(`const ${name} = [`), page.indexOf('];', page.indexOf(`const ${name} = [`)));
    return [...block.matchAll(/label: '([^']+)'/g)].map(match => match[1]);
  };
  const tabs = labels('TABS');
  const periods = labels('PERIODS');
  assert.ok(tabs.length > 0 && periods.length > 0, 'the leaderboards page still declares TABS and PERIODS');
  const wh14 = find(WORLD_HUB_ENTRIES, 'wh-14');
  const listed = [...wh14.answer.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(match => match[1]);
  assert.deepEqual(listed, tabs, 'wh-14 categories are the page tabs, in order');
  assert.match(wh14.answer, new RegExp(`\\*\\*Periods:\\*\\* ${periods.join(', ')}\\n`));
  const spoken14 = say(wh14);
  for (const invented of ['Training Accuracy', 'Tournament Wins', 'Bankroll', 'Toke Tracker', 'Social Influence', 'Daily', 'diamond bonus', 'Rewards']) {
    assert.ok(!spoken14.includes(invented), `wh-14 no longer claims ${invented}`);
  }
  assert.ok(!spoken14.includes('—'), 'wh-14 has no em dash');
});
test('player-facing World Hub copy no longer sends anyone to a playable Diamond Arena', () => {
  assert.doesNotMatch(read('pages/hub/help.js'), /competitive poker room|cash games and tournaments with other players for diamonds/);
  assert.match(read('pages/hub/help.js'), /Funded Diamond games are not open for play yet/);
  for (const file of [
    'pages/auth/signup.js',
    'pages/hub/diamond-store.js',
    'src/data/diamondStoreData.js',
    'src/content/glossary/terms.js',
    'src/config/diamondRewards.js',
    'src/components/diamonds/DiamondRewardTracker.tsx',
    'src/components/profile-edit/CardDeckPreferenceSection.js',
  ]) {
    const visible = read(file).split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.doesNotMatch(visible, /Diamond Arena/, file);
  }
});
test('the legal pages no longer describe the retired standalone Diamond Arena', () => {
  for (const file of ['pages/terms.js', 'pages/legal/official-rules.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /Enter The Diamond Arena/i, file);
    assert.doesNotMatch(source, /Free Roll Hourly/i, file);
    assert.doesNotMatch(source, /hourly[^<\n]*Diamond Arena|Diamond Arena[^<\n]*hourly/i, file);
    assert.doesNotMatch(source, /Diamond Arena Sweepstakes/i, file);
    assert.doesNotMatch(source, /<strong>Diamond Arena:<\/strong> (Competitive|Prize|❌)/, file);
    assert.match(source, /Last Updated: October 5, 2026/, file);
  }
});
