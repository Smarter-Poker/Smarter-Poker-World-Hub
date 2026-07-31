import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { stats, tableId, clubId } = req.body || {};
    if (!stats || !tableId) return res.status(400).json({ error: 'stats and tableId required' });

    try {
      const { error: err_poker_session_stats_dip45 } = await getSupabase().from('poker_session_stats').upsert({
        user_id: user.id,
        table_id: tableId,
        club_id: clubId || null,
        hands_played: stats.handsPlayed || 0,
        hands_won: stats.handsWon || 0,
        starting_stack: stats.startingStack || 0,
        ending_stack: stats.currentStack || 0,
        biggest_win: stats.biggestWin || 0,
        biggest_loss: stats.biggestLoss || 0,
        total_pots: stats.totalPots || 0,
        vpip_count: stats.vpipCount || 0,
        pfr_count: stats.pfrCount || 0,
        aggression_bets: stats.aggressionBets || 0,
        aggression_calls: stats.aggressionCalls || 0,
        pl_history: stats.plHistory || [],
        position_wins: stats.positionWins || {},
        position_total: stats.positionTotal || {},
        session_start: stats.sessionStart ? new Date(stats.sessionStart).toISOString() : new Date().toISOString(),
        session_end: new Date().toISOString(),
      }, { onConflict: 'user_id,table_id' });
      if (err_poker_session_stats_dip45) console.warn('[Supabase] Silent mutation failed in poker_session_stats:', err_poker_session_stats_dip45.message);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.warn('[session-stats] Error:', err);
      return res.status(500).json({ error: 'Failed to save session stats' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
