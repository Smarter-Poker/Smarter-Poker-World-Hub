/**
 * POST /api/club-arena/distribute-chips
 * 
 * Agent distributes chips to a player in their downline.
 * Atomic: deducts from agent's club_members.chip_balance, adds to player's.
 * Records chip_transaction.
 * 
 * Body: { clubId, playerId, amount, notes? }
 * Auth: Bearer token (must be agent with player in downline)
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

  // Verify the calling user
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, playerId, amount, notes } = req.body;
  if (!clubId || !playerId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'clubId, playerId, and positive amount required' });
  }

  try {
    // 1. Verify agent membership and role
    const { data: agentMember, error: agentErr } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, nickname')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (agentErr || !agentMember) {
      return res.status(403).json({ error: 'Not a member of this club' });
    }
    if (!['agent', 'owner', 'admin'].includes(agentMember.role)) {
      return res.status(403).json({ error: 'Only agents/owners can distribute chips' });
    }

    // 2. Verify player is in agent's downline (or caller is owner/admin)
    const { data: playerMember, error: playerErr } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, agent_id, nickname')
      .eq('club_id', clubId)
      .eq('user_id', playerId)
      .single();

    if (playerErr || !playerMember) {
      return res.status(404).json({ error: 'Player not found in club' });
    }

    // Agents can only distribute to their own downline; owners/admins can distribute to anyone
    if (agentMember.role === 'agent' && playerMember.agent_id !== user.id) {
      return res.status(403).json({ error: 'Player is not in your downline' });
    }

    // 3. Check agent has enough chips
    if (agentMember.chip_balance < amount) {
      return res.status(400).json({
        error: 'Insufficient chips',
        available: agentMember.chip_balance,
        requested: amount
      });
    }

    // 4. Atomic transfer: deduct from agent, add to player
    const { error: deductErr } = await supabaseAdmin
      .from('club_members')
      .update({ chip_balance: agentMember.chip_balance - amount })
      .eq('club_id', clubId)
      .eq('user_id', user.id);

    if (deductErr) throw deductErr;

    const { error: addErr } = await supabaseAdmin
      .from('club_members')
      .update({ chip_balance: playerMember.chip_balance + amount })
      .eq('club_id', clubId)
      .eq('user_id', playerId);

    if (addErr) {
      // Rollback: restore agent's chips
      await supabaseAdmin
        .from('club_members')
        .update({ chip_balance: agentMember.chip_balance })
        .eq('club_id', clubId)
        .eq('user_id', user.id);
      throw addErr;
    }

    // 5. Record transaction (keep ID for 10-min clawback window)
    const { data: txn } = await supabaseAdmin.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: user.id,
      to_user_id: playerId,
      amount,
      transaction_type: 'send',
      notes: notes || `Chips from ${agentMember.nickname || 'agent'} to ${playerMember.nickname || 'player'}`,
    }).select('id, created_at').single();

    return res.status(200).json({
      success: true,
      transactionId: txn?.id,
      agentBalance: agentMember.chip_balance - amount,
      playerBalance: playerMember.chip_balance + amount,
      amount,
      clawbackExpiresAt: txn?.created_at
        ? new Date(new Date(txn.created_at).getTime() + 10 * 60 * 1000).toISOString()
        : null,
    });
  } catch (err) {
    console.error('[distribute-chips]', err);
    return res.status(500).json({ error: 'Distribution failed', details: err.message });
  }
}
