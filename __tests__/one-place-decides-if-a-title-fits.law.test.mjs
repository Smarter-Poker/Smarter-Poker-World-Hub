/**
 * ONE PLACE DECIDES IF A TITLE FITS (AEO phase 3, 2026-09-18).
 *
 * Four title templates on this site were measured wrong, each in its own
 * way, and each was found separately by measuring production rather than by
 * any of them catching the others:
 *
 *   venue pages        clamped at 110, the length at which a <title> stops
 *                      being sensible markup, not where a result cuts.
 *                      290 of 478 over, the worst at 90.
 *   Poker Near Me tabs never measured at all: the strings live in a table
 *                      in src/, and the law read pages/. Six over, worst 74.
 *   home game states   " - Cash Games & Tournaments" hung off the end.
 *                      Illinois 75, Nevada 73.
 *   home game cities   the same, plus a city name. Las Vegas 80.
 *   a home game itself the group name plus the city. 70.
 *
 * Two things are easy to forget every single time. SEOHead appends
 * " | Smarter.Poker" unless the title already names the site, and that is
 * part of what a reader sees. And "&" is serialised as "&amp;", costing
 * four characters more than it shows, which is what took several of these
 * over on their own.
 *
 * So there is now one module that answers it, src/lib/seo/titleFit.js, and
 * this law says every template goes through it. A fifth template cannot
 * quietly invent its own arithmetic.
 *
 * Reads source files and exercises the helper; no network, no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstThatFits, fitsInAResult, renderedLength, TITLE_BUDGET, BRAND_SUFFIX } from '../src/lib/seo/titleFit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Every page that builds a title from data rather than writing one. */
const TEMPLATED_TITLE_PAGES = [
  'pages/hub/venues/[id].js',
  'pages/hub/home-games/[slug].js',
  'pages/hub/home-games/in/[state]/index.js',
  'pages/hub/home-games/in/[state]/[city].js',
  'pages/hub/poker-near-me/in/[state]/index.js',
  'pages/hub/poker-near-me/in/[state]/[city].js',
  'pages/hub/tours/[code].js',
  'pages/glossary/[term].js',
];

test('the brand suffix and the ampersand are both counted', () => {
  // The two things every one of these templates forgot.
  assert.equal(renderedLength('a & b'), 'a & b'.length + 4);
  assert.equal(BRAND_SUFFIX, ' | Smarter.Poker');
  assert.equal(fitsInAResult('x'.repeat(TITLE_BUDGET - BRAND_SUFFIX.length)), true);
  assert.equal(fitsInAResult('x'.repeat(TITLE_BUDGET - BRAND_SUFFIX.length + 1)), false);
  // A title that already names the site is not suffixed twice.
  assert.equal(fitsInAResult('Short | Smarter.Poker'), true);
});

test('firstThatFits never returns something that does not fit', () => {
  const inputs = [
    ['Poker Home Games In District of Columbia - Cash Games And Tournaments', 'Poker Home Games In District of Columbia'],
    ['A'.repeat(300)],
    ['&'.repeat(60)],
    ['Word '.repeat(40)],
    [''],
    ['Fits Already'],
  ];
  for (const candidates of inputs) {
    const chosen = firstThatFits(candidates);
    assert.ok(
      fitsInAResult(chosen),
      `"${chosen}" renders at ${renderedLength(chosen + BRAND_SUFFIX)}, over ${TITLE_BUDGET}`,
    );
    assert.doesNotMatch(chosen, /[\s,\-&]$/, `"${chosen}" ends on punctuation`);
  }
});

test('every templated title page asks the shared helper', () => {
  const rogue = [];
  for (const file of TEMPLATED_TITLE_PAGES) {
    const src = read(file);
    const usesHelper = /\b(firstThatFits|venueTitle|tourTitle|tourSeo|seriesTitle)\s*\(/.test(src);
    if (!usesHelper) rogue.push(`${file} builds a title without asking titleFit`);
    // The clamp is what let a 90 character venue title through.
    if (/clampText\(\s*(pageTitle|metaTitle|title)\b/.test(src)) {
      rogue.push(`${file} clamps a title after the fact instead of fitting it`);
    }
  }
  assert.deepEqual(
    rogue,
    [],
    'A templated title must be built through src/lib/seo/titleFit.js, which '
    + 'counts the brand suffix SEOHead appends and the four characters an '
    + 'ampersand costs. Clamping a title afterwards cuts the end, and the end '
    + 'is where the city and the state are.\n\n' + rogue.join('\n'),
  );
});

test('no other module keeps its own copy of the arithmetic', () => {
  // Two implementations of the same sum is how four templates drifted apart.
  for (const file of [
    'src/lib/seo/venueTitle.js',
    'src/lib/seo/tourPageSeo.js',
    'src/lib/poker-near-me/seriesSeo.mjs',
  ]) {
    const src = read(file);
    assert.match(src, /titleFit\.js'/, `${file} does not import the shared fitter`);
    assert.doesNotMatch(src, /const (BRAND_SUFFIX|SUFFIX)\s*=\s*' \| Smarter\.Poker'/, `${file} redeclares the brand suffix`);
    assert.doesNotMatch(src, /(const|export const) TITLE_BUDGET\s*=\s*\d/, `${file} redeclares the budget`);
  }
});
