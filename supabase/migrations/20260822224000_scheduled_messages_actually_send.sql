-- SCHEDULED MESSAGES WERE NEVER SENT.
--
-- useMessengerService.scheduleMessage writes a row into messenger_scheduled
-- with status 'pending', the UI lists it, and cancelScheduledMessage can
-- withdraw it. Nothing anywhere ever selected a due row and delivered it:
-- not pages/api/cron (28 handlers), not vercel.json crons, not the Open Claw
-- dispatcher, not pg_cron, not any Postgres function. The table was
-- write-only. A user scheduling a message got a confirmation and silence.
--
-- This is the delivery half. It is deliberately conservative:
--
--   * only rows that are due and still 'pending' are touched
--   * FOR UPDATE SKIP LOCKED, so two overlapping dispatch runs cannot send
--     the same row twice
--   * a row whose sender is no longer a participant is marked 'failed'
--     rather than retried forever
--   * one bad row cannot stop the batch
--   * a batch cap keeps a run bounded
--
-- Status vocabulary matches what the client already writes and reads:
-- 'pending' -> 'sent' | 'failed', with 'cancelled' set by the client.
--
-- Triggered by /api/messenger/dispatch-scheduled every five minutes from Open
-- Claw. It lives outside pages/api/cron/ because CLAUDE.md section 11.3 blocks
-- net-new files there, and forbids pg_cron for application logic - which
-- sending a user's queued message is.
--
-- Applied to production via Supabase MCP as 'scheduled_messages_actually_send'.

CREATE OR REPLACE FUNCTION public.fn_messenger_dispatch_scheduled(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lim   int := GREATEST(LEAST(COALESCE(p_limit, 200), 1000), 1);
  v_sent  int := 0;
  v_failed int := 0;
  r       record;
BEGIN
  FOR r IN
    SELECT s.id, s.conversation_id, s.sender_id, s.text, s.message_type, s.media_url
      FROM messenger_scheduled s
     WHERE s.status = 'pending'
       AND s.scheduled_at <= now()
     ORDER BY s.scheduled_at ASC
     LIMIT v_lim
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM messenger_participants p
         WHERE p.conversation_id = r.conversation_id
           AND p.user_id = r.sender_id
      ) THEN
        UPDATE messenger_scheduled
           SET status = 'failed', updated_at = now()
         WHERE id = r.id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      INSERT INTO messenger_messages
        (conversation_id, sender_id, text, message_type, media_url, status)
      VALUES
        (r.conversation_id, r.sender_id, r.text,
         COALESCE(NULLIF(r.message_type, ''), 'text'), r.media_url, 'sent');

      UPDATE messenger_conversations
         SET last_message_text = left(COALESCE(r.text, ''), 200),
             last_message_at   = now(),
             updated_at        = now()
       WHERE id = r.conversation_id;

      UPDATE messenger_scheduled
         SET status = 'sent', updated_at = now()
       WHERE id = r.id;

      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE messenger_scheduled
         SET status = 'failed', updated_at = now()
       WHERE id = r.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'sent', v_sent, 'failed', v_failed,
                            'ran_at', now());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_messenger_dispatch_scheduled(integer)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v jsonb;
BEGIN
  v := fn_messenger_dispatch_scheduled(10);
  IF COALESCE((v->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'dispatcher did not run: %', v::text;
  END IF;
  RAISE NOTICE 'scheduled dispatcher live: %', v::text;
END $$;
