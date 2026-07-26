/**
 * POST /api/sandbox/equity-snapshot
 * Persists a per-street equity snapshot to sandbox_equity_history.
 * Called from sandbox.js after each street analysis completes.
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

/** Clamp an optional string field; null when absent. */
function clampOptional(value, max) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).slice(0, max);
}

export default async function handler(req, res) {
  try {
      // Fires once per analyzed street — bound it like every other write.
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate
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

          // Guest submissions not stored
          if (!userId) {
              return res.status(200).json({ success: true, stored: false, reason: 'guest' });
          }

          const { sessionId, heroHand, villainRange, street, equityPct, evHero, boardCards } = req.body || {};

          if (!heroHand || !street) {
              return res.status(400).json({ success: false, error: 'Missing required fields: heroHand, street' });
          }

          const equity = typeof equityPct === 'number' && isFinite(equityPct)
              ? Math.min(100, Math.max(0, equityPct))
              : null;

          const { data, error } = await supabase
              .from('sandbox_equity_history')
              .insert({
                  user_id: userId,
                  session_id: sessionId || null,
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
                  return res.status(200).json({ success: true, stored: false, reason: 'table_missing' });
              }
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, id: data?.id });
      } catch (err) {
          console.warn('[equity-snapshot] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
