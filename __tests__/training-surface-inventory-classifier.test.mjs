import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(execFileSync(
  process.execPath,
  ['scripts/training-surface-inventory.mjs'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
));

const classificationFor = (file, name) =>
  inventory.classifications.possibleUnwiredFunctions.find(
    (entry) => entry.file === file && entry.name === name,
  );

test('live Training inventory has no unresolved marker or function review', () => {
  assert.equal(inventory.counts.markerPhaseReview, 0);
  assert.equal(inventory.counts.functionPhaseReview, 0);
});

test('transport policy prefixes are inventoried separately from callable API routes', () => {
  assert.deepEqual(inventory.apiReferencePrefixes, [
    '/api/gto/',
    '/api/jarvis/',
    '/api/training/',
  ]);
  assert.deepEqual(inventory.gaps.missingApiPrefixDefinitions, []);

  const transport = inventory.sourceFiles.find(
    (entry) => entry.file === 'src/lib/training/boundedTrainingFetch.js',
  );
  assert.deepEqual(transport?.apiReferencePrefixes, inventory.apiReferencePrefixes);
  assert.deepEqual(transport?.apiReferences, []);
});

test('framework and audit-harness exports have explicit non-runtime dispositions', () => {
  for (const file of [
    'pages/hub/training/analyzer.js',
    'pages/hub/training/quiz-gauntlet.js',
  ]) {
    const entry = classificationFor(file, 'getServerSideProps');
    assert.equal(entry?.disposition, 'framework-entrypoint', file);
    assert.equal(entry?.review, 'accepted', file);
  }

  for (const [file, name, consumer] of [
    ['src/config/gameConfigs.js', 'getStackDepthNumber', 'scripts/game-catalog-check.js'],
    ['src/hooks/useGTOWScore.js', 'simulateGTOFrequencies', 'scripts/harness/suite-grading.js'],
    ['src/lib/training/handHistoryEntry.js', 'compactHandHistoryEntry', 'scripts/trainer-difficulty-check.js'],
    ['src/utils/trainingApiUtils.js', 'selectServedOptions', 'scripts/harness/suite-api.js'],
  ]) {
    const entry = classificationFor(file, name);
    assert.equal(entry?.disposition, 'test-or-audit-entrypoint', `${file}:${name}`);
    assert.equal(entry?.review, 'accepted', `${file}:${name}`);
    assert.deepEqual(entry?.externalReferenceFiles, [consumer], `${file}:${name}`);
  }

  const historicalStub = inventory.classifications.markers.find(
    (entry) => entry.file === 'src/lib/authUtils.js'
      && entry.kind === 'STUB'
      && entry.excerpt.includes('.ts stub shadowed'),
  );
  assert.equal(historicalStub?.disposition, 'historical-or-prohibition-comment');
  assert.equal(historicalStub?.review, 'accepted');

  for (const [file, name] of [
    ['src/config/hamburgerMenus.js', 'copyReferralLink'],
    ['src/config/worldMenuNavigation.js', 'getWorldMenuById'],
    ['src/config/worldMenuNavigation.js', 'getWorldMenuInventory'],
    ['src/lib/world-menu/navigationState.mjs', 'isWorldMenuHrefActive'],
  ]) {
    const entry = classificationFor(file, name);
    assert.equal(entry?.disposition, 'frozen-global-header-public-api', `${file}:${name}`);
    assert.equal(entry?.review, 'accepted', `${file}:${name}`);
  }
});

test('receipt placeholder words are classified as fail-closed secret guards', () => {
  const receiptMarkers = inventory.classifications.markers.filter(
    (entry) => entry.file === 'src/lib/training/gradingReceipt.mjs'
      || entry.file === 'src/lib/training/gradingReceiptSecret.mjs',
  );
  assert.equal(receiptMarkers.length, 5);
  for (const marker of receiptMarkers) {
    assert.equal(marker.disposition, 'secret-validation-guard');
    assert.equal(marker.review, 'accepted');
  }
});

test('reviewed unused exports stay removed instead of being allowlisted', () => {
  const removed = [
    ['pages/api/training/next-street.js', 'chooseDeterministicEducationalCard'],
    ['src/config/trainingConfig.js', 'checkLevelPassed'],
    ['src/config/trainingConfig.js', 'getDiamondReward'],
    ['src/stores/pageOverlayStore.js', 'closePageOverlay'],
    ['src/tutorials/index.js', 'listTutorialRoutes'],
    ['src/utils/trainingApiUtils.js', 'parseBoardFromHash'],
    ['src/utils/trainingApiUtils.js', 'extractPositionFromHash'],
  ];

  for (const [file, name] of removed) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(
      source,
      new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`),
      `${file}:${name}`,
    );
  }
});
