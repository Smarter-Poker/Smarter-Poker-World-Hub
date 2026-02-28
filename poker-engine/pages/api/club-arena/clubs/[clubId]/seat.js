/**
 * /api/club-arena/clubs/[clubId]/seat — Sit down / stand up at a club table
 * 
 * POST { action: "sit", tableId, seatIndex, buyIn }
 *   → Deducts buyIn from club chip_balance, seats player in engine
 * 
 * POST { action: "stand", tableId }
 *   → Credits remaining stack back to chip_balance, removes from engine
 * 
 * POST { action: "rebuy", tableId, amount }
 *   → Adds chips mid-session (deducts from balance)
 */

import { createClient } from '@supabase/supabase-js';
import { getController } from '../../../../src/GameController';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function getMembership(clubId, userId) {
  const { data } = await supabase
    .from('club_members')
    .select('id, role, chip_balance, nickname, status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return data;
}

async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .single();
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId } = req.query;
  const { action, tableId, seatIndex, buyIn, amount } = req.body;

  const membership = await getMembership(clubId, user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member of this club' });

  const controller = await getController();

  // ═══════════════════════════════════════════════════════
  // SIT DOWN — Buy in to a table
  // ═══════════════════════════════════════════════════════
  if (action === 'sit') {
    if (!tableId || seatIndex === undefined || !buyIn) {
      return res.status(400).json({ error: 'tableId, seatIndex, and buyIn required' });
    }

    const buyInAmount = Math.floor(buyIn);
    if (buyInAmount <= 0) {
      return res.status(400).json({ error: 'Buy-in must be positive' });
    }

    // Check balance
    if (membership.chip_balance < buyInAmount) {
      return res.status(400).json({ 
        error: 'Insufficient chip balance',
        balance: membership.chip_balance,
        required: buyInAmount,
      });
    }

    // Verify table belongs to this club
    const { data: table } = await supabase
      .from('club_tables')
      .select('id, min_buy_in, max_buy_in, status')
      .eq('id', tableId)
      .eq('club_id', clubId)
      .single();

    if (!table) return res.status(404).json({ error: 'Table not found in this club' });
    if (table.status === 'closed') return res.status(400).json({ error: 'Table is closed' });

    // Validate buy-in range
    if (buyInAmount < table.min_buy_in) {
      return res.status(400).json({ error: `Minimum buy-in is ${table.min_buy_in}` });
    }
    if (buyInAmount > table.max_buy_in) {
      return res.status(400).json({ error: `Maximum buy-in is ${table.max_buy_in}` });
    }

    // Deduct from club balance (atomic)
    try {
      const { data: newBalance, error: transferErr } = await supabase.rpc('transfer_chips', {
        p_member_id: membership.id,
        p_amount: -buyInAmount,
        p_type: 'cash_buyin',
        p_club_id: clubId,
        p_performed_by: user.id,
        p_table_id: tableId,
        p_note: `Buy-in at table`,
      });

      if (transferErr) {
        return res.status(400).json({ error: transferErr.message || 'Transfer failed' });
      }

      // Get player display info
      const profile = await getProfile(user.id);
      const displayName = membership.nickname || profile?.display_name || 'Player';
      const avatarUrl = profile?.avatar_url || null;

      // Seat in engine
      const engineResult = await controller.sitDown(
        tableId,
        user.id,
        parseInt(seatIndex),
        buyInAmount,
        { displayName, avatarUrl }
      );

      if (!engineResult.success) {
        // Refund the chips
        await supabase.rpc('transfer_chips', {
          p_member_id: membership.id,
          p_amount: buyInAmount,
          p_type: 'cash_cashout',
          p_club_id: clubId,
          p_performed_by: user.id,
          p_table_id: tableId,
          p_note: 'Refund - failed to seat',
        });

        return res.status(400).json({ error: engineResult.error || 'Failed to seat' });
      }

      return res.json({
        success: true,
        seatIndex: parseInt(seatIndex),
        buyIn: buyInAmount,
        remainingBalance: typeof newBalance === 'number' ? newBalance : membership.chip_balance - buyInAmount,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════
  // STAND UP — Cash out from a table
  // ═══════════════════════════════════════════════════════
  if (action === 'stand') {
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    // Get current stack from engine before standing
    const state = await controller.getTableState(tableId, user.id);
    if (!state) return res.status(404).json({ error: 'Table not found in engine' });

    const mySeat = state.seats?.find(s => s.player?.id === user.id);
    const cashoutAmount = mySeat?.stack || 0;

    // Stand up in engine
    const engineResult = await controller.standUp(tableId, user.id);

    // Credit chips back to club balance
    if (cashoutAmount > 0) {
      try {
        await supabase.rpc('transfer_chips', {
          p_member_id: membership.id,
          p_amount: cashoutAmount,
          p_type: 'cash_cashout',
          p_club_id: clubId,
          p_performed_by: user.id,
          p_table_id: tableId,
          p_note: `Cashout from table`,
        });
      } catch (err) {
        console.error('[seat] Cashout credit failed:', err);
        // Engine already removed player — log for manual resolution
      }
    }

    return res.json({
      success: true,
      cashout: cashoutAmount,
    });
  }

  // ═══════════════════════════════════════════════════════
  // REBUY — Add chips mid-session
  // ═══════════════════════════════════════════════════════
  if (action === 'rebuy') {
    if (!tableId || !amount) return res.status(400).json({ error: 'tableId and amount required' });

    const rebuyAmount = Math.floor(amount);
    if (rebuyAmount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    if (membership.chip_balance < rebuyAmount) {
      return res.status(400).json({ error: 'Insufficient balance', balance: membership.chip_balance });
    }

    // Verify max buy-in not exceeded
    const state = await controller.getTableState(tableId, user.id);
    if (!state) return res.status(404).json({ error: 'Table not found' });

    const mySeat = state.seats?.find(s => s.player?.id === user.id);
    if (!mySeat) return res.status(400).json({ error: 'Not seated at this table' });

    // Get table config for max buy-in check
    const { data: table } = await supabase
      .from('club_tables')
      .select('max_buy_in')
      .eq('id', tableId)
      .single();

    if (table && (mySeat.stack + rebuyAmount) > table.max_buy_in) {
      return res.status(400).json({
        error: `Would exceed max buy-in (${table.max_buy_in})`,
        maxAllowed: table.max_buy_in - mySeat.stack,
      });
    }

    // Deduct chips
    try {
      await supabase.rpc('transfer_chips', {
        p_member_id: membership.id,
        p_amount: -rebuyAmount,
        p_type: 'cash_buyin',
        p_club_id: clubId,
        p_performed_by: user.id,
        p_table_id: tableId,
        p_note: 'Rebuy',
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Add chips in engine
    const engineResult = await controller.addChips(tableId, user.id, rebuyAmount);
    if (!engineResult?.success) {
      // Refund
      await supabase.rpc('transfer_chips', {
        p_member_id: membership.id,
        p_amount: rebuyAmount,
        p_type: 'cash_cashout',
        p_club_id: clubId,
        p_performed_by: user.id,
        p_table_id: tableId,
        p_note: 'Refund - rebuy failed',
      });
      return res.status(400).json({ error: engineResult?.error || 'Rebuy failed in engine' });
    }

    return res.json({ success: true, added: rebuyAmount });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
