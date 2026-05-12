-- ============================================================================
-- Lift GFT-5 anti-farming caps for TRUSTED senders.
-- Date: 2026-05-12
--
-- A sender is "trusted" if BOTH:
--   1. profiles.is_farming_flagged is NOT TRUE (NULL or false both OK), AND
--   2. EITHER  account age >= 120 days
--        OR   they have ever completed a non-refunded diamond_purchases row
--
-- For trusted senders, the per-pair / per-user / burst caps DO NOT apply.
-- Safety guards still apply to all senders, trusted or not:
--   - argument validation (null, <=0, self-transfer)
--   - banned_by_recipient (live_bans)
-- KINGFISH sender bypass remains the very first short-circuit (unchanged).
--
-- This brings the DB-layer cap function in line with the JS-layer bypass that
-- pages/api/live/gift.js already implements (isFullyUnrestricted). Without
-- this, the BEFORE INSERT trigger trg_enforce_anti_farming_caps would still
-- block trusted senders whose JS-side check passed, producing user-facing
-- "Pair limit hit" errors on legitimate large gifts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(
  p_sender_id    uuid,
  p_recipient_id uuid,
  p_amount       integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kingfish        uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_pair_24h        bigint;
  v_total_24h       bigint;
  v_burst_60s       bigint;
  v_active_ban      boolean;
  v_is_flagged      boolean;
  v_created_at      timestamptz;
  v_has_purchased   boolean;
  v_is_trusted      boolean := false;
  CAP_PER_PAIR_24H  constant integer := 5000;
  CAP_PER_USER_24H  constant integer := 50000;
  CAP_BURST_60S     constant integer := 2000;
  TRUST_AGE_DAYS    constant integer := 120;
BEGIN
  -- ── Argument validation ──────────────────────────────────────────────────
  IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid arguments', 'code', 'invalid_args');
  END IF;
  IF p_sender_id = p_recipient_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Cannot send to self', 'code', 'self_transfer');
  END IF;

  -- ── KINGFISH sender bypass (platform owner / promo distributions) ────────
  IF p_sender_id = v_kingfish THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');
  END IF;

  -- ── Hard block: banned-by-recipient (applies to everyone incl. trusted) ──
  SELECT EXISTS (
    SELECT 1 FROM live_bans lb
      JOIN live_streams ls ON ls.id = lb.stream_id
     WHERE lb.banned_user_id = p_sender_id
       AND ls.broadcaster_id = p_recipient_id
  ) INTO v_active_ban;
  IF v_active_ban THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'You are banned from this broadcaster', 'code', 'banned_by_recipient');
  END IF;

  -- ── Trusted-sender bypass ────────────────────────────────────────────────
  -- Trust signal: NOT flagged AND (>=120d OR has completed non-refunded purchase).
  -- Matches the JS-layer bypass in pages/api/live/gift.js (isFullyUnrestricted +
  -- the "purchased diamonds = unlimited" rule).
  SELECT
    COALESCE(is_farming_flagged, false),
    created_at
  INTO v_is_flagged, v_created_at
  FROM profiles
  WHERE id = p_sender_id;

  IF v_is_flagged IS NOT TRUE THEN
    -- Has the sender ever purchased diamonds (completed, not refunded)?
    SELECT EXISTS (
      SELECT 1 FROM diamond_purchases
       WHERE user_id = p_sender_id
         AND status = 'completed'
         AND refunded_at IS NULL
    ) INTO v_has_purchased;

    v_is_trusted := (v_has_purchased
                     OR (v_created_at IS NOT NULL
                         AND v_created_at < (now() - make_interval(days => TRUST_AGE_DAYS))));

    IF v_is_trusted THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason',  CASE
                     WHEN v_has_purchased THEN 'trusted_purchaser_bypass'
                     ELSE 'trusted_120d_unflagged_bypass'
                   END,
        'code',    'ok'
      );
    END IF;
  END IF;

  -- ── Per pair 24h ─────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pair_24h
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '24 hours'
     AND metadata->>'recipient_id' = p_recipient_id::text
     AND (transaction_type = 'live_gift_sent'
       OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));
  IF v_pair_24h + p_amount > CAP_PER_PAIR_24H THEN
    RETURN jsonb_build_object('allowed', false, 'reason', format('Pair limit hit (%s 💎 / 24h to this user)', CAP_PER_PAIR_24H), 'code', 'pair_24h_cap');
  END IF;

  -- ── Per user 24h ─────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_24h
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '24 hours'
     AND (transaction_type = 'live_gift_sent'
       OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));
  IF v_total_24h + p_amount > CAP_PER_USER_24H THEN
    RETURN jsonb_build_object('allowed', false, 'reason', format('Daily limit hit (%s 💎 / 24h)', CAP_PER_USER_24H), 'code', 'user_24h_cap');
  END IF;

  -- ── Burst 60s ────────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_burst_60s
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '60 seconds'
     AND (transaction_type = 'live_gift_sent'
       OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));
  IF v_burst_60s + p_amount > CAP_BURST_60S THEN
    RETURN jsonb_build_object('allowed', false, 'reason', format('Slow down — %s 💎 in 60s is too fast', CAP_BURST_60S), 'code', 'burst_cap');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'within_caps', 'code', 'ok');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer) IS
  'GFT-5 unified anti-farming cap check. Trusted-sender bypass: senders that '
  'are NOT is_farming_flagged AND (account age >= 120 days OR have completed '
  'a non-refunded diamond_purchases row) skip the pair/user/burst caps. '
  'Banned-by-recipient and self-transfer guards still apply to everyone. '
  'KINGFISH sender bypass remains the first short-circuit. Mirrors the '
  'JS-layer trust check in pages/api/live/gift.js so the BEFORE INSERT '
  'trigger does not override the JS-layer bypass for legitimate senders.';
