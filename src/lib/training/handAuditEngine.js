import { getHeroDecisionPoints } from '../../engines/HandHistoryParser.js';
import { gradeCanonicalPolicyDecision } from './cacheTruthContract.mjs';
import {
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
} from './cacheTruthPersistence.mjs';
import { findDirectCorpusSolverMatch } from './directSolverMatcher.mjs';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
export const MATCHER_VERSION = 'hand-audit-v3';
const LOOKUP_FAILED_SOURCE = `${MATCHER_VERSION}:lookup-failed`;
const FORCED_ACTIONS = new Set([
  'ante', 'sb', 'bb', 'smallblind', 'bigblind', 'blind', 'straddle', 'killblind', 'bombante',
  'post', 'posts', 'return', 'returnedbet', 'refund', 'collect', 'collected', 'payout',
  'win', 'wins', 'discard',
]);
const BLIND_POST_ACTIONS = new Set([
  'ante', 'sb', 'bb', 'smallblind', 'bigblind', 'blind', 'straddle', 'killblind', 'bombante',
  'post', 'posts', 'postsb', 'postbb',
]);
const ACTUAL_BLIND_POST_ACTIONS = new Set([
  'sb', 'bb', 'smallblind', 'bigblind', 'blind', 'killblind', 'post', 'posts', 'postsb', 'postbb',
]);
const HOLDEM_VARIANTS = new Set([
  'nl', 'nlh', 'nlhe', 'holdem', 'holdemnl', 'texasholdem', 'nolimit', 'nolimitholdem',
]);
const POSITION_MAP = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'CO'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'],
};

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function playerId(player) {
  return player?.userId ?? player?.id ?? player?.playerId ?? player?.player_id ?? null;
}

function isSupportedHoldemVariant(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return HOLDEM_VARIANTS.has(normalized);
}

function hasUnsupportedBettingStructure(row, summary = {}) {
  const raw = String(
    row?.betting_structure
    ?? row?.bettingStructure
    ?? summary?.bettingStructure
    ?? summary?.betting_structure
    ?? ''
  ).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!raw) return false;
  return raw !== 'nl' && raw !== 'nolimit';
}

function isTruthySpecialFlag(value) {
  if (value === null || value === undefined || value === false || value === 0) return false;
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    return clean !== '' && clean !== 'false' && clean !== '0' && clean !== 'no' && clean !== 'none' && clean !== 'null';
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function isMultiBoardRit(value) {
  if (value === null || value === undefined || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  const num = Number(value);
  return Number.isFinite(num) && num > 1;
}

function detectSpecialFormatKind(row, summary = {}) {
  const actions = Array.isArray(row?.actions) ? row.actions : [];
  const hasBombAction = actions.some(a => normalizedRawAction(a) === 'bombante');
  const hasKillAction = actions.some(a => normalizedRawAction(a) === 'killblind');
  const hasRitAction = actions.some(a => /^ritboard\d+/.test(normalizedRawAction(a)));

  if (isTruthySpecialFlag(row?.bomb_pot) || isTruthySpecialFlag(summary?.bombPot) || isTruthySpecialFlag(summary?.bomb_pot) || hasBombAction) {
    return 'bomb_pot';
  }
  if (isTruthySpecialFlag(row?.kill_pot) || isTruthySpecialFlag(summary?.killPot) || isTruthySpecialFlag(summary?.kill_pot) || hasKillAction) {
    return 'kill_pot';
  }
  if (
    isMultiBoardRit(row?.rit_boards)
    || isMultiBoardRit(summary?.ritBoards)
    || isMultiBoardRit(summary?.rit_boards)
    || Number(row?.run_it_count ?? summary?.runItCount ?? summary?.run_it_count ?? 1) > 1
    || (Array.isArray(row?.community_cards2) && row.community_cards2.length > 0)
    || (Array.isArray(row?.community_cards3) && row.community_cards3.length > 0)
    || (Array.isArray(summary?.communityCards2) && summary.communityCards2.length > 0)
    || (Array.isArray(summary?.communityCards3) && summary.communityCards3.length > 0)
    || hasRitAction
  ) {
    return 'multiple_runouts';
  }
  return null;
}

function isUnsupportedSpecialFormat(row) {
  const summary = parseJson(row?.summary) || {};
  return detectSpecialFormatKind(row, summary) !== null;
}

export function clubArenaHandRejectionReason(row, userId) {
  const summary = parseJson(row?.summary) || {};
  const gameType = String(row?.game_variant || summary?.variant || '').trim().toLowerCase();
  if (!isSupportedHoldemVariant(gameType) || hasUnsupportedBettingStructure(row, summary)) {
    return 'unsupported_variant';
  }
  if (isUnsupportedSpecialFormat(row)) return 'unsupported_special_format';
  const rawPlayers = Array.isArray(summary.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(row?.players) ? row.players : []);
  const heroRaw = rawPlayers.find(player => String(playerId(player)) === String(userId));
  if (!heroRaw) return 'missing_hero_identity';
  const candidateCardLists = [
    row?.hero_private_cards,
    heroRaw.holeCards,
    heroRaw.heroCards,
    heroRaw.cards,
    row?.hole_cards?.[userId],
  ].map(cards).filter(candidate => candidate.length > 0);
  if (candidateCardLists.some(candidate => candidate.length > 2)) {
    return 'unsupported_variant';
  }
  const heroCards = candidateCardLists.find(candidate => candidate.length === 2) || [];
  return heroCards.length === 2 ? null : 'missing_private_cards';
}

export function describeClubArenaHandSupport(row, userId) {
  const summary = parseJson(row?.summary) || {};
  const rawVariant = String(row?.game_variant || summary?.variant || '').trim().toLowerCase();
  const specialFormat = detectSpecialFormatKind(row, summary);
  const rejectionReason = clubArenaHandRejectionReason(row, userId);
  const rawBetting = String(
    row?.betting_structure ?? row?.bettingStructure ?? summary?.bettingStructure ?? summary?.betting_structure ?? ''
  ).trim().toLowerCase();
  const bettingStructure = /pot[\s_-]*limit|^pl$/i.test(rawBetting) || /plo/i.test(rawVariant)
    ? 'PL'
    : (/fixed[\s_-]*limit|^limit$|^fl$/i.test(rawBetting) || /^(?:fl|flh|flhe|limit|fixed_limit)/i.test(rawVariant)
      ? 'FL'
      : 'NL');

  let declineReason = null;
  if (rejectionReason === 'unsupported_variant') {
    if (/plo|omaha/i.test(rawVariant)) {
      declineReason = `Omaha (${rawVariant.toUpperCase()}) Hands Are Importable And Replayable In Hand History, But Automated Strategy And Leak Grading Supports Single-Board No-Limit Hold'em Only.`;
    } else if (bettingStructure === 'FL') {
      declineReason = "Fixed-Limit Hold'em Hands Are Importable And Replayable In Hand History, But Automated Strategy And Leak Grading Supports No-Limit Hold'em Only.";
    } else {
      declineReason = `Automated Solver And NLH Leak Analysis Supports Standard Single-Board No-Limit Hold'em Only (${rawVariant || 'Unknown Variant'} Is Explicitly Unmeasured).`;
    }
  } else if (rejectionReason === 'unsupported_special_format') {
    if (specialFormat === 'bomb_pot') {
      declineReason = "Bomb Pot Hands Are Importable And Replayable In Hand History, But Forced-Ante Bomb Pots Are Excluded From Standard Single-Board No-Limit Hold'em Strategy Grading.";
    } else if (specialFormat === 'kill_pot') {
      declineReason = "Kill Pot Hands Are Importable And Replayable In Hand History, But Modified Kill-Blind Structures Are Excluded From Standard Single-Board No-Limit Hold'em Strategy Grading.";
    } else {
      declineReason = "Multiple-Runout (Run-It-Twice / Multi-Board) Hands Are Importable And Replayable In Hand History, But Excluded From Single-Board No-Limit Hold'em Strategy Grading.";
    }
  } else if (rejectionReason === 'missing_private_cards') {
    declineReason = 'Hero Hole Cards Are Not Retained For This Hand Under Club Arena Card-Retention Rules, So Solver Decisions Remain Explicitly Unmeasured.';
  } else if (rejectionReason === 'missing_hero_identity') {
    declineReason = 'Hero Seat Identity Is Not Present In This Hand Record.';
  }

  return {
    importable: Boolean(row?.id || row?.hand_number || summary?.id),
    replayable: Boolean(row?.id || row?.hand_number || summary?.id),
    strategySupported: rejectionReason === null,
    supported: rejectionReason === null || rejectionReason === 'missing_private_cards',
    rejectionReason,
    specialFormat,
    variant: rawVariant || 'unknown',
    bettingStructure,
    declineReason,
  };
}

export function cardCode(card) {
  if (typeof card === 'number' && Number.isInteger(card) && card >= 0 && card < 52) {
    return `${RANKS[Math.floor(card / 4)]}${SUITS[card % 4]}`;
  }
  if (typeof card === 'object' && card) {
    const rank = String(card.rank ?? '').toUpperCase().replace('10', 'T');
    const suitMap = { clubs: 'c', diamonds: 'd', hearts: 'h', spades: 's' };
    const rawSuit = String(card.suit ?? '').toLowerCase();
    const suit = suitMap[rawSuit] || rawSuit;
    return /^[2-9TJQKA]$/.test(rank) && /^[cdhs]$/.test(suit) ? `${rank}${suit}` : null;
  }
  const raw = String(card ?? '').trim();
  const match = /^([2-9TJQKA]|10)(clubs|diamonds|hearts|spades|[cdhs])$/i.exec(raw);
  if (!match) return null;
  const rank = match[1].toUpperCase().replace('10', 'T');
  const suitMap = { clubs: 'c', diamonds: 'd', hearts: 'h', spades: 's' };
  return `${rank}${suitMap[match[2].toLowerCase()] || match[2].toLowerCase()}`;
}

function cards(value) {
  return (Array.isArray(value) ? value : []).map(cardCode).filter(Boolean);
}

function normalizedRawAction(action) {
  return String(action?.action || action?.type || '').toLowerCase().replace(/[-_\s]/g, '');
}

function isForcedAction(action) {
  if (action?.historyEvent === 'uncalled_bet_returned') return true;
  const raw = normalizedRawAction(action);
  if (/^ritboard\d*/.test(raw)) return true;
  if (String(action?.origin || '').toLowerCase() === 'forced') {
    if (BLIND_POST_ACTIONS.has(raw) || /^(small|big)?blind|ante|straddle|killblind|bombante/.test(raw)) return true;
  }
  return FORCED_ACTIONS.has(raw) || /^(small|big)?blind|ante|straddle|killblind|bombante|returned?bet|refund|collect|payout/.test(raw);
}

function actionName(action) {
  if (isForcedAction(action)) return null;
  const raw = normalizedRawAction(action);
  if (/allin|shove|jam/.test(raw)) return 'allin';
  if (raw.startsWith('fold')) return 'fold';
  if (raw.startsWith('check')) return 'check';
  if (raw.startsWith('call')) return 'call';
  if (raw.startsWith('bet')) return 'bet';
  if (raw.startsWith('raise')) return 'raise';
  return raw || null;
}

function positionedPlayers(rawPlayers, buttonSeat, bigBlind) {
  const players = (rawPlayers || []).map((player, index) => {
    const rawStartChips = player.startStack ?? player.startingStack ?? player.start_stack ?? player.stack ?? player.chips;
    const explicitStartChips = player.startStack ?? player.startingStack ?? player.start_stack;
    const hasExplicitStart = explicitStartChips !== null && explicitStartChips !== undefined && Number.isFinite(Number(explicitStartChips)) && Number(explicitStartChips) > 0;
    const startChips = Number.isFinite(Number(rawStartChips)) && Number(rawStartChips) > 0
      ? Number(rawStartChips)
      : null;
    const stackBb = Number.isFinite(Number(player.stackBB)) && Number(player.stackBB) > 0
      ? Number(player.stackBB)
      : (startChips !== null && Number.isFinite(Number(bigBlind)) && Number(bigBlind) > 0
        ? startChips / Number(bigBlind)
        : null);
    return {
      id: playerId(player),
      name: player.displayName || player.username || player.name || `Seat ${index + 1}`,
      seat: Number(player.seatIndex ?? player.seat ?? index),
      stack: stackBb,
      startStackChips: hasExplicitStart ? Number(explicitStartChips) : startChips,
      hasExplicitStart,
      rawSettledStack: Number.isFinite(Number(player.endStack ?? player.stack)) ? Number(player.endStack ?? player.stack) : null,
      position: String(player.position || '').trim().toUpperCase(),
      holeCards: cards(player.holeCards || player.heroCards || player.cards),
    };
  });
  const labels = POSITION_MAP[players.length] || POSITION_MAP[9];
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const btnSeatNum = Number(buttonSeat);
  const buttonIndex = ordered.findIndex(player => Number(player.seat) === btnSeatNum);
  if (buttonIndex >= 0) {
    const clockwise = [...ordered.slice(buttonIndex), ...ordered.slice(0, buttonIndex)];
    clockwise.forEach((player, index) => { player.position = labels[index] || ''; });
  } else if (Number.isFinite(btnSeatNum) && ordered.length >= 2) {
    // Dead button: button_seat is vacant, so first active seat clockwise after btnSeatNum is SB.
    const nextIdx = ordered.findIndex(player => Number(player.seat) > btnSeatNum);
    const startIdx = nextIdx >= 0 ? nextIdx : 0;
    const clockwise = [...ordered.slice(startIdx), ...ordered.slice(0, startIdx)];
    const deadBtnLabels = POSITION_MAP[Math.min(9, players.length + 1)]?.slice(1) || labels;
    clockwise.forEach((player, index) => { player.position = deadBtnLabels[index] || labels[index] || ''; });
  }
  return players;
}

/** Convert a persisted Club Arena hand into the parser's canonical hand shape. */
export function normalizeClubArenaHand(row, userId) {
  const summary = parseJson(row?.summary) || {};
  if (row?.corrupted === true || summary?.corrupted === true) return null;
  const gameType = String(row?.game_variant || summary?.variant || '').trim().toLowerCase();
  // Missing/unsupported variants, non-NL betting structures, or special formats
  // (bomb pots, kill pots, multi-board hands) must never be silently priced
  // with single-board NLHE ranges.
  if (!isSupportedHoldemVariant(gameType) || hasUnsupportedBettingStructure(row, summary) || isUnsupportedSpecialFormat(row)) {
    return null;
  }
  const rawPlayers = Array.isArray(summary.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(row?.players) ? row.players : []);
  const heroRaw = rawPlayers.find(player => String(playerId(player)) === String(userId));
  if (!heroRaw) return null;

  const bigBlind = Number(summary.bigBlind ?? summary.big_blind ?? row?.big_blind);
  const smallBlind = Number(summary.smallBlind ?? summary.small_blind ?? row?.small_blind);
  if (Number.isFinite(bigBlind) && bigBlind <= 0) return null;
  const players = positionedPlayers(
    rawPlayers,
    summary.buttonSeat ?? summary.button_seat ?? row?.button_seat,
    bigBlind,
  );
  const heroPlayer = players.find(player => String(player.id) === String(userId));
  // The Hetzner Club Arena recorder stores showdown holdings in the
  // top-level hole_cards map, while older/API-engine rows put them on the
  // player or summary. Pick the first candidate that actually contains two
  // valid cards; masked `cards: [null, null]` must not hide a valid map entry.
  const candidateCardLists = [
    row?.hero_private_cards,
    heroRaw.holeCards,
    heroRaw.heroCards,
    heroRaw.cards,
    row?.hole_cards?.[userId],
  ].map(cards).filter(candidate => candidate.length > 0);
  if (candidateCardLists.some(candidate => candidate.length > 2)) return null;
  const heroCards = candidateCardLists.find(candidate => candidate.length === 2) || [];
  if (heroCards.length !== 2 || heroCards[0] === heroCards[1]) return null;

  const summaryStreets = summary.streets || {};
  const topLevelActions = Array.isArray(row?.actions) ? row.actions : [];
  const heroNames = [heroRaw.displayName, heroRaw.username, heroRaw.name]
    .filter(Boolean).map(name => String(name).trim().toLowerCase());

  const rawActionsForStreet = (street) => {
    const summaryActions = summaryStreets?.[street]?.actions;
    if (Array.isArray(summaryActions) && summaryActions.length > 0) return summaryActions;
    return topLevelActions.filter(action => String(action?.street || action?.stage || 'preflop').toLowerCase() === street);
  };

  const actorKeyForPlayer = (player) => {
    if (player?.id !== null && player?.id !== undefined && String(player.id) !== '') {
      return `id:${String(player.id)}`;
    }
    if (player?.seat !== null && player?.seat !== undefined && Number.isFinite(Number(player.seat))) {
      return `seat:${Number(player.seat)}`;
    }
    return `name:${String(player?.name || '').trim().toLowerCase()}`;
  };

  const resolveActor = (action) => {
    const explicitId = action?.playerId ?? action?.userId ?? action?.player_id;
    const hasExplicitId = explicitId !== null && explicitId !== undefined && String(explicitId) !== '';
    let actor = hasExplicitId
      ? players.find(player => String(player.id) === String(explicitId))
      : null;
    if (!actor && action?.seat !== null && action?.seat !== undefined && Number.isFinite(Number(action.seat))) {
      actor = players.find(player => Number(player.seat) === Number(action.seat)) || null;
    }
    const resolvedId = hasExplicitId ? explicitId : (actor?.id ?? null);
    const actionPlayer = action?.player || action?.playerName || action?.username || actor?.name || '';
    // An explicit player id (or seat-resolved id) is authoritative even when
    // a legacy boolean incorrectly says isHero. Without an id, require an
    // identity-bound name match; never trust an unscoped isHero flag by itself.
    const isHero = (resolvedId !== null && resolvedId !== undefined && String(resolvedId) !== '')
      ? String(resolvedId) === String(userId)
      : heroNames.includes(String(actionPlayer).trim().toLowerCase());
    return {
      actor,
      playerId: resolvedId,
      playerName: actionPlayer,
      position: actor?.position || String(action?.position || '').toUpperCase(),
      isHero,
      actorKey: resolvedId !== null && resolvedId !== undefined && String(resolvedId) !== ''
        ? `id:${String(resolvedId)}`
        : (action?.seat !== null && action?.seat !== undefined
          ? `seat:${Number(action.seat)}`
          : `name:${String(actionPlayer).trim().toLowerCase()}`),
    };
  };

  // Reconstruct deterministic running pot/street contributions from blinds,
  // antes, and actions so real Hetzner rows carry exact potBeforeBB, sizingPct,
  // amountAdded vs totalBet, uncalled bet returns, and stackAtDecision into solver matching.
  const preflopRaw = rawActionsForStreet('preflop');
  // IMPORTANT: An ante or straddle in the log does NOT mean SB/BB were explicitly
  // recorded as action rows. Check only actual blind post verbs.
  const hasExplicitBlindPosts = preflopRaw.some(action => {
    const raw = normalizedRawAction(action);
    return ACTUAL_BLIND_POST_ACTIONS.has(raw) || /^(?:post)?(?:small|big)?blind$|^post[sb]b$|^killblind$/.test(raw);
  });
  const hasExplicitAntePosts = preflopRaw.some(action => {
    const raw = normalizedRawAction(action);
    return raw === 'ante' || raw === 'bombante' || /^ante/.test(raw);
  });
  const hasKnownBlinds = Number.isFinite(bigBlind) && bigBlind > 0;
  const resolvedSmallBlind = Number.isFinite(smallBlind) && smallBlind > 0
    ? smallBlind
    : (hasKnownBlinds ? bigBlind / 2 : null);
  const declaredAnteRaw = Number(
    summary.ante ?? summary.ante_amount ?? summary.anteAmount ?? row?.ante ?? row?.ante_amount
  );
  const declaredAnte = Number.isFinite(declaredAnteRaw) && declaredAnteRaw > 0 ? declaredAnteRaw : 0;

  let runningPot = 0;
  let hasTrackablePot = hasExplicitBlindPosts || hasExplicitAntePosts || hasKnownBlinds || declaredAnte > 0;
  const preflopContrib = new Map();
  const totalCommittedByActor = new Map();
  const forcedPosts = [];
  const uncalledReturns = [];
  const foldedActorKeys = new Set();
  const foldedPlayerIds = new Set();
  let explicitAnteTotal = 0;
  let preflopCurrentBet = 0;

  if (!hasExplicitBlindPosts && hasKnownBlinds) {
    const sbAmount = resolvedSmallBlind;
    runningPot += sbAmount + bigBlind;
    preflopCurrentBet = bigBlind;
    const sbPosition = players.length === 2 ? 'BTN' : 'SB';
    const sbPlayer = players.find(player => player.position === sbPosition);
    const bbPlayer = players.find(player => player.position === 'BB');
    if (sbPlayer) {
      const sbKey = actorKeyForPlayer(sbPlayer);
      preflopContrib.set(sbKey, sbAmount);
      totalCommittedByActor.set(sbKey, (totalCommittedByActor.get(sbKey) || 0) + sbAmount);
      forcedPosts.push({
        street: 'preflop',
        player: sbPlayer.name,
        playerId: sbPlayer.id,
        position: sbPlayer.position,
        type: 'sb',
        amount: sbAmount,
        amountBB: sbAmount / bigBlind,
        dead: false,
        isHero: String(sbPlayer.id) === String(userId),
      });
    }
    if (bbPlayer) {
      const bbKey = actorKeyForPlayer(bbPlayer);
      preflopContrib.set(bbKey, bigBlind);
      totalCommittedByActor.set(bbKey, (totalCommittedByActor.get(bbKey) || 0) + bigBlind);
      forcedPosts.push({
        street: 'preflop',
        player: bbPlayer.name,
        playerId: bbPlayer.id,
        position: bbPlayer.position,
        type: 'bb',
        amount: bigBlind,
        amountBB: 1,
        dead: false,
        isHero: String(bbPlayer.id) === String(userId),
      });
    }
  }

  let synthesizedAnteTotal = 0;
  if (!hasExplicitAntePosts && declaredAnte > 0) {
    const isBigBlindAnte = summary.bigBlindAnte === true || row?.big_blind_ante === true;
    const explicitTotal = Number(summary.anteTotal ?? row?.ante_total);
    if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
      synthesizedAnteTotal = explicitTotal;
    } else if (isBigBlindAnte) {
      synthesizedAnteTotal = declaredAnte;
      const bbPlayer = players.find(player => player.position === 'BB');
      if (bbPlayer) {
        const bbKey = actorKeyForPlayer(bbPlayer);
        totalCommittedByActor.set(bbKey, (totalCommittedByActor.get(bbKey) || 0) + declaredAnte);
      }
    } else {
      synthesizedAnteTotal = declaredAnte * Math.max(1, players.length);
      for (const p of players) {
        const pKey = actorKeyForPlayer(p);
        totalCommittedByActor.set(pKey, (totalCommittedByActor.get(pKey) || 0) + declaredAnte);
        forcedPosts.push({
          street: 'preflop',
          player: p.name,
          playerId: p.id,
          position: p.position,
          type: 'ante',
          amount: declaredAnte,
          amountBB: hasKnownBlinds ? declaredAnte / bigBlind : null,
          dead: true,
          isHero: String(p.id) === String(userId),
        });
      }
    }
    runningPot += synthesizedAnteTotal;
  }

  const allNormalizedActions = [];

  const normalizeStreet = (street) => {
    const summaryActions = summaryStreets?.[street]?.actions;
    const usedSummaryActions = Array.isArray(summaryActions) && summaryActions.length > 0;
    const source = usedSummaryActions
      ? summaryActions
      : topLevelActions.filter(action => String(action?.street || action?.stage || 'preflop').toLowerCase() === street);
    const streetContrib = street === 'preflop' ? preflopContrib : new Map();
    const streetActors = new Map();
    let currentBet = street === 'preflop' ? preflopCurrentBet : 0;
    let lastRaiseIncrement = street === 'preflop' && hasKnownBlinds ? bigBlind : 0;
    let streetHasExplicitReturn = false;
    let hadShortAllInCallOnStreet = false;
    const normalized = [];

    for (const action of source) {
      const amount = Number(action?.amount) || 0;
      const raw = normalizedRawAction(action);
      const { playerId: actionPlayerId, playerName: actionPlayer, position, isHero, actorKey } = resolveActor(action);
      streetActors.set(actorKey, { playerId: actionPlayerId, playerName: actionPlayer, position, isHero });

      if (action?.historyEvent === 'uncalled_bet_returned' || raw === 'return' || raw === 'returnedbet' || raw === 'refund') {
        streetHasExplicitReturn = true;
        if (amount > 0) {
          if (runningPot >= amount) runningPot -= amount;
          if (streetContrib.has(actorKey)) {
            streetContrib.set(actorKey, Math.max(0, (streetContrib.get(actorKey) || 0) - amount));
          }
          if (totalCommittedByActor.has(actorKey)) {
            totalCommittedByActor.set(actorKey, Math.max(0, (totalCommittedByActor.get(actorKey) || 0) - amount));
          }
          uncalledReturns.push({
            street,
            player: actionPlayer,
            playerId: actionPlayerId,
            position,
            amount,
            amountBB: hasKnownBlinds ? amount / bigBlind : null,
            isHero,
          });
        }
        continue;
      }

      if (isForcedAction(action)) {
        if (amount > 0 && (BLIND_POST_ACTIONS.has(raw) || /^(small|big)?blind|ante|straddle/.test(raw))) {
          runningPot += amount;
          hasTrackablePot = true;
          const isDead = Boolean(action?.dead || raw === 'ante' || raw === 'bombante');
          if (raw === 'ante' || raw === 'bombante') {
            explicitAnteTotal += amount;
          }
          totalCommittedByActor.set(actorKey, (totalCommittedByActor.get(actorKey) || 0) + amount);
          if (!isDead) {
            const nextContrib = (streetContrib.get(actorKey) || 0) + amount;
            streetContrib.set(actorKey, nextContrib);
            if (nextContrib > currentBet) currentBet = nextContrib;
          }
          forcedPosts.push({
            street,
            player: actionPlayer,
            playerId: actionPlayerId,
            position,
            type: raw === 'smallblind' || raw === 'postsb' ? 'sb'
              : (raw === 'bigblind' || raw === 'postbb' || raw === 'blind' ? 'bb' : raw),
            amount,
            amountBB: hasKnownBlinds ? amount / bigBlind : null,
            dead: isDead,
            isHero,
          });
        }
        continue;
      }

      const normalizedAction = actionName(action);
      if (!normalizedAction) continue;

      if (normalizedAction === 'fold') {
        foldedActorKeys.add(actorKey);
        if (actionPlayerId !== null && actionPlayerId !== undefined && String(actionPlayerId) !== '') {
          foldedPlayerIds.add(String(actionPlayerId));
        }
      }

      const explicitPotBefore = [
        action.potBefore, action.pot_before, action.potSizeBefore, action.pot_size_before,
      ].map(Number).find(value => Number.isFinite(value) && value >= 0);
      const explicitSizing = [
        action.sizingPct, action.sizing_pct, action.sizePct, action.size_pct,
        action.betPctPot, action.bet_pct_pot, action.potPercentage, action.pot_percentage,
      ].map(Number).find(value => Number.isFinite(value) && value > 0);
      const explicitCurrentBetBefore = Number.isFinite(Number(action.currentBetBefore))
        ? Number(action.currentBetBefore)
        : null;
      const explicitRaiseTo = Number.isFinite(Number(action.raiseTo)) ? Number(action.raiseTo) : null;

      const potBefore = explicitPotBefore ?? (hasTrackablePot ? runningPot : null);
      const currentBetBefore = explicitCurrentBetBefore ?? currentBet;
      const prevContrib = streetContrib.get(actorKey) || 0;
      const committedBeforeHand = totalCommittedByActor.get(actorKey) || 0;

      let raiseTo = explicitRaiseTo;
      let delta = 0;
      let isShortAllIn = Boolean(action?.isShortAllIn || action?.shortAllIn);
      if (normalizedAction === 'bet') {
        delta = Math.max(0, amount);
        raiseTo = raiseTo ?? (prevContrib + delta);
      } else if (normalizedAction === 'raise') {
        raiseTo = raiseTo ?? (amount > prevContrib && amount >= currentBetBefore ? amount : prevContrib + amount);
        delta = Math.max(0, raiseTo - prevContrib);
      } else if (normalizedAction === 'call') {
        const callNeeded = currentBetBefore > prevContrib ? currentBetBefore - prevContrib : amount;
        delta = (prevContrib > 0 && currentBetBefore > prevContrib && amount === currentBetBefore)
          ? Math.max(0, callNeeded)
          : Math.max(0, amount);
      } else if (normalizedAction === 'allin') {
        if (action?.amountAdded !== undefined && Number.isFinite(Number(action.amountAdded))) {
          delta = Math.max(0, Number(action.amountAdded));
          raiseTo = raiseTo ?? (prevContrib + delta);
        } else if (amount > currentBetBefore) {
          raiseTo = raiseTo ?? amount;
          delta = Math.max(0, raiseTo - prevContrib);
        } else {
          // Hetzner records all_in.amount as total street commitment (stack + bet),
          // so subtract prevContrib to avoid double-counting blinds/prior bets.
          delta = Math.max(0, amount > prevContrib ? amount - prevContrib : amount);
          raiseTo = raiseTo ?? (prevContrib + delta);
        }
        const totalStreetBet = prevContrib + delta;
        if (totalStreetBet < currentBetBefore) {
          isShortAllIn = true;
          hadShortAllInCallOnStreet = true;
        } else if (totalStreetBet > currentBetBefore) {
          const raiseDiff = totalStreetBet - currentBetBefore;
          const minRaise = Math.max(hasKnownBlinds ? bigBlind : 0, lastRaiseIncrement);
          if (minRaise > 0 && raiseDiff < minRaise) {
            isShortAllIn = true;
          }
        }
      }

      const totalBet = prevContrib + delta;
      if (totalBet > currentBetBefore) {
        lastRaiseIncrement = totalBet - currentBetBefore;
      }

      let computedSizing = null;
      const canDeriveRaiseSizing = (explicitRaiseTo !== null && explicitCurrentBetBefore !== null)
        || (!usedSummaryActions && ['manual', 'wh-engine', 'engine-api'].includes(String(row?.source || '').toLowerCase()) && hasTrackablePot);
      if (normalizedAction === 'bet' && potBefore > 0 && delta > 0) {
        computedSizing = (delta / potBefore) * 100;
      } else if (
        normalizedAction === 'raise'
        && canDeriveRaiseSizing
        && potBefore !== null && potBefore >= 0
        && raiseTo !== null && raiseTo > currentBetBefore
      ) {
        const callCost = Math.max(0, currentBetBefore - prevContrib);
        const potAfterCall = potBefore + callCost;
        const raiseOver = raiseTo - currentBetBefore;
        if (potAfterCall > 0 && raiseOver > 0) {
          computedSizing = (raiseOver / potAfterCall) * 100;
        }
      }

      const potAfter = potBefore !== null ? potBefore + delta : null;
      const entry = {
        player: actionPlayer,
        playerId: actionPlayerId,
        position,
        action: normalizedAction,
        amount,
        amountBB: hasKnownBlinds ? amount / bigBlind : null,
        amountAdded: delta,
        amountAddedBB: hasKnownBlinds ? delta / bigBlind : null,
        totalBet,
        totalBetBB: hasKnownBlinds ? totalBet / bigBlind : null,
        potBefore,
        potBeforeBB: potBefore !== null && hasKnownBlinds
          ? potBefore / bigBlind
          : null,
        potAfter,
        potAfterBB: potAfter !== null && hasKnownBlinds
          ? potAfter / bigBlind
          : null,
        sizingPct: explicitSizing ?? computedSizing,
        currentBetBefore,
        raiseTo,
        isShortAllIn,
        isHero,
        _actorKey: actorKey,
        _committedBefore: committedBeforeHand,
      };
      normalized.push(entry);
      allNormalizedActions.push(entry);

      if (delta > 0) {
        const basePot = explicitPotBefore !== undefined ? explicitPotBefore : runningPot;
        runningPot = basePot + delta;
        const nextContrib = prevContrib + delta;
        streetContrib.set(actorKey, nextContrib);
        totalCommittedByActor.set(actorKey, committedBeforeHand + delta);
        if (nextContrib > currentBet) currentBet = nextContrib;
      }
    }

    // Reconcile uncalled excess at end of street when no explicit return row was logged
    // and either a short all-in call occurred or stored pot_size proves the uncalled return.
    if (!streetHasExplicitReturn && streetContrib.size >= 1) {
      const sortedContribs = [...streetContrib.entries()]
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1]);
      if (sortedContribs.length >= 1) {
        const [topKey, topVal] = sortedContribs[0];
        const secondVal = sortedContribs[1]?.[1] ?? 0;
        const excess = +(topVal - secondVal).toFixed(4);
        const storedPot = Number(row?.pot_size ?? summary?.potSize ?? summary?.pot_size);
        const storedPotMatchesReturn = Number.isFinite(storedPot) && storedPot > 0
          && Math.abs((runningPot - excess) - storedPot) < 0.05
          && Math.abs(runningPot - storedPot) >= 0.05;
        if (excess > 0 && (hadShortAllInCallOnStreet || storedPotMatchesReturn)) {
          runningPot = Math.max(0, +(runningPot - excess).toFixed(4));
          streetContrib.set(topKey, Math.max(0, +(topVal - excess).toFixed(4)));
          totalCommittedByActor.set(topKey, Math.max(0, +((totalCommittedByActor.get(topKey) || 0) - excess).toFixed(4)));
          const meta = streetActors.get(topKey) || {};
          uncalledReturns.push({
            street,
            player: meta.playerName || '',
            playerId: meta.playerId ?? null,
            position: meta.position || '',
            amount: excess,
            amountBB: hasKnownBlinds ? excess / bigBlind : null,
            isHero: meta.isHero === true,
            inferred: true,
          });
        }
      }
    }

    return normalized;
  };

  const preflopActions = normalizeStreet('preflop');
  const flop = cards(summaryStreets?.flop?.cards || summaryStreets?.flop?.board);
  const turnCards = cards(summaryStreets?.turn?.cards || [summaryStreets?.turn?.card]);
  const riverCards = cards(summaryStreets?.river?.cards || [summaryStreets?.river?.card]);
  const fallbackBoard = cards(
    summary.communityCards || summary.board || row?.community_cards || row?.board,
  );
  const finalFlop = flop.length >= 3 ? flop.slice(0, 3) : fallbackBoard.slice(0, 3);
  const turn = turnCards[0] || fallbackBoard[3] || '';
  const river = riverCards[0] || fallbackBoard[4] || '';

  // Validate deck card uniqueness across hero hole cards and dealt board cards.
  const dealtBoardCards = [
    ...finalFlop,
    ...(turn ? [turn] : []),
    ...(river ? [river] : []),
  ];
  const uniqueCardSet = new Set([...heroCards, ...dealtBoardCards]);
  if (uniqueCardSet.size !== heroCards.length + dealtBoardCards.length) {
    return null;
  }

  const flopActions = finalFlop.length >= 3 ? normalizeStreet('flop') : [];
  const turnActions = turn ? normalizeStreet('turn') : [];
  const riverActions = river ? normalizeStreet('river') : [];

  // Recover starting stacks when raw hand_history stores post-settlement stacks + winners
  const rawWinners = Array.isArray(row?.winners) && row.winners.length > 0
    ? row.winners
    : (Array.isArray(summary?.winners) ? summary.winners : []);
  const wonByPlayerId = new Map();
  for (const w of rawWinners) {
    const wId = w?.userId ?? w?.user_id ?? w?.playerId;
    if (wId !== null && wId !== undefined && String(wId) !== '') {
      wonByPlayerId.set(String(wId), (wonByPlayerId.get(String(wId)) || 0) + (Number(w.amount) || 0));
    }
  }
  const storedPotSize = Number(row?.pot_size ?? summary?.potSize ?? summary?.pot_size);
  const potReconciles = Number.isFinite(storedPotSize) && storedPotSize > 0
    ? Math.abs(runningPot - storedPotSize) < 0.05
    : true;

  const startStackChipsByActor = new Map();
  for (const p of players) {
    const pKey = actorKeyForPlayer(p);
    const netInvested = totalCommittedByActor.get(pKey) || 0;
    let startChips = p.startStackChips;
    if (!p.hasExplicitStart && rawWinners.length > 0 && p.rawSettledStack !== null && potReconciles) {
      const grossWon = p.id !== null && p.id !== undefined ? (wonByPlayerId.get(String(p.id)) || 0) : 0;
      const recovered = +(p.rawSettledStack - grossWon + netInvested).toFixed(4);
      if (recovered > 0) {
        startChips = recovered;
        if (hasKnownBlinds) p.stack = +(recovered / bigBlind).toFixed(4);
      }
    } else if (startChips === null && netInvested > 0) {
      startChips = netInvested;
      if (hasKnownBlinds) p.stack = +(netInvested / bigBlind).toFixed(4);
    }
    if (String(p.id) === String(userId) && Number.isFinite(Number(row?.hero_effective_stack_bb ?? row?.effective_stack_bb_at_deal)) && Number(row?.hero_effective_stack_bb ?? row?.effective_stack_bb_at_deal) > 0 && hasKnownBlinds && startChips === null) {
      startChips = Number(row?.hero_effective_stack_bb ?? row?.effective_stack_bb_at_deal) * bigBlind;
    }
    if (startChips !== null && startChips > 0) {
      startStackChipsByActor.set(pKey, startChips);
      p.startStackChips = startChips;
    }
    delete p.hasExplicitStart;
    delete p.rawSettledStack;
  }

  // Stamp stackAtDecision / stackAtDecisionBB / stackAfter / stackAfterBB on every normalized action
  for (const act of allNormalizedActions) {
    const startChips = startStackChipsByActor.get(act._actorKey) ?? null;
    const committedBefore = act._committedBefore || 0;
    if (startChips !== null && startChips > 0) {
      const beforeChips = Math.max(0, +(startChips - committedBefore).toFixed(4));
      const afterChips = Math.max(0, +(beforeChips - (act.amountAdded || 0)).toFixed(4));
      act.stackAtDecision = beforeChips;
      act.stackAtDecisionBB = hasKnownBlinds ? +(beforeChips / bigBlind).toFixed(4) : null;
      act.stackAfter = afterChips;
      act.stackAfterBB = hasKnownBlinds ? +(afterChips / bigBlind).toFixed(4) : null;
    } else {
      act.stackAtDecision = null;
      act.stackAtDecisionBB = null;
      act.stackAfter = null;
      act.stackAfterBB = null;
    }
    delete act._actorKey;
    delete act._committedBefore;
  }

  // Showdown & opponent hole-card privacy enforcement:
  // Opponent hole cards that were mucked or folded MUST remain strictly unavailable ([]).
  const rawShowdown = Array.isArray(row?.showdown)
    ? row.showdown
    : (Array.isArray(summary?.showdown) ? summary.showdown : []);
  const muckedPlayerIds = new Set();
  const revealedShowdownIds = new Set();
  for (const entry of rawShowdown) {
    const sId = entry?.user_id ?? entry?.userId ?? entry?.playerId;
    if (sId === null || sId === undefined || String(sId) === '') continue;
    if (entry.mucked === true) {
      muckedPlayerIds.add(String(sId));
    } else {
      revealedShowdownIds.add(String(sId));
    }
  }
  for (const rawP of rawPlayers) {
    const pId = playerId(rawP);
    if (pId === null || pId === undefined || String(pId) === '') continue;
    if (rawP?.mucked === true || rawP?.showdown_reveal?.mucked === true || rawP?.showed === false || rawP?.showedCards === false) {
      muckedPlayerIds.add(String(pId));
    } else if (rawP?.showed === true || rawP?.showedCards === true || (rawP?.showdown_reveal && rawP.showdown_reveal.mucked === false)) {
      revealedShowdownIds.add(String(pId));
    }
  }

  const showdownPlayers = [];
  for (const p of players) {
    const pIdStr = p.id !== null && p.id !== undefined ? String(p.id) : '';
    const pKey = actorKeyForPlayer(p);
    const isHeroPlayer = pIdStr === String(userId);
    const didFold = foldedPlayerIds.has(pIdStr) || foldedActorKeys.has(pKey);
    const didMuck = muckedPlayerIds.has(pIdStr);
    if (isHeroPlayer) {
      p.holeCards = heroCards;
      p.holeCardsAvailable = true;
      p.mucked = didMuck;
    } else {
      const publicRevealed = cards(row?.hole_cards?.[pIdStr]);
      const playerCards = p.holeCards || [];
      const candidateRevealed = publicRevealed.length === 2 ? publicRevealed : (playerCards.length === 2 ? playerCards : []);
      const canReveal = !didFold && !didMuck && (
        publicRevealed.length === 2
        || revealedShowdownIds.has(pIdStr)
        || (rawShowdown.length === 0 && candidateRevealed.length === 2)
      );
      p.holeCards = canReveal ? candidateRevealed : [];
      p.holeCardsAvailable = p.holeCards.length === 2;
      p.mucked = didMuck || (!didFold && !p.holeCardsAvailable);
    }
    if (!didFold) {
      showdownPlayers.push({
        playerId: p.id,
        name: p.name,
        position: p.position,
        mucked: Boolean(p.mucked),
        holeCards: p.holeCards,
        holeCardsAvailable: p.holeCardsAvailable,
      });
    }
  }

  // Side-pot and main-pot normalization
  const rawPots = Array.isArray(row?.pots) && row.pots.length > 0
    ? row.pots
    : (Array.isArray(summary?.pots) && summary.pots.length > 0 ? summary.pots : null);
  let normalizedPots = [];
  if (rawPots) {
    normalizedPots = rawPots.map((potEntry, idx) => {
      const amt = Number(potEntry?.amount ?? potEntry) || 0;
      const potIdx = Number.isFinite(Number(potEntry?.index)) ? Number(potEntry.index) : idx;
      return {
        index: potIdx,
        type: potIdx === 0 ? 'main' : 'side',
        amount: amt,
        amountBB: hasKnownBlinds ? +(amt / bigBlind).toFixed(4) : null,
      };
    }).filter(p => p.amount > 0);
  } else {
    // Derive main pot and side pots from player commitments when distinct non-folded commitment tiers exist
    const nonFoldedLevels = [...new Set(
      players
        .filter(p => {
          const pIdStr = p.id !== null && p.id !== undefined ? String(p.id) : '';
          return !foldedPlayerIds.has(pIdStr) && !foldedActorKeys.has(actorKeyForPlayer(p));
        })
        .map(p => +(totalCommittedByActor.get(actorKeyForPlayer(p)) || 0).toFixed(4))
        .filter(v => v > 0)
    )].sort((a, b) => a - b);

    if (nonFoldedLevels.length > 1) {
      let prevLevel = 0;
      nonFoldedLevels.forEach((level, idx) => {
        const sliceDiff = level - prevLevel;
        if (sliceDiff <= 0) return;
        let potSlice = 0;
        const eligiblePlayerIds = [];
        for (const p of players) {
          const pKey = actorKeyForPlayer(p);
          const committed = totalCommittedByActor.get(pKey) || 0;
          if (committed > prevLevel) {
            potSlice += Math.min(committed, level) - prevLevel;
          }
          const pIdStr = p.id !== null && p.id !== undefined ? String(p.id) : '';
          if (committed >= level && !foldedPlayerIds.has(pIdStr) && !foldedActorKeys.has(pKey)) {
            eligiblePlayerIds.push(p.id);
          }
        }
        if (potSlice > 0) {
          normalizedPots.push({
            index: idx,
            type: idx === 0 ? 'main' : 'side',
            amount: +potSlice.toFixed(4),
            amountBB: hasKnownBlinds ? +(potSlice / bigBlind).toFixed(4) : null,
            eligiblePlayerIds,
          });
        }
        prevLevel = level;
      });
    } else if (runningPot > 0) {
      normalizedPots = [{
        index: 0,
        type: 'main',
        amount: +runningPot.toFixed(4),
        amountBB: hasKnownBlinds ? +(runningPot / bigBlind).toFixed(4) : null,
      }];
    }
  }

  const rawFormat = String(summary.format || row?.format || '').trim().toLowerCase();
  const hasTournamentId = row?.tournament_id !== null
    && row?.tournament_id !== undefined
    && String(row.tournament_id).trim() !== '';
  const isCashClubRow = !hasTournamentId && (
    row?.tournament_id === null
    || Boolean(row?.table_id)
    || ['manual', 'wh-engine', 'engine-api'].includes(String(row?.source || '').trim().toLowerCase())
  );
  const format = ['tournament', 'mtt'].includes(rawFormat) || hasTournamentId
    ? 'tournament'
    : (['cash', 'ring'].includes(rawFormat) || isCashClubRow ? 'cash' : null);

  const explicitHeroEffBb = Number(row?.hero_effective_stack_bb ?? row?.effective_stack_bb_at_deal);
  let computedEffectiveStackBb = Number.isFinite(explicitHeroEffBb) && explicitHeroEffBb > 0
    ? explicitHeroEffBb
    : null;
  if (computedEffectiveStackBb === null && Number.isFinite(Number(heroPlayer?.stack)) && Number(heroPlayer.stack) > 0) {
    const heroStackBb = Number(heroPlayer.stack);
    const villainStacksBb = players
      .filter(player => String(player?.id) !== String(userId))
      .map(player => Number(player?.stack))
      .filter(stack => Number.isFinite(stack) && stack > 0);
    computedEffectiveStackBb = villainStacksBb.length > 0
      ? Math.min(heroStackBb, Math.max(...villainStacksBb))
      : heroStackBb;
  }

  const totalAnteChips = explicitAnteTotal > 0 ? explicitAnteTotal : synthesizedAnteTotal;
  const perPlayerAnteChips = declaredAnte > 0
    ? declaredAnte
    : (explicitAnteTotal > 0 && players.length > 0 ? +(explicitAnteTotal / players.length).toFixed(4) : 0);

  return {
    id: `club-arena:${row.id || summary.id || summary.handId || row.hand_number}`,
    site: 'smarter-poker-club-arena',
    format,
    gameType: ['nlh', 'nlhe'].includes(gameType) ? 'nlhe' : 'no-limit-holdem',
    bettingStructure: 'NL',
    tableSize: players.length,
    smallBlind: resolvedSmallBlind,
    bigBlind: hasKnownBlinds ? bigBlind : null,
    blindLevel: hasKnownBlinds && resolvedSmallBlind !== null ? `${resolvedSmallBlind}/${bigBlind}` : null,
    ante: perPlayerAnteChips,
    anteBB: hasKnownBlinds && perPlayerAnteChips > 0 ? +(perPlayerAnteChips / bigBlind).toFixed(4) : 0,
    anteTotal: totalAnteChips,
    anteTotalBB: hasKnownBlinds && totalAnteChips > 0 ? +(totalAnteChips / bigBlind).toFixed(4) : 0,
    stackUnit: 'bb',
    buttonSeat: summary.buttonSeat ?? summary.button_seat ?? row?.button_seat ?? null,
    players,
    hero: {
      id: userId,
      name: heroPlayer?.name || heroRaw.displayName || heroRaw.username || 'Hero',
      position: heroPlayer?.position || heroRaw.position || '',
      holeCards: heroCards,
      stackUnit: 'bb',
      stack: (Number.isFinite(explicitHeroEffBb) && explicitHeroEffBb > 0)
        ? explicitHeroEffBb
        : (heroPlayer?.stack || null),
      effectiveStackBb: computedEffectiveStackBb,
    },
    effectiveStackBb: computedEffectiveStackBb,
    forcedPosts,
    uncalledReturns,
    finalPot: +runningPot.toFixed(4),
    finalPotBB: hasKnownBlinds ? +(runningPot / bigBlind).toFixed(4) : null,
    mainPot: normalizedPots[0]?.amount ?? +runningPot.toFixed(4),
    sidePots: normalizedPots.slice(1).map(p => p.amount),
    pots: normalizedPots,
    showdown: {
      wentToShowdown: rawShowdown.length > 0 || Boolean(summary.wentToShowdown || summary.showdown) || (Boolean(river) && showdownPlayers.length >= 2),
      players: showdownPlayers,
      winners: rawWinners.map((w, idx) => ({
        playerId: w?.userId ?? w?.user_id ?? w?.playerId ?? null,
        amount: Number(w?.amount) || 0,
        amountBB: hasKnownBlinds ? +((Number(w?.amount) || 0) / bigBlind).toFixed(4) : null,
        potIndex: Number.isFinite(Number(w?.potIndex ?? w?.pot_index)) ? Number(w?.potIndex ?? w?.pot_index) : idx,
        handName: w?.hand?.name ?? w?.hand_name ?? w?.handDescription ?? null,
      })),
    },
    streets: {
      preflop: { actions: preflopActions },
      flop: finalFlop.length >= 3 ? { board: finalFlop, actions: flopActions } : null,
      turn: turn ? { card: turn, actions: turnActions } : null,
      river: river ? { card: river, actions: riverActions } : null,
    },
  };
}

const PRIVATE_FACT_BATCH_SIZE = 200;

/**
 * Load the signed-in player's own durable Club Arena cards.
 *
 * `hand_history.hole_cards` is intentionally reveal-only: folded and mucked
 * holdings must never become visible to every participant. Club Arena writes
 * each human player's full private copy to `ca_hand_facts`, protected by
 * user-scoped RLS. The Leak Finder server already knows the authenticated user,
 * so it can safely join only that user's fact row back to the public action log.
 */
async function fetchPrivateHeroCards(db, userId, handRows) {
  const handIds = [...new Set(handRows.map(row => String(row?.id || '')).filter(Boolean))];
  const byHandId = new Map();
  const effectiveStackByHandId = new Map();
  let available = true;
  for (let index = 0; index < handIds.length; index += PRIVATE_FACT_BATCH_SIZE) {
    const batch = handIds.slice(index, index + PRIVATE_FACT_BATCH_SIZE);
    let result;
    try {
      result = await db.from('ca_hand_facts')
        .select('hand_id, hole_cards, effective_stack_bb_at_deal')
        .eq('user_id', userId)
        .in('hand_id', batch)
        .limit(batch.length);
    } catch (_) {
      available = false;
      break;
    }
    if (result?.error) {
      available = false;
      break;
    }
    for (const fact of result?.data || []) {
      const privateCards = cards(fact?.hole_cards);
      if (privateCards.length >= 2) byHandId.set(String(fact.hand_id), privateCards);
      const dealtStackBB = Number(fact?.effective_stack_bb_at_deal);
      if (Number.isFinite(dealtStackBB) && dealtStackBB > 0) {
        effectiveStackByHandId.set(String(fact.hand_id), dealtStackBB);
      }
    }
  }
  return { available, byHandId, effectiveStackByHandId };
}

function handNotation(value) {
  const normalized = cards(value);
  if (normalized.length < 2) return null;
  const [a, b] = normalized;
  const r1 = a[0];
  const r2 = b[0];
  if (r1 === r2) return `${r1}${r2}`;
  const highFirst = RANKS.indexOf(r1) > RANKS.indexOf(r2);
  const high = highFirst ? r1 : r2;
  const low = highFirst ? r2 : r1;
  return `${high}${low}${a[1] === b[1] ? 's' : 'o'}`;
}

function canonicalBoard(value) {
  const normalized = cards(value).map(card => card.toLowerCase());
  // Flop order is immaterial; turn and river order defines a different node.
  return [...normalized.slice(0, 3).sort(), ...normalized.slice(3)].join('');
}

function canonicalCombo(value) {
  return cards(value).map(card => card.toLowerCase()).sort().join('');
}

function isSupportedHoldemHand(hand) {
  const raw = String(hand?.variant || hand?.gameVariant || hand?.gameType || '').toLowerCase().replace(/[^a-z]/g, '');
  return HOLDEM_VARIANTS.has(raw) && cards(hand?.hero?.holeCards).length === 2;
}

function questionBoard(question) {
  const scenario = question?.scenario || {};
  if (Array.isArray(question?.boardCards)) return question.boardCards;
  if (Array.isArray(scenario.boardCards)) return scenario.boardCards;
  return String(scenario.board || '').replace(/\s+/g, '').match(/[2-9TJQKA][shdc]/gi) || [];
}

function optionAction(option) {
  const id = String(option?.id ?? option ?? '').toLowerCase();
  const label = String(option?.text ?? option?.label ?? option ?? '').toLowerCase();
  if (id === 'f' || id === 'fold' || /^fold/.test(label)) return 'fold';
  if (id === 'x' || id === 'check' || /^check/.test(label)) return 'check';
  if (id === 'c' || id === 'call' || /^call/.test(label)) return 'call';
  if (/allin|push|shove|jam/.test(`${id} ${label}`)) return 'allin';
  if (/^(?:r\d*|raise[_-]?\d*)$/.test(id) || /raise|3-bet|4-bet/.test(label)) return 'raise';
  if (/^(?:b\d*|bet[_-]?\d*)$/.test(id) || /^bet/.test(label)) return 'bet';
  return null;
}

function optionSizingPercent(option) {
  const id = String(option?.id ?? option ?? '').toLowerCase().replace(/[\s-]/g, '_');
  const label = String(option?.text ?? option?.label ?? option ?? '').toLowerCase();
  const idMatch = /^(?:b|r|bet_|raise_)(\d+(?:\.\d+)?)$/.exec(id);
  const labelMatch = /(?:bet|raise|overbet)[^\d]*(\d+(?:\.\d+)?)\s*%/.exec(label);
  const value = Number(idMatch?.[1] ?? labelMatch?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapPlayedAction(question, point) {
  const played = actionName({ action: point?.action });
  const matches = (question?.options || []).filter(option => optionAction(option) === played);
  if (played === 'bet' || played === 'raise') {
    const sized = matches.map(option => ({ option, pct: optionSizingPercent(option) }))
      .filter(candidate => candidate.pct !== null);
    if (sized.length > 0) {
      const playedPct = Number(point?.sizingPct);
      if (!Number.isFinite(playedPct) || playedPct <= 0) return null;
      const closestDistance = Math.min(...sized.map(candidate => Math.abs(candidate.pct - playedPct)));
      // Recorder rounding can move a canonical percentage slightly, but two
      // equally close solver actions remain ambiguous and must never be graded.
      const closest = sized.filter(candidate => Math.abs(candidate.pct - playedPct) === closestDistance);
      if (closestDistance > 2 || closest.length !== 1) return null;
      return String(closest[0].option?.id ?? closest[0].option);
    }
  }
  return matches.length === 1 ? String(matches[0]?.id ?? matches[0]) : null;
}

function normalizedDecisionAction(action) {
  return {
    street: String(action?.street || '').toLowerCase(),
    position: String(action?.position || '').toUpperCase(),
    action: optionAction({ id: action?.action ?? action?.id, text: action?.label ?? action?.text }) || actionName(action),
    sizingPct: Number.isFinite(Number(action?.sizingPct ?? action?.sizePct))
      ? Number(action?.sizingPct ?? action?.sizePct)
      : optionSizingPercent(action?.action ?? action?.id),
  };
}

function exactActionHistoryCompatible(questionActions, pointActions) {
  if (!Array.isArray(questionActions)) return true;
  if (!Array.isArray(pointActions) || questionActions.length !== pointActions.length) return false;
  return questionActions.every((rawQuestionAction, index) => {
    const expected = normalizedDecisionAction(rawQuestionAction);
    const actual = normalizedDecisionAction(pointActions[index]);
    if (!expected.action || !expected.street || !expected.position) return false;
    if (expected.action !== actual.action || expected.street !== actual.street
      || expected.position !== actual.position) return false;
    if (['bet', 'raise'].includes(expected.action) && expected.sizingPct === null) return false;
    if (expected.sizingPct !== null) {
      return actual.sizingPct !== null && Math.abs(expected.sizingPct - actual.sizingPct) <= 2;
    }
    return true;
  });
}

function questionNode(question) {
  const scenario = question?.scenario || {};
  const explicit = String(scenario.nodeType || scenario.spotType || '').toLowerCase();
  if (explicit) return explicit;
  if (String(question?.type || '').toUpperCase() === 'CHART') {
    return /shove|push|all-in/i.test(String(scenario.action || '')) ? 'preflop_facing_raise' : 'preflop_open';
  }
  // PIO cache rows predate the explicit nodeType field, but their server-owned
  // action prompt still identifies whether hero is facing aggression. This is
  // the same prompt served by Training Arena; infer only the two unambiguous
  // postflop node classes and leave every other legacy prompt unpriced.
  const street = String(scenario.street || '').toLowerCase();
  const action = String(scenario.action || '').toLowerCase();
  if (street && street !== 'preflop') {
    if (/villain\s+(bets|raises)|facing\s+(a\s+)?(bet|raise)/.test(action)) return 'hero_faces_bet';
    if (/villain\s+checks|action\s+is\s+on\s+you|first\s+to\s+act/.test(action)) return 'hero_bets_or_checks';
  }
  return '';
}

function nodeCompatible(question, point) {
  const aliases = {
    preflop_open: ['preflop_open', 'rfi'],
    preflop_4bet: ['preflop_4bet', '4bet'],
    preflop_squeeze: ['preflop_squeeze', 'squeeze'],
    // The parser can prove that hero faced a raise, but not whether the exact
    // cached node was a 3-bet, blind defence, or cold-call branch. Never merge
    // those solver ranges; only a cache row carrying the same generic node is
    // eligible until villain position and wager context are persisted.
    preflop_facing_raise: ['preflop_facing_raise'],
    hero_faces_bet: ['hero_faces_bet'],
    hero_bets_or_checks: ['hero_bets_or_checks'],
  };
  return (aliases[point.nodeClass] || []).includes(questionNode(question));
}

function fingerprint(question) {
  const frequencies = Object.entries(question?.gtoFrequencies || {}).sort(([a], [b]) => a.localeCompare(b));
  const options = (question?.options || []).map(option => [String(option?.id ?? option), optionAction(option)]).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ frequencies, options, correct: String(question?.correctAnswer || '') });
}

function canonicalFingerprint(row) {
  return String(row?.policy_checksum || '') || fingerprint(row?.question_data);
}

function exactIdentityCompatible(question, hand, point) {
  if (!isSupportedHoldemHand(hand)) return false;
  const scenario = question?.scenario || {};

  // Concrete suits/blockers matter postflop. Notation alone (e.g. JTs) is not
  // sufficient evidence on a board containing those suits.
  if (point.street !== 'preflop') {
    const questionCards = question?.heroCards || scenario.heroCards;
    if (!Array.isArray(questionCards) || canonicalCombo(questionCards) !== canonicalCombo(point.holeCards)) return false;
  }

  const questionPlayers = Number(scenario.tableSize ?? scenario.playerCount ?? scenario.numPlayers);
  if (Number.isFinite(questionPlayers) && questionPlayers > 0 && Number(hand?.tableSize) !== questionPlayers) return false;

  const questionStack = Number(scenario.stackDepth ?? scenario.effectiveStack);
  if (Number.isFinite(questionStack) && questionStack > 0) {
    const heroStack = Number(hand?.hero?.stack);
    if (!Number.isFinite(heroStack) || Math.abs(heroStack - questionStack) > 1) return false;
  }

  const rawQuestionPot = scenario.potSize ?? scenario.pot;
  const rawDecisionPot = point?.potBeforeBB;
  const questionPot = rawQuestionPot === null || rawQuestionPot === undefined || rawQuestionPot === ''
    ? Number.NaN : Number(rawQuestionPot);
  const decisionPot = rawDecisionPot === null || rawDecisionPot === undefined || rawDecisionPot === ''
    ? Number.NaN : Number(rawDecisionPot);
  if (!Number.isFinite(questionPot) || questionPot < 0
    || !Number.isFinite(decisionPot) || decisionPot < 0
    || Math.abs(decisionPot - questionPot) > 0.05) return false;

  const questionVillain = String(scenario.villainPosition || '').toUpperCase();
  const decisionVillain = String(point?.villainPosition || '').toUpperCase();
  if (!questionVillain || !decisionVillain || decisionVillain !== questionVillain) return false;

  if (!Array.isArray(scenario.actionHistory)
    || !exactActionHistoryCompatible(scenario.actionHistory, point?.priorActions)) return false;

  return true;
}

async function findQuestion(db, hand, point) {
  const notation = handNotation(point.holeCards);
  if (!point.position || !notation || !isSupportedHoldemHand(hand)
    || !['cash', 'tournament'].includes(hand.format)) return null;
  const prefix = hand.format === 'tournament' ? 'mtt-%' : 'cash-%';
  const { data, error } = await db
    .from('training_question_cache')
    .select('question_id, game_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
    .like('game_id', prefix)
    .in('quality_status', ['active', 'active_fallback'])
    .eq('question_data->scenario->>street', point.street)
    .eq('question_data->scenario->>heroPosition', point.position)
    // Filter on the indexed solver signature BEFORE the candidate cap. With
    // 27k+ cached questions, taking 250 position/street rows first could omit
    // the requested holding even though its exact solver row existed.
    .eq('question_data->scenario->>heroHand', notation)
    .limit(250);
  if (error) throw error;
  const requestedBoard = canonicalBoard(point.board);
  const candidates = (data || []).map((row) => ({
    ...row,
    question_data: cacheQuestionFromRow(row),
  })).filter((row) => cacheRowIsServingEligible(row)).filter(row => {
    const question = row.question_data || {};
    const heroHand = question?.scenario?.heroHand || question?.heroHand;
    return String(heroHand || '').toUpperCase() === notation.toUpperCase() && nodeCompatible(question, point);
  }).map(row => {
    const candidateBoard = questionBoard(row.question_data);
    const exact = canonicalBoard(candidateBoard) === requestedBoard
      && exactIdentityCompatible(row.question_data, hand, point);
    const flopMatch = point.board.length > 3 && canonicalBoard(candidateBoard.slice(0, 3)) === canonicalBoard(point.board.slice(0, 3));
    return { ...row, matchTier: exact ? 1 : flopMatch ? 2 : 3 };
  }).sort((a, b) => a.matchTier - b.matchTier || String(a.question_id).localeCompare(String(b.question_id)));
  if (candidates.length === 0) return null;
  const best = candidates.filter(candidate => candidate.matchTier === candidates[0].matchTier);
  return new Set(best.map(canonicalFingerprint)).size === 1 ? best[0] : null;
}

function clampStackDepthBb(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const clamped = Math.min(9999.9, Math.max(0.5, num));
  return Math.round(clamped * 10) / 10;
}

function parseBigBlindFromStakes(stakes) {
  if (!stakes || typeof stakes !== 'string') return null;
  const slashMatch = /[$€£]?\s*([\d,]+(?:\.\d+)?)\s*\/\s*[$€£]?\s*([\d,]+(?:\.\d+)?)/.exec(stakes);
  if (slashMatch) {
    const bb = Number(slashMatch[2].replace(/,/g, ''));
    return Number.isFinite(bb) && bb > 0 ? bb : null;
  }
  return null;
}

function isHeroPlayerEntry(player, hand) {
  if (!player || typeof player !== 'object') return false;
  if (player.isHero === true) return true;
  const heroId = hand?.hero?.id ?? null;
  if (heroId !== null && heroId !== undefined && String(heroId) !== '') {
    const pId = player.id ?? player.userId ?? player.playerId ?? null;
    if (pId !== null && pId !== undefined && String(pId) === String(heroId)) return true;
  }
  const heroName = hand?.hero?.name ? String(hand.hero.name).trim() : '';
  if (heroName && player.name && String(player.name).trim() === heroName) return true;
  return false;
}

export function resolveStackDepthBb(hand, point) {
  const candidates = [
    point?.effectiveStackBb,
    point?.effective_stack_bb,
    point?.stackDepthBb,
    point?.stack_depth_bb,
    hand?.effectiveStackBb,
    hand?.effective_stack_bb,
    hand?.effective_stack_bb_at_deal,
    hand?.hero?.effectiveStackBb,
    hand?.hero?.effective_stack_bb,
    hand?.hero?.effective_stack_bb_at_deal,
    hand?.hero_effective_stack_bb,
  ];

  for (const c of candidates) {
    const clamped = clampStackDepthBb(c);
    if (clamped !== null) return clamped;
  }

  const playersList = Array.isArray(hand?.players) ? hand.players : [];
  const heroFromPlayers = playersList.find(p => isHeroPlayerEntry(p, hand)) || null;
  const rawHeroStack = Number(
    hand?.hero?.stack
    ?? hand?.hero?.startingStack
    ?? heroFromPlayers?.stack
    ?? heroFromPlayers?.startingStack
    ?? heroFromPlayers?.chips
  );
  const heroStack = Number.isFinite(rawHeroStack) && rawHeroStack > 0 ? rawHeroStack : null;
  if (heroStack === null) return null;

  const villainStacks = playersList
    .filter(p => p && p !== heroFromPlayers && !isHeroPlayerEntry(p, hand))
    .map(p => Number(p?.stack ?? p?.startingStack ?? p?.chips))
    .filter(s => Number.isFinite(s) && s > 0);
  const effectiveRawStack = villainStacks.length > 0
    ? Math.min(heroStack, Math.max(...villainStacks))
    : heroStack;

  // Normalized Club Arena hands already express player/hero stacks in BB units;
  // never divide them by bigBlind a second time.
  const isBbUnit = hand?.stackUnit === 'bb'
    || hand?.hero?.stackUnit === 'bb'
    || hand?.site === 'smarter-poker-club-arena';
  if (isBbUnit) {
    return clampStackDepthBb(effectiveRawStack);
  }

  const explicitBb = Number(hand?.bigBlind ?? hand?.big_blind);
  const bigBlind = Number.isFinite(explicitBb) && explicitBb > 0
    ? explicitBb
    : parseBigBlindFromStakes(hand?.stakes);

  if (Number.isFinite(bigBlind) && bigBlind > 0) {
    return clampStackDepthBb(effectiveRawStack / bigBlind);
  }

  return null;
}

function summary(row) {
  return {
    decisionKey: row.decision_key || null,
    gameId: row.game_id || null,
    street: row.street,
    heroPosition: row.hero_position || null,
    villainPosition: row.villain_position || null,
    spotType: row.spot_type || 'general',
    playerAction: row.player_action,
    solverAction: row.solver_action,
    classification: row.classification,
    selectedFrequency: row.selected_frequency,
    optimalFrequency: row.optimal_frequency,
    evLoss: row.ev_loss,
    evLossMeasured: row.ev_loss_measured,
    solverVerified: row.solver_verified,
    solverSource: row.solver_source,
    matchTier: row.match_tier,
    stackDepthBb: row.stack_depth_bb ?? null,
    evidenceScope: row.evidence_scope ?? null,
  };
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

const MAX_DECISIONS_PER_HAND = 12;
const EXISTING_AUDIT_BATCH_SIZE = 40;
const REPLACEMENT_HAND_BATCH_SIZE = 100;
const DEFAULT_UNPRICED_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Remove decisions that belonged to an older parse of a hand. Upsert alone is
 * not enough: if a corrected hand history has fewer actions, its old trailing
 * decision keys otherwise remain verified and continue feeding Leak Finder.
 */
async function replacePersistedDecisionEvidence(db, userId, handIds, rows) {
  // Replacement is one transaction in PostgreSQL. Per-hand advisory locks in
  // the RPC prevent concurrent manual and Club Arena audits from deleting one
  // another's freshly written decision evidence.
  let removed = 0;
  for (let index = 0; index < handIds.length; index += REPLACEMENT_HAND_BATCH_SIZE) {
    const batchIds = handIds.slice(index, index + REPLACEMENT_HAND_BATCH_SIZE);
    const batchSet = new Set(batchIds);
    const batchRows = rows.filter(row => batchSet.has(String(row.hand_external_id)));
    const { data, error } = await db.rpc('replace_hand_audit_decisions', {
      p_user_id: userId,
      p_hand_ids: batchIds,
      p_rows: batchRows,
    });
    if (error || data?.success === false) {
      return {
        persisted: false,
        reconciled: false,
        removed,
        error: error || new Error(data?.error || 'atomic_replacement_failed'),
      };
    }
    removed += Number(data?.removed) || 0;
  }
  return { persisted: true, reconciled: true, removed };
}

const VALID_EVIDENCE_SCOPES = Object.freeze(new Set(['club_arena', 'external_upload', 'self_reported_live', 'training_solver']));

export async function auditParsedHands(db, userId, hands, {
  maxDecisions = 250,
  persist = true,
  queryConcurrency = 6,
  reconcileExisting = true,
  evidenceScope = 'external_upload',
} = {}) {
  const effectiveScope = VALID_EVIDENCE_SCOPES.has(evidenceScope) ? evidenceScope : 'external_upload';
  const rows = [];
  const analyses = [];
  const work = [];
  const fullyEnumeratedHandIds = [];
  let matched = 0;
  let verified = 0;
  let solverLookupFailures = 0;
  let truncated = false;

  for (const [handIndex, hand] of (hands || []).entries()) {
    const points = getHeroDecisionPoints(hand).slice(0, MAX_DECISIONS_PER_HAND);
    // A partial hand is not an authoritative replacement. Stop before the
    // boundary hand so reconciliation never deletes its unenumerated actions.
    if (work.length + points.length > maxDecisions) { truncated = true; break; }
    const externalHandId = String(hand.id || `parsed-${handIndex}`).slice(0, 180);
    const analysis = { handId: externalHandId, decisions: [] };
    analyses.push(analysis);
    fullyEnumeratedHandIds.push(externalHandId);
    for (const [index, point] of points.entries()) {
      const signature = [
        hand.format, hand.gameType, hand.tableSize, hand.hero?.stack,
        point.street, point.position, point.nodeClass, handNotation(point.holeCards),
        canonicalCombo(point.holeCards), canonicalBoard(point.board), point.action, point.amount,
        point.potBeforeBB, point.sizingPct, point.villainPosition,
        JSON.stringify(point.priorActions || []),
      ].join('|');
      work.push({ hand, handIndex, index, point, signature, externalHandId });
    }
  }

  // Solver cache lookups are independent. Resolve each unique signature with a
  // small bounded pool so a 100-hand Club Arena sync does not become hundreds
  // of serial database round trips or an unbounded connection spike.
  const signatureItems = [...new Map(work.map(item => [item.signature, item])).values()];
  const candidateCache = new Map();
  const directMatchCache = new Map();
  await runWithConcurrency(signatureItems, queryConcurrency, async ({ signature, hand, point }) => {
    try {
      const cacheCandidate = await findQuestion(db, hand, point) || false;
      candidateCache.set(signature, cacheCandidate);
      if (!cacheCandidate || cacheCandidate.matchTier !== 1) {
        const direct = await findDirectCorpusSolverMatch(db, hand, point);
        if (direct?.solverVerified) directMatchCache.set(signature, direct);
      }
    } catch (error) {
      console.warn('[HandAudit] Solver question lookup failed:', error.message);
      candidateCache.set(signature, LOOKUP_FAILED_SOURCE);
    }
  });

  for (const { hand, handIndex, index, point, signature, externalHandId } of work) {
      const cached = candidateCache.get(signature);
      const lookupFailed = cached === LOOKUP_FAILED_SOURCE;
      const candidate = !lookupFailed && cached ? cached : null;
      const directMatch = !lookupFailed ? (directMatchCache.get(signature) || null) : null;
      if (lookupFailed) solverLookupFailures += 1;
      const answer = candidate ? mapPlayedAction(candidate.question_data, point) : null;
      const cacheGrade = answer
        ? gradeCanonicalPolicyDecision(candidate.canonical_policy, answer)
        : null;
      const cacheVerified = !!(cacheGrade?.solverVerified && candidate?.matchTier === 1);
      const useDirect = !cacheVerified && directMatch?.solverVerified === true;
      const grade = cacheVerified
        ? cacheGrade
        : (useDirect
          ? {
              solverVerified: true,
              optimalAction: directMatch.solverAction,
              selectedFrequency: directMatch.selectedFrequency,
              optimalFrequency: directMatch.optimalFrequency,
              classification: directMatch.classification,
              evLoss: directMatch.evLoss,
              evLossMeasured: !!directMatch.evLossMeasured,
              solverSource: directMatch.solverSource,
            }
          : cacheGrade);
      const solverVerified = !!(grade?.solverVerified && (candidate?.matchTier === 1 || useDirect));
      if (candidate || useDirect) matched++;
      if (solverVerified) verified++;
      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        hand_external_id: externalHandId,
        decision_key: `${point.street}:${index}`,
        question_id: cacheVerified ? (candidate?.question_id || null) : (useDirect ? directMatch.questionId : (candidate?.question_id || null)),
        game_id: cacheVerified
          ? (candidate?.game_id || (hand.format === 'tournament' ? 'mtt-hand-audit' : 'cash-hand-audit'))
          : (useDirect ? directMatch.gameId : (candidate?.game_id || (hand.format === 'tournament' ? 'mtt-hand-audit' : 'cash-hand-audit'))),
        street: point.street,
        hero_position: point.position || null,
        villain_position: cacheVerified
          ? (candidate?.question_data?.scenario?.villainPosition || null)
          : (useDirect ? directMatch.villainPosition : (candidate?.question_data?.scenario?.villainPosition || null)),
        spot_type: cacheVerified
          ? (candidate?.question_data?.scenario?.nodeType || candidate?.question_data?.scenario?.spotType || 'hand_history')
          : (useDirect ? directMatch.spotType : (candidate?.question_data?.scenario?.nodeType || candidate?.question_data?.scenario?.spotType || 'hand_history')),
        hero_hand: handNotation(point.holeCards),
        board_cards: point.board || [],
        player_action: point.action,
        // A looser candidate can help explain why a node stayed unpriced, but
        // it cannot grade the player's action. Persist solver conclusions only
        // when the hand, board and node matched exactly.
        solver_action: solverVerified ? grade.optimalAction : null,
        selected_frequency: solverVerified ? grade.selectedFrequency : null,
        optimal_frequency: solverVerified ? grade.optimalFrequency : null,
        classification: solverVerified ? grade.classification : 'unpriced',
        ev_loss: solverVerified ? grade.evLoss : null,
        ev_loss_measured: solverVerified && !!grade.evLossMeasured,
        solver_verified: solverVerified,
        // Every result, including an honest unpriced result, carries the
        // matcher version. Otherwise a freshly written v2 unpriced row looks
        // current to v3 and can skip the mandatory re-audit indefinitely.
        solver_source: lookupFailed
          ? LOOKUP_FAILED_SOURCE
          : (solverVerified
            ? `${grade.solverSource || candidate?.question_data?.source || 'solver'}|${MATCHER_VERSION}`
            : `${candidate?.question_data?.source ? `${candidate.question_data.source}|` : ''}${MATCHER_VERSION}:unpriced`),
        match_tier: cacheVerified ? candidate?.matchTier : (useDirect ? directMatch.matchTier : (candidate?.matchTier || null)),
        stack_depth_bb: resolveStackDepthBb(hand, point),
        evidence_scope: effectiveScope,
        audited_at: now,
        updated_at: now,
      };
      rows.push(row);
      analyses[handIndex].decisions.push(summary(row));
  }

  for (const analysis of analyses) {
    const decisions = analysis.decisions;
    analysis.summary = {
      totalDecisions: decisions.length,
      verifiedDecisions: decisions.filter(decision => decision.solverVerified).length,
      mistakes: decisions.filter(decision => decision.solverVerified && !['best', 'correct'].includes(decision.classification)).length,
      measuredEVLoss: +decisions.reduce((sum, decision) => sum + (decision.evLossMeasured ? Number(decision.evLoss) || 0 : 0), 0).toFixed(3),
    };
  }

  let persisted = true;
  let reconciliation = { reconciled: true, removed: 0 };
  if (persist && reconcileExisting && fullyEnumeratedHandIds.length > 0) {
    try {
      const replacement = await replacePersistedDecisionEvidence(
        db, userId, fullyEnumeratedHandIds, rows,
      );
      persisted = replacement.persisted;
      reconciliation = replacement;
      if (!reconciliation.reconciled) {
        console.warn('[HandAudit] Atomic decision replacement failed:', reconciliation.error?.message || reconciliation.error);
      }
    } catch (error) {
      persisted = false;
      reconciliation = { reconciled: false, removed: 0, error };
      console.warn('[HandAudit] Atomic decision replacement threw:', error?.message || error);
    }
  } else if (persist && rows.length > 0) {
    // Explicit opt-out remains available to isolated import tooling and unit
    // tests. Production callers use the atomic replacement path above.
    const { error } = await db.from('hand_audit_decisions').upsert(rows, { onConflict: 'user_id,hand_external_id,decision_key' });
    if (error) { persisted = false; console.warn('[HandAudit] Decision persistence failed:', error.message); }
  }
  return {
    persisted,
    evidenceReconciled: reconciliation.reconciled,
    obsoleteDecisionsRemoved: reconciliation.removed,
    handsParsed: analyses.length,
    decisionsAnalyzed: rows.length,
    solverMatches: matched,
    solverVerified: verified,
    unpriced: rows.length - verified,
    solverLookupFailures,
    complete: !truncated && solverLookupFailures === 0 && persisted && reconciliation.reconciled,
    truncated,
    maxDecisions,
    evidenceScope: effectiveScope,
    analyses,
  };
}

async function fetchClubHandsForKey(db, userId, key, {
  pageSize,
  snapshotAt,
  boundary = null,
}) {
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 100));
  let result;
  try {
    let query = db.from('hand_history')
        .select('id, hand_number, table_id, tournament_id, game_variant, small_blind, big_blind, pot_size, players, hole_cards, board, community_cards, community_cards2, community_cards3, bomb_pot, kill_pot, rit_boards, button_seat, actions, summary, source, created_at')
        // postgrest-js stringifies primitive arrays but not arrays of objects
        // in this dependency generation. Passing the object array directly
        // produces `22P02 invalid input syntax for type json` in production.
        .contains('players', JSON.stringify([{ [key]: userId }]))
        // The canonical Hetzner Club Arena recorder uses `manual`; the two
        // other values belong to older in-app writers and remain readable.
        .in('source', ['manual', 'wh-engine', 'engine-api'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .lte('created_at', snapshotAt);
    if (boundary?.createdAt && boundary?.id) {
      query = query.or(
        `created_at.lt.${boundary.createdAt},and(created_at.eq.${boundary.createdAt},id.lt.${boundary.id})`,
      );
    }
    // One sentinel row proves whether another bounded continuation is needed.
    result = await query.range(0, size);
  } catch (error) {
    return { data: [], error, complete: false };
  }
  if (result?.error) return { data: [], error: result.error, complete: false };
  const fetched = Array.isArray(result?.data) ? result.data : [];
  return {
    data: fetched,
    error: null,
    complete: fetched.length <= size,
  };
}

function parseTimestampMicros(value) {
  if (!value) return [Number.NEGATIVE_INFINITY, 0];
  const str = String(value);
  const ms = Date.parse(str);
  if (!Number.isFinite(ms)) return [Number.NEGATIVE_INFINITY, 0];
  const fracMatch = /\.(\d+)/.exec(str);
  const subMs = fracMatch ? Number(fracMatch[1].slice(3, 6).padEnd(3, '0')) : 0;
  return [ms, subMs];
}

function compareHandKeyDescending(a, b) {
  const [msA, subA] = parseTimestampMicros(a?.created_at);
  const [msB, subB] = parseTimestampMicros(b?.created_at);
  if (msB !== msA) return msB - msA;
  if (subB !== subA) return subB - subA;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

async function fetchExistingAuditRows(db, userId, externalIds) {
  const rows = [];
  for (let index = 0; index < externalIds.length; index += EXISTING_AUDIT_BATCH_SIZE) {
    const batch = externalIds.slice(index, index + EXISTING_AUDIT_BATCH_SIZE);
    const result = await db.from('hand_audit_decisions')
      .select('hand_external_id, solver_verified, solver_source, classification, audited_at, updated_at')
      .eq('user_id', userId)
      .in('hand_external_id', batch)
      .limit(batch.length * MAX_DECISIONS_PER_HAND);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
  }
  return { data: rows, error: null };
}

function auditRowTime(row) {
  const value = new Date(row?.updated_at || row?.audited_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function emptyIntervalReconciliation() {
  return {
    inScopeSourceHands: 0,
    handsConverted: 0,
    exclusionsByReason: {
      unsupported_variant: 0,
      unsupported_special_format: 0,
      missing_hero_identity: 0,
      missing_private_cards: 0,
      no_hero_decisions: 0,
    },
    excludedBeforeConversion: 0,
    unresolvedConversionErrors: 0,
    handsEligible: 0,
    handsWithNoHeroDecisions: 0,
    handsAudited: 0,
    handsAuditedEligible: 0,
    handsAlreadyCurrent: 0,
    handsQueuedForRetry: 0,
    eligibleDecisionsTotal: 0,
    decisionsAlreadyCurrent: 0,
    decisionsAnalyzed: 0,
    solverVerified: 0,
    unpriced: 0,
    solverLookupFailures: 0,
    obsoleteDecisionsRemoved: 0,
    pagesCompleted: 0,
  };
}

function addReconciliationCounts(prior, page) {
  const base = prior || emptyIntervalReconciliation();
  const next = {
    inScopeSourceHands: (base.inScopeSourceHands || 0) + (page.inScopeSourceHands || 0),
    handsConverted: (base.handsConverted || 0) + (page.handsConverted || 0),
    exclusionsByReason: {
      unsupported_variant: (base.exclusionsByReason?.unsupported_variant || 0) + (page.exclusionsByReason?.unsupported_variant || 0),
      unsupported_special_format: (base.exclusionsByReason?.unsupported_special_format || 0) + (page.exclusionsByReason?.unsupported_special_format || 0),
      missing_hero_identity: (base.exclusionsByReason?.missing_hero_identity || 0) + (page.exclusionsByReason?.missing_hero_identity || 0),
      missing_private_cards: (base.exclusionsByReason?.missing_private_cards || 0) + (page.exclusionsByReason?.missing_private_cards || 0),
      no_hero_decisions: (base.exclusionsByReason?.no_hero_decisions || 0) + (page.exclusionsByReason?.no_hero_decisions || 0),
    },
    excludedBeforeConversion: (base.excludedBeforeConversion || 0) + (page.excludedBeforeConversion || 0),
    unresolvedConversionErrors: (base.unresolvedConversionErrors || 0) + (page.unresolvedConversionErrors || 0),
    handsEligible: (base.handsEligible || 0) + (page.handsEligible || 0),
    handsWithNoHeroDecisions: (base.handsWithNoHeroDecisions || 0) + (page.handsWithNoHeroDecisions || 0),
    handsAudited: (base.handsAudited || 0) + (page.handsAudited || 0),
    handsAuditedEligible: (base.handsAuditedEligible || 0) + (page.handsAuditedEligible || 0),
    handsAlreadyCurrent: (base.handsAlreadyCurrent || 0) + (page.handsAlreadyCurrent || 0),
    handsQueuedForRetry: (base.handsQueuedForRetry || 0) + (page.handsQueuedForRetry || 0),
    eligibleDecisionsTotal: (base.eligibleDecisionsTotal || 0) + (page.eligibleDecisionsTotal || 0),
    decisionsAlreadyCurrent: (base.decisionsAlreadyCurrent || 0) + (page.decisionsAlreadyCurrent || 0),
    decisionsAnalyzed: (base.decisionsAnalyzed || 0) + (page.decisionsAnalyzed || 0),
    solverVerified: (base.solverVerified || 0) + (page.solverVerified || 0),
    unpriced: (base.unpriced || 0) + (page.unpriced || 0),
    solverLookupFailures: (base.solverLookupFailures || 0) + (page.solverLookupFailures || 0),
    obsoleteDecisionsRemoved: (base.obsoleteDecisionsRemoved || 0) + (page.obsoleteDecisionsRemoved || 0),
    pagesCompleted: (base.pagesCompleted || 0) + 1,
  };
  next.handsReconciled = next.inScopeSourceHands === (
    next.handsConverted + next.excludedBeforeConversion + next.unresolvedConversionErrors
  ) && next.handsConverted === (next.handsEligible + next.handsWithNoHeroDecisions);
  next.decisionsReconciled = next.eligibleDecisionsTotal === (
    next.decisionsAlreadyCurrent + next.decisionsAnalyzed
  ) && next.decisionsAnalyzed === (next.solverVerified + next.unpriced);
  return next;
}

/** Idempotently audit recent Club Arena hands before Leak Finder aggregates them. */
export async function syncClubArenaHandsForAudit(db, userId, {
  limit = 100,
  maxDecisions = 250,
  retryUnpricedAfterMs = DEFAULT_UNPRICED_RETRY_MS,
  nowMs = Date.now(),
  cursor = null,
  sinceBoundary = null,
  fullRescan = false,
} = {}) {
  const legacyCursor = cursor && cursor.version !== 2;
  const snapshotAt = cursor?.snapshotAt || new Date(nowMs).toISOString();
  const effectiveFullRescan = Boolean(fullRescan || (!legacyCursor && cursor?.fullRescan));
  const effectiveSinceBoundary = effectiveFullRescan
    ? null
    : (sinceBoundary || (!legacyCursor ? (cursor?.sinceBoundary || null) : null));
  const priorReconciliation = (!legacyCursor && cursor?.cumulativeReconciliation)
    ? cursor.cumulativeReconciliation
    : emptyIntervalReconciliation();
  const requestedCursor = {
    version: 2,
    snapshotAt,
    boundary: legacyCursor ? null : (cursor?.boundary || null),
    cumulativeHandsFound: legacyCursor ? 0 : Math.max(0, Number(cursor?.cumulativeHandsFound) || 0),
    latestHandWatermark: legacyCursor ? null : (cursor?.latestHandWatermark || null),
    sinceBoundary: effectiveSinceBoundary,
    fullRescan: effectiveFullRescan,
    cumulativeReconciliation: priorReconciliation,
  };
  const [modern, legacy] = await Promise.all([
    fetchClubHandsForKey(db, userId, 'userId', {
      pageSize: limit, snapshotAt, boundary: requestedCursor.boundary,
    }),
    fetchClubHandsForKey(db, userId, 'id', {
      pageSize: limit, snapshotAt, boundary: requestedCursor.boundary,
    }),
  ]);
  const errors = [modern.error, legacy.error].filter(Boolean);
  if (errors.length === 2) {
    console.warn('[HandAudit] Club Arena hand lookup failed:', errors[0]?.message || errors[0]);
    return {
      available: false,
      handsFound: 0,
      cumulativeHandsFound: requestedCursor.cumulativeHandsFound,
      handsConverted: 0,
      handsEligible: 0,
      handsAudited: 0,
      decisionsAnalyzed: 0,
      solverVerified: 0,
      continuation: requestedCursor,
      error: 'Club Arena hand history is temporarily unavailable.',
    };
  }
  const byId = new Map();
  for (const row of [...(modern.data || []), ...(legacy.data || [])]) byId.set(String(row.id), row);
  const globallyOrdered = [...byId.values()].sort(compareHandKeyDescending);
  const useWatermark = !effectiveFullRescan
    && effectiveSinceBoundary?.createdAt
    && effectiveSinceBoundary?.id
    && effectiveSinceBoundary?.matcherVersion === MATCHER_VERSION;
  let reachedWatermark = false;
  const filteredOrdered = useWatermark
    ? globallyOrdered.filter((row) => {
      // compareHandKeyDescending(a, b) > 0 means a is OLDER than b.
      const cmp = compareHandKeyDescending(row, { created_at: effectiveSinceBoundary.createdAt, id: effectiveSinceBoundary.id });
      if (cmp >= 0) {
        reachedWatermark = true;
        return false;
      }
      return true;
    })
    : globallyOrdered;
  const handRows = filteredOrdered.slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)));
  const hasBatchOverflow = filteredOrdered.length > handRows.length;
  const sourceIncomplete = hasBatchOverflow || (
    !reachedWatermark && (
      modern.complete !== true
      || legacy.complete !== true
    )
  );
  const latestHandWatermark = requestedCursor.latestHandWatermark
    || (!requestedCursor.boundary && handRows[0]
      ? { createdAt: handRows[0].created_at, id: String(handRows[0].id), matcherVersion: MATCHER_VERSION }
      : null);
  const last = handRows[handRows.length - 1];
  const advancedCursor = {
    version: 2,
    snapshotAt,
    boundary: sourceIncomplete && last
      ? { createdAt: last.created_at, id: String(last.id) }
      : null,
    cumulativeHandsFound: requestedCursor.cumulativeHandsFound + handRows.length,
    latestHandWatermark,
    sinceBoundary: effectiveSinceBoundary,
    fullRescan: effectiveFullRescan,
    cumulativeReconciliation: priorReconciliation,
  };
  const privateFacts = await fetchPrivateHeroCards(db, userId, handRows);
  let privateCardsRecovered = 0;
  const rowsWithPrivateCards = handRows.map(row => {
    const privateCards = privateFacts.byHandId.get(String(row.id));
    const dealtStackBB = privateFacts.effectiveStackByHandId?.get(String(row.id)) ?? null;
    if (!privateCards && dealtStackBB === null) return row;
    if (privateCards) {
      const hadPublicCards = cards(row?.hole_cards?.[userId]).length >= 2;
      if (!hadPublicCards) privateCardsRecovered += 1;
    }
    return {
      ...row,
      ...(privateCards ? { hero_private_cards: privateCards } : {}),
      ...(dealtStackBB !== null ? { hero_effective_stack_bb: dealtStackBB } : {}),
    };
  });

  const exclusionsByReason = {
    unsupported_variant: 0,
    unsupported_special_format: 0,
    missing_hero_identity: 0,
    missing_private_cards: 0,
    no_hero_decisions: 0,
  };
  let unresolvedConversionErrors = 0;
  const normalized = [];
  const rejectionReasons = [];
  for (const row of rowsWithPrivateCards) {
    const reason = clubArenaHandRejectionReason(row, userId);
    rejectionReasons.push(reason);
    if (reason !== null) {
      if (Object.prototype.hasOwnProperty.call(exclusionsByReason, reason)) {
        exclusionsByReason[reason] += 1;
      }
      continue;
    }
    let converted = null;
    try {
      converted = normalizeClubArenaHand(row, userId);
    } catch (_) {
      converted = null;
    }
    if (converted) {
      normalized.push(converted);
    } else {
      unresolvedConversionErrors += 1;
    }
  }

  const handsMissingPrivateCards = exclusionsByReason.missing_private_cards;
  const handsRejectedBeforeAudit = exclusionsByReason.unsupported_variant
    + exclusionsByReason.unsupported_special_format
    + exclusionsByReason.missing_hero_identity;
  const excludedBeforeConversion = handsMissingPrivateCards + handsRejectedBeforeAudit;

  if (!privateFacts.available && handsMissingPrivateCards > 0) {
    return {
      available: false,
      privateFactsAvailable: false,
      privateCardsRecovered,
      handsMissingPrivateCards,
      handsRejectedBeforeAudit,
      exclusionsByReason,
      unresolvedConversionErrors,
      handsFound: handRows.length,
      handsConverted: normalized.length,
      cumulativeHandsFound: requestedCursor.cumulativeHandsFound,
      handsEligible: normalized.length,
      handsAudited: 0,
      decisionsAnalyzed: 0,
      solverVerified: 0,
      persisted: false,
      continuation: requestedCursor,
      error: 'Private Club Arena hand facts are temporarily unavailable.',
    };
  }
  if (normalized.length === 0) {
    const emptyPageRecon = {
      inScopeSourceHands: handRows.length,
      handsConverted: 0,
      exclusionsByReason,
      excludedBeforeConversion,
      unresolvedConversionErrors,
      handsEligible: 0,
      handsWithNoHeroDecisions: 0,
      handsAudited: 0,
      handsAuditedEligible: 0,
      handsAlreadyCurrent: 0,
      handsQueuedForRetry: 0,
      eligibleDecisionsTotal: 0,
      decisionsAlreadyCurrent: 0,
      decisionsAnalyzed: 0,
      solverVerified: 0,
      unpriced: 0,
      solverLookupFailures: 0,
      obsoleteDecisionsRemoved: 0,
      pageHandIds: handRows.map(r => String(r.id)),
      handsReconciled: handRows.length === (excludedBeforeConversion + unresolvedConversionErrors),
      decisionsReconciled: true,
    };
    const nextCumulative = errors.length === 0
      ? addReconciliationCounts(priorReconciliation, emptyPageRecon)
      : priorReconciliation;
    advancedCursor.cumulativeReconciliation = nextCumulative;
    return {
      available: true,
      partial: errors.length > 0,
      handsFound: handRows.length,
      handsConverted: 0,
      cumulativeHandsFound: errors.length === 0
        ? advancedCursor.cumulativeHandsFound
        : requestedCursor.cumulativeHandsFound,
      handsEligible: 0,
      exclusionsByReason,
      unresolvedConversionErrors,
      eligibleDecisionsTotal: 0,
      decisionsAlreadyCurrent: 0,
      privateFactsAvailable: privateFacts.available,
      privateCardsRecovered,
      handsMissingPrivateCards,
      handsRejectedBeforeAudit,
      handsSkippedNoHeroDecisions: 0,
      handsAudited: 0,
      handsAlreadyCurrent: 0,
      handsQueuedForRetry: 0,
      decisionsAnalyzed: 0,
      solverVerified: 0,
      unpriced: 0,
      persisted: true,
      evidenceReconciled: true,
      obsoleteDecisionsRemoved: 0,
      complete: errors.length === 0 && !sourceIncomplete,
      truncated: sourceIncomplete,
      incrementalStop: reachedWatermark,
      latestHandWatermark,
      reconciliation: {
        page: emptyPageRecon,
        cumulative: nextCumulative,
        invariantsHold: emptyPageRecon.handsReconciled && emptyPageRecon.decisionsReconciled,
      },
      continuation: errors.length === 0 && sourceIncomplete ? advancedCursor : (errors.length > 0 ? requestedCursor : null),
    };
  }

  const externalIds = normalized.map(hand => hand.id);
  const { data: existing, error: existingError } = await fetchExistingAuditRows(db, userId, externalIds);
  if (existingError && existingError.code !== '42P01') {
    console.warn('[HandAudit] Existing Club Arena audit lookup failed:', existingError.message);
  }

  const rowsByHand = new Map();
  for (const row of existing || []) {
    const key = String(row.hand_external_id);
    if (!rowsByHand.has(key)) rowsByHand.set(key, []);
    rowsByHand.get(key).push(row);
  }

  let handsQueuedForRetry = 0;
  let handsAlreadyCurrent = 0;
  let handsSkippedNoHeroDecisions = 0;
  let handsWithNoHeroDecisions = 0;
  let decisionsAlreadyCurrent = 0;
  const decisionCounts = new Map(normalized.map(hand => [
    String(hand.id),
    Math.min(MAX_DECISIONS_PER_HAND, getHeroDecisionPoints(hand).length),
  ]));
  const handsEligible = [...decisionCounts.values()].filter(count => count > 0).length;
  const eligibleDecisionsTotal = [...decisionCounts.values()].reduce((sum, count) => sum + count, 0);
  const retryCutoff = nowMs - Math.max(0, Number(retryUnpricedAfterMs) || 0);
  const pending = normalized.filter(hand => {
    const rows = rowsByHand.get(String(hand.id)) || [];
    const expectedDecisions = decisionCounts.get(String(hand.id)) || 0;

    // A recorder row with no recoverable hero action cannot produce solver
    // evidence. Re-auditing it on every scan wastes the entire batch and makes
    // the receipt claim useful work occurred. The one exception is a corrected
    // hand that still has old decision rows: audit it once so the atomic
    // replacement RPC removes that obsolete evidence.
    if (expectedDecisions === 0) {
      handsWithNoHeroDecisions += 1;
      if (rows.length > 0) {
        handsQueuedForRetry += 1;
        return true;
      }
      handsSkippedNoHeroDecisions += 1;
      return false;
    }

    if (existingError || rows.length === 0) return true;
    const partialAudit = rows.length < expectedDecisions;
    const hasUnpricedDecision = rows.some(row => row.solver_verified !== true);
    const hasUntrustedClassification = rows.some(row =>
      row.solver_verified !== true && row.classification !== 'unpriced');
    const hasMatcherDrift = rows.some(row =>
      !String(row.solver_source || '').includes(MATCHER_VERSION));
    const hasLookupFailure = rows.some(row => row.solver_source === LOOKUP_FAILED_SOURCE);
    const newestAuditAt = rows.reduce((latest, row) => Math.max(latest, auditRowTime(row)), 0);
    const staleUnpricedAudit = hasUnpricedDecision && (effectiveFullRescan || newestAuditAt <= retryCutoff);
    if (partialAudit || hasUntrustedClassification || hasMatcherDrift || hasLookupFailure || staleUnpricedAudit) {
      handsQueuedForRetry += 1;
      return true;
    }
    handsAlreadyCurrent += 1;
    decisionsAlreadyCurrent += expectedDecisions;
    return false;
  });
  exclusionsByReason.no_hero_decisions = handsWithNoHeroDecisions;

  const result = await auditParsedHands(db, userId, pending, { maxDecisions, persist: true, evidenceScope: 'club_arena' });
  const handsAuditedEligible = (result.analyses || []).filter(a => (decisionCounts.get(String(a.handId)) || 0) > 0).length;
  const pageSucceeded = errors.length === 0 && result.complete;
  const pageReconciliation = {
    inScopeSourceHands: handRows.length,
    handsConverted: normalized.length,
    exclusionsByReason,
    excludedBeforeConversion,
    unresolvedConversionErrors,
    handsEligible,
    handsWithNoHeroDecisions,
    handsAudited: result.handsParsed,
    handsAuditedEligible,
    handsAlreadyCurrent,
    handsQueuedForRetry,
    eligibleDecisionsTotal,
    decisionsAlreadyCurrent,
    decisionsAnalyzed: result.decisionsAnalyzed,
    solverVerified: result.solverVerified,
    unpriced: result.unpriced,
    solverLookupFailures: result.solverLookupFailures,
    obsoleteDecisionsRemoved: result.obsoleteDecisionsRemoved,
    pageHandIds: handRows.map(r => String(r.id)),
    handsReconciled: handRows.length === (normalized.length + excludedBeforeConversion + unresolvedConversionErrors)
      && normalized.length === (handsEligible + handsWithNoHeroDecisions)
      && (!pageSucceeded || handsEligible === (handsAuditedEligible + handsAlreadyCurrent)),
    decisionsReconciled: (!pageSucceeded || eligibleDecisionsTotal === (decisionsAlreadyCurrent + result.decisionsAnalyzed))
      && result.decisionsAnalyzed === (result.solverVerified + result.unpriced),
  };
  const nextCumulative = pageSucceeded
    ? addReconciliationCounts(priorReconciliation, pageReconciliation)
    : priorReconciliation;
  advancedCursor.cumulativeReconciliation = nextCumulative;

  return {
    available: true,
    partial: errors.length > 0,
    handsFound: handRows.length,
    handsConverted: normalized.length,
    cumulativeHandsFound: pageSucceeded
      ? advancedCursor.cumulativeHandsFound
      : requestedCursor.cumulativeHandsFound,
    handsEligible,
    exclusionsByReason,
    unresolvedConversionErrors,
    eligibleDecisionsTotal,
    decisionsAlreadyCurrent,
    privateFactsAvailable: privateFacts.available,
    privateCardsRecovered,
    handsMissingPrivateCards,
    handsRejectedBeforeAudit,
    handsSkippedNoHeroDecisions,
    handsAudited: result.handsParsed,
    handsAuditedEligible,
    handsAlreadyCurrent,
    handsQueuedForRetry,
    decisionsAnalyzed: result.decisionsAnalyzed,
    solverVerified: result.solverVerified,
    unpriced: result.unpriced,
    solverLookupFailures: result.solverLookupFailures,
    complete: errors.length === 0 && result.complete && !sourceIncomplete,
    persisted: result.persisted,
    evidenceReconciled: result.evidenceReconciled,
    obsoleteDecisionsRemoved: result.obsoleteDecisionsRemoved,
    truncated: result.truncated || sourceIncomplete,
    incrementalStop: reachedWatermark,
    latestHandWatermark,
    reconciliation: {
      page: pageReconciliation,
      cumulative: nextCumulative,
      invariantsHold: pageReconciliation.handsReconciled && pageReconciliation.decisionsReconciled,
    },
    // Advance the snapshot cursor only after every hand in this page was
    // reconciled. A truncated/failed audit retries the same bounded page.
    continuation: pageSucceeded && sourceIncomplete
      ? advancedCursor
      : (!pageSucceeded ? requestedCursor : null),
  };
}
