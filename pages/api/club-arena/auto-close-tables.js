/**
 * Auto-Close Tables — Game Length Enforcement API
 * ═══════════════════════════════════════════════════════════════
 * Closes tables that have exceeded their configured `game_length_hours`.
 * Designed to be called from a cron job or manual trigger.
 * 
 * POST /api/club-arena/auto-close-tables
 * Body: { clubId? } — optional: only check tables for a specific club
 * Auth: requires admin or engine-key
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkIdempotency, cacheResponse } from '../../../src/lib/club-arena/idempotency';
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
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!applyRateLimit(req, res, LIMITS.write)) return;
      if (checkIdempotency(req, res)) return;

      // Auth: engine-key or admin bearer token
      const engineKey = req.headers['x-engine-key'] || req.body?.engineKey;
      const validEngineKey = engineKey && engineKey === process.env.ENGINE_INTERNAL_SECRET;

      

      if (!validEngineKey) {
          const token = req.headers['authorization']?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ error: 'Unauthorized' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
          // Verify caller is a platform admin
          const { data: profile } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
          if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
              return res.status(403).json({ error: 'Admin access required' });
          }
      }

      const { clubId } = req.body || {};

      try {
          // Fetch all active/running/waiting tables
          let query = getSupabase()
              .from('tables')
              .select('id, name, club_id, status, created_at, settings')
              .in('status', ['active', 'running', 'waiting']);

          if (clubId) query = query.eq('club_id', clubId);

          const { data: tables, error: fetchErr } = await query;
          if (fetchErr) throw fetchErr;

          const now = Date.now();
          let closedCount = 0;
          const closedTables = [];

          for (const table of (tables || [])) {
              const settings = table.settings || {};
              const gameLengthHours = settings.game_length_hours || 12; // default 12h
              const createdAt = new Date(table.created_at).getTime();
              const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);

              if (hoursElapsed >= gameLengthHours) {
                  // Close the table — atomic guard ensures no double-close
                  const { error: closeErr } = await getSupabase()
                      .from('tables')
                      .update({ status: 'closed', updated_at: new Date().toISOString() })
                      .eq('id', table.id)
                      .in('status', ['active', 'running', 'waiting']);

                  if (!closeErr) {
                      closedCount++;
                      closedTables.push({ id: table.id, name: table.name, hoursElapsed: Math.round(hoursElapsed * 10) / 10 });
                  }
              }
          }

          const result = {
              success: true,
              checked: (tables || []).length,
              closed: closedCount,
              closedTables,
              message: closedCount > 0
                  ? `Auto-closed ${closedCount} table(s) exceeding game length`
                  : 'No tables exceeded game length',
          };

          cacheResponse(req, res, result);
          return res.status(200).json(result);
      } catch (err) {
          console.warn('[auto-close-tables] Error:', err);
          return res.status(500).json({ error: 'Failed to check table game lengths' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
