/**
 * SCHEMA NEVER PUBLISHES A PLACEHOLDER ADDRESS (AEO phase 2, 2026-09-17).
 *
 * Venue 1828 (Lodge Poker Club, Austin) carried "123 Test St" in
 * poker_venues.address, and every Poker Near Me directory page for Austin and
 * for Texas shipped it to Google inside PostalAddress. Structured data is a
 * claim of fact; a wrong one about a real business is worse than none at all,
 * and it is the kind of error that costs a site the rich result it was trying
 * to earn.
 *
 * The row is the venue pipeline's to correct. This is the guard that stops
 * the next one reaching an engine: every surface that emits streetAddress
 * asks first, and the locality, region and country still stand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublishableStreetAddress } from '../src/lib/poker-near-me/structuredData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('a placeholder address is refused', () => {
  for (const bad of [
    '123 Test St',
    '123 Main St',
    ' 123   test   street ',
    'Test Street 5',
    'unknown',
    'N/A',
    'TBD',
    '',
    null,
    undefined,
    'Downtown',
  ]) {
    assert.equal(isPublishableStreetAddress(bad), false, `${JSON.stringify(bad)} must not be published`);
  }
});

test('a real address is published', () => {
  for (const good of [
    '10603 W Fm 2243',
    '2400 Lake Austin Blvd',
    '777 Harrah\'s Blvd',
    '1 Borgata Way',
    '3131 S Las Vegas Blvd Suite 200',
  ]) {
    assert.equal(isPublishableStreetAddress(good), true, `${good} is a real address`);
  }
});

test('every surface that emits streetAddress asks first', () => {
  const SURFACES = [
    'src/lib/poker-near-me/structuredData.js',
    'pages/hub/venues/[id].js',
    'pages/club/[id].js',
  ];
  for (const file of SURFACES) {
    const src = read(file);
    for (const line of src.split('\n')) {
      if (!/streetAddress\s*[:=]/.test(line)) continue;
      if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue;
      assert.match(
        line,
        /isPublishableStreetAddress/,
        `${file} emits streetAddress without checking it: ${line.trim()}`,
      );
    }
  }
});
