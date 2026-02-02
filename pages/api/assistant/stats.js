/**
 * GET /api/assistant/stats
 * Returns user's assistant stats (sessions reviewed, leaks found, etc.)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(200).json({
      success: true,
      stats: getDefaultStats(),
      isDemo: true
    });
  }

  try {
    // Try to get real stats
    const { data: stats, error } = await supabase
      .from('user_assistant_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !stats) {
      // Count sandbox sessions
      const { count: sandboxCount } = await supabase
        .from('sandbox_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Count leaks
      const { data: leaks } = await supabase
        .from('user_leaks')
        .select('status')
        .eq('user_id', userId);

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
