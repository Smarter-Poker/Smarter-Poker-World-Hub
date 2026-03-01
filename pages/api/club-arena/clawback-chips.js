/**
 * POST /api/club-arena/clawback-chips
 * 
 * Agent reverses a chip distribution within the 10-minute security window.
 * This is one of only TWO ways an agent can remove chips from a player:
 *   1. Approving a player's cashout request
 *   2. Clawing back within 10 minutes of sending (this endpoint)
 * 
 * RULES:
 *   - Must be within 10 minutes of the original distribution
 *   - Agent can only clawback their own distributions
 *   - Can clawback full or partial amount (up to original)
 *   - After 10 minutes, the only way to get chips back is a cashout request
 * 
 * Body: { transactionId, clubId, amount? (defaults to full original amount) }
 * Auth: Bearer token (must be the agent who sent the chips)
 */
import { createClient } from '@supabase/supabase-js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLAWBACK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { transactionId, clubId, amount: requestedAmount } = req.body;
  if (!transactionId || !clubId) {
    return res.status(400).json({ error: 'transactionId and clubId required' });
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/clawback-chips')) return;

  try {
    // ═════════════════════════════════════════════════════════════
    // 1. Get the original transaction
    // ═════════════════════════════════════════════════════════════
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('chip_transactions')
      .select('id, from_user_id, to_user_id, amount, club_id, created_at, transaction_type, notes')
      .eq('id', transactionId)
      .single();

    if (txnErr || !txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // ═════════════════════════════════════════════════════════════
    // 2. Verify this is the agent who sent the chips
    // ═════════════════════════════════════════════════════════════
    if (txn.from_user_id !== user.id) {
      return res.status(403).json({ error: 'You can only clawback your own distributions' });
    }

    if (txn.club_id !== clubId) {
      return res.status(400).json({ error: 'Club ID mismatch' });
    }

    // Must be a send transaction (distribution), not a cashout or other type
    if (txn.transaction_type !== 'send' || txn.from_user_id === txn.to_user_id) {
      return res.status(400).json({ error: 'Can only clawback agent→player distributions' });
    }

    // Check if already clawed back (idempotency)
    if (txn.notes?.includes('[CLAWED BACK]')) {
      return res.status(409).json({ error: 'This transaction has already been clawed back' });
    }

    // ═════════════════════════════════════════════════════════════
    // 3. Check the 10-minute window
    // ═════════════════════════════════════════════════════════════
    const txnTime = new Date(txn.created_at).getTime();
    const now = Date.now();
    const elapsed = now - txnTime;

    if (elapsed > CLAWBACK_WINDOW_MS) {
      const minutesAgo = Math.floor(elapsed / 60000);
      return res.status(403).json({
        error: 'Clawback window expired',
        message: `This distribution was ${minutesAgo} minutes ago. The 10-minute clawback window has closed.`,
        suggestion: 'The player must submit a cashout request for you to approve.',
      });
    }

    const remainingSeconds = Math.ceil((CLAWBACK_WINDOW_MS - elapsed) / 1000);

    // ═════════════════════════════════════════════════════════════
    // 4. Determine clawback amount
    // ═════════════════════════════════════════════════════════════
    const clawbackAmount = requestedAmount
      ? Math.min(requestedAmount, txn.amount)
      : txn.amount;

    if (clawbackAmount <= 0) {
      return res.status(400).json({ error: 'Invalid clawback amount' });
    }

    // ═════════════════════════════════════════════════════════════
    // 5. Atomically claim the transaction (prevents double-clawback)
    // ═════════════════════════════════════════════════════════════
    const clawbackNote = `${txn.notes || ''} [CLAWED BACK: ${clawbackAmount} at ${new Date().toISOString()}]`;
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('chip_transactions')
      .update({ notes: clawbackNote })
      .eq('id', transactionId)
      .not('notes', 'like', '%[CLAWED BACK]%')  // Only if not already claimed
      .select('id')
      .single();

    if (claimErr || !claimed) {
      return res.status(409).json({ error: 'Transaction already clawed back or claim failed' });
    }

    // ═════════════════════════════════════════════════════════════
    // 6. Verify player has enough chips
    // ═════════════════════════════════════════════════════════════
    const { data: playerMember } = await supabaseAdmin
      .from('club_members')
      .select('chip_balance, nickname')
      .eq('club_id', clubId)
      .eq('user_id', txn.to_user_id)
      .single();

    if (!playerMember) {
      return res.status(404).json({ error: 'Player no longer in club' });
    }

    if (playerMember.chip_balance < clawbackAmount) {
      // Unclaim the transaction since we can't execute
      await supabaseAdmin
        .from('chip_transactions')
        .update({ notes: txn.notes || '' })
        .eq('id', transactionId);
      return res.status(400).json({
        error: 'Player has insufficient chips for full clawback',
        playerBalance: playerMember.chip_balance,
        requested: clawbackAmount,
        message: 'Player may have already played or transferred some chips.',
      });
    }

    // ═════════════════════════════════════════════════════════════
    // 7. Execute clawback: atomic debit player, credit agent
    // ═════════════════════════════════════════════════════════════
    const { error: debitErr } = await supabaseAdmin.rpc('fn_debit_chips', {
      p_club_id: clubId,
      p_user_id: txn.to_user_id,
      p_amount: clawbackAmount,
    });

    if (debitErr) throw debitErr;

    const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_chips', {
      p_club_id: clubId,
      p_user_id: user.id,
      p_amount: clawbackAmount,
    });

    if (creditErr) {
      // Rollback player debit
      await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: txn.to_user_id,
        p_amount: clawbackAmount,
      });
      throw creditErr;
    }

    // ═════════════════════════════════════════════════════════════
    // 8. Record clawback transaction
    // ═════════════════════════════════════════════════════════════
    await supabaseAdmin.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: txn.to_user_id,
      to_user_id: user.id,
      amount: clawbackAmount,
      transaction_type: 'send',
      notes: `Clawback: ${clawbackAmount.toLocaleString()} chips reversed (original txn: ${transactionId})`,
    });

    // Read fresh balances for response
    const { data: freshPlayer } = await supabaseAdmin
      .from('club_members').select('chip_balance')
      .eq('club_id', clubId).eq('user_id', txn.to_user_id).single();
    const { data: freshAgent } = await supabaseAdmin
      .from('club_members').select('chip_balance')
      .eq('club_id', clubId).eq('user_id', user.id).single();

    return res.status(200).json({
      success: true,
      clawbackAmount,
      originalAmount: txn.amount,
      playerNewBalance: freshPlayer?.chip_balance || 0,
      agentNewBalance: freshAgent?.chip_balance || 0,
      windowRemaining: `${remainingSeconds}s`,
    });
  } catch (err) {
    console.error('[clawback-chips]', err);
    return res.status(500).json({ error: 'Clawback failed', details: err.message });
  }
}
