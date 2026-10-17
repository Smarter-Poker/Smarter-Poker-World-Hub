import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('DeepRouteSignalDeck ensures LCP hero images use async decoding and fetchpriority', () => {
  const signalDeckPath = path.join(ROOT, 'src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  const content = fs.readFileSync(signalDeckPath, 'utf8');

  assert.ok(content.includes('fetchpriority={compact ? \'auto\' : \'high\'}'), 'Hero image must have fetchpriority high');
  assert.ok(content.includes('decoding="async"'), 'Hero image must have decoding async');
});

test('poker-near-me stylesheet enables content-visibility auto on high-volume card grids', () => {
  const pnmCssPath = path.join(ROOT, 'src/styles/worlds/poker-near-me.css');
  const content = fs.readFileSync(pnmCssPath, 'utf8');

  assert.ok(content.includes('content-visibility: auto'), 'Location cards must enable content-visibility: auto');
  assert.ok(content.includes('contain-intrinsic-size'), 'Must specify contain-intrinsic-size to prevent layout shift');
});

test('poker-near-me-console-deep stylesheet enables content-visibility auto on location directory indexes', () => {
  const deepCssPath = path.join(ROOT, 'src/styles/worlds/poker-near-me-console-deep.css');
  const content = fs.readFileSync(deepCssPath, 'utf8');

  assert.ok(content.includes('content-visibility: auto'), 'Location index must enable content-visibility: auto');
  assert.ok(content.includes('contain-intrinsic-size'), 'Location index must have contain-intrinsic-size');
});

test('PokerNearMeLocationPage ensures below-fold venue cards use lazy loading and async decoding', () => {
  const locationPagePath = path.join(ROOT, 'src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  const content = fs.readFileSync(locationPagePath, 'utf8');

  assert.ok(content.includes('loading="lazy"'), 'Cards must use lazy loading');
  assert.ok(content.includes('decoding="async"'), 'Cards must use async decoding');
});
