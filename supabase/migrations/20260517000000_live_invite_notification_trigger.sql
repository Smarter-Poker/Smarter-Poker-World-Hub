-- ═══════════════════════════════════════════════════════════════════════════
-- Live Stream Invite Notifications Trigger
-- Migration: 20260517000000_live_invite_notification_trigger.sql
--
-- Objective:
-- Automatically insert into notifications table when a co-host [LIVE_INVITE]
-- is inserted into social_messages, so the recipient receives it in real-time.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_fn_live_invite_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient_id uuid;
    v_sender_name text;
BEGIN
    -- Only trigger for [LIVE_INVITE] messages
    IF NEW.content IS NOT NULL AND NEW.content LIKE '[LIVE_INVITE]%' THEN
        -- Find the recipient (the other participant in the direct conversation)
        SELECT user_id INTO v_recipient_id
        FROM public.social_conversation_participants
        WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
        LIMIT 1;

        -- Get the sender's name
        SELECT COALESCE(full_name, username, 'Someone') INTO v_sender_name
        FROM public.profiles
        WHERE id = NEW.sender_id;

        IF v_recipient_id IS NOT NULL THEN
            -- Insert the notification record
            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                message,
                data,
                read
            ) VALUES (
                v_recipient_id,
                'live_invite',
                'Live Stream Invite',
                v_sender_name || ' invited you to join their live stream as a guest co-host.',
                jsonb_build_object(
                    'conversation_id', NEW.conversation_id,
                    'message_id', NEW.id,
                    'content', NEW.content,
                    'sender_name', v_sender_name
                ),
                false
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists to prevent duplicate error on migration re-run
DROP TRIGGER IF EXISTS trg_live_invite_notification ON public.social_messages;

CREATE TRIGGER trg_live_invite_notification
AFTER INSERT ON public.social_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_live_invite_notification();
