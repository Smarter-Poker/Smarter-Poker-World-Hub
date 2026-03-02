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

  let callerUserId = null;
  if (token && !validEngineKey) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    callerUserId = user.id;
  }

  const { clubId, tableId, userId, action, amount } = req.body;
  if (!clubId || !userId || !action || amount === undefined || amount <= 0) {
    return res.status(400).json({ error: 'clubId, userId, action, and positive amount required' });
  }

  if (!['lock', 'unlock', 'rebuy'].includes(action)) {
    return res.status(400).json({ error: 'action must be lock, unlock, or rebuy' });
  }

  // JWT callers can only operate on themselves unless they're club admin
  if (callerUserId && callerUserId !== userId) {
    const { data: callerMember } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', callerUserId)
      .single();
    if (!callerMember || !['owner', 'admin', 'manager'].includes(callerMember.role)) {
      return res.status(403).json({ error: 'Cannot operate on another user\'s chips' });
    }
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  try {
    if (action === 'lock' || action === 'rebuy') {
      // Atomic debit via RPC — no read-modify-write race
      const { data: result, error: rpcErr } = await supabaseAdmin.rpc('lock_chips_for_table', {
        p_user_id: userId,
        p_club_id: clubId,
        p_table_id: tableId || null,
        p_amount: amount,
      });

      if (rpcErr) throw rpcErr;
      if (!result?.success) {
        return res.status(400).json({
          error: result?.error || 'Insufficient chips',
          available: result?.balance,
          requested: amount,
        });
      }

      // Record transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: userId,
        to_user_id: userId,
        amount: -amount,
        transaction_type: 'table_lock',
        notes: `${action === 'rebuy' ? 'Rebuy' : 'Table buy-in'}: ${amount} chips locked for table ${tableId || 'unknown'}`,
      });

      return res.status(200).json({
        success: true,
        action,
        locked: amount,
        remainingBalance: result.balance_after,
        tableId,
      });

    } else if (action === 'unlock') {
      // Atomic unlock via RPC
      const { data: result, error: rpcErr } = await supabaseAdmin.rpc('unlock_chips_from_table', {
        p_user_id: userId,
        p_club_id: clubId,
        p_table_id: tableId || null,
        p_amount: amount,
      });

      if (rpcErr) throw rpcErr;

      // Record transaction
      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        from_user_id: userId,
        to_user_id: userId,
        amount,
        transaction_type: 'table_unlock',
        notes: `Table cash-out: ${amount} chips unlocked from table ${tableId || 'unknown'}`,
      });

      return res.status(200).json({
        success: true,
        action: 'unlocked',
        returned: amount,
        newBalance: result?.balance_after,
        tableId,
      });
    }
  } catch (err) {
    console.error('[table-chips]', err);
    return res.status(500).json({ error: 'Table chip operation failed', details: err.message });
  }
}
