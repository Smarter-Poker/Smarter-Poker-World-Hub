-- Add missing notification preference columns
ALTER TABLE public.user_notification_preferences ADD COLUMN IF NOT EXISTS live_notifications boolean DEFAULT true;
ALTER TABLE public.user_notification_preferences ADD COLUMN IF NOT EXISTS messenger_alerts boolean DEFAULT true;
ALTER TABLE public.user_notification_preferences ADD COLUMN IF NOT EXISTS daily_challenges boolean DEFAULT true;
ALTER TABLE public.user_notification_preferences ADD COLUMN IF NOT EXISTS diamond_rewards boolean DEFAULT true;
ALTER TABLE public.user_notification_preferences ADD COLUMN IF NOT EXISTS club_updates boolean DEFAULT true;
