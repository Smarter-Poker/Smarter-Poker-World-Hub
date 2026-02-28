/**
 * POST /api/club-arena/manage-agent
 * 
 * Club owner manages agent lifecycle:
 *   'promote'    - Promote a member to agent role
 *   'demote'     - Demote agent back to member (reassigns their players)
 *   'update'     - Update agent settings (commission rate, tier, etc.)
 *   'reassign'   - Move a player from one agent to another
 *   'suspend'    - Temporarily suspend an agent
 *   'reactivate' - Reactivate a suspended agent
 * 
 * Body: { clubId, action, targetUserId, ...actionParams }
 * Auth: Bearer token (club owner or union admin)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, action, targetUserId, ...params } = req.body;
  if (!clubId || !action) return res.status(400).json({ error: 'clubId and action required' });

  try {
    // Verify authorization
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, owner_id, union_id')
      .eq('id', clubId)
      .single();
    if (!club) return res.status(404).json({ error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .single();
      authorized = !!ua;
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized' });

    // ═══════════════════════════════════════════════════════════════
    // PROMOTE: Member → Agent
    // ═══════════════════════════════════════════════════════════════
    if (action === 'promote') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const { commissionRate = 0.50, isPrepaid = false, creditLimit = 0 } = params;

      // Get current membership
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('*')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!member) return res.status(404).json({ error: 'User not in club' });
      if (member.role === 'agent') return res.status(409).json({ error: 'Already an agent' });

      // Update role in club_members
      await supabaseAdmin
        .from('club_members')
        .update({
          role: 'agent',
          credit_limit: isPrepaid ? 0 : creditLimit,
          agent_id: null,
        })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      // Create agent record
      const { data: agentRecord, error: agentErr } = await supabaseAdmin
        .from('agents')
        .insert({
          user_id: targetUserId,
          club_id: clubId,
          role: 'agent',
          status: 'active',
          commission_rate: commissionRate,
          is_prepaid: isPrepaid,
          credit_limit: isPrepaid ? 0 : creditLimit,
          business_balance: 0,
          active_player_count: 0,
          total_players: 0,
        })
        .select()
        .single();

      if (agentErr) throw agentErr;

      return res.status(200).json({
        success: true,
        action: 'promoted',
        agentId: agentRecord.id,
        targetUserId,
        commissionRate,
        isPrepaid,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // DEMOTE: Agent → Member (reassigns their players)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'demote') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const { reassignTo } = params; // optional: another agent to receive the players

      // Get agent's players
      const { data: agentPlayers } = await supabaseAdmin
        .from('club_members')
        .select('user_id')
        .eq('club_id', clubId)
        .eq('agent_id', targetUserId);

      const playerCount = agentPlayers?.length || 0;

      // Reassign players
      if (playerCount > 0) {
        await supabaseAdmin
          .from('club_members')
          .update({ agent_id: reassignTo || null })
          .eq('club_id', clubId)
          .eq('agent_id', targetUserId);

        // Update reassigned-to agent's player counts
        if (reassignTo) {
          const { data: newAgent } = await supabaseAdmin
            .from('agents')
            .select('id, active_player_count, total_players')
            .eq('user_id', reassignTo)
            .eq('club_id', clubId)
            .single();
          if (newAgent) {
            await supabaseAdmin
              .from('agents')
              .update({
                active_player_count: (newAgent.active_player_count || 0) + playerCount,
                total_players: (newAgent.total_players || 0) + playerCount,
              })
              .eq('id', newAgent.id);
          }
        }
      }

      // Demote in club_members
      await supabaseAdmin
        .from('club_members')
        .update({ role: 'member', credit_limit: 0 })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      // Deactivate agent record
      await supabaseAdmin
        .from('agents')
        .update({ status: 'inactive', active_player_count: 0 })
        .eq('user_id', targetUserId)
        .eq('club_id', clubId);

      return res.status(200).json({
        success: true,
        action: 'demoted',
        targetUserId,
        playersReassigned: playerCount,
        reassignedTo: reassignTo || 'unassigned',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE: Change agent settings
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const { commissionRate, tier, isPrepaid, creditLimit, nickname } = params;
      const updates = {};
      const agentUpdates = {};

      if (commissionRate !== undefined) {
        agentUpdates.commission_rate = commissionRate;
      }
      if (tier !== undefined) updates.tier = tier;
      if (nickname !== undefined) updates.nickname = nickname;
      if (isPrepaid !== undefined) agentUpdates.is_prepaid = isPrepaid;
      if (creditLimit !== undefined) {
        updates.credit_limit = creditLimit;
        agentUpdates.credit_limit = creditLimit;
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from('club_members')
          .update(updates)
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);
      }

      if (Object.keys(agentUpdates).length > 0) {
        await supabaseAdmin
          .from('agents')
          .update(agentUpdates)
          .eq('user_id', targetUserId)
          .eq('club_id', clubId);
      }

      return res.status(200).json({ success: true, action: 'updated', updates: { ...updates, ...agentUpdates } });
    }

    // ═══════════════════════════════════════════════════════════════
    // REASSIGN: Move player between agents
    // ═══════════════════════════════════════════════════════════════
    if (action === 'reassign') {
      const { playerId, fromAgentId, toAgentId } = params;
      if (!playerId || !toAgentId) {
        return res.status(400).json({ error: 'playerId and toAgentId required' });
      }

      await supabaseAdmin
        .from('club_members')
        .update({ agent_id: toAgentId })
        .eq('club_id', clubId)
        .eq('user_id', playerId);

      // Update agent player counts
      if (fromAgentId) {
        const { data: fromAgent } = await supabaseAdmin
          .from('agents')
          .select('id, active_player_count')
          .eq('user_id', fromAgentId)
          .eq('club_id', clubId)
          .single();
        if (fromAgent) {
          await supabaseAdmin
            .from('agents')
            .update({ active_player_count: Math.max(0, (fromAgent.active_player_count || 1) - 1) })
            .eq('id', fromAgent.id);
        }
      }

      const { data: toAgent } = await supabaseAdmin
        .from('agents')
        .select('id, active_player_count, total_players')
        .eq('user_id', toAgentId)
        .eq('club_id', clubId)
        .single();
      if (toAgent) {
        await supabaseAdmin
          .from('agents')
          .update({
            active_player_count: (toAgent.active_player_count || 0) + 1,
            total_players: (toAgent.total_players || 0) + 1,
          })
          .eq('id', toAgent.id);
      }

      return res.status(200).json({
        success: true,
        action: 'reassigned',
        playerId,
        fromAgent: fromAgentId || 'unassigned',
        toAgent: toAgentId,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // SUSPEND / REACTIVATE
    // ═══════════════════════════════════════════════════════════════
    if (action === 'suspend' || action === 'reactivate') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const newStatus = action === 'suspend' ? 'suspended' : 'active';

      await supabaseAdmin
        .from('agents')
        .update({ status: newStatus })
        .eq('user_id', targetUserId)
        .eq('club_id', clubId);

      await supabaseAdmin
        .from('club_members')
        .update({ status: newStatus })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      return res.status(200).json({ success: true, action, targetUserId, newStatus });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[manage-agent]', err);
    return res.status(500).json({ error: 'Agent management failed', details: err.message });
  }
}
