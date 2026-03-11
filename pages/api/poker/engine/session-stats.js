import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { stats, tableId, clubId } = req.body || {};
  if (!stats || !tableId) return res.status(400).json({ error: 'stats and tableId required' });

  try {
    await supabaseAdmin.from('poker_session_stats').upsert({
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[session-stats] Error:', err);
    return res.status(500).json({ error: 'Failed to save session stats' });
  }
}
