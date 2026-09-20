/**
 * A VENUE TITLE SURVIVES A RESULT (AEO phase 3, 2026-09-18).
 *
 * The 478 venue pages are the best pages on this site by every other
 * measure: a median of 327 server rendered words, schema on all of them, an
 * h1 on all of them. Their titles were built from one template and clamped
 * at 110 characters:
 *
 *     `${venue.name} - Poker Room in ${city}, ${state}`
 *
 * 110 is roughly where a title tag stops being sensible markup. It is not
 * where a result cuts, which is nearer 60 once the " | Smarter.Poker"
 * suffix SEOHead appends is counted. Measured on production as
 * OAI-SearchBot, 290 of the 478 were over that; the longest, Hollywood
 * Casino at Charles Town Races, rendered at 90.
 *
 * The clamp cut the end of the string. The end of the string was the city
 * and the state. A venue page exists to answer "poker in <city>", so the
 * one part a searcher was looking for was the part being discarded.
 *
 * This is the same mistake as measuring a title against the length at which
 * a tag is still valid rather than the length at which a person reads it,
 * which this programme has now made twice.
 *
 * Reads source files and exercises the helper; no network, no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { venueTitle, fitsInAResult, renderedLength, TITLE_BUDGET } from '../src/lib/seo/venueTitle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Real shapes from the live data, including the ones that broke the old
 * template: the longest name, a name that already says Poker, a name with
 * an ampersand (serialised as &amp;, four characters more than it shows),
 * a venue with no city, and a venue with neither.
 */
const REAL_SHAPES = [
  { name: 'Borgata Hotel Casino', city: 'Atlantic City', state: 'NJ' },
  { name: 'Hollywood Casino at Charles Town Races', city: 'Charles Town', state: 'WV' },
  { name: 'Michigan Charitable Gaming Association (MiCGA)', city: 'Lansing', state: 'MI' },
  { name: 'Buzz Inn Steakhouse Granite Falls', city: 'Granite Falls', state: 'WA' },
  { name: 'Graton Resort & Casino', city: 'Rohnert Park', state: 'CA' },
  { name: 'All Star Lanes & Casino', city: 'Silverdale', state: 'WA' },
  { name: 'Palace Poker Grand Prairie', city: 'Grand Prairie', state: 'TX' },
  { name: 'Daytona Beach Racing and Card Club', city: 'Daytona Beach', state: 'FL' },
  { name: 'Charity Series of Poker (CSOP)', city: 'Las Vegas', state: 'MULTI' },
  { name: 'The Venetian Resort', city: '', state: 'NV' },
  { name: 'Kontenders Poker League', city: 'Multiple Locations', state: 'NC' },
  { name: 'Some Room With No Location At All', city: '', state: '' },
  { name: 'A'.repeat(200), city: 'Nowhere', state: 'ZZ' },
  { name: '&&&&&&&&&&&&&&&&&&&&', city: 'Ampersand City', state: 'CA' },
  { name: '', city: 'Empty Name', state: 'CA' },
];

test('no venue title is cut short in a result', () => {
  const over = [];
  for (const shape of REAL_SHAPES) {
    const title = venueTitle(shape);
    if (!fitsInAResult(title)) {
      over.push(`${renderedLength(`${title} | Smarter.Poker`)}  ${title}`);
    }
  }
  assert.deepEqual(
    over,
    [],
    `A venue title must render inside ${TITLE_BUDGET} characters with the brand `
    + 'suffix counted, because that is where a result cuts.\n\nOver budget:\n  '
    + over.join('\n  '),
  );
});

test('a title keeps the location for as long as it can', () => {
  // The whole point of stepping down through candidates rather than
  // clamping is that the city survives wherever it fits.
  assert.equal(
    venueTitle({ name: 'Borgata Hotel Casino', city: 'Atlantic City', state: 'NJ' }),
    'Borgata Hotel Casino, Atlantic City, NJ',
  );
  // Too long for the city, so the state is kept rather than nothing.
  const longer = venueTitle({ name: 'Buzz Inn Steakhouse Granite Falls', city: 'Granite Falls', state: 'WA' });
  assert.match(longer, /WA$/);
  // A name that already says Poker does not say it twice.
  const saysPoker = venueTitle({ name: 'Palace Poker Grand Prairie', city: 'Grand Prairie', state: 'TX' });
  assert.doesNotMatch(saysPoker, /Poker Room/);
});

test('a title never ends on a dangling comma or dash', () => {
  for (const shape of REAL_SHAPES) {
    const title = venueTitle(shape);
    assert.doesNotMatch(title, /[\s,\-]$/, `"${title}" ends on punctuation`);
  }
});

test('the venue page uses the helper and does not clamp the title afterwards', () => {
  const src = read('pages/hub/venues/[id].js');
  assert.match(src, /venueTitle\(\{\s*name: venue\.name/);
  // clampText(title, 110) is what let a 90 character title through.
  assert.doesNotMatch(src, /clampText\(title,/);
});
