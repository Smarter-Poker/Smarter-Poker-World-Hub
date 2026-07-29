import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/create-club
 * Creates a new club and the owner's membership record.
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { sanitizeClubName } = require('../../../src/lib/club-arena/sanitize');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Club name required' });

      // RED TEAM: XSS sanitization + length limit
      const cleanName = sanitizeClubName(name, 100);
      if (!cleanName) return res.status(400).json({ success: false, error: 'Club name contains only invalid characters' });

      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/create-club')) return;

      try {
          // Generate unique 5-digit code
          const clubCode = Math.floor(10000 + Math.random() * 90000);

          // Create club
          const { data: club, error: clubErr } = await getSupabase()
              .from('clubs')
              .insert({
                  name: cleanName,
                  owner_id: user.id,
                  club_id: clubCode,
                  member_count: 1,
                  created_at: new Date().toISOString(),
              })
              .select()
              .maybeSingle();

          if (clubErr) throw clubErr;

          // Create owner membership
          const { error: memErr } = await getSupabase()
              .from('club_members')
              .insert({
                  club_id: club.id,
                  user_id: user.id,
                  role: 'owner',
                  status: 'active',
                  chip_balance: 0,
                  joined_at: new Date().toISOString(),
              });

          if (memErr) {
              // Rollback club creation
              const { error: err_clubs_bwjq8 } = await getSupabase().from('clubs').delete().eq('id', club.id);
              if (err_clubs_bwjq8) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_bwjq8.message);
              throw memErr;
          }

          return res.status(200).json({ success: true, club });
      } catch (err) {
          console.warn('[create-club]', err);
          return res.status(500).json({ success: false, error: 'Failed to create club' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
