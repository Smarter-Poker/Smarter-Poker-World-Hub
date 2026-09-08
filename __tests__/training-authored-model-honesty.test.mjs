import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const RAKE_FILE = 'pages/hub/training/custom-rake.js';
const RAKE_CURVE_FILE = 'pages/hub/training/rake-solutions.js';
const QRE_FILE = 'pages/hub/training/qre-explorer.js';
const BANKROLL_FILE = 'pages/hub/training/bankroll-coach.js';
const ENGINE_FILE = 'src/engines/DeterministicGTOEngine.js';
const ARENA_FILE = 'src/components/training/GodModeArena.jsx';
const RAKE = read(RAKE_FILE);
const RAKE_CURVE = read(RAKE_CURVE_FILE);
const QRE = read(QRE_FILE);
const BANKROLL = read(BANKROLL_FILE);
const ENGINE = read(ENGINE_FILE);
const ARENA = read(ARENA_FILE);

test('authored teaching-model pages parse as executable JSX', () => {
  for (const [file, source] of [
    [RAKE_FILE, RAKE],
    [RAKE_CURVE_FILE, RAKE_CURVE],
    [QRE_FILE, QRE],
    [BANKROLL_FILE, BANKROLL],
  ]) {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }), file);
  }
});

test('Bankroll Coach cannot convert partial Training evidence into promised cash savings', () => {
  assert.match(BANKROLL, /Verified Training Report/);
  assert.match(BANKROLL, /Unsupported Dollar-Per-Hour And Monthly Savings Projections Have Been Retired/);
  assert.match(BANKROLL, /\/hub\/training\/gto-reports\?source=bankroll-coach/);
  assert.doesNotMatch(BANKROLL, /dollarLossPerHour|dollarImpact|HANDS_PER_HOUR|Fix My Leaks/);
});

test('rake sensitivity viewer labels its authored values and discloses its exact toy curve', () => {
  assert.match(RAKE_CURVE, /Authored Toy Curve • Not Solver Or Strategy Data/);
  assert.match(RAKE_CURVE, /data-training-authority="authored-toy-model"/);
  assert.match(RAKE_CURVE, /Pressure Equals \(Rake Percentage ÷ 5\)/);
  assert.match(RAKE_CURVE, /It Is Not A Win-Rate Estimate, Range, Action, Or Recommendation/);
  assert.match(RAKE_CURVE, /AUTHORED_REFERENCE_FREQS/);
  assert.doesNotMatch(RAKE_CURVE, /BASELINE_FREQS|Optimal Frequencies|GTO:|pure GTO frequencies are optimal/);
  assert.doesNotMatch(RAKE_CURVE, /Tighten opening ranges|increase fold-to-3bet|reduce speculative calls/);
});

test('rake estimator discloses every model input and makes no strategy-frequency claim', () => {
  assert.match(RAKE, /Transparent Teaching Model • Not A Solver • Not Strategy Advice/);
  assert.match(RAKE, /A Pot Equal To 12% Of The Selected Stack/);
  assert.match(RAKE, /28 Hands Per Hour/);
  assert.match(RAKE, /35% Raked-Pot Share/);
  assert.match(RAKE, /It Does Not Solve A[\s\S]*Poker Tree, Produce EV, Or Prescribe Any Range Or Action/);
  assert.match(RAKE, /const capBB = safeCapDollars \/ safeBigBlind/);
  assert.doesNotMatch(RAKE, /openAdj|threeBetAdj|callAdj|cBetAdj|suitedAdj/);
  assert.doesNotMatch(RAKE, /Strategy Adjustments \(Vs No-Rake GTO\)|marginal opens become -EV|Bet more to deny equity/);
});

test('QRE explorer is an explicitly authored toy model, not solver or population authority', () => {
  assert.match(QRE, /Authored Illustration • No Solver Or Population Data/);
  assert.match(QRE, /dimensionless utility weights/);
  assert.match(QRE, /This Is A Mathematical Illustration Only/);
  assert.match(QRE, /It Does Not Describe A Real Player Pool/);
  assert.match(QRE, /AUTHORED_ACTIONS/);
  assert.match(QRE, /referenceFreq/);
  assert.match(QRE, /utility/);
  assert.doesNotMatch(QRE, /GTO_ACTIONS|gtoFreq|qreFreq|Perfect GTO|GTO \(Nash\)|Exploit Recommendation/);
  assert.doesNotMatch(QRE, /This population|Typical recreational pool|over-fold|under-bluff|Standard balanced strategy is optimal/);
});

test('session comparison fails closed instead of inventing an average-player baseline', () => {
  assert.match(ENGINE, /previousSessionData\.authority !== 'verified_training_session'/);
  assert.match(ENGINE, /const baseline = previousSessionData;/);
  assert.doesNotMatch(ENGINE, /accuracy: 60, total: 25, correct: 15, streak: 3, evLoss: 8\.5/);
  assert.doesNotMatch(
    ARENA,
    /Vs Average Player|Vs Previous Verified Session|ComparisonGauge|getSessionComparison\s*\(/,
    'GodModeArena must not restore a browser-rendered comparison panel or caller',
  );
});
