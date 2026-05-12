/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POST /api/live/gift
 *  Send a diamond gift to a live broadcaster.
 *
 * Flow: atomic deduct from sender → atomic credit to receiver → record gift → broadcast to viewers → notify
 *
 * Uses deduct_diamonds (now with FOR UPDATE row lock) and add_diamonds_to_balance RPCs
 * for fully atomic balance operations.
 *
 * ANTI-FARMING SAFEGUARDS (live gifts):
 *  - Hard block: accounts < 30 days cannot send ANY live gifts
 *  - Source-tier rolling 30-day cap (days 31–89):
 *      free/earned diamonds: 100 diamonds/30 days
 *      purchased/won diamonds: 500 diamonds/30 days
 *  - Accounts 90+ days: standard max-per-gift cap (10,000) + velocity detection
 *  - Per-broadcaster rolling 30-day receive cap: 1,000 diamonds
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { randomUUID } from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Anti-farming constants (live gifts) ──
const NEW_USER_BLOCK_DAYS = 30;
const GRADUATION_DAYS = 120;
const FREE_EARNED_30DAY_LIMIT = 100;
const PURCHASED_WON_30DAY_LIMIT = 500;
const RECEIVER_30DAY_RECEIVE_LIMIT = 1000; // per broadcaster per 30-day rolling window

const PURCHASED_WON_TYPES = new Set([
  'purchase',
  'stripe_purchase',
  'diamond_purchase',
  'tournament_prize',
  'tournament_win',
  'prize_pool',
  'promo_purchased',
]);

async function checkVelocity(userId, clientIp) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentHour } = await supabase
    .from('diamond_transactions')
    .select('id')
    .eq('user_id', userId)
    .in('transaction_type', ['diamond_gift_sent', 'live_gift_sent'])
    .gte('created_at', oneHourAgo);

  const { data: ipRecentHour } = await supabase
    .from('anti_farming_ips')
    .select('id')
    .eq('ip_address', clientIp)
    .in('action_type', ['diamond_gift_sent', 'live_gift_sent'])
    .gte('created_at', oneHourAgo);

  const txIn1h = (recentHour || []).length;
  const ipTxIn1h = (ipRecentHour || []).length;

  if (txIn1h >= 20) {
    console.warn(`[VELOCITY:FARMING] User ${userId} sent ${txIn1h} live gifts in 1h`);
  }
  if (ipTxIn1h >= 20) {
    console.warn(`[VELOCITY:FARMING] IP ${clientIp} sent ${ipTxIn1h} live gifts in 1h`);
  }
}

async function getLiveGiftSourceCapAvailable(userId) {
  const { data, error } = await supabase.rpc('get_source_tier_available', { p_user_id: userId });
  if (error || data === null || data === undefined) {
    console.warn('[getLiveGiftSourceCapAvailable] RPC failed or returned null:', error);
    // Default to purchased/won limit so graduated users aren't incorrectly blocked
    return 0;
  }
  // Handle both object response { purchasedWonAvailable: N } and flat number response N
  if (typeof data === 'number') return data;
  if (typeof data === 'object')
    return data.purchasedWonAvailable ?? data.purchased_won_available ?? 0;
  return 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── IP parsing — hoisted here so it is available across all guards and the
  //    anti_farming_ips insert without being re-derived 3 separate times.
  const forwarded = req.headers['x-forwarded-for'];
  let clientIp = req.socket?.remoteAddress || 'unknown';
  if (typeof forwarded === 'string') {
    clientIp = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    clientIp = forwarded[0].split(',')[0].trim();
  }

  const { stream_id, receiver_id, amount, message } = req.body;

  // SECURITY: Strictly parse amount to an integer. If amount is NaN, a string
  // like "invalid", or an array, it bypasses JS coercion checks (< 1) and could
  // either cause a DB error or be swallowed as a 0 balance transfer.
  const parsedAmount = parseInt(amount, 10);

  if (!stream_id || !receiver_id || !parsedAmount || isNaN(parsedAmount) || parsedAmount < 1) {
    return res.status(400).json({ error: 'stream_id, receiver_id, and a valid amount required' });
  }
  if (parsedAmount > 10000) {
    return res.status(400).json({ error: 'Maximum gift is 10,000 diamonds' });
  }
  if (receiver_id === user.id) {
    return res.status(400).json({ error: 'Cannot gift yourself' });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BUG-FIX-LIVE-API-AUDIT — three integrity checks before any DB mutation
  //
  // (D1) IDOR: receiver_id was previously trusted from the client. A user
  //      could send a gift to ANY user_id while attributing it to a
  //      specific stream_id. Verify receiver_id matches the actual
  //      broadcaster of the stream.
  //
  // (D3) Status: gift would otherwise be accepted for ended streams (race
  //      window between status flip and the broadcaster's "End Stream"
  //      action propagating to viewers). Reject anything not 'live'.
  //
  // (D2) Ban: banned users could still gift the broadcaster who banned
  //      them. RLS already blocks comments and reactions for banned
  //      users (PR #245). This closes the gift path.
  // ═══════════════════════════════════════════════════════════════════════
  {
    const { data: streamRow, error: streamErr } = await supabase
      .from('live_streams')
      .select('id, broadcaster_id, status')
      .eq('id', stream_id)
      .maybeSingle();

    if (streamErr || !streamRow) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    // (D1) — must match the canonical broadcaster_id, not a client value
    if (streamRow.broadcaster_id !== receiver_id) {
      return res
        .status(400)
        .json({ error: 'receiver_id does not match the broadcaster of this stream' });
    }
    // (D3) — only live streams accept gifts
    if (streamRow.status !== 'live') {
      return res.status(400).json({ error: 'Stream is not live' });
    }
    // (D2) — banned users cannot gift
    const { data: ban } = await supabase
      .from('live_bans')
      .select('id')
      .eq('stream_id', stream_id)
      .eq('banned_user_id', user.id)
      .maybeSingle();
    if (ban) {
      return res.status(403).json({ error: 'You are banned from this stream' });
    }
  }

  // ── GUARD: Fetch sender profile for age gate ──
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('id, created_at, username, display_name, full_name, avatar_url, is_farming_flagged')
    .eq('id', user.id)
    .maybeSingle();

  const senderAgeDays = senderProfile?.created_at
    ? (new Date() - new Date(senderProfile.created_at)) / (1000 * 60 * 60 * 24)
    : 0;

  const isKingfish =
    senderProfile?.full_name?.toLowerCase().includes('dan bekavac') ||
    senderProfile?.username?.toLowerCase() === 'kingfish';

  // ── Trust signal: completed non-refunded diamond purchase ──
  // Mirrors the DB-side cap function (fn_check_anti_farming_gift_cap) which
  // grants trusted_purchaser_bypass for any user with a completed non-refunded
  // diamond_purchases row. Service-role bypasses RLS; idx_diamond_purchases_user_id
  // makes this O(1).
  const { data: paidPurchases } = await supabase
    .from('diamond_purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .is('refunded_at', null)
    .limit(1);
  const hasPaid = (paidPurchases?.length || 0) > 0;

  // ── Trust signal: graduated OR paid, AND not flagged ──
  // Logical NOT correctly treats NULL and false identically — only true is
  // restricted. Mirrors fn_check_anti_farming_gift_cap exactly so the DB
  // trigger never blocks what the JS layer admits (and vice versa).
  const isGraduated = senderAgeDays >= GRADUATION_DAYS;
  const isFullyUnrestricted =
    (isGraduated || hasPaid) && !senderProfile?.is_farming_flagged;

  // ── GUARD: Hard block — new users (< 30 days) cannot send live gifts ──
  // Trusted senders (paid OR graduated unflagged) bypass the new-user block.
  // Per platform rule: "unlimited gifting for paid users and 120d+ unflagged
  // senders". KINGFISH bypass remains independent.
  if (!isKingfish && !isFullyUnrestricted && senderAgeDays < NEW_USER_BLOCK_DAYS) {
    const daysRemaining = Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays);
    return res.status(403).json({
      error: `New accounts cannot send live gifts until your 30-Day VIP Card expires. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
      daysRemaining,
      gateType: 'new_user_block',
    });
  }

  // ── GUARD: Source-tier rolling 30-day cap (accounts < 120 days, not paid, or flagged) ──
  const rolling30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rolling30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (!isKingfish && !isFullyUnrestricted) {
    // BUG FIX (Pass 4): Use direct RPCs for aggregations instead of paginated HTTP fetching
    const { data: alreadySent } = await supabase.rpc('sum_diamond_transactions', {
      p_user_id: user.id,
      p_types: ['diamond_gift_sent', 'live_gift_sent'],
      p_start: rolling30Start,
    });

    const { data: ipAlreadySent } = await supabase.rpc('sum_anti_farming_ips', {
      p_ip: clientIp,
      p_start: rolling30Start,
    });

    const effectiveAlreadySent = Math.max(alreadySent || 0, ipAlreadySent || 0);

    const purchasedWonAvailable = await getLiveGiftSourceCapAvailable(user.id);
    const activeCap =
      purchasedWonAvailable >= parsedAmount ? PURCHASED_WON_30DAY_LIMIT : FREE_EARNED_30DAY_LIMIT;
    const capLabel = purchasedWonAvailable >= parsedAmount ? 'purchased/won' : 'free/earned';

    if (effectiveAlreadySent + parsedAmount > activeCap) {
      console.warn(
        `[VELOCITY:LIVE_GIFT] User ${user.id} (IP: ${clientIp}) hit 30-day ${capLabel} cap: ${effectiveAlreadySent}/${activeCap}`
      );
      return res.status(429).json({
        error: `30-day live gift limit reached for ${capLabel} diamonds (${activeCap}/30 days). You've sent ${effectiveAlreadySent} diamonds recently.`,
        alreadySent: effectiveAlreadySent,
        cap: activeCap,
        capType: capLabel,
        gateType: 'source_tier_cap',
      });
    }
  } else {
    // ── Graduated accounts: rely on velocity detectors ──
    await checkVelocity(user.id, clientIp);
  }

  // ── GUARD: Per-broadcaster rolling 30-day receive cap ──
  const rolling30StartReceive = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: broadcasterReceiveTotal } = await supabase.rpc('sum_diamond_transactions', {
    p_user_id: receiver_id,
    p_types: ['live_gift_received'],
    p_start: rolling30StartReceive,
  });

  if (!isKingfish && (broadcasterReceiveTotal || 0) + parsedAmount > RECEIVER_30DAY_RECEIVE_LIMIT) {
    return res.status(429).json({
      error: `This broadcaster has reached their 30-day gift receive limit (${RECEIVER_30DAY_RECEIVE_LIMIT} diamonds/30 days)`,
      gateType: 'broadcaster_receive_cap',
    });
  }

  // STREAM-POLISH-R3 GIFT-1: per-gift UUID is now sourced from the
  // client's `idempotency_key` when supplied. The deduct + credit RPCs
  // both honor `p_reference_id` for dedup, but the previous server-
  // side randomUUID() was generated fresh per request — so a client
  // retry (network blip, fetch auto-retry, double-fire across tabs)
  // produced a different reference and double-charged the sender.
  //
  // With a stable client-supplied key:
  //  - deduct dedup kicks in on retry → sender is NOT double-debited
  //  - credit dedup kicks in on retry → broadcaster is NOT double-credited
  //  - live_gifts.upsert(onConflict='id') prevents duplicate row insert
  //
  // Backward compatible: if `idempotency_key` is absent or not a valid
  // UUID, fall back to server-generated random UUID (current behavior).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientKey =
    typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key.toLowerCase() : null;
  const giftId = clientKey && UUID_RE.test(clientKey) ? clientKey : randomUUID();

  // Initialized to null; assigned after the deduct commits so the catch block
  // can safely call it if something throws between deduct and credit.
  let refundSender = null;
  let creditSuccess = false;

  try {
    // senderProfile already fetched above for age gate — reuse it
    // Prefer display_name (user-chosen proper-case alias) over the lowercase username slug.
    const senderName = senderProfile?.display_name || senderProfile?.full_name || senderProfile?.username || 'A fan';

    // ATOMIC deduct from sender (uses FOR UPDATE row lock to prevent overdraft)
    const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_diamonds', {
      p_user_id: user.id,
      p_amount: parsedAmount,
      p_description: `Live gift to broadcaster`,
      p_transaction_type: 'live_gift_sent',
      p_metadata: { recipient_id: receiver_id },
      p_reference_id: `live_gift_deduct_${giftId}`,
      p_cooldown_seconds: 1,
    });

    // deduct_diamonds returns jsonb with success field
    if (deductErr) {
      console.warn('[live/gift] Deduction failed:', deductErr.message);
      return res
        .status(500)
        .json({ error: 'Gift failed due to a network error. Please try again.' });
    }
    if (deductResult && !deductResult.success) {
      return res.status(400).json({
        error: deductResult.error || 'Insufficient diamonds',
        balance: deductResult.balance,
      });
    }

    const senderNewBalance = deductResult?.balance ?? 0;

    // Compensating refund helper
    refundSender = async (reason) => {
      try {
        const { error: refundErr } = await supabase.rpc('add_diamonds_to_balance', {
          p_user_id: user.id,
          p_amount: parsedAmount,
          p_type: 'live_gift_refund',
          p_description: `Live gift refund — ${reason}`,
          p_reference_id: `live_gift_refund_${giftId}`,
        });
        if (refundErr) {
          console.error(
            '[live/gift] CRITICAL: Failed to refund sender after credit failure:',
            refundErr
          );
        } else {
          console.info(`[live/gift] Compensating refund applied for ${user.id}`);
        }
      } catch (err) {
        console.error('[live/gift] CRITICAL: Network error during refund:', err);
      }
    };
    // ATOMIC credit to receiver. Use the per-gift UUID as reference_id so
    // multiple gifts to the same stream don't collide on dedup.
    const { data: creditResult, error: creditErr } = await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: receiver_id,
      p_amount: parsedAmount,
      p_type: 'live_gift_received',
      p_description: `${senderName} sent ${parsedAmount} diamonds during your live`,
      p_reference_id: `live_gift_${giftId}`,
    });

    if (creditErr) {
      await refundSender('credit RPC failed');
      console.warn(
        '[live/gift] Credit RPC failed (refunded sender):',
        creditErr?.message || creditErr
      );
      return res
        .status(500)
        .json({ error: 'Gift failed — your diamonds have been refunded. Please try again.' });
    }
    if (creditResult && creditResult.success === false && !creditResult.duplicate) {
      await refundSender(`credit returned ${creditResult.error || 'success:false'}`);
      console.warn('[live/gift] Credit returned success:false (refunded sender):', creditResult);
      return res
        .status(500)
        .json({ error: 'Gift failed — your diamonds have been refunded. Please try again.' });
    }

    creditSuccess = true;

    if (creditResult && creditResult.duplicate) {
      console.info(`[live/gift] Idempotent retry detected for gift ${giftId} — skipping refund`);
    }

    // STREAM-POLISH-R3 GIFT-2: upsert the gift row so client retries
    // (with the same idempotency_key → same giftId) don't fail on a
    // duplicate primary-key violation. The deduct/credit are already
    // idempotent via p_reference_id; this closes the last write that
    // wasn't.
    const { data: gift } = await supabase
      .from('live_gifts')
      .upsert(
        {
          id: giftId,
          stream_id,
          sender_id: user.id,
          receiver_id,
          amount: parsedAmount,
          message: message || null,
        },
        { onConflict: 'id', ignoreDuplicates: false }
      )
      .select()
      .maybeSingle();

    // Record the IP cluster action — clientIp was parsed once at top of handler
    await supabase.from('anti_farming_ips').insert({
      user_id: user.id,
      ip_address: clientIp,
      action_type: 'live_gift_sent',
      amount: parsedAmount,
    });

    // Broadcast gift event to all viewers via Supabase Realtime
    // FIX: wait for SUBSCRIBED status before sending — otherwise send() silently drops
    const channel = supabase.channel(`live-gifts-${stream_id}`);
    await new Promise((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      // Safety timeout: don't block the response if subscription takes too long
      setTimeout(resolve, 3000);
    });
    await channel
      .send({
        type: 'broadcast',
        event: 'gift',
        payload: {
          sender_id: user.id,
          sender_name: senderName,
          sender_avatar: senderProfile?.avatar_url || null,
          receiver_id,
          amount: parsedAmount,
          message: message || null,
          gift_id: gift?.id,
        },
      })
      .catch(() => {}); // Non-fatal if broadcast fails
    supabase.removeChannel(channel);

    // BUG-FIX-LIVE-1: Diamonds received during a stream MUST NOT create a
    // notification. They are already surfaced to the broadcaster via:
    //   1. The realtime gift channel broadcast above (in-stream UI)
    //   2. The diamond_transactions row (wallet history)
    //   3. The live_gifts row (stream gift feed / leaderboard)
    // A notifications row would be redundant noise. Direct wallet→wallet
    // diamond transfers (a different code path) DO emit notifications.

    return res.json({
      success: true,
      gift,
      newBalance: senderNewBalance,
    });
  } catch (err) {
    // If we are here and the deduction already committed but the credit
    // RPC network-threw before returning, attempt a compensating refund.
    // refundSender is only defined after the deduct succeeds so check first.
    console.warn('[live/gift] unhandled error:', err.message);
    if (typeof refundSender === 'function' && !creditSuccess) {
      await refundSender(`uncaught handler error: ${err.message}`);
      return res
        .status(500)
        .json({ error: 'Gift failed — your diamonds have been refunded. Please try again.' });
    }
    return res.status(500).json({ error: 'Gift failed — please try again.' });
  }
}
