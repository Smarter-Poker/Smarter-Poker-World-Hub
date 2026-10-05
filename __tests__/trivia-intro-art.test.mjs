/**
 * TRIVIA UNIQUE ART PROGRAM (Phase 4, 2026-09-30)
 *
 * Non-negotiable requirement 2 of the Casino Realism plan: every game mode has
 * distinct artwork, and a lobby thumbnail is never reused as the central image
 * on its destination page. Until this change every destination printed its
 * own lobby thumbnail. This file pins the replacement so it cannot drift back:
 *
 *   - sixteen families (the lobby plus the fifteen registry modes) each have
 *     their own versioned art, rendered through ResponsiveModeArt on the page
 *     that is that family's destination; Phase 8 advances five families to
 *     intro-v2 while retaining the complete intro-v1 rollback set;
 *   - no destination source prints a modes-console-v1 thumbnail;
 *   - every crop ships 640/960/1440 in AVIF and WebP, content-hashed (the name
 *     carries the first 10 hex of the file's sha256), at its true size, and
 *     the folder holds nothing the manifest does not list;
 *   - the perceptual distinctness proof covers exactly the files that ship;
 *   - the primitive reserves its box, paints the art's own preview, hides a
 *     failed file, and loads lazily unless it is the page's single hero;
 *   - the service worker's Trivia art cache is named for the exact art set,
 *     so replaced or rejected art cannot survive on an installed client;
 *   - superseded Trivia art is gone and the prior manifest is kept.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MODES } from '../src/config/triviaModeRegistry.mjs';
import {
    TRIVIA_INTRO_ART,
    TRIVIA_INTRO_ART_PHASE8_VERSION,
    TRIVIA_INTRO_ART_VERSION,
} from '../src/config/triviaIntroArt.mjs';
import { triviaArtCacheName } from '../scripts/trivia-art/art-cache-name.mjs';
import { TRIVIA_THUMBNAIL_PREVIEWS } from '../src/config/triviaThumbnailPreviews.mjs';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const exists = (rel) => existsSync(join(ROOT, rel));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const constName = (id) => `TRIVIA_INTRO_ART_${id.toUpperCase().replace(/-/g, '_')}`;

const MODE_PAGE = 'pages/hub/trivia/[mode].js';
const STRATEGY = 'src/components/trivia/StrategyTrivia.jsx';
const DESTINATION = Object.freeze({
    lobby: 'src/components/trivia/TriviaLobby.jsx',
    daily: MODE_PAGE, arcade: MODE_PAGE, history: MODE_PAGE, rules: MODE_PAGE, pro: MODE_PAGE,
    mtt: STRATEGY, cash: STRATEGY, icm: STRATEGY, gto: STRATEGY,
    endless: 'pages/hub/trivia/endless.js',
    mixed: 'pages/hub/trivia/mixed.js',
    survival: 'pages/hub/trivia/survival-game.js',
    'time-attack': 'pages/hub/trivia/time-attack.js',
    pvp: 'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
    tournaments: 'pages/hub/trivia/tournaments.js',
});
const FAMILIES = ['lobby', ...TRIVIA_MODES.map((mode) => mode.id)];
const PHASE8_FAMILIES = new Set(['daily', 'mtt', 'cash', 'icm', 'gto']);
const CROPS = Object.freeze({ mobile: [16, 10], wide: [12, 5] });

function webpSize(buf) {
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
}

function parseSrcset(value) {
    return value.split(', ').map((entry) => {
        const [url, descriptor] = entry.split(' ');
        return { url, width: Number(descriptor.replace(/w$/, '')) };
    });
}

test('every family has its own destination art, rendered by its destination', () => {
    assert.equal(FAMILIES.length, 16);
    assert.deepEqual(Object.keys(TRIVIA_INTRO_ART).sort(), [...FAMILIES].sort());
    assert.deepEqual(Object.keys(DESTINATION).sort(), [...FAMILIES].sort());
    for (const id of FAMILIES) {
        const source = read(DESTINATION[id]);
        assert.match(source, new RegExp(`\\b${constName(id)}\\b`), `${DESTINATION[id]} uses ${constName(id)}`);
        assert.match(source, /<ResponsiveModeArt\b/, `${DESTINATION[id]} renders ResponsiveModeArt`);
        assert.equal(TRIVIA_INTRO_ART[id].key, id);
    }
});

test('no destination prints a lobby thumbnail as its central image', () => {
    for (const rel of new Set(Object.values(DESTINATION))) {
        if (rel === DESTINATION.lobby) continue;
        assert.doesNotMatch(read(rel), /\/images\/trivia\/modes-console-v1\//, `${rel} must not print a lobby thumbnail`);
    }
    const thumbnails = [
        ...TRIVIA_MODES.map((mode) => mode.image.split('?')[0]),
        '/cards/trivia.webp',
    ].map((url) => sha(readFileSync(join(ROOT, 'public', url))));
    for (const id of FAMILIES) {
        for (const crop of Object.keys(CROPS)) {
            for (const { url } of parseSrcset(TRIVIA_INTRO_ART[id][crop].webp)) {
                assert.ok(!thumbnails.includes(sha(readFileSync(join(ROOT, 'public', url)))), `${url} is not a thumbnail copy`);
            }
        }
    }
});

test('each crop ships 640/960/1440 AVIF and WebP, content-hashed, at its true size', () => {
    const listed = new Map([
        [TRIVIA_INTRO_ART_VERSION, new Set()],
        [TRIVIA_INTRO_ART_PHASE8_VERSION, new Set()],
    ]);
    for (const id of FAMILIES) {
        const art = TRIVIA_INTRO_ART[id];
        assert.match(art.preview, /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/, `${id} preview is an inline WebP`);
        assert.ok(art.preview.length < 1200, `${id} preview stays tiny (${art.preview.length} chars)`);
        for (const [crop, [rw, rh]] of Object.entries(CROPS)) {
            const c = art[crop];
            assert.equal(c.width, 1440);
            assert.equal(c.height, Math.round((1440 * rh) / rw));
            for (const format of ['avif', 'webp']) {
                const entries = parseSrcset(c[format]);
                assert.deepEqual(entries.map((e) => e.width), [640, 960, 1440], `${id} ${crop} ${format} widths`);
                for (const { url, width } of entries) {
                    const m = url.match(/^\/images\/trivia\/(intro-v1|intro-v2)\/([a-z-]+)-(mobile|wide)-(\d+)\.([0-9a-f]{10})\.(avif|webp)$/);
                    assert.ok(m, `${url} is a versioned, content-hashed Trivia art name`);
                    const expectedVersion = PHASE8_FAMILIES.has(id) ? TRIVIA_INTRO_ART_PHASE8_VERSION : TRIVIA_INTRO_ART_VERSION;
                    assert.equal(m[1], expectedVersion, `${id} uses ${expectedVersion}`);
                    assert.deepEqual([m[2], m[3], Number(m[4]), m[6]], [id, crop, width, format]);
                    const buf = readFileSync(join(ROOT, 'public', url));
                    assert.equal(sha(buf).slice(0, 10), m[5], `${url} name carries its own content hash`);
                    if (format === 'webp') {
                        assert.deepEqual(webpSize(buf), { width, height: Math.round((width * rh) / rw) }, `${url} true size`);
                    } else {
                        assert.equal(buf.toString('ascii', 4, 12), 'ftypavif', `${url} is AVIF`);
                    }
                    assert.ok(buf.length < 220_000, `${url} is sized sensibly (${buf.length} bytes)`);
                    listed.get(m[1]).add(url.split('/').pop());
                }
            }
            assert.ok(c.src.endsWith('.webp') && c.webp.includes(c.src), `${id} ${crop} fallback src is one of its WebP files`);
        }
    }
    const phase4Manifest = JSON.parse(read('docs/trivia/evidence/p4-art-intro-art-manifest.json'));
    const preservedV1 = Object.values(phase4Manifest.families)
        .flatMap((family) => Object.values(family.crops).flatMap((entry) => entry.files.map((file) => file.file)))
        .sort();
    assert.deepEqual(
        readdirSync(join(ROOT, 'public/images/trivia', TRIVIA_INTRO_ART_VERSION)).sort(),
        preservedV1,
        'intro-v1 remains byte-for-byte complete even after five destinations advance to intro-v2',
    );
    assert.deepEqual(
        readdirSync(join(ROOT, 'public/images/trivia', TRIVIA_INTRO_ART_PHASE8_VERSION)).sort(),
        [...listed.get(TRIVIA_INTRO_ART_PHASE8_VERSION)].sort(),
        'intro-v2 holds exactly the five Phase 8 families and no orphans',
    );
});

test('the Phase 4 distinctness proof remains bound to the preserved intro-v1 set', () => {
    const proof = JSON.parse(read('docs/trivia/evidence/p4-art-intro-art-proof.json'));
    assert.equal(proof.pass, true);
    assert.ok(proof.threshold_bits >= 12);
    // pHash (64-bit DCT) and a 256-bit dHash carry the criterion; the 64-bit
    // dHash is recorded only, since on centre-lit black-edged art its 9x8 grid
    // measures the shared lighting falloff rather than the picture.
    assert.ok(proof.min_phash >= proof.threshold_bits, `pHash min ${proof.min_phash}`);
    assert.ok(proof.min_dhash256 >= 4 * proof.threshold_bits, `dHash256 min ${proof.min_dhash256}`);
    assert.deepEqual(Object.keys(proof.shipped).sort(), [...FAMILIES].sort());
    const manifest = JSON.parse(read('docs/trivia/evidence/p4-art-intro-art-manifest.json'));
    for (const id of FAMILIES) {
        for (const crop of Object.keys(CROPS)) {
            const phase4File = manifest.families[id].crops[crop].files.find((file) => file.format === 'webp' && file.width === 1440);
            assert.equal(proof.shipped[id][crop], phase4File.sha256, `${id} ${crop} proof remains bound to the preserved intro-v1 file`);
        }
    }
    assert.equal(manifest.model_licence, 'Apache-2.0');
    for (const id of FAMILIES) {
        const family = manifest.families[id];
        assert.ok(Number.isInteger(family.seed) && family.prompt.startsWith('Subject: '), `${id} records prompt and seed`);
        assert.equal(sha(family.prompt), family.prompt_sha256);
    }
});

test('ResponsiveModeArt reserves its box, paints a preview, and is lazy unless it is the hero', () => {
    const jsx = read('src/components/trivia/console/ResponsiveModeArt.jsx');
    const css = read('src/components/trivia/console/ResponsiveModeArt.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(jsx, /export const TRIVIA_ART_WIDE_MEDIA = '\(min-width: 768px\)';/);
    assert.match(jsx, /loading=\{priority \? 'eager' : 'lazy'\}/);
    assert.match(jsx, /fetchpriority=\{priority \? 'high' : 'auto'\}/);
    assert.match(jsx, /aria-hidden=\{decorative \? 'true' : undefined\}/);
    assert.match(jsx, /onError=\{\(\) => setFailed\(true\)\}/);
    assert.match(css, /\.art \{[\s\S]*?aspect-ratio: 16 \/ 10;[\s\S]*?background-image: var\(--trivia-art-preview, none\);/);
    assert.match(css, /@media \(min-width: 768px\) \{\s*\.art \{\s*aspect-ratio: 12 \/ 5;/);
    assert.match(css, /\.art\[data-art-state='error'\] \.image \{\s*visibility: hidden;/);
    assert.doesNotMatch(css, /:hover/);
    assert.deepEqual([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]), ['#000'], 'schema ink only');
    for (const [id, rel] of Object.entries(DESTINATION)) {
        const tags = [...read(rel).matchAll(/<ResponsiveModeArt\b[\s\S]*?\/>/g)].map((m) => m[0]);
        const expectedBranches = id === 'tournaments' ? 2 : 1;
        assert.equal(tags.length, expectedBranches, `${rel} renders art only in its mutually exclusive hero branches`);
        if (id === 'lobby') assert.doesNotMatch(tags[0], /\bpriority\b/, 'the Daily header stays the lobby hero');
        else for (const tag of tags) assert.match(tag, /\bpriority\b/, `${rel}: the intro art is the page hero`);
    }
});

test('lobby card pictures paint their own preview, so a fast scroll never shows an empty well', () => {
    assert.deepEqual(Object.keys(TRIVIA_THUMBNAIL_PREVIEWS).sort(), TRIVIA_MIDDLE_MODES.map((m) => m.id).sort());
    for (const [id, preview] of Object.entries(TRIVIA_THUMBNAIL_PREVIEWS)) {
        assert.match(preview, /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/, `${id} preview is an inline WebP`);
        assert.ok(preview.length < 1200, `${id} preview stays tiny`);
    }
    assert.match(read(DESTINATION.lobby), /imagePreview=\{TRIVIA_THUMBNAIL_PREVIEWS\[mode\.id\]\}/);
    const card = read('src/components/trivia/console/TriviaFrameCard.jsx');
    assert.match(card, /'--trivia-art-preview': `url\("\$\{imagePreview\}"\)`/);
    assert.match(read('src/components/trivia/console/TriviaFrameCard.module.css'), /\.artWell \{[\s\S]*?background: #000 var\(--trivia-art-preview, none\) 50% 50% \/ cover no-repeat;/);
});

test('the service worker cache for Trivia art is named for the exact art that shipped', () => {
    const name = triviaArtCacheName(ROOT);
    const worker = read('worker/index.js');
    assert.ok(worker.includes(`const TRIVIA_ART_CACHE = '${name}';`),
        `worker/index.js must name ${name} (run node scripts/trivia-art/art-cache-name.mjs after changing any Trivia art)`);
    assert.match(worker, /await self\.clients\.claim\(\);\s*await retireStaleTriviaArt\(\);/);
    assert.match(worker, /name\.indexOf\('trivia-art-'\) === 0 && name !== TRIVIA_ART_CACHE/);
    assert.match(worker, /pathname\.indexOf\('\/images\/trivia\/'\) === 0/);
    const config = read('next.config.js');
    const rule = config.indexOf(`cacheName: '${name}'`);
    assert.ok(rule > 0, `next.config.js must name ${name}`);
    assert.ok(config.lastIndexOf("url.pathname.startsWith('/images/trivia/')", rule) > 0, 'the Trivia rule matches /images/trivia/');
    assert.ok(rule < config.indexOf("cacheName: 'static-assets'"), 'the Trivia rule precedes the generic image rule');
});

test('superseded Trivia art is gone from public/ and the prior manifest is kept', () => {
    for (const rel of ['public/images/trivia/modes-console-v1/daily.webp', 'public/images/trivia/modes-console-v1/arcade.webp', 'public/trivia/panels']) {
        assert.ok(!exists(rel), `${rel} was superseded and removed`);
    }
    const prior = JSON.parse(read('docs/trivia/evidence/p4-art-prior-intro-art.json'));
    assert.match(prior.commit, /^[0-9a-f]{40}$/);
    assert.equal(Object.keys(prior.families).length, 15);
});
