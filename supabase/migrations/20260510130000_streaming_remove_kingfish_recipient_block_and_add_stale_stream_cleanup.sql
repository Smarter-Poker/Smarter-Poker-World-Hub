-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_remove_kingfish_recipient_block_and_add_stale_stream_cleanup
-- Applied:   2026-05-08 via Supabase MCP apply_migration
-- Audit:     Streaming live-bug-list audit
--
-- Bug 5: prior GFT-5 unified anti-farming layer
-- (20260508144836_unified_anti_farming_layer_gft5) added a hard block on
-- "transfers TO KingFish" labelled "closes confederate-bottling vector".
-- That label is wrong — confederate bottling is a SENDER concern, not a
-- recipient concern. The recipient block prevented Dan from testing the
-- gift flow on his own broadcasts (couldn't send 25/50/100 diamonds).
--
-- Fix: remove the recipient block. Sender bypass for KingFish kept (so
-- platform-owner promo distributions remain cap-exempt). All other
-- anti-farming guards (per-pair, per-user, burst, ban) unchanged. The
-- "real" confederate-bottling vector requires the SENDER to be KingFish
-- (auth.uid match), which adversaries can't fake.
--
-- Bug 8b: add fn_auto_end_stale_streams. Transitions live_streams rows
-- that haven't had preview_updated_at activity in p_timeout_seconds
-- (default 60) to status='ended'. The broadcaster's StreamPreviewCapture
-- uploads every ~25s while alive — missing 60s of updates means they're
-- disconnected (lost connection / power / closed app). Called from a
-- periodic cron / admin script. service_role only.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Patched anti-farming cap oracle (Bug 5) ─────────────────────────────
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

  -- KINGFISH sender bypass kept: platform owner / promo distributions exempt.
  IF p_sender_id = v_kingfish THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');
  END IF;

  -- Bug 5 fix: KINGFISH recipient block REMOVED. The confederate-bottling
  -- vector is sender-side. Senders can no longer bypass caps via this RPC
  -- without auth.uid match.

  SELECT EXISTS (
    SELECT 1 FROM live_bans lb
      JOIN live_streams ls ON ls.id = lb.stream_id
     WHERE lb.banned_user_id = p_sender_id
       AND ls.broadcaster_id = p_recipient_id
  ) INTO v_active_ban;
  IF v_active_ban THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'You are banned from this broadcaster', 'code', 'banned_by_recipient');
  END IF;

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

COMMENT ON FUNCTION public.fn_check_anti_farming_gift_cap IS
  'Bug 5 patch: removed KINGFISH recipient block (was blocking legitimate gifts to platform owner). Sender-side bypass for KINGFISH retained. All other caps unchanged.';

-- ── 2. fn_auto_end_stale_streams (Bug 8b) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_end_stale_streams(p_timeout_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ended_count integer := 0;
  v_stale_threshold timestamptz := now() - (p_timeout_seconds || ' seconds')::interval;
BEGIN
  WITH stale AS (
    SELECT id 
    FROM live_streams
    WHERE status = 'live'
      AND started_at < v_stale_threshold
      AND (preview_updated_at IS NULL OR preview_updated_at < v_stale_threshold)
  )
  UPDATE live_streams ls
     SET status   = 'ended',
         ended_at = now()
   WHERE ls.id IN (SELECT id FROM stale);

  GET DIAGNOSTICS v_ended_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'ended_count', v_ended_count,
    'timeout_seconds', p_timeout_seconds
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_auto_end_stale_streams(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_end_stale_streams(integer) TO service_role;

COMMENT ON FUNCTION public.fn_auto_end_stale_streams IS
  'Bug 8b: Transitions live streams that haven''t had preview_updated_at activity in p_timeout_seconds (default 60) to status=ended. Called from a periodic cron / admin script.';
