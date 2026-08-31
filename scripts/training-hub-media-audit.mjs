import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.agent/audits/2026-08-31-training-phase-3-hub-media.json');
const ART_ROOT = join(ROOT, 'public/images/training/casino-realism');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');
const bytes = (relativePath) => statSync(join(ROOT, relativePath)).size;
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const librarySource = read('src/data/TRAINING_LIBRARY.js');
const libraryBlock = librarySource.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const gameIds = [...libraryBlock.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
assert.equal(gameIds.length, 107, 'Training media audit requires exactly 107 canonical games');
assert.equal(new Set(gameIds).size, 107, 'canonical game IDs must be unique');

const variants = [
  { key: 'rootWebp', path: (id) => join(ART_ROOT, `${id}.webp`) },
  { key: 'avif640', path: (id) => join(ART_ROOT, '640', `${id}.avif`) },
  { key: 'webp640', path: (id) => join(ART_ROOT, '640', `${id}.webp`) },
  { key: 'avif960', path: (id) => join(ART_ROOT, '960', `${id}.avif`) },
  { key: 'webp960', path: (id) => join(ART_ROOT, '960', `${id}.webp`) },
  { key: 'avif1440', path: (id) => join(ART_ROOT, '1440', `${id}.avif`) },
];

const missing = [];
const totals = Object.fromEntries(variants.map(({ key }) => [key, 0]));
for (const id of gameIds) {
  for (const variant of variants) {
    const path = variant.path(id);
    if (!existsSync(path)) {
      missing.push(path.replace(`${ROOT}/`, ''));
      continue;
    }
    totals[variant.key] += statSync(path).size;
  }
}
assert.deepEqual(missing, [], `responsive Training art variants are missing: ${missing.join(', ')}`);

const rootHashes = gameIds.map((id) => hash(join(ART_ROOT, `${id}.webp`)));
assert.equal(new Set(rootHashes).size, 107, 'every canonical game must retain unique artwork');

const pageSource = read('pages/hub/training.js');
const artSource = read('src/components/training/TrainingGameArt.jsx');
const sourceContracts = {
  hubUsesResponsiveArt: /<TrainingGameArt/.test(pageSource),
  hubDoesNotImportDirectImage: !/import \{ getGameImage \}/.test(pageSource),
  responsiveAvif: /type="image\/avif"/.test(artSource),
  responsiveWebp: /type="image\/webp"/.test(artSource),
  responsiveSizes: /calc\(100vw - 24px\)/.test(pageSource),
  modernHero: /training-orb-hero\.avif/.test(pageSource) && /training-orb-hero\.webp/.test(pageSource),
  modernHud: /training-card-hud-overlay\.avif/.test(pageSource) && /training-card-hud-overlay\.webp/.test(pageSource),
  noScanline: !/sp-card-scanline|sp-card-scan/.test(pageSource),
};
assert.ok(Object.values(sourceContracts).every(Boolean), 'Training Hub responsive media source contract failed');

const supportingAssets = Object.fromEntries(
  ['training-orb-hero', 'training-card-hud-overlay'].map((name) => {
    const sizes = {
      png: bytes(`public/images/training/${name}.png`),
      webp: bytes(`public/images/training/${name}.webp`),
      avif: bytes(`public/images/training/${name}.avif`),
    };
    assert.ok(sizes.webp < sizes.png, `${name}.webp must be smaller than PNG`);
    assert.ok(sizes.avif < sizes.png, `${name}.avif must be smaller than PNG`);
    return [name, sizes];
  }),
);

const pctSaved = (baseline, optimized) => Math.round((1 - optimized / baseline) * 1000) / 10;
const report = {
  schemaVersion: 1,
  generatedBy: 'scripts/training-hub-media-audit.mjs',
  canonicalGames: gameIds.length,
  responsiveVariantFiles: gameIds.length * variants.length,
  uniqueCanonicalArtworks: new Set(rootHashes).size,
  sourceContracts,
  aggregateBytes: totals,
  estimatedCardArtSavingsPct: {
    avif640VsRootWebp: pctSaved(totals.rootWebp, totals.avif640),
    avif960VsRootWebp: pctSaved(totals.rootWebp, totals.avif960),
  },
  supportingAssets,
  missingVariants: missing,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--check')) {
  assert.equal(readFileSync(OUTPUT, 'utf8'), serialized, 'checked-in Training Hub media audit is stale');
} else {
  writeFileSync(OUTPUT, serialized);
}

process.stdout.write(JSON.stringify({
  success: true,
  output: OUTPUT.replace(`${ROOT}/`, ''),
  canonicalGames: report.canonicalGames,
  responsiveVariantFiles: report.responsiveVariantFiles,
  savings: report.estimatedCardArtSavingsPct,
}, null, 2));
process.stdout.write('\n');
