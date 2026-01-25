-- PART 2: CREATE TABLES (Run this second)

CREATE TABLE game_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    engine_type TEXT NOT NULL CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_level INTEGER NOT NULL DEFAULT 10,
    hands_per_round INTEGER NOT NULL DEFAULT 20,
    icon_url TEXT,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT game_registry_title_unique UNIQUE (title),
    CONSTRAINT game_registry_slug_unique UNIQUE (slug)
);

CREATE TABLE god_mode_user_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    current_level INTEGER NOT NULL DEFAULT 1,
    highest_level_unlocked INTEGER NOT NULL DEFAULT 1,
    health_chips INTEGER NOT NULL DEFAULT 100,
    current_round_hands_played INTEGER NOT NULL DEFAULT 0,
    current_round_correct INTEGER NOT NULL DEFAULT 0,
    current_round_started_at TIMESTAMPTZ,
    total_hands_played INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_rounds_completed INTEGER NOT NULL DEFAULT 0,
    total_levels_mastered INTEGER NOT NULL DEFAULT 0,
    last_played_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_user_session_unique UNIQUE (user_id, game_id)
);

CREATE TABLE god_mode_hand_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    session_id UUID REFERENCES god_mode_user_session(id) ON DELETE SET NULL,
    source_file_id TEXT NOT NULL,
    variant_hash TEXT NOT NULL,
    hero_hand TEXT NOT NULL,
    board TEXT,
    level_at_play INTEGER NOT NULL,
    round_hand_number INTEGER NOT NULL,
    user_action TEXT NOT NULL,
    user_sizing NUMERIC,
    gto_action TEXT NOT NULL,
    gto_frequency NUMERIC,
    ev_of_user_action NUMERIC,
    ev_of_gto_action NUMERIC,
    is_correct BOOLEAN NOT NULL,
    is_indifferent BOOLEAN DEFAULT false,
    chip_penalty INTEGER DEFAULT 0,
    villain_action TEXT,
    villain_sizing NUMERIC,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_hand_history_unique UNIQUE (user_id, source_file_id, variant_hash)
);

CREATE TABLE god_mode_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    highest_level INTEGER NOT NULL DEFAULT 1,
    best_accuracy NUMERIC NOT NULL DEFAULT 0,
    fastest_level_10_ms BIGINT,
    total_hands INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    global_rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_leaderboard_unique UNIQUE (user_id, game_id)
);
