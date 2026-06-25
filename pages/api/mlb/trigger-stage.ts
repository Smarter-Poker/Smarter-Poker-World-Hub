import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { stage } = req.body;

  if (!stage) {
    return res.status(400).json({ error: 'Stage is required' });
  }

  const STAGE_ORDER = ['predict', 'push', 'grade', 'grade_props', 'track', 'alert', 'export'];
  if (!STAGE_ORDER.includes(stage)) {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  try {
    const mainDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user: localUser } } = await mainDb.auth.getUser(token || '');
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
    
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Database Timeout')), 8000);
    });

    // 1. Check for existing pending or running stage
    const checkPromise = mlbDb
      .from('pipeline_runs')
      .select('id, status')
      .eq('stage', stage)
      .in('status', ['pending', 'running']);

    let existingRuns, checkError;
    try {
      const result = (await Promise.race([checkPromise, timeoutPromise])) as any;
      existingRuns = result?.data;
      checkError = result?.error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (checkError) {
      console.error('Trigger Stage DB Check Error:', checkError);
      return res.status(500).json({ error: checkError.message });
    }

    if (existingRuns && existingRuns.length > 0) {
      return res.status(409).json({ error: `Stage ${stage} is already ${existingRuns[0].status}.` });
    }

    // 2. Insert new pending run
    let insertTimeoutId: NodeJS.Timeout | undefined;
    const insertTimeoutPromise = new Promise((_, reject) => {
      insertTimeoutId = setTimeout(() => reject(new Error('Database Timeout')), 8000);
    });
    
    const insertPromise = mlbDb.from('pipeline_runs').insert({
      stage: stage,
      step: stage,
      status: 'pending',
      run_ts: new Date().toISOString(),
      notes: `Manually triggered by user ${localUser.id}`
    });

    let insertError;
    try {
      const result = (await Promise.race([insertPromise, insertTimeoutPromise])) as any;
      insertError = result?.error;
    } finally {
      if (insertTimeoutId) clearTimeout(insertTimeoutId);
    }

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
