-- Go Live secondary deep-dive — foundational DB changes (2026-08-15)
-- (Applied to prod via Supabase MCP; mirrored here.)

-- 1. Per-guest revocation: remove one co-host mid-stream without ending the
--    stream or banning them from watching. token.js checks this so a removed
--    guest cannot re-mint a publish token via auto-reconnect.
CREATE TABLE IF NOT EXISTS public.live_guest_revocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id   uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  revoked_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, user_id)
);
ALTER TABLE public.live_guest_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_guest_revocations FROM PUBLIC, anon, authenticated;

-- 2. Rotate the shared invite code (broadcaster-only) — "revoke ALL outstanding invites".
CREATE OR REPLACE FUNCTION public.fn_rotate_guest_invite_code(p_stream_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_new uuid;
BEGIN
  UPDATE public.live_streams SET guest_invite_code = gen_random_uuid()
   WHERE id = p_stream_id AND broadcaster_id = auth.uid()
  RETURNING guest_invite_code INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'Not authorized to rotate invite for this stream'; END IF;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_rotate_guest_invite_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotate_guest_invite_code(uuid) TO authenticated;

-- 3. Queue .mp4/.m4v for server-side thumbnail extraction (iPhone "Most
--    Compatible" + Android produce H.264 mp4; previously never queued → blank
--    feed card). Only queue when a thumbnail is actually missing.
CREATE OR REPLACE FUNCTION public.fn_queue_video_transcode()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF NEW.content_type = 'video'
     AND (NEW.media_urls->>0) IS NOT NULL
     AND (
       (NEW.media_urls->>0) ILIKE '%.mov' OR (NEW.media_urls->>0) ILIKE '%.hevc'
       OR (NEW.media_urls->>0) ILIKE '%.heic' OR (NEW.media_urls->>0) ILIKE '%.mkv'
       OR (NEW.media_urls->>0) ILIKE '%.avi' OR (NEW.media_urls->>0) ILIKE '%.mp4'
       OR (NEW.media_urls->>0) ILIKE '%.m4v' OR (NEW.media_urls->>0) ILIKE '%.webm'
       OR (NEW.media_urls->>0) ILIKE '%/live-recordings/%'
     )
     AND (NEW.thumbnail_url IS NULL OR NEW.thumbnail_url = '')
  THEN
    NEW.transcode_status := 'queued';
    NEW.original_media_url := (NEW.media_urls->>0);
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.social_posts
   SET transcode_status = 'queued', original_media_url = COALESCE(original_media_url, media_urls->>0)
 WHERE content_type = 'video'
   AND (thumbnail_url IS NULL OR thumbnail_url = '')
   AND (media_urls->>0) IS NOT NULL
   AND COALESCE(transcode_status, '') NOT IN ('queued', 'processing')
   AND created_at > now() - interval '30 days';

-- 4. Scope the credit idempotency guard by user (was global — a client-chosen
--    key could collide with another user's gift reference and destroy diamonds).
CREATE OR REPLACE FUNCTION public.add_diamonds_to_balance(p_user_id uuid, p_amount integer, p_type text DEFAULT 'bonus'::text, p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_old_balance integer; v_new_balance integer; v_txn_id uuid;
    v_multiplier numeric(4,2) := 1.00; v_raw_amount integer := p_amount; v_actual_amount integer;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = p_reference_id AND user_id = p_user_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate reference_id: ' || p_reference_id, 'duplicate', true);
        END IF;
    END IF;
    SELECT COALESCE(diamonds, 0), COALESCE(diamond_multiplier, 1.00) INTO v_old_balance, v_multiplier
      FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
    IF v_raw_amount > 0
       AND p_type NOT IN ('purchase','deduction','adjustment','refund','transfer',
             'diamond_gift_received','diamond_gift_sent','diamond_gift_refund',
             'diamond_received','live_gift_received','live_gift_sent','vip_daily','vip_stipend')
       AND v_multiplier > 1.00
    THEN v_actual_amount := ROUND(v_raw_amount * v_multiplier);
    ELSE v_actual_amount := v_raw_amount;
    END IF;
    v_new_balance := v_old_balance + v_actual_amount;
    IF v_new_balance < 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds'); END IF;
    UPDATE profiles SET diamonds = v_new_balance, diamond_balance = v_new_balance, updated_at = now() WHERE id = p_user_id;
    INSERT INTO diamond_transactions (user_id, amount, transaction_type, type, description, balance_after, reference_id, metadata)
    VALUES (p_user_id, v_actual_amount, p_type, p_type,
        CASE WHEN v_actual_amount <> v_raw_amount THEN COALESCE(p_description,'') || format(' [%sx boost]', v_multiplier) ELSE p_description END,
        v_new_balance, p_reference_id,
        jsonb_build_object('reference_id', p_reference_id, 'raw_amount', v_raw_amount, 'multiplier', v_multiplier))
    RETURNING id INTO v_txn_id;
    RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance,
        'amount', v_actual_amount, 'multiplier', v_multiplier, 'transaction_id', v_txn_id);
END;
$function$;
