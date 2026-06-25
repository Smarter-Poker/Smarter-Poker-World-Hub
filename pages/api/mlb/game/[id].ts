import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  const mlbDb = getMlbSupabase();
  const { data, error } = await mlbDb
    .from('raw_games')
    .select('*')
    .eq('game_pk', Number(id))
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Transform it so the UI recognizes it as a GameCard
  const transformed = {
    gamePk: data.game_pk,
    gameTime: data.game_date,
    firstPitch: data.game_date,
    status: data.status_abstract_game_state,
    homeId: data.home_team_id,
    awayId: data.away_team_id,
    home: data.home_team_name || 'Home',
    away: data.away_team_name || 'Away',
    home_score: data.home_score || 0,
    away_score: data.away_score || 0,
    home_pitcher: data.home_probable_pitcher_name || null,
    away_pitcher: data.away_probable_pitcher_name || null,
  };

  res.status(200).json(transformed);
}
