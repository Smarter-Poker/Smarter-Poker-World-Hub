import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const librarySource = read('src/data/TRAINING_LIBRARY.js');
const libraryBlock = librarySource.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const gameIds = [...libraryBlock.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
const artDirectory = join(ROOT, 'public/images/training/casino-realism');

test('all 107 canonical games have exactly one bespoke casino-realism render', () => {
    assert.equal(gameIds.length, 107);
    assert.equal(new Set(gameIds).size, 107);

    const files = readdirSync(artDirectory).filter((file) => file.endsWith('.webp')).sort();
    const expected = gameIds.map((id) => `${id}.webp`).sort();
    assert.deepEqual(files, expected);

    const hashes = files.map((file) => {
        const path = join(artDirectory, file);
        assert.ok(statSync(path).size > 25_000, `${file} must contain a production render`);
        return createHash('sha256').update(readFileSync(path)).digest('hex');
    });
    assert.equal(new Set(hashes).size, 107, 'no two games may reuse the same rendered file');
});

test('every catalog surface consumes the canonical artwork contract', () => {
    const imageMap = read('src/data/GAME_IMAGES.js');
    assert.match(imageMap, /TRAINING_LIBRARY\.map\(\(\{ id \}\)/);
    assert.match(imageMap, /casino-realism/);

    const hub = read('pages/hub/training.js');
    const category = read('pages/hub/training/category/[categoryId].js');
    const levelSelector = read('src/components/training/LevelSelector.tsx');
    const sessionModal = read('src/components/training/SessionSetupModal.jsx');
    const responsiveArt = read('src/components/training/TrainingGameArt.jsx');

    for (const [name, source] of Object.entries({ hub, category, levelSelector, sessionModal })) {
        assert.match(source, /getGameImage|TrainingGameArt/, `${name} must use the canonical game render`);
    }
    assert.match(responsiveArt, /getGameImageSources/);
    assert.match(responsiveArt, /type="image\/avif"/);
    assert.match(responsiveArt, /type="image\/webp"/);
});

test('arena preserves the Club Arena table visual contract', () => {
    const table = read('src/components/training/games/UniversalDynamicTable.jsx');
    const arena = read('pages/hub/training/arena/[gameId].js');
    const globalShell = read('src/styles/worlds/training.css');

    assert.match(table, /hub\/club-arena\/assets\/skin_carbon_ion/);
    assert.match(table, /hub\/club-arena\/cards\/backs\/table\/classic_red\.webp/);
    assert.match(table, /isHero && !isMobile[\s\S]*Math\.min\(ringSeat\.y, 88\)/);
    assert.match(table, /!isMobile && ringSeat\.y <= 6 \? 12/);
    assert.match(arena, /GodModeArena/);
    assert.match(globalShell, /\[data-training-art\]:not\(\[data-training-route='\/hub\/training\/arena\/\[gameId\]'\]\)/);
});
