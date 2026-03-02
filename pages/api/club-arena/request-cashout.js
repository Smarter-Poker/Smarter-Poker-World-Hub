/**
 * POST /api/club-arena/request-cashout
 * 
 * Player requests to cash out chips.
 * 
 * FLOW:
 *   1. Validate player has enough chips
 *   2. HOLD chips (deduct from balance → escrow)
 *   3. Create cashout_request (status: 'pending')
 *   4. Send in-app message to agent via messenger
 *   5. Send push notification to agent
 * 
 * RULES:
 *   - Chips are HELD immediately so player can't play them
 *   - Only the assigned agent (or club owner) can approve/cancel
 *   - If agent cancels, held chips return to player's balance
 *   - One pending request per player per club at a time
 * 
 * Body: { clubId, amount, note? }
 * Auth: Bearer token (player requesting cashout)
 */
import { createClient } from '@supabase/supabase-js';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';

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

  const { clubId, amount, note } = req.body;
  if (!clubId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'clubId and positive amount required' });
  }

  // Settlement lock check — block during Monday 4:00-4:10 AM CST
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/request-cashout')) return;

  try {
    // ═════════════════════════════════════════════════════════════
    // 1. Get player's membership
    // ═════════════════════════════════════════════════════════════
    const { data: member, error: memErr } = await supabaseAdmin
      .from('club_members')
      .select('user_id, role, chip_balance, agent_id, nickname')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) return res.status(404).json({ error: 'Not a member of this club' });

    if (amount > member.chip_balance) {
      return res.status(400).json({
        error: 'Insufficient chips',
        available: member.chip_balance,
        requested: amount,
      });
    }

    if (!member.agent_id) {
      return res.status(400).json({ error: 'No agent assigned. Contact club owner.' });
    }

    // ═════════════════════════════════════════════════════════════
    // 2. One pending request at a time
    // ═════════════════════════════════════════════════════════════
    const { data: existing } = await supabaseAdmin
      .from('cashout_requests')
      .select('id')
      .eq('club_id', clubId)
      .eq('player_id', user.id)
      .eq('status', 'pending')
      .limit(1);

    if (existing?.length > 0) {
      return res.status(409).json({ error: 'You already have a pending cashout request' });
    }

    // ═════════════════════════════════════════════════════════════
    // 3. HOLD chips — atomic debit (escrow)
    //    Uses fn_debit_chips to prevent TOCTOU race
    // ═════════════════════════════════════════════════════════════
    const { error: holdErr } = await supabaseAdmin.rpc('fn_debit_chips', {
      p_club_id: clubId,
      p_user_id: user.id,
      p_amount: amount,
    });

    if (holdErr) {
      if (holdErr.message?.includes('Insufficient')) {
        return res.status(400).json({ error: 'Insufficient chips', details: holdErr.message });
      }
      throw holdErr;
    }

    // ═════════════════════════════════════════════════════════════
    // 4. Create cashout_request
    // ═════════════════════════════════════════════════════════════
    const { data: cashout, error: cashoutErr } = await supabaseAdmin
      .from('cashout_requests')
      .insert({
        club_id: clubId,
        player_id: user.id,
        agent_id: member.agent_id,
        amount,
        status: 'pending',
        player_note: note || `Cashout request: ${amount.toLocaleString()} chips`,
      })
      .select()
      .single();

    if (cashoutErr) {
      // Rollback: restore chips atomically
      await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: clubId,
        p_user_id: user.id,
        p_amount: amount,
      });
      throw cashoutErr;
    }

    // ═════════════════════════════════════════════════════════════
    // 5. Record chip_transaction (escrow hold)
    // ═════════════════════════════════════════════════════════════
    await supabaseAdmin.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: user.id,
      to_user_id: user.id,
      amount: -amount,
      transaction_type: 'send',
      notes: `Cashout hold (escrow): ${amount.toLocaleString()} chips pending agent approval`,
    });

    // ═════════════════════════════════════════════════════════════
    // 6. Get player display name for notifications
    // ═════════════════════════════════════════════════════════════
    const { data: playerProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, display_name, full_name')
      .eq('id', user.id)
      .single();

    const playerName = playerProfile?.display_name
      || playerProfile?.full_name
      || playerProfile?.username
      || member.nickname
      || 'A player';

    // ═════════════════════════════════════════════════════════════
    // 7. Send in-app message to agent via messenger
    // ═════════════════════════════════════════════════════════════
    // Rate limit

  try {
      const { data: convId } = await supabaseAdmin.rpc('fn_get_or_create_conversation', {
        p_user_id: user.id,
        p_other_user_id: member.agent_id,
      });
      if (convId) {
        await supabaseAdmin.rpc('fn_send_message', {
          p_conversation_id: convId,
          p_sender_id: user.id,
          p_content: `💰 Cashout Request\n\n${playerName} is requesting to cash out ${amount.toLocaleString()} chips.\n\nGo to your Agent Dashboard to approve or cancel.`,
        });
      }
    } catch (msgErr) {
      console.warn('[request-cashout] Messenger notification failed:', msgErr.message);
    }

    // ═════════════════════════════════════════════════════════════
    // 8. Send push notification to agent
    // ═════════════════════════════════════════════════════════════
    // Rate limit

  try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

      if (baseUrl) {
        await fetch(`${baseUrl}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
          },
          body: JSON.stringify({
            userId: member.agent_id,
            title: '💰 Cashout Request',
            message: `${playerName} wants to cash out ${amount.toLocaleString()} chips`,
            url: '/hub/club-arena/admin?tab=cashouts',
          }),
        });
      }
    } catch (pushErr) {
      console.warn('[request-cashout] Push notification failed:', pushErr.message);
    }

    return res.status(200).json({
      success: true,
      cashoutId: cashout.id,
      amount,
      status: 'pending',
      remainingBalance: member.chip_balance - amount,
      agentNotified: true,
      message: `${amount.toLocaleString()} chips held. Your agent has been notified.`,
    });
  } catch (err) {
    console.error('[request-cashout]', err);
    return res.status(500).json({ error: 'Cashout request failed', details: err.message });
  }
}
