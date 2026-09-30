// A VENUE MARK IS ONLY ASKED FOR WHEN IT EXISTS.
//
// `public/images/venues/` holds a hand-cut 54px mark for some venues. The card
// used to build `/images/venues/<id>.png` for EVERY venue and clear it in
// onError, so a venue with no mark cost a 404 on every render. Measured on
// production the day this was written: /hub/poker-near-me/in/il fired 13 of
// them and /in/tx/austin fired 8, and the directory carries 478 venues against
// 134 files, only 73 of which still match a venue, so most cards on a city
// page were asking for a file that has never existed.
//
// These pin the two halves: the painted manifest matches the folder, and the
// card asks it rather than guessing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readMarkIds, renderModule } from '../scripts/gen-venue-marks-manifest.mjs';
import { hasVenueMark, venueMarkUrl, VENUE_MARK_IDS } from '../src/components/poker-near-me/venueMarks.js';

const ROOT = process.cwd();
const MARKS_DIR = path.join(ROOT, 'public', 'images', 'venues');
const MODULE_PATH = path.join(ROOT, 'src', 'components', 'poker-near-me', 'venueMarks.js');
const CARD_PATH = path.join(ROOT, 'src', 'components', 'poker-near-me', 'PokerNearMeLocationPage.jsx');

test('the manifest is exactly the marks on disk, so it cannot rot', () => {
    const onDisk = readMarkIds(MARKS_DIR);
    assert.ok(onDisk.length > 0, 'the marks folder is not empty');
    assert.deepEqual([...VENUE_MARK_IDS].sort(), [...onDisk].sort(),
        'venueMarks.js is stale. Run: npm run gen:venue-marks');
});

test('the checked-in module is byte-identical to what the generator writes', () => {
    const current = fs.readFileSync(MODULE_PATH, 'utf8');
    assert.equal(current, renderModule(readMarkIds(MARKS_DIR)),
        'venueMarks.js was hand-edited or is stale. Run: npm run gen:venue-marks');
});

test('every id in the manifest has a real file behind it', () => {
    for (const id of VENUE_MARK_IDS) {
        assert.ok(fs.existsSync(path.join(MARKS_DIR, `${id}.png`)), `${id}.png is missing`);
    }
});

test('a venue without a mark is never turned into a URL', () => {
    assert.equal(hasVenueMark('999999999'), false);
    assert.equal(venueMarkUrl('999999999'), '', 'no mark means no request at all');
    assert.equal(venueMarkUrl(null), '');
    assert.equal(venueMarkUrl(undefined), '');
});

test('a venue with a mark still gets its own file, by number or by string', () => {
    const [first] = readMarkIds(MARKS_DIR);
    assert.equal(hasVenueMark(first), true);
    assert.equal(hasVenueMark(Number(first)), true, 'ids arrive as numbers from the database');
    assert.equal(venueMarkUrl(Number(first)), `/images/venues/${first}.png`);
});

test('the card asks the manifest and never builds the path itself', () => {
    const src = fs.readFileSync(CARD_PATH, 'utf8');
    assert.match(src, /import \{ venueMarkUrl \} from '\.\/venueMarks'/,
        'the card must read the manifest');
    assert.match(src, /useState\(venueMarkUrl\(venue\.id\)\)/,
        'the mark must start from the manifest');
    assert.ok(!/`\/images\/venues\/\$\{[^}]+\}\.png`/.test(src),
        'the card must not build a mark path itself: that is the 404 this guard exists to stop');
});

test('most of the directory has no mark, which is why guessing was expensive', () => {
    const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'poker-venue-directory-snapshot.json'), 'utf8'));
    const rows = snapshot.venues || snapshot;
    const venues = Array.isArray(rows) ? rows : Object.values(rows);
    const withMark = venues.filter((v) => hasVenueMark(v.id)).length;
    assert.ok(venues.length > withMark,
        'if every venue had a mark the old code would have been free; it never was');
});
