-- Create pending_calls table for cross-device calling
-- This stores calls so offline users can receive them when they open the app

CREATE TABLE IF NOT EXISTS pending_calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    caller_name TEXT NOT NULL,
    caller_avatar TEXT,
    call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
    room_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 minutes'
);

-- Index for fast lookups by callee
CREATE INDEX IF NOT EXISTS idx_pending_calls_callee_id ON pending_calls(callee_id);

-- Auto-cleanup old calls (PostgreSQL will use this with pg_cron or we clean manually)
CREATE INDEX IF NOT EXISTS idx_pending_calls_expires_at ON pending_calls(expires_at);

-- RLS policies
ALTER TABLE pending_calls ENABLE ROW LEVEL SECURITY;

-- Users can see pending calls for themselves
CREATE POLICY "Users can view their pending calls" ON pending_calls
    FOR SELECT USING (callee_id = auth.uid());

-- Users can create calls (as caller)
CREATE POLICY "Users can create calls" ON pending_calls
    FOR INSERT WITH CHECK (caller_id = auth.uid());

-- Users can delete calls they're involved in (accept/decline)
CREATE POLICY "Users can delete their calls" ON pending_calls
    FOR DELETE USING (callee_id = auth.uid() OR caller_id = auth.uid());
