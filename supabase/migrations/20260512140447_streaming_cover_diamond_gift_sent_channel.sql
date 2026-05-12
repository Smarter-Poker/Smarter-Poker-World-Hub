-- ============================================================================
-- Extend GFT-5 unified anti-farming layer to cover the diamond_gift_sent
-- channel (wallet-to-friend transfer via pages/api/store/diamond-transfer.js).
-- Date: 2026-05-12
--
-- BUG: the original GFT-5 trigger only enforced on transaction_type =
-- 'live_gift_sent' OR source IN ('stream_gift','wallet_transfer',
-- 'wallet_diamond_transfer'). But pages/api/store/diamond-transfer.js writes
-- transaction_type = 'diamond_gift_sent' (via deduct_diamonds RPC), which
-- was NOT in the trigger's recognized channel list. Adversaries could route
-- diamonds wallet→wallet via the friend-transfer endpoint and bypass the
-- unified caps entirely.
--
-- FIX: add 'diamond_gift_sent' to BOTH:
--   - the trigger's enforcement guard, AND
--   - the cap function's aggregation queries (so all five channels count
--     toward the same per-pair / per-user / burst caps).
--
-- Trusted-sender bypass (120d unflagged OR completed non-refunded purchase)
-- continues to apply via the cap function — unchanged.
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
  -- Argument validation
  IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid arguments', 'code', 'invalid_args');
  END IF;
  IF p_sender_id = p_recipient_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Cannot send to self', 'code', 'self_transfer');
  END IF;

  -- KINGFISH sender bypass
  IF p_sender_id = v_kingfish THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');
  END IF;

  -- Hard block: banned-by-recipient
  SELECT EXISTS (
    SELECT 1 FROM live_bans lb
      JOIN live_streams ls ON ls.id = lb.stream_id
     WHERE lb.banned_user_id = p_sender_id
       AND ls.broadcaster_id = p_recipient_id
  ) INTO v_active_ban;
  IF v_active_ban THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'You are banned from this broadcaster', 'code', 'banned_by_recipient');
  END IF;

  -- Trusted-sender bypass: NOT flagged AND (>=120d OR completed non-refunded purchase)
  SELECT COALESCE(is_farming_flagged, false), created_at
    INTO v_is_flagged, v_created_at
    FROM profiles WHERE id = p_sender_id;

  IF v_is_flagged IS NOT TRUE THEN
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
        'reason',  CASE WHEN v_has_purchased THEN 'trusted_purchaser_bypass'
                        ELSE 'trusted_120d_unflagged_bypass' END,
        'code',    'ok'
      );
    END IF;
  END IF;

  -- Per pair 24h — aggregates across ALL five user→user channels
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pair_24h
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '24 hours'
     AND metadata->>'recipient_id' = p_recipient_id::text
     AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')
       OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));
  IF v_pair_24h + p_amount > CAP_PER_PAIR_24H THEN
    RETURN jsonb_build_object('allowed', false, 'reason', format('Pair limit hit (%s 💎 / 24h to this user)', CAP_PER_PAIR_24H), 'code', 'pair_24h_cap');
  END IF;

  -- Per user 24h
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_24h
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '24 hours'
     AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')
       OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));
  IF v_total_24h + p_amount > CAP_PER_USER_24H THEN
    RETURN jsonb_build_object('allowed', false, 'reason', format('Daily limit hit (%s 💎 / 24h)', CAP_PER_USER_24H), 'code', 'user_24h_cap');
  END IF;

  -- Burst 60s
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_burst_60s
    FROM diamond_transactions
   WHERE user_id = p_sender_id
     AND amount  < 0
     AND created_at > now() - interval '60 seconds'
     AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')
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
  'Channels: live_gift_sent, diamond_gift_sent (transaction_type) + '
  'stream_gift, wallet_transfer, wallet_diamond_transfer (source). '
  'Banned-by-recipient and self-transfer guards still apply to everyone. '
  'KINGFISH sender bypass remains the first short-circuit.';

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger enforcement: extend to recognize 'diamond_gift_sent'.
-- SECURITY INVOKER preserved per documented trigger arch lesson.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_enforce_anti_farming_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient uuid;
  v_check     jsonb;
  v_kingfish  uuid := '47965354-0e56-43ef-931c-ddaab82af765';
BEGIN
  -- Only enforce on outbound (debit) rows
  IF NEW.amount IS NULL OR NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  -- Only on user→user diamond movement channels
  IF NOT (
       NEW.transaction_type IN ('live_gift_sent','diamond_gift_sent')
    OR NEW.source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
  ) THEN
    RETURN NEW;
  END IF;

  -- KINGFISH sender bypass
  IF NEW.user_id = v_kingfish THEN
    RETURN NEW;
  END IF;

  -- Recipient_id required in metadata
  v_recipient := NULLIF(NEW.metadata->>'recipient_id', '')::uuid;
  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'Anti-farming: recipient_id missing from metadata for % transaction',
      COALESCE(NEW.transaction_type, NEW.source)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Delegate to shared cap function
  v_check := public.fn_check_anti_farming_gift_cap(NEW.user_id, v_recipient, ABS(NEW.amount));

  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Anti-farming: %', v_check->>'reason'
      USING ERRCODE = 'check_violation', DETAIL = v_check::text;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_enforce_anti_farming_caps() IS
  'GFT-5 last-line defense BEFORE INSERT trigger on diamond_transactions. '
  'Enforces fn_check_anti_farming_gift_cap on debit rows for the five '
  'user-to-user diamond movement channels: live_gift_sent + diamond_gift_sent '
  '(transaction_type) and stream_gift + wallet_transfer + wallet_diamond_transfer '
  '(source). SECURITY INVOKER so it inherits caller privilege semantics.';
