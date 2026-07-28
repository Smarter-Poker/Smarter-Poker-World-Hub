/**
 * AVATAR LIBRARY CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: a resolution sweep over every villain portrait the trainer felt
 * can draw. It reads the REAL avatar catalogue (src/data/AVATAR_LIBRARY.js) and
 * lifts the REAL selection functions out of UniversalDynamicTable.jsx -- they
 * are plain JS with no JSX in them, so they can be evaluated verbatim rather
 * than re-implemented here. Nothing below is a paraphrase of the shipping code;
 * a drift between the two would have to be a drift in the file itself.
 *
 * WHAT IT ASSERTS:
 *   - every image path the library can yield resolves to a file under public/
 *   - the pool is deduped BY PATH, so no two entries carry the same portrait
 *   - selection is DETERMINISTIC: one hand key always deals one cast
 *   - selection is DISTINCT: no two seats at a table share a face, and no
 *     villain wears hero's
 *   - the library, not a hardcoded nine, is what the table draws from
 *
 * WHY IT EXISTS: SeatAvatar degrades a missing asset to a monogram disc and
 * says nothing. A broken path is therefore invisible in review and nearly
 * invisible in play -- which is how vip_pirate.png stayed broken.
 *
 *   node scripts/avatar-library-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIBRARY_FILE = path.join(ROOT, 'src/data/AVATAR_LIBRARY.js');
const TABLE_FILE = path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx');
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

// eslint-disable-next-line no-new-func
const AVATAR_LIBRARY = new Function('return ' + extractArrayLiteral(librarySource, 'export const AVATAR_LIBRARY'))();

// -- lift the shipping selection code out of the component -------------------
const tableSource = fs.readFileSync(TABLE_FILE, 'utf8');

function extractFunction(source, name) {
    const marker = 'function ' + name + '(';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('could not find function ' + name + ' in ' + path.basename(TABLE_FILE));
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
    throw new Error('unterminated function ' + name);
}

const HERO_DEFAULT_AVATAR = (() => {
    const m = /const HERO_DEFAULT_AVATAR = '([^']+)'/.exec(tableSource);
    if (!m) throw new Error('HERO_DEFAULT_AVATAR not found in the table component');
    return m[1];
})();

// The pool builder is an IIFE in the component; take it verbatim too.
const poolLiteral = (() => {
    const start = tableSource.indexOf('const VILLAIN_AVATAR_POOL = (() => {');
    if (start < 0) throw new Error('VILLAIN_AVATAR_POOL not found in the table component');
    const end = tableSource.indexOf('})();', start);
    if (end < 0) throw new Error('unterminated VILLAIN_AVATAR_POOL');
    return tableSource.slice(start, end + 5);
})();

const shipped = new Function('AVATAR_LIBRARY', [
    poolLiteral,
    "const HERO_DEFAULT_AVATAR = " + JSON.stringify(HERO_DEFAULT_AVATAR) + ";",
    extractFunction(tableSource, 'hashHandKey'),
    extractFunction(tableSource, 'seededRandom'),
    extractFunction(tableSource, 'dealSeatAvatars'),
    'return { VILLAIN_AVATAR_POOL, dealSeatAvatars, hashHandKey };',
].join('\n'))(AVATAR_LIBRARY);

const POOL = shipped.VILLAIN_AVATAR_POOL;
const dealSeatAvatars = shipped.dealSeatAvatars;

console.log('\n=== The catalogue ===');

check('AVATAR_LIBRARY parsed and is non-trivial', () => {
    if (!Array.isArray(AVATAR_LIBRARY)) return 'not an array';
    return AVATAR_LIBRARY.length >= 70 || 'only ' + AVATAR_LIBRARY.length + ' entries';
});

check('the trainer draws from the library, not a hardcoded nine', () => {
    if (/const AVATARS = \[/.test(tableSource)) return 'the hardcoded AVATARS array is still there';
    if (!/from '\.\.\/\.\.\/\.\.\/data\/AVATAR_LIBRARY'/.test(tableSource)) return 'AVATAR_LIBRARY is not imported';
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

console.log('\n=== Selection is deterministic and distinct ===');

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

check('no Math.random anywhere in the portrait path', () => {
    // Comments stripped first -- the prose above dealSeatAvatars says the words
    // "Math.random" on purpose, and matching that would be matching the docs.
    const region = tableSource
        .slice(tableSource.indexOf('const VILLAIN_AVATAR_POOL'), tableSource.indexOf('// Seat portrait.'))
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

console.log('\n--- counts ---');
console.log('  library entries ................ ' + AVATAR_LIBRARY.length);
console.log('  distinct portraits in the pool . ' + POOL.length);
console.log('  paths resolved under public/ ... ' + allPaths.filter(p => fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, '')))).length + ' / ' + allPaths.length);
console.log('  reachable over 4000 hands ...... ' + reach.size);
console.log('  hero default ................... ' + HERO_DEFAULT_AVATAR);

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
