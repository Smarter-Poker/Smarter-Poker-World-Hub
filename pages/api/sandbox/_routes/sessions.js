/**
 * GET /api/sandbox/sessions
 * Returns the authenticated user's recent sandbox_sessions rows (written by
 * /api/assistant/sandbox/analyze) for the sandbox session log.
 *
 * Contract (pages/hub/personal-assistant/sandbox.js → fetchSessions):
 *   200 { success: true, sessions: [ { id, hand, position, street, board,
 *         equity, optimalAction, isCorrect, evDelta, userPick, createdAt } ] }
 *   The client does setSessionLog(json.sessions) and mirrors it into IndexedDB,
 *   and every consumer (SessionLogModal, SessionReport, HandReplay) reads that
 *   camelCase shape — so the snake_case DB rows MUST be mapped here. Returning
 *   raw rows silently blanks the whole session journal.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const SELECT_COLS = [
    'id',
    'hero_hand',
    'hero_position',
    'hero_stack_bb',
    'game_type',
    'num_opponents',
    'board_flop',
    'board_turn',
    'board_river',
    'pot_size_bb',
    'created_at',
].join(', ');

/**
 * Split a stored board column into individual cards.
 * analyze.js writes board_flop as a bare concatenation ('AhKd2c'), so a naive
 * join would produce one 6-char "card" that the client's
 * `board.split(' ')` cannot re-parse.
 */
function toCards(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    const str = String(value).trim();
    if (!str) return [];
    if (/[\s,]/.test(str)) return str.split(/[\s,]+/).filter(Boolean);
    return str.match(/.{1,2}/g) || [];
}

/** Board columns are stored per-street; the client wants one space-joined string. */
function boardString(row) {
    return [
        ...toCards(row.board_flop),
        ...toCards(row.board_turn),
        ...toCards(row.board_river),
    ].join(' ').trim();
}

function streetOf(row) {
    if (toCards(row.board_river).length > 0) return 'river';
    if (toCards(row.board_turn).length > 0) return 'turn';
    return toCards(row.board_flop).length > 0 ? 'flop' : 'preflop';
}

// ── Coach-verdict correlation ──────────────────────────────────────────────
// sandbox_sessions (written by /api/assistant/sandbox/analyze) and
// sandbox_coach_results (written by /api/sandbox/coach-result) are two separate
// inserts from the SAME user interaction, and the client does not currently
// send a sessionId with the coach result — so session_id is null on virtually
// every row. Correlation therefore falls back to the spot identity
// (hand + position + street + board) plus time proximity.
//
// The coach POST always follows the analyze POST, seconds apart. The window is
// deliberately tight: matching a replay of the same spot from another day would
// present someone else's verdict as this hand's, which is worse than showing
// "not coached".
const COACH_SELECT_COLS = [
    'id',
    'session_id',
    'hero_hand',
    'hero_position',
    'street',
    'board',
    'user_pick',
    'gto_action',
    'is_correct',
    'ev_delta',
    'created_at',
].join(', ');

const COACH_LOOKBACK_MS = 30 * 60 * 1000; // coach result arrives after analyze
const COACH_LOOKAHEAD_MS = 5 * 60 * 1000; // tolerate a little clock skew
const COACH_FETCH_LIMIT = 300;

/** Case/whitespace-insensitive key so 'Ah Kd' and 'AHKD' compare equal. */
function normKey(value) {
    return String(value ?? '').replace(/[\s,]/g, '').toLowerCase();
}

/** Identity of a spot, shared by both tables. */
function spotKey(hand, position, street, board) {
    return [normKey(hand), normKey(position), normKey(street), normKey(board)].join('|');
}

function timeOf(value) {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : null;
}

/**
 * Index coach rows by spot identity. Each bucket stays an array so that a spot
 * played repeatedly keeps every verdict available for one-to-one consumption.
 */
function indexCoachRows(rows) {
    const bySpot = new Map();
    const bySession = new Map();
    for (const row of rows || []) {
        if (!row) continue;
        if (row.session_id && !bySession.has(row.session_id)) bySession.set(row.session_id, row);
        const key = spotKey(row.hero_hand, row.hero_position, row.street, row.board);
        if (!bySpot.has(key)) bySpot.set(key, []);
        bySpot.get(key).push(row);
    }
    return { bySpot, bySession, used: new Set() };
}

/**
 * Best coach row for one session row, or null. Consumes the match so two
 * identical archived spots cannot both claim the same verdict.
 */
function takeCoachMatch(index, sessionRow, entryStreet, entryBoard) {
    if (!index) return null;
    const used = index.used;

    // Exact link wins whenever the client did send a sessionId.
    const direct = index.bySession.get(sessionRow.id);
    if (direct && !used.has(direct.id)) {
        used.add(direct.id);
        return direct;
    }

    const bucket = index.bySpot.get(
        spotKey(sessionRow.hero_hand, sessionRow.hero_position, entryStreet, entryBoard)
    );
    if (!bucket || bucket.length === 0) return null;

    const sessionTime = timeOf(sessionRow.created_at);
    let best = null;
    let bestDiff = Infinity;
    for (const candidate of bucket) {
        if (used.has(candidate.id)) continue;
        if (sessionTime === null) { best = candidate; break; }
        const candidateTime = timeOf(candidate.created_at);
        if (candidateTime === null) continue;
        const diff = candidateTime - sessionTime;
        if (diff > COACH_LOOKBACK_MS || diff < -COACH_LOOKAHEAD_MS) continue;
        const magnitude = Math.abs(diff);
        if (magnitude < bestDiff) { bestDiff = magnitude; best = candidate; }
    }

    if (best) used.add(best.id);
    return best || null;
}

/**
 * Map a sandbox_sessions row onto the sessionLog entry shape the sandbox page
 * builds locally (see runAnalysis). Coach-verdict fields come from the matching
 * sandbox_coach_results row when one exists; they stay null otherwise, which
 * every consumer already renders as "not coached".
 */
function toSessionLogEntry(row, coachIndex) {
    const street = streetOf(row);
    const board = boardString(row);
    const coach = takeCoachMatch(coachIndex, row, street, board);

    return {
        id: row.id,
        hand: row.hero_hand || '',
        position: row.hero_position || '',
        street,
        board,
        equity: null,
        optimalAction: coach?.gto_action || null,
        isCorrect: typeof coach?.is_correct === 'boolean' ? coach.is_correct : null,
        evDelta: typeof coach?.ev_delta === 'number' && isFinite(coach.ev_delta) ? coach.ev_delta : null,
        userPick: coach?.user_pick || null,
        createdAt: row.created_at || null,
        // Explicit provenance — the client must not infer "archived" from the
        // presence of a timestamp, because locally-created rows carry one too.
        source: 'server',
    };
}

/**
 * Coach verdicts for the window covered by `rows`. Enrichment is strictly
 * best-effort: a missing table, a failed query or a thrown client all return
 * null, and the caller then emits exactly the null-verdict rows it used to.
 */
async function fetchCoachIndex(supabase, userId, rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    try {
        let query = supabase
            .from('sandbox_coach_results')
            .select(COACH_SELECT_COLS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(COACH_FETCH_LIMIT);

        // `rows` is newest-first, so the last entry is the oldest session in the
        // page — no verdict older than that (minus skew) can belong to it.
        const oldest = timeOf(rows[rows.length - 1]?.created_at);
        if (oldest !== null) {
            query = query.gte('created_at', new Date(oldest - COACH_LOOKAHEAD_MS).toISOString());
        }

        const { data, error } = await query;
        if (error) {
            if (error.code !== '42P01') console.warn('[sessions] Coach enrich error:', error.message);
            return null;
        }
        return indexCoachRows(data);
    } catch (e) {
        console.warn('[sessions] Coach enrich threw:', e?.message || e);
        return null;
    }
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // JWT auth — identity comes from the Bearer token only, never req.query.
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          if (!userId) {
              return res.status(401).json({ success: false, error: 'Authentication required' });
          }

          const { data, error } = await supabase
              .from('sandbox_sessions')
              .select(SELECT_COLS)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(50);

          if (error) {
              // Table may not exist on every environment — the client falls back
              // to its IndexedDB copy, so an empty list is the graceful answer.
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, sessions: [] });
              }
              console.warn('[sessions] Query error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          // Pull the coach verdicts for the same window. Null index → the
          // pre-enrichment behaviour (every verdict field null).
          const coachIndex = await fetchCoachIndex(supabase, userId, data || []);

          // Oldest-first so the journal reads chronologically, matching the
          // order the client appends live entries in.
          const sessions = (data || []).map(row => toSessionLogEntry(row, coachIndex)).reverse();
          return res.status(200).json({ success: true, sessions });
      } catch (err) {
          console.warn('[sessions] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
