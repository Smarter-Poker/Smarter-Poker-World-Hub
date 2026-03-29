CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_reminders BOOLEAN DEFAULT true,
    social_mentions BOOLEAN DEFAULT true,
    friend_activity BOOLEAN DEFAULT false,
    venue_alerts BOOLEAN DEFAULT true,
    daily_challenges BOOLEAN DEFAULT true,
    messenger BOOLEAN DEFAULT true,
    diamond_rewards BOOLEAN DEFAULT true,
    club_updates BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.user_notification_preferences;
    DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.user_notification_preferences;
    DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.user_notification_preferences;
END $$;

CREATE POLICY "Users can view own notification preferences" 
ON public.user_notification_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences" 
ON public.user_notification_preferences FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences" 
ON public.user_notification_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.user_notification_preferences;
CREATE TRIGGER handle_updated_at 
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
