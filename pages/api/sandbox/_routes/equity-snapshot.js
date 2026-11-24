/**
 * POST /api/sandbox/equity-snapshot
 * Persists a per-street equity snapshot to sandbox_equity_history.
 * Called from sandbox.js after each street analysis completes.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { ephemeralResult, persistedResult, persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Sandbox Equity Snapshot Service Is Not Configured.');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** Clamp an optional string field; null when absent. */
function clampOptional(value, max) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  try {
      if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Fires once per analyzed street — bound it like every other write.
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const { user: authUser, status: authStatus } = await getServerUserWithFallback(req, supabase);
          if (authStatus === 503) {
              return res.status(503).json({ success: false, error: 'Session verification unavailable' });
          }
          if (authUser) userId = authUser.id;

          // Guest submissions not stored
          if (!userId) {
              return res.status(200).json(ephemeralResult('guest', null, { stored: false }));
          }

          const { sessionId, heroHand, villainRange, street, equityPct, evHero, boardCards } = req.body || {};

          if (!heroHand || !street) {
              return res.status(400).json({ success: false, error: 'Missing required fields: heroHand, street' });
          }

          let verifiedSessionId = null;
          if (sessionId !== undefined && sessionId !== null && sessionId !== '') {
              const sid = String(sessionId).trim();
              if (!UUID_RE.test(sid)) {
                  return res.status(400).json({ success: false, error: 'Invalid sessionId format' });
              }
              const { data: ownedSession, error: sessionErr } = await supabase
                  .from('sandbox_sessions')
                  .select('id')
                  .eq('id', sid)
                  .eq('user_id', userId)
                  .maybeSingle();
              if (sessionErr) {
                  return res.status(503).json(persistenceFailure(
                      'Session ownership could not be verified. Try again shortly.',
                      'storage_unavailable',
                      { stored: false },
                  ));
              }
              if (!ownedSession) {
                  return res.status(404).json({ success: false, error: 'Session not found' });
              }
              verifiedSessionId = sid;
          }

          const equity = typeof equityPct === 'number' && isFinite(equityPct)
              ? Math.min(100, Math.max(0, equityPct))
              : null;

          const { data, error } = await supabase
              .from('sandbox_equity_history')
              .insert({
                  user_id: userId,
                  session_id: verifiedSessionId,
                  hero_hand: String(heroHand).slice(0, 8),
                  villain_range: clampOptional(villainRange, 400),
                  street: String(street).slice(0, 10),
                  equity_pct: equity,
                  ev_hero: typeof evHero === 'number' && isFinite(evHero) ? evHero : null,
                  board_cards: clampOptional(boardCards, 60),
              })
              .select('id')
              .maybeSingle();

          if (error) {
              console.warn('[equity-snapshot] Insert error:', error.message);
              if (error.code === '42P01') {
                  return res.status(503).json(persistenceFailure(
                      'Equity history could not be saved. Try again shortly.',
                      'storage_unavailable',
                      { stored: false },
                  ));
              }
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json(persistedResult(data || null, { id: data?.id, stored: true }));
      } catch (err) {
          console.warn('[equity-snapshot] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
