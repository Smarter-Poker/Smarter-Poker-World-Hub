import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    TRIVIA_INTRO_ART,
    TRIVIA_INTRO_ART_PHASE10_VERSION,
} from '../src/config/triviaIntroArt.mjs';

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(join(
    ROOT,
    'docs/trivia/evidence/p10-progress-intro-art-manifest.json',
), 'utf8'));
const FAMILIES = ['stats', 'leaderboard', 'achievements', 'settings'];

test('Phase 10 uses distinct mobile and desktop casino-realism compositions', () => {
    assert.equal(TRIVIA_INTRO_ART_PHASE10_VERSION, 'intro-v3');
    assert.deepEqual(Object.keys(manifest.families), FAMILIES);

    for (const family of FAMILIES) {
        const record = manifest.families[family];
        const art = TRIVIA_INTRO_ART[family];
        assert.ok(art, `${family} art is registered`);
        assert.equal(art.key, family);
        assert.notEqual(
            record.sources.mobile.sha256,
            record.sources.wide.sha256,
            `${family} mobile and desktop must be independently composed`,
        );
        assert.deepEqual(record.crops.mobile.ratio, [16, 10]);
        assert.deepEqual(record.crops.wide.ratio, [12, 5]);
        assert.match(art.preview, /^data:image\/webp;base64,/);
        assert.equal(art.mobile.width, 1440);
        assert.equal(art.mobile.height, 900);
        assert.equal(art.wide.width, 1440);
        assert.equal(art.wide.height, 600);
    }
});

test('every Phase 10 responsive asset exists and matches its immutable hash', () => {
    for (const [family, record] of Object.entries(manifest.families)) {
        for (const composition of ['mobile', 'wide']) {
            const files = record.crops[composition].files;
            assert.deepEqual([...new Set(files.map((file) => file.width))], [640, 960, 1440]);
            assert.deepEqual([...new Set(files.map((file) => file.format))].sort(), ['avif', 'webp']);
            assert.equal(files.length, 6);
            for (const file of files) {
                const absolute = join(ROOT, 'public/images/trivia/intro-v3', file.file);
                assert.ok(existsSync(absolute), `${family}/${file.file} exists`);
                const bytes = readFileSync(absolute);
                assert.equal(bytes.length, file.bytes);
                assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
                assert.ok(bytes.length < 500_000, `${file.file} stays within the hero asset budget`);
            }
        }
    }
});
