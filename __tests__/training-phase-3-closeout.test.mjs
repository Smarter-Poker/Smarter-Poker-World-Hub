import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidence = JSON.parse(readFileSync(
  '.agent/audits/2026-08-31-training-phase-3-browser-evidence.json',
  'utf8',
));

test('Phase 3 production browser evidence closes the complete Hub matrix', () => {
  assert.equal(evidence.status, 'complete');
  assert.equal(evidence.production.healthStatus, 'ok');
  assert.equal(evidence.production.databaseStatus, 'ok');
  assert.equal(evidence.media.canonicalGames, 107);
  assert.equal(evidence.media.responsiveVariantFiles, 642);
  assert.equal(evidence.media.uniqueCanonicalArtworks, 107);
  assert.equal(evidence.browser.cards.desktopLaunchesPassed, 107);
  assert.equal(evidence.browser.cards.mobileLaunchesPassed, 107);
  assert.equal(evidence.browser.cards.totalLaunchesPassed, 214);
  assert.equal(evidence.browser.cards.launchFailures, 0);
  assert.equal(evidence.browser.cards.setupArtSelectedAvif, 214);
  assert.equal(evidence.browser.categories.desktopChecksPassed, 6);
  assert.equal(evidence.browser.categories.mobileChecksPassed, 6);
  assert.equal(evidence.browser.categories.failures, 0);
  assert.equal(evidence.browser.search.zeroResultRecoveryVisible, true);
  assert.equal(evidence.browser.search.resetRestoredAll107, true);

  for (const result of Object.values(evidence.browser.viewports)) {
    assert.equal(result.overflowPx, 0);
    assert.equal(result.layoutShiftTotal, 0);
    assert.equal(result.brokenImages, 0);
    assert.equal(result.scanlineElements, 0);
    assert.equal(result.consoleWarningsOrErrors, 0);
  }

  assert.equal(evidence.markerAudit.scopedTodoFixmeStubMockMatches, 0);
  assert.equal(evidence.markerAudit.unclassifiedFallbacks, 0);
  assert.equal(evidence.globalHeader.touched, false);
  assert.equal(evidence.globalHeader.matchingChangedFiles, 0);
});
