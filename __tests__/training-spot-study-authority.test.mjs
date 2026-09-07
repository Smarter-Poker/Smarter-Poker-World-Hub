import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'pages/hub/training/spot-trainer.js'), 'utf8');
const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/spot-drill.js'), 'utf8');

test('the answer-revealed solver utility cannot self-grade or author progress', () => {
  assert.match(source, /Solver Spot Study/);
  assert.match(source, /Answer-Revealed Study/);
  assert.match(source, /intentionally not scored/i);
  assert.doesNotMatch(source, /useTrainingFeedback|QuizAnswer|FeedbackCard/);
  assert.doesNotMatch(source, /savePracticeSession|saveSession\s*\(/);
  assert.doesNotMatch(source, /isCorrect|correctDrills|training:spot-drilled/);
  assert.doesNotMatch(source, /handleAnswer|selectedAnswer|setShowResult/);
});

test('solver spot loading is abortable and has a finite retry budget', () => {
  assert.match(source, /MAX_SPOT_RETRIES\s*=\s*3/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /requestAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /attempt\s*>=\s*MAX_SPOT_RETRIES/);
  assert.match(source, /Audited Solver Lookup Failed After/);
  assert.doesNotMatch(source, /setTimeout\(fetchSpot/);
});

test('spot study serves only identity-valid provenance-complete v2 artifacts', () => {
  assert.match(api, /strategy_matrix_v2/);
  assert.doesNotMatch(api, /['"]strategy_matrix['"]/);
  assert.match(api, /customSolverProvenanceIsComplete/);
  assert.match(api, /parseSolverScenarioHash/);
  assert.match(api, /v2ToAppMatrix/);
  assert.match(api, /quality_status['"],\s*['"]validated/);
  assert.match(api, /AUDITED_SOLVER_ARTIFACT_NOT_FOUND/);
  assert.match(api, /authoritativeTrainingProgress:\s*false/);
  assert.doesNotMatch(api, /Math\.random|generateOptions|ACTION_POOL/);
});

test('spot study labels solver action targets in big blinds instead of fake percentages', () => {
  assert.match(api, /action === 'c'.*facing_bet_bb/s);
  assert.match(api, /Call.*Check/s);
  assert.match(api, /`Bet To \$\{formatBbTarget\(bet\[1\]\)\} BB`/);
  assert.match(api, /`Raise To \$\{formatBbTarget\(raise\[1\]\)\} BB`/);
  assert.doesNotMatch(api, /Bet \$\{.*\}%|Raise \$\{.*\}%/);
});

test('spot study visibly exposes decision-node and provenance evidence', () => {
  assert.match(source, /Audited PioSOLVER Artifact/);
  assert.match(source, /Decision Node/);
  assert.match(source, /Current Pot/);
  assert.match(source, /Facing/);
  assert.match(source, /Machine/);
  assert.match(source, /Manifest/);
  assert.match(source, /Pipeline:/);
  assert.match(source, /Audited:/);
});
