-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_diamond_rpcs_send_stream_gift_and_wallet_transfer
-- Version:   20260507125125
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     PR #240 — fix(streaming): full sweep — 10 bugs
--
-- Purpose
--   Two atomic RPCs covering the two diamond-transfer code paths in the
--   streaming product, with the correct notification behaviour baked into
--   each at the data layer:
--
--   send_stream_gift              — gift during a live stream. NEVER notifies.
--                                    Surfaces only via realtime broadcast +
--                                    diamond_transactions ledger + live_gifts row.
--
--   send_wallet_diamond_transfer  — direct wallet → wallet transfer. ALWAYS
--                                    notifies the recipient via the canonical
--                                    fn_emit_home_notification path.
--
--   Both are SECURITY DEFINER, use auth.uid() to prevent spoofing, lock the
--   two affected profile rows in deterministic id-order to avoid deadlocks,
--   and are idempotent against accidental double-tap via reference_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_stream_gift(
  p_stream_id   uuid,
  p_amount      integer,
  p_message     text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender         uuid := auth.uid();
  v_recipient      uuid;
  v_stream_status  text;
  v_sender_balance integer;
  v_recipient_balance integer;
  v_gift_id        uuid;
  v_ref            text := COALESCE(p_reference_id, gen_random_uuid()::text);
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = v_ref) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id', 'duplicate', true);
  END IF;

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

  PERFORM 1 FROM profiles WHERE id IN (v_sender, v_recipient) ORDER BY id FOR UPDATE;

  UPDATE profiles
     SET diamonds        = diamonds - p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) - p_amount,
         updated_at      = now()
   WHERE id = v_sender AND diamonds >= p_amount
   RETURNING diamonds INTO v_sender_balance;

  IF v_sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  UPDATE profiles
     SET diamonds        = diamonds + p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) + p_amount,
         updated_at      = now()
   WHERE id = v_recipient
   RETURNING diamonds INTO v_recipient_balance;

  INSERT INTO live_gifts (stream_id, sender_id, receiver_id, amount, message)
  VALUES (p_stream_id, v_sender, v_recipient, p_amount, p_message)
  RETURNING id INTO v_gift_id;

  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_sender, -p_amount, 'spend', 'spend', 'stream_gift',
    'Gift sent in live stream',
    v_sender_balance, v_ref || ':sender',
    jsonb_build_object('stream_id', p_stream_id, 'recipient_id', v_recipient,
                       'gift_id', v_gift_id, 'message', p_message)
  );

  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_recipient, p_amount, 'earn', 'earn', 'stream_gift',
    'Gift received in live stream',
    v_recipient_balance, v_ref || ':recipient',
    jsonb_build_object('stream_id', p_stream_id, 'sender_id', v_sender,
                       'gift_id', v_gift_id, 'message', p_message)
  );

  -- *** No fn_emit_home_notification call. By design. ***

  RETURN jsonb_build_object(
    'success', true,
    'gift_id', v_gift_id,
    'sender_balance', v_sender_balance,
    'amount', p_amount,
    'reference_id', v_ref
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_stream_gift(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid, integer, text, text) TO authenticated;

COMMENT ON FUNCTION public.send_stream_gift IS
  'Atomic in-stream diamond gift. Deducts sender, credits broadcaster, logs live_gifts + diamond_transactions. NEVER emits notification (gift surfaces only in stream feed + wallet history).';


CREATE OR REPLACE FUNCTION public.send_wallet_diamond_transfer(
  p_recipient_id uuid,
  p_amount       integer,
  p_message      text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
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
BEGIN
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

  IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = v_ref) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id', 'duplicate', true);
  END IF;

  SELECT username INTO v_sender_username FROM profiles WHERE id = v_sender;
  SELECT username INTO v_recipient_username FROM profiles WHERE id = p_recipient_id;
  IF v_recipient_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
  END IF;

  PERFORM 1 FROM profiles WHERE id IN (v_sender, p_recipient_id) ORDER BY id FOR UPDATE;

  UPDATE profiles
     SET diamonds        = diamonds - p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) - p_amount,
         updated_at      = now()
   WHERE id = v_sender AND diamonds >= p_amount
   RETURNING diamonds INTO v_sender_balance;

  IF v_sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  UPDATE profiles
     SET diamonds        = diamonds + p_amount,
         diamond_balance = COALESCE(diamond_balance, diamonds) + p_amount,
         updated_at      = now()
   WHERE id = p_recipient_id
   RETURNING diamonds INTO v_recipient_balance;

  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    v_sender, -p_amount, 'spend', 'spend', 'wallet_transfer',
    'Diamond transfer to @' || COALESCE(v_recipient_username, 'user'),
    v_sender_balance, v_ref || ':sender',
    jsonb_build_object('recipient_id', p_recipient_id,
                       'recipient_username', v_recipient_username,
                       'message', p_message)
  );

  INSERT INTO diamond_transactions (
    user_id, amount, transaction_type, type, source, description,
    balance_after, reference_id, metadata
  ) VALUES (
    p_recipient_id, p_amount, 'earn', 'earn', 'wallet_transfer',
    'Diamond transfer from @' || COALESCE(v_sender_username, 'user'),
    v_recipient_balance, v_ref || ':recipient',
    jsonb_build_object('sender_id', v_sender,
                       'sender_username', v_sender_username,
                       'message', p_message)
  );

  PERFORM fn_emit_home_notification(
    p_recipient_id,
    'diamond_transfer_received',
    'Diamonds received',
    'You received ' || p_amount || ' 💎 from @' || COALESCE(v_sender_username, 'someone'),
    '/wallet/transactions',
    jsonb_build_object('amount', p_amount,
                       'sender_id', v_sender,
                       'sender_username', v_sender_username,
                       'message', p_message,
                       'reference_id', v_ref,
                       'source', 'wallet_transfer'),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'sender_balance', v_sender_balance,
    'recipient_balance', v_recipient_balance,
    'amount', p_amount,
    'reference_id', v_ref
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_wallet_diamond_transfer(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_wallet_diamond_transfer(uuid, integer, text, text) TO authenticated;

COMMENT ON FUNCTION public.send_wallet_diamond_transfer IS
  'Atomic wallet-to-wallet diamond transfer. Deducts sender, credits recipient, logs diamond_transactions, ALWAYS emits notification to recipient.';
