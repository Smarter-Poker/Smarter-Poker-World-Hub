-- ═══════════════════════════════════════════════════════════════════════════
-- Live Session Broadcasting — Database Migration
-- Tables: live_sessions, session_chat_messages
-- ═══════════════════════════════════════════════════════════════════════════

-- Live sessions — "I'm at the table" status tracking
CREATE TABLE IF NOT EXISTS live_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    venue_id INT,
    venue_name TEXT,
    game_type TEXT DEFAULT 'NLH',
    stakes TEXT DEFAULT '$1/$2',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'break', 'ended')),
    privacy TEXT DEFAULT 'friends' CHECK (privacy IN ('public', 'friends', 'invisible')),
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    current_profit INT DEFAULT 0,
    notes TEXT,
    -- LiveKit room name for video streaming
    livekit_room TEXT,
    viewer_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_sessions_user_id ON live_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_privacy ON live_sessions(privacy);
CREATE INDEX IF NOT EXISTS idx_live_sessions_started_at ON live_sessions(started_at DESC);

-- RLS
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_sessions' AND policyname = 'live_sessions_select') THEN
        CREATE POLICY live_sessions_select ON live_sessions FOR SELECT USING (
            privacy = 'public'
            OR user_id = auth.uid()
            OR (privacy = 'friends' AND user_id IN (
                SELECT CASE
                    WHEN user_id = auth.uid() THEN friend_id
                    ELSE user_id
                END FROM friendships
                WHERE status = 'accepted'
                AND (user_id = auth.uid() OR friend_id = auth.uid())
            ))
        );
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_sessions' AND policyname = 'live_sessions_insert') THEN
        CREATE POLICY live_sessions_insert ON live_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_sessions' AND policyname = 'live_sessions_update') THEN
        CREATE POLICY live_sessions_update ON live_sessions FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_sessions' AND policyname = 'live_sessions_delete') THEN
        CREATE POLICY live_sessions_delete ON live_sessions FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Session chat messages — spectator chat for live sessions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS session_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    message TEXT NOT NULL CHECK (char_length(message) <= 500),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_chat_session_id ON session_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_created_at ON session_chat_messages(created_at DESC);

ALTER TABLE session_chat_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'session_chat_messages' AND policyname = 'session_chat_select') THEN
        CREATE POLICY session_chat_select ON session_chat_messages FOR SELECT USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'session_chat_messages' AND policyname = 'session_chat_insert') THEN
        CREATE POLICY session_chat_insert ON session_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Enable realtime for live chat
ALTER PUBLICATION supabase_realtime ADD TABLE session_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
