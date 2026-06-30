import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  const mlbDb = getMlbSupabase();
  const { data: g, error: gErr } = await mlbDb
    .from('fact_games')
    .select('official_date')
    .eq('game_pk', Number(id))
    .maybeSingle();

  if (gErr || !g?.official_date) {
    return res.status(404).json({ error: 'Game not found in fact_games' });
  }

  const { getSlate } = await import('../../../../src/lib/mlb_data');
  const slate = await getSlate(g.official_date);
  const found = slate.find((card) => card.gamePk === Number(id));

  if (!found) {
    return res.status(404).json({ error: 'Game not found in slate' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json(found);
}
