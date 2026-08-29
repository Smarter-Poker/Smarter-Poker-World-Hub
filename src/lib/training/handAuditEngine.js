import { getHeroDecisionPoints } from '../../engines/HandHistoryParser.js';
import { gradeSolverDecision } from './solverDecisionEvidence.js';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
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
  if (raw.startsWith('fold')) return 'fold';
  if (raw.startsWith('check')) return 'check';
  if (raw.startsWith('call')) return 'call';
  if (raw.startsWith('bet')) return 'bet';
  if (raw.startsWith('raise')) return 'raise';
  if (/allin|shove|jam/.test(raw)) return 'allin';
  return raw || null;
}

function positionedPlayers(rawPlayers, buttonSeat) {
  const players = (rawPlayers || []).map((player, index) => ({
    id: playerId(player),
    name: player.displayName || player.username || player.name || `Seat ${index + 1}`,
    seat: Number(player.seatIndex ?? player.seat ?? index),
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
  const rawPlayers = Array.isArray(summary.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(row?.players) ? row.players : []);
  const heroRaw = rawPlayers.find(player => String(playerId(player)) === String(userId));
  if (!heroRaw) return null;

  const players = positionedPlayers(
    rawPlayers,
    summary.buttonSeat ?? summary.button_seat ?? row?.button_seat,
  );
  const heroPlayer = players.find(player => String(player.id) === String(userId));
  // The Hetzner Club Arena recorder stores showdown holdings in the
  // top-level hole_cards map, while older/API-engine rows put them on the
  // player or summary. Pick the first candidate that actually contains two
  // valid cards; masked `cards: [null, null]` must not hide a valid map entry.
  const heroCards = [
    heroRaw.holeCards,
    heroRaw.heroCards,
    heroRaw.cards,
    row?.hole_cards?.[userId],
    summary.heroCards,
  ].map(cards).find(candidate => candidate.length >= 2) || [];
  if (heroCards.length < 2) return null;

  const summaryStreets = summary.streets || {};
  const topLevelActions = Array.isArray(row?.actions) ? row.actions : [];
  const streetActions = (street) => {
    const source = Array.isArray(summaryStreets?.[street]?.actions)
      ? summaryStreets[street].actions
      : topLevelActions.filter(action => String(action?.street || action?.stage || 'preflop').toLowerCase() === street);
    return source.map(action => ({
      player: action.player || action.playerName || action.username || '',
      playerId: action.playerId ?? action.userId ?? action.player_id,
      action: actionName(action),
      amount: Number(action.amount) || 0,
      isHero: action.isHero === true || action.is_hero === true
        || String(action.playerId ?? action.userId ?? action.player_id) === String(userId),
    })).filter(action => action.action);
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

  return {
    id: `club-arena:${row.id || summary.id || summary.handId || row.hand_number}`,
    site: 'smarter-poker-club-arena',
    format: summary.format || 'cash',
    gameType: String(row.game_variant || summary.variant || 'nlhe').toLowerCase(),
    tableSize: players.length,
    buttonSeat: summary.buttonSeat ?? summary.button_seat ?? row?.button_seat ?? null,
    players,
    hero: {
      id: userId,
      name: heroPlayer?.name || heroRaw.displayName || heroRaw.username || 'Hero',
      position: heroPlayer?.position || heroRaw.position || '',
      holeCards: heroCards,
    },
    streets: {
      preflop: { actions: streetActions('preflop') },
      flop: finalFlop.length >= 3 ? { board: finalFlop, actions: streetActions('flop') } : null,
      turn: turn ? { card: turn, actions: streetActions('turn') } : null,
      river: river ? { card: river, actions: streetActions('river') } : null,
    },
  };
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
  return cards(value).map(card => card.toLowerCase()).sort().join('');
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

function mapPlayedAction(question, playedAction) {
  const played = actionName({ action: playedAction });
  const matches = (question?.options || []).filter(option => optionAction(option) === played);
  return matches.length === 1 ? String(matches[0]?.id ?? matches[0]) : null;
}

function questionNode(question) {
  const scenario = question?.scenario || {};
  const explicit = String(scenario.nodeType || scenario.spotType || '').toLowerCase();
  if (explicit) return explicit;
  if (String(question?.type || '').toUpperCase() === 'CHART') {
    return /shove|push|all-in/i.test(String(scenario.action || '')) ? 'preflop_facing_raise' : 'preflop_open';
  }
  return '';
}

function nodeCompatible(question, point) {
  const aliases = {
    preflop_open: ['preflop_open', 'rfi'],
    preflop_4bet: ['preflop_4bet', '4bet'],
    preflop_squeeze: ['preflop_squeeze', 'squeeze'],
    preflop_facing_raise: ['preflop_facing_raise', 'preflop_3bet', '3bet', 'preflop_bb_defense', 'bb_defense', 'preflop_cold_call', 'cold_call'],
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

async function findQuestion(db, hand, point) {
  const notation = handNotation(point.holeCards);
  if (!point.position || !notation) return null;
  const prefix = hand.format === 'tournament' ? 'mtt-%' : 'cash-%';
  const { data, error } = await db
    .from('training_question_cache')
    .select('question_id, game_id, question_data')
    .like('game_id', prefix)
    .eq('question_data->scenario->>street', point.street)
    .eq('question_data->scenario->>heroPosition', point.position)
    .limit(250);
  if (error) throw error;
  const requestedBoard = canonicalBoard(point.board);
  const candidates = (data || []).filter(row => {
    const question = row.question_data || {};
    const heroHand = question?.scenario?.heroHand || question?.heroHand;
    return String(heroHand || '').toUpperCase() === notation.toUpperCase() && nodeCompatible(question, point);
  }).map(row => {
    const candidateBoard = questionBoard(row.question_data);
    const exact = canonicalBoard(candidateBoard) === requestedBoard;
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

export async function auditParsedHands(db, userId, hands, {
  maxDecisions = 250,
  persist = true,
  queryConcurrency = 6,
} = {}) {
  const rows = [];
  const analyses = [];
  const work = [];
  let matched = 0;
  let verified = 0;
  let truncated = false;

  for (const [handIndex, hand] of (hands || []).entries()) {
    const analysis = { handId: hand.id, decisions: [] };
    analyses.push(analysis);
    for (const [index, point] of getHeroDecisionPoints(hand).slice(0, 12).entries()) {
      if (work.length >= maxDecisions) { truncated = true; break; }
      const signature = [hand.format, point.street, point.position, point.nodeClass, handNotation(point.holeCards), canonicalBoard(point.board)].join('|');
      work.push({ hand, handIndex, index, point, signature });
    }
    if (truncated) break;
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
      candidateCache.set(signature, false);
    }
  });

  for (const { hand, handIndex, index, point, signature } of work) {
      const candidate = candidateCache.get(signature) || null;
      const answer = candidate ? mapPlayedAction(candidate.question_data, point.action) : null;
      const grade = answer ? gradeSolverDecision(candidate.question_data, answer) : null;
      const solverVerified = !!(grade?.solverVerified && candidate?.matchTier === 1);
      if (candidate) matched++;
      if (solverVerified) verified++;
      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        hand_external_id: String(hand.id || `parsed-${analyses.length}`).slice(0, 180),
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
        solver_action: grade?.optimalAction || null,
        selected_frequency: grade?.selectedFrequency ?? null,
        optimal_frequency: grade?.optimalFrequency ?? null,
        classification: grade?.classification || 'unpriced',
        ev_loss: grade?.evLoss ?? null,
        ev_loss_measured: !!grade?.evLossMeasured,
        solver_verified: solverVerified,
        solver_source: candidate?.question_data?.source || null,
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
  if (persist && rows.length > 0) {
    const { error } = await db.from('hand_audit_decisions').upsert(rows, { onConflict: 'user_id,hand_external_id,decision_key' });
    if (error) { persisted = false; console.warn('[HandAudit] Decision persistence failed:', error.message); }
  }
  return {
    persisted,
    handsParsed: analyses.length,
    decisionsAnalyzed: rows.length,
    solverMatches: matched,
    solverVerified: verified,
    unpriced: rows.length - verified,
    truncated,
    maxDecisions,
    analyses,
  };
}

async function fetchClubHandsForKey(db, userId, key, limit) {
  return db.from('hand_history')
    .select('id, hand_number, game_variant, players, hole_cards, board, community_cards, button_seat, actions, summary, source, created_at')
    // postgrest-js stringifies primitive arrays but not arrays of objects in
    // this dependency generation. Passing the object array directly produces
    // `22P02 invalid input syntax for type json` in production.
    .contains('players', JSON.stringify([{ [key]: userId }]))
    // The canonical Hetzner Club Arena recorder uses `manual`; the two other
    // values belong to the older in-app writers and remain readable.
    .in('source', ['manual', 'wh-engine', 'engine-api'])
    .order('created_at', { ascending: false })
    .limit(limit);
}

const MAX_DECISIONS_PER_HAND = 12;
const EXISTING_AUDIT_BATCH_SIZE = 40;
const DEFAULT_UNPRICED_RETRY_MS = 24 * 60 * 60 * 1000;

async function fetchExistingAuditRows(db, userId, externalIds) {
  const rows = [];
  for (let index = 0; index < externalIds.length; index += EXISTING_AUDIT_BATCH_SIZE) {
    const batch = externalIds.slice(index, index + EXISTING_AUDIT_BATCH_SIZE);
    const result = await db.from('hand_audit_decisions')
      .select('hand_external_id, solver_verified, audited_at, updated_at')
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
} = {}) {
  const [modern, legacy] = await Promise.all([
    fetchClubHandsForKey(db, userId, 'userId', limit),
    fetchClubHandsForKey(db, userId, 'id', limit),
  ]);
  const errors = [modern.error, legacy.error].filter(Boolean);
  if (errors.length === 2) {
    return { available: false, handsFound: 0, handsEligible: 0, handsAudited: 0, decisionsAnalyzed: 0, solverVerified: 0, error: errors[0].message };
  }
  const byId = new Map();
  for (const row of [...(modern.data || []), ...(legacy.data || [])]) byId.set(String(row.id), row);
  const handRows = [...byId.values()].slice(0, limit);
  const normalized = handRows.map(row => normalizeClubArenaHand(row, userId)).filter(Boolean);
  if (normalized.length === 0) {
    return {
      available: true,
      handsFound: handRows.length,
      handsEligible: 0,
      handsAudited: 0,
      handsAlreadyCurrent: 0,
      handsQueuedForRetry: 0,
      decisionsAnalyzed: 0,
      solverVerified: 0,
      unpriced: 0,
      persisted: true,
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
  const retryCutoff = nowMs - Math.max(0, Number(retryUnpricedAfterMs) || 0);
  const pending = normalized.filter(hand => {
    if (existingError) return true;
    const rows = rowsByHand.get(String(hand.id)) || [];
    if (rows.length === 0) return true;

    const expectedDecisions = Math.min(
      MAX_DECISIONS_PER_HAND,
      getHeroDecisionPoints(hand).length,
    );
    const partialAudit = rows.length < expectedDecisions;
    const hasUnpricedDecision = rows.some(row => row.solver_verified !== true);
    const newestAuditAt = rows.reduce((latest, row) => Math.max(latest, auditRowTime(row)), 0);
    const staleUnpricedAudit = hasUnpricedDecision && newestAuditAt <= retryCutoff;
    if (partialAudit || staleUnpricedAudit) {
      handsQueuedForRetry += 1;
      return true;
    }
    handsAlreadyCurrent += 1;
    return false;
  });
  const result = await auditParsedHands(db, userId, pending, { maxDecisions, persist: true });
  return {
    available: true,
    handsFound: handRows.length,
    handsEligible: normalized.length,
    handsAudited: result.handsParsed,
    handsAlreadyCurrent,
    handsQueuedForRetry,
    decisionsAnalyzed: result.decisionsAnalyzed,
    solverVerified: result.solverVerified,
    unpriced: result.unpriced,
    persisted: result.persisted,
    truncated: result.truncated,
  };
}
