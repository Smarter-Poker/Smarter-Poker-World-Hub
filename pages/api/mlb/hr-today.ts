import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Today's "most likely to homer" leaderboard.
// Source: engine pred_props (prop='home_run', prob_over = modeled P(1+ HR today)),
// keyed by the latest as_of_ts, joined to dim_players for name + team.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const limit = parseInt(String(req.query.limit || '24'), 10) || 24;

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
      // No HR props found at all (very early season or table empty) — return empty
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ as_of: null, leaders: [], stale: false });
    }
    const asOf = latestRow.as_of_ts;

    async function fetchAllRows(build: () => any, pageSize = 1000, maxRows = 20000): Promise<any[]> {
      let all: any[] = [];
      for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await build().range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        all = all.concat(rows);
        if (rows.length < pageSize) break;
      }
      return all;
    }

    // 2) Top players by modeled HR probability for that slate.
    //    We fetch all rows for this slate using fetchAllRows because a player can have
    //    multiple home_run prop rows at one as_of_ts (doubleheaders / multiple lines).
    const props = await fetchAllRows(() =>
      db
        .from('pred_props')
        .select('player_id, prob_over, game_pk')
        .eq('prop', 'home_run')
        .eq('as_of_ts', asOf)
        .not('prob_over', 'is', null)
        .order('prob_over', { ascending: false })
    );

    // Collapse to the single best (highest prob_over, already sorted desc) row per
    // player_id, then take the top `limit`.
    const seen = new Set<number>();
    const rows = (Array.isArray(props) ? props : [])
      .filter((r: any) => {
        if (r.player_id == null || seen.has(r.player_id)) return false;
        seen.add(r.player_id);
        return true;
      })
      .slice(0, limit);
    const ids = rows.map((r: any) => r.player_id);

    // 3) Names + teams.
    const nameMap: Record<number, { full_name: string; team_id: number | null }> = {};
    if (ids.length) {
      const { data: dims, error: dimErr } = await db
        .from('dim_players')
        .select('player_id, full_name, team_id')
        .in('player_id', ids);
      if (dimErr) throw dimErr;
      for (const d of dims || [])
        nameMap[(d as any).player_id] = {
          full_name: (d as any).full_name,
          team_id: (d as any).team_id,
        };
    }

    const leaders = rows.map((r: any) => ({
      player_id: r.player_id,
      full_name: nameMap[r.player_id]?.full_name || `Player ${r.player_id}`,
      team_id: nameMap[r.player_id]?.team_id ?? null,
      hr_prob: r.prob_over != null ? Number(r.prob_over) : null,
      game_pk: r.game_pk ?? null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ as_of: asOf, leaders });
  } catch (err: any) {
    console.error('[hr-today] error:', err?.message || err);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(500).json({ error: 'Failed to load HR leaders' });
  }
}
