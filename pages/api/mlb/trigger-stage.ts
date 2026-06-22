import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { stage } = req.body;

  if (!stage) {
    return res.status(400).json({ error: 'Stage is required' });
  }

  try {
    const mlbDb = getMlbSupabase();
    
    // Insert a pending run for the backend pipeline engine to pick up
    const { error: insertError } = await mlbDb.from('pipeline_runs').insert({
      stage: stage,
      step: stage,
      status: 'pending',
      run_ts: new Date().toISOString(),
      notes: 'Manually triggered via Hub UI'
    });

    if (insertError) {
      console.error(`[API/MLB/Trigger] Database Error triggering stage ${stage}:`, insertError);
      return res.status(500).json({ error: 'Failed to queue stage rerun' });
    }

    return res.status(200).json({ ok: true, message: `Successfully queued stage: ${stage}` });
  } catch (error) {
    console.error(`[API/MLB/Trigger] Error triggering stage ${stage}:`, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
