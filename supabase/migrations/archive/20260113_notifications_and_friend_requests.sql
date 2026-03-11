-- Notifications Table for Friend Requests and More
-- Created: 2026-01-13

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'friend_request', 'friend_accept', 'like', 'comment', 'mention'
    title TEXT NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}', -- Additional data like sender_id, post_id, etc.
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- System can insert notifications (via trigger)
CREATE POLICY "System can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = false;

-- Function to create notification when friend request is sent
CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    -- Get sender's name
    SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
    FROM public.profiles WHERE id = NEW.user_id;
    
    -- Create notification for the recipient
    -- Format: "{sender_name} {message}" - message is what comes after the name
    -- Facebook-style examples:
    --   "Seth Gordon sent you a friend request"
    --   "Seth Gordon accepted your friend request"
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        NEW.friend_id,
        CASE WHEN NEW.status = 'pending' THEN 'friend_request' ELSE 'friend_accept' END,
        sender_name,
        CASE WHEN NEW.status = 'pending'
            THEN 'sent you a friend request'
            ELSE 'accepted your friend request'
        END,
        jsonb_build_object(
            'sender_id', NEW.user_id,
            'friendship_id', NEW.id,
            'sender_name', sender_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for friend request notifications
DROP TRIGGER IF EXISTS trg_notify_friend_request ON public.friendships;
CREATE TRIGGER trg_notify_friend_request
AFTER INSERT ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_friend_request();

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION public.fn_get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM public.notifications WHERE user_id = p_user_id AND read = false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update friendships to support pending status
-- Add pending friend requests to be shown on the friends page
