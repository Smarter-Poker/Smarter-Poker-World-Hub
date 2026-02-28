/**
 * POST /api/club-arena/request-cashout
 * 
 * Player requests to cash out chips. Creates a cashout_request record
 * that the player's agent (or club owner) must approve.
 * 
 * Body: { clubId, amount }
 * Auth: Bearer token (player requesting cashout)
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

  const { clubId, amount } = req.body;
  if (!clubId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'clubId and positive amount required' });
  }

  try {
    // 1. Get player's membership
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

    // 2. Check for existing pending cashout
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

    // 3. Hold the chips (deduct from balance, mark as pending)
    const { error: holdErr } = await supabaseAdmin
      .from('club_members')
      .update({ chip_balance: member.chip_balance - amount })
      .eq('club_id', clubId)
      .eq('user_id', user.id);

    if (holdErr) throw holdErr;

    // 4. Create cashout_request
    const { data: cashout, error: cashoutErr } = await supabaseAdmin
      .from('cashout_requests')
      .insert({
        club_id: clubId,
        player_id: user.id,
        agent_id: member.agent_id || '00000000-0000-0000-0000-000000000000',
        amount,
        status: 'pending',
        player_note: `Cashout request: ${amount.toLocaleString()} chips`,
      })
      .select()
      .single();

    if (cashoutErr) {
      // Rollback: restore chips
      await supabaseAdmin
        .from('club_members')
        .update({ chip_balance: member.chip_balance })
        .eq('club_id', clubId)
        .eq('user_id', user.id);
      throw cashoutErr;
    }

    // 5. Record chip_transaction (hold)
    await supabaseAdmin.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: user.id,
      to_user_id: user.id,
      amount: -amount,
      transaction_type: 'send',
      notes: `Cashout hold: ${amount.toLocaleString()} chips (pending approval)`,
      related_cashout_id: cashout.id,
    });

    // 6. Notify agent (if assigned)
    if (member.agent_id) {
      try {
        const { data: convId } = await supabaseAdmin.rpc('fn_get_or_create_conversation', {
          p_user_id: user.id,
          p_other_user_id: member.agent_id,
        });
        if (convId) {
          await supabaseAdmin.rpc('fn_send_message', {
            p_conversation_id: convId,
            p_sender_id: user.id,
            p_content: `💰 Cashout request: ${amount.toLocaleString()} chips. Please approve or deny.`,
          });
        }
      } catch (msgErr) {
        // Non-critical: notification failure shouldn't block cashout
        console.warn('[request-cashout] Notification failed:', msgErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      cashoutId: cashout.id,
      amount,
      status: 'pending',
      remainingBalance: member.chip_balance - amount,
    });
  } catch (err) {
    console.error('[request-cashout]', err);
    return res.status(500).json({ error: 'Cashout request failed', details: err.message });
  }
}
