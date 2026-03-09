/**
 * POST /api/club-arena/accept-tos
 * 
 * Records that the authenticated user has accepted the Club Arena
 * Terms of Service. This is a one-time action — once accepted,
 * the TOS modal never appears again for this account.
 * 
 * Body: {} (no params needed)
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  try {
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ club_arena_tos_accepted_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    return res.status(200).json({ success: true, acceptedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[accept-tos]', err);
    return res.status(500).json({ success: false, error: 'Failed to record TOS acceptance' });
  }
}
