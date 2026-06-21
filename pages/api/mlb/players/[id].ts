import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

// Explicit column lists. We deliberately DO NOT select `fangraphs_full` (the entire
// engine metrics JSONB blob) — it is large, leaks internal model shape, and the detail
// page only needs the curated columns below.
const HITTER_COLUMNS =
  'player_id, full_name, team_id, bats, throws, position, birth_date, player_class, ' +
  'pa, woba, xwoba, wrc_plus, iso, barrel_pct, ev, sim_rates, hit_share, splits, recent, streaks';

const PITCHER_COLUMNS =
  'player_id, full_name, team_id, bats, throws, position, birth_date, role, ' +
  'bf, fip, xfip, siera, stuff_plus, sim_rates, splits, recent, streaks';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  // player_id is a bigint. Reject anything non-numeric up front so a bad id returns 400
  // (a clear client error) rather than a 500 from a failed PostgREST cast.
  if (!id || typeof id !== 'string' || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid player ID' });
  }

  try {
    const mlbDb = getMlbSupabase();

    // Look the id up in both profile views in parallel (removes a guaranteed serial
    // round-trip for every pitcher). A player lives in the hitter view, the pitcher view,
    // or — for two-way players — both.
    const [hitterRes, pitcherRes] = await Promise.all([
      mlbDb.from('v_hitter_profile').select(HITTER_COLUMNS).eq('player_id', id).maybeSingle(),
      mlbDb.from('v_pitcher_profile').select(PITCHER_COLUMNS).eq('player_id', id).maybeSingle(),
    ]);

    // A genuine DB error (not "0 rows") must surface as a 500 — never masquerade as 404.
    if (hitterRes.error || pitcherRes.error) {
      console.error('[MLB Player Detail] query error:', hitterRes.error || pitcherRes.error);
      return res.status(500).json({ error: 'Internal server error fetching player' });
    }

    const hitter = hitterRes.data;
    const pitcher = pitcherRes.data;

    if (hitter || pitcher) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      // Prefer the hitter profile for two-way players (their bat is the primary value);
      // a pure pitcher has no hitter row, so this only changes Ohtani-type cases.
      if (hitter) {
        return res.status(200).json({ type: 'hitter', profile: hitter });
      }
      return res.status(200).json({ type: 'pitcher', profile: pitcher });
    }

    return res.status(404).json({ error: 'Player not found' });
  } catch (err) {
    console.error('Error fetching player detail:', err);
    return res.status(500).json({ error: 'Internal server error fetching player' });
  }
}
