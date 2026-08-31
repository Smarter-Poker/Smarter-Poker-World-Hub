import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('deep Poker Near Me page families expose one shared semantic main contract', async () => {
  const routes = await Promise.all([
    source('pages/hub/venues/[id].js'),
    source('pages/hub/home-games.js'),
    source('pages/hub/home-games/near-me.js'),
    source('pages/hub/home-games/[slug].js'),
    source('pages/hub/poker-series.js'),
    source('pages/hub/series/[id].js'),
    source('pages/hub/events-calendar.js'),
    source('pages/hub/tours/[code].js'),
  ]);

  for (const route of routes) {
    assert.match(route, /<main\b[^>]*data-pnm-secondary-foundation="interaction-v1"/);
    assert.match(route, /<\/main>/);
  }
});

test('venue profiles use the resilient shared identity mark for remote media', async () => {
  const [venue, identity] = await Promise.all([
    source('pages/hub/venues/[id].js'),
    source('src/components/poker-near-me/PokerIdentityMark.jsx'),
  ]);

  assert.match(venue, /import PokerIdentityMark/);
  assert.match(venue, /<PokerIdentityMark[\s\S]*?name=\{venue\.name\}/);
  assert.doesNotMatch(venue, /e\.target\.style\.display = 'none'/);
  assert.match(identity, /data-media-state=\{showImage \? 'image' : 'fallback'\}/);
  assert.match(identity, /onError=\{\(\) => setImageFailed\(true\)\}/);
});

test('shared command rails and secondary actions keep a 44px interaction floor', async () => {
  const world = await source('src/styles/worlds/poker-near-me.css');

  assert.match(world, /\.pnm-family-nav__link\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(world, /\.pnm-top-tab[\s\S]*?\.section-action-btn[\s\S]*?\.vr-write-btn[\s\S]*?min-height:\s*44px\s*!important/);
  assert.match(world, /\.vc3-fav[\s\S]*?\.vc3-icon-btn[\s\S]*?\.map-pref-trigger[\s\S]*?min-width:\s*44px\s*!important/);
  assert.match(world, /body\.world-poker-near-me :is\(button, a\):focus-visible/);
});
