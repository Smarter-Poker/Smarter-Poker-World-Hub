-- ═══════════════════════════════════════════════════════════════════════
-- Tier 4.4: Venue Reviews & Ratings — Full 5-Star Category System
-- Adds 5 category rating columns, verified player flag, and
-- recalculate_venue_trust_score() RPC for live trust score updates.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add category rating columns (1–5 stars each, nullable = optional)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'dealers_rating') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN dealers_rating SMALLINT CHECK (dealers_rating >= 1 AND dealers_rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'atmosphere_rating') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN atmosphere_rating SMALLINT CHECK (atmosphere_rating >= 1 AND atmosphere_rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'food_drinks_rating') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN food_drinks_rating SMALLINT CHECK (food_drinks_rating >= 1 AND food_drinks_rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'waitlist_speed_rating') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN waitlist_speed_rating SMALLINT CHECK (waitlist_speed_rating >= 1 AND waitlist_speed_rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'game_selection_rating') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN game_selection_rating SMALLINT CHECK (game_selection_rating >= 1 AND game_selection_rating <= 5);
    END IF;
END $$;

-- 2. Add reviewer_name, review_text, is_verified_player, helpful/unhelpful (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'reviewer_name') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN reviewer_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'review_text') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN review_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'is_verified_player') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN is_verified_player BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'helpful_count') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN helpful_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_reviews' AND column_name = 'unhelpful_count') THEN
        ALTER TABLE public.venue_reviews ADD COLUMN unhelpful_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 3. Add user_id column index for fast "my reviews" queries
CREATE INDEX IF NOT EXISTS idx_venue_reviews_user_id ON public.venue_reviews (user_id);

-- 4. Composite index for category averages
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_categories
    ON public.venue_reviews (venue_id)
    INCLUDE (rating, dealers_rating, atmosphere_rating, food_drinks_rating, waitlist_speed_rating, game_selection_rating);

-- 5. DELETE policy — users can delete own reviews
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'venue_reviews' AND policyname = 'Users can delete own reviews'
    ) THEN
        CREATE POLICY "Users can delete own reviews" ON public.venue_reviews FOR DELETE USING (auth.uid()::text = user_id::text);
    END IF;
END $$;

-- 6. RPC: Recalculate a venue's trust_score from its review average
CREATE OR REPLACE FUNCTION public.recalculate_venue_trust_score(p_venue_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_avg NUMERIC;
    v_count INTEGER;
BEGIN
    SELECT AVG(rating)::numeric(3,2), COUNT(*)
    INTO v_avg, v_count
    FROM public.venue_reviews
    WHERE venue_id = p_venue_id;

    -- Only update if there are reviews (preserve old trust_score for zero-review venues)
    IF v_count > 0 THEN
        UPDATE public.venues
        SET trust_score = v_avg
        WHERE id::text = p_venue_id;
    END IF;
END;
$$;
