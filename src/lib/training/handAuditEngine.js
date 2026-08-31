import { getHeroDecisionPoints } from '../../engines/HandHistoryParser.js';
import { gradeSolverDecision } from './solverDecisionEvidence.js';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const MATCHER_VERSION = 'hand-audit-v2';
const LOOKUP_FAILED_SOURCE = `${MATCHER_VERSION}:lookup-failed`;
const FORCED_ACTIONS = new Set([
  'ante', 'smallblind', 'bigblind', 'blind', 'straddle', 'post', 'posts',
  'return', 'returnedbet', 'refund', 'collect', 'collected', 'payout', 'win', 'wins',
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

function actionName(action) {
  const raw = String(action?.action || action?.type || '').toLowerCase().replace(/[-_\s]/g, '');
  if (FORCED_ACTIONS.has(raw) || /^(small|big)?blind|ante|straddle|returned?bet|refund|collect|payout/.test(raw)) return null;
  if (/allin|shove|jam/.test(raw)) return 'allin';
  if (raw.startsWith('fold')) return 'fold';
  if (raw.startsWith('check')) return 'check';
  if (raw.startsWith('call')) return 'call';
  if (raw.startsWith('bet')) return 'bet';
  if (raw.startsWith('raise')) return 'raise';
  return raw || null;
}

function positionedPlayers(rawPlayers, buttonSeat, bigBlind) {
  const players = (rawPlayers || []).map((player, index) => ({
    id: playerId(player),
    name: player.displayName || player.username || player.name || `Seat ${index + 1}`,
    seat: Number(player.seatIndex ?? player.seat ?? index),
    stack: Number.isFinite(Number(player.stackBB)) && Number(player.stackBB) > 0
      ? Number(player.stackBB)
      : (Number.isFinite(Number(player.startStack ?? player.stack ?? player.chips))
          && Number(player.startStack ?? player.stack ?? player.chips) > 0
          && Number.isFinite(Number(bigBlind)) && Number(bigBlind) > 0
        ? Number(player.startStack ?? player.stack ?? player.chips) / Number(bigBlind)
        : null),
    position: '',
    holeCards: cards(player.holeCards || player.heroCards || player.cards),
  }));
  const labels = POSITION_MAP[players.length] || POSITION_MAP[9];
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const buttonIndex = ordered.findIndex(player => Number(player.seat) === Number(buttonSeat));
  if (buttonIndex >= 0) {
    const clockwise = [...ordered.slice(buttonIndex), ...ordered.slice(0, buttonIndex)];
    clockwise.forEach((player, index) => { player.position = labels[index] || ''; });
  }
  return players;
}

/** Convert a persisted Club Arena hand into the parser's canonical hand shape. */
export function normalizeClubArenaHand(row, userId) {
  const summary = parseJson(row?.summary) || {};
  const gameType = String(row?.game_variant || summary?.variant || '').trim().toLowerCase();
  // Missing/unsupported variants must never be silently priced with NLHE
  // ranges. A false solver match is worse than leaving a hand unpriced.
  if (!['nlh', 'nlhe', 'no-limit-holdem', 'holdem'].includes(gameType)) return null;
  const rawPlayers = Array.isArray(summary.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(row?.players) ? row.players : []);
  const heroRaw = rawPlayers.find(player => String(playerId(player)) === String(userId));
  if (!heroRaw) return null;

  const players = positionedPlayers(
    rawPlayers,
    summary.buttonSeat ?? summary.button_seat ?? row?.button_seat,
    summary.bigBlind ?? summary.big_blind ?? row?.big_blind,
  );
  const heroPlayer = players.find(player => String(player.id) === String(userId));
  // The Hetzner Club Arena recorder stores showdown holdings in the
  // top-level hole_cards map, while older/API-engine rows put them on the
  // player or summary. Pick the first candidate that actually contains two
  // valid cards; masked `cards: [null, null]` must not hide a valid map entry.
  const heroCards = [
    row?.hero_private_cards,
    heroRaw.holeCards,
    heroRaw.heroCards,
    heroRaw.cards,
    row?.hole_cards?.[userId],
  ].map(cards).find(candidate => candidate.length >= 2) || [];
  if (heroCards.length < 2) return null;

  const summaryStreets = summary.streets || {};
  const topLevelActions = Array.isArray(row?.actions) ? row.actions : [];
  const streetActions = (street) => {
    const summaryActions = summaryStreets?.[street]?.actions;
    const source = Array.isArray(summaryActions) && summaryActions.length > 0
      ? summaryActions
      : topLevelActions.filter(action => String(action?.street || action?.stage || 'preflop').toLowerCase() === street);
    return source.map(action => {
      const actionPlayer = action.player || action.playerName || action.username || '';
      const actionPlayerId = action.playerId ?? action.userId ?? action.player_id;
      const hasPlayerId = actionPlayerId !== null && actionPlayerId !== undefined && String(actionPlayerId) !== '';
      const heroNames = [heroRaw.displayName, heroRaw.username, heroRaw.name]
        .filter(Boolean).map(name => String(name).trim().toLowerCase());
      // An explicit player id is authoritative even when a legacy boolean
      // incorrectly says isHero. Without an id, require an identity-bound
      // name match; never trust an unscoped isHero flag by itself.
      const isHero = hasPlayerId
        ? String(actionPlayerId) === String(userId)
        : heroNames.includes(String(actionPlayer).trim().toLowerCase());
      return {
        player: actionPlayer,
        playerId: actionPlayerId,
        action: actionName(action),
        amount: Number(action.amount) || 0,
        isHero,
      };
    }).filter(action => action.action);
  };

  const flop = cards(summaryStreets?.flop?.cards || summaryStreets?.flop?.board);
  const turnCards = cards(summaryStreets?.turn?.cards || [summaryStreets?.turn?.card]);
  const riverCards = cards(summaryStreets?.river?.cards || [summaryStreets?.river?.card]);
  const fallbackBoard = cards(
    summary.communityCards || summary.board || row?.community_cards || row?.board,
  );
  const finalFlop = flop.length >= 3 ? flop.slice(0, 3) : fallbackBoard.slice(0, 3);
  const turn = turnCards[0] || fallbackBoard[3] || '';
  const river = riverCards[0] || fallbackBoard[4] || '';

  const rawFormat = String(summary.format || row?.format || '').trim().toLowerCase();
  const format = ['tournament', 'mtt'].includes(rawFormat)
    ? 'tournament'
    : (['cash', 'ring'].includes(rawFormat) ? 'cash' : null);

  return {
    id: `club-arena:${row.id || summary.id || summary.handId || row.hand_number}`,
    site: 'smarter-poker-club-arena',
    format,
    gameType: ['nlh', 'nlhe'].includes(gameType) ? 'nlhe' : 'no-limit-holdem',
    tableSize: players.length,
    buttonSeat: summary.buttonSeat ?? summary.button_seat ?? row?.button_seat ?? null,
    players,
    hero: {
      id: userId,
      name: heroPlayer?.name || heroRaw.displayName || heroRaw.username || 'Hero',
      position: heroPlayer?.position || heroRaw.position || '',
      holeCards: heroCards,
      stack: heroPlayer?.stack || null,
    },
    streets: {
      preflop: { actions: streetActions('preflop') },
      flop: finalFlop.length >= 3 ? { board: finalFlop, actions: streetActions('flop') } : null,
      turn: turn ? { card: turn, actions: streetActions('turn') } : null,
      river: river ? { card: river, actions: streetActions('river') } : null,
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
  let available = true;
  for (let index = 0; index < handIds.length; index += PRIVATE_FACT_BATCH_SIZE) {
    const batch = handIds.slice(index, index + PRIVATE_FACT_BATCH_SIZE);
    let result;
    try {
      result = await db.from('ca_hand_facts')
        .select('hand_id, hole_cards')
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
    }
  }
  return { available, byHandId };
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
  if (/^r\d*$/.test(id) || /raise|3-bet|4-bet/.test(label)) return 'raise';
  if (/^b\d*$/.test(id) || /^bet/.test(label)) return 'bet';
  return null;
}

function mapPlayedAction(question, point) {
  const played = actionName({ action: point?.action });
  const matches = (question?.options || []).filter(option => optionAction(option) === played);
  // A recorded amount without the pot/raise-to context cannot prove that a
  // b16/b50/r150 solver option was actually chosen. Fail closed on sized
  // actions until the hand parser supplies a normalized percentage.
  if (played === 'bet' || played === 'raise') {
    const sized = matches.some(option => /\d/.test(String(option?.id ?? option)) || /\d+\s*%/.test(String(option?.text ?? option?.label ?? '')));
    if (sized) return null;
  }
  return matches.length === 1 ? String(matches[0]?.id ?? matches[0]) : null;
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

  return true;
}

async function findQuestion(db, hand, point) {
  const notation = handNotation(point.holeCards);
  if (!point.position || !notation || !isSupportedHoldemHand(hand)
    || !['cash', 'tournament'].includes(hand.format)) return null;
  const prefix = hand.format === 'tournament' ? 'mtt-%' : 'cash-%';
  const { data, error } = await db
    .from('training_question_cache')
    .select('question_id, game_id, question_data')
    .like('game_id', prefix)
    .eq('question_data->scenario->>street', point.street)
    .eq('question_data->scenario->>heroPosition', point.position)
    // Filter on the indexed solver signature BEFORE the candidate cap. With
    // 27k+ cached questions, taking 250 position/street rows first could omit
    // the requested holding even though its exact solver row existed.
    .eq('question_data->scenario->>heroHand', notation)
    .limit(250);
  if (error) throw error;
  const requestedBoard = canonicalBoard(point.board);
  const candidates = (data || []).filter(row => {
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
  return new Set(best.map(candidate => fingerprint(candidate.question_data))).size === 1 ? best[0] : null;
}

function summary(row) {
  return {
    street: row.street,
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

export async function auditParsedHands(db, userId, hands, {
  maxDecisions = 250,
  persist = true,
  queryConcurrency = 6,
  reconcileExisting = true,
} = {}) {
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
      ].join('|');
      work.push({ hand, handIndex, index, point, signature, externalHandId });
    }
  }

  // Solver cache lookups are independent. Resolve each unique signature with a
  // small bounded pool so a 100-hand Club Arena sync does not become hundreds
  // of serial database round trips or an unbounded connection spike.
  const signatureItems = [...new Map(work.map(item => [item.signature, item])).values()];
  const candidateCache = new Map();
  await runWithConcurrency(signatureItems, queryConcurrency, async ({ signature, hand, point }) => {
    try { candidateCache.set(signature, await findQuestion(db, hand, point) || false); }
    catch (error) {
      console.warn('[HandAudit] Solver question lookup failed:', error.message);
      candidateCache.set(signature, LOOKUP_FAILED_SOURCE);
    }
  });

  for (const { hand, handIndex, index, point, signature, externalHandId } of work) {
      const cached = candidateCache.get(signature);
      const lookupFailed = cached === LOOKUP_FAILED_SOURCE;
      const candidate = !lookupFailed && cached ? cached : null;
      if (lookupFailed) solverLookupFailures += 1;
      const answer = candidate ? mapPlayedAction(candidate.question_data, point) : null;
      const grade = answer ? gradeSolverDecision(candidate.question_data, answer) : null;
      const solverVerified = !!(grade?.solverVerified && candidate?.matchTier === 1);
      if (candidate) matched++;
      if (solverVerified) verified++;
      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        hand_external_id: externalHandId,
        decision_key: `${point.street}:${index}`,
        question_id: candidate?.question_id || null,
        game_id: candidate?.game_id || (hand.format === 'tournament' ? 'mtt-hand-audit' : 'cash-hand-audit'),
        street: point.street,
        hero_position: point.position || null,
        villain_position: candidate?.question_data?.scenario?.villainPosition || null,
        spot_type: candidate?.question_data?.scenario?.nodeType || candidate?.question_data?.scenario?.spotType || 'hand_history',
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
        solver_source: lookupFailed
          ? LOOKUP_FAILED_SOURCE
          : (solverVerified ? `${grade.solverSource || candidate?.question_data?.source || 'solver'}|${MATCHER_VERSION}` : candidate?.question_data?.source || null),
        match_tier: candidate?.matchTier || null,
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
    analyses,
  };
}

async function fetchClubHandsForKey(db, userId, key, {
  pageSize,
  snapshotAt,
  cursor = null,
  done = false,
}) {
  if (done) return { data: [], error: null, complete: true, nextCursor: null };
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 100));
  let result;
  try {
    let query = db.from('hand_history')
        .select('id, hand_number, game_variant, players, hole_cards, board, community_cards, button_seat, actions, summary, source, created_at')
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
    if (cursor?.createdAt && cursor?.id) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    // One sentinel row proves whether another bounded continuation is needed.
    result = await query.range(0, size);
  } catch (error) {
    return { data: [], error, complete: false, nextCursor: cursor };
  }
  if (result?.error) return { data: [], error: result.error, complete: false, nextCursor: cursor };
  const fetched = Array.isArray(result?.data) ? result.data : [];
  const data = fetched.slice(0, size);
  const hasMore = fetched.length > size;
  const last = data[data.length - 1];
  return {
    data,
    error: null,
    complete: !hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: String(last.id) } : null,
  };
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

/** Idempotently audit recent Club Arena hands before Leak Finder aggregates them. */
export async function syncClubArenaHandsForAudit(db, userId, {
  limit = 100,
  maxDecisions = 250,
  retryUnpricedAfterMs = DEFAULT_UNPRICED_RETRY_MS,
  nowMs = Date.now(),
  cursor = null,
} = {}) {
  const snapshotAt = cursor?.snapshotAt || new Date(nowMs).toISOString();
  const requestedCursor = {
    snapshotAt,
    modern: cursor?.modern || null,
    legacy: cursor?.legacy || null,
    modernDone: cursor?.modernDone === true,
    legacyDone: cursor?.legacyDone === true,
    cumulativeHandsFound: Math.max(0, Number(cursor?.cumulativeHandsFound) || 0),
  };
  const [modern, legacy] = await Promise.all([
    fetchClubHandsForKey(db, userId, 'userId', {
      pageSize: limit, snapshotAt, cursor: requestedCursor.modern, done: requestedCursor.modernDone,
    }),
    fetchClubHandsForKey(db, userId, 'id', {
      pageSize: limit, snapshotAt, cursor: requestedCursor.legacy, done: requestedCursor.legacyDone,
    }),
  ]);
  const errors = [modern.error, legacy.error].filter(Boolean);
  if (errors.length === 2) {
    console.warn('[HandAudit] Club Arena hand lookup failed:', errors[0]?.message || errors[0]);
    return {
      available: false,
      handsFound: 0,
      cumulativeHandsFound: requestedCursor.cumulativeHandsFound,
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
  const sourceIncomplete = modern.complete !== true || legacy.complete !== true;
  const handRows = [...byId.values()];
  const advancedCursor = {
    snapshotAt,
    modern: modern.nextCursor,
    legacy: legacy.nextCursor,
    modernDone: modern.complete === true,
    legacyDone: legacy.complete === true,
    cumulativeHandsFound: requestedCursor.cumulativeHandsFound + handRows.length,
  };
  const privateFacts = await fetchPrivateHeroCards(db, userId, handRows);
  let privateCardsRecovered = 0;
  const rowsWithPrivateCards = handRows.map(row => {
    const privateCards = privateFacts.byHandId.get(String(row.id));
    if (!privateCards) return row;
    const hadPublicCards = cards(row?.hole_cards?.[userId]).length >= 2;
    if (!hadPublicCards) privateCardsRecovered += 1;
    return { ...row, hero_private_cards: privateCards };
  });
  const normalized = rowsWithPrivateCards.map(row => normalizeClubArenaHand(row, userId)).filter(Boolean);
  const handsMissingPrivateCards = Math.max(0, handRows.length - normalized.length);
  if (!privateFacts.available && handsMissingPrivateCards > 0) {
    return {
      available: false,
      privateFactsAvailable: false,
      privateCardsRecovered,
      handsMissingPrivateCards,
      handsFound: handRows.length,
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
    return {
      available: true,
      partial: errors.length > 0,
      handsFound: handRows.length,
      cumulativeHandsFound: errors.length === 0
        ? advancedCursor.cumulativeHandsFound
        : requestedCursor.cumulativeHandsFound,
      handsEligible: 0,
      privateFactsAvailable: privateFacts.available,
      privateCardsRecovered,
      handsMissingPrivateCards,
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
  const decisionCounts = new Map(normalized.map(hand => [
    String(hand.id),
    Math.min(MAX_DECISIONS_PER_HAND, getHeroDecisionPoints(hand).length),
  ]));
  const handsEligible = [...decisionCounts.values()].filter(count => count > 0).length;
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
    const hasLegacyVerification = rows.some(row =>
      row.solver_verified === true && !String(row.solver_source || '').includes(`|${MATCHER_VERSION}`));
    const hasLookupFailure = rows.some(row => row.solver_source === LOOKUP_FAILED_SOURCE);
    const newestAuditAt = rows.reduce((latest, row) => Math.max(latest, auditRowTime(row)), 0);
    const staleUnpricedAudit = hasUnpricedDecision && newestAuditAt <= retryCutoff;
    if (partialAudit || hasUntrustedClassification || hasLegacyVerification || hasLookupFailure || staleUnpricedAudit) {
      handsQueuedForRetry += 1;
      return true;
    }
    handsAlreadyCurrent += 1;
    return false;
  });
  const result = await auditParsedHands(db, userId, pending, { maxDecisions, persist: true });
  const pageSucceeded = errors.length === 0 && result.complete;
  return {
    available: true,
    partial: errors.length > 0,
    handsFound: handRows.length,
    cumulativeHandsFound: pageSucceeded
      ? advancedCursor.cumulativeHandsFound
      : requestedCursor.cumulativeHandsFound,
    handsEligible,
    privateFactsAvailable: privateFacts.available,
    privateCardsRecovered,
    handsMissingPrivateCards,
    handsSkippedNoHeroDecisions,
    handsAudited: result.handsParsed,
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
    // Advance the snapshot cursor only after every hand in this page was
    // reconciled. A truncated/failed audit retries the same bounded page.
    continuation: pageSucceeded && sourceIncomplete
      ? advancedCursor
      : (!pageSucceeded ? requestedCursor : null),
  };
}
