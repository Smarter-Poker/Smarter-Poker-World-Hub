-- Add trigger to update last_message_at and last_message_text automatically
CREATE OR REPLACE FUNCTION fn_update_messenger_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.messenger_conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_text = COALESCE(NEW.text, 'Shared ' || NEW.message_type),
        updated_at = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_messenger_conversation_last_message ON public.messenger_messages;
CREATE TRIGGER trg_update_messenger_conversation_last_message
    AFTER INSERT ON public.messenger_messages
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_messenger_conversation_last_message();
