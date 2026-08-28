import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { parseHandHistory, getHeroDecisionPoints } from '../../../src/engines/HandHistoryParser';
import { gradeSolverDecision } from '../../../src/lib/training/solverDecisionEvidence';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

const RANKS = 'AKQJT98765432';

function handNotation(cards) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const [a, b] = cards.map(String);
  if (!/^[2-9TJQKA][shdc]$/i.test(a) || !/^[2-9TJQKA][shdc]$/i.test(b)) return null;
  const r1 = a[0].toUpperCase();
  const r2 = b[0].toUpperCase();
  if (r1 === r2) return `${r1}${r2}`;
  const highFirst = RANKS.indexOf(r1) < RANKS.indexOf(r2);
  const high = highFirst ? r1 : r2;
  const low = highFirst ? r2 : r1;
  return `${high}${low}${a[1].toLowerCase() === b[1].toLowerCase() ? 's' : 'o'}`;
}

function canonicalBoard(cards) {
  return (cards || []).map(c => String(c).toLowerCase()).sort().join('');
}

function questionBoard(question) {
  const scenario = question?.scenario || {};
  if (Array.isArray(question?.boardCards)) return question.boardCards;
  if (Array.isArray(scenario.boardCards)) return scenario.boardCards;
  const raw = String(scenario.board || '').replace(/\s+/g, '');
  return raw.match(/[2-9TJQKA][shdc]/gi) || [];
}

function questionHand(question) {
  return question?.scenario?.heroHand || question?.heroHand || null;
}

function optionAction(option) {
  const id = String(option?.id ?? option ?? '').toLowerCase();
  const text = String(option?.text ?? option?.label ?? option ?? '').toLowerCase();
  if (id === 'f' || id === 'fold' || /^fold/.test(text)) return 'fold';
  if (id === 'x' || id === 'check' || /^check/.test(text)) return 'check';
  if (id === 'c' || id === 'call' || /^call/.test(text)) return 'call';
  if (/allin|push|shove|jam/.test(`${id} ${text}`)) return 'allin';
  if (/^r\d*$/.test(id) || /raise|3-bet|4-bet/.test(text)) return 'raise';
  if (/^b\d*$/.test(id) || /^bet/.test(text)) return 'bet';
  return null;
}

function mapPlayedAction(question, action) {
  const played = String(action || '').replace(/s$/, '').replace('all-in', 'allin').toLowerCase();
  const matches = (question?.options || []).filter(option => optionAction(option) === played);
  // A generic hand-history action cannot identify one of several solver bet or
  // raise sizes without a reliable pot-before-action. Refuse to guess.
  if (matches.length !== 1) return null;
  return String(matches[0]?.id ?? matches[0]);
}

function rankCandidate(question, board) {
  const requested = canonicalBoard(board);
  const candidateBoard = questionBoard(question);
  const candidate = canonicalBoard(candidateBoard);
  if (requested === candidate) return 1;
  if (
    board.length > 3 &&
    candidateBoard.length >= 3 &&
    canonicalBoard(candidateBoard.slice(0, 3)) === canonicalBoard(board.slice(0, 3))
  ) return 2;
  return 3;
}

function questionNode(question) {
  const scenario = question?.scenario || {};
  const explicit = String(scenario.nodeType || scenario.spotType || '').toLowerCase();
  if (explicit) return explicit;
  if (String(question?.type || '').toUpperCase() === 'CHART') {
    return /shove|push|all-in/i.test(String(scenario.action || ''))
      ? 'preflop_facing_raise'
      : 'preflop_open';
  }
  return '';
}

function nodeCompatible(question, point) {
  const node = questionNode(question);
  if (!node) return false;
  const aliases = {
    preflop_open: ['preflop_open', 'rfi'],
    preflop_4bet: ['preflop_4bet', '4bet'],
    preflop_squeeze: ['preflop_squeeze', 'squeeze'],
    preflop_facing_raise: [
      'preflop_facing_raise', 'preflop_3bet', '3bet',
      'preflop_bb_defense', 'bb_defense', 'preflop_cold_call', 'cold_call',
    ],
    hero_faces_bet: ['hero_faces_bet'],
    hero_bets_or_checks: ['hero_bets_or_checks'],
  };
  return (aliases[point.nodeClass] || []).includes(node);
}

function decisionFingerprint(question) {
  const frequencies = Object.entries(question?.gtoFrequencies || {})
    .map(([id, value]) => [String(id), Number(value) || 0])
    .sort(([a], [b]) => a.localeCompare(b));
  const options = (question?.options || [])
    .map(option => [String(option?.id ?? option), optionAction(option)])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ frequencies, options, correct: String(question?.correctAnswer || '') });
}

async function findQuestion(db, hand, point) {
  if (!point.position) return null;
  const notation = handNotation(point.holeCards);
  if (!notation) return null;
  const prefix = hand.format === 'tournament' ? 'mtt-%' : 'cash-%';
  const { data, error } = await db
    .from('training_question_cache')
    .select('question_id, game_id, question_data')
    .like('game_id', prefix)
    .eq('question_data->scenario->>street', point.street)
    .eq('question_data->scenario->>heroPosition', point.position)
    .limit(250);
  if (error) throw error;

  const candidates = (data || [])
    .filter(row => String(questionHand(row.question_data) || '').toUpperCase() === notation.toUpperCase())
    .filter(row => nodeCompatible(row.question_data, point))
    .map(row => ({ ...row, matchTier: rankCandidate(row.question_data, point.board) }))
    .sort((a, b) => a.matchTier - b.matchTier || String(a.question_id).localeCompare(String(b.question_id)));
  if (candidates.length === 0) return null;
  const bestTier = candidates[0].matchTier;
  const best = candidates.filter(candidate => candidate.matchTier === bestTier);
  // Same cards/position can exist in several preflop nodes and stack depths.
  // If their strategies disagree, choosing one by row order would silently
  // grade against the wrong range. Refuse that ambiguity.
  if (new Set(best.map(row => decisionFingerprint(row.question_data))).size !== 1) return null;
  return best[0];
}

function decisionSummary(decision) {
  return {
    street: decision.street,
    playerAction: decision.playerAction,
    solverAction: decision.solverAction,
    classification: decision.classification,
    selectedFrequency: decision.selected_frequency,
    optimalFrequency: decision.optimal_frequency,
    evLoss: decision.ev_loss,
    evLossMeasured: decision.ev_loss_measured,
    solverVerified: decision.solver_verified,
    solverSource: decision.solver_source,
    matchTier: decision.match_tier,
  };
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const text = typeof req.body?.handHistoryText === 'string' ? req.body.handHistoryText : '';
    if (!text.trim()) return res.status(400).json({ success: false, error: 'handHistoryText required' });
    if (text.length > 800_000) return res.status(413).json({ success: false, error: 'Hand history file is too large' });

    const hands = parseHandHistory(text).slice(0, 100);
    if (hands.length === 0) {
      return res.status(422).json({ success: false, error: 'No supported hand histories were parsed' });
    }

    const persistedRows = [];
    const analyses = [];
    let matched = 0;
    let verified = 0;
    let unpriced = 0;
    let truncated = false;
    const lookupCache = new Map();
    const maxDecisions = 250;

    for (const hand of hands) {
      const decisions = [];
      const points = getHeroDecisionPoints(hand).slice(0, 12);
      for (let index = 0; index < points.length; index++) {
        if (persistedRows.length >= maxDecisions) {
          truncated = true;
          break;
        }
        const point = points[index];
        // Node class is part of the cache identity. The same hand/position can
        // occur as an open, squeeze, 4-bet, or facing-raise decision and those
        // nodes can have completely different ranges.
        const signature = [
          hand.format,
          point.street,
          point.position,
          point.nodeClass,
          handNotation(point.holeCards),
          canonicalBoard(point.board),
        ].join('|');
        let candidate = lookupCache.get(signature) || null;
        if (!lookupCache.has(signature)) {
          try { candidate = await findQuestion(getSupabase(), hand, point); }
          catch (error) { console.warn('[HandAudit] Solver question lookup failed:', error.message); }
          lookupCache.set(signature, candidate || false);
        } else if (candidate === false) {
          candidate = null;
        }

        const selectedAnswer = candidate ? mapPlayedAction(candidate.question_data, point.action) : null;
        const grade = candidate && selectedAnswer
          ? gradeSolverDecision(candidate.question_data, selectedAnswer)
          : null;
        const exactEnough = candidate?.matchTier === 1;
        const solverVerified = !!(grade?.solverVerified && exactEnough);
        if (candidate) matched++;
        if (solverVerified) verified++;
        if (!solverVerified) unpriced++;

        const row = {
          user_id: user.id,
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
          audited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        persistedRows.push(row);
        decisions.push(decisionSummary({ ...row, playerAction: row.player_action, solverAction: row.solver_action }));
      }
      analyses.push({
        handId: hand.id,
        decisions,
        summary: {
          totalDecisions: decisions.length,
          verifiedDecisions: decisions.filter(d => d.solverVerified).length,
          mistakes: decisions.filter(d => d.solverVerified && !['best', 'correct'].includes(d.classification)).length,
          measuredEVLoss: +decisions.reduce((sum, d) => sum + (d.evLossMeasured ? Number(d.evLoss) || 0 : 0), 0).toFixed(3),
        },
      });
      if (truncated) break;
    }

    let persisted = true;
    if (persistedRows.length > 0) {
      const { error } = await getSupabase()
        .from('hand_audit_decisions')
        .upsert(persistedRows, { onConflict: 'user_id,hand_external_id,decision_key' });
      if (error) {
        persisted = false;
        console.warn('[HandAudit] Decision persistence failed:', error.message);
      }
    }

    return res.status(200).json({
      success: true,
      persisted,
      handsParsed: hands.length,
      decisionsAnalyzed: persistedRows.length,
      solverMatches: matched,
      solverVerified: verified,
      unpriced,
      truncated,
      maxDecisions,
      analyses,
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask response */ }
    console.warn('[HandAudit] Unhandled error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
