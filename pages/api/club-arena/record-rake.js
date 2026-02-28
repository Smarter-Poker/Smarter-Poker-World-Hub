/**
 * POST /api/club-arena/record-rake
 * 
 * Called by the poker engine after each hand to record rake collected.
 * Creates a rake_record, updates club treasury, and tracks per-player
 * rake contribution for commission calculation.
 * 
 * Body: { clubId, tableId, handId, potSize, rakeAmount, numPlayers, playerContributions?: [{userId, rakeShare}] }
 * Auth: Internal (x-engine-key header) or Bearer token (admin/owner)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Accept either engine key or bearer token
  const engineKey = req.headers['x-engine-key'];
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!engineKey && !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // If bearer token, verify admin/owner role
  if (token && !engineKey) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', req.body.clubId)
      .eq('user_id', user.id)
      .single();

    if (!['owner', 'admin'].includes(member?.role)) {
      return res.status(403).json({ error: 'Only owners/admins or the engine can record rake' });
    }
  }

  const { clubId, tableId, handId, potSize, rakeAmount, numPlayers, playerContributions, bbjContribution } = req.body;

  if (!clubId || !rakeAmount || rakeAmount < 0) {
    return res.status(400).json({ error: 'clubId and non-negative rakeAmount required' });
  }

  try {
    // 1. Insert rake_record
    const { data: rakeRecord, error: rakeErr } = await supabaseAdmin
      .from('rake_records')
      .insert({
        club_id: clubId,
        table_id: tableId || null,
        hand_id: handId || null,
        pot_size: potSize || 0,
        rake_amount: rakeAmount,
        num_players: numPlayers || 0,
        bbj_contribution: bbjContribution || 0,
      })
      .select()
      .single();

    if (rakeErr) throw rakeErr;

    // 2. Update club treasury (add rake)
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('chip_treasury, total_rake')
      .eq('id', clubId)
      .single();

    await supabaseAdmin
      .from('clubs')
      .update({
        chip_treasury: (club?.chip_treasury || 0) + rakeAmount,
        total_rake: (club?.total_rake || 0) + rakeAmount,
      })
      .eq('id', clubId);

    // 3. If player contributions provided, track per-agent rake for commissions
    let agentRakeMap = {};
    if (playerContributions?.length > 0) {
      for (const pc of playerContributions) {
        // Look up which agent owns this player
        const { data: member } = await supabaseAdmin
          .from('club_members')
          .select('agent_id')
          .eq('club_id', clubId)
          .eq('user_id', pc.userId)
          .single();

        if (member?.agent_id) {
          agentRakeMap[member.agent_id] = (agentRakeMap[member.agent_id] || 0) + (pc.rakeShare || 0);
        }
      }

      // Update each agent's weekly_rake_generated
      for (const [agentUserId, agentRake] of Object.entries(agentRakeMap)) {
        const { data: agent } = await supabaseAdmin
          .from('agents')
          .select('id, weekly_rake_generated')
          .eq('user_id', agentUserId)
          .eq('club_id', clubId)
          .single();

        if (agent) {
          await supabaseAdmin
            .from('agents')
            .update({ weekly_rake_generated: (agent.weekly_rake_generated || 0) + agentRake })
            .eq('id', agent.id);
        }
      }
    }

    // 4. Update settlement period totals (if open period exists)
    const { data: openPeriod } = await supabaseAdmin
      .from('settlement_periods')
      .select('id, total_rake_collected, total_hands_dealt')
      .eq('club_id', clubId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (openPeriod) {
      await supabaseAdmin
        .from('settlement_periods')
        .update({
          total_rake_collected: (openPeriod.total_rake_collected || 0) + rakeAmount,
          total_hands_dealt: (openPeriod.total_hands_dealt || 0) + 1,
          total_bbj_contributions: bbjContribution ? (openPeriod.total_bbj_contributions || 0) + bbjContribution : undefined,
        })
        .eq('id', openPeriod.id);
    }

    return res.status(200).json({
      success: true,
      rakeRecordId: rakeRecord.id,
      rakeAmount,
      agentRakeBreakdown: agentRakeMap,
    });
  } catch (err) {
    console.error('[record-rake]', err);
    return res.status(500).json({ error: 'Rake recording failed', details: err.message });
  }
}
