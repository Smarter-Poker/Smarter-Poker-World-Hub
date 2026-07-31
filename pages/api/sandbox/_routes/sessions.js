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

/**
 * Map a sandbox_sessions row onto the sessionLog entry shape the sandbox page
 * builds locally (see runAnalysis). Coach-verdict fields are null because the
 * table does not persist them — consumers already treat null as "unscored".
 */
function toSessionLogEntry(row) {
    return {
        id: row.id,
        hand: row.hero_hand || '',
        position: row.hero_position || '',
        street: streetOf(row),
        board: boardString(row),
        equity: null,
        optimalAction: null,
        isCorrect: null,
        evDelta: null,
        userPick: null,
        createdAt: row.created_at || null,
        // Explicit provenance — the client must not infer "archived" from the
        // presence of a timestamp, because locally-created rows carry one too.
        source: 'server',
    };
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

          // Oldest-first so the journal reads chronologically, matching the
          // order the client appends live entries in.
          const sessions = (data || []).map(toSessionLogEntry).reverse();
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
