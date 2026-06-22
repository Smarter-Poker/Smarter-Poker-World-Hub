import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { stage } = req.body;

  if (!stage) {
    return res.status(400).json({ error: 'Stage is required' });
  }

  try {
    const mainDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { user: localUser } = await getServerUserWithFallback(req, mainDb);
    if (!localUser) return res.status(401).json({ error: 'Auth required' });

    // Validate admin permissions
    const { data: profile } = await mainDb
      .from('profiles')
      .select('is_admin')
      .eq('id', localUser.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const mlbDb = getMlbSupabase();
    
    // 1. Check for existing pending or running stage
    const { data: existingRuns, error: checkError } = await mlbDb
      .from('pipeline_runs')
      .select('id, status')
      .eq('stage', stage)
      .in('status', ['pending', 'running']);

    if (checkError) {
      console.error('Trigger Stage DB Check Error:', checkError);
      return res.status(500).json({ error: checkError.message });
    }

    if (existingRuns && existingRuns.length > 0) {
      return res.status(409).json({ error: `Stage ${stage} is already ${existingRuns[0].status}.` });
    }

    // 2. Insert new pending run
    const { error: insertError } = await mlbDb.from('pipeline_runs').insert({
      stage: stage,
      step: stage,
      status: 'pending',
      run_ts: new Date().toISOString(),
      notes: `Manually triggered by user ${localUser.id}`
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
