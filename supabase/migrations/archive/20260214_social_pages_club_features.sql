-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL PAGES: Club Features Migration
-- Adds: status column to followers, expands page_type constraint,
--        updates follower count trigger to only count approved followers
-- Date: 2026-02-14
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- FIX #1: Add 'status' column to social_page_followers
-- Required for: home_game approval flow, pending/approved/rejected followers
-- ═══════════════════════════════════════

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'social_page_followers'
          AND column_name = 'status'
    ) THEN
        ALTER TABLE public.social_page_followers
            ADD COLUMN status TEXT DEFAULT 'approved'
            CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

-- ═══════════════════════════════════════
-- FIX #2: Expand page_type constraint on social_pages
-- The original CHECK only allowed: venue, group, brand, community
-- Code now also uses: club, home_game, charity
-- ═══════════════════════════════════════

-- Drop the old constraint (safe — name may vary)
DO $$ BEGIN
    ALTER TABLE public.social_pages DROP CONSTRAINT IF EXISTS social_pages_page_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Add the expanded constraint  
ALTER TABLE public.social_pages
    ADD CONSTRAINT social_pages_page_type_check
    CHECK (page_type IN ('venue', 'group', 'brand', 'community', 'club', 'home_game', 'charity'));

-- ═══════════════════════════════════════
-- FIX #3: Update follower_count trigger
-- Only count 'approved' followers, not 'pending' ones
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION update_page_follower_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Only increment if new follower is approved
        IF NEW.status = 'approved' THEN
            UPDATE social_pages SET follower_count = follower_count + 1, updated_at = NOW() WHERE id = NEW.page_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status changes (pending -> approved or approved -> removed)
        IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
            UPDATE social_pages SET follower_count = follower_count + 1, updated_at = NOW() WHERE id = NEW.page_id;
        ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
            UPDATE social_pages SET follower_count = GREATEST(0, follower_count - 1), updated_at = NOW() WHERE id = NEW.page_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Only decrement if removed follower was approved
        IF OLD.status = 'approved' THEN
            UPDATE social_pages SET follower_count = GREATEST(0, follower_count - 1), updated_at = NOW() WHERE id = OLD.page_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Rebuild the trigger to include UPDATE events
DROP TRIGGER IF EXISTS trg_page_follower_count ON social_page_followers;
CREATE TRIGGER trg_page_follower_count
    AFTER INSERT OR UPDATE OR DELETE ON social_page_followers
    FOR EACH ROW EXECUTE FUNCTION update_page_follower_count();

-- ═══════════════════════════════════════
-- FIX #4: RLS policy for service role operations
-- The follow API uses service_role key, so it bypasses RLS.
-- But ensure commanders (via service_role) can update follower status
-- ═══════════════════════════════════════

-- Allow page owners to manage followers on their pages (approve/reject)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_page_followers' AND policyname = 'Page owners manage followers') THEN
        CREATE POLICY "Page owners manage followers" ON social_page_followers
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM social_pages
                    WHERE social_pages.id = social_page_followers.page_id
                    AND social_pages.owner_id = auth.uid()
                )
            );
    END IF;
END $$;
