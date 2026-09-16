/**
 * GET /api/sandbox/saved-hands
 * W6-1: Retrieves all saved hands for a user, grouped by folder.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';

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
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          const supabase = getSupabase();

          let userId = null;
          const { user: authUser } = await getServerUserWithFallback(req, supabase);
          if (authUser) userId = authUser.id;

          if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

          const { data, error } = await supabase
              .from('sandbox_saved_hands')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(500);

          if (error) {
              if (error.code === '42P01') return res.status(503).json(persistenceFailure(
                  'Study folders are temporarily unavailable.',
                  'storage_unavailable',
                  { hands: [] },
              ));
              console.warn('[saved-hands] Query error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, hands: data || [] });
      } catch (err) {
          console.warn('[saved-hands] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
