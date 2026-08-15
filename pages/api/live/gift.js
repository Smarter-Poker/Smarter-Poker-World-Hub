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
 *  - Age-tiered allowance for EARNED diamonds (never zero — see
 *    freeEarnedAllowance below). Earning is already supply-throttled by the
 *    reward system's own daily caps.
 *  - Per-pair concentration cap: the anti-DUMPING control (see
 *    PAIR_30DAY_CONCENTRATION_LIMIT)
 *  - IP-aggregated 30-day budget shared across accounts: the anti-FARMING
 *    control (sum_anti_farming_ips)
 *  - Accounts 90+ days: standard max-per-gift cap (10,000) + velocity detection
 *  - Receiving is NOT capped. See RECEIVER_30DAY_REVIEW_THRESHOLD below.
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

// 2026-08-15 economy redesign, round 2 (Dan: "users can earn diamonds without
// ever purchasing them, SO YOU CAN'T BLOCK THEM. There has to be a happy
// middle to both while protecting us from farming and dumping").
//
// What was wrong with the old flat 100/30d free-earned cap: it was
// simultaneously TOO TIGHT for honest users and TOO LOOSE for farms.
//   * Too tight: measured against production, 8 of 8 users who earned
//     anything in the last 30 days earned MORE than 100 (median 387, p90
//     1,706). The cap sat below what 100% of real earners actually earn, so
//     the honest single user was throttled on diamonds they legitimately
//     worked for.
//   * Too loose: a farm does not care about a PER-ACCOUNT cap. Fifty sock
//     accounts at 100 each is 5,000 funnelled to one target, straight
//     through the cap. A global per-sender ceiling is simply the wrong shape
//     for the threat.
//
// So the flat cap is replaced by three controls that each target the actual
// behaviour instead of the aggregate:
//   1. An age-tiered allowance that is NEVER zero, sized above what real
//      earners earn, so honest users are never blocked from spending what
//      they earned. Supply is already throttled upstream by the reward
//      system's own daily caps.
//   2. PAIR_30DAY_CONCENTRATION_LIMIT — anti-DUMPING. A real fan spreads
//      gifts across streams; a dump concentrates on one target. Capping the
//      sender->recipient PAIR kills the funnel without touching normal use.
//   3. The existing IP-aggregated budget (sum_anti_farming_ips) — anti-
//      FARMING. Accounts sharing an IP share one budget, so spinning up more
//      accounts buys the farm nothing. This is retained and is what makes
//      relaxing (1) safe.
//
// Numbers are sized off production data (median lifetime earn 400, p90 520).
function freeEarnedAllowance(ageDays) {
  if (ageDays < 7) return { limit: 100, windowDays: 7, tier: 'new' };
  if (ageDays < 30) return { limit: 300, windowDays: 30, tier: 'establishing' };
  return { limit: 600, windowDays: 30, tier: 'established' };
}

// Money-backed or competition-won diamonds. Raised from 500 — a tournament
// prize can legitimately dwarf that (largest single earner on record: 50,185)
// and this tier is not the farming vector.
const PURCHASED_WON_30DAY_LIMIT = 1500;

// Anti-DUMPING. Max a NON-graduated sender may push at ONE recipient per 30
// days. Deliberately generous next to real behaviour (median live gift to
// date is 10 diamonds) while making a funnel expensive: concentration is the
// signal, not volume.
const PAIR_30DAY_CONCENTRATION_LIMIT = 750;
// 2026-08-15 economy redesign (Dan: "1000 diamonds every 30 days seems very
// low, we want diamonds flying around and being purchased").
//
// The old rule was a HARD BLOCK at 1,000 diamonds received per broadcaster per
// 30 days. It was the single worst constraint in the economy:
//   * It fired on the most popular broadcasters — exactly the rooms where
//     purchase intent is highest — and made their viewers' gifts FAIL.
//   * A single gift may be up to 10,000, so one whale gift was 10x the
//     receiver's entire monthly allowance. The caps contradicted each other.
//   * Senders graduate to unlimited at 120 days; receivers never graduated.
//
// How the majors actually do it (researched 2026-08-15): NONE of them cap
// receipt. They throttle the ENTRANCE and the EXIT, never the middle.
//   * YouTube Super Chat: viewer spend capped at $500/day and $2,000/week,
//     max $500 per message. No cap on what a creator receives.
//   * TikTok LIVE: no published receive cap; the control is at cash-out —
//     one withdrawal per day, up to ~$1,000, $100 minimum.
// The exit is the anti-abuse choke point because the abuse is laundering:
// buy -> gift -> withdraw.
//
// Smarter.poker has NO diamond cash-out at all. Diamonds are a closed loop
// (the only cashout path in the codebase is Club Arena chip_balance, a
// separate per-club chip economy). With no exit to real money there is no
// laundering vector for a receive cap to close, so the cap bought us nothing
// and cost us every gift above 1,000.
//
// Free-diamond farming — the one real concern — is throttled at the SENDER
// by the age-tiered earned allowance, the per-pair concentration cap and the
// IP-aggregated budget (see the constants block). Capping the receiver was
// redundant with all three.
//
// Replaced with an observability threshold: we still compute the 30-day
// receive total and log loudly past this line, but we never reject the gift.
const RECEIVER_30DAY_REVIEW_THRESHOLD = 250000; // log-only. NOT a block.

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

  const { stream_id, receiver_id, amount } = req.body;
  // 2026-08-15 audit: bound the free-text message (was unbounded — payload/XSS risk)
  const message = typeof req.body.message === 'string' ? req.body.message.slice(0, 200).trim() || null : null;

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
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .is('refunded_at', null)
    .order('completed_at', { ascending: true })
    .limit(1);
  const firstPurchaseAt = paidPurchases?.[0]?.completed_at
    ? new Date(paidPurchases[0].completed_at)
    : null;
  const hasPaid = firstPurchaseAt !== null;
  const daysSinceFirstPurchase = firstPurchaseAt
    ? (Date.now() - firstPurchaseAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;
  const isPostPurchaseCooldown = hasPaid && daysSinceFirstPurchase >= 7;
  const isFreshPaid = hasPaid && !isPostPurchaseCooldown && senderAgeDays < NEW_USER_BLOCK_DAYS;

  // ── Trust signal: graduated OR paid, AND not flagged ──
  // Logical NOT correctly treats NULL and false identically — only true is
  // restricted. Mirrors fn_check_anti_farming_gift_cap exactly so the DB
  // trigger never blocks what the JS layer admits (and vice versa).
  const isGraduated = senderAgeDays >= GRADUATION_DAYS;
  const isFullyUnrestricted = !senderProfile?.is_farming_flagged && (
    isGraduated || isPostPurchaseCooldown
  );

  // ── GUARD: new-account block — REMOVED 2026-08-15 ─────────────────────
  // This used to 403 every unpaid account under 30 days old, so a user who
  // had legitimately EARNED diamonds in-app could not spend a single one for
  // their first month. Dan: "users can earn diamonds without ever purchasing
  // them, so you can't block them."
  //
  // A new account is now governed by the tier-0 allowance in
  // freeEarnedAllowance() (100 per 7 days — about ten gifts at the observed
  // median gift size) plus the pair-concentration and IP-aggregate caps
  // below. Participation from day one, funnels still closed.
  //
  // Retained ONLY for accounts already flagged by a human as farming.
  if (!isKingfish && !hasPaid && senderProfile?.is_farming_flagged && senderAgeDays < NEW_USER_BLOCK_DAYS) {
    const daysRemaining = Math.ceil(NEW_USER_BLOCK_DAYS - senderAgeDays);
    return res.status(403).json({
      error: `New accounts cannot send live gifts until your 30-Day VIP Card expires. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
      daysRemaining,
      gateType: 'new_user_block',
      title: 'Account Cool Down',
      popup_message: 'Your Account Is In A 30-Day Cool Down Period',
      popup_explanation: 'To maintain a secure network economy, new accounts cannot send diamond gifts until the 30-Day VIP Card window expires. Purchase diamonds or wait for the cool down to complete.',
      next_send_message: 'Unlimited Gifting Unlocks After Purchase',
      limits_lift_message: `Your VIP Card Window Expires In ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''}`,
    });
  }

  if (!isKingfish && isFreshPaid) {
    const last24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sent24h } = await supabase.rpc('sum_diamond_transactions', {
      p_user_id: user.id,
      p_types: ['diamond_gift_sent', 'live_gift_sent'],
      p_start: last24hStart,
    });
    // 2026-08-15 audit: debits are stored as NEGATIVE amounts, so the raw sum
    // is <= 0 and this cap never fired. abs() makes it real.
    if (Math.abs(sent24h || 0) + parsedAmount > 500) {
      const liftAt = new Date(firstPurchaseAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      const liftDate = liftAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return res.status(429).json({
        error: `Daily limit of 500 diamonds reached`,
        gateType: 'fresh_paid_24h_cap',
        title: 'Daily Limit Reached',
        popup_message: 'You Have Reached Your Daily 500 Diamond Sending Limit',
        popup_explanation: 'New Paid Accounts Are Limited To 500 Diamonds Per Day During The First 7 Days After Your First Purchase To Protect Against Fraud',
        next_send_message: 'You Can Send More Diamonds Tomorrow',
        limits_lift_at: liftAt.toISOString(),
        limits_lift_message: `Your Limits Are Fully Lifted On ${liftDate}`,
        amount_sent_24h: Math.abs(sent24h || 0),
        amount_cap_24h: 500,
      });
    }
  }

  // ── GUARD: Source-tier rolling 30-day cap (accounts < 120 days, not paid, or flagged) ──
  const rolling30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 2026-08-15 economy redesign: a FRESH PAID sender (bought diamonds, still
  // inside the 7-day post-purchase window) is governed by the 500/24h cap
  // above — applying the 500-per-30-DAYS purchased/won cap on top of it made
  // the daily allowance a lie: someone who bought 5,000 diamonds could gift
  // 500 of them in their entire first week, not 500 per day. The 24h cap is
  // the intended chargeback-window control; this one would double-bind it.
  if (!isKingfish && !isFullyUnrestricted && !isFreshPaid) {
    // BUG FIX (Pass 4): Use direct RPCs for aggregations instead of paginated HTTP fetching
    // The free/earned tier for a brand-new account uses a 7-day window, not
    // 30 — a short window that refills is friendlier to a real user than one
    // long window, and no friendlier to a farm.
    const tierWindowStart = new Date(
      Date.now() - freeEarnedAllowance(senderAgeDays).windowDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: alreadySent } = await supabase.rpc('sum_diamond_transactions', {
      p_user_id: user.id,
      p_types: ['diamond_gift_sent', 'live_gift_sent'],
      p_start: tierWindowStart,
    });

    const { data: ipAlreadySent } = await supabase.rpc('sum_anti_farming_ips', {
      p_ip: clientIp,
      p_start: tierWindowStart,
    });

    // 2026-08-15 audit: abs() — alreadySent is a sum of negative debit rows.
    const effectiveAlreadySent = Math.max(Math.abs(alreadySent || 0), ipAlreadySent || 0);

    const purchasedWonAvailable = await getLiveGiftSourceCapAvailable(user.id);
    const usingPurchasedWon = purchasedWonAvailable >= parsedAmount;
    const allowance = freeEarnedAllowance(senderAgeDays);
    const activeCap = usingPurchasedWon ? PURCHASED_WON_30DAY_LIMIT : allowance.limit;
    const activeWindowDays = usingPurchasedWon ? 30 : allowance.windowDays;
    const capLabel = usingPurchasedWon ? 'purchased/won' : 'free/earned';

    if (effectiveAlreadySent + parsedAmount > activeCap) {
      console.warn(
        `[VELOCITY:LIVE_GIFT] User ${user.id} (IP: ${clientIp}) hit 30-day ${capLabel} cap: ${effectiveAlreadySent}/${activeCap}`
      );
      return res.status(429).json({
        error: `${activeWindowDays}-day live gift limit reached for ${capLabel} diamonds (${activeCap}/${activeWindowDays} days). You've sent ${effectiveAlreadySent} diamonds recently.`,
        alreadySent: effectiveAlreadySent,
        cap: activeCap,
        capType: capLabel,
        windowDays: activeWindowDays,
        gateType: 'source_tier_cap',
        title: 'Outbound Limit Reached',
        popup_message: `You Have Reached Your ${activeWindowDays}-Day Sending Limit`,
        popup_explanation: `Your sending allowance grows as your account matures: ${'100'} diamonds per 7 days in your first week, ${'300'} per 30 days to one month, ${'600'} per 30 days after that, and unlimited at 120 days. Purchasing diamonds lifts the limit immediately.`,
        next_send_message: 'Your Allowance Grows As Your Account Matures',
        limits_lift_message: 'Limits Graduate To Unlimited At 120 Days',
      });
    }
  } else {
    // ── Graduated accounts: rely on velocity detectors ──
    await checkVelocity(user.id, clientIp);
  }

  // ── GUARD: per-pair concentration (anti-DUMPING) ──────────────────────
  // The control that lets the allowances above be generous. Volume alone is
  // not a farming signal — CONCENTRATION is. A real supporter spreads gifts
  // across the streams they watch; a dump points everything at one account.
  // Applies to the same non-graduated population as the source-tier cap, so
  // trusted and paying senders stay frictionless.
  if (!isKingfish && !isFullyUnrestricted) {
    const { data: pairTotal } = await supabase.rpc('sum_live_gift_pair', {
      p_sender: user.id,
      p_receiver: receiver_id,
      p_start: rolling30Start,
    });
    if ((pairTotal || 0) + parsedAmount > PAIR_30DAY_CONCENTRATION_LIMIT) {
      console.warn(
        `[ANTI_DUMP:LIVE_GIFT] User ${user.id} -> ${receiver_id} would exceed pair cap: ` +
          `${(pairTotal || 0) + parsedAmount}/${PAIR_30DAY_CONCENTRATION_LIMIT} in 30d`
      );
      return res.status(429).json({
        error: `You've reached your 30-day limit for gifting this broadcaster (${PAIR_30DAY_CONCENTRATION_LIMIT} diamonds). You can still gift other broadcasters.`,
        gateType: 'pair_concentration_cap',
        cap: PAIR_30DAY_CONCENTRATION_LIMIT,
        alreadySent: pairTotal || 0,
        title: 'Limit For This Broadcaster',
        popup_message: 'You Have Reached Your Limit For This Broadcaster',
        popup_explanation: `New accounts can gift up to ${PAIR_30DAY_CONCENTRATION_LIMIT.toLocaleString()} diamonds to any single broadcaster per 30 days. You can keep gifting other broadcasters, and this limit is lifted entirely once your account reaches 120 days or you purchase diamonds.`,
        next_send_message: 'You Can Still Gift Other Broadcasters',
        limits_lift_message: 'Lifted At 120 Days Or On Purchase',
      });
    }
  }

  // ── GUARD: Per-broadcaster rolling 30-day receive cap ──
  const rolling30StartReceive = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: broadcasterReceiveTotal } = await supabase.rpc('sum_diamond_transactions', {
    p_user_id: receiver_id,
    p_types: ['live_gift_received'],
    p_start: rolling30StartReceive,
  });

  // 2026-08-15: log-only. A broadcaster is never blocked from RECEIVING —
  // see the RECEIVER_30DAY_REVIEW_THRESHOLD note above. This line exists so an
  // implausible concentration still shows up in the logs for review, and so
  // is_farming_flagged can be applied by a human rather than by a rule that
  // silently kills revenue.
  if ((broadcasterReceiveTotal || 0) + parsedAmount > RECEIVER_30DAY_REVIEW_THRESHOLD) {
    console.warn(
      `[REVIEW:LIVE_GIFT_RECEIVE] Broadcaster ${receiver_id} is past the 30-day review threshold: ` +
        `${(broadcasterReceiveTotal || 0) + parsedAmount}/${RECEIVER_30DAY_REVIEW_THRESHOLD} diamonds. Not blocked.`
    );
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
      console.warn('[live/gift] Deduction failed caught:', deductErr);
      const errCode = deductErr.code;
      const errDetails = deductErr.details;
      const errMessage = deductErr.message || 'Gift failed due to a network error. Please try again.';

      if ((errCode === 'P0001' || errCode === '23514') && errDetails) {
        try {
          const popup = JSON.parse(errDetails);
          if (popup && popup.code) {
            await refundSender?.('cap_blocked');

            // Map database-level codes to beautiful user-friendly alerts
            let displayTitle = popup.title || 'Gift Restricted';
            let displayExplanation = popup.popup_explanation || popup.reason || errMessage;
            let displayMessage = popup.popup_message || popup.reason || 'You cannot complete this gift right now';

            if (popup.code === 'pair_24h_cap') {
              displayTitle = 'Recipient Limit Reached';
              displayExplanation = 'To protect against farming and abuse, we limit the amount of diamonds you can send to a single broadcaster to 5,000 💎 every 24 hours.';
              displayMessage = 'You Have Reached Your 24-Hour Sending Limit For This Recipient';
            } else if (popup.code === 'user_24h_cap') {
              displayTitle = 'Daily Sending Limit Reached';
              displayExplanation = 'To protect the platform economy, accounts have a daily total outbound transfer cap of 50,000 💎 every 24 hours.';
              displayMessage = 'You Have Reached Your 24-Hour Overall Sending Limit';
            } else if (popup.code === 'burst_cap') {
              displayTitle = 'Sending Too Fast';
              displayExplanation = 'Please slow down. You can send a maximum of 2,000 💎 every 60 seconds.';
              displayMessage = 'Velocity Check Triggered';
            }

            return res.status(429).json({
              error: popup.reason || errMessage,
              gateType: popup.code,
              title: displayTitle,
              popup_message: displayMessage,
              popup_explanation: displayExplanation,
              next_send_message: popup.next_send_message || 'Please try again later',
              limits_lift_at: popup.limits_lift_at,
              limits_lift_message: popup.limits_lift_message,
              amount_sent_24h: popup.amount_sent_24h,
              amount_cap_24h: popup.amount_cap_24h,
            });
          }
        } catch (_) { /* fall through to legacy */ }
      }

      // Extract clear error message if the trigger raised an exception without JSON
      let cleanMessage = errMessage;
      if (cleanMessage.includes('Anti-farming:')) {
        cleanMessage = cleanMessage.replace('Anti-farming:', '').trim();
      }

      return res.status(500).json({ error: cleanMessage });
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
    // 2026-08-15 audit: require an explicit success/duplicate — a null/undefined
    // creditResult (PostgREST schema-cache race) was previously treated as
    // success, charging the sender while crediting nobody.
    if (!(creditResult && (creditResult.success === true || creditResult.duplicate === true))) {
      await refundSender(`credit returned ${creditResult?.error || 'null/unknown'}`);
      console.warn('[live/gift] Credit did not confirm success (refunded sender):', creditResult);
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
    const { data: gift, error: giftRowErr } = await supabase
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
    // 2026-08-15 audit: the transfer already succeeded; a failed gift-row write
    // means the gift won't appear in top-gifters/analytics. Log loudly and flag
    // it in the response rather than silently claiming full success.
    if (giftRowErr) console.error('[live/gift] gift row write failed after transfer:', giftRowErr.message);

    // Record the IP cluster action — clientIp was parsed once at top of handler
    const { error: err_anti_farming_ips_gr9d2 } = await supabase.from('anti_farming_ips').insert({
      user_id: user.id,
      ip_address: clientIp,
      action_type: 'live_gift_sent',
      amount: parsedAmount,
    });
    if (err_anti_farming_ips_gr9d2) console.warn('[Supabase] Silent mutation failed in anti_farming_ips:', err_anti_farming_ips_gr9d2.message);

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
      recorded: !!gift,
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
