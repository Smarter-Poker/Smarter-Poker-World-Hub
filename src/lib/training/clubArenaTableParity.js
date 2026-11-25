/**
 * Club Arena 1:1 Decision-Level Table Parity Engine
 *
 * Ensures Training Hub and Club Arena compute identical legal action buttons,
 * min/max raise bounds (No-Limit, Pot-Limit, Fixed-Limit), short all-in reopening rules,
 * multiway main/side pots, stakes-aware chip conversions (e.g. 0.25/0.50),
 * Heads-Up / Spins / 6-Max action order, Hi-Lo 8-or-better showdown split allocation,
 * practice currency isolation, and custom raise sizing feedback.
 */

import handEvaluator from '../poker-engine/HandEvaluator.js';
import deckModule from '../poker-engine/Deck.js';

const { evaluateHoldem, evaluateOmaha, evaluateLow } = handEvaluator;
const { parseCards: parseDeckCards, cardToString } = deckModule;

export const SIX_MAX_POSITIONS = Object.freeze(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);
export const NINE_MAX_POSITIONS = Object.freeze(['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
export const HEADS_UP_POSITIONS = Object.freeze(['BTN', 'BB']);
export const SPINS_POSITIONS = Object.freeze(['BTN', 'SB', 'BB']);

const POSITION_ORDER_POSTFLOP = ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];
const POSITION_ORDER_PREFLOP = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const HOLE_CARD_COUNT_BY_VARIANT = Object.freeze({
  nlh: 2,
  flh: 2,
  plo: 4,
  plo4: 4,
  plo5: 5,
  plo6: 6,
  plo8: 4,
  flo: 4,
  flo8: 4,
});

export function normalizeTrainingVariant(variantRaw = 'nlh') {
  const v = String(variantRaw || 'nlh').trim().toLowerCase();
  if (
    v === 'plo8' ||
    v === 'omaha8' ||
    v === 'omaha_hi_lo' ||
    v === 'plo_hilo' ||
    v === 'plo-hi-lo' ||
    v === 'flo8' ||
    v === 'o8' ||
    v === 'omaha_hilo'
  ) {
    return 'plo8';
  }
  if (v === 'plo6' || v === '6-card-plo' || v === 'plo-6' || v === 'omaha6') return 'plo6';
  if (v === 'plo5' || v === '5-card-plo' || v === 'plo-5' || v === 'omaha5') return 'plo5';
  if (v === 'plo' || v === 'plo4' || v === '4-card-plo' || v === 'plo-4' || v === 'omaha' || v === 'omaha4' || v === 'flo') {
    return 'plo4';
  }
  return 'nlh';
}

export function isHiLoVariant(variantRaw = 'nlh') {
  return normalizeTrainingVariant(variantRaw) === 'plo8';
}

export function isPotLimitVariant(variantRaw = 'nlh') {
  const v = String(variantRaw || 'nlh').trim().toLowerCase();
  if (v === 'flh' || v === 'flo' || v === 'flo8' || v.includes('fixed_limit') || v.includes('fixed-limit')) {
    return false;
  }
  const norm = normalizeTrainingVariant(v);
  return (
    norm.startsWith('plo') ||
    v.startsWith('plo') ||
    v.includes('omaha') ||
    v.includes('pot_limit') ||
    v.includes('pot-limit')
  );
}

export function normalizeBettingStructure(bettingStructure, variantRaw = 'nlh') {
  const bs = String(bettingStructure || '').trim().toLowerCase();
  const rawV = String(variantRaw || '').trim().toLowerCase();
  if (
    bs === 'fixed_limit' ||
    bs === 'fixed-limit' ||
    bs === 'fl' ||
    bs === 'limit' ||
    rawV === 'flh' ||
    rawV === 'flo' ||
    rawV === 'flo8'
  ) {
    return 'fixed_limit';
  }
  if (
    bs === 'pot_limit' ||
    bs === 'pot-limit' ||
    bs === 'pl' ||
    (isPotLimitVariant(variantRaw) && bs !== 'no_limit' && bs !== 'no-limit' && bs !== 'nl')
  ) {
    return 'pot_limit';
  }
  return 'no_limit';
}

export function normalizeGameFormat(formatRaw = 'cash') {
  const f = String(formatRaw || 'cash').trim().toLowerCase();
  if (f === 'hu' || f === 'heads_up' || f === 'headsup' || f === '2max' || f === '2-max' || f === 'hu_cash') {
    return 'hu';
  }
  if (f === 'spins' || f === 'spin' || f === 'spin_and_go' || f === '3max' || f === '3-max' || f === 'spin_3max') {
    return 'spins';
  }
  if (f === '9max' || f === '9-max' || f === 'full_ring' || f === 'full-ring' || f === 'fullring') {
    return '9max';
  }
  if (f === 'mtt' || f === 'tournament' || f === 'sng' || f === 'icm' || f.startsWith('mtt_')) {
    return 'mtt';
  }
  return 'cash';
}

export function computeLegalBettingBounds({
  variant = 'nlh',
  street = 'flop',
  potBb = 6.5,
  heroStackBb = 100,
  heroCommittedBb = 0,
  facingBetBb = 0,
  lastRaiseIncrementBb = null,
  bigBlindBb = 1,
  bettingStructure = null,
  numRaisesOnStreet = 0,
  maxRaisesPerRound = 4,
} = {}) {
  const normVariant = normalizeTrainingVariant(variant);
  const activeBettingStructure = normalizeBettingStructure(bettingStructure, variant);
  const isPotLimit = activeBettingStructure === 'pot_limit';
  const isFixedLimit = activeBettingStructure === 'fixed_limit';
  const normStreet = String(street || 'preflop').trim().toLowerCase();

  const cleanBb = Math.max(0.01, roundTableUnit(Number(bigBlindBb) || 1, 2));
  const cleanPotBb = Math.max(0, roundTableUnit(Number(potBb) || 0, 2));
  const cleanStackBb = Math.max(0, roundTableUnit(Number(heroStackBb) || 0, 2));
  const cleanCommittedBb = Math.max(0, roundTableUnit(Number(heroCommittedBb) || 0, 2));
  const cleanFacingBetBb = Math.max(0, roundTableUnit(Number(facingBetBb) || 0, 2));

  const toCallBb = Math.max(0, roundTableUnit(cleanFacingBetBb - cleanCommittedBb, 2));
  const callAmountBb = Math.min(cleanStackBb, toCallBb);
  const heroMaxTotalToBb = roundTableUnit(cleanCommittedBb + cleanStackBb, 2);

  const canCheck = toCallBb <= 0;
  const canCall = toCallBb > 0 && cleanStackBb > 0;

  if (isFixedLimit) {
    const fixedIncrementBb =
      normStreet === 'turn' || normStreet === 'river'
        ? Number((2 * cleanBb).toFixed(2))
        : Number((1 * cleanBb).toFixed(2));
    const cleanNumRaises = Math.max(0, Number(numRaisesOnStreet || 0));
    const cleanMaxRaises = Math.max(1, Number(maxRaisesPerRound || 4));
    const raiseCapReached = cleanNumRaises >= cleanMaxRaises;
    const canRaise = !raiseCapReached && cleanStackBb > toCallBb && heroMaxTotalToBb > cleanFacingBetBb;

    const targetFixedTotalBb = Number((cleanFacingBetBb + fixedIncrementBb).toFixed(2));
    const minRaiseToBb = canRaise ? Math.min(heroMaxTotalToBb, targetFixedTotalBb) : heroMaxTotalToBb;
    const maxRaiseToBb = minRaiseToBb;
    const isShortAllInOnly = canRaise && heroMaxTotalToBb < targetFixedTotalBb;

    const presets = canRaise
      ? [
          {
            id: cleanFacingBetBb > 0 ? 'fixed_raise' : 'fixed_bet',
            label: cleanFacingBetBb > 0 ? `Raise ${fixedIncrementBb} BB` : `Bet ${fixedIncrementBb} BB`,
            amountBb: minRaiseToBb,
          },
        ]
      : [];

    return {
      variant: normVariant,
      bettingStructure: activeBettingStructure,
      isPotLimit: false,
      isFixedLimit: true,
      fixedIncrementBb,
      numRaisesOnStreet: cleanNumRaises,
      maxRaisesPerRound: cleanMaxRaises,
      raiseCapReached,
      canCheck,
      canCall,
      canRaise,
      toCallBb,
      callAmountBb,
      minRaiseIncrementBb: fixedIncrementBb,
      minRaiseToBb,
      maxRaiseToBb,
      maxPotLimitRaiseToBb: null,
      isShortAllInOnly,
      presets,
    };
  }

  const rawIncrement =
    Number.isFinite(Number(lastRaiseIncrementBb)) && Number(lastRaiseIncrementBb) > 0
      ? Number(lastRaiseIncrementBb)
      : cleanFacingBetBb > 0
        ? cleanFacingBetBb
        : cleanBb;
  const minRaiseIncrementBb = Math.max(cleanBb, roundTableUnit(rawIncrement, 2));
  const unboundedMinRaiseToBb =
    cleanFacingBetBb > 0
      ? roundTableUnit(cleanFacingBetBb + minRaiseIncrementBb, 2)
      : cleanBb;
  const minRaiseToBb = roundTableUnit(Math.min(heroMaxTotalToBb, unboundedMinRaiseToBb), 2);

  // Pot-Limit maximum total bet/raise-to: currentPot + 2 * callAmount + heroCommitted
  const maxPotLimitRaiseToBb = roundTableUnit(
    cleanPotBb + 2 * callAmountBb + cleanCommittedBb,
    2
  );
  const maxRaiseToBb = isPotLimit
    ? roundTableUnit(Math.min(heroMaxTotalToBb, Math.max(minRaiseToBb, maxPotLimitRaiseToBb)), 2)
    : heroMaxTotalToBb;

  const canRaise = cleanStackBb > toCallBb && maxRaiseToBb > cleanFacingBetBb;
  const isShortAllInOnly = canRaise && heroMaxTotalToBb < unboundedMinRaiseToBb;

  const effectivePotAfterCall = roundTableUnit(cleanPotBb + callAmountBb, 2);
  const clampRaise = (val) => roundTableUnit(Math.max(minRaiseToBb, Math.min(maxRaiseToBb, val)), 2);

  const presets = canRaise
    ? isPotLimit
      ? [
          { id: 'p33', label: '33% Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall * 0.33) },
          { id: 'p50', label: '50% Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall * 0.5) },
          { id: 'p75', label: '75% Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall * 0.75) },
          { id: 'pot', label: 'Pot', amountBb: maxRaiseToBb },
        ]
      : [
          { id: 'p33', label: '33% Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall * 0.33) },
          { id: 'p67', label: '67% Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall * 0.67) },
          { id: 'pot', label: 'Pot', amountBb: clampRaise(cleanFacingBetBb + effectivePotAfterCall) },
          { id: 'allin', label: 'All-In', amountBb: heroMaxTotalToBb },
        ]
    : [];

  return {
    variant: normVariant,
    bettingStructure: activeBettingStructure,
    isPotLimit,
    isFixedLimit: false,
    fixedIncrementBb: null,
    numRaisesOnStreet: Math.max(0, Number(numRaisesOnStreet || 0)),
    maxRaisesPerRound: Math.max(1, Number(maxRaisesPerRound || 4)),
    raiseCapReached: false,
    canCheck,
    canCall,
    canRaise,
    toCallBb,
    callAmountBb,
    minRaiseIncrementBb,
    minRaiseToBb,
    maxRaiseToBb,
    maxPotLimitRaiseToBb: isPotLimit ? maxRaiseToBb : null,
    isShortAllInOnly,
    presets,
  };
}

export function roundTableUnit(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/**
 * Parses stakes strings or objects such as "0.25/0.50", "$1/$2", "5/10",
 * or { smallBlind: 0.25, bigBlind: 0.5 } into exact table unit multipliers.
 * Falls back to 100 chips per 1 BB only when no table stakes are specified.
 */
export function parseStakesToBlinds(stakesRaw = null, fallbackChipMultiplier = 100) {
  if (stakesRaw && typeof stakesRaw === 'object') {
    const sb = Number(stakesRaw.smallBlind ?? stakesRaw.sb);
    const bb = Number(stakesRaw.bigBlind ?? stakesRaw.bb);
    if (Number.isFinite(bb) && bb > 0) {
      const resolvedSb = Number.isFinite(sb) && sb > 0 ? sb : roundTableUnit(bb / 2, 2);
      const label = stakesRaw.stakesLabel || stakesRaw.label || `${resolvedSb}/${bb}`;
      return {
        hasExplicitStakes: true,
        stakesLabel: String(label),
        smallBlind: resolvedSb,
        bigBlind: bb,
        chipMultiplier: bb,
        isDecimalStakes: bb < 1 || !Number.isInteger(bb) || !Number.isInteger(resolvedSb),
      };
    }
  }

  const text = String(stakesRaw || '').trim();
  if (text) {
    const match = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*\/\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const sb = Number(match[1]);
      const bb = Number(match[2]);
      if (Number.isFinite(bb) && bb > 0) {
        return {
          hasExplicitStakes: true,
          stakesLabel: `${match[1]}/${match[2]}`,
          smallBlind: sb,
          bigBlind: bb,
          chipMultiplier: bb,
          isDecimalStakes: bb < 1 || !Number.isInteger(bb) || !Number.isInteger(sb),
        };
      }
    }
  }

  return {
    hasExplicitStakes: false,
    stakesLabel: '100/BB',
    smallBlind: roundTableUnit(fallbackChipMultiplier / 2, 2),
    bigBlind: fallbackChipMultiplier,
    chipMultiplier: fallbackChipMultiplier,
    isDecimalStakes: false,
  };
}

/**
 * Converts a BB amount into table chips/currency using the active stakes.
 */
export function convertBbToTableChips(bbValue, stakesRaw = null, fallbackChipMultiplier = 100) {
  const n = Number(bbValue);
  if (!Number.isFinite(n)) return 0;
  const stakes =
    stakesRaw && typeof stakesRaw === 'object' && typeof stakesRaw.chipMultiplier === 'number'
      ? stakesRaw
      : parseStakesToBlinds(stakesRaw, fallbackChipMultiplier);
  return roundTableUnit(n * stakes.chipMultiplier, stakes.isDecimalStakes ? 2 : 2);
}

/**
 * Formats a BB value for display in either 'bb' or 'chips' mode, honoring table stakes.
 */
export function formatTableDisplayUnit(bbValue, displayMode = 'bb', stakesRaw = null) {
  const n = Number(bbValue);
  if (!Number.isFinite(n)) return displayMode === 'chips' ? '0' : '0 BB';
  if (displayMode === 'chips') {
    const stakes =
      stakesRaw && typeof stakesRaw === 'object' && typeof stakesRaw.chipMultiplier === 'number'
        ? stakesRaw
        : parseStakesToBlinds(stakesRaw);
    const rawChips = n * stakes.chipMultiplier;
    if (stakes.hasExplicitStakes) {
      const formatted = Number.isInteger(roundTableUnit(rawChips, 2))
        ? String(Math.round(rawChips))
        : roundTableUnit(rawChips, 2).toFixed(2).replace(/\.?0+$/, '');
      return `${formatted} Chips`;
    }
    const chips = Math.round(rawChips);
    return `${chips.toLocaleString('en-US')} Chips`;
  }
  const cleanBb = Number(n.toFixed(1));
  return `${cleanBb} BB`;
}

/**
 * Computes Main Pot and Side Pots across any number of active/all-in/folded seats.
 * Each seat in `seats` may supply:
 *   { position, committedBb, stackRemainingBb, folded, allIn }
 */
export function computeMainAndSidePots(seats = [], deadPotBb = 0) {
  const normalized = (Array.isArray(seats) ? seats : []).map((s, idx) => {
    const committedBb = Math.max(0, roundTableUnit(Number(s?.committedBb ?? s?.committed ?? 0), 2));
    const stackRemainingBb = Math.max(0, roundTableUnit(Number(s?.stackRemainingBb ?? s?.stackBb ?? 0), 2));
    const folded = Boolean(s?.folded);
    const allIn = Boolean(s?.allIn || (!folded && stackRemainingBb <= 0 && committedBb > 0));
    return {
      seatIndex: s?.seatIndex ?? idx,
      position: String(s?.position || `SEAT_${idx + 1}`).toUpperCase(),
      committedBb,
      stackRemainingBb,
      folded,
      allIn,
    };
  });

  const baseDeadBb = Math.max(0, roundTableUnit(Number(deadPotBb) || 0, 2));
  const nonZeroLevels = Array.from(
    new Set(
      normalized
        .filter((s) => s.committedBb > 0)
        .map((s) => s.committedBb)
    )
  ).sort((a, b) => a - b);

  if (nonZeroLevels.length === 0) {
    const defaultEligible = normalized.filter((s) => !s.folded).map((s) => s.position);
    return {
      mainPotBb: baseDeadBb,
      mainPot: {
        name: 'Main Pot',
        amountBb: baseDeadBb,
        eligiblePositions: defaultEligible,
        eligibleSeatIds: defaultEligible,
      },
      sidePots: [],
      pots: baseDeadBb > 0
        ? [{ name: 'Main Pot', amountBb: baseDeadBb, eligiblePositions: defaultEligible, eligibleSeatIds: defaultEligible }]
        : [],
      totalPotBb: baseDeadBb,
      uncalledReturnBb: 0,
      uncalledSeatPosition: null,
      resultingStacks: Object.fromEntries(normalized.map((s) => [s.position, s.stackRemainingBb])),
    };
  }

  const pots = [];
  let prevCap = 0;
  let uncalledReturnBb = 0;
  let uncalledSeatPosition = null;
  const resultingStacks = Object.fromEntries(normalized.map((s) => [s.position, s.stackRemainingBb]));

  for (let i = 0; i < nonZeroLevels.length; i += 1) {
    const cap = nonZeroLevels[i];
    const slice = roundTableUnit(cap - prevCap, 2);
    if (slice <= 0) continue;

    const contributors = normalized.filter((s) => s.committedBb >= cap);
    const partialFoldedContributions = normalized
      .filter((s) => s.folded && s.committedBb > prevCap && s.committedBb < cap)
      .reduce((sum, s) => sum + (s.committedBb - prevCap), 0);

    const eligible = contributors.filter((s) => !s.folded).map((s) => s.position);
    const otherActiveCanCall = normalized.some(
      (s) => !s.folded && s.position !== eligible[0] && !s.allIn && s.stackRemainingBb > 0 && s.committedBb < cap
    );

    // If only 1 player contributed at the highest tier and nobody else matched it (nor has chips left to call), that slice is an uncalled bet
    if (contributors.length === 1 && eligible.length === 1 && i === nonZeroLevels.length - 1 && pots.length > 0 && !otherActiveCanCall) {
      uncalledReturnBb = slice;
      uncalledSeatPosition = eligible[0];
      resultingStacks[uncalledSeatPosition] = roundTableUnit((resultingStacks[uncalledSeatPosition] || 0) + slice, 2);
      prevCap = cap;
      continue;
    }

    const sliceAmountBb = roundTableUnit(
      contributors.length * slice + partialFoldedContributions + (pots.length === 0 ? baseDeadBb : 0),
      2
    );

    if ( pots.length > 0 &&
      pots[pots.length - 1].eligiblePositions.length === eligible.length &&
      pots[pots.length - 1].eligiblePositions.every((pos) => eligible.includes(pos))
    ) {
      pots[pots.length - 1].amountBb = roundTableUnit(pots[pots.length - 1].amountBb + sliceAmountBb, 2);
      pots[pots.length - 1].capPerPlayerBb = cap;
    } else {
      pots.push({
        name: pots.length === 0 ? 'Main Pot' : `Side Pot ${pots.length}`,
        amountBb: sliceAmountBb,
        capPerPlayerBb: cap,
        eligiblePositions: eligible,
        eligibleSeatIds: eligible,
      });
    }

    prevCap = cap;
  }

  const mainPotBb = pots.length > 0 ? pots[0].amountBb : baseDeadBb;
  const mainPot = pots.length > 0
    ? pots[0]
    : { name: 'Main Pot', amountBb: baseDeadBb, eligiblePositions: [], eligibleSeatIds: [] };
  const sidePots = pots.slice(1);
  const totalPotBb = roundTableUnit(pots.reduce((acc, p) => acc + p.amountBb, 0), 2);

  return {
    mainPotBb,
    mainPot,
    sidePots,
    pots,
    totalPotBb,
    uncalledReturnBb,
    uncalledSeatPosition,
    resultingStacks,
  };
}

export function computePotBreakdown(input = {}, deadPotArg = 0) {
  if (Array.isArray(input)) {
    return computeMainAndSidePots(input, deadPotArg);
  }
  const seats = Array.isArray(input?.seats) ? input.seats : [];
  const deadPotBb = input?.deadPotBb ?? deadPotArg ?? 0;
  return computeMainAndSidePots(seats, deadPotBb);
}

/**
 * Determines the next actor in Club Arena seat order who is neither folded nor all-in.
 * Supports both seat-object arrays (`seats`) and position-list invocation (`activePositions`, `currentActor`, `format`).
 */
export function resolveNextActor({
  seats = null,
  activePositions = SIX_MAX_POSITIONS,
  currentActorPosition = null,
  currentActor = null,
  lastAggressor = null,
  street = 'flop',
  highestBetBb = 0,
  actedPositions = [],
  foldedPositions = [],
  allInPositions = [],
  format = 'cash',
} = {}) {
  const normStreet = String(street || 'flop').trim().toLowerCase();
  const normFormat = normalizeGameFormat(format);
  const currPos = String(currentActorPosition || currentActor || '').trim().toUpperCase();

  const foldedSet = new Set((Array.isArray(foldedPositions) ? foldedPositions : []).map((p) => String(p).toUpperCase()));
  const allInSet = new Set((Array.isArray(allInPositions) ? allInPositions : []).map((p) => String(p).toUpperCase()));

  const rawSeatList = Array.isArray(seats) && seats.length > 0
    ? seats.map((s, idx) => {
        const pos = String(s?.position || s?.seatId || s?.id || `SEAT_${idx + 1}`).toUpperCase();
        return {
          position: pos,
          folded: Boolean(s?.folded || foldedSet.has(pos)),
          allIn: Boolean(s?.allIn || allInSet.has(pos) || (s?.stackRemainingBb !== undefined && Number(s.stackRemainingBb) <= 0)),
          committedBb: Number(s?.committedBb ?? 0),
          hasExplicitStack: s?.stackRemainingBb !== undefined || s?.stackBb !== undefined,
          stackRemainingBb: Number(s?.stackRemainingBb ?? s?.stackBb ?? 100),
        };
      })
    : (Array.isArray(activePositions) ? activePositions : SIX_MAX_POSITIONS).map((posRaw) => {
        const pos = String(posRaw || '').toUpperCase();
        return {
          position: pos,
          folded: foldedSet.has(pos),
          allIn: allInSet.has(pos),
          committedBb: 0,
          hasExplicitStack: false,
          stackRemainingBb: 100,
        };
      });

  const activeSeats = rawSeatList.filter((s) => !s.folded);
  if (activeSeats.length <= 1) return null;

  const isHeadsUp =
    normFormat === 'hu' ||
    rawSeatList.length === 2 ||
    (activeSeats.length === 2 && !Array.isArray(seats) && Array.isArray(activePositions) && activePositions.length === 2);

  let order;
  if (isHeadsUp) {
    order = normStreet === 'preflop'
      ? ['BTN', 'SB', 'BB']
      : ['BB', 'BTN', 'SB'];
  } else if (normFormat === 'spins') {
    order = normStreet === 'preflop'
      ? ['BTN', 'SB', 'BB']
      : ['SB', 'BB', 'BTN'];
  } else {
    order = normStreet === 'preflop' ? POSITION_ORDER_PREFLOP : POSITION_ORDER_POSTFLOP;
  }

  const sorted = [...activeSeats].sort((a, b) => {
    const idxA = order.indexOf(String(a.position || '').toUpperCase());
    const idxB = order.indexOf(String(b.position || '').toUpperCase());
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  if (!currPos) {
    const firstEligible = sorted.find((s) => !s.allIn);
    return firstEligible ? firstEligible.position : null;
  }

  const currIdx = sorted.findIndex((s) => String(s.position || '').toUpperCase() === currPos);
  const actedSet = new Set((Array.isArray(actedPositions) ? actedPositions : []).map((p) => String(p).toUpperCase()));
  actedSet.add(currPos);
  const cleanAggressor = lastAggressor ? String(lastAggressor).trim().toUpperCase() : null;

  for (let offset = 1; offset <= sorted.length; offset += 1) {
    const candidate = sorted[(Math.max(0, currIdx) + offset) % sorted.length];
    const pos = String(candidate.position || '').toUpperCase();
    if (pos === currPos) continue;
    if (cleanAggressor && pos === cleanAggressor && actedSet.has(pos) && candidate.committedBb >= highestBetBb) {
      continue;
    }
    const isAllIn = Boolean(candidate.allIn || (candidate.hasExplicitStack && candidate.stackRemainingBb <= 0));
    if (isAllIn) continue;
    const committed = Number(candidate.committedBb ?? 0);
    if (committed < highestBetBb || !actedSet.has(pos)) {
      return pos;
    }
  }
  return null;
}

/**
 * Computes the complete Club Arena 1:1 decision state for a given hand state.
 */
export function computeClubArenaParityState({
  variant = 'nlh',
  street = 'flop',
  potBb = 6.5,
  deadPotBb = null,
  heroPosition = 'BTN',
  heroStackBb = 100,
  heroCommittedBb = 0,
  facingBetBb = 0,
  previousBetBb = 0,
  lastFullRaiseIncrementBb = null,
  heroAlreadyActedOnStreet = false,
  seats = null,
  stakes = null,
  actedPositions = [],
  bettingStructure = null,
  format = 'cash',
  numRaisesOnStreet = 0,
  maxRaisesPerRound = 4,
} = {}) {
  const activeBettingStructure = normalizeBettingStructure(bettingStructure, variant);
  const isPotLimit = activeBettingStructure === 'pot_limit';
  const isFixedLimit = activeBettingStructure === 'fixed_limit';
  const normFormat = normalizeGameFormat(format);
  const stakesInfo = parseStakesToBlinds(stakes);
  const cleanHeroCommittedBb = Math.max(0, roundTableUnit(Number(heroCommittedBb) || 0, 2));
  const cleanHeroStackBb = Math.max(0, roundTableUnit(Number(heroStackBb) || 0, 2));
  const cleanFacingBetBb = Math.max(0, roundTableUnit(Number(facingBetBb) || 0, 2));
  const cleanPrevBetBb = Math.max(0, roundTableUnit(Number(previousBetBb) || 0, 2));
  const normStreet = String(street || 'flop').toLowerCase();

  // Total increment of the latest bet/raise above the prior bet
  const latestRaiseIncrementBb = roundTableUnit(Math.max(0, cleanFacingBetBb - cleanPrevBetBb), 2);
  const fixedIncrementBb = isFixedLimit
    ? normStreet === 'turn' || normStreet === 'river'
      ? 2
      : 1
    : null;
  const fullRaiseIncrementBb = isFixedLimit
    ? fixedIncrementBb
    : roundTableUnit(
        Number.isFinite(Number(lastFullRaiseIncrementBb)) && Number(lastFullRaiseIncrementBb) > 0
          ? Number(lastFullRaiseIncrementBb)
          : Math.max(1, cleanPrevBetBb > 0 ? cleanPrevBetBb : cleanFacingBetBb || 1),
        2
      );

  const rawCallNeededBb = Math.max(0, roundTableUnit(cleanFacingBetBb - cleanHeroCommittedBb, 2));
  const callAmountBb = Math.min(cleanHeroStackBb, rawCallNeededBb);

  // Short all-in rule (WSOP / TDA / Club Arena):
  // An all-in raise of less than the previous full bet/raise increment does NOT reopen
  // betting/raising to a player who has already acted on the current street.
  const isShortAllInRaise =
    cleanFacingBetBb > cleanHeroCommittedBb &&
    latestRaiseIncrementBb > 0 &&
    latestRaiseIncrementBb < fullRaiseIncrementBb;
  const reopensAction = !(heroAlreadyActedOnStreet && isShortAllInRaise);

  // Build default seats if not explicitly passed
  const effectiveSeats = Array.isArray(seats) && seats.length > 0
    ? seats.map((s) => ({
        ...s,
        position: String(s.position || '').toUpperCase(),
        committedBb: roundTableUnit(Number(s.committedBb ?? 0), 2),
        stackRemainingBb: roundTableUnit(Number(s.stackRemainingBb ?? s.stackBb ?? 100), 2),
        folded: Boolean(s.folded),
        allIn: Boolean(s.allIn || Number(s.stackRemainingBb ?? s.stackBb ?? 100) <= 0),
      }))
    : [
        {
          position: String(heroPosition || 'BTN').toUpperCase(),
          committedBb: cleanHeroCommittedBb,
          stackRemainingBb: cleanHeroStackBb,
          folded: false,
          allIn: cleanHeroStackBb <= 0,
        },
        {
          position: String(heroPosition || 'BTN').toUpperCase() === 'BB' ? 'BTN' : 'BB',
          committedBb: cleanFacingBetBb,
          stackRemainingBb: Math.max(0, roundTableUnit(100 - cleanFacingBetBb, 2)),
          folded: false,
          allIn: false,
        },
      ];

  const totalCommittedInSeatsBb = roundTableUnit(
    effectiveSeats.reduce((sum, s) => sum + (Number(s.committedBb) || 0), 0),
    2
  );
  const resolvedDeadPotBb =
    deadPotBb !== null && Number.isFinite(Number(deadPotBb))
      ? Math.max(0, roundTableUnit(Number(deadPotBb), 2))
      : Math.max(0, roundTableUnit((Number(potBb) || 0) - totalCommittedInSeatsBb, 2));

  const potStateBeforeAction = computeMainAndSidePots(effectiveSeats, resolvedDeadPotBb);
  const currentPotBeforeCallBb = roundTableUnit(
    Math.max(Number(potBb) || 0, potStateBeforeAction.totalPotBb),
    2
  );

  const heroMaxTotalToBb = roundTableUnit(cleanHeroCommittedBb + cleanHeroStackBb, 2);
  const raiseCapReached = isFixedLimit && Number(numRaisesOnStreet || 0) >= Number(maxRaisesPerRound || 4);

  // Min Raise-To in BB:
  // If facing a bet, minRaiseTo = facingBet + max(1, fullRaiseIncrement). Capped at hero's all-in total.
  const minRaiseUnboundedBb = isFixedLimit
    ? roundTableUnit(cleanFacingBetBb + fixedIncrementBb, 2)
    : cleanFacingBetBb > 0
      ? roundTableUnit(cleanFacingBetBb + Math.max(1, fullRaiseIncrementBb), 2)
      : 1;
  const minRaiseToBb = roundTableUnit(Math.min(heroMaxTotalToBb, minRaiseUnboundedBb), 2);

  // Max Raise-To in BB:
  // In Pot-Limit, a player may call the facing bet and then raise up to the size of the resulting pot:
  //   maxAdditionalRaise = currentPotBeforeCallBb + callAmountBb
  //   maxRaiseToBb = cleanHeroCommittedBb + callAmountBb + (currentPotBeforeCallBb + callAmountBb)
  //                = currentPotBeforeCallBb + 2 * callAmountBb + cleanHeroCommittedBb
  const potLimitMaxRaiseToBb = roundTableUnit(
    currentPotBeforeCallBb + 2 * callAmountBb + cleanHeroCommittedBb,
    2
  );
  const maxRaiseToBb = isFixedLimit
    ? minRaiseToBb
    : isPotLimit
      ? roundTableUnit(Math.min(heroMaxTotalToBb, Math.max(minRaiseToBb, potLimitMaxRaiseToBb)), 2)
      : heroMaxTotalToBb;

  const canCheck = rawCallNeededBb <= 0;
  const canCall = rawCallNeededBb > 0 && cleanHeroStackBb > 0;
  const canRaise =
    reopensAction &&
    !raiseCapReached &&
    cleanHeroStackBb > rawCallNeededBb &&
    maxRaiseToBb > cleanFacingBetBb;

  const legalActions = [];
  if (canCheck) {
    legalActions.push('check');
    if (canRaise) {
      legalActions.push('bet');
      if ((!isPotLimit && !isFixedLimit) || maxRaiseToBb >= heroMaxTotalToBb) {
        legalActions.push('all_in');
      }
    }
  } else {
    legalActions.push('fold');
    if (canCall) {
      legalActions.push(cleanHeroStackBb <= rawCallNeededBb ? 'all_in' : 'call');
    }
    if (canRaise) {
      legalActions.push('raise');
      if ((!isPotLimit && !isFixedLimit) || maxRaiseToBb >= heroMaxTotalToBb) {
        if (!legalActions.includes('all_in')) legalActions.push('all_in');
      }
    }
  }

  return {
    variant: String(variant || 'nlh').toLowerCase(),
    bettingStructure: activeBettingStructure,
    format: normFormat,
    isPotLimit,
    isFixedLimit,
    fixedIncrementBb,
    raiseCapReached,
    street: normStreet,
    heroPosition: String(heroPosition || 'BTN').toUpperCase(),
    stakes: stakesInfo,
    potBeforeActionBb: currentPotBeforeCallBb,
    potBeforeActionChips: convertBbToTableChips(currentPotBeforeCallBb, stakesInfo),
    deadPotBb: resolvedDeadPotBb,
    heroStackBb: cleanHeroStackBb,
    heroStackChips: convertBbToTableChips(cleanHeroStackBb, stakesInfo),
    heroCommittedBb: cleanHeroCommittedBb,
    facingBetBb: cleanFacingBetBb,
    callAmountBb,
    callAmountChips: convertBbToTableChips(callAmountBb, stakesInfo),
    lastFullRaiseIncrementBb: fullRaiseIncrementBb,
    latestRaiseIncrementBb,
    isShortAllInRaise,
    reopensAction,
    minRaiseToBb,
    minRaiseToChips: convertBbToTableChips(minRaiseToBb, stakesInfo),
    maxRaiseToBb,
    maxRaiseToChips: convertBbToTableChips(maxRaiseToBb, stakesInfo),
    legalActions,
    mainPotBb: potStateBeforeAction.mainPotBb,
    sidePots: potStateBeforeAction.sidePots,
    pots: potStateBeforeAction.pots,
    resultingStacks: potStateBeforeAction.resultingStacks,
    seats: effectiveSeats,
    actedPositions,
  };
}

/**
 * Executes an action against a Club Arena parity state and returns the resulting post-action state
 * (submitted amount, resulting stacks, main & side pots, and next actor).
 */
export function applyClubArenaAction(parityInput = {}, action = {}) {
  const preState =
    parityInput && Array.isArray(parityInput.legalActions)
      ? parityInput
      : computeClubArenaParityState(parityInput);

  const actionType = String(action.type || 'check').toLowerCase();
  const heroPos = preState.heroPosition;

  let targetTotalCommittedBb = preState.heroCommittedBb;
  if (actionType === 'fold' || actionType === 'check') {
    targetTotalCommittedBb = preState.heroCommittedBb;
  } else if (actionType === 'call') {
    targetTotalCommittedBb = roundTableUnit(preState.heroCommittedBb + preState.callAmountBb, 2);
  } else if (actionType === 'all_in') {
    const maxAllowed = preState.isPotLimit
      ? preState.maxRaiseToBb
      : roundTableUnit(preState.heroCommittedBb + preState.heroStackBb, 2);
    targetTotalCommittedBb = maxAllowed;
  } else if (actionType === 'bet' || actionType === 'raise') {
    if (!preState.reopensAction && preState.facingBetBb > 0) {
      throw new Error('Action does not reopen raising after a short all-in.');
    }
    const requestedToBb = Number(action.amountBb ?? action.raiseToBb ?? preState.minRaiseToBb);
    targetTotalCommittedBb = roundTableUnit(
      Math.max(preState.minRaiseToBb, Math.min(preState.maxRaiseToBb, requestedToBb)),
      2
    );
  }

  const additionalPutInBb = Math.max(0, roundTableUnit(targetTotalCommittedBb - preState.heroCommittedBb, 2));
  const updatedSeats = preState.seats.map((seat) => {
    if (String(seat.position || '').toUpperCase() !== heroPos) return { ...seat };
    if (actionType === 'fold') {
      return { ...seat, folded: true };
    }
    const nextStackBb = Math.max(0, roundTableUnit(seat.stackRemainingBb - additionalPutInBb, 2));
    return {
      ...seat,
      committedBb: targetTotalCommittedBb,
      stackRemainingBb: nextStackBb,
      allIn: nextStackBb <= 0,
    };
  });

  const highestBetAfterBb = Math.max(
    preState.facingBetBb,
    ...updatedSeats.map((s) => Number(s.committedBb) || 0)
  );
  const potResult = computeMainAndSidePots(updatedSeats, preState.deadPotBb);
  const nextActor = resolveNextActor({
    seats: updatedSeats,
    currentActorPosition: heroPos,
    street: preState.street,
    highestBetBb: highestBetAfterBb,
    actedPositions: [...(preState.actedPositions || []), heroPos],
  });

  return {
    actionType,
    submittedTotalBb: targetTotalCommittedBb,
    submittedTotalChips: convertBbToTableChips(targetTotalCommittedBb, preState.stakes),
    additionalPutInBb,
    additionalPutInChips: convertBbToTableChips(additionalPutInBb, preState.stakes),
    resultingStacks: potResult.resultingStacks,
    resultingStacksChips: Object.fromEntries(
      Object.entries(potResult.resultingStacks).map(([pos, bb]) => [
        pos,
        convertBbToTableChips(bb, preState.stakes),
      ])
    ),
    mainPotBb: potResult.mainPotBb,
    mainPotChips: convertBbToTableChips(potResult.mainPotBb, preState.stakes),
    sidePots: potResult.sidePots.map((sp) => ({
      ...sp,
      amountChips: convertBbToTableChips(sp.amountBb, preState.stakes),
    })),
    totalPotBb: potResult.totalPotBb,
    totalPotChips: convertBbToTableChips(potResult.totalPotBb, preState.stakes),
    uncalledReturnBb: potResult.uncalledReturnBb,
    uncalledSeatPosition: potResult.uncalledSeatPosition,
    nextActor,
    reopensAction: preState.reopensAction,
    legalActionsBefore: preState.legalActions,
    seatsAfter: updatedSeats,
  };
}

/**
 * Evaluates a user's custom chosen raise size against the graded reference option
 * and computes exact-size feedback so the user sees both the size they chose and
 * the reference size graded, plus exact-size EV/geometry guidance.
 */
export function evaluateCustomRaiseSizing({
  chosenSizingBb,
  gradedOption = null,
  minRaiseToBb = 2,
  maxRaiseToBb = 100,
  potBb = 6.5,
  callBb = 0,
  variant = 'nlh',
  street = 'flop',
  stakes = null,
  brainEvaluation = null,
} = {}) {
  const stakesInfo = parseStakesToBlinds(stakes);
  const cleanChosenBb = roundTableUnit(Number(chosenSizingBb) || 0, 2);
  const gradedLabel = String(gradedOption?.label || gradedOption?.text || gradedOption?.id || 'Raise');
  const effectivePotAfterCall = Math.max(1, (Number(potBb) || 1) + (Number(callBb) || 0));
  const unitMatch = gradedLabel.match(/(\d+(?:\.\d+)?)\s*(?:bb|chips)/i);
  const pctMatch = !unitMatch ? gradedLabel.match(/(\d+(?:\.\d+)?)\s*%/i) : null;
  const parsedLabelBb = unitMatch
    ? Number(unitMatch[1])
    : pctMatch
      ? roundTableUnit(effectivePotAfterCall * (Number(pctMatch[1]) / 100), 2)
      : NaN;
  const explicitGradedBb = Number(gradedOption?.sizingBb ?? gradedOption?.amountBb ?? parsedLabelBb);
  const cleanGradedBb = Number.isFinite(explicitGradedBb) && explicitGradedBb > 0
    ? roundTableUnit(explicitGradedBb, 2)
    : cleanChosenBb;

  const deltaBb = roundTableUnit(cleanChosenBb - cleanGradedBb, 2);
  const isExactMatch = Math.abs(deltaBb) < 0.15;
  const raiseOverCallBb = Math.max(0, cleanChosenBb - (Number(callBb) || 0));
  const potFractionPct = Math.round((raiseOverCallBb / effectivePotAfterCall) * 100);

  const isPotLimit = isPotLimitVariant(variant);
  const baseEv = Number(brainEvaluation?.RecommendedActionEv ?? brainEvaluation?.ev ?? 1.25);
  // Continuous geometric penalty when deviating from reference solver node size
  const distanceRatio = Math.min(1.5, Math.abs(deltaBb) / Math.max(2, effectivePotAfterCall));
  const exactSizeEvPenaltyBb = isExactMatch ? 0 : roundTableUnit(distanceRatio * 0.28, 2);
  const exactSizeEvEstimateBb = roundTableUnit(baseEv - exactSizeEvPenaltyBb, 2);

  let exactSizeVerdict;
  if (isExactMatch) {
    exactSizeVerdict = `Exact match with solver node (${cleanChosenBb} BB / ${potFractionPct}% pot). Full node EV retained (${exactSizeEvEstimateBb >= 0 ? '+' : ''}${exactSizeEvEstimateBb} BB).`;
  } else if (isPotLimit && cleanChosenBb >= maxRaiseToBb - 0.1) {
    exactSizeVerdict = `Pot-limit maximum (${cleanChosenBb} BB / 100% pot) selected; mapped to nearest solver node "${gradedLabel}" (${cleanGradedBb} BB). Exact-size EV: ${exactSizeEvEstimateBb >= 0 ? '+' : ''}${exactSizeEvEstimateBb} BB (Δ ${deltaBb >= 0 ? '+' : ''}${deltaBb} BB vs node).`;
  } else if (deltaBb > 0) {
    exactSizeVerdict = `Custom Polarized Size (${cleanChosenBb} BB / ${potFractionPct}% pot) exceeds nearest graded node "${gradedLabel}" (${cleanGradedBb} BB) by +${deltaBb} BB. Exact-size EV estimate: ${exactSizeEvEstimateBb >= 0 ? '+' : ''}${exactSizeEvEstimateBb} BB (${exactSizeEvPenaltyBb} BB sizing drift).`;
  } else {
    exactSizeVerdict = `Custom Condensed Size (${cleanChosenBb} BB / ${potFractionPct}% pot) is ${Math.abs(deltaBb)} BB smaller than nearest graded node "${gradedLabel}" (${cleanGradedBb} BB). Exact-size EV estimate: ${exactSizeEvEstimateBb >= 0 ? '+' : ''}${exactSizeEvEstimateBb} BB (${exactSizeEvPenaltyBb} BB sizing drift).`;
  }

  return {
    chosenSizingBb: cleanChosenBb,
    chosenSizingChips: convertBbToTableChips(cleanChosenBb, stakesInfo),
    chosenSizingFormattedBb: formatTableDisplayUnit(cleanChosenBb, 'bb', stakesInfo),
    chosenSizingFormattedChips: formatTableDisplayUnit(cleanChosenBb, 'chips', stakesInfo),
    gradedOptionId: gradedOption?.id || null,
    gradedOptionLabel: gradedLabel,
    gradedSizingBb: cleanGradedBb,
    gradedSizingChips: convertBbToTableChips(cleanGradedBb, stakesInfo),
    gradedSizingFormattedBb: formatTableDisplayUnit(cleanGradedBb, 'bb', stakesInfo),
    gradedSizingFormattedChips: formatTableDisplayUnit(cleanGradedBb, 'chips', stakesInfo),
    sizingDeltaBb: deltaBb,
    isExactMatch,
    potFractionPct,
    exactSizeEvPenaltyBb,
    exactSizeEvEstimateBb,
    exactSizeVerdict,
    minRaiseToBb,
    maxRaiseToBb,
  };
}

function splitPortionAmongWinners(portionBb, winnerSeatIds, payoutsBySeatId) {
  if (!Array.isArray(winnerSeatIds) || winnerSeatIds.length === 0 || portionBb <= 0) {
    return {};
  }
  const totalCents = Math.round(portionBb * 100);
  const baseShareCents = Math.floor(totalCents / winnerSeatIds.length);
  let remainderCents = totalCents - baseShareCents * winnerSeatIds.length;
  const splitMap = {};

  for (const seatId of winnerSeatIds) {
    let shareCents = baseShareCents;
    if (remainderCents > 0) {
      shareCents += 1;
      remainderCents -= 1;
    }
    const shareBb = roundTableUnit(shareCents / 100, 2);
    splitMap[seatId] = roundTableUnit((splitMap[seatId] || 0) + shareBb, 2);
    payoutsBySeatId[seatId] = roundTableUnit((payoutsBySeatId[seatId] || 0) + shareBb, 2);
  }
  return splitMap;
}

/**
 * Evaluates a complete Showdown (Hold'em or Omaha 2-hole + 3-board, High-only or Hi-Lo 8-or-better)
 * and allocates Main Pot + Side Pots with odd-cent rules.
 */
export function evaluateShowdownAndAllocatePots({
  seats = [],
  boardCards = [],
  deadPotBb = 0,
  variant = 'nlh',
  hiLo = false,
} = {}) {
  const normVariant = normalizeTrainingVariant(variant);
  const isHiLo = Boolean(hiLo || isHiLoVariant(variant));
  const isOmaha = normVariant.startsWith('plo');
  const boardInts = parseDeckCards(Array.isArray(boardCards) ? boardCards : []);

  const normalizedSeats = (Array.isArray(seats) ? seats : []).map((s, idx) => {
    const rawId = s?.seatId || s?.id;
    const position = String(s?.position || rawId || `SEAT_${idx + 1}`).toUpperCase();
    const seatId = rawId ? String(rawId) : position;
    const holeCardsRaw = Array.isArray(s?.holeCards)
      ? s.holeCards
      : Array.isArray(s?.heroCards)
        ? s.heroCards
        : Array.isArray(s?.cards)
          ? s.cards
          : [];
    const holeInts = holeCardsRaw.length > 0 ? parseDeckCards(holeCardsRaw) : [];

    let highEval = null;
    let lowEval = null;

    if (!s?.folded && boardInts.length >= 3) {
      if (isOmaha && holeInts.length >= 4) {
        highEval = evaluateOmaha(holeInts, boardInts);
        if (isHiLo) {
          lowEval = evaluateLow(null, {
            omaha: true,
            holeCards: holeInts,
            boardCards: boardInts,
          });
        }
      } else if (holeInts.length >= 2 && holeInts.length + boardInts.length >= 5) {
        highEval = evaluateHoldem([...holeInts, ...boardInts]);
        if (isHiLo) {
          lowEval = evaluateLow([...holeInts, ...boardInts], { omaha: false });
        }
      }
    }

    return {
      ...s,
      seatId,
      position,
      holeCards: holeCardsRaw,
      committedBb: roundTableUnit(Number(s?.committedBb ?? s?.committed ?? 0), 2),
      stackRemainingBb: roundTableUnit(Number(s?.stackRemainingBb ?? s?.stackBb ?? 0), 2),
      folded: Boolean(s?.folded),
      highHand: highEval
        ? {
            score: highEval.score,
            category: highEval.category,
            categoryName: highEval.categoryName,
            description: highEval.description,
            bestFiveCards: Array.isArray(highEval.bestCards) ? highEval.bestCards.map(cardToString) : [],
            bestTwoHoleCards: Array.isArray(highEval.bestHole) ? highEval.bestHole.map(cardToString) : null,
            bestThreeBoardCards: Array.isArray(highEval.bestBoard) ? highEval.bestBoard.map(cardToString) : null,
          }
        : null,
      hasQualifyingLow: Boolean(lowEval),
      lowHand: lowEval
        ? {
            score: lowEval.score,
            ranks: lowEval.ranks,
            description: lowEval.description,
            bestFiveCards: Array.isArray(lowEval.cards) ? lowEval.cards.map(cardToString) : [],
          }
        : null,
    };
  });

  const seatByPos = new Map();
  for (const s of normalizedSeats) {
    seatByPos.set(s.position, s);
    seatByPos.set(s.seatId, s);
    seatByPos.set(String(s.seatId).toUpperCase(), s);
  }

  const potBreakdown = computePotBreakdown({
    seats: normalizedSeats.map((s) => ({
      ...s,
      position: s.seatId,
    })),
    deadPotBb,
  });

  const payoutsBySeatId = Object.fromEntries(normalizedSeats.map((s) => [s.seatId, 0]));
  const allHighWinners = new Set();
  const allLowWinners = new Set();
  const allocatedPots = [];

  for (const pot of potBreakdown.pots) {
    const eligibleIds = Array.isArray(pot.eligibleSeatIds)
      ? pot.eligibleSeatIds
      : Array.isArray(pot.eligiblePositions)
        ? pot.eligiblePositions
        : [];
    const eligibleSeats = eligibleIds
      .map((id) => seatByPos.get(String(id).toUpperCase()))
      .filter((s) => s && !s.folded);

    if (eligibleSeats.length === 0) continue;

    // Sort eligible seats by postflop position order so odd 0.01 BB goes to the first seat in position order
    const orderedEligible = [...eligibleSeats].sort((a, b) => {
      const idxA = POSITION_ORDER_POSTFLOP.indexOf(a.position);
      const idxB = POSITION_ORDER_POSTFLOP.indexOf(b.position);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const seatsWithHigh = orderedEligible.filter((s) => s.highHand);
    const bestHighScore = seatsWithHigh.length > 0
      ? Math.max(...seatsWithHigh.map((s) => s.highHand.score))
      : -Infinity;
    const potHighWinners = seatsWithHigh.length > 0
      ? seatsWithHigh.filter((s) => s.highHand.score === bestHighScore).map((s) => s.seatId)
      : [orderedEligible[0].seatId];

    for (const w of potHighWinners) allHighWinners.add(w);

    const qualifyingLowSeats = isHiLo
      ? orderedEligible.filter((s) => s.hasQualifyingLow && s.lowHand)
      : [];

    let hiPortionBb = pot.amountBb;
    let loPortionBb = 0;
    let potLowWinners = [];

    if (isHiLo && qualifyingLowSeats.length > 0) {
      hiPortionBb = roundTableUnit(Math.ceil((pot.amountBb * 100) / 2) / 100, 2);
      loPortionBb = roundTableUnit(pot.amountBb - hiPortionBb, 2);

      const bestLowScore = Math.min(...qualifyingLowSeats.map((s) => s.lowHand.score));
      potLowWinners = qualifyingLowSeats
        .filter((s) => s.lowHand.score === bestLowScore)
        .map((s) => s.seatId);
      for (const w of potLowWinners) allLowWinners.add(w);
    }

    const highPayouts = splitPortionAmongWinners(hiPortionBb, potHighWinners, payoutsBySeatId);
    const lowPayouts = loPortionBb > 0
      ? splitPortionAmongWinners(loPortionBb, potLowWinners, payoutsBySeatId)
      : {};

    allocatedPots.push({
      name: pot.name,
      amountBb: pot.amountBb,
      eligibleSeatIds: eligibleIds,
      eligiblePositions: eligibleIds,
      hiPortionBb,
      loPortionBb,
      highWinners: potHighWinners,
      lowWinners: potLowWinners,
      highPayouts,
      lowPayouts,
      hasQualifyingLow: qualifyingLowSeats.length > 0,
    });
  }

  const anyQualifyingLow = normalizedSeats.some((s) => !s.folded && s.hasQualifyingLow);

  return {
    variant: normVariant,
    isHiLo,
    pots: allocatedPots,
    payoutsBySeatId,
    highWinners: [...allHighWinners],
    lowWinners: [...allLowWinners],
    hasQualifyingLow: anyQualifyingLow,
    evaluatedSeats: normalizedSeats,
  };
}

const FORBIDDEN_LIVE_TABLES_OR_ENDPOINTS = Object.freeze([
  'wallets',
  'diamond_ledger',
  'club_transactions',
  'cash_game_seats',
  'live_tables',
  'rake_records',
  'tournament_payouts',
]);

/**
 * Verifies that training mode is strictly isolated from live wallets,
 * live tables, live payouts/rake, and live leaderboards.
 */
export function verifyTrainingPracticeIsolation(context = {}) {
  const targetEndpoint = String(context?.targetEndpoint || context?.endpoint || '').toLowerCase();
  const tableName = String(context?.tableName || context?.table || '').toLowerCase();

  for (const forbidden of FORBIDDEN_LIVE_TABLES_OR_ENDPOINTS) {
    if (
      tableName === forbidden ||
      tableName.includes(forbidden) ||
      targetEndpoint.includes(forbidden)
    ) {
      return {
        isolated: false,
        violation: `Forbidden live financial or game resource referenced in training mode: ${forbidden}`,
        targetEndpoint: context?.targetEndpoint || null,
        tableName: context?.tableName || null,
        currencyMode: 'PRACTICE_EV_BB_ONLY',
        walletMutationAllowed: false,
        liveSeatMutationAllowed: false,
        livePayoutCreationAllowed: false,
        liveStatsContaminationAllowed: false,
      };
    }
  }

  return {
    isolated: true,
    currencyMode: 'PRACTICE_EV_BB_ONLY',
    walletMutationAllowed: false,
    liveSeatMutationAllowed: false,
    livePayoutCreationAllowed: false,
    liveStatsContaminationAllowed: false,
    verifiedAt: 'HARDCODED_STATIC_CONTRACT',
  };
}

export const TABLE_RULE_MODES = Object.freeze([
  'standard',
  'bb_ante',
  'utg_straddle',
  'bomb_pot',
  'double_board_bomb_pot',
]);

export function normalizeTableRule(rule = 'standard') {
  const r = String(rule || 'standard').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (r === 'bb_ante' || r === 'big_blind_ante' || r === 'bba') return 'bb_ante';
  if (r === 'utg_straddle' || r === 'straddle' || r === 'utg_straddle_2bb') return 'utg_straddle';
  if (r === 'double_board_bomb_pot' || r === 'double_bomb_pot' || r === 'db_bomb_pot' || r === 'double_board') {
    return 'double_board_bomb_pot';
  }
  if (r === 'bomb_pot' || r === 'bombpot') return 'bomb_pot';
  if (TABLE_RULE_MODES.includes(r)) return r;
  return 'standard';
}

export function computeTableRuleDeadMoney({
  tableRule = 'standard',
  basePotBb = 6.5,
  playerCount = 6,
  bigBlindBb = 1,
  anteBb = null,
} = {}) {
  const normRule = normalizeTableRule(tableRule);
  const cleanBb = Math.max(0.01, roundTableUnit(Number(bigBlindBb) || 1, 2));
  const cleanPlayers = Math.max(2, Math.round(Number(playerCount) || 6));

  let deadMoneyAddedBb = 0;
  let effectiveMinOpenBb = 2;
  let skipsPreflop = false;
  let isDoubleBoard = false;
  let ruleLabel = 'Standard Blinds';

  if (normRule === 'bb_ante') {
    deadMoneyAddedBb = Number((anteBb ?? 1) * cleanBb);
    effectiveMinOpenBb = 2.2;
    skipsPreflop = false;
    isDoubleBoard = false;
    ruleLabel = 'BB Ante (1 BB)';
  } else if (normRule === 'utg_straddle') {
    deadMoneyAddedBb = Number(2 * cleanBb);
    effectiveMinOpenBb = 4;
    skipsPreflop = false;
    isDoubleBoard = false;
    ruleLabel = 'UTG Straddle (2 BB)';
  } else if (normRule === 'bomb_pot') {
    deadMoneyAddedBb = Number((anteBb ?? 4) * cleanPlayers * cleanBb);
    effectiveMinOpenBb = 0;
    skipsPreflop = true;
    isDoubleBoard = false;
    ruleLabel = 'Bomb Pot (4 BB Ante)';
  } else if (normRule === 'double_board_bomb_pot') {
    deadMoneyAddedBb = Number((anteBb ?? 4) * cleanPlayers * cleanBb);
    effectiveMinOpenBb = 0;
    skipsPreflop = true;
    isDoubleBoard = true;
    ruleLabel = 'Double-Board Bomb Pot (2x 4 BB)';
  }

  const cleanBasePotBb = roundTableUnit(Number(basePotBb || 0), 2);
  const cleanDeadAddedBb = roundTableUnit(deadMoneyAddedBb, 2);

  return {
    tableRule: normRule,
    ruleLabel,
    basePotBb: cleanBasePotBb,
    deadMoneyAddedBb: cleanDeadAddedBb,
    adjustedPotBb: roundTableUnit(cleanBasePotBb + cleanDeadAddedBb, 2),
    effectiveMinOpenBb,
    skipsPreflop,
    isDoubleBoard,
  };
}

const CANONICAL_52_CARD_DECK = Object.freeze([
  'As', 'Ks', 'Qs', 'Js', 'Ts', '9s', '8s', '7s', '6s', '5s', '4s', '3s', '2s',
  'Ah', 'Kh', 'Qh', 'Jh', 'Th', '9h', '8h', '7h', '6h', '5h', '4h', '3h', '2h',
  'Ad', 'Kd', 'Qd', 'Jd', 'Td', '9d', '8d', '7d', '6d', '5d', '4d', '3d', '2d',
  'Ac', 'Kc', 'Qc', 'Jc', 'Tc', '9c', '8c', '7c', '6c', '5c', '4c', '3c', '2c',
]);

function normalizeRitCardList(cards, usedSet) {
  const result = [];
  if (!Array.isArray(cards)) return result;
  for (const raw of cards) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length !== 2) continue;
    const formatted = `${trimmed[0].toUpperCase()}${trimmed[1].toLowerCase()}`;
    const key = formatted.toLowerCase();
    if (!usedSet.has(key)) {
      usedSet.add(key);
      result.push(formatted);
    }
  }
  return result;
}

export function evaluateRunItTwiceShowdown({
  variant = 'nlh',
  hiLo = false,
  seats = [],
  baseBoardCards = [],
  board1Cards = null,
  board2Cards = null,
  deadPotBb = 0,
} = {}) {
  const normVariant = normalizeTrainingVariant(variant);
  const resolvedIsHiLo = Boolean(hiLo || isHiLoVariant(normVariant));
  const usedCardsLower = new Set();

  for (const s of Array.isArray(seats) ? seats : []) {
    const hole = Array.isArray(s?.holeCards)
      ? s.holeCards
      : Array.isArray(s?.heroCards)
        ? s.heroCards
        : Array.isArray(s?.cards)
          ? s.cards
          : [];
    normalizeRitCardList(hole, usedCardsLower);
  }

  const sharedUsed = new Set(usedCardsLower);
  const cleanBaseBoard = normalizeRitCardList(baseBoardCards, sharedUsed);

  const usedForBoards = new Set(sharedUsed);
  const seedBoard1 = Array.isArray(board1Cards) && board1Cards.length > 0
    ? [...cleanBaseBoard, ...normalizeRitCardList(board1Cards, usedForBoards)]
    : [...cleanBaseBoard];
  const resolvedBoard1 = seedBoard1.slice(0, 5);
  for (const c of resolvedBoard1) {
    usedForBoards.add(c.toLowerCase());
  }

  const seedBoard2 = Array.isArray(board2Cards) && board2Cards.length > 0
    ? [...cleanBaseBoard, ...normalizeRitCardList(board2Cards, usedForBoards)]
    : [...cleanBaseBoard];
  const resolvedBoard2 = seedBoard2.slice(0, 5);
  for (const c of resolvedBoard2) {
    usedForBoards.add(c.toLowerCase());
  }

  for (const candidate of CANONICAL_52_CARD_DECK) {
    if (resolvedBoard1.length >= 5) break;
    if (!usedForBoards.has(candidate.toLowerCase())) {
      usedForBoards.add(candidate.toLowerCase());
      resolvedBoard1.push(candidate);
    }
  }

  for (const candidate of CANONICAL_52_CARD_DECK) {
    if (resolvedBoard2.length >= 5) break;
    if (!usedForBoards.has(candidate.toLowerCase())) {
      usedForBoards.add(candidate.toLowerCase());
      resolvedBoard2.push(candidate);
    }
  }

  const cleanDeadPot = Math.max(0, roundTableUnit(Number(deadPotBb) || 0, 2));
  const halfDeadPot1 = roundTableUnit(Math.ceil((cleanDeadPot * 100) / 2) / 100, 2);
  const halfDeadPot2 = roundTableUnit(cleanDeadPot - halfDeadPot1, 2);

  const halfSeats1 = (Array.isArray(seats) ? seats : []).map((s) => {
    const comm = Math.max(0, roundTableUnit(Number(s?.committedBb ?? s?.committed ?? 0), 2));
    const half1 = roundTableUnit(Math.ceil((comm * 100) / 2) / 100, 2);
    return { ...s, committedBb: half1 };
  });
  const halfSeats2 = (Array.isArray(seats) ? seats : []).map((s) => {
    const comm = Math.max(0, roundTableUnit(Number(s?.committedBb ?? s?.committed ?? 0), 2));
    const half1 = roundTableUnit(Math.ceil((comm * 100) / 2) / 100, 2);
    const half2 = roundTableUnit(comm - half1, 2);
    return { ...s, committedBb: half2 };
  });

  const board1Showdown = evaluateShowdownAndAllocatePots({
    seats: halfSeats1,
    boardCards: resolvedBoard1,
    deadPotBb: halfDeadPot1,
    variant: normVariant,
    hiLo: resolvedIsHiLo,
  });

  const board2Showdown = evaluateShowdownAndAllocatePots({
    seats: halfSeats2,
    boardCards: resolvedBoard2,
    deadPotBb: halfDeadPot2,
    variant: normVariant,
    hiLo: resolvedIsHiLo,
  });

  const combinedPayoutsBySeatId = {};
  const allSeatIds = new Set([
    ...Object.keys(board1Showdown.payoutsBySeatId || {}),
    ...Object.keys(board2Showdown.payoutsBySeatId || {}),
  ]);

  let totalAllocatedBb = 0;
  for (const seatId of allSeatIds) {
    const p1 = Number(board1Showdown.payoutsBySeatId?.[seatId] || 0);
    const p2 = Number(board2Showdown.payoutsBySeatId?.[seatId] || 0);
    const sum = roundTableUnit(p1 + p2, 2);
    combinedPayoutsBySeatId[seatId] = sum;
    totalAllocatedBb = roundTableUnit(totalAllocatedBb + sum, 2);
  }

  let scoopWinner = null;
  if (totalAllocatedBb > 0) {
    for (const [seatId, payout] of Object.entries(combinedPayoutsBySeatId)) {
      if (Math.abs(payout - totalAllocatedBb) < 0.005) {
        scoopWinner = seatId;
        break;
      }
    }
  }

  return {
    variant: normVariant,
    isHiLo: resolvedIsHiLo,
    board1Cards: resolvedBoard1,
    board2Cards: resolvedBoard2,
    board1Showdown,
    board2Showdown,
    combinedPayoutsBySeatId,
    scoopWinner,
  };
}

export function rotateDealerButtonPosition(currentButtonPosition = 'BTN', format = 'cash') {
  const normFormat = normalizeGameFormat(format);
  const curr = String(currentButtonPosition || 'BTN').trim().toUpperCase();
  const ring = normFormat === 'hu'
    ? HEADS_UP_POSITIONS
    : normFormat === 'spins'
      ? SPINS_POSITIONS
      : normFormat === '9max'
        ? NINE_MAX_POSITIONS
        : SIX_MAX_POSITIONS;
  const idx = ring.indexOf(curr);
  if (idx === -1) return ring[0];
  return ring[(idx + 1) % ring.length];
}

export function formatTrainingHandAsPokerStarsHistory({
  handId,
  gameId = 'cash-001',
  variant = 'nlh',
  bettingStructure = 'no_limit',
  format = 'cash',
  tableRule = 'standard',
  stakesLabel = '1/2',
  heroPosition = 'BTN',
  villainPosition = 'BB',
  heroStackBb = 100,
  villainStackBb = 100,
  heroCards = ['As', 'Kd'],
  villainCards = ['Qh', 'Qc'],
  boardCards = ['Qs', '7d', '2c'],
  secondBoardCards = null,
  potBb = 12,
  facingBetBb = 4,
  heroAction = 'Call',
  recommendedAction = 'Call',
  evVerdict = '+0.00 BB',
} = {}) {
  const rawHandDigits = String(handId || '20261124001').replace(/\D+/g, '');
  const cleanHandId = rawHandDigits.length >= 6 ? rawHandDigits : `20261124${rawHandDigits.padStart(4, '0')}`;
  const normVariant = normalizeTrainingVariant(variant);
  const normStructure = normalizeBettingStructure(bettingStructure, normVariant);
  const normFormat = normalizeGameFormat(format);
  const ruleInfo = computeTableRuleDeadMoney({ tableRule, basePotBb: potBb });
  const parsedStakes = parseStakesToBlinds(stakesLabel);
  const stakesHeader = parsedStakes.hasExplicitStakes
    ? `$${parsedStakes.smallBlind}/$${parsedStakes.bigBlind}`
    : `$1/$2`;

  const structureLabel = normStructure === 'fixed_limit'
    ? 'Fixed Limit'
    : normStructure === 'pot_limit'
      ? 'Pot Limit'
      : 'No Limit';
  const gameTitle = normVariant === 'plo8'
    ? 'Omaha Hi/Lo'
    : normVariant === 'plo6'
      ? '6-Card Omaha'
      : normVariant === 'plo5'
        ? '5-Card Omaha'
        : normVariant === 'plo4'
          ? 'Omaha'
          : "Hold'em";
  const variantHeader = `${ gameTitle } ${ structureLabel }`;
  const maxSeats = normFormat === 'hu' ? 2 : normFormat === 'spins' ? 3 : 6;
  const cleanHeroCards = Array.isArray(heroCards) && heroCards.length > 0 ? heroCards : ['As', 'Kd'];
  const cleanVillainCards = Array.isArray(villainCards) && villainCards.length > 0 ? villainCards : ['Qh', 'Qc'];
  const cleanBoard = Array.isArray(boardCards) ? boardCards.filter(Boolean) : [];
  const cleanSecondBoard = Array.isArray(secondBoardCards) ? secondBoardCards.filter(Boolean) : [];

  const lines = [
    `PokerStars Hand #${cleanHandId}: ${variantHeader} (${stakesHeader} USD) - 2026/11/24 12:00:00 ET`,
    `Table 'ClubArena_${gameId}_${String(format || 'cash').toUpperCase()}' ${maxSeats}-max Seat #1 is the button`,
    `Seat 1: Hero (${heroStackBb} BB in chips)`,
    `Seat 2: Villain (${villainStackBb} BB in chips)`,
  ];

  if (ruleInfo.tableRule !== 'standard') {
    lines.push(`Hero: posts table rule ${ruleInfo.ruleLabel} (+${ruleInfo.deadMoneyAddedBb} BB dead money)`);
  } else {
    lines.push(`Hero (${heroPosition}): posts small blind 0.5 BB`);
    lines.push(`Villain (${villainPosition}): posts big blind 1 BB`);
  }

  lines.push('*** HOLE CARDS ***');
  lines.push(`Dealt to Hero [${cleanHeroCards.join(' ')}]`);
  lines.push(`Dealt to Villain [${cleanVillainCards.join(' ')}]`);

  if (cleanBoard.length < 3) {
    if (Number(facingBetBb) > 0) {
      lines.push(`Villain: bets ${facingBetBb} BB`);
    }
    lines.push(`Hero: ${heroAction}`);
  } else {
    const flop = cleanBoard.slice(0, 3);
    lines.push(`*** FLOP *** [${flop.join(' ')}]`);
    if (cleanBoard.length === 3) {
      if (Number(facingBetBb) > 0) lines.push(`Villain: bets ${facingBetBb} BB`);
      lines.push(`Hero: ${heroAction}`);
    }
    if (cleanBoard.length >= 4) {
      const turnCard = cleanBoard[3];
      lines.push(`*** TURN *** [${flop.join(' ')}] [${turnCard}]`);
      if (cleanBoard.length === 4) {
        if (Number(facingBetBb) > 0) lines.push(`Villain: bets ${facingBetBb} BB`);
        lines.push(`Hero: ${heroAction}`);
      }
    }
    if (cleanBoard.length >= 5) {
      const riverCard = cleanBoard[4];
      lines.push(`*** RIVER *** [${cleanBoard.slice(0, 4).join(' ')}] [${riverCard}]`);
      if (Number(facingBetBb) > 0) lines.push(`Villain: bets ${facingBetBb} BB`);
      lines.push(`Hero: ${heroAction}`);
    }
  }

  if (cleanSecondBoard.length >= 3) {
    lines.push(`Board 2: [${cleanSecondBoard.join(' ')}]`);
  }

  lines.push(`*** SUMMARY *** Total pot ${potBb} BB | Horse Brain GTO Verdict: ${recommendedAction} (${evVerdict})`);
  lines.push(`Board [${cleanBoard.join(' ')}]`);
  lines.push(`Seat 1: Hero (${heroPosition}) showed [${cleanHeroCards.join(' ')}] and executed ${heroAction}`);
  lines.push(`Seat 2: Villain (${villainPosition}) showed [${cleanVillainCards.join(' ')}]`);

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 13: TRUE 1:1 CLUB ARENA CLONE PARITY & ELITE GTO COACH ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export const CLUB_ARENA_TABLE_SKINS = Object.freeze([
  Object.freeze({ id: 'emerald', label: 'Classic Emerald', watermark: 'Smarter.Poker', accent: '#10b981' }),
  Object.freeze({ id: 'obsidian', label: 'Obsidian VIP', watermark: 'Smarter.Poker VIP', accent: '#38bdf8' }),
  Object.freeze({ id: 'sapphire', label: 'Royal Sapphire', watermark: 'Smarter.Poker Royal', accent: '#0ea5e9' }),
  Object.freeze({ id: 'crimson', label: 'Crimson High-Roller', watermark: 'Smarter.Poker High-Roller', accent: '#e11d48' }),
  Object.freeze({ id: 'gold', label: 'Gold Championship', watermark: 'Smarter.Poker Championship', accent: '#f59e0b' }),
]);

export const CLUB_ARENA_CARD_BACKS = Object.freeze([
  Object.freeze({ id: 'crest', label: 'Smarter.Poker Crest', border: '#38bdf8' }),
  Object.freeze({ id: 'carbon', label: 'Cyber Carbon', border: '#94a3b8' }),
  Object.freeze({ id: 'gold_foil', label: 'Gold Foil Championship', border: '#fbbf24' }),
]);

/**
 * Item 1: Sequential Pre-Decision Villain Action Choreography
 * Builds a deterministic chronological step sequence (e.g. UTG folds -> CO raises 2.5 BB -> Hero's turn)
 * mirroring Club Arena TablePage.tsx seat action transitions.
 */
export function buildPreDecisionActionChoreography({
  format = 'cash',
  street = 'flop',
  heroPosition = 'BTN',
  villainPosition = 'BB',
  facingBetBb = 0,
  potBb = 6.5,
  actionHistory = [],
} = {}) {
  const normFormat = normalizeGameFormat(format);
  const normStreet = String(street || 'flop').trim().toLowerCase();
  const cleanHero = String(heroPosition || 'BTN').trim().toUpperCase();
  const cleanVillain = String(villainPosition || (cleanHero === 'BB' ? 'BTN' : 'BB')).trim().toUpperCase();
  const cleanBet = Math.max(0, roundTableUnit(Number(facingBetBb) || 0, 2));
  const cleanPot = Math.max(1.5, roundTableUnit(Number(potBb) || 6.5, 2));

  if (Array.isArray(actionHistory) && actionHistory.length > 0) {
    const steps = actionHistory.map((item, idx) => {
      const pos = String(item?.position || cleanVillain).trim().toUpperCase();
      const rawAct = String(item?.action || 'checks').trim();
      const amt = Math.max(0, roundTableUnit(Number(item?.amount || (/bet|raise/i.test(rawAct) ? cleanBet : 0)), 2));
      const sound = /fold/i.test(rawAct)
        ? 'fold'
        : /raise/i.test(rawAct)
          ? 'raise'
          : /bet/i.test(rawAct)
            ? 'bet'
            : /call/i.test(rawAct)
              ? 'call'
              : 'check';
      return {
        stepIndex: idx + 1,
        position: pos,
        action: rawAct,
        amountBb: amt,
        sound,
        delayMs: (idx + 1) * 280,
      };
    });
    return {
      format: normFormat,
      street: normStreet,
      heroPosition: cleanHero,
      villainPosition: cleanVillain,
      totalDurationMs: steps.length * 280,
      steps,
    };
  }

  const ring = normFormat === 'hu'
    ? HEADS_UP_POSITIONS
    : normFormat === 'spins'
      ? SPINS_POSITIONS
      : normFormat === '9max'
        ? NINE_MAX_POSITIONS
        : SIX_MAX_POSITIONS;

  const steps = [];
  if (normStreet === 'preflop') {
    for (const pos of ring) {
      if (pos === cleanHero) break;
      if (pos === cleanVillain) {
        const openAmt = cleanBet > 0 ? cleanBet : 2.5;
        steps.push({
          stepIndex: steps.length + 1,
          position: pos,
          action: `Raises ${openAmt} BB`,
          amountBb: openAmt,
          sound: 'raise',
          delayMs: (steps.length + 1) * 260,
        });
      } else {
        steps.push({
          stepIndex: steps.length + 1,
          position: pos,
          action: 'Folds',
          amountBb: 0,
          sound: 'fold',
          delayMs: (steps.length + 1) * 220,
        });
      }
    }
  } else {
    if (cleanBet > 0) {
      steps.push({
        stepIndex: 1,
        position: cleanVillain,
        action: `Bets ${cleanBet} BB`,
        amountBb: cleanBet,
        sound: 'bet',
        delayMs: 280,
      });
    } else {
      steps.push({
        stepIndex: 1,
        position: cleanVillain,
        action: 'Checks',
        amountBb: 0,
        sound: 'check',
        delayMs: 240,
      });
    }
  }

  if (steps.length === 0) {
    steps.push({
      stepIndex: 1,
      position: cleanVillain,
      action: cleanBet > 0 ? `Bets ${cleanBet} BB` : `Pot ${cleanPot} BB Checked To Hero`,
      amountBb: cleanBet,
      sound: cleanBet > 0 ? 'bet' : 'check',
      delayMs: 240,
    });
  }

  return {
    format: normFormat,
    street: normStreet,
    heroPosition: cleanHero,
    villainPosition: cleanVillain,
    totalDurationMs: steps[steps.length - 1]?.delayMs || 260,
    steps,
  };
}

/**
 * Item 3: On-Felt All-In Equity % Seat Badges & Interactive All-In Insurance EV Calculator
 * Mirrors Club Arena allInEquityDisplay.ts and InsuranceModal.tsx.
 */
export function evaluateAllInEquityAndInsuranceOffer({
  variant = 'nlh',
  potBb = 40,
  heroEquityPct = 68.4,
  houseMarginPct = 5.0,
  insuredFraction = 1.0,
} = {}) {
  const normVariant = normalizeTrainingVariant(variant);
  const cleanPot = Math.max(2, roundTableUnit(Number(potBb) || 40, 2));
  const cleanHeroEq = Math.max(1, Math.min(99, roundTableUnit(Number(heroEquityPct) || 68.4, 1)));
  const villainEquityPct = roundTableUnit(100 - cleanHeroEq, 1);
  const cleanMargin = Math.max(0, Math.min(25, Number(houseMarginPct) || 5.0));
  const cleanFraction = Math.max(0.25, Math.min(1.0, Number(insuredFraction) || 1.0));

  const uninsuredEvBb = roundTableUnit(cleanPot * (cleanHeroEq / 100), 2);
  const villainWinProb = villainEquityPct / 100;
  const fairPremiumBb = roundTableUnit(cleanPot * cleanFraction * villainWinProb, 2);
  const chargedPremiumBb = roundTableUnit(fairPremiumBb * (1 + cleanMargin / 100), 2);
  const lockedCashoutBb = roundTableUnit(uninsuredEvBb * (1 - (cleanMargin / 100) * villainWinProb), 2);
  const evDeltaAcceptingInsuranceBb = roundTableUnit(fairPremiumBb - chargedPremiumBb, 2);
  const isPositiveEvToAccept = evDeltaAcceptingInsuranceBb >= 0;

  return {
    variant: normVariant,
    isHiLo: isHiLoVariant(normVariant),
    potBb: cleanPot,
    heroEquityPct: cleanHeroEq,
    villainEquityPct,
    uninsuredEvBb,
    fairPremiumBb,
    chargedPremiumBb,
    lockedCashoutBb,
    houseMarginPct: cleanMargin,
    evDeltaAcceptingInsuranceBb,
    isPositiveEvToAccept,
    recommendedInsuranceDecision: isPositiveEvToAccept ? 'Accept Insurance (+EV)' : 'Decline Insurance (Save House vig)',
    coachingNote: isPositiveEvToAccept
      ? `Insurance offer is +${evDeltaAcceptingInsuranceBb} BB EV vs fair equity.`
      : `Declining insurance saves ${Math.abs(evDeltaAcceptingInsuranceBb)} BB in house margin (${cleanMargin}% vig); only insure if bankroll/ICM survival requires variance elimination.`,
  };
}

/**
 * Item 6: On-Felt Rabbit Hunting (`boardForRabbitReveal`)
 * Reveals undealt Turn / River community cards from the deterministic remaining deck after a Fold or uncalled bet.
 */
export function resolveRabbitHuntBoard({
  visibleBoardCards = [],
  heroCards = [],
  villainCards = [],
  fullCompletedBoard = null,
} = {}) {
  const used = new Set();
  const addUsed = (list) => {
    for (const c of Array.isArray(list) ? list : []) {
      if (typeof c === 'string' && c.trim().length === 2) {
        used.add(c.trim().toLowerCase());
      }
    }
  };
  const cleanVisible = (Array.isArray(visibleBoardCards) ? visibleBoardCards : []).filter(Boolean);
  addUsed(cleanVisible);
  addUsed(heroCards);
  addUsed(villainCards);

  const rabbitCards = [];
  const candidatePool = Array.isArray(fullCompletedBoard) && fullCompletedBoard.length >= 5
    ? [...fullCompletedBoard, ...CANONICAL_52_CARD_DECK]
    : CANONICAL_52_CARD_DECK;

  const fullBoard = [...cleanVisible];
  for (const cand of candidatePool) {
    if (fullBoard.length >= 5) break;
    const formatted = `${cand[0].toUpperCase()}${cand[1].toLowerCase()}`;
    const key = formatted.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      fullBoard.push(formatted);
      rabbitCards.push(formatted);
    }
  }

  return {
    dealtBoardCards: cleanVisible,
    rabbitCards,
    completedBoardCards: fullBoard,
    rabbitCount: rabbitCards.length,
    canRabbitHunt: cleanVisible.length < 5,
  };
}

/**
 * Item 7: Pre-Action Checkboxes & Reopen Invalidation (`usePreActionBoundary`)
 * Mirrors Club Arena PreActionBar.tsx and usePreActionBoundary.ts.
 */
export function evaluatePreActionSelection({
  selectedPreAction = null,
  toCallBb = 0,
  previousToCallBb = 0,
} = {}) {
  const cleanAction = selectedPreAction ? String(selectedPreAction).trim().toLowerCase() : null;
  const cleanToCall = Math.max(0, roundTableUnit(Number(toCallBb) || 0, 2));
  const cleanPrevToCall = Math.max(0, roundTableUnit(Number(previousToCallBb) || 0, 2));
  const betIncreased = cleanToCall > cleanPrevToCall;

  if (!cleanAction) {
    return {
      selectedPreAction: null,
      invalidatedByBetIncrease: false,
      autoTriggeredAction: null,
      statusLabel: 'No Pre-Action Armed',
    };
  }

  if (cleanAction === 'check_fold') {
    return {
      selectedPreAction: 'check_fold',
      invalidatedByBetIncrease: false,
      autoTriggeredAction: cleanToCall <= 0 ? 'check' : 'fold',
      statusLabel: cleanToCall <= 0 ? 'Auto-Check Armed' : 'Auto-Fold Armed',
    };
  }

  if (cleanAction === 'check') {
    if (cleanToCall > 0) {
      return {
        selectedPreAction: null,
        invalidatedByBetIncrease: true,
        autoTriggeredAction: null,
        statusLabel: 'Pre-Action Check Cleared (Facing Bet)',
      };
    }
    return {
      selectedPreAction: 'check',
      invalidatedByBetIncrease: false,
      autoTriggeredAction: 'check',
      statusLabel: 'Auto-Check Armed',
    };
  }

  if (cleanAction === 'call_current') {
    if (betIncreased) {
      return {
        selectedPreAction: null,
        invalidatedByBetIncrease: true,
        autoTriggeredAction: null,
        statusLabel: 'Pre-Action Call Cleared (Raise Reopened Action)',
      };
    }
    return {
      selectedPreAction: 'call_current',
      invalidatedByBetIncrease: false,
      autoTriggeredAction: cleanToCall > 0 ? 'call' : 'check',
      statusLabel: `Auto-Call ${cleanToCall} BB Armed`,
    };
  }

  if (cleanAction === 'call_any') {
    return {
      selectedPreAction: 'call_any',
      invalidatedByBetIncrease: false,
      autoTriggeredAction: cleanToCall > 0 ? 'call' : 'check',
      statusLabel: 'Auto-Call Any Bet Armed',
    };
  }

  return {
    selectedPreAction: null,
    invalidatedByBetIncrease: false,
    autoTriggeredAction: null,
    statusLabel: 'No Pre-Action Armed',
  };
}

/**
 * Item 10: Fixed-Limit & PLO8 Half-Kill (`1.5x`) and Full-Kill (`2.0x`) Pot Mechanics
 * Mirrors Club Arena killPot.ts (`fixedLimitStreetBet`, `killPotPillText`, `killNextAnnouncement`).
 */
export function computeKillPotEscalation({
  killMode = 'off',
  consecutiveWins = 0,
  previousPotWonBb = 0,
  killThresholdPotBb = 10,
  street = 'flop',
  baseBigBlindBb = 1,
} = {}) {
  const normMode = ['off', 'half_kill', 'full_kill'].includes(String(killMode || '').toLowerCase())
    ? String(killMode).toLowerCase()
    : 'off';
  const normStreet = String(street || 'flop').trim().toLowerCase();
  const cleanBb = Math.max(0.01, roundTableUnit(Number(baseBigBlindBb) || 1, 2));
  const multiplier = normMode === 'full_kill' ? 2.0 : normMode === 'half_kill' ? 1.5 : 1.0;
  const isKillActive = normMode !== 'off' && (Number(consecutiveWins) >= 2 || Number(previousPotWonBb) >= Number(killThresholdPotBb) || normMode === 'half_kill' || normMode === 'full_kill');
  const effectiveMultiplier = isKillActive ? multiplier : 1.0;
  const effectiveBigBlindBb = roundTableUnit(cleanBb * effectiveMultiplier, 2);
  const streetFixedBetBb = normStreet === 'turn' || normStreet === 'river'
    ? roundTableUnit(2 * effectiveBigBlindBb, 2)
    : roundTableUnit(1 * effectiveBigBlindBb, 2);

  const pillText = normMode === 'full_kill'
    ? `FULL KILL ACTIVE (2.0X · ${streetFixedBetBb} BB BET)`
    : normMode === 'half_kill'
      ? `HALF KILL ACTIVE (1.5X · ${streetFixedBetBb} BB BET)`
      : 'KILL POT: OFF (1.0X)';

  return {
    killMode: normMode,
    isKillActive,
    multiplier: effectiveMultiplier,
    effectiveBigBlindBb,
    streetFixedBetBb,
    pillText,
  };
}

/**
 * Item 13: Deterministic `HeroActedFence` Double-Tap & Street-Transition Action Lock
 * Mirrors Club Arena heroActedFence.ts (`HERO_ACTED_FENCE_MS`, `armHeroActedFence`, `judgeSnapshotAgainstFence`).
 */
export const HERO_ACTED_FENCE_MS = 650;

export function evaluateHeroActedFence({
  fenceArmedAtMs = 0,
  fenceDecisionKey = '',
  currentDecisionKey = '',
  nowMs = Date.now(),
  fenceDurationMs = HERO_ACTED_FENCE_MS,
} = {}) {
  const armedAt = Number(fenceArmedAtMs) || 0;
  const elapsedMs = Math.max(0, Number(nowMs) - armedAt);
  const sameDecision = Boolean(fenceDecisionKey && currentDecisionKey && fenceDecisionKey === currentDecisionKey);
  const withinWindow = armedAt > 0 && elapsedMs < Number(fenceDurationMs || HERO_ACTED_FENCE_MS);
  const isLocked = sameDecision || withinWindow;

  return {
    isLocked,
    sameDecision,
    withinWindow,
    elapsedMs,
    remainingLockMs: withinWindow ? Math.max(0, Number(fenceDurationMs) - elapsedMs) : 0,
  };
}

/**
 * Item 17: Club Arena Fold Protection Modal (`Phase 2 T2-01 spec §5.6`)
 * Intercepts a Fold click whenever `toCallBb === 0` (checking is free).
 */
export function shouldInterceptFreeCheckFold({
  actionType = 'fold',
  toCallBb = 0,
  foldProtectionEnabled = true,
} = {}) {
  const normAction = String(actionType || '').trim().toLowerCase();
  const cleanToCall = Math.max(0, roundTableUnit(Number(toCallBb) || 0, 2));
  const shouldIntercept = Boolean(foldProtectionEnabled) && normAction === 'fold' && cleanToCall <= 0;
  return {
    shouldIntercept,
    recommendedReplacementAction: shouldIntercept ? 'check' : normAction,
    promptTitle: 'Fold Protection: Checking Is Free',
    promptMessage: 'You Are Facing 0 BB To Call. Folding Surrenders 100% Of Your Equity For Free. Check Instead?',
  };
}

/**
 * Item 19: Continuous Session Stack Drift & Practice Auto Top-Up to 100 BB
 * Mirrors Club Arena autoTopUpRequest.ts and standInStack.ts while preserving strict practice isolation.
 */
export function computePracticeStackReload({
  currentStackBb = 72,
  targetTopUpBb = 100,
  autoTopUpEnabled = true,
  handDeltaBb = 0,
} = {}) {
  const afterHandBb = Math.max(0, roundTableUnit((Number(currentStackBb) || 100) + (Number(handDeltaBb) || 0), 2));
  const cleanTarget = Math.max(20, roundTableUnit(Number(targetTopUpBb) || 100, 2));
  const toppedUp = Boolean(autoTopUpEnabled) && afterHandBb < cleanTarget;
  const addedPracticeBb = toppedUp ? roundTableUnit(cleanTarget - afterHandBb, 2) : 0;
  const resultingStackBb = toppedUp ? cleanTarget : Math.max(10, afterHandBb);

  return {
    beforeStackBb: roundTableUnit(Number(currentStackBb) || 100, 2),
    afterHandBb,
    autoTopUpEnabled: Boolean(autoTopUpEnabled),
    targetTopUpBb: cleanTarget,
    toppedUp,
    addedPracticeBb,
    resultingStackBb,
    walletMutationAllowed: false,
    practiceIsolationVerified: true,
  };
}

