-- Create user_venue_checkins table
CREATE TABLE IF NOT EXISTS public.user_venue_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    checkin_time TIMESTAMPTZ DEFAULT now(),
    review_prompt_sent BOOLEAN DEFAULT false,
    review_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick cron querying
CREATE INDEX IF NOT EXISTS idx_user_venue_checkins_prompt ON public.user_venue_checkins (checkin_time, review_prompt_sent) WHERE review_prompt_sent = false;

-- Create venue_reviews table
CREATE TABLE IF NOT EXISTS public.venue_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) DEFAULT 5,
    text TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for venue fast-loading
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_id ON public.venue_reviews (venue_id);

-- Apply RLS for checkins
ALTER TABLE public.user_venue_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own checkins" ON public.user_venue_checkins FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own checkins" ON public.user_venue_checkins FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own checkins" ON public.user_venue_checkins FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Apply RLS for reviews
ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reviews" ON public.venue_reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews" ON public.venue_reviews FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own reviews" ON public.venue_reviews FOR UPDATE USING (auth.uid()::text = user_id::text);
