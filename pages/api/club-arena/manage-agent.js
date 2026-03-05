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
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

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

  // Settlement lock — block chip-moving actions during settlement window
  const chipMovingActions = ['remove', 'promote', 'demote'];
  if (chipMovingActions.includes(action)) {
    const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
    if (lockCheck.locked) return sendLockedResponse(res, lockCheck);
  }

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

    // Agent-level actions — agents can call these for their own downline
    const agentActions = ['list_sub_agents', 'set_player_rakeback', 'update_commission', 'promote_to_sub_agent'];
    if (!authorized && agentActions.includes(action)) {
      // Check if caller is an active agent in this club
      const { data: callerAsAgent } = await supabaseAdmin
        .from('agents')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .eq('status', 'active')
        .single();
      if (callerAsAgent) authorized = true;
    }

    if (!authorized) return res.status(403).json({ error: 'Not authorized' });

    // ═══════════════════════════════════════════════════════════════
    // PROMOTE: Player → Agent / Super Agent / Sub Agent
    // Commission rate MUST be explicitly set. No defaults.
    // Rakeback % to players must be < (agent commission - 10%)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'promote') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const {
        commissionRate,          // REQUIRED — no default
        agentTier = 'agent',     // 'super_agent', 'agent', 'sub_agent'
        isPrepaid = false,
        creditLimit = 0,
        parentAgentId = null,    // Required for sub_agent
        rakebackPercentage = 0,  // What agent gives back to players (default 0)
      } = params;

      // ─── VALIDATION: Commission rate is MANDATORY ───
      if (commissionRate === undefined || commissionRate === null) {
        return res.status(400).json({
          error: 'commissionRate is REQUIRED before promoting to agent status',
          hint: 'Set a commission rate between 0.01 (1%) and 0.90 (90%)',
        });
      }

      if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
        return res.status(400).json({
          error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)',
          provided: commissionRate,
        });
      }

      // ─── VALIDATION: Agent tier ───
      const validTiers = ['super_agent', 'agent', 'sub_agent'];
      if (!validTiers.includes(agentTier)) {
        return res.status(400).json({ error: `agentTier must be one of: ${validTiers.join(', ')}` });
      }

      // ─── VALIDATION: Sub-agent requires parent and lower commission ───
      if (agentTier === 'sub_agent') {
        if (!parentAgentId) {
          return res.status(400).json({ error: 'parentAgentId is REQUIRED for sub_agent tier' });
        }

        const { data: parentAgent } = await supabaseAdmin
          .from('agents')
          .select('id, user_id, commission_rate, role')
          .eq('user_id', parentAgentId)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .single();

        if (!parentAgent) {
          return res.status(404).json({ error: 'Parent agent not found or not active in this club' });
        }

        // Store the agent RECORD id (not user_id) — all queries use agent.id
        params._parentAgentRecordId = parentAgent.id;

        if (commissionRate >= parentAgent.commission_rate) {
          return res.status(400).json({
            error: 'Sub-agent commission rate must be LESS than parent agent rate',
            parent_rate: parentAgent.commission_rate,
            provided: commissionRate,
            hint: `Parent agent is at ${(parentAgent.commission_rate * 100).toFixed(1)}%, sub-agent must be lower`,
          });
        }
      }

      // ─── VALIDATION: Rakeback percentage ───
      // Agent can give players up to (their_commission - 10%) max
      // e.g. Agent at 70% → max player rakeback is 60%
      if (rakebackPercentage !== undefined && rakebackPercentage > 0) {
        const maxRakeback = commissionRate - 0.10;
        if (rakebackPercentage >= commissionRate) {
          return res.status(400).json({
            error: 'Rakeback percentage must be LESS than agent commission rate',
            commission_rate: commissionRate,
            provided_rakeback: rakebackPercentage,
          });
        }
        if (rakebackPercentage > maxRakeback) {
          return res.status(400).json({
            error: `Rakeback cannot exceed agent commission minus 10%. Max allowed: ${(maxRakeback * 100).toFixed(1)}%`,
            commission_rate: commissionRate,
            max_rakeback: maxRakeback,
            provided_rakeback: rakebackPercentage,
          });
        }
      }

      // Get current membership
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('*')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!member) return res.status(404).json({ error: 'User not in club' });
      if (['agent', 'super_agent', 'sub_agent'].includes(member.role)) {
        return res.status(409).json({ error: `Already ${member.role}` });
      }

      // Update role in club_members
      await supabaseAdmin
        .from('club_members')
        .update({
          role: agentTier,
          credit_limit: isPrepaid ? 0 : creditLimit,
          agent_id: agentTier === 'sub_agent' ? parentAgentId : null,
        })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      // Create agent record
      const { data: agentRecord, error: agentErr } = await supabaseAdmin
        .from('agents')
        .insert({
          user_id: targetUserId,
          club_id: clubId,
          role: agentTier,
          status: 'active',
          commission_rate: commissionRate,
          is_prepaid: isPrepaid,
          credit_limit: isPrepaid ? 0 : creditLimit,
          business_balance: 0,
          active_player_count: 0,
          total_players: 0,
          parent_agent_id: agentTier === 'sub_agent' ? params._parentAgentRecordId : null,
          auto_rakeback_enabled: rakebackPercentage > 0,
          rakeback_percentage: rakebackPercentage || 0,
        })
        .select()
        .single();

      if (agentErr) throw agentErr;

      return res.status(200).json({
        success: true,
        action: 'promoted',
        agentId: agentRecord.id,
        targetUserId,
        agentTier,
        commissionRate,
        rakebackPercentage: rakebackPercentage || 0,
        maxPlayerRakeback: Math.max(0, commissionRate - 0.10),
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
        .eq('agent_id', targetUserId)
            .limit(200);

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
            const oldActive = newAgent.active_player_count || 0;
            const oldTotal = newAgent.total_players || 0;
            const { data: upd } = await supabaseAdmin
              .from('agents')
              .update({
                active_player_count: oldActive + playerCount,
                total_players: oldTotal + playerCount,
              })
              .eq('id', newAgent.id)
              .eq('active_player_count', oldActive) // optimistic lock
              .select('id');

            // Retry once on conflict
            if (!upd?.length) {
              const { data: freshA } = await supabaseAdmin.from('agents').select('active_player_count, total_players').eq('id', newAgent.id).single();
              if (freshA) {
                await supabaseAdmin.from('agents').update({
                  active_player_count: (freshA.active_player_count || 0) + playerCount,
                  total_players: (freshA.total_players || 0) + playerCount,
                }).eq('id', newAgent.id);
              }
            }
          }
        }
      }

      // Demote in club_members
      await supabaseAdmin
        .from('club_members')
        .update({ role: 'player', credit_limit: 0 })
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
        // ── BUG #146 FIX: Validate commission rate (same rules as update_commission) ──
        // Without this, the generic 'update' action bypasses range checks,
        // sub-agent hierarchy rules, and rakeback ceiling enforcement.
        if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
          return res.status(400).json({ error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
        }

        // If this agent has a parent, new rate must be less than parent's
        const { data: tgtAgent } = await supabaseAdmin
          .from('agents')
          .select('id, parent_agent_id, rakeback_percentage')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .single();

        if (tgtAgent?.parent_agent_id) {
          const { data: parentAg } = await supabaseAdmin.from('agents').select('commission_rate').eq('id', tgtAgent.parent_agent_id).single();
          if (parentAg && commissionRate >= parentAg.commission_rate) {
            return res.status(400).json({ error: 'Sub-agent rate must be less than parent rate', parent_rate: parentAg.commission_rate });
          }
        }

        // Check sub-agents below won't be violated
        if (tgtAgent) {
          const { data: subAgents } = await supabaseAdmin.from('agents').select('user_id, commission_rate').eq('club_id', clubId).eq('parent_agent_id', tgtAgent.id);
          for (const sub of (subAgents || [])) {
            if (sub.commission_rate >= commissionRate) {
              return res.status(400).json({ error: `Cannot lower below sub-agent ${sub.user_id} at ${(sub.commission_rate * 100).toFixed(1)}%` });
            }
          }

          // Check rakeback ceiling
          if ((tgtAgent.rakeback_percentage || 0) > 0) {
            const maxRb = commissionRate - 0.10;
            if (tgtAgent.rakeback_percentage > maxRb) {
              return res.status(400).json({ error: `Current rakeback (${(tgtAgent.rakeback_percentage * 100).toFixed(1)}%) exceeds new max (${(maxRb * 100).toFixed(1)}%). Lower rakeback first.` });
            }
          }
        }

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
      if (!playerId) {
        return res.status(400).json({ error: 'playerId required' });
      }

      // toAgentId can be null (un-assign from agent)
      await supabaseAdmin
        .from('club_members')
        .update({ agent_id: toAgentId || null })
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

    // ═══════════════════════════════════════════════════════════════
    // CHANGE_ROLE: General role change (owner/admin/agent/player)
    // Handles agent promotion/demotion transitions automatically
    // ═══════════════════════════════════════════════════════════════
    if (action === 'change_role') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const { newRole } = params;
      if (!newRole || !['admin', 'agent', 'player'].includes(newRole)) {
        return res.status(400).json({ error: 'newRole must be admin, agent, or player' });
      }

      const { data: targetMember } = await supabaseAdmin
        .from('club_members')
        .select('user_id, role, agent_id')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!targetMember) return res.status(404).json({ error: 'Member not found' });
      if (targetMember.role === 'owner') {
        return res.status(403).json({ error: 'Cannot change the owner\'s role' });
      }

      const oldRole = targetMember.role;
      const updates = { role: newRole };

      const agentRoles = ['agent', 'sub_agent', 'super_agent'];

      // If demoting FROM agent role → clear downline assignments
      if (agentRoles.includes(oldRole) && !agentRoles.includes(newRole)) {
        await supabaseAdmin
          .from('club_members')
          .update({ agent_id: null })
          .eq('club_id', clubId)
          .eq('agent_id', targetUserId);

        // Deactivate agent record
        await supabaseAdmin
          .from('agents')
          .update({ status: 'inactive', active_player_count: 0 })
          .eq('user_id', targetUserId)
          .eq('club_id', clubId);
      }

      // If promoting TO agent → create agent record if needed
      if (newRole === 'agent' && !agentRoles.includes(oldRole)) {
        // Validate commission rate (same rules as 'promote' action)
        const cr = params.commissionRate;
        if (cr === undefined || cr === null) {
          return res.status(400).json({
            error: 'commissionRate is REQUIRED when promoting to agent via change_role',
            hint: 'Set a commission rate between 0.01 (1%) and 0.90 (90%)',
          });
        }
        if (typeof cr !== 'number' || cr < 0.01 || cr > 0.90) {
          return res.status(400).json({ error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
        }

        const { data: existingAgent } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .single();

        if (existingAgent) {
          await supabaseAdmin
            .from('agents')
            .update({ status: 'active', role: 'agent', commission_rate: cr })
            .eq('id', existingAgent.id);
        } else {
          await supabaseAdmin
            .from('agents')
            .insert({
              user_id: targetUserId,
              club_id: clubId,
              role: 'agent',
              status: 'active',
              commission_rate: cr,
              is_prepaid: params.isPrepaid || false,
              business_balance: 0,
              active_player_count: 0,
              total_players: 0,
            });
        }
      }

      // Non-player roles shouldn't have an agent_id
      if (newRole !== 'player') {
        updates.agent_id = null;
      }

      await supabaseAdmin
        .from('club_members')
        .update(updates)
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      return res.status(200).json({
        success: true,
        action: 'role_changed',
        targetUserId,
        oldRole,
        newRole,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // REMOVE: Remove a member from the club entirely
    // ═══════════════════════════════════════════════════════════════
    if (action === 'remove') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

      const { data: targetMember } = await supabaseAdmin
        .from('club_members')
        .select('user_id, role, chip_balance')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!targetMember) return res.status(404).json({ error: 'Member not found' });
      if (targetMember.role === 'owner') {
        return res.status(403).json({ error: 'Cannot remove the club owner' });
      }

      // Only owner can remove admins
      if (targetMember.role === 'admin' && club.owner_id !== user.id) {
        return res.status(403).json({ error: 'Only the club owner can remove admins' });
      }

      // Prevent removing members with chip balance — return chips to treasury first
      const balance = targetMember.chip_balance || 0;
      if (balance > 0) {
        if (!params.forceReturn) {
          return res.status(400).json({
            error: `Member has ${balance.toLocaleString()} chips remaining. Set forceReturn:true to return chips to treasury and remove.`,
            chip_balance: balance,
          });
        }
        // Return chips to club treasury atomically
        await supabaseAdmin.rpc('fn_debit_chips', {
          p_club_id: clubId,
          p_user_id: targetUserId,
          p_amount: balance,
        });
        await supabaseAdmin.rpc('fn_credit_treasury', {
          p_club_id: clubId,
          p_amount: balance,
        });
        await supabaseAdmin.from('chip_transactions').insert({
          club_id: clubId,
          from_user_id: targetUserId,
          to_user_id: null,
          amount: balance,
          transaction_type: 'withdrawal',
          notes: `Member removed — ${balance.toLocaleString()} chips returned to club treasury`,
        });
      }

      // If removing an agent, clear downline + deactivate agent record
      if (['agent', 'sub_agent', 'super_agent'].includes(targetMember.role)) {
        await supabaseAdmin
          .from('club_members')
          .update({ agent_id: null })
          .eq('club_id', clubId)
          .eq('agent_id', targetUserId);

        await supabaseAdmin
          .from('agents')
          .update({ status: 'inactive', active_player_count: 0 })
          .eq('user_id', targetUserId)
          .eq('club_id', clubId);
      }

      // Delete membership
      const { error: delErr } = await supabaseAdmin
        .from('club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      if (delErr) throw delErr;

      // Update club member count
      const { count } = await supabaseAdmin
        .from('club_members')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', clubId)

      await supabaseAdmin
        .from('clubs')
        .update({ member_count: count || 0 })
        .eq('id', clubId);

      return res.status(200).json({
        success: true,
        action: 'removed',
        targetUserId,
        remainingMembers: count || 0,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // SET PARENT AGENT (create sub-agent relationship)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'set_parent_agent') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required (the sub-agent)' });
      const { parentAgentId } = req.body;

      // Get target agent record
      const { data: targetAgent } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, parent_agent_id')
        .eq('user_id', targetUserId)
        .eq('club_id', clubId)
        .single();

      if (!targetAgent) return res.status(404).json({ error: 'Target agent not found' });

      // Resolve parentAgentId (user_id) to agent RECORD id for storage consistency
      let parentRecordId = null;
      if (parentAgentId) {
        const { data: parentAgent } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('user_id', parentAgentId)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .single();
        if (!parentAgent) return res.status(404).json({ error: 'Parent agent not found' });
        parentRecordId = parentAgent.id;
      }

      // If parentAgentId is null, remove parent (make standalone)
      const { error } = await supabaseAdmin
        .from('agents')
        .update({ parent_agent_id: parentRecordId })
        .eq('id', targetAgent.id);

      if (error) throw error;
      return res.status(200).json({ success: true, action: 'parent_set', parentAgentId });
    }

    // ═══════════════════════════════════════════════════════════════
    // LIST SUB-AGENTS (for a given parent agent)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'list_sub_agents') {
      const { parentAgentUserId } = req.body;
      if (!parentAgentUserId) return res.status(400).json({ error: 'parentAgentUserId required' });

      // Get parent agent record
      const { data: parentAgent } = await supabaseAdmin
        .from('agents')
        .select('id, user_id')
        .eq('user_id', parentAgentUserId)
        .eq('club_id', clubId)
        .single();

      if (!parentAgent) return res.status(404).json({ error: 'Parent agent not found' });

      // Get sub-agents
      const { data: subAgents } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, status, active_player_count, total_players, lifetime_earnings, weekly_rake_generated, business_balance, credit_limit, credit_used')
        .eq('club_id', clubId)
        .eq('parent_agent_id', parentAgent.id)

      // Enrich with profiles
      const subIds = (subAgents || []).map(a => a.user_id);
      let profiles = {};
      if (subIds.length > 0) {
        const { data: profs } = await supabaseAdmin
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', subIds)
              .limit(100);
        for (const p of (profs || [])) profiles[p.id] = p;
      }

      const enriched = (subAgents || []).map(a => ({
        ...a,
        profile: profiles[a.user_id] || null,
      }));

      return res.status(200).json({ success: true, subAgents: enriched });
    }

    // ═══════════════════════════════════════════════════════════════
    // SET PLAYER RAKEBACK — Agent sets rakeback % for their player
    // Max rakeback = agent_commission - 10%
    // e.g. Agent at 70% → max player rakeback is 60%
    // Default is 0 (no rakeback to players)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'set_player_rakeback') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId (player) required' });
      const { rakebackPercentage } = params;

      if (rakebackPercentage === undefined || rakebackPercentage === null) {
        return res.status(400).json({ error: 'rakebackPercentage required (0 to disable, or a decimal like 0.05 for 5%)' });
      }

      if (typeof rakebackPercentage !== 'number' || rakebackPercentage < 0 || rakebackPercentage > 1) {
        return res.status(400).json({ error: 'rakebackPercentage must be between 0 and 1' });
      }

      // Get the calling agent's record
      const { data: callerAgent } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, auto_rakeback_enabled, rakeback_percentage')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .eq('status', 'active')
        .single();

      if (!callerAgent) return res.status(403).json({ error: 'You are not an active agent in this club' });

      // Verify the target player belongs to this agent
      const { data: playerMember } = await supabaseAdmin
        .from('club_members')
        .select('user_id, role, agent_id')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!playerMember) return res.status(404).json({ error: 'Player not found in club' });
      if (playerMember.agent_id !== user.id) {
        return res.status(403).json({ error: 'This player is not assigned to you' });
      }

      // Enforce max rakeback = agent_commission - 10%
      const maxRakeback = Math.max(0, callerAgent.commission_rate - 0.10);

      if (rakebackPercentage > maxRakeback) {
        return res.status(400).json({
          error: `Rakeback too high. Your commission is ${(callerAgent.commission_rate * 100).toFixed(1)}%, so max player rakeback is ${(maxRakeback * 100).toFixed(1)}%`,
          your_commission: callerAgent.commission_rate,
          max_rakeback: maxRakeback,
          requested: rakebackPercentage,
        });
      }

      if (rakebackPercentage >= callerAgent.commission_rate) {
        return res.status(400).json({
          error: 'Rakeback must be LESS than your commission rate',
          your_commission: callerAgent.commission_rate,
          requested: rakebackPercentage,
        });
      }

      // Update the player's rakeback on the agent record
      // Store per-player rakeback in club_members
      await supabaseAdmin
        .from('club_members')
        .update({ player_rakeback_pct: rakebackPercentage })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      // Also update the agent-level default if this is their first time setting it
      if (!callerAgent.auto_rakeback_enabled && rakebackPercentage > 0) {
        await supabaseAdmin
          .from('agents')
          .update({
            auto_rakeback_enabled: true,
            rakeback_percentage: rakebackPercentage, // Sets agent default
          })
          .eq('id', callerAgent.id);
      }

      return res.status(200).json({
        success: true,
        action: 'player_rakeback_set',
        player: targetUserId,
        rakeback_percentage: rakebackPercentage,
        max_allowed: maxRakeback,
        agent_commission: callerAgent.commission_rate,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE COMMISSION — Change an agent's commission rate
    // Must re-validate all business rules
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update_commission') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
      const { commissionRate } = params;

      if (commissionRate === undefined || commissionRate === null) {
        return res.status(400).json({ error: 'commissionRate is REQUIRED' });
      }
      if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
        return res.status(400).json({ error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
      }

      const { data: targetAgent } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, parent_agent_id, rakeback_percentage')
        .eq('user_id', targetUserId)
        .eq('club_id', clubId)
        .single();

      if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });

      // If caller is agent (not owner/union admin), they can only update their own sub-agents
      if (club.owner_id !== user.id) {
        const { data: callerAgent } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .single();

        if (callerAgent && targetAgent.parent_agent_id !== callerAgent.id) {
          return res.status(403).json({ error: 'You can only update commission for your own sub-agents' });
        }
      }

      // If sub-agent, new rate must be less than parent
      if (targetAgent.parent_agent_id) {
        const { data: parentAgent } = await supabaseAdmin
          .from('agents')
          .select('commission_rate')
          .eq('id', targetAgent.parent_agent_id)
          .single();

        if (parentAgent && commissionRate >= parentAgent.commission_rate) {
          return res.status(400).json({
            error: 'Sub-agent rate must be less than parent agent rate',
            parent_rate: parentAgent.commission_rate,
            provided: commissionRate,
          });
        }
      }

      // Check sub-agents below — their rates must still be less than new rate
      const { data: subAgents } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate')
        .eq('club_id', clubId)
        .eq('parent_agent_id', targetAgent.id)
            .limit(100);

      for (const sub of (subAgents || [])) {
        if (sub.commission_rate >= commissionRate) {
          return res.status(400).json({
            error: `Cannot lower rate below sub-agent ${sub.user_id} who is at ${(sub.commission_rate * 100).toFixed(1)}%`,
            sub_agent_rate: sub.commission_rate,
            provided: commissionRate,
          });
        }
      }

      // Check rakeback — if agent had rakeback, new rate must allow it
      if (targetAgent.rakeback_percentage > 0) {
        const maxRakeback = commissionRate - 0.10;
        if (targetAgent.rakeback_percentage > maxRakeback) {
          return res.status(400).json({
            error: `Current rakeback (${(targetAgent.rakeback_percentage * 100).toFixed(1)}%) exceeds new max (${(maxRakeback * 100).toFixed(1)}%). Lower rakeback first.`,
          });
        }
      }

      await supabaseAdmin
        .from('agents')
        .update({ commission_rate: commissionRate })
        .eq('id', targetAgent.id);

      return res.status(200).json({
        success: true,
        action: 'commission_updated',
        targetUserId,
        old_rate: targetAgent.commission_rate,
        new_rate: commissionRate,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PROMOTE TO SUB-AGENT (agent self-service)
    // Agents can promote their own downline players to sub-agents.
    // No owner approval needed — fully automated.
    // ═══════════════════════════════════════════════════════════════
    if (action === 'promote_to_sub_agent') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
      const { commissionRate } = params;

      if (!commissionRate || typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
        return res.status(400).json({ error: 'commissionRate required (0.01 to 0.90)' });
      }

      // Verify caller is an active agent
      const { data: parentAgent } = await supabaseAdmin
        .from('agents')
        .select('id, user_id, commission_rate, status, agent_tier')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .eq('status', 'active')
        .single();

      if (!parentAgent) {
        return res.status(403).json({ error: 'You are not an active agent in this club' });
      }

      // Sub-agent commission must be lower than parent's
      if (commissionRate >= parentAgent.commission_rate) {
        return res.status(400).json({
          error: `Sub-agent commission (${(commissionRate * 100).toFixed(1)}%) must be lower than yours (${(parentAgent.commission_rate * 100).toFixed(1)}%)`,
          your_rate: parentAgent.commission_rate,
        });
      }

      // Verify target is a player assigned to this agent
      const { data: targetMember } = await supabaseAdmin
        .from('club_members')
        .select('user_id, role, agent_id')
        .eq('club_id', clubId)
        .eq('user_id', targetUserId)
        .single();

      if (!targetMember) return res.status(404).json({ error: 'Player not found in club' });
      if (targetMember.agent_id !== user.id) {
        return res.status(403).json({ error: 'This player is not in your downline' });
      }
      if (['agent', 'super_agent', 'sub_agent'].includes(targetMember.role)) {
        return res.status(400).json({ error: 'Player is already an agent' });
      }

      // Promote: update club_members role + create agents record
      const { error: roleErr } = await supabaseAdmin
        .from('club_members')
        .update({ role: 'sub_agent' })
        .eq('club_id', clubId)
        .eq('user_id', targetUserId);

      if (roleErr) throw roleErr;

      const { error: agentErr } = await supabaseAdmin
        .from('agents')
        .upsert({
          user_id: targetUserId,
          club_id: clubId,
          status: 'active',
          commission_rate: commissionRate,
          agent_tier: 'sub_agent',
          parent_agent_id: parentAgent.id,
          is_prepaid: false,
          credit_limit: 0,
        }, { onConflict: 'user_id,club_id' });

      if (agentErr) throw agentErr;

      // Reassign the player's existing downline players to the new sub-agent
      // (they keep their agent_id pointing to the parent, but the sub-agent manages them)

      return res.status(200).json({
        success: true,
        action: 'promoted_to_sub_agent',
        targetUserId,
        parentAgentId: user.id,
        commissionRate,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[manage-agent]', err);
    return res.status(500).json({ error: 'Agent management failed', details: err.message });
  }
}
