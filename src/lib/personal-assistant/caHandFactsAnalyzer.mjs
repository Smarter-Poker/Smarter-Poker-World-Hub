/**
 * Deterministic Club Arena `ca_hand_facts` Analyzer & Solver Coverage Telemetry
 *
 * PURE. DEPENDENCY-FREE. DETERMINISTIC.
 * - Consumes persisted `ca_hand_facts` rows (both Cash and Tournament).
 * - Excludes unsupported non-NLH variants automatically via `classifyHandAuditEligibility`.
 * - Separates Cash NLH vs. Tournament NLH (and MTT stack buckets: <20bb, 20-40bb, 40bb+)
 *   so short-stack tournament spots are never scored against 100bb cash ranges.
 * - Mines position- and street-specific leaks using recorded opportunity denominators
 *   (blind defense, steal, squeeze, fold to 3-bet, turn/river barrel, check-raise,
 *   turn/river aggression factor, BTN tightness, UTG looseness).
 * - Never fabricates a rate when its denominator is zero or below minimum sample size.
 */
import { classifyHandAuditEligibility } from './leakRecord.js';

export const FORMAT_BASELINES = Object.freeze({
  cash: Object.freeze({
    label: 'Cash NLH',
    vpip: [21, 28],
    threeBet: [7, 11],
    cbetFlop: [52, 66],
    postflopAf: [2.0, 3.6],
    turnRiverAf: [1.6, 3.4],
    blindDefense: [38, 54],
    steal: [30, 46],
    squeeze: [7, 13],
    foldToThreeBet: [45, 58],
    turnBarrel: [48, 64],
    riverBarrel: [42, 58],
    checkRaise: [8, 14],
    btnVpip: [38, 52],
    utgVpip: [13, 20],
  }),
  tournament_deep: Object.freeze({
    label: 'Tournament NLH (40bb+)',
    vpip: [22, 31],
    threeBet: [8, 13],
    cbetFlop: [50, 66],
    postflopAf: [2.0, 3.8],
    turnRiverAf: [1.6, 3.5],
    blindDefense: [44, 62],
    steal: [34, 52],
    squeeze: [8, 15],
    foldToThreeBet: [42, 56],
    turnBarrel: [46, 62],
    riverBarrel: [40, 56],
    checkRaise: [8, 15],
    btnVpip: [42, 58],
    utgVpip: [14, 22],
  }),
  tournament_mid: Object.freeze({
    label: 'Tournament NLH (20-40bb)',
    vpip: [20, 30],
    threeBet: [9, 16],
    cbetFlop: [46, 64],
    postflopAf: [2.1, 4.2],
    turnRiverAf: [1.5, 3.6],
    blindDefense: [48, 66],
    steal: [36, 56],
    squeeze: [9, 17],
    foldToThreeBet: [38, 54],
    turnBarrel: [42, 60],
    riverBarrel: [38, 55],
    checkRaise: [8, 16],
    btnVpip: [44, 62],
    utgVpip: [13, 21],
  }),
  tournament_short: Object.freeze({
    label: 'Tournament NLH (<20bb)',
    vpip: [18, 32],
    threeBet: [11, 22],
    cbetFlop: [42, 65],
    postflopAf: [2.2, 5.5],
    turnRiverAf: [1.5, 4.5],
    blindDefense: [50, 72],
    steal: [40, 65],
    squeeze: [10, 22],
    foldToThreeBet: [30, 50],
    turnBarrel: [40, 62],
    riverBarrel: [35, 58],
    checkRaise: [7, 18],
    btnVpip: [45, 70],
    utgVpip: [11, 20],
  }),
});

export const CA_HAND_FACTS_RULE_VERSION = 'ca-hand-facts-v2';

export const CA_HAND_FACTS_DETECTORS = Object.freeze({
  blind_defense_too_tight: Object.freeze({
    slug: 'blind_defense_too_tight',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'BB',
    spotType: 'bb_defense',
    opportunityField: 'blind_defense_opportunity',
    minOpportunities: 30,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-003',
    tournamentDrill: 'mtt-017',
  }),
  steal_too_rare: Object.freeze({
    slug: 'steal_too_rare',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'CO',
    spotType: 'rfi',
    opportunityField: 'steal_opportunity',
    minOpportunities: 30,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-001',
    tournamentDrill: 'mtt-011',
    tournamentShortDrill: 'mtt-001',
  }),
  squeeze_too_rare: Object.freeze({
    slug: 'squeeze_too_rare',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'Any',
    spotType: 'squeeze',
    opportunityField: 'squeeze_opportunity',
    minOpportunities: 20,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-016',
    tournamentDrill: 'mtt-010',
  }),
  fold_to_3bet_too_high: Object.freeze({
    slug: 'fold_to_3bet_too_high',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'Any',
    spotType: 'vs3bet',
    opportunityField: 'faced_three_bet',
    minOpportunities: 25,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-007',
    tournamentDrill: 'mtt-009',
  }),
  turn_barrel_too_rare_facts: Object.freeze({
    slug: 'turn_barrel_too_rare_facts',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'turn',
    street: 'turn',
    heroPosition: 'Any',
    spotType: 'turn_barrel',
    opportunityField: 'barrel_turn_opportunity',
    minOpportunities: 25,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-004',
    tournamentDrill: 'mtt-024',
  }),
  river_barrel_too_rare_facts: Object.freeze({
    slug: 'river_barrel_too_rare_facts',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'river',
    street: 'river',
    heroPosition: 'Any',
    spotType: 'river_bluff',
    opportunityField: 'barrel_river_opportunity',
    minOpportunities: 20,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-012',
    tournamentDrill: 'mtt-024',
  }),
  check_raise_too_rare_facts: Object.freeze({
    slug: 'check_raise_too_rare_facts',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'postflop',
    street: 'flop',
    heroPosition: 'BB',
    spotType: 'check_raise',
    opportunityField: 'check_raise_opportunity',
    minOpportunities: 25,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-014',
    tournamentDrill: 'mtt-021',
  }),
  passive_turn_river: Object.freeze({
    slug: 'passive_turn_river',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'turn',
    street: 'turn',
    heroPosition: 'Any',
    spotType: 'turn_barrel',
    opportunityField: 'af_turn_river_actions',
    minOpportunities: 30,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-004',
    tournamentDrill: 'mtt-024',
  }),
  passive_postflop_facts: Object.freeze({
    slug: 'passive_postflop_facts',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'postflop',
    street: 'flop',
    heroPosition: 'Any',
    spotType: 'cbet',
    opportunityField: 'af_postflop_actions',
    minOpportunities: 40,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-004',
    tournamentDrill: 'mtt-021',
  }),
  btn_too_tight: Object.freeze({
    slug: 'btn_too_tight',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'BTN',
    spotType: 'rfi',
    opportunityField: 'btn_hands',
    minOpportunities: 40,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-006',
    tournamentDrill: 'mtt-018',
  }),
  utg_too_loose: Object.freeze({
    slug: 'utg_too_loose',
    ruleVersion: CA_HAND_FACTS_RULE_VERSION,
    category: 'preflop',
    street: 'preflop',
    heroPosition: 'UTG',
    spotType: 'rfi',
    opportunityField: 'utg_hands',
    minOpportunities: 40,
    evidenceBasis: 'deterministic_rule',
    cashDrill: 'cash-001',
    tournamentDrill: 'mtt-007',
    tournamentShortDrill: 'mtt-001',
  }),
});

export function classifyStackBucket(effectiveStackBb) {
  if (effectiveStackBb === null || effectiveStackBb === undefined || effectiveStackBb === '') return 'unknown';
  const bb = Number(effectiveStackBb);
  if (!Number.isFinite(bb) || bb <= 0) return 'unknown';
  if (bb < 20) return 'short';
  if (bb < 40) return 'mid';
  return 'deep';
}

function pushSampleHand(bucket, handId) {
  if (!handId) return;
  const clean = String(handId).trim();
  if (!clean || bucket.length >= 5 || bucket.includes(clean)) return;
  bucket.push(clean);
}

function emptyCounter() {
  return {
    hands: 0,
    vpip: 0,
    pfr: 0,
    threeBetOpp: 0,
    threeBet: 0,
    facedThreeBet: 0,
    foldedToThreeBet: 0,
    stealOpp: 0,
    stole: 0,
    squeezeOpp: 0,
    squeezed: 0,
    blindDefenseOpp: 0,
    defendedBlind: 0,
    sawFlop: 0,
    cbetFlopOpp: 0,
    cbetFlop: 0,
    barrelTurnOpp: 0,
    barreledTurn: 0,
    barrelRiverOpp: 0,
    barreledRiver: 0,
    checkRaiseOpp: 0,
    checkRaised: 0,
    donkOpp: 0,
    donkBet: 0,
    probeOpp: 0,
    probeBet: 0,
    wtsd: 0,
    wsd: 0,
    flopAgg: 0,
    flopPass: 0,
    turnRiverAgg: 0,
    turnRiverPass: 0,
    postflopAgg: 0,
    postflopPass: 0,
    sampleHands: {
      blindDefenseMissed: [],
      stealMissed: [],
      squeezeMissed: [],
      foldedToThreeBet: [],
      turnBarrelMissed: [],
      riverBarrelMissed: [],
      checkRaiseMissed: [],
      turnRiverPassive: [],
      postflopPassive: [],
      vpipFolded: [],
      vpipEntered: [],
    },
  };
}

function addFactToCounter(counter, row) {
  const handId = row?.hand_id ?? row?.handId ?? null;
  counter.hands += 1;
  if (row.vpip === true) {
    counter.vpip += 1;
    pushSampleHand(counter.sampleHands.vpipEntered, handId);
  } else {
    pushSampleHand(counter.sampleHands.vpipFolded, handId);
  }
  if (row.pfr === true) counter.pfr += 1;
  if (row.three_bet_opportunity === true) {
    counter.threeBetOpp += 1;
    if (row.three_bet === true) counter.threeBet += 1;
  }
  if (row.faced_three_bet === true) {
    counter.facedThreeBet += 1;
    if (row.folded_to_three_bet === true) {
      counter.foldedToThreeBet += 1;
      pushSampleHand(counter.sampleHands.foldedToThreeBet, handId);
    }
  }
  if (row.steal_opportunity === true) {
    counter.stealOpp += 1;
    if (row.stole === true) counter.stole += 1;
    else pushSampleHand(counter.sampleHands.stealMissed, handId);
  }
  if (row.squeeze_opportunity === true) {
    counter.squeezeOpp += 1;
    if (row.squeezed === true) counter.squeezed += 1;
    else pushSampleHand(counter.sampleHands.squeezeMissed, handId);
  }
  if (row.blind_defense_opportunity === true) {
    counter.blindDefenseOpp += 1;
    if (row.defended_blind === true) counter.defendedBlind += 1;
    else pushSampleHand(counter.sampleHands.blindDefenseMissed, handId);
  }
  if (row.saw_flop === true) {
    counter.sawFlop += 1;
    if (row.went_to_showdown === true) {
      counter.wtsd += 1;
      if (row.won_at_showdown === true) counter.wsd += 1;
    }
  }
  if (row.cbet_flop_opportunity === true || row.had_cbet_flop_opp === true) {
    counter.cbetFlopOpp += 1;
    if (row.cbet_flop === true) counter.cbetFlop += 1;
  }
  if (row.barrel_turn_opportunity === true) {
    counter.barrelTurnOpp += 1;
    if (row.barreled_turn === true) counter.barreledTurn += 1;
    else pushSampleHand(counter.sampleHands.turnBarrelMissed, handId);
  }
  if (row.barrel_river_opportunity === true) {
    counter.barrelRiverOpp += 1;
    if (row.barreled_river === true) counter.barreledRiver += 1;
    else pushSampleHand(counter.sampleHands.riverBarrelMissed, handId);
  }
  if (row.check_raise_opportunity === true) {
    counter.checkRaiseOpp += 1;
    if (row.check_raised === true) counter.checkRaised += 1;
    else pushSampleHand(counter.sampleHands.checkRaiseMissed, handId);
  }
  if (row.donk_opportunity === true) {
    counter.donkOpp += 1;
    if (row.donk_bet === true) counter.donkBet += 1;
  }
  if (row.probe_opportunity === true) {
    counter.probeOpp += 1;
    if (row.probe_bet === true) counter.probeBet += 1;
  }

  const callOnlyAgg = Number(row.af_bet_raise_actions) || 0;
  const callOnlyCalls = Number(row.af_call_actions) || 0;
  counter.postflopAgg += callOnlyAgg;
  counter.postflopPass += callOnlyCalls;
  if (callOnlyCalls > callOnlyAgg) {
    pushSampleHand(counter.sampleHands.postflopPassive, handId);
  }

  // Turn/river AF is only computed when call-only turn/river denominators exist.
  // Never divide by check-inclusive `passive_actions_turn/river` against call-only baselines.
  const trCallAgg = Number(row.af_turn_river_bet_raise);
  const trCallPass = Number(row.af_turn_river_calls);
  if (Number.isFinite(trCallAgg) && Number.isFinite(trCallPass) && (trCallAgg > 0 || trCallPass > 0)) {
    counter.turnRiverAgg += trCallAgg;
    counter.turnRiverPass += trCallPass;
    if (trCallPass > trCallAgg) {
      pushSampleHand(counter.sampleHands.turnRiverPassive, handId);
    }
  }
}

function finalizeCounter(c) {
  const pct = (n, d) => (d > 0 ? +((n / d) * 100).toFixed(1) : null);
  const ratio = (agg, pass) => (pass > 0 ? +(agg / pass).toFixed(2) : null);
  return {
    hands: c.hands,
    vpip: pct(c.vpip, c.hands),
    pfr: pct(c.pfr, c.hands),
    threeBetFreq: pct(c.threeBet, c.threeBetOpp),
    threeBetOpps: c.threeBetOpp,
    foldToThreeBet: pct(c.foldedToThreeBet, c.facedThreeBet),
    facedThreeBet: c.facedThreeBet,
    stealFreq: pct(c.stole, c.stealOpp),
    stealOpps: c.stealOpp,
    squeezeFreq: pct(c.squeezed, c.squeezeOpp),
    squeezeOpps: c.squeezeOpp,
    blindDefenseFreq: pct(c.defendedBlind, c.blindDefenseOpp),
    blindDefenseOpps: c.blindDefenseOpp,
    cbetFlopFreq: pct(c.cbetFlop, c.cbetFlopOpp),
    cbetFlopOpps: c.cbetFlopOpp,
    barrelTurnFreq: pct(c.barreledTurn, c.barrelTurnOpp),
    barrelTurnOpps: c.barrelTurnOpp,
    barrelRiverFreq: pct(c.barreledRiver, c.barrelRiverOpp),
    barrelRiverOpps: c.barrelRiverOpp,
    checkRaiseFreq: pct(c.checkRaised, c.checkRaiseOpp),
    checkRaiseOpps: c.checkRaiseOpp,
    donkFreq: pct(c.donkBet, c.donkOpp),
    donkOpps: c.donkOpp,
    probeFreq: pct(c.probeBet, c.probeOpp),
    probeOpps: c.probeOpp,
    wtsd: pct(c.wtsd, c.sawFlop),
    wsd: pct(c.wsd, c.wtsd),
    sawFlop: c.sawFlop,
    flopAf: ratio(c.flopAgg, c.flopPass),
    turnRiverAf: ratio(c.turnRiverAgg, c.turnRiverPass),
    turnRiverActions: c.turnRiverAgg + c.turnRiverPass,
    postflopAf: ratio(c.postflopAgg, c.postflopPass),
    postflopActions: c.postflopAgg + c.postflopPass,
    sampleHands: c.sampleHands,
  };
}

function normalizePositionBucket(pos) {
  const clean = String(pos || '').trim().toUpperCase();
  if (clean === 'BTN' || clean === 'BU') return 'BTN';
  if (clean === 'CO') return 'CO';
  if (clean === 'SB') return 'SB';
  if (clean === 'BB') return 'BB';
  if (clean.startsWith('UTG')) return 'UTG';
  if (['MP', 'MP+1', 'LJ', 'HJ'].includes(clean)) return 'MP';
  return null;
}

function buildFactLeak({
  formatScope,
  stackBucket = null,
  slug,
  category,
  street = null,
  heroPosition = null,
  spotType = null,
  title,
  currentValue,
  optimalRange,
  samples,
  mistakes,
  evImpact,
  recommendedDrill,
  explanation,
  why,
  nextTimeAction = null,
  sampleHandIds = [],
}) {
  const [optMin, optMax] = optimalRange;
  const optMid = +(((optMin + optMax) / 2).toFixed(1));
  const prefix = formatScope === 'tournament'
    ? (stackBucket ? `mtt_${stackBucket}` : 'mtt')
    : 'cash';
  const formatLabel = formatScope === 'tournament'
    ? (stackBucket === 'short' ? 'Tournament (<20bb)' : stackBucket === 'mid' ? 'Tournament (20-40bb)' : stackBucket === 'deep' ? 'Tournament (40bb+)' : 'Tournament NLH')
    : 'Cash NLH';
  const resolvedStreet = street || (category === 'postflop' ? 'flop' : category);
  const resolvedPosition = heroPosition || 'Any';
  const resolvedSpotType = spotType || CA_HAND_FACTS_DETECTORS[slug]?.spotType || slug;
  const handList = Array.isArray(sampleHandIds) ? sampleHandIds.filter(Boolean).map(String) : [];
  const whatToDoNextTime = nextTimeAction || `Adjust your ${title.toLowerCase()} toward the ${optMin}-${optMax}${optMax <= 10 ? '' : '%'} ${formatLabel} baseline and drill ${recommendedDrill}.`;
  const where = `${formatLabel} · ${resolvedStreet.toUpperCase()} · ${resolvedPosition} · ${resolvedSpotType}`;

  return {
    leak_type: `${prefix}_${slug}`,
    leak_category: category,
    street: resolvedStreet,
    hero_position: resolvedPosition,
    spot_type: resolvedSpotType,
    format_scope: formatScope,
    stack_bucket: stackBucket,
    situation_class: `${title} (${formatLabel})`,
    current_frequency: +Number(currentValue).toFixed(1),
    optimal_frequency: optMid,
    optimal_range: optimalRange,
    occurrence_count: Math.max(1, Math.round(mistakes)),
    total_samples: Math.max(1, Math.round(samples)),
    avg_ev_loss_bb: evImpact,
    ev_loss_measured: false,
    recommended_drill: recommendedDrill,
    explanation,
    why_leaking_ev: why,
    source_system: 'ca_hand_facts',
    rule_version: CA_HAND_FACTS_RULE_VERSION,
    evidence_basis: 'deterministic_rule',
    representative_hand_id: handList[0] || null,
    sample_hand_ids: handList,
    takeaway: {
      whatYouAreDoing: explanation,
      where,
      whatToDoNextTime,
      summary: `What you are doing: ${explanation} Where: ${where}. Next time: ${whatToDoNextTime}`,
    },
  };
}

function evaluateFormatLeaks(metrics, posMetrics, formatScope, stackBucket, baseline) {
  const leaks = [];
  const isMtt = formatScope === 'tournament';
  const blindDefenseDrill = isMtt ? 'mtt-017' : 'cash-003';
  const stealDrill = isMtt ? (stackBucket === 'short' ? 'mtt-001' : 'mtt-011') : 'cash-001';
  const squeezeDrill = isMtt ? 'mtt-010' : 'cash-016';
  const vs3BetDrill = isMtt ? 'mtt-009' : 'cash-007';
  const turnBarrelDrill = isMtt ? 'mtt-024' : 'cash-004';
  const riverBarrelDrill = isMtt ? 'mtt-024' : 'cash-012';
  const checkRaiseDrill = isMtt ? 'mtt-021' : 'cash-014';
  const passiveTurnRiverDrill = isMtt ? 'mtt-024' : 'cash-004';
  const passivePostflopDrill = isMtt ? 'mtt-021' : 'cash-004';
  const btnDrill = isMtt ? 'mtt-018' : 'cash-006';
  const utgDrill = isMtt ? (stackBucket === 'short' ? 'mtt-001' : 'mtt-007') : 'cash-001';

  // 1. Blind defense too tight (recorded blind_defense_opportunity)
  if (metrics.blindDefenseOpps >= 30 && metrics.blindDefenseFreq !== null && metrics.blindDefenseFreq < baseline.blindDefense[0] - 5) {
    const gap = Math.max(1, Math.round(((baseline.blindDefense[0] - metrics.blindDefenseFreq) / 100) * metrics.blindDefenseOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'blind_defense_too_tight',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'BB',
      spotType: 'bb_defense',
      title: 'Under-Defending The Blinds',
      currentValue: metrics.blindDefenseFreq,
      optimalRange: baseline.blindDefense,
      samples: metrics.blindDefenseOpps,
      mistakes: gap,
      evImpact: 0.11,
      recommendedDrill: blindDefenseDrill,
      explanation: `You defended your blind ${metrics.blindDefenseFreq}% across ${metrics.blindDefenseOpps} opportunities vs. the ${baseline.blindDefense[0]}-${baseline.blindDefense[1]}% ${baseline.label} target.`,
      why: 'Overfolding from the blinds hands late-position raisers automatic profit with any two cards.',
      nextTimeAction: `Defend wider from BB against late-position opens using suited connectors, suited gappers, and high-card hands to reach ${baseline.blindDefense[0]}-${baseline.blindDefense[1]}% defense. Practice in ${blindDefenseDrill}.`,
      sampleHandIds: metrics.sampleHands?.blindDefenseMissed,
    }));
  }

  // 2. Steal frequency too low in late position
  if (metrics.stealOpps >= 30 && metrics.stealFreq !== null && metrics.stealFreq < baseline.steal[0] - 5) {
    const gap = Math.max(1, Math.round(((baseline.steal[0] - metrics.stealFreq) / 100) * metrics.stealOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'steal_too_rare',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'CO',
      spotType: 'rfi',
      title: 'Stealing Blinds Too Rarely',
      currentValue: metrics.stealFreq,
      optimalRange: baseline.steal,
      samples: metrics.stealOpps,
      mistakes: gap,
      evImpact: 0.08,
      recommendedDrill: stealDrill,
      explanation: `Your late-position steal frequency is ${metrics.stealFreq}% across ${metrics.stealOpps} spots vs. ${baseline.steal[0]}-${baseline.steal[1]}% for ${baseline.label}.`,
      why: 'Passing up profitable unopened CO/BTN/SB opens forfeits dead blind equity and compresses your winrate.',
      nextTimeAction: `Open-raise unopened CO, BTN, and SB pots more aggressively toward ${baseline.steal[0]}-${baseline.steal[1]}% instead of open-folding playable hands. Practice in ${stealDrill}.`,
      sampleHandIds: metrics.sampleHands?.stealMissed,
    }));
  }

  // 3. Squeeze frequency too low
  if (metrics.squeezeOpps >= 20 && metrics.squeezeFreq !== null && metrics.squeezeFreq < baseline.squeeze[0] - 2) {
    const gap = Math.max(1, Math.round(((baseline.squeeze[0] - metrics.squeezeFreq) / 100) * metrics.squeezeOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'squeeze_too_rare',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'Any',
      spotType: 'squeeze',
      title: 'Squeezing Too Rarely',
      currentValue: metrics.squeezeFreq,
      optimalRange: baseline.squeeze,
      samples: metrics.squeezeOpps,
      mistakes: gap,
      evImpact: 0.09,
      recommendedDrill: squeezeDrill,
      explanation: `You squeezed ${metrics.squeezeFreq}% across ${metrics.squeezeOpps} squeeze spots vs. ${baseline.squeeze[0]}-${baseline.squeeze[1]}%.`,
      why: 'Flatting or folding behind an open and a caller leaves dead money in the pot and lets capped callers realize equity cheaply.',
      nextTimeAction: `Squeeze to ${baseline.squeeze[0]}-${baseline.squeeze[1]}% facing an open and a flat-call by adding high-card blocker bluffs alongside your value hands. Practice in ${squeezeDrill}.`,
      sampleHandIds: metrics.sampleHands?.squeezeMissed,
    }));
  }

  // 4. Folding to 3-bets too often
  if (metrics.facedThreeBet >= 25 && metrics.foldToThreeBet !== null && metrics.foldToThreeBet > baseline.foldToThreeBet[1] + 6) {
    const gap = Math.max(1, Math.round(((metrics.foldToThreeBet - baseline.foldToThreeBet[1]) / 100) * metrics.facedThreeBet));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'fold_to_3bet_too_high',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'Any',
      spotType: 'vs3bet',
      title: 'Overfolding To 3-Bets',
      currentValue: metrics.foldToThreeBet,
      optimalRange: baseline.foldToThreeBet,
      samples: metrics.facedThreeBet,
      mistakes: gap,
      evImpact: 0.12,
      recommendedDrill: vs3BetDrill,
      explanation: `You folded ${metrics.foldToThreeBet}% across ${metrics.facedThreeBet} 3-bets faced vs. ${baseline.foldToThreeBet[0]}-${baseline.foldToThreeBet[1]}%.`,
      why: 'Folding well above minimum defense frequency makes every opponent light 3-bet immediately profitable.',
      nextTimeAction: `Defend against 3-bets with suited broadways, pocket pairs, and 4-bet bluffs so your fold rate drops into the ${baseline.foldToThreeBet[0]}-${baseline.foldToThreeBet[1]}% range. Practice in ${vs3BetDrill}.`,
      sampleHandIds: metrics.sampleHands?.foldedToThreeBet,
    }));
  }

  // 5. Turn barrel too rare (recorded barrel_turn_opportunity)
  if (metrics.barrelTurnOpps >= 25 && metrics.barrelTurnFreq !== null && metrics.barrelTurnFreq < baseline.turnBarrel[0] - 6) {
    const gap = Math.max(1, Math.round(((baseline.turnBarrel[0] - metrics.barrelTurnFreq) / 100) * metrics.barrelTurnOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'turn_barrel_too_rare_facts',
      category: 'turn',
      street: 'turn',
      heroPosition: 'Any',
      spotType: 'turn_barrel',
      title: 'Missing Turn Barrels',
      currentValue: metrics.barrelTurnFreq,
      optimalRange: baseline.turnBarrel,
      samples: metrics.barrelTurnOpps,
      mistakes: gap,
      evImpact: 0.10,
      recommendedDrill: turnBarrelDrill,
      explanation: `You barreled the turn ${metrics.barrelTurnFreq}% across ${metrics.barrelTurnOpps} opportunities vs. ${baseline.turnBarrel[0]}-${baseline.turnBarrel[1]}%.`,
      why: 'Checking back too many turns after c-betting lets floaters take pots away on the river and realize draw equity for free.',
      nextTimeAction: `Fire second barrels on scare cards and equity-improving turns to reach ${baseline.turnBarrel[0]}-${baseline.turnBarrel[1]}% turn continuation. Practice in ${turnBarrelDrill}.`,
      sampleHandIds: metrics.sampleHands?.turnBarrelMissed,
    }));
  }

  // 6. River barrel too rare (recorded barrel_river_opportunity)
  if (metrics.barrelRiverOpps >= 20 && metrics.barrelRiverFreq !== null && metrics.barrelRiverFreq < baseline.riverBarrel[0] - 6) {
    const gap = Math.max(1, Math.round(((baseline.riverBarrel[0] - metrics.barrelRiverFreq) / 100) * metrics.barrelRiverOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'river_barrel_too_rare_facts',
      category: 'river',
      street: 'river',
      heroPosition: 'Any',
      spotType: 'river_bluff',
      title: 'Under-Barreling The River',
      currentValue: metrics.barrelRiverFreq,
      optimalRange: baseline.riverBarrel,
      samples: metrics.barrelRiverOpps,
      mistakes: gap,
      evImpact: 0.10,
      recommendedDrill: riverBarrelDrill,
      explanation: `You followed through on the river ${metrics.barrelRiverFreq}% across ${metrics.barrelRiverOpps} opportunities vs. ${baseline.riverBarrel[0]}-${baseline.riverBarrel[1]}%.`,
      why: 'Shutting down on the river too often leaves thin value uncollected and prevents your triple-barrel bluffs from working.',
      nextTimeAction: `Follow through on the river with thin value and nut-blocker bluffs toward ${baseline.riverBarrel[0]}-${baseline.riverBarrel[1]}%. Practice in ${riverBarrelDrill}.`,
      sampleHandIds: metrics.sampleHands?.riverBarrelMissed,
    }));
  }

  // 7. Postflop check-raise too rare (recorded check_raise_opportunity across flop/turn/river)
  if (metrics.checkRaiseOpps >= 25 && metrics.checkRaiseFreq !== null && metrics.checkRaiseFreq < baseline.checkRaise[0] - 3) {
    const gap = Math.max(1, Math.round(((baseline.checkRaise[0] - metrics.checkRaiseFreq) / 100) * metrics.checkRaiseOpps));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'check_raise_too_rare_facts',
      category: 'postflop',
      street: 'flop',
      heroPosition: 'BB',
      spotType: 'check_raise',
      title: 'Check-Raising Too Rarely',
      currentValue: metrics.checkRaiseFreq,
      optimalRange: baseline.checkRaise,
      samples: metrics.checkRaiseOpps,
      mistakes: gap,
      evImpact: 0.08,
      recommendedDrill: checkRaiseDrill,
      explanation: `Your check-raise frequency is ${metrics.checkRaiseFreq}% across ${metrics.checkRaiseOpps} opportunities vs. ${baseline.checkRaise[0]}-${baseline.checkRaise[1]}%.`,
      why: 'Without enough check-raises, in-position c-bettors can fire their entire range profitably with minimal risk.',
      nextTimeAction: `Check-raise high-equity draws and strong value hands out of position to reach ${baseline.checkRaise[0]}-${baseline.checkRaise[1]}%. Practice in ${checkRaiseDrill}.`,
      sampleHandIds: metrics.sampleHands?.checkRaiseMissed,
    }));
  }

  // 8. Passive postflop / turn-river play (strictly call-only AF basis)
  if (metrics.turnRiverActions >= 30 && metrics.turnRiverAf !== null && metrics.turnRiverAf < baseline.turnRiverAf[0] - 0.3) {
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'passive_turn_river',
      category: 'turn',
      street: 'turn',
      heroPosition: 'Any',
      spotType: 'turn_barrel',
      title: 'Too Passive On Turn And River',
      currentValue: metrics.turnRiverAf,
      optimalRange: baseline.turnRiverAf,
      samples: metrics.turnRiverActions,
      mistakes: Math.max(5, Math.round(metrics.turnRiverActions * 0.2)),
      evImpact: 0.09,
      recommendedDrill: passiveTurnRiverDrill,
      explanation: `Your turn-and-river aggression factor is ${metrics.turnRiverAf} across ${metrics.turnRiverActions} actions vs. ${baseline.turnRiverAf[0]}-${baseline.turnRiverAf[1]}.`,
      why: 'Calling down passively on later streets surrenders fold equity and misses thin value in big pots.',
      nextTimeAction: `Replace passive turn and river calls with value bets, semi-bluff barrels, or disciplined folds to reach an aggression factor of ${baseline.turnRiverAf[0]}-${baseline.turnRiverAf[1]}. Practice in ${passiveTurnRiverDrill}.`,
      sampleHandIds: metrics.sampleHands?.turnRiverPassive,
    }));
  } else if (metrics.postflopActions >= 40 && metrics.postflopAf !== null && metrics.postflopAf < baseline.turnRiverAf[0] - 0.3) {
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'passive_postflop_facts',
      category: 'postflop',
      street: 'flop',
      heroPosition: 'Any',
      spotType: 'cbet',
      title: 'Too Passive Postflop',
      currentValue: metrics.postflopAf,
      optimalRange: baseline.turnRiverAf,
      samples: metrics.postflopActions,
      mistakes: Math.max(5, Math.round(metrics.postflopActions * 0.2)),
      evImpact: 0.09,
      recommendedDrill: passivePostflopDrill,
      explanation: `Your call-only aggression factor is ${metrics.postflopAf} across ${metrics.postflopActions} bet/raise/call actions vs. ${baseline.turnRiverAf[0]}-${baseline.turnRiverAf[1]}.`,
      why: 'Calling too often relative to betting and raising surrenders fold equity and misses thin value.',
      nextTimeAction: `Convert passive postflop flat-calls into raises or folds and bet more frequently for value to reach ${baseline.turnRiverAf[0]}-${baseline.turnRiverAf[1]} AF. Practice in ${passivePostflopDrill}.`,
      sampleHandIds: metrics.sampleHands?.postflopPassive,
    }));
  }

  // 9. Position-specific leaks (BTN too tight, UTG too loose)
  const btn = posMetrics?.BTN;
  if (btn && btn.hands >= 40 && btn.vpip !== null && btn.vpip < baseline.btnVpip[0] - 6) {
    const gap = Math.max(1, Math.round(((baseline.btnVpip[0] - btn.vpip) / 100) * btn.hands));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'btn_too_tight',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'BTN',
      spotType: 'rfi',
      title: 'Playing Too Tight On The Button',
      currentValue: btn.vpip,
      optimalRange: baseline.btnVpip,
      samples: btn.hands,
      mistakes: gap,
      evImpact: 0.09,
      recommendedDrill: btnDrill,
      explanation: `Your Button VPIP is ${btn.vpip}% across ${btn.hands} BTN hands vs. ${baseline.btnVpip[0]}-${baseline.btnVpip[1]}% for ${baseline.label}.`,
      why: 'The Button is the highest-EV seat at the table; folding playable hands in position leaves substantial long-term winrate behind.',
      nextTimeAction: `Open-raise wider on the Button with suited kings, suited connectors, and offsuit broadways toward ${baseline.btnVpip[0]}-${baseline.btnVpip[1]}%. Practice in ${btnDrill}.`,
      sampleHandIds: btn.sampleHands?.vpipFolded,
    }));
  }

  const utg = posMetrics?.UTG;
  if (utg && utg.hands >= 40 && utg.vpip !== null && utg.vpip > baseline.utgVpip[1] + 6) {
    const gap = Math.max(1, Math.round(((utg.vpip - baseline.utgVpip[1]) / 100) * utg.hands));
    leaks.push(buildFactLeak({
      formatScope,
      stackBucket,
      slug: 'utg_too_loose',
      category: 'preflop',
      street: 'preflop',
      heroPosition: 'UTG',
      spotType: 'rfi',
      title: 'Opening Too Loose Under The Gun',
      currentValue: utg.vpip,
      optimalRange: baseline.utgVpip,
      samples: utg.hands,
      mistakes: gap,
      evImpact: 0.08,
      recommendedDrill: utgDrill,
      explanation: `Your UTG VPIP is ${utg.vpip}% across ${utg.hands} UTG hands vs. ${baseline.utgVpip[0]}-${baseline.utgVpip[1]}% for ${baseline.label}.`,
      why: 'Entering pots too wide from early position forces you to play dominated holdings out of position against stronger ranges.',
      nextTimeAction: `Tighten your Under-The-Gun open-raising range to ${baseline.utgVpip[0]}-${baseline.utgVpip[1]}% by folding easily dominated offsuit broadways and weak suited aces. Practice in ${utgDrill}.`,
      sampleHandIds: utg.sampleHands?.vpipEntered,
    }));
  }

  return leaks;
}

export function analyzeCaHandFacts(rows = []) {
  const cashCounter = emptyCounter();
  const tournamentCounter = emptyCounter();
  const stackCounters = {
    cash: { short: emptyCounter(), mid: emptyCounter(), deep: emptyCounter(), unknown: emptyCounter() },
    tournament: { short: emptyCounter(), mid: emptyCounter(), deep: emptyCounter(), unknown: emptyCounter() },
  };
  const posCounters = {
    cash: {},
    tournament: {},
  };

  let excludedUnsupportedHands = 0;
  const seenHandIds = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const rawHandId = row.hand_id ?? row.handId ?? null;
    if (rawHandId !== null && rawHandId !== undefined && String(rawHandId).trim() !== '') {
      const handKey = String(rawHandId).trim();
      if (seenHandIds.has(handKey)) continue;
      seenHandIds.add(handKey);
    }
    const eligibility = classifyHandAuditEligibility(row);
    if (!eligibility.eligible) {
      excludedUnsupportedHands += 1;
      continue;
    }

    const fmt = eligibility.format; // 'cash' | 'tournament'
    const mainCounter = fmt === 'tournament' ? tournamentCounter : cashCounter;
    addFactToCounter(mainCounter, row);

    const bucket = classifyStackBucket(row.effective_stack_bb_at_deal);
    addFactToCounter(stackCounters[fmt][bucket], row);

    const pos = normalizePositionBucket(row.position);
    if (pos) {
      if (!posCounters[fmt][pos]) posCounters[fmt][pos] = emptyCounter();
      addFactToCounter(posCounters[fmt][pos], row);
    }
  }

  const cashMetrics = finalizeCounter(cashCounter);
  const tournamentMetrics = finalizeCounter(tournamentCounter);
  const cashPositions = Object.fromEntries(
    Object.entries(posCounters.cash).map(([k, v]) => [k, finalizeCounter(v)]),
  );
  const tournamentPositions = Object.fromEntries(
    Object.entries(posCounters.tournament).map(([k, v]) => [k, finalizeCounter(v)]),
  );
  const tournamentByStack = {
    short: finalizeCounter(stackCounters.tournament.short),
    mid: finalizeCounter(stackCounters.tournament.mid),
    deep: finalizeCounter(stackCounters.tournament.deep),
  };

  const detectedLeaks = [];
  if (cashMetrics.hands > 0) {
    detectedLeaks.push(...evaluateFormatLeaks(cashMetrics, cashPositions, 'cash', null, FORMAT_BASELINES.cash));
  }

  // Evaluate each Tournament stack bucket (`<20bb`, `20-40bb`, `40bb+`) independently
  // against its own stack-depth baseline so shifting hand volumes never mix push/fold
  // and deep-stack play or falsely auto-resolve active leaks. Only fall back to an
  // aggregate tournament pass when no individual known stack bucket has >= 30 hands.
  if (tournamentMetrics.hands > 0) {
    const bucketSpecs = [
      { key: 'short', metrics: tournamentByStack.short, baseline: FORMAT_BASELINES.tournament_short },
      { key: 'mid', metrics: tournamentByStack.mid, baseline: FORMAT_BASELINES.tournament_mid },
      { key: 'deep', metrics: tournamentByStack.deep, baseline: FORMAT_BASELINES.tournament_deep },
    ];
    const qualifiedBuckets = bucketSpecs.filter(b => b.metrics.hands >= 30);
    if (qualifiedBuckets.length > 0) {
      for (const b of qualifiedBuckets) {
        detectedLeaks.push(...evaluateFormatLeaks(
          b.metrics,
          qualifiedBuckets.length === 1 ? tournamentPositions : {},
          'tournament',
          b.key,
          b.baseline,
        ));
      }
      if (qualifiedBuckets.length > 1) {
        // Position-specific BTN/UTG leaks use aggregate tournament positions against neutral mid baseline.
        const posOnly = evaluateFormatLeaks(
          { hands: 0, blindDefenseOpps: 0, stealOpps: 0, squeezeOpps: 0, facedThreeBet: 0, barrelTurnOpps: 0, barrelRiverOpps: 0, checkRaiseOpps: 0, turnRiverActions: 0, postflopActions: 0 },
          tournamentPositions,
          'tournament',
          null,
          FORMAT_BASELINES.tournament_mid,
        );
        detectedLeaks.push(...posOnly);
      }
    } else {
      // Unknown or low-volume stack splits: never force `<20bb` short-stack baseline on unknown stacks.
      const knownTotal = tournamentByStack.short.hands + tournamentByStack.mid.hands + tournamentByStack.deep.hands;
      const fallbackBucket = knownTotal === 0
        ? null
        : (tournamentByStack.short.hands >= tournamentByStack.mid.hands && tournamentByStack.short.hands >= tournamentByStack.deep.hands
            ? 'short'
            : (tournamentByStack.mid.hands >= tournamentByStack.deep.hands ? 'mid' : 'deep'));
      const fallbackBaseline = fallbackBucket === 'short'
        ? FORMAT_BASELINES.tournament_short
        : (fallbackBucket === 'deep' ? FORMAT_BASELINES.tournament_deep : FORMAT_BASELINES.tournament_mid);
      detectedLeaks.push(...evaluateFormatLeaks(
        tournamentMetrics,
        tournamentPositions,
        'tournament',
        fallbackBucket,
        fallbackBaseline,
      ));
    }
  }

  return {
    totalEligibleHands: cashMetrics.hands + tournamentMetrics.hands,
    excludedUnsupportedHands,
    cash: cashMetrics,
    tournament: tournamentMetrics,
    tournamentByStack,
    positions: { cash: cashPositions, tournament: tournamentPositions },
    detectedLeaks,
  };
}

/**
 * Rank the highest-frequency unmeasured (unpriced) solver buckets across
 * audited decisions so players and the solver pipeline see exact coverage gaps.
 */
export function summarizeSolverCoverageGaps(decisions = [], { limit = 8 } = {}) {
  const rows = Array.isArray(decisions) ? decisions.filter(Boolean) : [];
  const unverified = rows.filter(row => row.solver_verified !== true);
  if (unverified.length === 0) {
    return { totalUnmeasured: 0, totalDecisions: rows.length, topGaps: [] };
  }

  const counts = new Map();
  for (const row of unverified) {
    const gameId = String(row.game_id || '').toLowerCase();
    const format = gameId.startsWith('mtt-') ? 'Tournament NLH' : 'Cash NLH';
    const street = String(row.street || 'unknown').toLowerCase();
    const position = String(row.hero_position || 'ANY').toUpperCase();
    const spotType = String(row.spot_type || 'general').toLowerCase();
    const key = `${format}|${street}|${position}|${spotType}`;
    const existing = counts.get(key) || { format, street, heroPosition: position, spotType, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }

  const topGaps = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.street.localeCompare(b.street) || a.heroPosition.localeCompare(b.heroPosition))
    .slice(0, Math.max(1, limit))
    .map(item => ({
      ...item,
      sharePercent: Math.round((item.count / unverified.length) * 1000) / 10,
    }));

  return {
    totalUnmeasured: unverified.length,
    totalDecisions: rows.length,
    topGaps,
  };
}

export default {
  CA_HAND_FACTS_RULE_VERSION,
  CA_HAND_FACTS_DETECTORS,
  FORMAT_BASELINES,
  classifyStackBucket,
  analyzeCaHandFacts,
  summarizeSolverCoverageGaps,
};
