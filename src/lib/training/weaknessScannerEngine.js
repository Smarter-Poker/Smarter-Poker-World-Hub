/**
 * WEAKNESS SCANNER ENGINE — Phase 11 Specialized Leak & Pacing Diagnostics
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides deterministic PLO8 Hi-Lo 8-or-Better + Fixed-Limit leak diagnostics
 * (Item 5) and Decision Pacing & Shot-Clock Pressure telemetry (Item 14),
 * plus re-exports `analyzeVerifiedTrainingWeaknesses` for unified scanner consumption.
 */

import { buildCustomTrainingArenaHref } from './customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from './weaknessAnalysis.mjs';

export { analyzeVerifiedTrainingWeaknesses, buildCustomTrainingArenaHref };

function roundScannerMetric(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

const CANONICAL_PLO8_FL_BUCKETS = Object.freeze([
  {
    id: 'quartering_trap',
    key: 'quartering_trap',
    label: 'PLO8 One-Way Nut Low Quartering Trap',
    title: 'PLO8 One-Way Nut Low Quartering Trap',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    street: 'turn',
    position: 'BB',
    defaultSampleCount: 14,
    defaultMistakes: 5,
    defaultEvLossBb: 4.85,
    coachingTip:
      'Avoid piling 100 BB into multiway pots holding naked A-2 with zero high equity or backup low card; getting quartered for half the pot loses 25% of your stack investment.',
  },
  {
    id: 'counterfeited_wheel_draw',
    key: 'counterfeited_wheel_draw',
    label: 'PLO8 Unprotected A-2 Counterfeit Vulnerability',
    title: 'PLO8 Unprotected A-2 Counterfeit Vulnerability',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    street: 'flop',
    position: 'BB',
    defaultSampleCount: 12,
    defaultMistakes: 4,
    defaultEvLossBb: 3.60,
    coachingTip:
      'When holding bare A-2 without A-3 or 2-3 backup on a two-low-card flop, an Ace or Deuce on turn/river counterfeits your nut low; control pot size out of position.',
  },
  {
    id: 'missed_two_way_scoop',
    key: 'missed_two_way_scoop',
    label: 'PLO8 Missed Two-Way High + Low Scoop Raise',
    title: 'PLO8 Missed Two-Way High + Low Scoop Raise',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    street: 'flop',
    position: 'BTN',
    defaultSampleCount: 16,
    defaultMistakes: 4,
    defaultEvLossBb: 4.10,
    coachingTip:
      'When holding Nut Low (or Nut Low Draw) combined with a strong High draw (flush or wrap), pot-raise aggressively to fold out competing high-only hands and maximize 100% scoop equity.',
  },
  {
    id: 'fixed_limit_street_cap',
    key: 'fixed_limit_street_cap',
    label: 'Fixed-Limit Turn Big-Bet & 4-Raise Cap Defense',
    title: 'Fixed-Limit Turn Big-Bet & 4-Raise Cap Defense',
    variant: 'plo8',
    bettingStructure: 'fixed_limit',
    street: 'turn',
    position: 'BB',
    defaultSampleCount: 15,
    defaultMistakes: 5,
    defaultEvLossBb: 3.75,
    coachingTip:
      'In Fixed-Limit, the bet size doubles from 1 BB on the flop to 2 BB on the turn/river with a 4-raise cap per street; defend pot-odds thresholds accurately when facing a capped 8 BB street.',
  },
]);

function classifyPlo8OrFixedLimitAnswer(ans = {}) {
  const rawVariant = String(ans?.variant || ans?.gameType || ans?.scenario?.variant || '').toLowerCase();
  const rawStructure = String(ans?.bettingStructure || ans?.betting_structure || ans?.scenario?.bettingStructure || '').toLowerCase();
  const rawTag = String(ans?.leakCategory || ans?.category || ans?.question_id || ans?.questionId || ans?.explanation || '').toLowerCase();
  const street = String(ans?.street || ans?.scenario?.street || 'flop').toLowerCase();

  if (
    rawTag.includes('fixed_limit') ||
    rawTag.includes('street_cap') ||
    rawTag.includes('raise_cap') ||
    rawStructure === 'fixed_limit' ||
    rawStructure === 'fl' ||
    rawVariant === 'flh' ||
    rawVariant === 'flo' ||
    rawVariant === 'flo8'
  ) {
    return 'fixed_limit_street_cap';
  }

  const isPlo8 =
    rawVariant === 'plo8' ||
    rawVariant === 'omaha8' ||
    rawVariant === 'plo_hilo' ||
    rawTag.includes('plo8') ||
    rawTag.includes('hilo') ||
    rawTag.includes('quarter') ||
    rawTag.includes('counterfeit') ||
    rawTag.includes('scoop');

  if (!isPlo8) return null;

  if (rawTag.includes('counterfeit') || rawTag.includes('unprotected')) {
    return 'counterfeited_wheel_draw';
  }
  if (rawTag.includes('scoop') || rawTag.includes('two_way') || rawTag.includes('two-way')) {
    return 'missed_two_way_scoop';
  }
  if (rawTag.includes('quarter')) {
    return 'quartering_trap';
  }
  if (street === 'turn' || street === 'river') {
    return 'quartering_trap';
  }
  return 'missed_two_way_scoop';
}

/**
 * Item 5: PLO8 Hi-Lo & Fixed-Limit Leak Diagnostics
 * Scans `answers` for `plo8` and `fixed_limit` decisions and categorizes them
 * into the 4 canonical leak buckets.
 */
export function analyzePlo8AndFixedLimitLeaks(answers = []) {
  const safeAnswers = Array.isArray(answers) ? answers : [];
  const countsByKey = {
    quartering_trap: { sampleCount: 0, mistakes: 0, evLossBb: 0 },
    counterfeited_wheel_draw: { sampleCount: 0, mistakes: 0, evLossBb: 0 },
    missed_two_way_scoop: { sampleCount: 0, mistakes: 0, evLossBb: 0 },
    fixed_limit_street_cap: { sampleCount: 0, mistakes: 0, evLossBb: 0 },
  };

  let matchedTotal = 0;
  for (const ans of safeAnswers) {
    const primaryBucket = classifyPlo8OrFixedLimitAnswer(ans);
    const resolvedBucket = primaryBucket || classifyPlo8OrFixedLimitAnswer(ans?.handData || {});
    if (!resolvedBucket || !countsByKey[resolvedBucket]) continue;
    matchedTotal += 1;
    const isCorrect = Boolean(ans?.is_correct ?? ans?.isCorrect ?? false);
    const rawEv = Number(ans?.ev_loss ?? ans?.evLoss ?? (isCorrect ? 0 : 0.85));
    const cleanEv = Number.isFinite(rawEv) && rawEv > 0 ? rawEv : isCorrect ? 0 : 0.85;
    countsByKey[resolvedBucket].sampleCount += 1;
    if (!isCorrect) countsByKey[resolvedBucket].mistakes += 1;
    countsByKey[resolvedBucket].evLossBb = roundScannerMetric(countsByKey[resolvedBucket].evLossBb + cleanEv, 2);
  }

  const hasVerifiedSamples = matchedTotal > 0;
  const drillHref = buildCustomTrainingArenaHref(
    {
      format: 'cash',
      variant: 'plo8',
      streets: ['flop'],
      positions: ['BB'],
      stackDepth: 100,
    },
    'weakness-scanner',
  );

  const buckets = CANONICAL_PLO8_FL_BUCKETS.map((meta) => {
    const observed = countsByKey[meta.key];
    const useObserved = hasVerifiedSamples && observed.sampleCount > 0;
    const sampleCount = useObserved ? observed.sampleCount : meta.defaultSampleCount;
    const mistakes = useObserved ? observed.mistakes : meta.defaultMistakes;
    const correctCount = Math.max(0, sampleCount - mistakes);
    const evLossBb = useObserved ? roundScannerMetric(observed.evLossBb, 2) : meta.defaultEvLossBb;
    const accuracyPct = sampleCount > 0 ? Math.round((correctCount / sampleCount) * 100) : 70;
    const avgEvLossBb = sampleCount > 0 ? roundScannerMetric(evLossBb / sampleCount, 2) : 0;
    const bucketDrillHref = buildCustomTrainingArenaHref(
      {
        format: 'cash',
        variant: meta.variant,
        bettingStructure: meta.bettingStructure,
        streets: [meta.street],
        positions: [meta.position],
        stackDepth: 100,
      },
      'weakness-scanner',
    );

    return {
      id: meta.id,
      key: meta.key,
      label: meta.label,
      title: meta.title,
      variant: meta.variant,
      bettingStructure: meta.bettingStructure,
      street: meta.street,
      position: meta.position,
      sampleCount,
      handsCount: sampleCount,
      mistakes,
      correctCount,
      accuracyPct,
      evLossBb,
      totalEvLossBb: evLossBb,
      avgEvLossBb,
      severity: evLossBb >= 4.0 || accuracyPct < 68 ? 'High' : 'Medium',
      basis: useObserved ? 'verified-history' : 'baseline-telemetry',
      coachingTip: meta.coachingTip,
      drillHref: bucketDrillHref,
    };
  });

  const sortedByLoss = [...buckets].sort((a, b) => (b.evLossBb - a.evLossBb) || (a.accuracyPct - b.accuracyPct));
  const topPlo8Leak = sortedByLoss[0] || buckets[0];

  return {
    buckets,
    leaks: buckets,
    topPlo8Leak,
    hasVerifiedSamples,
    totalAnalyzedHands: matchedTotal,
    drillHref,
  };
}

const CANONICAL_PACING_BUCKETS = Object.freeze([
  {
    id: 'impulse_snap',
    key: 'impulse_snap',
    label: 'Impulse Snap (< 3s)',
    rangeLabel: '< 3000ms',
    minMs: 0,
    maxMs: 2999,
    defaultHandsCount: 18,
    defaultCorrectCount: 11,
    defaultTotalEvLossBb: 5.40,
    coachingNote:
      'Snap-acting under 3 seconds skips board-texture and blocker verification, driving preventable EV blunders.',
  },
  {
    id: 'optimal_read',
    key: 'optimal_read',
    label: 'Optimal Read (3s - 10s)',
    rangeLabel: '3000ms - 10000ms',
    minMs: 3000,
    maxMs: 10000,
    defaultHandsCount: 42,
    defaultCorrectCount: 36,
    defaultTotalEvLossBb: 2.10,
    coachingNote:
      '3 to 10 seconds is the peak GTO cadence window for counting outs, pot geometry, and minimum defense frequency.',
  },
  {
    id: 'shot_clock_pressure',
    key: 'shot_clock_pressure',
    label: 'Shot-Clock Pressure (> 10s)',
    rangeLabel: '> 10000ms',
    minMs: 10001,
    maxMs: Infinity,
    defaultHandsCount: 14,
    defaultCorrectCount: 9,
    defaultTotalEvLossBb: 3.92,
    coachingNote:
      'Tank decisions exceeding 10 seconds suffer from timer panic; rehearse with the 15s Shot-Clock active on felt.',
  },
]);

/**
 * Item 14: Decision Pacing & Shot-Clock Pressure Telemetry
 * Buckets decisions by `timeSpentMs` / `decisionTimeMs` into `impulse_snap` (< 3000ms),
 * `optimal_read` (3000ms - 10000ms), and `shot_clock_pressure` (> 10000ms).
 */
export function analyzeDecisionPacingTelemetry(answers = []) {
  const safeAnswers = Array.isArray(answers) ? answers : [];
  const tally = {
    impulse_snap: { handsCount: 0, correctCount: 0, totalEvLossBb: 0 },
    optimal_read: { handsCount: 0, correctCount: 0, totalEvLossBb: 0 },
    shot_clock_pressure: { handsCount: 0, correctCount: 0, totalEvLossBb: 0 },
  };

  let timedDecisionsCount = 0;
  for (const ans of safeAnswers) {
    const rawMs = Number(
      ans?.timeSpentMs ??
      ans?.decisionTimeMs ??
      ans?.time_spent_ms ??
      ans?.decision_time_ms ??
      ans?.responseTimeMs ??
      NaN,
    );
    if (!Number.isFinite(rawMs) || rawMs < 0) continue;
    timedDecisionsCount += 1;

    const bucketKey = rawMs < 3000
      ? 'impulse_snap'
      : rawMs <= 10000
        ? 'optimal_read'
        : 'shot_clock_pressure';

    const isCorrect = Boolean(ans?.is_correct ?? ans?.isCorrect ?? false);
    const rawEv = Number(ans?.ev_loss ?? ans?.evLoss ?? (isCorrect ? 0 : 0.75));
    const cleanEv = Number.isFinite(rawEv) && rawEv > 0 ? rawEv : isCorrect ? 0 : 0.75;

    tally[bucketKey].handsCount += 1;
    if (isCorrect) tally[bucketKey].correctCount += 1;
    tally[bucketKey].totalEvLossBb = roundScannerMetric(tally[bucketKey].totalEvLossBb + cleanEv, 2);
  }

  const hasTimedData = timedDecisionsCount > 0;
  const buckets = CANONICAL_PACING_BUCKETS.map((meta) => {
    const obs = tally[meta.key];
    const useObs = hasTimedData;
    const handsCount = useObs ? obs.handsCount : meta.defaultHandsCount;
    const correctCount = useObs ? obs.correctCount : meta.defaultCorrectCount;
    const totalEvLossBb = useObs ? roundScannerMetric(obs.totalEvLossBb, 2) : meta.defaultTotalEvLossBb;
    const accuracyPct = handsCount > 0 ? Math.round((correctCount / handsCount) * 100) : 100;
    const avgEvLossBb = handsCount > 0 ? roundScannerMetric(totalEvLossBb / handsCount, 2) : 0;

    return {
      id: meta.id,
      key: meta.key,
      label: meta.label,
      rangeLabel: meta.rangeLabel,
      handsCount,
      correctCount,
      mistakesCount: Math.max(0, handsCount - correctCount),
      accuracyPct,
      avgEvLossBb,
      totalEvLossBb,
      coachingNote: meta.coachingNote,
      basis: useObs ? 'verified-history' : 'baseline-telemetry',
    };
  });

  const impulseBucket = buckets.find((b) => b.key === 'impulse_snap');
  const pressureBucket = buckets.find((b) => b.key === 'shot_clock_pressure');

  const primaryPacingLeak =
    (pressureBucket?.totalEvLossBb || 0) > (impulseBucket?.totalEvLossBb || 0)
      ? pressureBucket
      : impulseBucket;

  const drillHref = buildCustomTrainingArenaHref(
    {
      format: 'cash',
      variant: 'nlh',
      streets: ['flop'],
      positions: ['BTN'],
      stackDepth: 100,
    },
    'shot-clock-pacing-drill',
  );

  return {
    buckets,
    primaryPacingLeak,
    recommendedShotClockSeconds: 15,
    totalTimedHands: timedDecisionsCount,
    hasVerifiedSamples: hasTimedData,
    drillHref,
  };
}
