/**
 * Club Arena 1:1 Decision-Level Table Parity Engine
 *
 * Ensures Training Hub and Club Arena compute identical legal action buttons,
 * min/max raise bounds (No-Limit vs Pot-Limit), short all-in reopening rules,
 * multiway main/side pots, stakes-aware chip conversions (e.g. 0.25/0.50),
 * and custom raise sizing feedback.
 */

const POSITION_ORDER_POSTFLOP = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];
const POSITION_ORDER_PREFLOP = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export function isPotLimitVariant(variantRaw = 'nlh') {
  const v = String(variantRaw || 'nlh').toLowerCase();
  return v.startsWith('plo') || v.includes('omaha') || v.includes('pot_limit') || v.includes('pot-limit');
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
    return {
      mainPotBb: baseDeadBb,
      sidePots: [],
      pots: baseDeadBb > 0 ? [{ name: 'Main Pot', amountBb: baseDeadBb, eligiblePositions: normalized.filter((s) => !s.folded).map((s) => s.position) }] : [],
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

    // If only 1 player contributed at the highest tier and nobody else matched it, that slice is an uncalled bet
    if (contributors.length === 1 && eligible.length === 1 && i === nonZeroLevels.length - 1 && pots.length > 0) {
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
      });
    }

    prevCap = cap;
  }

  const mainPotBb = pots.length > 0 ? pots[0].amountBb : baseDeadBb;
  const sidePots = pots.slice(1);
  const totalPotBb = roundTableUnit(pots.reduce((acc, p) => acc + p.amountBb, 0), 2);

  return {
    mainPotBb,
    sidePots,
    pots,
    totalPotBb,
    uncalledReturnBb,
    uncalledSeatPosition,
    resultingStacks,
  };
}

/**
 * Determines the next actor in Club Arena seat order who is neither folded nor all-in.
 */
export function resolveNextActor({ seats = [], currentActorPosition = 'BTN', street = 'flop', highestBetBb = 0, actedPositions = [] }) {
  const activeSeats = (Array.isArray(seats) ? seats : []).filter((s) => !s?.folded);
  if (activeSeats.length <= 1) return null;

  const order = String(street || 'flop').toLowerCase() === 'preflop' ? POSITION_ORDER_PREFLOP : POSITION_ORDER_POSTFLOP;
  const sorted = [...activeSeats].sort((a, b) => {
    const idxA = order.indexOf(String(a.position || '').toUpperCase());
    const idxB = order.indexOf(String(b.position || '').toUpperCase());
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const currPos = String(currentActorPosition || '').toUpperCase();
  const currIdx = sorted.findIndex((s) => String(s.position || '').toUpperCase() === currPos);
  const actedSet = new Set((Array.isArray(actedPositions) ? actedPositions : []).map((p) => String(p).toUpperCase()));
  actedSet.add(currPos);

  for (let offset = 1; offset <= sorted.length; offset += 1) {
    const candidate = sorted[(Math.max(0, currIdx) + offset) % sorted.length];
    const pos = String(candidate.position || '').toUpperCase();
    if (pos === currPos) continue;
    const isAllIn = Boolean(candidate.allIn || Number(candidate.stackRemainingBb ?? candidate.stackBb ?? 0) <= 0);
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
} = {}) {
  const isPotLimit = isPotLimitVariant(variant);
  const stakesInfo = parseStakesToBlinds(stakes);
  const cleanHeroCommittedBb = Math.max(0, roundTableUnit(Number(heroCommittedBb) || 0, 2));
  const cleanHeroStackBb = Math.max(0, roundTableUnit(Number(heroStackBb) || 0, 2));
  const cleanFacingBetBb = Math.max(0, roundTableUnit(Number(facingBetBb) || 0, 2));
  const cleanPrevBetBb = Math.max(0, roundTableUnit(Number(previousBetBb) || 0, 2));

  // Total increment of the latest bet/raise above the prior bet
  const latestRaiseIncrementBb = roundTableUnit(Math.max(0, cleanFacingBetBb - cleanPrevBetBb), 2);
  const fullRaiseIncrementBb = roundTableUnit(
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

  // Min Raise-To in BB:
  // If facing a bet, minRaiseTo = facingBet + max(1, fullRaiseIncrement). Capped at hero's all-in total.
  const minRaiseUnboundedBb =
    cleanFacingBetBb > 0
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
  const maxRaiseToBb = isPotLimit
    ? roundTableUnit(Math.min(heroMaxTotalToBb, Math.max(minRaiseToBb, potLimitMaxRaiseToBb)), 2)
    : heroMaxTotalToBb;

  const canCheck = rawCallNeededBb <= 0;
  const canCall = rawCallNeededBb > 0 && cleanHeroStackBb > 0;
  const canRaise =
    reopensAction &&
    cleanHeroStackBb > rawCallNeededBb &&
    maxRaiseToBb > cleanFacingBetBb;

  const legalActions = [];
  if (canCheck) {
    legalActions.push('check');
    if (canRaise) {
      legalActions.push('bet');
      if (!isPotLimit || maxRaiseToBb >= heroMaxTotalToBb) {
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
      if (!isPotLimit || maxRaiseToBb >= heroMaxTotalToBb) {
        if (!legalActions.includes('all_in')) legalActions.push('all_in');
      }
    }
  }

  return {
    variant: String(variant || 'nlh').toLowerCase(),
    isPotLimit,
    street: String(street || 'flop').toLowerCase(),
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
  const labelMatch = gradedLabel.match(/(\d+(?:\.\d+)?)\s*(?:bb|chips|%)/i);
  const explicitGradedBb = Number(gradedOption?.sizingBb ?? gradedOption?.amountBb ?? (labelMatch ? labelMatch[1] : NaN));
  const cleanGradedBb = Number.isFinite(explicitGradedBb) && explicitGradedBb > 0
    ? roundTableUnit(explicitGradedBb, 2)
    : cleanChosenBb;

  const deltaBb = roundTableUnit(cleanChosenBb - cleanGradedBb, 2);
  const isExactMatch = Math.abs(deltaBb) < 0.15;
  const effectivePotAfterCall = Math.max(1, (Number(potBb) || 1) + (Number(callBb) || 0));
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
