import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Today's "most likely to homer" leaderboard.
// Source: engine pred_props (prop='home_run', prob_over = modeled P(1+ HR today)),
// keyed by the latest as_of_ts, joined to dim_players for name + team.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '24'), 10) || 24, 1), 100);

  try {
    const db = getMlbSupabase();

    // 1) Latest slate timestamp for HR props.
    const { data: latestRow, error: latestErr } = await db
      .from('pred_props')
      .select('as_of_ts')
      .eq('prop', 'home_run')
      .order('as_of_ts', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw latestErr;
    if (!latestRow?.as_of_ts) {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
      return res.status(200).json({ as_of: null, leaders: [] });
    }
    const asOf = latestRow.as_of_ts;

    // 2) Top players by modeled HR probability for that slate.
    const { data: props, error: propsErr } = await db
      .from('pred_props')
      .select('player_id, prob_over, game_pk')
      .eq('prop', 'home_run')
      .eq('as_of_ts', asOf)
      .not('prob_over', 'is', null)
      .order('prob_over', { ascending: false })
      .limit(limit);
    if (propsErr) throw propsErr;

    const rows = Array.isArray(props) ? props : [];
    const ids = Array.from(new Set(rows.map((r: any) => r.player_id))).filter((x) => x != null);

    // 3) Names + teams.
    const nameMap: Record<number, { full_name: string; team_id: number | null }> = {};
    if (ids.length) {
      const { data: dims, error: dimErr } = await db
        .from('dim_players')
        .select('player_id, full_name, team_id')
        .in('player_id', ids);
      if (dimErr) throw dimErr;
      for (const d of dims || []) nameMap[(d as any).player_id] = { full_name: (d as any).full_name, team_id: (d as any).team_id };
    }

    const leaders = rows.map((r: any) => ({
      player_id: r.player_id,
      full_name: nameMap[r.player_id]?.full_name || `Player ${r.player_id}`,
      team_id: nameMap[r.player_id]?.team_id ?? null,
      hr_prob: r.prob_over != null ? Number(r.prob_over) : null,
      game_pk: r.game_pk ?? null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ as_of: asOf, leaders });
  } catch (err: any) {
    console.error('[hr-today] error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to load HR leaders' });
  }
}
