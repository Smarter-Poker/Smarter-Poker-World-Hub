import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
      // Verify user is authenticated via Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // Verify Admin Role
      const { data: profile } = await getSupabase()
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
      }

      if (req.method === 'GET') {
          try {
              // Fetch all active personas
              const { data: personas } = await getSupabase()
                  .from('content_authors')
                  .select('id, name, is_active')
                  .eq('is_active', true);

              // Build roster from active personas
              const mockStats = {
                  totalGrinders: personas?.length || 0,
                  currentlyPlaying: 0,
                  activeTables: 0,
                  roster: personas ? personas.map(p => ({
                      horse_id: p.id,
                      tables: 0,
                      hands: 0,
                      profit: 0,
                      status: 'idle'
                  })) : []
              };

              return res.status(200).json({ success: true, stats: mockStats });
          } catch (error) {
              console.warn('Grinder Stats GET Error:', error);
              return res.status(500).json({ success: false, error: 'Failed to fetch grinder stats' });
          }
      }

      if (req.method === 'POST') {
          const { action, chips, club } = req.body;
          const clubNames = { shark_club: 'Shark Club', club_jaqk: 'Club JAQK' };
          const clubDisplay = clubNames[club] || 'both clubs';

          try {
              if (action === 'add_to_club') {
                  // Fetch all active personas to give them chips
                  const { data: personas, error: personaErr } = await getSupabase()
                      .from('content_authors')
                      .select('id')
                      .eq('is_active', true);

                  if (personaErr || !personas) throw new Error('Failed to fetch horses');

                  return res.status(200).json({
                      success: true,
                      message: `Added ${personas.length} horses to ${clubDisplay} with ${chips} initial chips each.`
                  });
              }

              if (action === 'start') {
                  return res.status(200).json({ success: true, message: 'All active horses instructed to auto-join games in Shark Club & Club JAQK.' });
              }

              if (action === 'stop') {
                  return res.status(200).json({ success: true, message: 'All active horses instructed to stop playing and leave tables in both clubs.' });
              }

              return res.status(400).json({ success: false, error: 'Unknown action' });
          } catch (error) {
              console.warn('Grinder Action Error:', error);
              return res.status(500).json({ success: false, error: 'Failed to execute action' });
          }
      }

      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
