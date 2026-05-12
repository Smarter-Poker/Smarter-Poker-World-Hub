-- Fix the friend request trigger to send the accepted notification to the CORRECT user
CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    IF NEW.status = 'pending' THEN
        -- A sends request to B
        -- NEW.user_id = A, NEW.friend_id = B
        SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
        FROM public.profiles WHERE id = NEW.user_id;
        
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
            NEW.friend_id,
            'friend_request',
            sender_name,
            'sent you a friend request',
            jsonb_build_object(
                'sender_id', NEW.user_id,
                'friendship_id', NEW.id,
                'sender_name', sender_name
            )
        );
    ELSIF NEW.status = 'accepted' THEN
        -- B accepts request from A
        -- In our codebase, accepting a request creates a REVERSE row: NEW.user_id = B, NEW.friend_id = A
        -- B is the accepter. A is the requester.
        -- Notification should go to A (NEW.friend_id).
        -- Actor is B (NEW.user_id).
        SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
        FROM public.profiles WHERE id = NEW.user_id;
        
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
            NEW.friend_id,
            'friend_accept',
            sender_name,
            'accepted your friend request',
            jsonb_build_object(
                'sender_id', NEW.user_id,
                'friendship_id', NEW.id,
                'sender_name', sender_name
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
