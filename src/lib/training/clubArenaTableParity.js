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
export const HEADS_UP_POSITIONS = Object.freeze(['BTN', 'BB']);
export const SPINS_POSITIONS = Object.freeze(['BTN', 'SB', 'BB']);

const POSITION_ORDER_POSTFLOP = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];
const POSITION_ORDER_PREFLOP = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

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
