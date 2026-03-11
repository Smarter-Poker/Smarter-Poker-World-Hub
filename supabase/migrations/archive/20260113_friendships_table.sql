-- ═══════════════════════════════════════════════════════════════════════════
-- FRIENDSHIPS TABLE
-- Manages friend connections between users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, blocked
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate friendships
    UNIQUE(user_id, friend_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own friendships
DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
CREATE POLICY "Users can view own friendships" ON public.friendships
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policy: Users can create friendships
DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
CREATE POLICY "Users can create friendships" ON public.friendships
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own friendships
DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
CREATE POLICY "Users can update own friendships" ON public.friendships
    FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policy: Users can delete their own friendships
DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;
CREATE POLICY "Users can delete own friendships" ON public.friendships
    FOR DELETE USING (auth.uid() = user_id);

-- Grant access
GRANT ALL ON public.friendships TO authenticated;
