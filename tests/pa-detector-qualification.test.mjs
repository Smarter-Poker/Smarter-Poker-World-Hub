/**
 * Personal Assistant Section 3 — Deterministic Leak Engine Qualification,
 * Advice Basis & Skill-Matched Practice Verification Suite
 *
 * Independently derived fixtures proving all 6 mandatory qualification cases:
 *   (a) Supported recurring mistake fires, cites right decisions, produces rule-consistent advice
 *   (b) Similar-looking sound play stays quiet when position/price/stack/board/action makes play defensible
 *   (c) One poor decision or too few opportunities explains the hand and accurately states evidence count
 *       without claiming a recurring leak
 *   (d) Same decision, different runout/outcome -> identical grade
 *   (e) Missing metric, unsupported game, or failed solver lookup -> explicit limitation,
 *       zero unsupported optimal play or EV loss claim
 *   (f) Same inputs & rule version rerun after interruption -> reproducible, zero duplicates
 * Plus:
 *   - Complete detector matrix qualification across all 16 LEAK_PATTERNS, 11 CA_HAND_FACTS_DETECTORS,
 *     and solver decision evidence groups
 *   - Skill-matched "Practice This" mapping across river / turn / flop / preflop leak families
 *     (specifically proving a river call facing a large bet maps to river defense/bluff-catching practice,
 *     never a generic preflop drill)
 *   - Strictly distinct progression states (practice completion vs mastery evidence vs live-table verification)
 *     and exactly-once idempotency key rules for Diamond reward eligibility
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DETECTOR_RULE_VERSION,
  EVIDENCE_BASIS,
  LEAK_PATTERNS,
  buildLeakTakeaway,
  classifyEvidenceBasis,
  classifyHandAuditEligibility,
  classifyLeakStatus,
  generateExplanation,
  generateLeakFix,
  getWhyLeakingEV,
  toUserLeakPersistenceRow,
} from '../src/lib/personal-assistant/leakRecord.js';

import {
  CA_HAND_FACTS_DETECTORS,
  CA_HAND_FACTS_RULE_VERSION,
  analyzeCaHandFacts,
} from '../src/lib/personal-assistant/caHandFactsAnalyzer.mjs';

import {
  SOLVER_EVIDENCE_RULE_VERSION,
  aggregateSolverLeaks,
  gradeCanonicalPolicyDecision,
  gradeSolverDecision,
  qualifySolverDecisionSample,
  resolveSolverRecommendedDrill,
  summarizeSolverDecisionGroups,
} from '../src/lib/training/solverDecisionEvidence.js';

import {
  RETIRE_AFTER_STRONG,
  gradeReview,
  initialReview,
  isGameMismatchedForStreet,
  leakToDrill,
  leakToTrainingGame,
  resolveSkillMatchedDrillGame,
} from '../src/lib/sandbox/leakReview.js';

import {
  DETECTOR_QUALIFICATION_MATRIX,
  LIVE_FIX_MAX_MISTAKE_RATE,
  MIN_LIVE_VERIFY_HANDS,
  buildAdviceExplanation,
  buildCoachingSnapshot,
  buildFunnelMetrics,
  buildProgressTimeline,
  buildRepresentativeHandSummary,
  buildSampleQualification,
  buildTrainingPlan,
  dedupeDecisions,
  dedupeLeaks,
  dedupeReviews,
  evidenceFingerprint,
  qualifyDetectorFinding,
  rankCoachingPriorities,
  receiptFingerprint,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';

const PREFLOP_ONLY_GAMES = new Set([
  'cash-001', 'cash-006', 'cash-007', 'cash-008', 'cash-010', 'cash-018',
  'mtt-001', 'mtt-002', 'mtt-003', 'mtt-004', 'mtt-005', 'mtt-006',
  'mtt-007', 'mtt-008', 'mtt-009', 'mtt-010', 'mtt-011', 'mtt-012',
  'mtt-013', 'mtt-014', 'mtt-015', 'mtt-016', 'mtt-017', 'mtt-018',
  'mtt-019', 'mtt-020', 'mtt-022', 'mtt-023',
]);

// ─── 1. Full Detector Matrix Audit ───────────────────────────────────────────

test('Detector Matrix: every active detector across LEAK_PATTERNS (16), ca_hand_facts (11), and solver_decision_evidence is cataloged with ruleVersion, basis, threshold, and skill-matched practice drill', () => {
  const leakPatternIds = Object.keys(LEAK_PATTERNS);
  const handFactsIds = Object.keys(CA_HAND_FACTS_DETECTORS);
  assert.equal(leakPatternIds.length, 16, 'Expected 16 active LEAK_PATTERNS detectors');
  assert.equal(handFactsIds.length, 11, 'Expected 11 active CA_HAND_FACTS_DETECTORS');
  assert.equal(DETECTOR_QUALIFICATION_MATRIX.length, 16 + 11 + 1);

  const validBases = new Set(Object.values(EVIDENCE_BASIS));

  for (const entry of DETECTOR_QUALIFICATION_MATRIX) {
    assert.ok(entry.id && typeof entry.id === 'string', `Missing detector id`);
    assert.ok(['leak_patterns', 'ca_hand_facts', 'solver_decision_evidence'].includes(entry.family), `Invalid family for ${entry.id}`);
    assert.ok(entry.ruleVersion && typeof entry.ruleVersion === 'string', `Missing ruleVersion for ${entry.id}`);
    assert.ok(entry.gameContext && typeof entry.gameContext === 'string', `Missing gameContext for ${entry.id}`);
    assert.ok(entry.street && typeof entry.street === 'string', `Missing street for ${entry.id}`);
    assert.ok(entry.spotType && typeof entry.spotType === 'string', `Missing spotType for ${entry.id}`);
    assert.ok(Array.isArray(entry.inputs) && entry.inputs.length > 0, `Missing inputs for ${entry.id}`);
    assert.ok(entry.opportunityKey && typeof entry.opportunityKey === 'string', `Missing opportunityKey for ${entry.id}`);
    assert.ok(Number.isFinite(entry.minSamples) && entry.minSamples >= 5, `Invalid minSamples for ${entry.id}`);
    assert.ok(entry.evidenceSource && typeof entry.evidenceSource === 'string', `Missing evidenceSource for ${entry.id}`);
    assert.ok(entry.recommendation && typeof entry.recommendation === 'string', `Missing recommendation for ${entry.id}`);
    assert.ok(entry.practiceMapping && typeof entry.practiceMapping === 'object', `Missing practiceMapping for ${entry.id}`);

    if (entry.family !== 'solver_decision_evidence') {
      assert.ok(validBases.has(entry.evidenceBasis), `Invalid evidenceBasis ${entry.evidenceBasis} for ${entry.id}`);
    }
  }

  // Every LEAK_PATTERNS entry must produce pattern-specific explanation, EV rationale, fix, and takeaway
  for (const [patternKey, pattern] of Object.entries(LEAK_PATTERNS)) {
    const explanation = generateExplanation(patternKey, 68, pattern.optimalRange);
    const whyEv = getWhyLeakingEV(patternKey);
    const fix = generateLeakFix({ leakType: patternKey, currentFrequency: 68, optimalRange: pattern.optimalRange });
    const takeaway = buildLeakTakeaway({
      leakType: patternKey,
      title: pattern.title,
      leakCategory: pattern.category,
      street: pattern.street,
      spotType: pattern.spotType,
      currentFrequency: 68,
      optimalFrequency: (pattern.optimalRange[0] + pattern.optimalRange[1]) / 2,
      fixSuggestion: pattern.fixSuggestion,
    });

    assert.doesNotMatch(explanation, /Your frequency of 68% deviates from optimal/, `${patternKey} fell back to generic explanation`);
    assert.doesNotMatch(whyEv, /This pattern deviates significantly from GTO play/, `${patternKey} fell back to generic whyLeakingEV`);
    assert.ok(typeof fix === 'string' && fix.length > 20, `${patternKey} missing specific fix string`);
    assert.doesNotMatch(fix, /Review the opportunities behind this frequency/, `${patternKey} fell back to generic fix`);
    assert.ok(takeaway.whatYouAreDoing && takeaway.where && takeaway.whatToDoNextTime && takeaway.summary, `${patternKey} incomplete takeaway`);
  }
});

// ─── 2. Mandatory Case (a): Supported Recurring Mistake Fires ────────────────

test('Case (a): supported recurring mistakes fire across ca_hand_facts, solverDecisionEvidence, and leakRecord, citing right decisions and rule-consistent advice', () => {
  // (a.1) ca_hand_facts recurring River Barrel & Blind Defense leaks
  const cashFactRows = [];
  for (let i = 1; i <= 35; i += 1) {
    cashFactRows.push({
      hand_id: `ca-cash-hand-${i}`,
      game_type: 'cash',
      game_variant: 'nlhe',
      is_tournament: false,
      big_blind: 2,
      position: i <= 25 ? 'BB' : 'BTN',
      effective_stack_bb_at_deal: 100,
      vpip: i % 4 === 0,
      pfr: i % 5 === 0,
      blind_defense_opportunity: true,
      defended_blind: i <= 7, // 7 / 35 = 20% (below 38%-54% cash baseline)
      barrel_river_opportunity: i <= 24,
      barreled_river: i <= 4, // 4 / 24 = 16.7% (below 42%-58% cash baseline)
      af_bet_raise_actions: 2,
      af_call_actions: 1,
    });
  }

  const factsResult = analyzeCaHandFacts(cashFactRows);
  const blindLeak = factsResult.detectedLeaks.find(l => l.leak_type === 'cash_blind_defense_too_tight');
  const riverBarrelLeak = factsResult.detectedLeaks.find(l => l.leak_type === 'cash_river_barrel_too_rare_facts');

  assert.ok(blindLeak, 'Expected cash_blind_defense_too_tight to fire on 20% blind defense over 35 opportunities');
  assert.equal(blindLeak.rule_version, CA_HAND_FACTS_RULE_VERSION);
  assert.equal(blindLeak.evidence_basis, EVIDENCE_BASIS.DETERMINISTIC_RULE);
  assert.equal(blindLeak.total_samples, 35);
  assert.equal(blindLeak.recommended_drill, 'cash-003');
  assert.equal(blindLeak.representative_hand_id, 'ca-cash-hand-8');
  assert.ok(Array.isArray(blindLeak.sample_hand_ids) && blindLeak.sample_hand_ids.includes('ca-cash-hand-8'));
  assert.ok(blindLeak.takeaway?.whatYouAreDoing && blindLeak.takeaway?.where && blindLeak.takeaway?.whatToDoNextTime);

  assert.ok(riverBarrelLeak, 'Expected cash_river_barrel_too_rare_facts to fire on 16.7% river barrel over 24 opportunities');
  assert.equal(riverBarrelLeak.rule_version, CA_HAND_FACTS_RULE_VERSION);
  assert.equal(riverBarrelLeak.evidence_basis, EVIDENCE_BASIS.DETERMINISTIC_RULE);
  assert.equal(riverBarrelLeak.street, 'river');
  assert.equal(riverBarrelLeak.recommended_drill, 'cash-012');
  assert.equal(riverBarrelLeak.representative_hand_id, 'ca-cash-hand-5');

  // (a.2) Solver decision evidence recurring river defense mistake
  const riverDecisions = Array.from({ length: 8 }, (_, idx) => {
    const isMistake = idx < 6;
    return {
      id: `dec-riv-${idx + 1}`,
      hand_external_id: `club-arena:riv-hand-${idx + 1}`,
      decision_key: `river:bb:facing_bet:${idx + 1}`,
      evidence_scope: 'club_arena',
      game_id: 'cash-hand-audit',
      street: 'river',
      hero_position: 'BB',
      villain_position: 'BTN',
      spot_type: 'river_facing_large_bet',
      hero_hand: isMistake ? 'KdJc' : 'AhKh',
      board_cards: ['Ks', '9d', '4c', '2h', '7s'],
      player_action: isMistake ? 'fold' : 'call',
      solver_action: 'call',
      selected_frequency: isMistake ? 0.08 : 0.88,
      optimal_frequency: 0.88,
      ev_loss: isMistake ? (idx === 0 ? 1.45 : 0.95) : 0,
      ev_loss_measured: true,
      solver_verified: true,
      solver_source: 'pio_database|hand-audit-v3',
      classification: isMistake ? 'mistake' : 'best',
      stack_depth_bb: 100,
      hand_played_at: `2026-11-20T12:0${idx}:00.000Z`,
      audited_at: `2026-11-20T12:1${idx}:00.000Z`,
    };
  });

  const solverLeaks = aggregateSolverLeaks(riverDecisions, { minSamples: 5, minMistakes: 3 });
  assert.equal(solverLeaks.length, 1, 'Expected recurring river solver leak to fire');
  const riverSolverLeak = solverLeaks[0];
  assert.equal(riverSolverLeak.rule_version, SOLVER_EVIDENCE_RULE_VERSION);
  assert.equal(riverSolverLeak.evidence_basis, EVIDENCE_BASIS.EXACT_SOLVER_MATCH);
  assert.equal(riverSolverLeak._sample_count, 8);
  assert.equal(riverSolverLeak._mistake_count, 6);
  assert.equal(riverSolverLeak.ev_loss_measured, true);
  assert.equal(riverSolverLeak.recommended_drill, 'cash-005', 'River facing bet must map to Bluff Catcher (cash-005)');
  assert.equal(riverSolverLeak.representative_decision?.handExternalId, 'club-arena:riv-hand-1');

  // Verify coachingIntelligence qualification & snapshot enrichment for this finding
  const qualified = qualifyDetectorFinding({ leak: riverSolverLeak, decisions: riverDecisions });
  assert.equal(qualified.status, 'recurring_leak_qualified');
  assert.equal(qualified.isRecurringLeak, true);
  assert.equal(qualified.evidenceBasis, EVIDENCE_BASIS.EXACT_SOLVER_MATCH);
  assert.equal(qualified.ruleVersion, SOLVER_EVIDENCE_RULE_VERSION);
  assert.equal(qualified.representativeHand.handId, 'riv-hand-1');
  assert.equal(qualified.representativeHand.street, 'river');
  assert.equal(qualified.representativeHand.playerAction, 'fold');
  assert.equal(qualified.representativeHand.solverAction, 'call');
  assert.equal(qualified.representativeHand.evLossBB, 1.45);
  assert.equal(qualified.representativeHand.evLossMeasured, true);
  assert.equal(qualified.sampleCounts.mistakes, 6);
  assert.equal(qualified.sampleCounts.opportunities, 8);
  assert.equal(qualified.sampleCounts.sufficientSample, true);
  assert.equal(qualified.practiceTarget.trainingGameId, 'cash-005');
  assert.equal(qualified.practiceTarget.street, 'River');
  assert.ok(qualified.takeaway.whatYouAreDoing && qualified.takeaway.where && qualified.takeaway.whatToDoNextTime);

  // Verify DB persistence row strips non-schema enrichment keys cleanly
  const dbRow = toUserLeakPersistenceRow(riverSolverLeak, { userId: '00000000-0000-4000-8000-000000000001' });
  assert.equal(dbRow.leak_type, riverSolverLeak.leak_type);
  assert.equal(dbRow.recommended_drill, 'cash-005');
  assert.equal('takeaway' in dbRow, false);
  assert.equal('representative_decision' in dbRow, false);
  assert.equal('rule_version' in dbRow, false);
});

// ─── 3. Mandatory Case (b): Sound Play Stays Quiet ───────────────────────────

test('Case (b): similar-looking sound play stays quiet when stack depth, position, price, board, or action makes play defensible', () => {
  // (b.1) Short-stack tournament (<20bb): 35% fold-to-3bet and 55% blind defense are inside <20bb baselines
  // (even though 35% fold-to-3bet would be outside 100bb cash [45, 58] and 55% blind defense would be high in cash)
  // Also Hero checks postflop frequently (pot control) with 3 bets and 1 call -> call-only AF = 3.0 (sound, not passive!)
  const soundShortStackMttRows = Array.from({ length: 45 }, (_, idx) => ({
    hand_id: `sound-mtt-${idx + 1}`,
    game_type: 'tournament',
    game_variant: 'nlhe',
    format: 'tournament',
    big_blind: 200,
    position: idx < 30 ? 'BB' : 'UTG',
    effective_stack_bb_at_deal: 14, // <20bb short-stack bucket
    vpip: idx < 11, // 11 / 45 = 24.4% (inside [18, 32])
    pfr: idx < 9,
    three_bet_opportunity: true,
    three_bet: idx < 7, // 7 / 45 = 15.6% (inside [11, 22])
    blind_defense_opportunity: idx < 30,
    defended_blind: idx < 17, // 17 / 30 = 56.7% (inside [50, 72] for <20bb!)
    faced_three_bet: idx < 30,
    folded_to_three_bet: idx < 11, // 11 / 30 = 36.7% (inside [30, 50] for <20bb!)
    af_bet_raise_actions: idx < 30 ? 3 : 0,
    af_call_actions: idx < 30 ? 1 : 0,
    passive_actions_postflop: 8, // Many sound pot-control checks must NEVER count as passive calls!
    af_turn_river_bet_raise: 2,
    af_turn_river_calls: 1,
  }));

  const mttAnalysis = analyzeCaHandFacts(soundShortStackMttRows);
  assert.equal(
    mttAnalysis.detectedLeaks.length,
    0,
    `Expected zero leaks for sound <20bb tournament play and pot-control checks, got: ${mttAnalysis.detectedLeaks.map(l => l.leak_type).join(', ')}`,
  );

  // (b.2) Solver decisions where Hero folds on the river facing an overbet when folding IS solver-optimal,
  // or calls a mixed-frequency bluff-catch action (>= 20% solver frequency -> 'best')
  const soundRiverQuestion = {
    source: 'PIO_DATABASE',
    dataQuality: 'SOLVER_EXACT',
    correctAnswer: 'fold',
    gtoFrequencies: { fold: 75, call: 25, raise: 0 },
    evData: { actionEVsMeasured: true, actionEVs: { fold: 0, call: 0, raise: -2.4 } },
  };
  const soundRiverDecisions = Array.from({ length: 10 }, (_, idx) => {
    const selectedAction = idx % 2 === 0 ? 'fold' : 'call';
    const grade = gradeSolverDecision(soundRiverQuestion, selectedAction);
    return {
      id: `sound-riv-${idx + 1}`,
      hand_external_id: `club-arena:sound-riv-${idx + 1}`,
      decision_key: `river:bb:overbet_defense:${idx + 1}`,
      evidence_scope: 'club_arena',
      game_id: 'cash-hand-audit',
      street: 'river',
      hero_position: 'BB',
      spot_type: 'facing_overbet',
      player_action: selectedAction,
      solver_action: 'fold',
      selected_frequency: grade.selectedFrequency,
      optimal_frequency: grade.optimalFrequency,
      ev_loss: grade.evLoss,
      ev_loss_measured: grade.evLossMeasured,
      solver_verified: true,
      solver_source: 'pio_database|hand-audit-v3',
      classification: grade.classification,
    };
  });

  assert.ok(soundRiverDecisions.every(d => d.classification === 'best'), 'Defensible mixed/optimal folds and calls must grade as best');
  const soundSolverLeaks = aggregateSolverLeaks(soundRiverDecisions, { minSamples: 5, minMistakes: 3 });
  assert.equal(soundSolverLeaks.length, 0, 'Defensible river play must never fire a recurring leak');

  // (b.3) Stat detector within optimal range stays inactive (classifyLeakStatus returns null)
  for (const [patternKey, pattern] of Object.entries(LEAK_PATTERNS)) {
    const midOptimal = (pattern.optimalRange[0] + pattern.optimalRange[1]) / 2;
    const status = classifyLeakStatus(null, midOptimal, pattern.optimalRange);
    assert.equal(status, null, `${patternKey} at optimal midpoint ${midOptimal} must stay inactive`);
  }
});

// ─── 4. Mandatory Case (c): Single Poor Decision / Insufficient Sample ───────

test('Case (c): one poor decision or too few opportunities explains the hand and accurately states evidence count without claiming a recurring leak', () => {
  // (c.1) Single poor river call across 6 opportunities (1 mistake / 6 opportunities)
  const singleMistakeDecisions = Array.from({ length: 6 }, (_, idx) => {
    const isOneBadCall = idx === 0;
    return {
      id: `single-err-${idx + 1}`,
      hand_external_id: `club-arena:hand-single-${idx + 1}`,
      decision_key: `river:btn:facing_bet:${idx + 1}`,
      evidence_scope: 'club_arena',
      game_id: 'cash-hand-audit',
      street: 'river',
      hero_position: 'BTN',
      spot_type: 'facing_bet',
      hero_hand: isOneBadCall ? '9h8h' : 'AsKs',
      board_cards: ['Ah', 'Td', '4c', '2s', '7d'],
      player_action: 'call',
      solver_action: isOneBadCall ? 'fold' : 'call',
      selected_frequency: isOneBadCall ? 0.02 : 0.92,
      optimal_frequency: 0.92,
      ev_loss: isOneBadCall ? 1.35 : 0,
      ev_loss_measured: true,
      solver_verified: true,
      solver_source: 'pio_database|hand-audit-v3',
      classification: isOneBadCall ? 'blunder' : 'best',
    };
  });

  // Must NOT emit a recurring leak
  const recurringFromSingle = aggregateSolverLeaks(singleMistakeDecisions, { minSamples: 5, minMistakes: 3 });
  assert.equal(recurringFromSingle.length, 0, 'A single poor decision must never emit a recurring solver leak');

  // Qualification explains the hand and states exact 1 / 6 count
  const singleQual = qualifyDetectorFinding({ decisions: singleMistakeDecisions });
  assert.equal(singleQual.status, 'single_hand_observation');
  assert.equal(singleQual.isRecurringLeak, false);
  assert.equal(singleQual.sampleCounts.mistakes, 1);
  assert.equal(singleQual.sampleCounts.opportunities, 6);
  assert.equal(singleQual.sampleCounts.minRequiredSamples, 5);
  assert.equal(singleQual.sampleCounts.minRequiredMistakes, 3);
  assert.equal(singleQual.optimalAction, 'fold');
  assert.equal(singleQual.evLossBB, 1.35);
  assert.match(singleQual.handExplanation, /1 mistake(?:s)? (?:in|across) 6/i);

  // (c.2) Too few opportunities (2 mistakes across 3 opportunities, below minSamples=5)
  const tooFewDecisions = singleMistakeDecisions.slice(0, 3).map((row, idx) => (
    idx < 2 ? { ...row, classification: 'mistake', solver_action: 'fold', ev_loss: 0.8 } : row
  ));
  assert.equal(aggregateSolverLeaks(tooFewDecisions, { minSamples: 5, minMistakes: 3 }).length, 0);

  const insufficientQual = qualifyDetectorFinding({ decisions: tooFewDecisions });
  assert.equal(insufficientQual.status, 'insufficient_sample');
  assert.equal(insufficientQual.isRecurringLeak, false);
  assert.equal(insufficientQual.sampleCounts.mistakes, 2);
  assert.equal(insufficientQual.sampleCounts.opportunities, 3);
  assert.match(insufficientQual.handExplanation, /2 mistake(?:s)? (?:in|across) 3/i);

  // (c.3) ca_hand_facts below minOpportunities threshold (e.g. 12 squeeze opportunities < 20 required)
  const underSampledSqueezeRows = Array.from({ length: 12 }, (_, idx) => ({
    hand_id: `under-sqz-${idx + 1}`,
    game_type: 'cash',
    game_variant: 'nlhe',
    is_tournament: false,
    big_blind: 2,
    position: 'BB',
    effective_stack_bb_at_deal: 100,
    squeeze_opportunity: true,
    squeezed: false, // 0% squeeze, but only 12 opportunities (< 20 minOpportunities)
  }));
  const underSampledFacts = analyzeCaHandFacts(underSampledSqueezeRows);
  assert.equal(
    underSampledFacts.detectedLeaks.some(l => l.leak_type.includes('squeeze_too_rare')),
    false,
    'Squeeze detector must stay quiet when opportunities (12) are below minOpportunities (20)',
  );
});

// ─── 5. Mandatory Case (d): Decision Grade Runout-Invariance ─────────────────

test('Case (d): same decision with different subsequent runout or showdown outcome produces an identical grade and EV loss', () => {
  // Flop decision on As 7d 2c: Hero checks back in position when c-betting 33% pot is optimal
  const baseFlopQuestion = {
    source: 'PIO_DATABASE',
    dataQuality: 'SOLVER_EXACT',
    correctAnswer: 'bet_33',
    gtoFrequencies: { bet_33: 84, check: 14, bet_75: 2 },
    evData: { actionEVsMeasured: true, actionEVs: { bet_33: 3.12, check: 2.50, bet_75: 2.10 } },
  };

  // Runout A: Turn Kh, River 3s -> Hero hits two pair and wins a 24 BB pot at showdown
  const gradeRunoutWin = gradeSolverDecision({
    ...baseFlopQuestion,
    turnCard: 'Kh',
    riverCard: '3s',
    handOutcomeBB: +24.0,
    wonHand: true,
  }, 'check');

  // Runout B: Turn 8c, River 9c -> Villain rivers a flush and Hero loses a 95 BB stack
  const gradeRunoutLose = gradeSolverDecision({
    ...baseFlopQuestion,
    turnCard: '8c',
    riverCard: '9c',
    handOutcomeBB: -95.0,
    wonHand: false,
  }, 'check');

  assert.deepEqual(gradeRunoutWin, gradeRunoutLose, 'gradeSolverDecision must be 100% invariant to later street runouts and win/loss outcome');

  // Canonical policy decision grading with different board runouts & outcomes
  const baseCanonicalPolicy = {
    policyVersion: 'solver-policy-v1',
    optimalAction: 'allin',
    actionFrequencies: { allin: 100, fold: 0 },
    actionEVs: { allin: 0.85, fold: 0 },
    sourceArtifact: {
      system: 'PIO_DATABASE',
      sourceArtifactChecksum: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    },
  };
  const policyWin = gradeCanonicalPolicyDecision({
    ...baseCanonicalPolicy,
    runoutBoard: ['As', 'Ks', 'Qs', 'Js', 'Ts'],
    netWonBB: +28,
  }, 'fold');
  const policyLose = gradeCanonicalPolicyDecision({
    ...baseCanonicalPolicy,
    runoutBoard: ['2c', '7d', '9h', 'Jc', 'Kd'],
    netWonBB: -14,
  }, 'fold');
  assert.deepEqual(policyWin, policyLose, 'gradeCanonicalPolicyDecision must be 100% invariant to runout and netWonBB');
});

// ─── 6. Mandatory Case (e): Missing Metric, Unsupported Game, Failed Lookup ──

test('Case (e): missing metric, unsupported game variant, or failed solver lookup produces explicit limitation and zero fabricated optimal play or EV loss', () => {
  // (e.1) Unsupported game variants (PLO, Short Deck, OFC)
  for (const variant of ['plo', 'plo5', 'omaha', 'short_deck', 'ofc']) {
    const elig = classifyHandAuditEligibility({ gameVariant: variant });
    assert.equal(elig.eligible, false, `${variant} must be rejected by classifyHandAuditEligibility`);

    const qual = qualifyDetectorFinding({ gameVariant: variant });
    assert.equal(qual.status, 'unsupported_game_context');
    assert.equal(qual.isRecurringLeak, false);
    assert.equal(qual.optimalAction, null);
    assert.equal(qual.evLossBB, null);
    assert.equal(qual.evLossMeasured, false);
    assert.match(qual.limitation, /Unsupported game variant/i);
  }

  // (e.2) Missing / unavailable metric
  const missingMetricQual = qualifyDetectorFinding({
    leak: { leakType: 'river_overfold', title: 'River Overfold' },
    metricAvailable: false,
  });
  assert.equal(missingMetricQual.status, 'unavailable_metric');
  assert.equal(missingMetricQual.isRecurringLeak, false);
  assert.equal(missingMetricQual.optimalAction, null);
  assert.equal(missingMetricQual.evLossBB, null);
  assert.equal(missingMetricQual.evLossMeasured, false);
  assert.match(missingMetricQual.limitation, /unavailable/i);

  // (e.3) Failed solver lookup & unpriced node
  const lookupFailedRows = [
    {
      id: 'lf-1',
      hand_external_id: 'club-arena:lf-1',
      decision_key: 'turn:co:cbet:1',
      street: 'turn',
      hero_position: 'CO',
      spot_type: 'cbet',
      player_action: 'check',
      solver_action: 'bet', // unverified hint must NEVER be exposed as verified optimalAction
      ev_loss: 1.9, // unmeasured number must NEVER be exposed as evLossBB
      ev_loss_measured: false,
      solver_verified: false,
      solver_source: 'hand-audit-v3:lookup-failed',
      classification: 'unpriced',
    },
  ];
  const failedQual = qualifyDetectorFinding({ decisions: lookupFailedRows });
  assert.equal(failedQual.status, 'solver_lookup_failed');
  assert.equal(failedQual.isRecurringLeak, false);
  assert.equal(failedQual.optimalAction, null, 'Must never expose solverAction when solver_verified is false');
  assert.equal(failedQual.evLossBB, null, 'Must never expose evLossBB when ev_loss_measured is false');
  assert.equal(failedQual.evLossMeasured, false);
  assert.match(failedQual.limitation, /Solver lookup failed/i);

  // Representative hand summary on unverified/unpriced row also strips solverAction and evLossBB
  const repSummary = buildRepresentativeHandSummary({ leakType: 'turn_barrel_too_rare' }, lookupFailedRows);
  assert.equal(repSummary.solverVerified, false);
  assert.equal(repSummary.solverAction, null);
  assert.equal(repSummary.evLossMeasured, false);
  assert.equal(repSummary.evLossBB, null);
});

// ─── 7. Mandatory Case (f): Reproducibility & Zero Duplicates on Rerun ───────

test('Case (f): rerunning same inputs and rule version after interruption is reproducible and produces zero duplicate findings, reviews, or progress events', () => {
  // (f.1) Interrupted/replayed ca_hand_facts batch with overlapping hand_ids
  const cleanFactBatch = Array.from({ length: 32 }, (_, idx) => ({
    hand_id: `replay-fact-${idx + 1}`,
    game_type: 'cash',
    game_variant: 'nlhe',
    is_tournament: false,
    big_blind: 2,
    hero_position: 'BB',
    hero_effective_stack_bb: 100,
    blind_defense_opportunity: true,
    blind_defended: idx < 6, // 6 / 32 = 18.75%
  }));
  const interruptedReplayBatch = [
    ...cleanFactBatch.slice(0, 20),
    ...cleanFactBatch.slice(10), // hands 11..20 replayed after interruption
  ];

  const cleanFactsOut = analyzeCaHandFacts(cleanFactBatch);
  const replayedFactsOut = analyzeCaHandFacts(interruptedReplayBatch);
  assert.deepEqual(replayedFactsOut, cleanFactsOut, 'analyzeCaHandFacts must deduplicate replayed hand_ids deterministically');

  // (f.2) Interrupted/replayed solver decisions batch
  const cleanDecisions = Array.from({ length: 8 }, (_, idx) => ({
    id: `replay-dec-${idx + 1}`,
    hand_external_id: `club-arena:replay-h-${idx + 1}`,
    decision_key: `river:bb:facing_bet:${idx + 1}`,
    evidence_scope: 'club_arena',
    game_id: 'cash-hand-audit',
    street: 'river',
    hero_position: 'BB',
    spot_type: 'facing_bet',
    player_action: 'call',
    solver_action: idx < 5 ? 'fold' : 'call',
    selected_frequency: idx < 5 ? 0.05 : 0.85,
    optimal_frequency: 0.85,
    ev_loss: idx < 5 ? 1.1 : 0,
    ev_loss_measured: true,
    solver_verified: true,
    solver_source: 'pio_database|hand-audit-v3',
    classification: idx < 5 ? 'mistake' : 'best',
    hand_played_at: `2026-11-24T10:0${idx}:00.000Z`,
    audited_at: `2026-11-24T10:1${idx}:00.000Z`,
  }));
  const duplicatedDecisions = [...cleanDecisions, ...cleanDecisions.slice(0, 5)];

  const fixedFirstDetected = '2026-11-24T00:00:00.000Z';
  const cleanLeaks = aggregateSolverLeaks(cleanDecisions, { firstDetected: fixedFirstDetected }).map(l => ({
    ...l,
    id: l.leak_type,
  }));
  const replayedLeaks = aggregateSolverLeaks(duplicatedDecisions, { firstDetected: fixedFirstDetected }).map(l => ({
    ...l,
    id: l.leak_type,
  }));
  assert.deepEqual(replayedLeaks, cleanLeaks, 'aggregateSolverLeaks must produce zero duplicate counts on replayed decision rows');

  // (f.3) Coaching snapshot, training plan, funnel, timeline, and fingerprints with duplicate leaks/reviews/decisions
  const cleanReviews = [
    {
      leak_id: cleanLeaks[0].id,
      due_at: '2026-11-25T00:00:00.000Z',
      reps: 2,
      strong_streak: 2,
      retired: false,
      remediation_baseline_at: '2026-11-23T00:00:00.000Z',
      history: [
        { at: '2026-11-23T12:00:00.000Z', score: 0.9 },
        { at: '2026-11-24T12:00:00.000Z', score: 0.92 },
      ],
    },
  ];
  const duplicatedReviews = [
    {
      ...cleanReviews[0],
      history: [...cleanReviews[0].history, cleanReviews[0].history[0]], // duplicate history entry
    },
    cleanReviews[0], // duplicate review row
  ];
  const duplicatedLeaks = [...cleanLeaks, ...cleanLeaks];

  const fixedNow = Date.parse('2026-11-25T12:00:00.000Z');
  const snapClean = buildCoachingSnapshot({
    leaks: cleanLeaks,
    decisions: cleanDecisions,
    reviews: cleanReviews,
    now: fixedNow,
  });
  const snapReplayed = buildCoachingSnapshot({
    leaks: duplicatedLeaks,
    decisions: duplicatedDecisions,
    reviews: duplicatedReviews,
    now: fixedNow,
  });

  assert.equal(snapReplayed.evidenceFingerprint, snapClean.evidenceFingerprint);
  assert.equal(receiptFingerprint(snapReplayed), receiptFingerprint(snapClean));
  assert.equal(snapReplayed.priorities.length, snapClean.priorities.length);
  assert.equal(snapReplayed.leaks.length, snapClean.leaks.length);
  assert.equal(snapReplayed.trainingPlan.modules.length, snapClean.trainingPlan.modules.length);
  assert.deepEqual(snapReplayed.funnelMetrics, snapClean.funnelMetrics);
  assert.deepEqual(snapReplayed.timeline, snapClean.timeline);
});

// ─── 8. Skill-Matched "Practice This" Drill Mapping Verification ─────────────

test('Skill-Matched Practice This: river call facing a large bet maps to river defense/bluff-catching practice (cash-005 / mtt-024) at street River — NEVER a generic preflop drill', () => {
  const riverLargeBetCallFindings = [
    {
      id: 'leak-river-call-large-bet-1',
      leakType: 'solver_club_arena_cash_river_bb_facing_large_bet',
      title: 'Calling River Overbets Too Wide in BB',
      leakCategory: 'river',
      street: 'river',
      position: 'BB',
      spotType: 'river_call_facing_large_bet',
      recommendedDrill: null,
    },
    {
      id: 'leak-river-call-large-bet-2',
      leakType: 'over_calling',
      title: 'River Bluff-Catch Overcalling vs Large Bet',
      leakCategory: 'postflop',
      situationClass: 'BB vs BTN River Large Bet Bluff Catch',
      recommendedDrill: 'cash-001', // even with a stale preflop recommendedDrill, street mismatch override must fix it!
    },
    {
      id: 'leak-river-3bet-pot-defense',
      leakType: 'solver_club_arena_cash_007_river_bb_3bet_pot_facing_bet',
      title: 'BB vs River Bet in 3-Bet Pots',
      leakCategory: 'postflop',
      situationClass: 'BB facing river large bet in 3-bet pot',
      recommendedDrill: 'cash-007', // cash-007 is preflop 3-bet pots; river spot in 3-bet pot must map to cash-005!
    },
    {
      id: 'leak-river-mtt-call',
      leakType: 'solver_club_arena_mtt_river_bb_facing_large_bet',
      title: 'MTT River Call Facing Large Bet',
      leakCategory: 'river',
      format: 'tournament',
      situationClass: 'BB vs BTN River Large Bet in Tournament',
      recommendedDrill: 'mtt-002', // mtt-002 is preflop ICM; river tournament leak must map to mtt-024!
    },
  ];

  for (const finding of riverLargeBetCallFindings) {
    const drill = leakToDrill(finding);
    const gameId = leakToTrainingGame(finding);
    assert.ok(drill, `leakToDrill returned null for ${finding.id}`);
    assert.equal(drill.street, 'River', `${finding.id} must resolve to street: 'River' (got ${drill.street})`);
    assert.equal(drill.position, 'BB', `${finding.id} must resolve to position: 'BB' (got ${drill.position})`);
    assert.equal(PREFLOP_ONLY_GAMES.has(gameId), false, `${finding.id} mapped to preflop game ${gameId}!`);
    if (finding.format === 'tournament' || finding.leakType.includes('_mtt_')) {
      assert.equal(gameId, 'mtt-024', `${finding.id} must map to mtt-024 (Postflop ICM Play)`);
    } else {
      assert.equal(gameId, 'cash-005', `${finding.id} must map to cash-005 (Bluff Catcher river defense)`);
    }
  }
});

test('Skill-Matched Practice This: audit EVERY leak slug in LEAK_PATTERNS (16), ca_hand_facts (11 Cash & MTT), and solver_* across River/Turn/Flop/Preflop so none silently fall back to a mismatched preflop game', () => {
  // 1. Audit all 16 LEAK_PATTERNS
  for (const [slug, pattern] of Object.entries(LEAK_PATTERNS)) {
    const expectedStreet = pattern.street.charAt(0).toUpperCase() + pattern.street.slice(1).toLowerCase();
    const leak = {
      id: slug,
      leakType: slug,
      leakCategory: pattern.category,
      street: expectedStreet,
      spotType: pattern.spotType,
      recommendedDrill: pattern.recommendedDrill,
      sourceSystem: 'ca_hand_facts',
    };
    const drill = leakToDrill(leak);
    const gameId = leakToTrainingGame(leak);
    assert.ok(drill, `LEAK_PATTERNS[${slug}] returned null drill`);
    assert.ok(gameId, `LEAK_PATTERNS[${slug}] returned null trainingGameId`);
    assert.equal(drill.street, expectedStreet, `LEAK_PATTERNS[${slug}] street mismatch: expected ${expectedStreet}, got ${drill.street}`);

    if (['Flop', 'Turn', 'River'].includes(expectedStreet)) {
      assert.equal(
        PREFLOP_ONLY_GAMES.has(gameId),
        false,
        `Postflop LEAK_PATTERNS[${slug}] (${expectedStreet}) fell back to preflop game ${gameId}`,
      );
      assert.equal(
        isGameMismatchedForStreet(gameId, expectedStreet, leak),
        false,
        `LEAK_PATTERNS[${slug}] game ${gameId} is mismatched for street ${expectedStreet}`,
      );
    }
  }

  // 2. Audit all 11 CA_HAND_FACTS_DETECTORS in both Cash and Tournament (short & deep)
  for (const [slug, det] of Object.entries(CA_HAND_FACTS_DETECTORS)) {
    const expectedStreet = det.street.charAt(0).toUpperCase() + det.street.slice(1).toLowerCase();

    const cashLeak = {
      id: `cash_${slug}`,
      leak_type: `cash_${slug}`,
      leak_category: det.category,
      street: expectedStreet,
      spot_type: det.spotType,
      recommended_drill: det.cashDrill,
      source_system: 'ca_hand_facts',
    };
    const cashDrill = leakToDrill(cashLeak);
    const cashGame = leakToTrainingGame(cashLeak);
    assert.equal(cashDrill.street, expectedStreet, `ca_hand_facts cash_${slug} street mismatch`);
    assert.equal(cashGame, det.cashDrill, `ca_hand_facts cash_${slug} game mismatch`);

    const mttLeak = {
      id: `tournament_deep_${slug}`,
      leak_type: `tournament_deep_${slug}`,
      leak_category: det.category,
      street: expectedStreet,
      spot_type: det.spotType,
      recommended_drill: det.tournamentDrill,
      source_system: 'ca_hand_facts',
    };
    const mttDrill = leakToDrill(mttLeak);
    const mttGame = leakToTrainingGame(mttLeak);
    assert.equal(mttDrill.street, expectedStreet, `ca_hand_facts tournament_deep_${slug} street mismatch`);
    assert.equal(mttGame, det.tournamentDrill, `ca_hand_facts tournament_deep_${slug} game mismatch`);

    if (['Flop', 'Turn', 'River'].includes(expectedStreet)) {
      assert.equal(PREFLOP_ONLY_GAMES.has(cashGame), false, `Postflop ca_hand_facts cash_${slug} mapped to preflop game ${cashGame}`);
      assert.equal(PREFLOP_ONLY_GAMES.has(mttGame), false, `Postflop ca_hand_facts tournament_${slug} mapped to preflop game ${mttGame}`);
    }
  }

  // 3. Audit solver_* groups across Preflop, Flop, Turn, and River
  const solverSpotFamilies = [
    { street: 'preflop', spotType: 'rfi_open', gameId: 'cash-hand-audit', expectedStreet: 'Preflop', expectedGame: 'cash-001' },
    { street: 'preflop', spotType: 'bb_defense', heroPosition: 'BB', gameId: 'cash-hand-audit', expectedStreet: 'Preflop', expectedGame: 'cash-003' },
    { street: 'preflop', spotType: 'facing_3bet', gameId: 'cash-hand-audit', expectedStreet: 'Preflop', expectedGame: 'cash-007' },
    { street: 'preflop', spotType: 'push_fold_15bb', gameId: 'mtt-hand-audit', expectedStreet: 'Preflop', expectedGame: 'mtt-001' },
    { street: 'flop', spotType: 'cbet_ip', gameId: 'cash-hand-audit', expectedStreet: 'Flop', expectedGame: 'cash-002' },
    { street: 'flop', spotType: 'check_raise_defense', heroPosition: 'BB', gameId: 'cash-hand-audit', expectedStreet: 'Flop', expectedGame: 'cash-014' },
    { street: 'turn', spotType: 'double_barrel', gameId: 'cash-hand-audit', expectedStreet: 'Turn', expectedGame: 'cash-004' },
    { street: 'turn', spotType: 'facing_turn_barrel', gameId: 'mtt-hand-audit', expectedStreet: 'Turn', expectedGame: 'mtt-021' },
    { street: 'river', spotType: 'facing_large_bet', heroPosition: 'BB', dominantPlayerAction: 'call', gameId: 'cash-hand-audit', expectedStreet: 'River', expectedGame: 'cash-005' },
    { street: 'river', spotType: 'thin_value_bet', heroPosition: 'BTN', dominantPlayerAction: 'check', gameId: 'cash-hand-audit', expectedStreet: 'River', expectedGame: 'cash-004' },
    { street: 'river', spotType: 'river_bluff_barrel', heroPosition: 'BTN', dominantPlayerAction: 'check', gameId: 'cash-hand-audit', expectedStreet: 'River', expectedGame: 'cash-012' },
    { street: 'river', spotType: 'river_facing_bet', heroPosition: 'BB', dominantPlayerAction: 'fold', gameId: 'mtt-hand-audit', expectedStreet: 'River', expectedGame: 'mtt-024' },
  ];

  for (const spot of solverSpotFamilies) {
    const resolvedGame = resolveSolverRecommendedDrill(spot);
    assert.equal(resolvedGame, spot.expectedGame, `Solver spot ${spot.street}/${spot.spotType} expected ${spot.expectedGame}, got ${resolvedGame}`);
    const synthLeak = {
      id: `solver_club_arena_${spot.gameId}_${spot.street}_${spot.spotType}`,
      leakType: `solver_club_arena_${spot.gameId}_${spot.street}_${spot.spotType}`,
      leakCategory: spot.street,
      street: spot.street,
      position: spot.heroPosition || 'BTN',
      spotType: spot.spotType,
      recommendedDrill: resolvedGame,
    };
    const drill = leakToDrill(synthLeak);
    const trainingGame = leakToTrainingGame(synthLeak);
    assert.equal(drill.street, spot.expectedStreet);
    assert.equal(trainingGame, spot.expectedGame);
  }
});

// ─── 9. Distinct Progression States & Diamond Reward Idempotency ─────────────

test('Progression States: practice completion, drill mastery, and live-table verification stay strictly separate with exactly-once Diamond idempotency key rules', () => {
  const leak = {
    id: 'leak-river-bluffcatch',
    leakType: 'river_overfold',
    title: 'Overfolding on the River',
    leakCategory: 'river',
    status: 'persistent',
    evLossBB: 0.65,
    evLossMeasured: true,
    mistakeCount: 10,
    totalSamples: 30,
    firstDetected: '2026-11-01T00:00:00.000Z',
  };

  const t0 = Date.parse('2026-11-10T12:00:00.000Z');
  // Stage 1: Initial review & single practice session completed (not mastered)
  const rev0 = initialReview(leak, t0);
  const rev1 = gradeReview(rev0, { correct: 9, total: 10 }, t0 + 3600_000);
  assert.equal(rev1.reps, 1);
  assert.equal(rev1.strongStreak, 1);
  assert.equal(rev1.retired, false, 'One strong practice session must never mark a leak mastered/retired');

  const planAfterOneSession = buildTrainingPlan({
    leaks: [leak],
    reviews: [{ ...rev1, leak_id: leak.id, strong_streak: rev1.strongStreak }],
    decisions: [],
    now: t0 + 3600_000,
  });
  const modStage1 = planAfterOneSession.modules[0];
  assert.equal(modStage1.mastery.mastered, false);
  assert.equal(modStage1.mastery.stage, 'early');
  assert.equal(modStage1.tableVerification.status, 'not_mastered');
  assert.equal(modStage1.tableVerification.verifiedLiveMilestone, null);

  // Stage 2: Sustained strong sessions reach RETIRE_AFTER_STRONG at MAX_INTERVAL_DAYS -> drill mastery achieved,
  // but fewer than MIN_LIVE_VERIFY_HANDS (8) post-baseline live hands exist -> awaiting_live_hands
  const baselineIso = '2026-11-15T00:00:00.000Z';
  const masteredReview = {
    leak_id: leak.id,
    reps: 5,
    strong_streak: RETIRE_AFTER_STRONG,
    interval_days: 21,
    retired: true,
    remediation_baseline_at: baselineIso,
    history: [{ at: baselineIso, score: 0.95 }],
  };

  const makeLiveRiverDecision = (idx, isMistake, playedAt = `2026-11-18T1${idx % 10}:00:00.000Z`) => ({
    id: `post-live-${idx}`,
    leak_id: leak.id,
    hand_external_id: `club-arena:22222222-2222-4222-8222-2222222222${String(idx).padStart(2, '0')}`,
    decision_key: `river:bb:facing_bet:${idx}`,
    evidence_scope: 'club_arena',
    game_id: 'cash-hand-audit',
    street: 'river',
    hero_position: 'BB',
    spot_type: 'facing_bet',
    player_action: isMistake ? 'fold' : 'call',
    solver_action: 'call',
    classification: isMistake ? 'mistake' : 'best',
    ev_loss: isMistake ? 0.65 : 0,
    ev_loss_measured: true,
    solver_verified: true,
    solver_source: 'pio_database|hand-audit-v3',
    hand_played_at: playedAt,
    audited_at: playedAt,
  });

  const snapAwaitingLive = buildCoachingSnapshot({
    leaks: [leak],
    reviews: [masteredReview],
    decisions: Array.from({ length: 5 }, (_, idx) => makeLiveRiverDecision(idx, false)),
    now: Date.parse('2026-11-19T00:00:00.000Z'),
  });
  const modStage2 = snapAwaitingLive.trainingPlan.modules[0];
  assert.equal(modStage2.mastery.mastered, true, 'Drill mastery is complete');
  assert.equal(modStage2.tableVerification.status, 'awaiting_live_hands', 'Drill mastery must NOT be conflated with live-table verification');
  assert.equal(modStage2.tableVerification.postSampleCount, 5);
  assert.equal(modStage2.tableVerification.handsRemaining, MIN_LIVE_VERIFY_HANDS - 5);
  assert.equal(modStage2.tableVerification.verifiedLiveMilestone, null, 'No live milestone before 8 post-baseline live hands');

  // Stage 3: 8+ post-baseline live Club Arena hands with mistake rate > LIVE_FIX_MAX_MISTAKE_RATE (15%) -> relapsed_at_tables
  const snapRelapsed = buildCoachingSnapshot({
    leaks: [leak],
    reviews: [masteredReview],
    decisions: Array.from({ length: 8 }, (_, idx) => makeLiveRiverDecision(idx, idx < 3)), // 3/8 = 37.5% mistake rate
    now: Date.parse('2026-11-19T00:00:00.000Z'),
  });
  const modStage3 = snapRelapsed.trainingPlan.modules[0];
  assert.equal(modStage3.mastery.mastered, true);
  assert.equal(modStage3.tableVerification.status, 'relapsed_at_tables');
  assert.equal(modStage3.cadence, 'Re-Drill Required');
  assert.equal(modStage3.tableVerification.verifiedLiveMilestone, null);

  // Stage 4: 8+ post-baseline live Club Arena hands with mistake rate <= 15% (1/8 = 12.5%) -> confirmed_fixed_at_tables
  const eightCleanDecisions = Array.from({ length: 8 }, (_, idx) => makeLiveRiverDecision(idx, idx === 0));
  const snapConfirmed = buildCoachingSnapshot({
    leaks: [leak],
    reviews: [masteredReview],
    decisions: eightCleanDecisions,
    now: Date.parse('2026-11-19T00:00:00.000Z'),
  });
  const modStage4 = snapConfirmed.trainingPlan.modules[0];
  assert.equal(modStage4.tableVerification.status, 'confirmed_fixed_at_tables');
  assert.ok(modStage4.tableVerification.postMistakeRate <= LIVE_FIX_MAX_MISTAKE_RATE);
  const milestone = modStage4.tableVerification.verifiedLiveMilestone;
  assert.ok(milestone, 'Expected verifiedLiveMilestone on confirmed_fixed_at_tables');
  assert.equal(milestone.idempotencyKey, `pa-verified-live:${leak.id}:${baselineIso}`);
  assert.equal(milestone.xp, 0, 'XP is permanently banned');
  assert.equal(modStage4.tableVerification.rewardClaimed, false);

  // Once claimedReferenceIds contains the idempotencyKey, rewardClaimed is true (preventing double-claim)
  const snapClaimed = buildCoachingSnapshot({
    leaks: [leak],
    reviews: [masteredReview],
    decisions: eightCleanDecisions,
    claimedReferenceIds: [milestone.idempotencyKey],
    now: Date.parse('2026-11-19T00:00:00.000Z'),
  });
  assert.equal(snapClaimed.trainingPlan.modules[0].tableVerification.rewardClaimed, true);
  assert.equal(snapClaimed.leaks[0].tableVerification.rewardClaimed, true);
});
