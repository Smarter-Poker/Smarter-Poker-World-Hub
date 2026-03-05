/**
 * GET /api/club-arena/cashout-history?clubId=xxx
 * 
 * Returns full cashout request history for the authenticated player.
 * Includes all statuses: pending, approved, cancelled, completed.
 * Auth: Bearer token
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const clubId = req.query.clubId;
  if (!clubId) return res.status(400).json({ error: 'clubId query param required' });

  try {
    // Verify membership
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (!member) return res.status(403).json({ error: 'Not a club member' });

    // Owners/admins see all cashouts, agents see their downline, players see own
    let query = supabaseAdmin
      .from('cashout_requests')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (member.role === 'player') {
      query = query.eq('player_id', user.id);
    } else if (['agent', 'sub_agent', 'super_agent'].includes(member.role)) {
      query = query.eq('agent_id', user.id);
    }
    // owners/admins get all

    const { data: cashouts, error } = await query;
    if (error) throw error;

    // Enrich with profile names
    const playerIds = [...new Set((cashouts || []).map(c => c.player_id))];
    let profiles = {};
    if (playerIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name')
        .in('id', playerIds)
            .limit(100);
      for (const p of (profs || [])) profiles[p.id] = p;
    }

    const enriched = (cashouts || []).map(c => ({
      ...c,
      player_profile: profiles[c.player_id] || null,
    }));

    return res.status(200).json({ success: true, cashouts: enriched });
  } catch (err) {
    console.error('[cashout-history]', err);
    return res.status(500).json({ error: 'Cashout history failed', details: err.message });
  }
}
