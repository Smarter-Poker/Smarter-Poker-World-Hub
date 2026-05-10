-- ============================================================
-- Migration : 20260508144836_unified_anti_farming_layer_gft5
-- Ticket     : GFT-5 — Unified Anti-Farming Layer
-- Applied    : 2026-05-08  (already live in prod; this file
--              records the source-of-truth SQL for the repo)
-- ============================================================
-- Objects created / replaced:
--   1. public.fn_check_anti_farming_gift_cap   — shared cap oracle
--   2. public.fn_enforce_anti_farming_caps     — BEFORE INSERT trigger fn
--   3. trg_enforce_anti_farming_caps           — trigger on diamond_transactions
--   4. public.send_stream_gift                 — patched RPC (calls cap oracle)
--   5. public.send_wallet_diamond_transfer     — patched RPC (calls cap oracle)
-- ============================================================

-- ── 1. Cap oracle ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(p_sender_id uuid, p_recipient_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kingfish        uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_pair_24h        bigint;
  v_total_24h       bigint;
  v_burst_60s       bigint;
  v_active_ban      boolean;
  -- Caps (anti-farming, not anti-VIP):
  CAP_PER_PAIR_24H  constant integer := 5000;
  CAP_PER_USER_24H  constant integer := 50000;
  CAP_BURST_60S     constant integer := 2000;
BEGIN
  IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid arguments', 'code', 'invalid_args');
  END IF;

  IF p_sender_id = p_recipient_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Cannot send to self', 'code', 'self_transfer');
  END IF;

  -- KINGFISH bypass (platform owner / promo distributions are exempt as sender)
  IF p_sender_id = v_kingfish THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');
  END IF;

  -- Hard block: only KINGFISH can send TO KINGFISH (closes confederate-bottling vector)
  IF p_recipient_id = v_kingfish THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Transfers to platform owner are not permitted',
      'code',   'kingfish_recipient_blocked'
    );
  END IF;

  -- Hard block: sender is banned by recipient (any active stream ban)
  SELECT EXISTS (
    SELECT 1
      FROM live_bans lb
      JOIN live_streams ls ON ls.id = lb.stream_id
     WHERE lb.banned_user_id = p_sender_id
       AND ls.broadcaster_id = p_recipient_id
  ) INTO v_active_ban;
  IF v_active_ban THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'You are banned from this broadcaster',
      'code',   'banned_by_recipient'
    );
  END IF;

  -- Per pair (sender→recipient) outbound in last 24h, across ALL gifting/transfer channels
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pair_24h
    FROM diamond_transactions
   WHERE user_id    = p_sender_id
     AND amount     < 0
     AND created_at > now() - interval '24 hours'
     AND (
           transaction_type = 'live_gift_sent'
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
         )
     AND (metadata->>'recipient_id')::uuid = p_recipient_id;

  IF v_pair_24h + p_amount > CAP_PER_PAIR_24H THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  format('24h cap to this recipient exceeded (%s + %s > %s 💎)',
                        v_pair_24h, p_amount, CAP_PER_PAIR_24H),
      'code',    'pair_24h_exceeded',
      'current', v_pair_24h,
      'cap',     CAP_PER_PAIR_24H
    );
  END IF;

  -- Per sender total outbound in last 24h, across ALL gifting/transfer channels
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_24h
    FROM diamond_transactions
   WHERE user_id    = p_sender_id
     AND amount     < 0
     AND created_at > now() - interval '24 hours'
     AND (
           transaction_type = 'live_gift_sent'
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
         );

  IF v_total_24h + p_amount > CAP_PER_USER_24H THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  format('24h aggregate cap exceeded (%s + %s > %s 💎)',
                        v_total_24h, p_amount, CAP_PER_USER_24H),
      'code',    'total_24h_exceeded',
      'current', v_total_24h,
      'cap',     CAP_PER_USER_24H
    );
  END IF;

  -- Per sender burst in last 60s — anti-script
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_burst_60s
    FROM diamond_transactions
   WHERE user_id    = p_sender_id
     AND amount     < 0
     AND created_at > now() - interval '60 seconds'
     AND (
           transaction_type = 'live_gift_sent'
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
         );

  IF v_burst_60s + p_amount > CAP_BURST_60S THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  format('60s burst cap exceeded (%s + %s > %s 💎)',
                        v_burst_60s, p_amount, CAP_BURST_60S),
      'code',    'burst_60s_exceeded',
      'current', v_burst_60s,
      'cap',     CAP_BURST_60S
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'code',    'ok',
    'current_24h_pair',  v_pair_24h,
    'current_24h_total', v_total_24h,
    'current_60s_burst', v_burst_60s,
    'caps', jsonb_build_object(
      'pair_24h',   CAP_PER_PAIR_24H,
      'total_24h',  CAP_PER_USER_24H,
      'burst_60s',  CAP_BURST_60S
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer) IS
  'GFT-5 unified anti-farming cap check. Called by send_wallet_diamond_transfer, '
  'send_stream_gift, gift.js. Caps are aggregated across ALL gifting/transfer '
  'channels (live_gift_sent, stream_gift, wallet_transfer, wallet_diamond_transfer) '
  'so wallet-route bypass of live-gift caps is closed.';

-- ── 2. Trigger enforcement function ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_enforce_anti_farming_caps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient uuid;
  v_check     jsonb;
  v_kingfish  uuid := '47965354-0e56-43ef-931c-ddaab82af765';
BEGIN
  -- Only enforce on outbound (debit) rows for the channels that move diamonds
  -- between users. Credits, refunds, system payouts, rewards all skip.
  IF NEW.amount IS NULL OR NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT (
       NEW.transaction_type = 'live_gift_sent'
    OR NEW.source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
  ) THEN
    RETURN NEW;
  END IF;

  -- KINGFISH sender bypass — platform-owner promo distributions
  IF NEW.user_id = v_kingfish THEN
    RETURN NEW;
  END IF;

  -- Pull recipient_id from metadata. Required for all enforced channels.
  v_recipient := NULLIF(NEW.metadata->>'recipient_id', '')::uuid;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'Anti-farming: recipient_id missing from metadata for % transaction',
      COALESCE(NEW.transaction_type, NEW.source)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Run the shared cap check
  v_check := public.fn_check_anti_farming_gift_cap(
    NEW.user_id, v_recipient, ABS(NEW.amount)
  );

  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Anti-farming: %', v_check->>'reason'
      USING ERRCODE = 'check_violation',
            DETAIL  = v_check::text;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_enforce_anti_farming_caps() IS
  'GFT-5 last-line defense. Fires on every diamond_transactions INSERT. '
  'Enforces fn_check_anti_farming_gift_cap on debit rows for live_gift_sent / '
  'stream_gift / wallet_transfer / wallet_diamond_transfer channels. SECURITY INVOKER '
  'so it inherits the caller''s privilege semantics.';

-- ── 3. Trigger on diamond_transactions ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_anti_farming_caps ON public.diamond_transactions;
CREATE TRIGGER trg_enforce_anti_farming_caps
  BEFORE INSERT ON public.diamond_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_anti_farming_caps();

-- ── 4. send_stream_gift (patched — calls cap oracle at GFT-5 gate) ───────────
CREATE OR REPLACE FUNCTION public.send_stream_gift(p_stream_id uuid, p_amount integer, p_message text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender             uuid := auth.uid();
  v_recipient          uuid;
  v_stream_status      text;
  v_sender_balance     integer;
  v_recipient_balance  integer;
  v_gift_id            uuid;
  v_ref                text := COALESCE(p_reference_id, gen_random_uuid()::text);
  v_cap_check          jsonb;
BEGIN
  -- ── Auth + arg validation ────────────────────────────────────────────────
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- ── Idempotency guard ────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = v_ref) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id', 'duplicate', true);
  END IF;

  -- ── Resolve stream + broadcaster ─────────────────────────────────────────
  SELECT broadcaster_id, status INTO v_recipient, v_stream_status
    FROM live_streams WHERE id = p_stream_id;

  IF v_recipient IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not found');
  END IF;
  IF v_stream_status <> 'live' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not live', 'status', v_stream_status);
  END IF;
  IF v_recipient = v_sender THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot gift yourself');
  END IF;

  -- ── GFT-5: anti-farming cap check (unified layer) ────────────────────────
  v_cap_check := public.fn_check_anti_farming_gift_cap(v_sender, v_recipient, p_amount);
  IF NOT (v_cap_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   v_cap_check->>'reason',
      'code',    v_cap_check->>'code',
      'cap_check', v_cap_check
    );
  END IF;

  -- ── Lock both profile rows ───────────────────────────────────────────────
  PERFORM 1 FROM profiles
   WHERE id IN (v_sender, v_recipient)
   ORDER BY id
   FOR UPDATE;

  -- ── Atomic balance check + deduct ────────────────────────────────────────
  UPDATE profiles
     SET diamonds        = diamonds - p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) - p_amount,
         updated_at      = now()
   WHERE id = v_sender
     AND diamonds >= p_amount
   RETURNING diamonds INTO v_sender_balance;

  IF v_sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  -- ── Credit broadcaster ───────────────────────────────────────────────────
  UPDATE profiles
     SET diamonds        = diamonds + p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) + p_amount,
         updated_at      = now()
   WHERE id = v_recipient
   RETURNING diamonds INTO v_recipient_balance;

  -- ── Log gift in stream feed ──────────────────────────────────────────────
  INSERT INTO live_gifts (stream_id, sender_id, receiver_id, amount, message)
  VALUES (p_stream_id, v_sender, v_recipient, p_amount, p_message)
  RETURNING id INTO v_gift_id;

  -- ── Sender debit (trigger re-validates) ──────────────────────────────────
  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_sender, -p_amount, 'spend', 'spend', 'stream_gift',
    'Gift sent in live stream',
    v_sender_balance, v_ref || ':sender',
    jsonb_build_object(
      'stream_id',    p_stream_id,
      'recipient_id', v_recipient,
      'gift_id',      v_gift_id,
      'message',      p_message
    )
  );

  -- ── Recipient credit ─────────────────────────────────────────────────────
  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_recipient, p_amount, 'earn', 'earn', 'stream_gift',
    'Gift received in live stream',
    v_recipient_balance, v_ref || ':recipient',
    jsonb_build_object(
      'stream_id', p_stream_id,
      'sender_id', v_sender,
      'gift_id',   v_gift_id,
      'message',   p_message
    )
  );

  RETURN jsonb_build_object(
    'success',         true,
    'gift_id',         v_gift_id,
    'sender_balance',  v_sender_balance,
    'amount',          p_amount,
    'reference_id',    v_ref
  );
END;
$function$;

-- ── 5. send_wallet_diamond_transfer (patched — calls cap oracle at GFT-5 gate)
CREATE OR REPLACE FUNCTION public.send_wallet_diamond_transfer(p_recipient_id uuid, p_amount integer, p_message text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender              uuid := auth.uid();
  v_sender_balance      integer;
  v_recipient_balance   integer;
  v_sender_username     text;
  v_recipient_username  text;
  v_ref                 text := COALESCE(p_reference_id, gen_random_uuid()::text);
  v_cap_check           jsonb;
BEGIN
  -- ── Auth + arg validation ────────────────────────────────────────────────
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_recipient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  IF p_recipient_id = v_sender THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  -- ── Idempotency guard ────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = v_ref) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id', 'duplicate', true);
  END IF;

  -- ── GFT-5: anti-farming cap check (unified layer) ────────────────────────
  v_cap_check := public.fn_check_anti_farming_gift_cap(v_sender, p_recipient_id, p_amount);
  IF NOT (v_cap_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   v_cap_check->>'reason',
      'code',    v_cap_check->>'code',
      'cap_check', v_cap_check
    );
  END IF;

  -- ── Resolve usernames + verify recipient exists ──────────────────────────
  SELECT username INTO v_sender_username    FROM profiles WHERE id = v_sender;
  SELECT username INTO v_recipient_username FROM profiles WHERE id = p_recipient_id;
  IF v_recipient_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
  END IF;

  -- ── Lock both profile rows in deterministic order ────────────────────────
  PERFORM 1 FROM profiles
   WHERE id IN (v_sender, p_recipient_id)
   ORDER BY id
   FOR UPDATE;

  -- ── Atomic balance check + deduct ────────────────────────────────────────
  UPDATE profiles
     SET diamonds        = diamonds - p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) - p_amount,
         updated_at      = now()
   WHERE id = v_sender
     AND diamonds >= p_amount
   RETURNING diamonds INTO v_sender_balance;

  IF v_sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  -- ── Credit recipient ─────────────────────────────────────────────────────
  UPDATE profiles
     SET diamonds        = diamonds + p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) + p_amount,
         updated_at      = now()
   WHERE id = p_recipient_id
   RETURNING diamonds INTO v_recipient_balance;

  -- ── Sender debit transaction (trigger re-validates cap as backstop) ──────
  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_sender, -p_amount, 'spend', 'spend', 'wallet_transfer',
    'Diamond transfer to @' || COALESCE(v_recipient_username, 'user'),
    v_sender_balance, v_ref || ':sender',
    jsonb_build_object(
      'recipient_id',       p_recipient_id,
      'recipient_username', v_recipient_username,
      'message',            p_message
    )
  );

  -- ── Recipient credit transaction ─────────────────────────────────────────
  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    p_recipient_id, p_amount, 'earn', 'earn', 'wallet_transfer',
    'Diamond transfer from @' || COALESCE(v_sender_username, 'user'),
    v_recipient_balance, v_ref || ':recipient',
    jsonb_build_object(
      'sender_id',       v_sender,
      'sender_username', v_sender_username,
      'message',         p_message
    )
  );

  -- ── Notify recipient ─────────────────────────────────────────────────────
  PERFORM fn_emit_home_notification(
    p_recipient_id,
    'diamond_transfer_received',
    'Diamonds received',
    'You received ' || p_amount || ' 💎 from @' || COALESCE(v_sender_username, 'someone'),
    '/wallet/transactions',
    jsonb_build_object(
      'amount',           p_amount,
      'sender_id',        v_sender,
      'sender_username',  v_sender_username,
      'message',          p_message,
      'reference_id',     v_ref,
      'source',           'wallet_transfer'
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'success',           true,
    'sender_balance',    v_sender_balance,
    'recipient_balance', v_recipient_balance,
    'amount',            p_amount,
    'reference_id',      v_ref
  );
END;
$function$;
