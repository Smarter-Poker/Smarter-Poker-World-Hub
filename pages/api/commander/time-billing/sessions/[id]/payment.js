/**
 * Record Payment for Time Billing Session
 * POST /api/commander/time-billing/sessions/[id]/payment
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
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Valid amount required' });

    const { data: session } = await supabase
      .from('commander_table_sessions')
      .select('amount_paid')
      .eq('id', id)
      .maybeSingle();

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const newTotal = (session.amount_paid || 0) + parseFloat(amount);

    const { data: updated, error } = await supabase
      .from('commander_table_sessions')
      .update({ amount_paid: Math.round(newTotal * 100) / 100 })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Payment error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
