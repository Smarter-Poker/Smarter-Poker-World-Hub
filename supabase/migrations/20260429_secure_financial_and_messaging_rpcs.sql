-- SECURITY HARDENING: lock down 6 SECURITY DEFINER RPCs that accept arbitrary
-- user-id parameters and were granted EXECUTE to PUBLIC + anon + authenticated.
--
-- Functions covered:
--   1. fn_send_message            — authenticated allowed BUT must match auth.uid()
--   2. fn_add_chips               — service_role only (admin operation)
--   3. fn_add_diamonds            — service_role only (admin operation)
--   4. fn_add_prepaid_credit_atomic — service_role only (admin operation)
--   5. fn_create_settlement_period  — service_role only (admin operation)
--   6. fn_create_media_upload     — service_role only (function is a stub anyway)
--
-- Why each treatment:
--
--   fn_send_message has many legitimate browser callers (messenger.js, social-
--   media/index.js, MessagingService.js) where authenticated users send their
--   own messages. The function already gates on conversation membership via
--   social_conversation_participants. We add an in-body check that p_sender_id
--   must equal auth.uid() for the authenticated role; service_role bypasses
--   (used by server endpoints like /api/club-arena/{request,approve}-cashout
--   and /api/home-games/message-host that already verified the caller).
--
--   The remaining 5 functions have NO browser callers in this codebase grep —
--   they're called only from server endpoints with service_role. Restricting
--   EXECUTE to service_role removes the pre-fix vulnerability where any anon
--   visitor could mint chips/diamonds for any user via direct curl. If any
--   future code needs to invoke these from the browser, that code must go
--   through a server endpoint that performs admin authorization — which is
--   the correct architectural pattern for financial mutations anyway.
--
-- Sweep 4 of the upload-flow audit, 2026-04-29.

-- ─── 1. fn_send_message — keep authenticated, add auth.uid() check ────────
REVOKE EXECUTE ON FUNCTION public.fn_send_message(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_send_message(uuid, uuid, text, text, jsonb) FROM anon;

CREATE OR REPLACE FUNCTION public.fn_send_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text'::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_message_id uuid;
    v_is_participant boolean;
    v_caller_role text;
    v_caller_uid uuid;
BEGIN
    IF p_conversation_id IS NULL OR p_sender_id IS NULL OR COALESCE(p_content,'') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing conversation/sender/content');
    END IF;

    v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    v_caller_uid := auth.uid();

    -- AUTHENTICATED users may only send messages AS THEMSELVES.
    -- service_role bypasses (server endpoints with their own auth check).
    -- anon is rejected (REVOKE handles it; this is defense-in-depth).
    IF v_caller_role = 'authenticated' THEN
        IF v_caller_uid IS NULL OR p_sender_id <> v_caller_uid THEN
            RETURN jsonb_build_object('success', false, 'error', 'forbidden: cannot send messages as another user');
        END IF;
    ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden: anonymous callers cannot send messages');
    END IF;

    -- Existing participant check still applies (sender must be in conversation).
    SELECT EXISTS (
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RETURN jsonb_build_object('success', false, 'error', 'sender is not a participant');
    END IF;

    INSERT INTO social_messages (conversation_id, sender_id, content, message_type)
    VALUES (p_conversation_id, p_sender_id, p_content, COALESCE(p_message_type, 'text'))
    RETURNING id INTO v_message_id;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id, 'conversation_id', p_conversation_id);
END;
$function$;

-- ─── 2-6. Restrict financial / system RPCs to service_role only ─────────
-- Browser-side code never calls these in this codebase. Server endpoints
-- that legitimately mutate financial state already use service_role.

REVOKE EXECUTE ON FUNCTION public.fn_add_chips(uuid, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_add_chips(uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_add_chips(uuid, uuid, numeric) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_add_diamonds(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_add_diamonds(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_add_diamonds(uuid, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_add_prepaid_credit_atomic(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_add_prepaid_credit_atomic(uuid, uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_add_prepaid_credit_atomic(uuid, uuid, numeric, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_create_settlement_period(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_create_settlement_period(uuid, uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_create_settlement_period(uuid, uuid, date, date) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_create_media_upload(uuid, text, text) FROM authenticated;
