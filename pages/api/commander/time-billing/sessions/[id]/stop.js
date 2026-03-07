/**
 * Stop Time Billing Session
 * POST /api/commander/time-billing/sessions/[id]/stop
 * Ends session, calculates total charge based on duration and rate
 */
import { createClient } from '../../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { id } = req.query;

    const { data: session } = await supabase
      .from('commander_table_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.status !== 'active') return res.status(400).json({ success: false, error: 'Session not active' });

    const endedAt = new Date();
    const hours = (endedAt - new Date(session.started_at)) / 3600000;
    const halfHours = Math.ceil(hours * 2);
    const totalCharge = (halfHours / 2) * session.rate_per_hour;

    const { data: updated, error } = await supabase
      .from('commander_table_sessions')
      .update({
        status: 'completed',
        ended_at: endedAt.toISOString(),
        total_charge: Math.round(totalCharge * 100) / 100,
        duration_minutes: Math.round(hours * 60),
        ended_by: user.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Stop session error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
