-- Create blocked_users table for privacy enforcement
-- Migration: 20260129_blocked_users_table
-- ═══════════════════════════════════════════════════════════════════════════

-- Create blocked_users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate blocks
    UNIQUE(blocker_id, blocked_id),
    
    -- Prevent self-blocking
    CHECK (blocker_id != blocked_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see blocks they created
CREATE POLICY "Users can view their own blocks"
    ON blocked_users FOR SELECT
    USING (auth.uid() = blocker_id);

-- Policy: Users can only create blocks for themselves
CREATE POLICY "Users can create their own blocks"
    ON blocked_users FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

-- Policy: Users can only delete their own blocks
CREATE POLICY "Users can delete their own blocks"
    ON blocked_users FOR DELETE
    USING (auth.uid() = blocker_id);

-- Add comments
COMMENT ON TABLE blocked_users IS 'User blocking for privacy enforcement';
COMMENT ON COLUMN blocked_users.blocker_id IS 'The user who created the block';
COMMENT ON COLUMN blocked_users.blocked_id IS 'The user who is blocked';
