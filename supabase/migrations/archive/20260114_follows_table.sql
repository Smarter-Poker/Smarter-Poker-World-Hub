-- ═══════════════════════════════════════════════════════════════════════════
-- FOLLOWS TABLE
-- One-way follow relationships (like Twitter/Instagram)
-- Separate from friendships for cleaner data model
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'direct' CHECK (source IN ('direct', 'declined_friend_request')),
    
    -- Prevent self-follows and duplicate follows
    CONSTRAINT no_self_follow CHECK (follower_id != following_id),
    UNIQUE(follower_id, following_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created ON public.follows(created_at DESC);

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view follows (follows are public)
DROP POLICY IF EXISTS "follows_select_policy" ON public.follows;
CREATE POLICY "follows_select_policy" ON public.follows
    FOR SELECT USING (true);

-- Policy: Users can create follows (as the follower)
DROP POLICY IF EXISTS "follows_insert_policy" ON public.follows;
CREATE POLICY "follows_insert_policy" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Policy: Users can delete their own follows (unfollow)
DROP POLICY IF EXISTS "follows_delete_policy" ON public.follows;
CREATE POLICY "follows_delete_policy" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

-- Grant access
GRANT ALL ON public.follows TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Create notification when someone follows you
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notify_new_follow()
RETURNS TRIGGER AS $$
BEGIN
    -- Don't notify for auto-follows from declined requests (separate notification)
    IF NEW.source = 'direct' THEN
        INSERT INTO public.notifications (
            user_id,
            actor_id,
            type,
            message,
            link
        ) VALUES (
            NEW.following_id,
            NEW.follower_id,
            'new_follow',
            'started following you',
            '/hub/user/' || NEW.follower_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new follows
DROP TRIGGER IF EXISTS trg_notify_new_follow ON public.follows;
CREATE TRIGGER trg_notify_new_follow
    AFTER INSERT ON public.follows
    FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_new_follow();

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Get follower count for a user
CREATE OR REPLACE FUNCTION public.get_follower_count(user_uuid UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM public.follows WHERE following_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- Get following count for a user
CREATE OR REPLACE FUNCTION public.get_following_count(user_uuid UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM public.follows WHERE follower_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- Check if user A follows user B
CREATE OR REPLACE FUNCTION public.is_following(follower UUID, following UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.follows 
        WHERE follower_id = follower AND following_id = following
    );
$$ LANGUAGE SQL STABLE;
