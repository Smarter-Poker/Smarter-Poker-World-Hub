-- Create user_pwa_alerts table for PWA Push Notification triggers
CREATE TABLE IF NOT EXISTS public.user_pwa_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    venue_id BIGINT REFERENCES public.poker_venues(id) ON DELETE CASCADE,
    tournament_id BIGINT,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('late_reg', 'table_size', 'tournament_reminder')),
    threshold INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_triggered_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.user_pwa_alerts ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON TABLE public.user_pwa_alerts TO authenticated;
GRANT ALL ON TABLE public.user_pwa_alerts TO service_role;

-- Policies
CREATE POLICY "Users can manage their own PWA alerts"
    ON public.user_pwa_alerts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service Role has full access to PWA alerts"
    ON public.user_pwa_alerts
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for cron sweeping
CREATE INDEX IF NOT EXISTS idx_user_pwa_alerts_active
    ON public.user_pwa_alerts(alert_type, is_active, last_triggered_at);
