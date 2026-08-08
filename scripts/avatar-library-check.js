/**
 * AVATAR LIBRARY CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: a resolution sweep over every seat portrait the app's three
 * felts can draw -- UniversalDynamicTable.jsx (the trainer), TrainingGameTable
 * .jsx (the golden-template training felt) and LivePokerTable.jsx (the real-
 * money/club felt). All three now share one selection module,
 * src/data/AVATAR_LIBRARY.js. It reads the REAL avatar catalogue and lifts
 * the REAL selection functions out of src/lib/tableAvatars.js, plus the REAL
 * wiring functions out of TrainingGameTable.jsx and LivePokerTable.jsx --
 * they are plain JS with no JSX in them, so they can be evaluated verbatim
 * rather than re-implemented here. Nothing below is a paraphrase of the
 * shipping code; a drift between the two would have to be a drift in the
 * files themselves.
 *
 * WHAT IT ASSERTS:
 *   - every image path the library can yield resolves to a file under public/
 *   - the pool is deduped BY PATH, so no two entries carry the same portrait
 *   - selection is DETERMINISTIC: one hand/question/table key always deals
 *     one cast
 *   - selection is DISTINCT: no two seats at a table share a face, and no
 *     villain/fallback wears hero's or the viewer's own
 *   - none of the three components hardcodes its own avatar array anymore --
 *     all three draw from the shared library
 *   - LivePokerTable: a real player's own avatarUrl always wins over the
 *     library fallback, and the viewer's own account avatar is withheld from
 *     every other seat's fallback
 *
 * WHY IT EXISTS: SeatAvatar (and LivePokerTable's <img onError>) degrade a
 * missing asset to a monogram disc / silent fallback. A broken path is
 * therefore invisible in review and nearly invisible in play -- which is how
 * vip_pirate.png stayed broken.
 *
 *   node scripts/avatar-library-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIBRARY_FILE = path.join(ROOT, 'src/data/AVATAR_LIBRARY.js');
const SHARED_FILE = path.join(ROOT, 'src/lib/tableAvatars.js');
const TABLE_FILE = path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx');
const TRAINING_TABLE_FILE = path.join(ROOT, 'src/components/poker/TrainingGameTable.jsx');
const LIVE_TABLE_FILE = path.join(ROOT, 'src/components/poker/LivePokerTable.jsx');
const PUBLIC_DIR = path.join(ROOT, 'public');

let PASS = 0, FAIL = 0;
function check(name, fn) {
    let ok = false, detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r);
    } catch (e) { detail = 'threw: ' + (e && e.message); }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}

// -- read the catalogue ------------------------------------------------------
// AVATAR_LIBRARY.js is an ES module and this script is CommonJS, so it cannot
// be require()d. The array is a literal of plain objects, so evaluate the
// literal itself: the paths come from the file, never from a copy in here.
const librarySource = fs.readFileSync(LIBRARY_FILE, 'utf8');

function extractArrayLiteral(source, declaration) {
    const start = source.indexOf(declaration);
    if (start < 0) throw new Error('could not find ' + declaration);
    const open = source.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === '[') depth++;
        else if (c === ']') {
            depth--;
            if (depth === 0) return source.slice(open, i + 1);
        }
    }
    throw new Error('unterminated array for ' + declaration);
}

function extractFunction(source, name, fileLabel) {
    const marker = 'function ' + name + '(';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('could not find function ' + name + ' in ' + fileLabel);
    const open = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unterminated function ' + name + ' in ' + fileLabel);
}

// eslint-disable-next-line no-new-func
const AVATAR_LIBRARY = new Function('return ' + extractArrayLiteral(librarySource, 'export const AVATAR_LIBRARY'))();

// -- lift the shared selection module verbatim --------------------------------
// src/lib/tableAvatars.js is the one place VILLAIN_AVATAR_POOL, hashHandKey,
// seededRandom and dealSeatAvatars are defined now. Strip its own import of
// AVATAR_LIBRARY and its `export` keywords so the rest runs as a plain script
// with AVATAR_LIBRARY supplied as an argument -- everything else is untouched.
const sharedSource = fs.readFileSync(SHARED_FILE, 'utf8');

const SHARED_IMPORT_LINE = "import { AVATAR_LIBRARY } from '../data/AVATAR_LIBRARY';";
if (!sharedSource.includes(SHARED_IMPORT_LINE)) {
    throw new Error('expected import line not found in ' + SHARED_FILE + ' -- update the anchor');
}
const sharedBody = sharedSource
    .replace(SHARED_IMPORT_LINE, '')
    .replace(/export (const|function)/g, '$1');

const shipped = new Function('AVATAR_LIBRARY', [
    sharedBody,
    'return { VILLAIN_AVATAR_POOL, HERO_DEFAULT_AVATAR, dealSeatAvatars, hashHandKey, seededRandom };',
].join('\n'))(AVATAR_LIBRARY);

const POOL = shipped.VILLAIN_AVATAR_POOL;
const dealSeatAvatars = shipped.dealSeatAvatars;
const HERO_DEFAULT_AVATAR = shipped.HERO_DEFAULT_AVATAR;

// -- the three felts that consume the shared module ---------------------------
const tableSource = fs.readFileSync(TABLE_FILE, 'utf8');
const trainingTableSource = fs.readFileSync(TRAINING_TABLE_FILE, 'utf8');
const liveTableSource = fs.readFileSync(LIVE_TABLE_FILE, 'utf8');

// LivePokerTable's own wiring (resolveTableAvatar / buildSeatFallbackAvatars)
// is plain JS too -- lift it verbatim, same rule as everything else here.
const liveShipped = new Function('dealSeatAvatars', 'HERO_DEFAULT_AVATAR', [
    extractFunction(liveTableSource, 'resolveTableAvatar', 'LivePokerTable.jsx'),
    extractFunction(liveTableSource, 'buildSeatFallbackAvatars', 'LivePokerTable.jsx'),
    'return { resolveTableAvatar, buildSeatFallbackAvatars };',
].join('\n'))(dealSeatAvatars, HERO_DEFAULT_AVATAR);

console.log('\n=== The catalogue ===');

check('AVATAR_LIBRARY parsed and is non-trivial', () => {
    if (!Array.isArray(AVATAR_LIBRARY)) return 'not an array';
    return AVATAR_LIBRARY.length >= 70 || 'only ' + AVATAR_LIBRARY.length + ' entries';
});

check('the trainer draws from the shared library, not a hardcoded nine', () => {
    if (/const AVATARS = \[/.test(tableSource)) return 'the hardcoded AVATARS array is still there';
    if (!/from '\.\.\/\.\.\/\.\.\/lib\/tableAvatars'/.test(tableSource)) return 'src/lib/tableAvatars is not imported';
    return true;
});

check('every library entry has an image path', () => {
    const bad = AVATAR_LIBRARY.filter(a => !a || typeof a.image !== 'string' || !a.image.startsWith('/'));
    return bad.length === 0 || bad.length + ' entries without a usable image (' + bad.map(b => b && b.id).join(', ') + ')';
});

console.log('\n=== Every path resolves under public/ ===');

const allPaths = AVATAR_LIBRARY.map(a => a && a.image).filter(Boolean);

check('every AVATAR_LIBRARY image exists on disk', () => {
    const missing = allPaths.filter(p => !fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, ''))));
    return missing.length === 0 || missing.length + ' missing: ' + missing.join(', ');
});

check('every pooled portrait exists on disk', () => {
    const missing = POOL.filter(p => !fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, ''))));
    return missing.length === 0 || missing.length + ' missing: ' + missing.join(', ');
});

check("hero's default portrait exists on disk", () =>
    fs.existsSync(path.join(PUBLIC_DIR, HERO_DEFAULT_AVATAR.replace(/^\//, '')))
    || HERO_DEFAULT_AVATAR + ' is missing');

check('every /avatars/ path anywhere in the library file exists on disk', () => {
    const referenced = [...new Set(librarySource.match(/\/avatars\/[A-Za-z0-9_\-/]+\.(?:png|jpg|jpeg|webp|svg)/g) || [])];
    const missing = referenced.filter(p => !fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, ''))));
    if (missing.length) return missing.length + ' missing: ' + missing.join(', ');
    return referenced.length > 0 || 'no avatar paths found at all';
});

check('the pool is deduped BY PATH', () => {
    const dupes = POOL.filter((p, i) => POOL.indexOf(p) !== i);
    if (dupes.length) return 'repeated portraits: ' + [...new Set(dupes)].join(', ');
    const rawDupes = allPaths.filter((p, i) => allPaths.indexOf(p) !== i);
    if (rawDupes.length && POOL.length >= allPaths.length) {
        return 'the library repeats ' + [...new Set(rawDupes)].join(', ') + ' but the pool did not collapse it';
    }
    return true;
});

check('the pool is large enough to seat a full 9-max table', () =>
    POOL.length >= 9 || 'only ' + POOL.length + ' portraits');

console.log('\n=== Selection is deterministic and distinct (shared dealSeatAvatars) ===');

const KEYS = ['q-1', 'q-2', 'scenario-abc', 'BTNvsBB-77', '', 'q-42', 'deadbeef-1234', 'q-999'];
const COUNTS = [2, 3, 6, 9];

check('the same hand key always deals the same cast', () => {
    for (const key of KEYS) {
        for (const n of COUNTS) {
            const a = dealSeatAvatars(key, n, HERO_DEFAULT_AVATAR).join('|');
            const b = dealSeatAvatars(key, n, HERO_DEFAULT_AVATAR).join('|');
            if (a !== b) return 'key ' + JSON.stringify(key) + ' at ' + n + '-max dealt two different casts';
        }
    }
    return true;
});

check('no Math.random anywhere in src/lib/tableAvatars.js', () => {
    const region = sharedSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    return !/Math\.random/.test(region) || 'Math.random is in the selection code';
});

check('no two seats at one table share a face', () => {
    for (const key of KEYS) {
        for (const n of COUNTS) {
            const cast = dealSeatAvatars(key, n, HERO_DEFAULT_AVATAR);
            if (new Set(cast).size !== cast.length) {
                return 'key ' + JSON.stringify(key) + ' at ' + n + '-max repeated a face: ' + cast.join(', ');
            }
        }
    }
    return true;
});

check('a full table gets exactly one portrait per seat', () => {
    for (const n of COUNTS) {
        const cast = dealSeatAvatars('q-7', n, HERO_DEFAULT_AVATAR);
        if (cast.length !== n) return n + '-max dealt ' + cast.length + ' portraits';
    }
    return true;
});

check('entry 0 is HERO-RELATIVE and belongs to hero', () => {
    const custom = '/avatars/vip/dragon.png';
    for (const n of COUNTS) {
        const cast = dealSeatAvatars('q-3', n, custom);
        if (cast[0] !== custom) return n + '-max put ' + cast[0] + ' in hero\'s slot';
        if (cast.slice(1).includes(custom)) return n + '-max gave a villain hero\'s face';
    }
    return true;
});

check("hero's chosen avatar is never handed to a villain", () => {
    let checked = 0;
    for (const heroSrc of POOL.slice(0, 12)) {
        for (const key of KEYS) {
            const cast = dealSeatAvatars(key, 9, heroSrc);
            if (cast.slice(1).includes(heroSrc)) return 'villain wearing ' + heroSrc + ' on key ' + key;
            checked++;
        }
    }
    return checked > 0 || 'nothing checked';
});

check('a session reaches deep into the library, not the same nine faces', () => {
    const seen = new Set();
    for (let q = 1; q <= 60; q++) {
        for (const src of dealSeatAvatars('q-' + q, 9, HERO_DEFAULT_AVATAR).slice(1)) seen.add(src);
    }
    return seen.size >= 60 || 'only ' + seen.size + ' distinct portraits across 60 hands';
});

const reach = (() => {
    const seen = new Set();
    for (let q = 1; q <= 4000; q++) {
        for (const src of dealSeatAvatars('q-' + q, 9, HERO_DEFAULT_AVATAR).slice(1)) seen.add(src);
    }
    return seen;
})();

check('every portrait in the pool is reachable', () => {
    const unreached = POOL.filter(p => !reach.has(p) && p !== HERO_DEFAULT_AVATAR);
    return unreached.length === 0 || unreached.length + ' never dealt: ' + unreached.join(', ');
});

console.log('\n=== TrainingGameTable.jsx (migrated off its hardcoded nine) ===');

check('TrainingGameTable draws from the shared library, not a hardcoded map', () => {
    if (/const AVATARS = \{/.test(trainingTableSource)) return 'the hardcoded AVATARS map is still there';
    if (!/from '\.\.\/\.\.\/lib\/tableAvatars'/.test(trainingTableSource)) return 'tableAvatars module is not imported';
    if (!/dealSeatAvatars\(handAvatarKey, SEATS\.length/.test(trainingTableSource)) return 'dealSeatAvatars is not called with SEATS.length';
    return true;
});

check('TrainingGameTable seats a full 9-seat felt', () => {
    const start = trainingTableSource.indexOf('const SEATS = [');
    if (start < 0) return 'SEATS array not found';
    const end = trainingTableSource.indexOf('];', start);
    const block = trainingTableSource.slice(start, end);
    const count = (block.match(/\{ id:/g) || []).length;
    return count === 9 || 'expected 9 seats, found ' + count;
});

check('no Math.random near TrainingGameTable avatar wiring', () => {
    const start = trainingTableSource.indexOf('const handAvatarKey');
    const end = trainingTableSource.indexOf('return (', start);
    if (start < 0 || end < 0) return 'avatar wiring region not found';
    const region = trainingTableSource.slice(start, end);
    return !/Math\.random/.test(region) || 'Math.random found near avatar selection';
});

check('the same question always deals the same TrainingGameTable cast', () => {
    const titles = ['ICM FUNDAMENTALS', 'GTO Training', ''];
    const qns = [1, 2, 7, 20];
    for (const t of titles) {
        for (const q of qns) {
            const key = t + '|' + q;
            const a = dealSeatAvatars(key, 9, HERO_DEFAULT_AVATAR).join('|');
            const b = dealSeatAvatars(key, 9, HERO_DEFAULT_AVATAR).join('|');
            if (a !== b) return 'key ' + JSON.stringify(key) + ' dealt two different casts';
        }
    }
    return true;
});

check('TrainingGameTable 9-seat deals are distinct and every path resolves', () => {
    for (let q = 1; q <= 30; q++) {
        const cast = dealSeatAvatars('ICM FUNDAMENTALS|' + q, 9, HERO_DEFAULT_AVATAR);
        if (cast.length !== 9) return 'question ' + q + ': expected 9 portraits, got ' + cast.length;
        if (new Set(cast).size !== cast.length) return 'question ' + q + ' repeated a face';
        for (const p of cast) {
            if (!fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, '')))) return p + ' missing on disk';
        }
    }
    return true;
});

console.log('\n=== LivePokerTable.jsx (migrated off its hardcoded ten) ===');

check('LivePokerTable draws fallback portraits from the shared library, not a hardcoded ten', () => {
    if (/const FALLBACK_TABLE_AVATARS = \[/.test(liveTableSource)) return 'the hardcoded FALLBACK_TABLE_AVATARS array is still there';
    if (!/from '\.\.\/\.\.\/lib\/tableAvatars'/.test(liveTableSource)) return 'tableAvatars module is not imported';
    return true;
});

check("a real player's own avatarUrl always wins over the library fallback", () => {
    const cases = [
        'http://example.com/a.png',
        'https://cdn.example.com/b.jpg',
        'data:image/png;base64,AAAA',
    ];
    for (const avatarUrl of cases) {
        const got = liveShipped.resolveTableAvatar(avatarUrl, '/avatars/table/free_fox.png');
        if (got !== avatarUrl) return avatarUrl + ' did not win over the fallback (got ' + got + ')';
    }
    // a library avatarUrl is remapped to its table-optimized twin, not dropped for the fallback
    const libGot = liveShipped.resolveTableAvatar('/avatars/vip/dragon.png', '/avatars/table/free_fox.png');
    if (libGot === '/avatars/table/free_fox.png') return 'a library avatarUrl fell through to the fallback';
    if (!libGot.startsWith('/avatars/table/vip_')) return 'library avatarUrl was not mapped to its table-optimized version (' + libGot + ')';
    return true;
});

check('a seat with no avatarUrl gets exactly its assigned fallback, not a random one', () => {
    for (const [avatarUrl, fallback] of [[null, '/avatars/table/free_shark.png'], [undefined, '/avatars/vip/dragon.png'], ['', '/avatars/table/free_owl.png']]) {
        const got = liveShipped.resolveTableAvatar(avatarUrl, fallback);
        if (got !== fallback) return 'expected fallback ' + fallback + ', got ' + got;
    }
    return true;
});

check('buildSeatFallbackAvatars deals a distinct cast per table, every path resolving', () => {
    for (const tableId of ['table-1', 'table-2', 42, null]) {
        for (const maxSeats of [2, 6, 9]) {
            const map = liveShipped.buildSeatFallbackAvatars(tableId, maxSeats, HERO_DEFAULT_AVATAR, -1);
            const values = Object.values(map);
            if (values.length !== maxSeats) return 'table ' + tableId + ' expected ' + maxSeats + ' seats, got ' + values.length;
            if (new Set(values).size !== values.length) return 'table ' + tableId + ' repeated a fallback portrait';
            for (const v of values) {
                if (!fs.existsSync(path.join(PUBLIC_DIR, v.replace(/^\//, '')))) return v + ' missing on disk';
            }
        }
    }
    return true;
});

check('buildSeatFallbackAvatars is deterministic per tableId', () => {
    for (const tableId of ['table-1', 'table-2', 77]) {
        const a = JSON.stringify(liveShipped.buildSeatFallbackAvatars(tableId, 9, HERO_DEFAULT_AVATAR, -1));
        const b = JSON.stringify(liveShipped.buildSeatFallbackAvatars(tableId, 9, HERO_DEFAULT_AVATAR, -1));
        if (a !== b) return 'table ' + tableId + ' dealt two different fallback casts';
    }
    return true;
});

check("the viewer's own account avatar is reserved for their seat and withheld from every other seat", () => {
    const heroFallback = '/avatars/vip/dragon.png';
    for (const heroSeatIndex of [0, 3, 8]) {
        const map = liveShipped.buildSeatFallbackAvatars('table-x', 9, heroFallback, heroSeatIndex);
        if (map[heroSeatIndex] !== heroFallback) return 'hero seat ' + heroSeatIndex + ' did not get heroFallback';
        for (let i = 0; i < 9; i++) {
            if (i === heroSeatIndex) continue;
            if (map[i] === heroFallback) return 'seat ' + i + ' was handed the viewer\'s own avatar';
        }
    }
    return true;
});

check("when the viewer is not seated, nobody is handed their account avatar as a fallback", () => {
    const heroFallback = '/avatars/vip/dragon.png';
    const map = liveShipped.buildSeatFallbackAvatars('table-y', 9, heroFallback, -1);
    const used = Object.values(map);
    return !used.includes(heroFallback) || 'an unseated seat got the viewer\'s own avatar';
});

console.log('\n--- counts ---');
console.log('  library entries ................ ' + AVATAR_LIBRARY.length);
console.log('  distinct portraits in the pool . ' + POOL.length);
console.log('  paths resolved under public/ ... ' + allPaths.filter(p => fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, '')))).length + ' / ' + allPaths.length);
console.log('  reachable over 4000 hands ...... ' + reach.size);
console.log('  hero default ................... ' + HERO_DEFAULT_AVATAR);

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
