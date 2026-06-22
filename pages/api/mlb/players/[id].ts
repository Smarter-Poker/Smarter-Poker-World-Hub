import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

// Full player detail comes from one engine RPC (get_mlb_player_detail) that returns:
//   { type, player, season (full fg_season stat line), profile (sim_rates + streaks),
//     matchup (today's opponent, probable pitcher, batter-vs-pitcher / pitcher-vs-team) }
// All sourced from the engine's daily-refreshed tables.
// Short, defensible HR-conditions summary from the latest weather snapshot.
// Park-relative wind (out/in) needs stadium orientation we don't model here, so we
// describe temperature + wind speed + roof only — no over-claiming on wind direction.
function weatherSummary(w: {
  temp_f: number | null;
  wind_mph: number | null;
  roof_state: string | null;
}): string {
  const roof = (w.roof_state || '').toLowerCase();
  if (roof.includes('closed') || roof.includes('dome'))
    return 'Indoors / roof closed — controlled, neutral conditions for power.';
  const parts: string[] = [];
  const t = w.temp_f;
  if (t != null) {
    if (t >= 85) parts.push('Hot — air carries well, favorable for home runs');
    else if (t >= 75) parts.push('Warm — slightly favorable for carry');
    else if (t >= 62) parts.push('Mild — neutral for power');
    else parts.push('Cool — denser air suppresses carry');
  }
  const wind = w.wind_mph;
  if (wind != null && wind >= 12) parts.push('breezy (high ball-flight variance)');
  else if (wind != null && wind >= 6) parts.push('a light breeze');
  return parts.length ? parts.join(' · ') + '.' : 'Conditions unremarkable for power.';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  // player_id is a bigint. Reject non-numeric up front (400, not a 500 from a bad cast).
  if (!id || typeof id !== 'string' || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid player ID' });
  }

  try {
    const mlbDb = getMlbSupabase();
    const { data, error } = await mlbDb.rpc('get_mlb_player_detail', { p_id: Number(id) });

    if (error) {
      console.error('[MLB Player Detail] rpc error:', error);
      return res.status(500).json({ error: 'Internal server error fetching player' });
    }

    // RPC returns null (no row) when the id does not exist.
    if (!data || !data.player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Best-effort enrichment: today's weather + this batter's posted lineup slot.
    // Non-fatal — never let these break the core player payload.
    try {
      const gamePk = data?.matchup?.game_pk;
      if (gamePk && data.matchup) {
        const [wxRes, luRes] = await Promise.all([
          mlbDb
            .from('raw_weather')
            .select('temp_f,humidity,wind_mph,wind_dir_deg,precip_prob,roof_state')
            .eq('game_pk', gamePk)
            .order('knowledge_time', { ascending: false })
            .limit(1)
            .maybeSingle(),
          mlbDb
            .from('raw_lineups')
            .select('batting_order,confirmed')
            .eq('game_pk', gamePk)
            .eq('player_id', Number(id))
            .order('knowledge_time', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const wx: any = wxRes.data;
        if (wx) {
          const weather = {
            temp_f: wx.temp_f != null ? Number(wx.temp_f) : null,
            humidity: wx.humidity != null ? Number(wx.humidity) : null,
            wind_mph: wx.wind_mph != null ? Number(wx.wind_mph) : null,
            wind_dir_deg: wx.wind_dir_deg != null ? Number(wx.wind_dir_deg) : null,
            precip_prob: wx.precip_prob != null ? Number(wx.precip_prob) : null,
            roof_state: wx.roof_state || null,
            summary: '',
          };
          weather.summary = weatherSummary(weather);
          if (data?.matchup) data.matchup.weather = weather;
        }
        const lu: any = luRes.data;
        if (data?.matchup) data.matchup.lineup = lu
          ? { batting_order: lu.batting_order, confirmed: !!lu.confirmed }
          : null;
      }
    } catch (e: any) {
      console.error('[MLB Player Detail] enrichment skipped:', e?.message || e);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching player detail:', err);
    return res.status(500).json({ error: 'Internal server error fetching player' });
  }
}
