/**
 * POST /api/sandbox/coach-result
 * Persists a Socratic Coach Mode result to sandbox_coach_results.
 * Called from sandbox.js after coach verdict is received.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { ephemeralResult, persistedResult, persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';
import { gradeAction } from '../../../../src/lib/sandbox/actionGrading';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const STREETS = ['preflop', 'flop', 'turn', 'river'];

/** Trim an optional free-text field to N chars; null when absent. */
function clampOptional(value, max) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).slice(0, max);
}

// A sandbox_sessions row id echoed back by the client. It is only ever used as
// a join key, so the shape check stays deliberately permissive about the id
// format (uuid / bigint / nanoid all pass) and strict about everything else —
// objects, arrays and overlong junk are dropped before they reach Postgres,
// where a type error would otherwise fail the whole insert and cost the user
// their verdict.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function cleanSessionId(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return SESSION_ID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Confirm the claimed session actually belongs to this user before linking.
 * The id arrives from the client, so a stale, foreign or wrong-typed value must
 * degrade to an unlinked row (sessions.js then falls back to its spot+time
 * heuristic) rather than writing a bogus correlation or 500ing the insert.
 * Any error — missing table, malformed id, transient failure — returns null.
 */
async function loadOwnedSessionResult(supabase, sessionId, userId) {
    if (!sessionId || !userId) return null;
    try {
        const { data, error } = await supabase
            .from('sandbox_sessions')
            .select('id')
            .eq('id', sessionId)
            .eq('user_id', userId)
            .maybeSingle();
        if (error) {
            if (error.code !== '42P01') console.warn('[coach-result] Session verify failed:', error.code || error.message);
            return null;
        }
        if (!data?.id) return null;
        const { data: result, error: resultError } = await supabase
            .from('sandbox_results')
            .select('primary_action, full_analysis, truth_seal')
            .eq('session_id', data.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (resultError || !result?.primary_action) return null;
        return { id: data.id, result };
    } catch (e) {
        console.warn('[coach-result] Session verify threw:', e?.message || e);
        return null;
    }
}

export default async function handler(req, res) {
  try {
      // Unbounded writes feed the leaderboard/session-stats aggregations —
      // limit before doing any work.
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const { user: authUser } = await getServerUserWithFallback(req, supabase);
          if (authUser) userId = authUser.id;

          // Guest submissions are allowed but not stored
          if (!userId) {
              return res.status(200).json(ephemeralResult('guest', null, { stored: false }));
          }

          // Identity comes from the verified Bearer token above and nowhere
          // else. A userId / user_id in the body is deliberately NOT read here
          // — accepting one would let any caller write rows against another
          // account (the IDOR this surface has already been bitten by).
          const {
              hand, position, street, board,
              userPick, sessionId,
          } = req.body || {};

          if (!hand || !userPick) {
              return res.status(400).json({ success: false, error: 'Missing required fields: hand, userPick' });
          }
          if (typeof hand !== 'string' || typeof userPick !== 'string') {
              return res.status(400).json({ success: false, error: 'hand and userPick must be strings' });
          }
          for (const [key, val] of Object.entries({ position, street, board })) {
              if (val !== undefined && val !== null && typeof val !== 'string') {
                  return res.status(400).json({ success: false, error: `${key} must be a string` });
              }
          }

          // Street is stored lowercase — every reader (macro-analysis,
          // session-stats) buckets on the lowercase form.
          const rawStreet = String(street || 'preflop').toLowerCase().trim();
          // Drill rows carry values like 'flop_cbet' — keep the street prefix.
          const normalizedStreet = STREETS.find(s => rawStreet.startsWith(s)) || 'preflop';

          // Exact verdict↔hand correlation for /api/sandbox/sessions. Unlinked
          // (null) is a fully supported state — never a hard failure.
          const ownedSession = await loadOwnedSessionResult(
              supabase, cleanSessionId(sessionId), userId
          );
          if (!ownedSession) {
              return res.status(422).json(ephemeralResult('unverified_session', null, {
                  stored: false,
                  error: 'Coach score was not saved because its analysis session could not be verified.',
              }));
          }
          const authoritativeAction = String(ownedSession.result.primary_action).slice(0, 40);
          const authoritativeCorrect = gradeAction(userPick, authoritativeAction);

          const { data, error } = await supabase
              .from('sandbox_coach_results')
              .insert({
                  user_id: userId,
                  session_id: ownedSession.id,
                  hero_hand: hand.slice(0, 40),
                  hero_position: clampOptional(position, 40),
                  street: normalizedStreet,
                  board: clampOptional(board, 60),
                  user_pick: userPick.slice(0, 40),
                  gto_action: authoritativeAction,
                  is_correct: authoritativeCorrect,
                  // Per-action EV is not currently stored as an authoritative
                  // choice delta. Never persist the browser's estimate.
                  ev_delta: null,
              })
              .select('id')
              .maybeSingle();

          if (error) {
              console.warn('[coach-result] Insert error:', error.message);
              if (error.code === '42P01') {
                  return res.status(503).json(persistenceFailure(
                      'Coach progress could not be saved. Try again shortly.',
                      'storage_unavailable',
                      { stored: false },
                  ));
              }
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json(persistedResult(data || null, { id: data?.id, stored: true }));
      } catch (err) {
          console.warn('[coach-result] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
