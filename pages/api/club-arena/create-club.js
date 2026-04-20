/**
 * POST /api/club-arena/create-club
 * Creates a new club and the owner's membership record.
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { sanitizeClubName } = require('../../../src/lib/club-arena/sanitize');
import { reportApiError } from '../../../src/lib/sentryWrap';

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
  try {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
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
              await getSupabase().from('clubs').delete().eq('id', club.id);
              throw memErr;
          }

          return res.status(200).json({ success: true, club });
      } catch (err) {
          console.error('[create-club]', err);
          return res.status(500).json({ success: false, error: 'Failed to create club' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
