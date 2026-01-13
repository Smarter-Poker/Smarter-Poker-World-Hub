-- ═══════════════════════════════════════════════════════════════════════════
-- 🧠 HORSES MEMORY SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════
-- Gives each horse persistent memory of their past posts and interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. HORSE MEMORY TABLE (Core Memory Store)
CREATE TABLE IF NOT EXISTS horse_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id INTEGER NOT NULL, -- References content_authors.id
    
    -- Memory Types
    memory_type TEXT NOT NULL CHECK (memory_type IN (
        'POST',           -- Something they posted
        'OPINION',        -- A stance they took on a topic
        'INTERACTION',    -- Someone they engaged with
        'TOPIC',          -- A topic they covered
        'STORY',          -- A personal story they shared
        'CLAIM'           -- A factual claim they made
    )),
    
    -- Content
    content_summary TEXT NOT NULL,        -- Brief summary of the memory
    content_hash TEXT,                    -- MD5 to prevent duplicates
    keywords TEXT[],                      -- Extracted keywords for search
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    
    -- Context
    source_post_id UUID,                  -- Original post that created this memory
    related_topic TEXT,                   -- e.g., 'bankroll_management', 'GTO_vs_exploitative'
    related_author_id INTEGER,            -- If interacting with another horse
    
    -- Memory Strength (for decay/reinforcement)
    strength FLOAT DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 2.0),
    times_referenced INTEGER DEFAULT 0,   -- How often this memory was used
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ                -- Optional expiry for short-term memories
);

-- 2. HORSE PERSONALITY TRAITS (Consistent Character Attributes)
CREATE TABLE IF NOT EXISTS horse_personality (
    author_id INTEGER PRIMARY KEY,  -- References content_authors.id
    
    -- Core Traits (1-10 scale)
    aggression_level INTEGER DEFAULT 5 CHECK (aggression_level BETWEEN 1 AND 10),
    humor_level INTEGER DEFAULT 5 CHECK (humor_level BETWEEN 1 AND 10),
    technical_depth INTEGER DEFAULT 5 CHECK (technical_depth BETWEEN 1 AND 10),
    contrarian_tendency INTEGER DEFAULT 3 CHECK (contrarian_tendency BETWEEN 1 AND 10),
    
    -- Poker Philosophy
    gto_vs_exploitative TEXT DEFAULT 'balanced' CHECK (gto_vs_exploitative IN ('gto_purist', 'balanced', 'exploitative')),
    risk_tolerance TEXT DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive', 'degen')),
    
    -- Favorite Topics (weighted preferences)
    preferred_topics JSONB DEFAULT '{}', -- e.g., {"hand_analysis": 0.8, "bankroll": 0.6}
    avoided_topics TEXT[],               -- Topics they never discuss
    
    -- Recurring Themes
    catchphrases TEXT[],                 -- Phrases they tend to use
    pet_peeves TEXT[],                   -- Things that trigger strong reactions
    heroes TEXT[],                       -- Poker players they admire
    
    -- Backstory Anchors
    origin_story TEXT,                   -- How they got into poker
    biggest_win TEXT,                    -- Their proudest moment
    biggest_loss TEXT,                   -- Their humbling moment
    current_goals TEXT,                  -- What they're working toward
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HORSE RELATIONSHIPS (Inter-Horse Dynamics)
CREATE TABLE IF NOT EXISTS horse_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id INTEGER NOT NULL,          -- The horse
    target_author_id INTEGER NOT NULL,   -- The other horse
    
    -- Relationship Type
    relationship_type TEXT DEFAULT 'neutral' CHECK (relationship_type IN (
        'friend',       -- Often agrees, supports
        'rival',        -- Often disagrees, debates
        'mentor',       -- Gives advice to
        'student',      -- Receives advice from
        'neutral'       -- No special relationship
    )),
    
    -- Interaction Stats
    total_interactions INTEGER DEFAULT 0,
    positive_interactions INTEGER DEFAULT 0,
    negative_interactions INTEGER DEFAULT 0,
    last_interaction_at TIMESTAMPTZ,
    
    -- Dynamic Sentiment (-1.0 to 1.0)
    sentiment_score FLOAT DEFAULT 0.0 CHECK (sentiment_score BETWEEN -1.0 AND 1.0),
    
    UNIQUE(author_id, target_author_id)
);

-- 4. TOPIC COOLDOWNS (Prevent Repetition)
CREATE TABLE IF NOT EXISTS horse_topic_cooldowns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    last_posted_at TIMESTAMPTZ DEFAULT NOW(),
    cooldown_hours INTEGER DEFAULT 48,   -- Hours before can post about this again
    
    UNIQUE(author_id, topic)
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_horse_memory_author ON horse_memory(author_id);
CREATE INDEX IF NOT EXISTS idx_horse_memory_type ON horse_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_horse_memory_topic ON horse_memory(related_topic);
CREATE INDEX IF NOT EXISTS idx_horse_memory_keywords ON horse_memory USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_horse_relationships_author ON horse_relationships(author_id);
CREATE INDEX IF NOT EXISTS idx_horse_cooldowns_author ON horse_topic_cooldowns(author_id);

-- 6. RLS
ALTER TABLE horse_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_personality ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_topic_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System manages horse memory" ON horse_memory FOR ALL USING (true);
CREATE POLICY "System manages horse personality" ON horse_personality FOR ALL USING (true);
CREATE POLICY "System manages horse relationships" ON horse_relationships FOR ALL USING (true);
CREATE POLICY "System manages horse cooldowns" ON horse_topic_cooldowns FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔧 RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Get relevant memories for a horse when generating a post
CREATE OR REPLACE FUNCTION get_horse_memories(
    p_author_id INTEGER,
    p_topic TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    memory_type TEXT,
    content_summary TEXT,
    related_topic TEXT,
    strength FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hm.memory_type,
        hm.content_summary,
        hm.related_topic,
        hm.strength,
        hm.created_at
    FROM horse_memory hm
    WHERE hm.author_id = p_author_id
    AND (hm.expires_at IS NULL OR hm.expires_at > NOW())
    AND (p_topic IS NULL OR hm.related_topic = p_topic OR p_topic = ANY(hm.keywords))
    ORDER BY hm.strength DESC, hm.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Record a new memory
CREATE OR REPLACE FUNCTION record_horse_memory(
    p_author_id INTEGER,
    p_memory_type TEXT,
    p_content_summary TEXT,
    p_related_topic TEXT DEFAULT NULL,
    p_keywords TEXT[] DEFAULT '{}',
    p_sentiment TEXT DEFAULT 'neutral',
    p_source_post_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_memory_id UUID;
    v_content_hash TEXT;
BEGIN
    -- Generate hash to prevent duplicates
    v_content_hash := md5(p_content_summary);
    
    -- Check for duplicate
    SELECT id INTO v_memory_id FROM horse_memory 
    WHERE author_id = p_author_id AND content_hash = v_content_hash;
    
    IF v_memory_id IS NOT NULL THEN
        -- Reinforce existing memory
        UPDATE horse_memory SET 
            strength = LEAST(strength + 0.1, 2.0),
            times_referenced = times_referenced + 1,
            last_accessed_at = NOW()
        WHERE id = v_memory_id;
        RETURN v_memory_id;
    END IF;
    
    -- Insert new memory
    INSERT INTO horse_memory (
        author_id, memory_type, content_summary, content_hash,
        keywords, sentiment, related_topic, source_post_id
    ) VALUES (
        p_author_id, p_memory_type, p_content_summary, v_content_hash,
        p_keywords, p_sentiment, p_related_topic, p_source_post_id
    )
    RETURNING id INTO v_memory_id;
    
    RETURN v_memory_id;
END;
$$ LANGUAGE plpgsql;

-- Check if topic is on cooldown
CREATE OR REPLACE FUNCTION is_topic_on_cooldown(
    p_author_id INTEGER,
    p_topic TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_posted TIMESTAMPTZ;
    v_cooldown_hours INTEGER;
BEGIN
    SELECT last_posted_at, cooldown_hours INTO v_last_posted, v_cooldown_hours
    FROM horse_topic_cooldowns
    WHERE author_id = p_author_id AND topic = p_topic;
    
    IF v_last_posted IS NULL THEN
        RETURN FALSE; -- Never posted, not on cooldown
    END IF;
    
    RETURN v_last_posted + (v_cooldown_hours || ' hours')::INTERVAL > NOW();
END;
$$ LANGUAGE plpgsql STABLE;

-- Set topic cooldown after posting
CREATE OR REPLACE FUNCTION set_topic_cooldown(
    p_author_id INTEGER,
    p_topic TEXT,
    p_cooldown_hours INTEGER DEFAULT 48
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO horse_topic_cooldowns (author_id, topic, last_posted_at, cooldown_hours)
    VALUES (p_author_id, p_topic, NOW(), p_cooldown_hours)
    ON CONFLICT (author_id, topic) 
    DO UPDATE SET last_posted_at = NOW(), cooldown_hours = p_cooldown_hours;
END;
$$ LANGUAGE plpgsql;

-- Decay old memories (run periodically)
CREATE OR REPLACE FUNCTION decay_horse_memories()
RETURNS INTEGER AS $$
DECLARE
    v_decayed_count INTEGER;
BEGIN
    -- Reduce strength of old memories
    UPDATE horse_memory 
    SET strength = strength * 0.95
    WHERE last_accessed_at < NOW() - INTERVAL '7 days'
    AND strength > 0.1;
    
    GET DIAGNOSTICS v_decayed_count = ROW_COUNT;
    
    -- Delete very weak memories
    DELETE FROM horse_memory WHERE strength < 0.1;
    
    RETURN v_decayed_count;
END;
$$ LANGUAGE plpgsql;

-- Get horse's personality for prompt building
CREATE OR REPLACE FUNCTION get_horse_personality(p_author_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_personality JSONB;
BEGIN
    SELECT jsonb_build_object(
        'aggression_level', aggression_level,
        'humor_level', humor_level,
        'technical_depth', technical_depth,
        'contrarian_tendency', contrarian_tendency,
        'gto_vs_exploitative', gto_vs_exploitative,
        'risk_tolerance', risk_tolerance,
        'preferred_topics', preferred_topics,
        'avoided_topics', avoided_topics,
        'catchphrases', catchphrases,
        'pet_peeves', pet_peeves,
        'origin_story', origin_story,
        'biggest_win', biggest_win,
        'current_goals', current_goals
    ) INTO v_personality
    FROM horse_personality
    WHERE author_id = p_author_id;
    
    RETURN COALESCE(v_personality, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE;
