-- ═══════════════════════════════════════════════════════════════════════════
-- GEEVES HELP BOT — Complete Schema Migration
-- Tables: conversations, messages, knowledge_cache, analytics, answer_ratings
-- RPCs: find_similar_questions, increment_cache_served
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. CONVERSATIONS
CREATE TABLE IF NOT EXISTS geeves_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Poker Conversation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geeves_conversations_user_id ON geeves_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_geeves_conversations_updated ON geeves_conversations(updated_at DESC);

ALTER TABLE geeves_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON geeves_conversations;
CREATE POLICY "Users can view own conversations" ON geeves_conversations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conversations" ON geeves_conversations;
CREATE POLICY "Users can insert own conversations" ON geeves_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON geeves_conversations;
CREATE POLICY "Users can update own conversations" ON geeves_conversations
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access conversations" ON geeves_conversations;
CREATE POLICY "Service role full access conversations" ON geeves_conversations
    FOR ALL USING (auth.role() = 'service_role');


-- 2. MESSAGES
CREATE TABLE IF NOT EXISTS geeves_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES geeves_conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_user BOOLEAN NOT NULL DEFAULT true,
    cache_id UUID,
    from_cache BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geeves_messages_conversation ON geeves_messages(conversation_id, created_at);

ALTER TABLE geeves_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON geeves_messages;
CREATE POLICY "Users can view messages in own conversations" ON geeves_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM geeves_conversations
            WHERE geeves_conversations.id = geeves_messages.conversation_id
            AND geeves_conversations.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role full access messages" ON geeves_messages;
CREATE POLICY "Service role full access messages" ON geeves_messages
    FOR ALL USING (auth.role() = 'service_role');


-- 3. KNOWLEDGE CACHE
CREATE TABLE IF NOT EXISTS geeves_knowledge_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_normalized TEXT NOT NULL,
    question_hash TEXT NOT NULL,
    question_original TEXT NOT NULL,
    answer TEXT NOT NULL,
    answer_tokens INTEGER DEFAULT 0,
    question_type TEXT DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    times_served INTEGER DEFAULT 0,
    last_served_at TIMESTAMPTZ DEFAULT now(),
    avg_rating NUMERIC(3,2) DEFAULT 0,
    rating_sum INTEGER DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geeves_cache_hash ON geeves_knowledge_cache(question_hash);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_type ON geeves_knowledge_cache(question_type);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_served ON geeves_knowledge_cache(times_served DESC);

ALTER TABLE geeves_knowledge_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read cache" ON geeves_knowledge_cache;
CREATE POLICY "Anyone can read cache" ON geeves_knowledge_cache
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access cache" ON geeves_knowledge_cache;
CREATE POLICY "Service role full access cache" ON geeves_knowledge_cache
    FOR ALL USING (auth.role() = 'service_role');


-- 4. ANALYTICS
CREATE TABLE IF NOT EXISTS geeves_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    question_type TEXT DEFAULT 'general',
    question TEXT,
    response_length INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geeves_analytics_user ON geeves_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geeves_analytics_type ON geeves_analytics(question_type);

ALTER TABLE geeves_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access analytics" ON geeves_analytics;
CREATE POLICY "Service role full access analytics" ON geeves_analytics
    FOR ALL USING (auth.role() = 'service_role');


-- 5. ANSWER RATINGS
CREATE TABLE IF NOT EXISTS geeves_answer_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_id UUID NOT NULL REFERENCES geeves_knowledge_cache(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(cache_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_geeves_ratings_cache ON geeves_answer_ratings(cache_id);
CREATE INDEX IF NOT EXISTS idx_geeves_ratings_user ON geeves_answer_ratings(user_id);

ALTER TABLE geeves_answer_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own ratings" ON geeves_answer_ratings;
CREATE POLICY "Users can manage own ratings" ON geeves_answer_ratings
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access ratings" ON geeves_answer_ratings;
CREATE POLICY "Service role full access ratings" ON geeves_answer_ratings
    FOR ALL USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Increment cache served counter
CREATE OR REPLACE FUNCTION increment_cache_served(cache_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE geeves_knowledge_cache
    SET times_served = times_served + 1,
        last_served_at = now()
    WHERE id = cache_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Find similar questions using trigram similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION find_similar_questions(
    search_query TEXT,
    similarity_threshold NUMERIC DEFAULT 0.3,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    question_original TEXT,
    question_normalized TEXT,
    answer TEXT,
    question_type TEXT,
    times_served INTEGER,
    avg_rating NUMERIC,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.question_original,
        c.question_normalized,
        c.answer,
        c.question_type,
        c.times_served,
        c.avg_rating,
        similarity(c.question_normalized, lower(trim(search_query)))::NUMERIC as sim
    FROM geeves_knowledge_cache c
    WHERE similarity(c.question_normalized, lower(trim(search_query))) >= similarity_threshold
    ORDER BY sim DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-update avg_rating when a rating is inserted
CREATE OR REPLACE FUNCTION update_cache_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE geeves_knowledge_cache
    SET
        total_ratings = total_ratings + 1,
        rating_sum = rating_sum + NEW.rating,
        avg_rating = (rating_sum + NEW.rating)::NUMERIC / (total_ratings + 1)
    WHERE id = NEW.cache_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_cache_rating ON geeves_answer_ratings;
CREATE TRIGGER trg_update_cache_rating
    AFTER INSERT ON geeves_answer_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_cache_rating_stats();
