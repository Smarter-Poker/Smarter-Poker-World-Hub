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
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { validateManageAgent } from '../../../src/contracts/orb4_syndicate';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { notifyUser } from '../../../src/lib/club-arena/notify';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// All fields any action could possibly send
const ALLOWED_BODY_FIELDS = new Set([
  'clubId', 'action', 'targetUserId', 'playerId', 'parentAgentUserId',
  'commissionRate', 'agentTier', 'isPrepaid', 'creditLimit', 'parentAgentId',
  'rakebackPercentage', 'reassignTo', 'tier', 'nickname',
  'fromAgentId', 'toAgentId', 'newRole', 'forceReturn',
  // Phase 1 additions:
  'amount', 'notes', 'targetUserIds',
]);
const MAX_BODY_SIZE = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    if (!applyRateLimit(req, res, 'club-arena/manage-agent')) return;

    // RED TEAM: Payload size + field allowlist
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > MAX_BODY_SIZE) return res.status(413).json({ success: false, error: 'Request body too large' });
    const unknownFields = Object.keys(req.body || {}).filter(k => !ALLOWED_BODY_FIELDS.has(k));
    if (unknownFields.length > 0) return res.status(400).json({ success: false, error: `Unknown fields: ${unknownFields.join(', ')}` });

    // CONCURRENCY: Idempotency guard for mutation actions
    const mutationActions = ['promote', 'demote', 'suspend', 'reactivate', 'remove', 'change_role', 'set_parent_agent', 'promote_to_sub_agent', 'update_commission', 'transfer_to_agent', 'transfer_ownership', 'batch_suspend', 'batch_reactivate'];
    if (mutationActions.includes(req.body?.action)) {
      if (checkIdempotency(req, res)) return;
    }

    // RED TEAM: Zod Contract Validation (parity with settle-period + manage-union)
    const zodResult = validateManageAgent(req.body);
    if (!zodResult.success) {
      return res.status(400).json({ success: false, error: zodResult.error });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, action, targetUserId, ...params } = req.body;
    if (!clubId || !action) return res.status(400).json({ success: false, error: 'clubId and action required' });

    // UUID validation on all ID fields
    if (clubId && !UUID_RE.test(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });
    if (targetUserId && !UUID_RE.test(targetUserId)) return res.status(400).json({ success: false, error: 'Invalid targetUserId format' });
    if (params.playerId && !UUID_RE.test(params.playerId)) return res.status(400).json({ success: false, error: 'Invalid playerId format' });
    if (params.parentAgentUserId && !UUID_RE.test(params.parentAgentUserId)) return res.status(400).json({ success: false, error: 'Invalid parentAgentUserId format' });
    if (params.parentAgentId && params.parentAgentId !== null && !UUID_RE.test(params.parentAgentId)) return res.status(400).json({ success: false, error: 'Invalid parentAgentId format' });

    // Settlement lock — block chip-moving actions during settlement window
    const chipMovingActions = ['remove', 'promote', 'demote'];
    if (chipMovingActions.includes(action)) {
      const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
      if (lockCheck.locked) return sendLockedResponse(res, lockCheck);
    }

    try {
      // Verify authorization
      const { data: club } = await getSupabase()
        .from('clubs')
        .select('id, owner_id, union_id')
        .eq('id', clubId)
        .maybeSingle();
      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

      let authorized = club.owner_id === user.id;
      if (!authorized && club.union_id) {
        const { data: ua } = await getSupabase()
          .from('union_admins')
          .select('role')
          .eq('union_id', club.union_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (ua) {
            authorized = true;
        } else {
            // Owner fallback
            const { data: union } = await getSupabase().from('unions').select('id').eq('id', club.union_id).eq('owner_id', user.id).maybeSingle();
            if (union) authorized = true;
        }
      }

      // Agent-level actions — agents can call these for their own downline
      const agentActions = ['list_sub_agents', 'set_player_rakeback', 'update_commission', 'promote_to_sub_agent'];
      if (!authorized && agentActions.includes(action)) {
        // Check if caller is an active agent in this club
        const { data: callerAsAgent } = await getSupabase()
          .from('agents')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .maybeSingle();
        if (callerAsAgent) authorized = true;
      }

      if (!authorized) return res.status(403).json({ success: false, error: 'Not authorized' });

      // ═══════════════════════════════════════════════════════════════
      // PROMOTE: Player → Agent / Super Agent / Sub Agent
      // Commission rate MUST be explicitly set. No defaults.
      // Rakeback % to players must be < (agent commission - 10%)
      // ═══════════════════════════════════════════════════════════════
      if (action === 'promote') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

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
            success: false, error: 'commissionRate is REQUIRED before promoting to agent status',
            hint: 'Set a commission rate between 0.01 (1%) and 0.90 (90%)',
          });
        }

        if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
          return res.status(400).json({
            success: false, error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)',
            provided: commissionRate,
          });
        }

        // ─── VALIDATION: Agent tier ───
        const validTiers = ['super_agent', 'agent', 'sub_agent'];
        if (!validTiers.includes(agentTier)) {
          return res.status(400).json({ success: false, error: `agentTier must be one of: ${validTiers.join(', ')}` });
        }

        // ─── VALIDATION: Sub-agent requires parent and lower commission ───
        if (agentTier === 'sub_agent') {
          if (!parentAgentId) {
            return res.status(400).json({ success: false, error: 'parentAgentId is REQUIRED for sub_agent tier' });
          }

          const { data: parentAgent } = await getSupabase()
            .from('agents')
            .select('id, user_id, commission_rate, role')
            .eq('user_id', parentAgentId)
            .eq('club_id', clubId)
            .eq('status', 'active')
            .maybeSingle();

          if (!parentAgent) {
            return res.status(404).json({ success: false, error: 'Parent agent not found or not active in this club' });
          }
          if (parentAgent.role !== 'super_agent') {
            return res.status(403).json({ success: false, error: 'Only Super Agents can have sub-agents. Have the club owner promote them first.' });
          }

          // Store the agent RECORD id (not user_id) — all queries use agent.id
          params._parentAgentRecordId = parentAgent.id;

          if (commissionRate >= parentAgent.commission_rate) {
            return res.status(400).json({
              success: false, error: 'Sub-agent commission rate must be LESS than parent agent rate',
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
              success: false, error: 'Rakeback percentage must be LESS than agent commission rate',
              commission_rate: commissionRate,
              provided_rakeback: rakebackPercentage,
            });
          }
          if (rakebackPercentage > maxRakeback) {
            return res.status(400).json({
              success: false, error: `Rakeback cannot exceed agent commission minus 10%. Max allowed: ${(maxRakeback * 100).toFixed(1)}%`,
              commission_rate: commissionRate,
              max_rakeback: maxRakeback,
              provided_rakeback: rakebackPercentage,
            });
          }
        }

        // Get current membership
        const { data: member } = await getSupabase()
          .from('club_members')
          .select('id, role')  // BUG FIX: must include role — previously only 'id', making member.role always undefined
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!member) return res.status(404).json({ success: false, error: 'User not in club' });
        if (['agent', 'super_agent', 'sub_agent'].includes(member.role)) {
          return res.status(409).json({ success: false, error: `Already ${member.role}` });
        }

        // Update role in club_members
        const { error: err_club_members_mru22 } = await getSupabase()
          .from('club_members')
          .update({
            role: agentTier,
            credit_limit: isPrepaid ? 0 : creditLimit,
            agent_id: agentTier === 'sub_agent' ? parentAgentId : null,
          })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);
        if (err_club_members_mru22) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_mru22.message);

        // Create agent record
        const { data: agentRecord, error: agentErr } = await getSupabase()
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
          .maybeSingle();

        if (agentErr) throw agentErr;

        logAudit(supabaseAdmin, { actionType: 'agent_promoted', userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { agentId: agentRecord.id, agentTier, commissionRate, isPrepaid, rakebackPercentage: rakebackPercentage || 0 } });

        await notifyUser(supabaseAdmin, {
          userId: targetUserId,
          type: 'agent_promoted',
          title: 'Promoted to Agent',
          message: `You have been promoted to agent status with a ${commissionRate * 100}% commission rate.`,
          data: { clubId, agentTier }
        });

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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const { reassignTo } = params; // optional: another agent to receive the players

        // Get agent's players
        const { data: agentPlayers } = await getSupabase()
          .from('club_members')
          .select('user_id')
          .eq('club_id', clubId)
          .eq('agent_id', targetUserId)
          .limit(200);

        const playerCount = agentPlayers?.length || 0;

        // Reassign players
        if (playerCount > 0) {
          const { error: err_club_members_k50be } = await getSupabase()
            .from('club_members')
            .update({ agent_id: reassignTo || null })
            .eq('club_id', clubId)
            .eq('agent_id', targetUserId);
          if (err_club_members_k50be) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_k50be.message);

          // Update reassigned-to agent's player counts
          if (reassignTo) {
            const { data: newAgent } = await getSupabase()
              .from('agents')
              .select('id, active_player_count, total_players')
              .eq('user_id', reassignTo)
              .eq('club_id', clubId)
              .maybeSingle();
            if (newAgent) {
              const oldActive = newAgent.active_player_count || 0;
              const oldTotal = newAgent.total_players || 0;
              const { data: upd } = await getSupabase()
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
                const { data: freshA } = await getSupabase().from('agents').select('active_player_count, total_players').eq('id', newAgent.id).maybeSingle();
                if (freshA) {
                  const { error: err_agents_3yyvr } = await getSupabase().from('agents').update({
                    active_player_count: (freshA.active_player_count || 0) + playerCount,
                    total_players: (freshA.total_players || 0) + playerCount,
                  }).eq('id', newAgent.id);
                  if (err_agents_3yyvr) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_3yyvr.message);
                }
              }
            }
          }
        }

        // Demote in club_members
        const { error: err_club_members_zn75u } = await getSupabase()
          .from('club_members')
          .update({ role: 'player', credit_limit: 0 })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);
        if (err_club_members_zn75u) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_zn75u.message);

        // Deactivate agent record
        const { error: err_agents_fnkk7 } = await getSupabase()
          .from('agents')
          .update({ status: 'inactive', active_player_count: 0 })
          .eq('user_id', targetUserId)
          .eq('club_id', clubId);
        if (err_agents_fnkk7) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_fnkk7.message);

        logAudit(supabaseAdmin, { actionType: 'agent_demoted', userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { playersReassigned: playerCount, reassignedTo: reassignTo || 'unassigned' } });

        await notifyUser(supabaseAdmin, {
          userId: targetUserId,
          type: 'agent_demoted',
          title: 'Agent Status Revoked',
          message: 'Your agent status has been revoked and players reassigned.',
          data: { clubId }
        });

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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const { commissionRate, tier, isPrepaid, creditLimit, nickname } = params;
        const updates = {};
        const agentUpdates = {};

        if (commissionRate !== undefined) {
          // ── BUG #146 FIX: Validate commission rate (same rules as update_commission) ──
          // Without this, the generic 'update' action bypasses range checks,
          // sub-agent hierarchy rules, and rakeback ceiling enforcement.
          if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
            return res.status(400).json({ success: false, error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
          }

          // If this agent has a parent, new rate must be less than parent's
          const { data: tgtAgent } = await getSupabase()
            .from('agents')
            .select('id, parent_agent_id, rakeback_percentage')
            .eq('user_id', targetUserId)
            .eq('club_id', clubId)
            .maybeSingle();

          if (tgtAgent?.parent_agent_id) {
            const { data: parentAg } = await getSupabase().from('agents').select('commission_rate').eq('id', tgtAgent.parent_agent_id).maybeSingle();
            if (parentAg && commissionRate >= parentAg.commission_rate) {
              return res.status(400).json({ success: false, error: 'Sub-agent rate must be less than parent rate', parent_rate: parentAg.commission_rate });
            }
          }

          // Check sub-agents below won't be violated
          if (tgtAgent) {
            const { data: subAgents } = await getSupabase().from('agents').select('user_id, commission_rate').eq('club_id', clubId).eq('parent_agent_id', tgtAgent.id);
            for (const sub of (subAgents || [])) {
              if (sub.commission_rate >= commissionRate) {
                return res.status(400).json({ success: false, error: `Cannot lower below sub-agent ${sub.user_id} at ${(sub.commission_rate * 100).toFixed(1)}%` });
              }
            }

            // Check rakeback ceiling
            if ((tgtAgent.rakeback_percentage || 0) > 0) {
              const maxRb = commissionRate - 0.10;
              if (tgtAgent.rakeback_percentage > maxRb) {
                return res.status(400).json({ success: false, error: `Current rakeback (${(tgtAgent.rakeback_percentage * 100).toFixed(1)}%) exceeds new max (${(maxRb * 100).toFixed(1)}%). Lower rakeback first.` });
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

        if (Object.keys(updates || {}).length > 0) {
          const { error: err_club_members_5pr83 } = await getSupabase()
            .from('club_members')
            .update(updates)
            .eq('club_id', clubId)
            .eq('user_id', targetUserId);
          if (err_club_members_5pr83) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_5pr83.message);
        }

        if (Object.keys(agentUpdates || {}).length > 0) {
          const { error: err_agents_sqgtt } = await getSupabase()
            .from('agents')
            .update(agentUpdates)
            .eq('user_id', targetUserId)
            .eq('club_id', clubId);
          if (err_agents_sqgtt) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_sqgtt.message);
        }

        return res.status(200).json({ success: true, action: 'updated', updates: { ...updates, ...agentUpdates } });
      }

      // ═══════════════════════════════════════════════════════════════
      // REASSIGN: Move player between agents
      // ═══════════════════════════════════════════════════════════════
      if (action === 'reassign') {
        const { playerId, fromAgentId, toAgentId } = params;
        if (!playerId) {
          return res.status(400).json({ success: false, error: 'playerId required' });
        }

        // toAgentId can be null (un-assign from agent)
        const { error: err_club_members_b5fpq } = await getSupabase()
          .from('club_members')
          .update({ agent_id: toAgentId || null })
          .eq('club_id', clubId)
          .eq('user_id', playerId);
        if (err_club_members_b5fpq) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_b5fpq.message);

        // Update agent player counts
        if (fromAgentId) {
          const { data: fromAgent } = await getSupabase()
            .from('agents')
            .select('id, active_player_count')
            .eq('user_id', fromAgentId)
            .eq('club_id', clubId)
            .maybeSingle();
          if (fromAgent) {
            const { error: err_agents_h95h5 } = await getSupabase()
              .from('agents')
              .update({ active_player_count: Math.max(0, (fromAgent.active_player_count || 1) - 1) })
              .eq('id', fromAgent.id);
            if (err_agents_h95h5) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_h95h5.message);
          }
        }

        const { data: toAgent } = await getSupabase()
          .from('agents')
          .select('id, active_player_count, total_players')
          .eq('user_id', toAgentId)
          .eq('club_id', clubId)
          .maybeSingle();
        if (toAgent) {
          const { error: err_agents_scp5k } = await getSupabase()
            .from('agents')
            .update({
              active_player_count: (toAgent.active_player_count || 0) + 1,
              total_players: (toAgent.total_players || 0) + 1,
            })
            .eq('id', toAgent.id);
          if (err_agents_scp5k) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_scp5k.message);
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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const newStatus = action === 'suspend' ? 'suspended' : 'active';

        const { error: err_agents_55bom } = await getSupabase()

          .from('agents')

          .update({ status: newStatus })
          .eq('user_id', targetUserId)
          .eq('club_id', clubId);

        if (err_agents_55bom) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_55bom.message);

        const { error: err_club_members_a2gk5 } = await getSupabase()

          .from('club_members')

          .update({ status: newStatus })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);

        if (err_club_members_a2gk5) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_a2gk5.message);

        logAudit(supabaseAdmin, { actionType: `agent_${action}`, userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { newStatus } });

        const statusTitle = action === 'suspend' ? 'Account Suspended' : 'Account Reactivated';
        const statusMsg = action === 'suspend'
          ? 'Your agent account has been temporarily suspended by club management.'
          : 'Your agent account has been reactivated.';

        await notifyUser(supabaseAdmin, {
          userId: targetUserId,
          type: `agent_${action}`,
          title: statusTitle,
          message: statusMsg,
          data: { clubId, newStatus }
        });

        return res.status(200).json({ success: true, action, targetUserId, newStatus });
      }

      // ═══════════════════════════════════════════════════════════════
      // CHANGE_ROLE: General role change (owner/admin/agent/player)
      // Handles agent promotion/demotion transitions automatically
      // ═══════════════════════════════════════════════════════════════
      if (action === 'change_role') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const { newRole } = params;
        if (!newRole || !['admin', 'agent', 'player'].includes(newRole)) {
          return res.status(400).json({ success: false, error: 'newRole must be admin, agent, or player' });
        }

        const { data: targetMember } = await getSupabase()
          .from('club_members')
          .select('user_id, role, agent_id')
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!targetMember) return res.status(404).json({ success: false, error: 'Member not found' });
        if (targetMember.role === 'owner') {
          return res.status(403).json({ success: false, error: 'Cannot change the owner\'s role' });
        }

        const oldRole = targetMember.role;
        const updates = { role: newRole };

        const agentRoles = ['agent', 'sub_agent', 'super_agent'];

        // If demoting FROM agent role → clear downline assignments
        if (agentRoles.includes(oldRole) && !agentRoles.includes(newRole)) {
          const { error: err_club_members_enfjd } = await getSupabase()
            .from('club_members')
            .update({ agent_id: null })
            .eq('club_id', clubId)
            .eq('agent_id', targetUserId);
          if (err_club_members_enfjd) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_enfjd.message);

          // Deactivate agent record
          const { error: err_agents_iu87p } = await getSupabase()
            .from('agents')
            .update({ status: 'inactive', active_player_count: 0 })
            .eq('user_id', targetUserId)
            .eq('club_id', clubId);
          if (err_agents_iu87p) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_iu87p.message);
        }

        // If promoting TO agent → create agent record if needed
        if (newRole === 'agent' && !agentRoles.includes(oldRole)) {
          // Validate commission rate (same rules as 'promote' action)
          const cr = params.commissionRate;
          if (cr === undefined || cr === null) {
            return res.status(400).json({
              success: false, error: 'commissionRate is REQUIRED when promoting to agent via change_role',
              hint: 'Set a commission rate between 0.01 (1%) and 0.90 (90%)',
            });
          }
          if (typeof cr !== 'number' || cr < 0.01 || cr > 0.90) {
            return res.status(400).json({ success: false, error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
          }

          const { data: existingAgent } = await getSupabase()
            .from('agents')
            .select('id')
            .eq('user_id', targetUserId)
            .eq('club_id', clubId)
            .maybeSingle();

          if (existingAgent) {
            const { error: err_agents_05bir } = await getSupabase()
              .from('agents')
              .update({ status: 'active', role: 'agent', commission_rate: cr })
              .eq('id', existingAgent.id);
            if (err_agents_05bir) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_05bir.message);
          } else {
            const { error: err_agents_kedsv } = await getSupabase()
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
            if (err_agents_kedsv) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_kedsv.message);
          }
        }

        // Non-player roles shouldn't have an agent_id
        if (newRole !== 'player') {
          updates.agent_id = null;
        }

        const { error: err_club_members_j4lsk } = await getSupabase()

          .from('club_members')

          .update(updates)
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);

        if (err_club_members_j4lsk) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_j4lsk.message);

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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const { data: targetMember } = await getSupabase()
          .from('club_members')
          .select('user_id, role, chip_balance')
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!targetMember) return res.status(404).json({ success: false, error: 'Member not found' });
        if (targetMember.role === 'owner') {
          return res.status(403).json({ success: false, error: 'Cannot remove the club owner' });
        }

        // Only owner can remove admins
        if (targetMember.role === 'admin' && club.owner_id !== user.id) {
          return res.status(403).json({ success: false, error: 'Only the club owner can remove admins' });
        }

        // Prevent removing members with chip balance — return chips to treasury first
        const balance = targetMember.chip_balance || 0;
        if (balance > 0) {
          if (!params.forceReturn) {
            return res.status(400).json({
              success: false, error: `Member has ${balance.toLocaleString()} chips remaining. Set forceReturn:true to return chips to treasury and remove.`,
              chip_balance: balance,
            });
          }
          // Return chips to club treasury atomically
          const { error: debitErr } = await getSupabase().rpc('fn_debit_chips', {
            p_club_id: clubId,
            p_user_id: targetUserId,
            p_amount: balance,
          });

          if (debitErr) {
            console.warn('[manage-agent] Remove debit failed (possible race):', debitErr.message);
            // Don't credit treasury — chips weren't debited
          } else {
            // CRITICAL: capture credit error. The previous code ignored
            // fn_credit_treasury's return — if the credit failed, the
            // chips were already debited from the member but never
            // credited to treasury, vanishing into thin air. Now: log
            // loudly and try to undo the debit so a retry is clean.
            const { error: creditErr } = await getSupabase().rpc('fn_credit_treasury', {
              p_club_id: clubId,
              p_amount: balance,
            });
            if (creditErr) {
              console.warn('[manage-agent] CRITICAL: treasury credit of', balance, 'chips for removed member', targetUserId, 'in club', clubId, 'FAILED after debit succeeded:', creditErr?.message || creditErr);
              // Compensating refund: re-credit the member's wallet so the
              // chips aren't lost to the void. Member can then be removed
              // again once treasury is healthy.
              try {
                const { error: refundErr } = await getSupabase().rpc('fn_credit_chips', {
                  p_club_id: clubId,
                  p_user_id: targetUserId,
                  p_amount: balance,
                });
                if (refundErr) {
                  console.warn('[manage-agent] Member refund ALSO failed — chips lost:', refundErr?.message || refundErr);
                }
              } catch (rfErr) {
                console.warn('[manage-agent] Member refund threw:', rfErr?.message || rfErr);
              }
              return res.status(500).json({ success: false, error: 'Treasury credit failed — chips refunded, please retry' });
            }
            const { error: txErr } = await getSupabase().from('chip_transactions').insert({
              club_id: clubId,
              from_user_id: targetUserId,
              to_user_id: null,
              amount: balance,
              transaction_type: 'withdrawal',
              notes: `Member removed — ${balance.toLocaleString()} chips returned to club treasury`,
            });
            if (txErr) {
              console.warn('[manage-agent] chip_transactions insert failed (debit/credit succeeded):', txErr?.message || txErr);
            }
          }
        }

        // If removing an agent, clear downline + deactivate agent record
        if (['agent', 'sub_agent', 'super_agent'].includes(targetMember.role)) {
          const { error: err_club_members_xuqug } = await getSupabase()
            .from('club_members')
            .update({ agent_id: null })
            .eq('club_id', clubId)
            .eq('agent_id', targetUserId);
          if (err_club_members_xuqug) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_xuqug.message);

          const { error: err_agents_1c83s } = await getSupabase()

            .from('agents')

            .update({ status: 'inactive', active_player_count: 0 })
            .eq('user_id', targetUserId)
            .eq('club_id', clubId);

          if (err_agents_1c83s) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_1c83s.message);
        }

        // Delete membership
        const { error: delErr } = await getSupabase()
          .from('club_members')
          .delete()
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);

        if (delErr) throw delErr;

        // Update club member count
        const { count } = await getSupabase()
          .from('club_members')
          .select('*', { count: 'exact', head: true })
          .eq('club_id', clubId)

        const { error: err_clubs_p2is3 } = await getSupabase()

          .from('clubs')

          .update({ member_count: count || 0 })
          .eq('id', clubId);

        if (err_clubs_p2is3) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_p2is3.message);

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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required (the sub-agent)' });
        // Accept both parentAgentUserId (from admin.js) and parentAgentId (from older callers)
        const parentAgentId = req.body.parentAgentUserId || req.body.parentAgentId;

        // Get target agent record
        const { data: targetAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, parent_agent_id')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .maybeSingle();

        if (!targetAgent) return res.status(404).json({ success: false, error: 'Target agent not found' });

        // Resolve parentAgentId (user_id) to agent RECORD id for storage consistency
        let parentRecordId = null;
        if (parentAgentId) {
          const { data: parentAgent } = await getSupabase()
            .from('agents')
            .select('id, role')
            .eq('user_id', parentAgentId)
            .eq('club_id', clubId)
            .eq('status', 'active')
            .maybeSingle();
          if (!parentAgent) return res.status(404).json({ success: false, error: 'Parent agent not found' });
          if (parentAgent.role !== 'super_agent') {
            return res.status(403).json({ success: false, error: 'Only Super Agents can have sub-agents. Have the club owner promote them first.' });
          }
          parentRecordId = parentAgent.id;

          // ── MLM LOOP PREVENTION: Walk ancestor chain up to 10 levels ──
          // If the target agent appears in the proposed parent's ancestry, it's circular
          let walkId = parentRecordId;
          for (let depth = 0; depth < 10 && walkId; depth++) {
            if (walkId === targetAgent.id) {
              return res.status(400).json({
                success: false,
                error: 'Circular agent hierarchy detected — this assignment would create an infinite loop',
              });
            }
            const { data: ancestor } = await getSupabase()
              .from('agents').select('parent_agent_id').eq('id', walkId).maybeSingle();
            walkId = ancestor?.parent_agent_id || null;
          }
        }

        // If parentAgentId is null, remove parent (make standalone)
        const { error } = await getSupabase()
          .from('agents')
          .update({ parent_agent_id: parentRecordId })
          .eq('id', targetAgent.id);

        if (error) throw error;
        logAudit(supabaseAdmin, { actionType: 'parent_agent_set', userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { parentAgentId } });
        return res.status(200).json({ success: true, action: 'parent_set', parentAgentId });
      }

      // ═══════════════════════════════════════════════════════════════
      // LIST SUB-AGENTS (for a given parent agent)
      // ═══════════════════════════════════════════════════════════════
      if (action === 'list_sub_agents') {
        const { parentAgentUserId } = req.body;
        if (!parentAgentUserId) return res.status(400).json({ success: false, error: 'parentAgentUserId required' });

        // SECURITY FIX 2026-07-19: an agent may only list THEIR OWN sub-agents.
        // Previously any active agent could pass any parentAgentUserId and read
        // a peer's downline financials (business_balance, credit, earnings).
        // Owners and union admins may inspect any agent's tree.
        if (parentAgentUserId !== user.id && club.owner_id !== user.id) {
          let elevated = false;
          if (club.union_id) {
            const { data: ua } = await getSupabase()
              .from('union_admins')
              .select('user_id')
              .eq('union_id', club.union_id)
              .eq('user_id', user.id)
              .maybeSingle();
            elevated = !!ua;
          }
          if (!elevated) {
            return res.status(403).json({ success: false, error: 'You can only list your own sub-agents' });
          }
        }

        // Get parent agent record
        const { data: parentAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id')
          .eq('user_id', parentAgentUserId)
          .eq('club_id', clubId)
          .maybeSingle();

        if (!parentAgent) return res.status(404).json({ success: false, error: 'Parent agent not found' });

        // Get sub-agents
        const { data: subAgents } = await getSupabase()
          .from('agents')
          .select('id, user_id, commission_rate, status, active_player_count, total_players, lifetime_earnings, weekly_rake_generated, business_balance, credit_limit, credit_used')
          .eq('club_id', clubId)
          .eq('parent_agent_id', parentAgent.id)

        // Enrich with profiles
        const subIds = (subAgents || []).map(a => a.user_id);
        let profiles = {};
        if (subIds.length > 0) {
          const { data: profs } = await getSupabase()
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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId (player) required' });
        const { rakebackPercentage } = params;

        if (rakebackPercentage === undefined || rakebackPercentage === null) {
          return res.status(400).json({ success: false, error: 'rakebackPercentage required (0 to disable, or a decimal like 0.05 for 5%)' });
        }

        if (typeof rakebackPercentage !== 'number' || rakebackPercentage < 0 || rakebackPercentage > 1) {
          return res.status(400).json({ success: false, error: 'rakebackPercentage must be between 0 and 1' });
        }

        // Get the calling agent's record
        const { data: callerAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, commission_rate, auto_rakeback_enabled, rakeback_percentage')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .maybeSingle();

        if (!callerAgent) return res.status(403).json({ success: false, error: 'You are not an active agent in this club' });

        // Verify the target player belongs to this agent
        const { data: playerMember } = await getSupabase()
          .from('club_members')
          .select('user_id, role, agent_id')
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!playerMember) return res.status(404).json({ success: false, error: 'Player not found in club' });
        if (playerMember.agent_id !== user.id) {
          return res.status(403).json({ success: false, error: 'This player is not assigned to you' });
        }

        // Enforce max rakeback = agent_commission - 10%
        const maxRakeback = Math.max(0, callerAgent.commission_rate - 0.10);

        if (rakebackPercentage > maxRakeback) {
          return res.status(400).json({
            success: false, error: `Rakeback too high. Your commission is ${(callerAgent.commission_rate * 100).toFixed(1)}%, so max player rakeback is ${(maxRakeback * 100).toFixed(1)}%`,
            your_commission: callerAgent.commission_rate,
            max_rakeback: maxRakeback,
            requested: rakebackPercentage,
          });
        }

        if (rakebackPercentage >= callerAgent.commission_rate) {
          return res.status(400).json({
            success: false, error: 'Rakeback must be LESS than your commission rate',
            your_commission: callerAgent.commission_rate,
            requested: rakebackPercentage,
          });
        }

        // Update the player's rakeback on the agent record
        // Store per-player rakeback in club_members
        const { error: err_club_members_9r6y5 } = await getSupabase()
          .from('club_members')
          .update({ player_rakeback_pct: rakebackPercentage })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);
        if (err_club_members_9r6y5) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_9r6y5.message);

        // Also update the agent-level default if this is their first time setting it
        if (!callerAgent.auto_rakeback_enabled && rakebackPercentage > 0) {
          const { error: err_agents_ijqcj } = await getSupabase()
            .from('agents')
            .update({
              auto_rakeback_enabled: true,
              rakeback_percentage: rakebackPercentage, // Sets agent default
            })
            .eq('id', callerAgent.id);
          if (err_agents_ijqcj) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_ijqcj.message);
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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });
        const { commissionRate } = params;

        if (commissionRate === undefined || commissionRate === null) {
          return res.status(400).json({ success: false, error: 'commissionRate is REQUIRED' });
        }
        if (typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
          return res.status(400).json({ success: false, error: 'commissionRate must be between 0.01 (1%) and 0.90 (90%)' });
        }

        const { data: targetAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, commission_rate, parent_agent_id, rakeback_percentage')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .maybeSingle();

        if (!targetAgent) return res.status(404).json({ success: false, error: 'Agent not found' });

        // If caller is agent (not owner/union admin), they can only update their own sub-agents
        if (club.owner_id !== user.id) {
          const { data: callerAgent } = await getSupabase()
            .from('agents')
            .select('id')
            .eq('user_id', user.id)
            .eq('club_id', clubId)
            .eq('status', 'active')
            .maybeSingle();

          if (callerAgent && targetAgent.parent_agent_id !== callerAgent.id) {
            return res.status(403).json({ success: false, error: 'You can only update commission for your own sub-agents' });
          }
        }

        // If sub-agent, new rate must be less than parent
        if (targetAgent.parent_agent_id) {
          const { data: parentAgent } = await getSupabase()
            .from('agents')
            .select('commission_rate')
            .eq('id', targetAgent.parent_agent_id)
            .maybeSingle();

          if (parentAgent && commissionRate >= parentAgent.commission_rate) {
            return res.status(400).json({
              success: false, error: 'Sub-agent rate must be less than parent agent rate',
              parent_rate: parentAgent.commission_rate,
              provided: commissionRate,
            });
          }
        }

        // Check sub-agents below — their rates must still be less than new rate
        const { data: subAgents } = await getSupabase()
          .from('agents')
          .select('id, user_id, commission_rate')
          .eq('club_id', clubId)
          .eq('parent_agent_id', targetAgent.id)
          .limit(100);

        for (const sub of (subAgents || [])) {
          if (sub.commission_rate >= commissionRate) {
            return res.status(400).json({
              success: false, error: `Cannot lower rate below sub-agent ${sub.user_id} who is at ${(sub.commission_rate * 100).toFixed(1)}%`,
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
              success: false, error: `Current rakeback (${(targetAgent.rakeback_percentage * 100).toFixed(1)}%) exceeds new max (${(maxRakeback * 100).toFixed(1)}%). Lower rakeback first.`,
            });
          }
        }

        const { error: err_agents_8o785 } = await getSupabase()

          .from('agents')

          .update({ commission_rate: commissionRate })
          .eq('id', targetAgent.id);

        if (err_agents_8o785) console.warn('[Supabase] Silent mutation failed in agents:', err_agents_8o785.message);

        logAudit(supabaseAdmin, { actionType: 'commission_updated', userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { oldRate: targetAgent.commission_rate, newRate: commissionRate } });
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
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });
        const { commissionRate } = params;

        if (!commissionRate || typeof commissionRate !== 'number' || commissionRate < 0.01 || commissionRate > 0.90) {
          return res.status(400).json({ success: false, error: 'commissionRate required (0.01 to 0.90)' });
        }

        // Verify caller is an active agent
        const { data: parentAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, commission_rate, status, agent_tier, role')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .maybeSingle();

        if (!parentAgent) {
          return res.status(403).json({ success: false, error: 'You are not an active agent in this club' });
        }
        if (parentAgent.role !== 'super_agent' && parentAgent.agent_tier !== 'super_agent') {
          return res.status(403).json({ success: false, error: 'Only Super Agents can create sub-agents. Contact a club owner to be promoted first.' });
        }

        // Sub-agent commission must be lower than parent's
        if (commissionRate >= parentAgent.commission_rate) {
          return res.status(400).json({
            success: false, error: `Sub-agent commission (${(commissionRate * 100).toFixed(1)}%) must be lower than yours (${(parentAgent.commission_rate * 100).toFixed(1)}%)`,
            your_rate: parentAgent.commission_rate,
          });
        }

        // Verify target is a player assigned to this agent
        const { data: targetMember } = await getSupabase()
          .from('club_members')
          .select('user_id, role, agent_id')
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!targetMember) return res.status(404).json({ success: false, error: 'Player not found in club' });
        if (targetMember.agent_id !== user.id) {
          return res.status(403).json({ success: false, error: 'This player is not in your downline' });
        }
        if (['agent', 'super_agent', 'sub_agent'].includes(targetMember.role)) {
          return res.status(400).json({ success: false, error: 'Player is already an agent' });
        }

        // Promote: update club_members role + create agents record
        const { error: roleErr } = await getSupabase()
          .from('club_members')
          .update({ role: 'sub_agent' })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);

        if (roleErr) throw roleErr;

        const { error: agentErr } = await getSupabase()
          .from('agents')
          .upsert({
            user_id: targetUserId,
            club_id: clubId,
            status: 'active',
            commission_rate: commissionRate,
            role: 'sub_agent',
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

      // ═══════════════════════════════════════════════════════════════
      // AUTO PROMOTE CHECK — Evaluate if agent meets promotion thresholds
      // Read-only check. Returns recommendation, no auto-action.
      // ═══════════════════════════════════════════════════════════════
      if (action === 'auto_promote_check') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

        const { data: checkAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, role, commission_rate, active_player_count, total_players, weekly_rake_generated, lifetime_earnings, status')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .maybeSingle();
        if (!checkAgent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const thresholds = {
          super_agent: { minPlayers: 20, minRake: 10000, minRate: 0.50 },
          agent: { minPlayers: 10, minRake: 5000, minRate: 0.30 },
          sub_agent: { minPlayers: 3, minRake: 1000, minRate: 0.10 },
        };

        const playerCount = checkAgent.active_player_count || 0;
        const rakeGenerated = checkAgent.weekly_rake_generated || 0;
        const currentRole = checkAgent.role || 'agent';

        // Determine next tier
        let recommendation = null;
        let reason = null;
        const checks = [];

        if (currentRole === 'agent' || currentRole === 'sub_agent') {
          const t = thresholds.super_agent;
          const meetsPlayers = playerCount >= t.minPlayers;
          const meetsRake = rakeGenerated >= t.minRake;
          checks.push(
            { criterion: 'Players', required: t.minPlayers, actual: playerCount, met: meetsPlayers },
            { criterion: 'Weekly Rake', required: t.minRake, actual: rakeGenerated, met: meetsRake },
          );
          if (meetsPlayers && meetsRake) {
            recommendation = 'super_agent';
            reason = `Agent has ${playerCount} players and generates $${rakeGenerated.toLocaleString()}/week.`;
          }
        }

        if (!recommendation && currentRole === 'sub_agent') {
          const t = thresholds.agent;
          const meetsPlayers = playerCount >= t.minPlayers;
          const meetsRake = rakeGenerated >= t.minRake;
          checks.push(
            { criterion: 'Players (Agent)', required: t.minPlayers, actual: playerCount, met: meetsPlayers },
            { criterion: 'Weekly Rake (Agent)', required: t.minRake, actual: rakeGenerated, met: meetsRake },
          );
          if (meetsPlayers && meetsRake) {
            recommendation = 'agent';
            reason = `Sub-agent qualifies for promotion to Agent.`;
          }
        }

        return res.status(200).json({
          success: true,
          action: 'auto_promote_check',
          currentRole,
          recommendation,
          reason: reason || 'Agent does not currently meet promotion thresholds.',
          checks,
          agent: {
            userId: checkAgent.user_id,
            playerCount,
            weeklyRake: rakeGenerated,
            lifetimeEarnings: checkAgent.lifetime_earnings || 0,
          },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // TRANSFER TO AGENT — Horizontal agent-to-agent chip transfer
      // Validates both agents are in same club, debits sender → credits receiver
      // ═══════════════════════════════════════════════════════════════
      if (action === 'transfer_to_agent') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId (receiving agent) required' });
        const { amount, notes } = params;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'amount must be positive' });

        // Verify caller is an active agent
        const { data: senderAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, status')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .maybeSingle();
        if (!senderAgent) return res.status(403).json({ success: false, error: 'You are not an active agent in this club' });

        // Verify target is also an active agent in same club
        const { data: receiverAgent } = await getSupabase()
          .from('agents')
          .select('id, user_id, status')
          .eq('user_id', targetUserId)
          .eq('club_id', clubId)
          .eq('status', 'active')
          .maybeSingle();
        if (!receiverAgent) return res.status(404).json({ success: false, error: 'Target agent not found or not active in this club' });
        if (receiverAgent.user_id === user.id) return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });

        // Check sender has enough chip balance
        const { data: senderMember } = await getSupabase()
          .from('club_members')
          .select('chip_balance')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!senderMember || (senderMember.chip_balance || 0) < amount) {
          return res.status(400).json({ success: false, error: 'Insufficient chip balance', balance: senderMember?.chip_balance || 0, requested: amount });
        }

        // Debit sender
        const { error: debitErr } = await getSupabase().rpc('fn_debit_chips', {
          p_club_id: clubId, p_user_id: user.id, p_amount: amount,
        });
        if (debitErr) {
          return res.status(500).json({ success: false, error: 'Debit failed: ' + debitErr.message });
        }

        // Credit receiver
        const { error: creditErr } = await getSupabase().rpc('fn_credit_chips', {
          p_club_id: clubId, p_user_id: targetUserId, p_amount: amount,
        });
        if (creditErr) {
          // Rollback: re-credit sender
          const { error: rollbackErr } = await getSupabase().rpc('fn_credit_chips', { p_club_id: clubId, p_user_id: user.id, p_amount: amount });
          if (rollbackErr) console.warn('[App] Handled promise rejection:', rollbackErr.message);
          return res.status(500).json({ success: false, error: 'Credit failed, transfer rolled back' });
        }

        // Record transaction
        const { error: txErr } = await getSupabase().from('chip_transactions').insert({
          club_id: clubId,
          from_user_id: user.id,
          to_user_id: targetUserId,
          amount,
          transaction_type: 'agent_transfer',
          notes: notes || `Agent-to-Agent transfer`,
          metadata: { sender_agent_id: senderAgent.id, receiver_agent_id: receiverAgent.id },
        });
        if (txErr) console.warn('[manage-agent] Failed to log agent transfer tx:', txErr.message);

        logAudit(supabaseAdmin, { actionType: 'agent_transfer', userId: user.id, targetUserId, clubId, amount, ip: extractIP(req), details: { notes } });
        return res.status(200).json({ success: true, action: 'transfer_complete', amount, from: user.id, to: targetUserId });
      }

      // ═══════════════════════════════════════════════════════════════
      // TRANSFER OWNERSHIP — Delegate club ownership to another member
      // Only current owner can execute. Target must be a club member.
      // ═══════════════════════════════════════════════════════════════
      if (action === 'transfer_ownership') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });
        if (club.owner_id !== user.id) {
          return res.status(403).json({ success: false, error: 'Only the current club owner can transfer ownership' });
        }
        if (targetUserId === user.id) {
          return res.status(400).json({ success: false, error: 'You are already the owner' });
        }

        // Verify target is a club member
        const { data: targetMember } = await getSupabase()
          .from('club_members')
          .select('user_id, role')
          .eq('club_id', clubId)
          .eq('user_id', targetUserId)
          .maybeSingle();
        if (!targetMember) return res.status(404).json({ success: false, error: 'Target user is not a member of this club' });

        // Update club owner
        const { error: ownerErr } = await getSupabase()
          .from('clubs')
          .update({ owner_id: targetUserId })
          .eq('id', clubId);
        if (ownerErr) throw ownerErr;

        // Promote new owner to 'owner' role
        const { error: err_club_members_r4gr0 } = await getSupabase()
          .from('club_members')
          .update({ role: 'owner' })
          .eq('club_id', clubId)
          .eq('user_id', targetUserId);
        if (err_club_members_r4gr0) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_r4gr0.message);

        // Demote old owner to 'admin'
        const { error: err_club_members_khgyo } = await getSupabase()
          .from('club_members')
          .update({ role: 'admin' })
          .eq('club_id', clubId)
          .eq('user_id', user.id);
        if (err_club_members_khgyo) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_khgyo.message);

        logAudit(supabaseAdmin, { actionType: 'ownership_transferred', userId: user.id, targetUserId, clubId, ip: extractIP(req), details: { oldOwner: user.id, newOwner: targetUserId } });
        await notifyUser(supabaseAdmin, {
          userId: targetUserId, type: 'ownership_transfer',
          title: '👑 Club Ownership Transferred',
          message: `You are now the owner of this club. The previous owner has been moved to admin role.`,
          data: { clubId },
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

        return res.status(200).json({ success: true, action: 'ownership_transferred', newOwner: targetUserId, oldOwner: user.id });
      }

      // ═══════════════════════════════════════════════════════════════
      // BATCH SUSPEND / REACTIVATE — Bulk agent operations
      // Accepts targetUserIds[] array (max 50), processes each.
      // ═══════════════════════════════════════════════════════════════
      if (action === 'batch_suspend' || action === 'batch_reactivate') {
        const { targetUserIds } = params;
        if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
          return res.status(400).json({ success: false, error: 'targetUserIds array required' });
        }
        if (targetUserIds.length > 50) {
          return res.status(400).json({ success: false, error: 'Maximum 50 agents per batch operation' });
        }
        if (club.owner_id !== user.id) {
          return res.status(403).json({ success: false, error: 'Only the club owner can perform batch operations' });
        }

        const newStatus = action === 'batch_suspend' ? 'suspended' : 'active';
        const fromStatus = action === 'batch_suspend' ? 'active' : 'suspended';
        const results = { success: [], failed: [] };

        for (const uid of targetUserIds) {
          try {
            const { error: agentErr } = await getSupabase()
              .from('agents')
              .update({ status: newStatus })
              .eq('club_id', clubId)
              .eq('user_id', uid)
              .eq('status', fromStatus);

            if (agentErr) { results.failed.push({ userId: uid, error: agentErr.message }); continue; }

            // Sync club_members status
            if (action === 'batch_suspend') {
              const { error: err_club_members_xg5zp } = await getSupabase()
                .from('club_members')
                .update({ role: 'suspended' })
                .eq('club_id', clubId)
                .eq('user_id', uid);
              if (err_club_members_xg5zp) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_xg5zp.message);
            } else {
              const { error: err_club_members_4r91e } = await getSupabase()
                .from('club_members')
                .update({ role: 'agent' })
                .eq('club_id', clubId)
                .eq('user_id', uid);
              if (err_club_members_4r91e) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_4r91e.message);
            }

            results.success.push(uid);
          } catch (e) {
            results.failed.push({ userId: uid, error: e.message });
          }
        }

        logAudit(supabaseAdmin, { actionType: action, userId: user.id, clubId, ip: extractIP(req), details: { count: results.success.length, failed: results.failed.length } });
        return res.status(200).json({
          success: true,
          action,
          processed: results.success.length,
          failed: results.failed.length,
          results,
        });
      }


      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    } catch (err) {
      console.warn('[manage-agent]', err);
      return res.status(500).json({ success: false, error: 'Agent management failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
