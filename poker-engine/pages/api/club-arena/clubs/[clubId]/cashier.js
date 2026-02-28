/**
 * /api/club-arena/clubs/[clubId]/cashier — Chip management
 * 
 * POST { action: "credit", memberId, amount, note? }
 * POST { action: "debit", memberId, amount, note? }
 * POST { action: "set_credit_limit", memberId, creditLimit }
 * POST { action: "set_role", memberId, role }
 * GET  → Transaction history
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function getMembership(clubId, userId) {
  const { data } = await supabase
    .from('club_members')
    .select('id, role, chip_balance, status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return data;
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId } = req.query;
  const membership = await getMembership(clubId, user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member' });

  if (req.method === 'GET') {
    // Transaction history
    const { memberId, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('club_transactions')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Players can only see own transactions
    if (membership.role === 'player') {
      query = query.eq('member_id', membership.id);
    } else if (memberId) {
      query = query.eq('member_id', memberId);
    }

    const { data: transactions, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ transactions: transactions || [] });
  }

  if (req.method === 'POST') {
    const { action, memberId, amount, note, role, creditLimit } = req.body;

    // Only owner/agent can manage chips
    if (membership.role === 'player') {
      return res.status(403).json({ error: 'Only owners and agents can manage chips' });
    }

    if (action === 'credit') {
      // Grant chips to a member
      if (!memberId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'memberId and positive amount required' });
      }

      try {
        const { data: newBalance } = await supabase.rpc('transfer_chips', {
          p_member_id: memberId,
          p_amount: Math.floor(amount),
          p_type: 'chip_grant',
          p_club_id: clubId,
          p_performed_by: user.id,
          p_note: note || 'Chips credited',
        });

        return res.json({ success: true, newBalance });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (action === 'debit') {
      // Remove chips from a member
      if (!memberId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'memberId and positive amount required' });
      }

      try {
        const { data: newBalance } = await supabase.rpc('transfer_chips', {
          p_member_id: memberId,
          p_amount: -Math.floor(amount),
          p_type: 'chip_revoke',
          p_club_id: clubId,
          p_performed_by: user.id,
          p_note: note || 'Chips debited',
        });

        return res.json({ success: true, newBalance });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (action === 'set_credit_limit') {
      if (!memberId || creditLimit === undefined) {
        return res.status(400).json({ error: 'memberId and creditLimit required' });
      }

      await supabase
        .from('club_members')
        .update({ credit_limit: Math.max(0, Math.floor(creditLimit)) })
        .eq('id', memberId)
        .eq('club_id', clubId);

      return res.json({ success: true });
    }

    if (action === 'set_role') {
      if (!memberId || !role) {
        return res.status(400).json({ error: 'memberId and role required' });
      }
      if (!['player', 'agent'].includes(role)) {
        return res.status(400).json({ error: 'Role must be player or agent' });
      }
      // Only owner can set roles
      if (membership.role !== 'owner') {
        return res.status(403).json({ error: 'Only owner can change roles' });
      }

      await supabase
        .from('club_members')
        .update({ role })
        .eq('id', memberId)
        .eq('club_id', clubId);

      return res.json({ success: true });
    }

    if (action === 'kick') {
      if (!memberId) return res.status(400).json({ error: 'memberId required' });
      if (membership.role !== 'owner') {
        return res.status(403).json({ error: 'Only owner can remove members' });
      }

      await supabase
        .from('club_members')
        .update({ status: 'banned' })
        .eq('id', memberId)
        .eq('club_id', clubId);

      return res.json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
