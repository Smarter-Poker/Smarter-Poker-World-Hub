/**
 * POST /api/club-arena/table-chips
 * 
 * Manages chip locks when players sit at or leave poker tables.
 * Called by the poker engine.
 * 
 * Actions:
 *   'lock'   - Player sits down: deducts from club_members.chip_balance, 
 *              records as locked for table play
 *   'unlock' - Player stands up: returns remaining chips to chip_balance
 *   'rebuy'  - Player rebuys at table: additional lock from balance
 * 
 * Body: { clubId, tableId, userId, action: 'lock'|'unlock'|'rebuy', amount }
 * Auth: x-engine-key header or Bearer token
 */
import { createClient } from '@supabase/supabase-js';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Accept engine key or bearer token
  const engineKey = req.headers['x-engine-key'];
  const token = req.headers.authorization?.replace('Bearer ', '');
  const validEngineKey = engineKey && process.env.ENGINE_INTERNAL_SECRET && engineKey === process.env.ENGINE_INTERNAL_SECRET;
  if (!validEngineKey && !token) return res.status(401).json({ error: 'Auth required' });

  if (token && !validEngineKey) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  }

  const { clubId, tableId, userId, action, amount } = req.body;
  if (!clubId || !userId || !action || amount === undefined) {
    return res.status(400).json({ error: 'clubId, userId, action, and amount required' });
  }

  if (!['lock', 'unlock', 'rebuy'].includes(action)) {
    return res.status(400).json({ error: 'action must be lock, unlock, or rebuy' });
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  try {
    // Get current membership
    const { data: member, error: memErr } = await supabaseAdmin
      .from('club_members')
      .select('user_id, chip_balance, role')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .single();

    if (memErr || !member) {
      return res.status(404).json({ error: 'Player not found in club' });
    }

    if (action === 'lock' || action === 'rebuy') {
      // Deduct chips from balance (player buying in / rebuying at table)
      if (amount > member.chip_balance) {
        return res.status(400).json({
          error: 'Insufficient chips',
          available: member.chip_balance,
          requested: amount,
        });
      }

      const newBalance = member.chip_balance - amount;
      const { error: updateErr } = await supabaseAdmin
        .from('club_members')
        .update({ chip_balance: newBalance })
        .eq('club_id', clubId)
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      // Record transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: userId,
        to_user_id: userId,
        amount: -amount,
        transaction_type: 'send',
        notes: `${action === 'rebuy' ? 'Rebuy' : 'Table buy-in'}: ${amount.toLocaleString()} chips locked for table ${tableId || 'unknown'}`,
      });

      return res.status(200).json({
        success: true,
        action,
        locked: amount,
        remainingBalance: newBalance,
        tableId,
      });

    } else if (action === 'unlock') {
      // Return chips to player balance (player leaving table with remaining stack)
      const newBalance = member.chip_balance + amount;
      const { error: updateErr } = await supabaseAdmin
        .from('club_members')
        .update({ chip_balance: newBalance })
        .eq('club_id', clubId)
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      // Record transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: userId,
        to_user_id: userId,
        amount,
        transaction_type: 'send',
        notes: `Table cash-out: ${amount.toLocaleString()} chips unlocked from table ${tableId || 'unknown'}`,
      });

      return res.status(200).json({
        success: true,
        action: 'unlocked',
        returned: amount,
        newBalance,
        tableId,
      });
    }
  } catch (err) {
    console.error('[table-chips]', err);
    return res.status(500).json({ error: 'Table chip operation failed', details: err.message });
  }
}
