-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - DIAMOND ECONOMY TABLES
-- Real diamond tracking with Supabase instead of localStorage
-- ═══════════════════════════════════════════════════════════════════════════

-- User Diamond Balances
CREATE TABLE IF NOT EXISTS user_diamonds (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 100,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Diamond Transaction Log
CREATE TABLE IF NOT EXISTS diamond_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'purchase', 'bonus', 'refund')),
    source TEXT NOT NULL,
    -- Source examples: 'game_reward', 'streak_bonus', 'iap', 'game_cost', 'level_complete', 'daily_challenge'
    metadata JSONB,
    -- Metadata can include: game_mode, level, score, accuracy, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VIP Subscriptions (Stripe integration)
CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memory Game Sessions (for analytics and rewards)
CREATE TABLE IF NOT EXISTS memory_game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_mode TEXT NOT NULL CHECK (game_mode IN ('range', 'speed', 'pressure', 'pattern', 'mixed', 'spot', 'tournament')),
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
    scenario_id TEXT,
    score INTEGER,
    accuracy DECIMAL(5,2),
    time_taken INTEGER, -- seconds
    diamonds_spent INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily Streaks
CREATE TABLE IF NOT EXISTS user_daily_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_completed_date DATE,
    total_days_played INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_id ON diamond_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created_at ON diamond_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_type ON diamond_transactions(type);

CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_user_id ON vip_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_status ON vip_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_stripe_sub_id ON vip_subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_memory_sessions_user_id ON memory_game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_created_at ON memory_game_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_game_mode ON memory_game_sessions(game_mode);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_level ON memory_game_sessions(level);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user_diamonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE diamond_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_streaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own diamond balance
CREATE POLICY "Users can view own diamonds"
    ON user_diamonds FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
    ON diamond_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own VIP status
CREATE POLICY "Users can view own VIP status"
    ON vip_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own game sessions
CREATE POLICY "Users can view own sessions"
    ON memory_game_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own game sessions
CREATE POLICY "Users can create own sessions"
    ON memory_game_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own streaks
CREATE POLICY "Users can view own streaks"
    ON user_daily_streaks FOR SELECT
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS for diamond operations
-- ═══════════════════════════════════════════════════════════════════════════

-- Initialize diamonds for new user
CREATE OR REPLACE FUNCTION initialize_user_diamonds()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_diamonds (user_id, balance, lifetime_earned)
    VALUES (NEW.id, 100, 100)
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO user_daily_streaks (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to initialize diamonds on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_diamonds ON auth.users;
CREATE TRIGGER on_auth_user_created_diamonds
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_user_diamonds();

-- Deduct diamonds (for game cost)
CREATE OR REPLACE FUNCTION deduct_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM user_diamonds
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user exists
    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Check if sufficient balance
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient diamonds',
            'balance', v_current_balance,
            'required', p_amount
        );
    END IF;
    
    -- Deduct diamonds
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE user_diamonds
    SET balance = v_new_balance,
        lifetime_spent = lifetime_spent + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Log transaction
    INSERT INTO diamond_transactions (user_id, amount, type, source, metadata)
    VALUES (p_user_id, -p_amount, 'spend', p_source, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'charged', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Award diamonds (for rewards)
CREATE OR REPLACE FUNCTION award_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Award diamonds
    UPDATE user_diamonds
    SET balance = balance + p_amount,
        lifetime_earned = lifetime_earned + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
    
    -- Check if user exists
    IF v_new_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Log transaction
    INSERT INTO diamond_transactions (user_id, amount, type, source, metadata)
    VALUES (p_user_id, p_amount, 'earn', p_source, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'awarded', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check VIP status
CREATE OR REPLACE FUNCTION is_vip(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_vip BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM vip_subscriptions
        WHERE user_id = p_user_id
        AND status = 'active'
        AND current_period_end > NOW()
    ) INTO v_is_vip;
    
    RETURN COALESCE(v_is_vip, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get diamond balance
CREATE OR REPLACE FUNCTION get_diamond_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT balance INTO v_balance
    FROM user_diamonds
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION deduct_diamonds TO authenticated;
GRANT EXECUTE ON FUNCTION award_diamonds TO authenticated;
GRANT EXECUTE ON FUNCTION is_vip TO authenticated;
GRANT EXECUTE ON FUNCTION get_diamond_balance TO authenticated;
