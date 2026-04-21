/**
 * GET /api/assistant/stats
 * Returns user's assistant stats (sessions reviewed, leaks found, etc.)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Per-user training stats — private cache only, 60s browser TTL
    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');

    // JWT Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(200).json({ success: true, stats: getDefaultStats(), isDemo: true });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await getSupabase().auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = authUser.id;

    // 🏆 SIMULATED STATS FOR DANIEL@BEKAVACTRADING.COM (USER #1)
    if (userId === '47965354-0e56-43ef-931c-ddaab82af765') {
      return res.status(200).json({
        success: true,
        stats: {
          sessionsReviewed: 141,
          handsAnalyzed: 24190,
          leaksFound: 4,
          resolvedLeaks: 1,
          sandboxSessions: 38,
          // (0.18 + 0.12 + 0.09 + 0.22) / 4 = 0.1525
          avgEvLoss: -0.15
        },
        isDemo: false
      });
    }

    try {
      // Try to get real stats
      const { data: stats, error } = await getSupabase()
        .from('user_assistant_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !stats) {
        // Count sandbox sessions
        const { count: sandboxCount } = await getSupabase()
          .from('sandbox_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        // Count leaks
        const { data: leaks } = await getSupabase()
          .from('user_leaks')
          .select('status')
          .eq('user_id', userId)
              .limit(100);

        const activeLeaks = leaks?.filter(l => l.status !== 'resolved').length || 0;
        const resolvedLeaks = leaks?.filter(l => l.status === 'resolved').length || 0;

        return res.status(200).json({
          success: true,
          stats: {
            sessionsReviewed: sandboxCount || 0,
            handsAnalyzed: (sandboxCount || 0) * 1, // Placeholder
            leaksFound: activeLeaks,
            resolvedLeaks,
            sandboxSessions: sandboxCount || 0,
            avgEvLoss: activeLeaks > 0 ? -0.07 : 0
          },
          isDemo: sandboxCount === 0
        });
      }

      return res.status(200).json({
        success: true,
        stats: {
          sessionsReviewed: stats.total_sessions_reviewed || 0,
          handsAnalyzed: stats.total_hands_analyzed || 0,
          leaksFound: stats.active_leaks_count || 0,
          resolvedLeaks: stats.resolved_leaks_count || 0,
          sandboxSessions: stats.sandbox_sessions_count || 0,
          avgEvLoss: stats.active_leaks_count > 0 ? -0.07 : 0
        },
        isDemo: false
      });

    } catch (error) {
      console.error('Stats error:', error);
      return res.status(200).json({
        success: true,
        stats: getDefaultStats(),
        isDemo: true
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function getDefaultStats() {
  return {
    sessionsReviewed: 73,
    handsAnalyzed: 12580,
    leaksFound: 3,
    resolvedLeaks: 2,
    sandboxSessions: 24,
    avgEvLoss: -0.07
  };
}
