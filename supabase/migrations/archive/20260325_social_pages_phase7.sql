-- Phase 7: Social Pages Hardening SQL Migration
-- 1. Add updated_at column to social_page_followers (needed by follow PUT handler)
-- 2. Create social_page_reports table for Report functionality

-- ========================================
-- 1. Add updated_at to social_page_followers
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'social_page_followers'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.social_page_followers
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ========================================
-- 2. Create social_page_reports table
-- ========================================
CREATE TABLE IF NOT EXISTS social_page_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES social_pages(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'fake', 'harassment', 'inappropriate', 'other')),
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_page_reports_page ON social_page_reports(page_id);
CREATE INDEX IF NOT EXISTS idx_social_page_reports_status ON social_page_reports(status);

-- RLS
ALTER TABLE social_page_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports (INSERT) but only admins can SELECT/UPDATE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_page_reports' AND policyname = 'Anyone can report') THEN
        CREATE POLICY "Anyone can report" ON social_page_reports FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_page_reports' AND policyname = 'Admins view reports') THEN
        CREATE POLICY "Admins view reports" ON social_page_reports FOR SELECT USING (
            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        );
    END IF;
END $$;

-- ========================================
-- 3. Add view_count to social_pages if missing
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'social_pages'
          AND column_name = 'view_count'
    ) THEN
        ALTER TABLE public.social_pages
        ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- ========================================
-- 4. Add avg_rating to social_pages if missing
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'social_pages'
          AND column_name = 'avg_rating'
    ) THEN
        ALTER TABLE public.social_pages
        ADD COLUMN avg_rating NUMERIC(3,2) DEFAULT 0;
    END IF;
END $$;
