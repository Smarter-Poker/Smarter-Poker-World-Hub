-- Add tracked_tours array to user_notification_preferences for Phase 4 Poker Tours upgrade
-- Create table if it doesn't exist yet!
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_reminders BOOLEAN DEFAULT true,
    social_mentions BOOLEAN DEFAULT true,
    friend_activity BOOLEAN DEFAULT false,
    venue_alerts BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_notification_preferences
ADD COLUMN IF NOT EXISTS tracked_tours TEXT[] DEFAULT '{}';

-- Safely convert existing null arrays to empty arrays just in case
UPDATE public.user_notification_preferences 
SET tracked_tours = '{}'
WHERE tracked_tours IS NULL;
