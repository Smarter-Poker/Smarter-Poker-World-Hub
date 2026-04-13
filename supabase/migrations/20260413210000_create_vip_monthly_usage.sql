-- Create vip_monthly_usage table for VIPService
-- Tracks monthly VIP activity metrics per user

CREATE TABLE IF NOT EXISTS public.vip_monthly_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  month TEXT NOT NULL, -- format: 'YYYY-MM'
  hands_played INTEGER DEFAULT 0,
  tournaments_entered INTEGER DEFAULT 0,
  rake_contributed NUMERIC(12,2) DEFAULT 0,
  vip_points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.vip_monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON public.vip_monthly_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all" ON public.vip_monthly_usage
  FOR ALL USING (auth.role() = 'service_role');
