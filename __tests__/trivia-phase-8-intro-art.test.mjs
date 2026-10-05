import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    TRIVIA_INTRO_ART,
    TRIVIA_INTRO_ART_PHASE8_VERSION,
} from '../src/config/triviaIntroArt.mjs';

const ROOT = process.cwd();
const PHASE8_FAMILIES = ['daily', 'mtt', 'cash', 'icm', 'gto'];
const CROPS = Object.freeze({ mobile: [16, 10], wide: [12, 5] });
const POSITIVE_SCENE_ANCHORS = Object.freeze({
    daily: ['live-broadcast poker trivia table scene', 'professional broadcast lights', 'studio cameras'],
    mtt: ['multi-table tournament final-table decision scene', 'tournament clock assembly', 'empty tournament tables'],
    cash: ['high-limit private cash-game scene', 'occupied real poker table', 'recessed into the near rail'],
    icm: ['tournament bubble and final-table payout-pressure scene', 'visibly and dramatically unequal', 'vacant chair'],
    gto: ['real poker table connected to a machined analysis booth', 'physical indicator slats', 'no invented strategy values'],
});

const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => readFileSync(join(ROOT, rel));

function parseSrcset(value) {
    return value.split(', ').map((entry) => {
        const [url, descriptor] = entry.split(' ');
        return { url, width: Number(descriptor.replace(/w$/, '')) };
    });
}

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

test('the five Phase 8 routes use their own intro-v2 scene families', () => {
    assert.equal(TRIVIA_INTRO_ART_PHASE8_VERSION, 'intro-v2');
    for (const id of PHASE8_FAMILIES) {
        const entry = TRIVIA_INTRO_ART[id];
        assert.equal(entry.key, id);
        assert.match(entry.preview, /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
        for (const [crop, [rw, rh]] of Object.entries(CROPS)) {
            assert.deepEqual([entry[crop].width, entry[crop].height], [1440, Math.round((1440 * rh) / rw)]);
            for (const format of ['avif', 'webp']) {
                const sources = parseSrcset(entry[crop][format]);
                assert.deepEqual(sources.map(({ width }) => width), [640, 960, 1440]);
                for (const { url, width } of sources) {
                    const expected = new RegExp(`^/images/trivia/intro-v2/${id}-${crop}-${width}\\.([0-9a-f]{10})\\.${format}$`);
                    const match = url.match(expected);
                    assert.ok(match, `${url} is the ${id} ${crop} ${format} asset`);
                    const bytes = read(`public${url}`);
                    assert.equal(sha(bytes).slice(0, 10), match[1], `${url} carries its content hash`);
                    assert.ok(bytes.length < 220_000, `${url} remains a responsive web asset`);
                    if (format === 'webp') {
                        assert.deepEqual(webpSize(bytes), { width, height: Math.round((width * rh) / rw) });
                    } else {
                        assert.equal(bytes.toString('ascii', 4, 12), 'ftypavif');
                    }
                }
            }
            assert.equal(entry[crop].src, parseSrcset(entry[crop].webp)[1].url, `${id} ${crop} fallback is 960 WebP`);
        }
    }
});

test('Phase 8 provenance binds every source, prompt, crop, export and visual review', () => {
    const manifest = JSON.parse(read('docs/trivia/evidence/p8-core-intro-art-manifest.json'));
    assert.equal(manifest.version, TRIVIA_INTRO_ART_PHASE8_VERSION);
    assert.equal(manifest.generator, 'OpenAI built-in imagegen');
    assert.deepEqual(Object.keys(manifest.families), PHASE8_FAMILIES);

    const sourceHashes = new Set();
    const exported = new Set();
    for (const id of PHASE8_FAMILIES) {
        const family = manifest.families[id];
        const prompt = read(family.prompt_file).toString('utf8');
        const source = read(family.source_file);
        assert.equal(sha(prompt), family.prompt_sha256, `${id} prompt is immutable`);
        assert.equal(sha(source), family.source_sha256, `${id} source master is immutable`);
        assert.ok(family.source_dimensions[0] >= 1536 && family.source_dimensions[1] >= 887, `${id} retains its full-resolution source`);
        assert.match(family.generation_output, /^exec-[0-9a-f-]+\.png$/);
        assert.match(family.visual_review, /^Accepted:/, `${id} records the inspected result`);
        for (const anchor of POSITIVE_SCENE_ANCHORS[id]) assert.ok(prompt.includes(anchor), `${id} prompt preserves ${anchor}`);
        sourceHashes.add(family.source_sha256);

        for (const [crop, [rw, rh]] of Object.entries(CROPS)) {
            assert.deepEqual(family.crops[crop].ratio, [rw, rh]);
            assert.equal(family.crops[crop].files.length, 6);
            for (const file of family.crops[crop].files) {
                const bytes = read(`public/images/trivia/intro-v2/${file.file}`);
                assert.equal(bytes.length, file.bytes);
                assert.equal(sha(bytes), file.sha256);
                assert.equal(file.file.split('.')[1], file.sha256.slice(0, 10));
                exported.add(file.file);
            }
        }
    }
    assert.equal(sourceHashes.size, PHASE8_FAMILIES.length, 'every route has a different generated source master');
    assert.deepEqual(
        readdirSync(join(ROOT, 'public/images/trivia/intro-v2')).sort(),
        [...exported].sort(),
        'the versioned delivery directory contains exactly the manifest exports',
    );
});

test('the Phase 8 scene set cannot collapse back into one reusable still-life', () => {
    const largestWebpHashes = PHASE8_FAMILIES.flatMap((id) =>
        Object.keys(CROPS).map((crop) => sha(read(`public${parseSrcset(TRIVIA_INTRO_ART[id][crop].webp).at(-1).url}`))),
    );
    assert.equal(new Set(largestWebpHashes).size, PHASE8_FAMILIES.length * 2);

    const prior = JSON.parse(read('docs/trivia/evidence/p4-art-intro-art-manifest.json'));
    for (const id of PHASE8_FAMILIES) {
        const current = new Set(Object.keys(CROPS).map((crop) => sha(read(`public${parseSrcset(TRIVIA_INTRO_ART[id][crop].webp).at(-1).url}`))));
        for (const crop of Object.keys(CROPS)) {
            const old = prior.families[id].crops[crop].files.find((file) => file.format === 'webp' && file.width === 1440);
            assert.ok(!current.has(old.sha256), `${id} no longer reuses its generic intro-v1 composition`);
        }
    }
});
