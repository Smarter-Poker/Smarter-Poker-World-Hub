/**
 * REMOVED PITCH DECKS STAY GONE (2026-11-26).
 *
 * Owner instruction: remove all three standalone PDF/slide pitch decks from
 * smarter.poker - USRobots (/USRobots), LeafLocator (/leaflocator), and the
 * Investor pitch spreads (/investor) - along with every page, image folder,
 * and exclusive pitch-deck component.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;

const REMOVED_PATHS = [
  'pages/USRobots.js',
  'pages/leaflocator.js',
  'pages/investor.js',
  'public/usrobots',
  'public/images/leaflocator',
  'public/images/pitch',
  'src/components/pitch',
];

test('removed pitch deck pages, image folders, and components stay deleted', () => {
  const present = REMOVED_PATHS.filter((rel) => existsSync(join(ROOT, rel)));
  assert.deepEqual(
    present,
    [],
    `removed pitch deck artifacts reappeared:\n${present.join('\n')}`
  );
});

test('no case-variant route for USRobots, leaflocator, or investor exists in pages/', () => {
  const topPages = readdirSync(join(ROOT, 'pages'));
  const banned = new Set(['usrobots', 'leaflocator', 'investor']);
  const offenders = topPages.filter((entry) => {
    const stem = entry.replace(/\.(js|jsx|ts|tsx|mjs)$/i, '').toLowerCase();
    return banned.has(stem);
  });
  assert.deepEqual(
    offenders,
    [],
    `banned pitch-deck route(s) found in pages/:\n${offenders.join('\n')}`
  );
});
