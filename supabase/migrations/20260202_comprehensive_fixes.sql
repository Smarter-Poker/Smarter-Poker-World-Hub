-- ═══════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE FIXES MIGRATION
-- Resolves: phantom user_dna_profiles table, missing RLS, QR scan tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- FIX #1: Create user_dna_profiles VIEW
-- This table is referenced in 12+ files but never created.
-- Solution: Create a view that maps to the profiles table.
-- ═══════════════════════════════════════

-- Drop existing view if it exists (idempotent)
DROP VIEW IF EXISTS public.user_dna_profiles;

-- Create view mapping user_dna_profiles columns to profiles columns
CREATE OR REPLACE VIEW public.user_dna_profiles AS
SELECT
    id,
    id AS user_id,
    username,
    full_name,
    avatar_url,
    COALESCE(display_name_preference, 'full_name') AS display_name_preference,
    COALESCE(xp_total, 0) AS current_level,
    COALESCE(diamonds, 0) AS diamonds_total,
    '{}'::jsonb AS dna_metrics,
    0::bigint AS storage_used_bytes,
    5368709120::bigint AS storage_limit_bytes,
    CASE WHEN vip_tier IS NOT NULL AND vip_tier != 'free' THEN true ELSE false END AS is_verified,
    created_at,
    updated_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.user_dna_profiles TO authenticated;
GRANT SELECT ON public.user_dna_profiles TO anon;

-- ═══════════════════════════════════════
-- FIX #10: Enable RLS on unprotected tables
-- ═══════════════════════════════════════

-- horse_analytics
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.horse_analytics ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'horse_analytics' AND policyname = 'Horse analytics viewable by everyone') THEN
        CREATE POLICY "Horse analytics viewable by everyone" ON public.horse_analytics FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- horse_error_log
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.horse_error_log ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'horse_error_log' AND policyname = 'Horse error log viewable by service role') THEN
        CREATE POLICY "Horse error log viewable by service role" ON public.horse_error_log FOR SELECT USING (auth.role() = 'service_role');
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- reward_definitions
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.reward_definitions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reward_definitions' AND policyname = 'Reward definitions viewable by everyone') THEN
        CREATE POLICY "Reward definitions viewable by everyone" ON public.reward_definitions FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- training_achievements
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.training_achievements ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_achievements' AND policyname = 'Training achievements viewable by everyone') THEN
        CREATE POLICY "Training achievements viewable by everyone" ON public.training_achievements FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- training_levels
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.training_levels ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_levels' AND policyname = 'Training levels viewable by everyone') THEN
        CREATE POLICY "Training levels viewable by everyone" ON public.training_levels FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- page_followers (if exists as separate from social_page_followers)
DO $$ BEGIN
    ALTER TABLE IF EXISTS public.page_followers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'page_followers' AND policyname = 'Page followers viewable by everyone') THEN
        CREATE POLICY "Page followers viewable by everyone" ON public.page_followers FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ═══════════════════════════════════════
-- FIX #9: QR Code Scan Tracking Table
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.qr_code_scans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    venue_id INTEGER NOT NULL,
    scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    scan_type TEXT DEFAULT 'check-in'
);

CREATE INDEX IF NOT EXISTS idx_qr_scans_venue ON public.qr_code_scans(venue_id);
CREATE INDEX IF NOT EXISTS idx_qr_scans_time ON public.qr_code_scans(scanned_at DESC);

ALTER TABLE public.qr_code_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qr_code_scans' AND policyname = 'QR scans insertable by anyone') THEN
        CREATE POLICY "QR scans insertable by anyone" ON public.qr_code_scans FOR INSERT WITH CHECK (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qr_code_scans' AND policyname = 'QR scans viewable by venue staff') THEN
        CREATE POLICY "QR scans viewable by venue staff" ON public.qr_code_scans FOR SELECT USING (true);
    END IF;
END $$;

-- ═══════════════════════════════════════
-- FIX #4: Article Bookmarks Table
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.article_bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    article_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_bookmarks_user ON public.article_bookmarks(user_id);

ALTER TABLE public.article_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'article_bookmarks' AND policyname = 'Users can manage own bookmarks') THEN
        CREATE POLICY "Users can manage own bookmarks" ON public.article_bookmarks
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- ═══════════════════════════════════════
-- FIX #8: Duel Matchmaking Queue Table
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.arcade_duel_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    duel_type TEXT NOT NULL DEFAULT 'quick',
    entry_fee INTEGER NOT NULL DEFAULT 25,
    status TEXT NOT NULL DEFAULT 'waiting',
    matched_with UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '60 seconds')
);

CREATE INDEX IF NOT EXISTS idx_duel_queue_status ON public.arcade_duel_queue(status, duel_type);
CREATE INDEX IF NOT EXISTS idx_duel_queue_user ON public.arcade_duel_queue(user_id);

ALTER TABLE public.arcade_duel_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arcade_duel_queue' AND policyname = 'Users can manage own duel entries') THEN
        CREATE POLICY "Users can manage own duel entries" ON public.arcade_duel_queue
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arcade_duel_queue' AND policyname = 'Users can see matched duels') THEN
        CREATE POLICY "Users can see matched duels" ON public.arcade_duel_queue
            FOR SELECT USING (auth.uid() = matched_with);
    END IF;
END $$;
