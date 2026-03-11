
-- ═══════════════════════════════════════════════════════════════════════════
-- DIAMOND PAYOUT ENGINE — COMPLETE DATABASE SETUP
-- Run this entire script in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. User Diamond Balance Table
CREATE TABLE IF NOT EXISTS user_diamond_balance (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_spent INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_claim_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Reward Claims Table (tracks all diamond awards)
CREATE TABLE IF NOT EXISTS reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id TEXT NOT NULL REFERENCES reward_definitions(id),
    diamonds_awarded INTEGER NOT NULL,
    multiplier DECIMAL(3,2) DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON reward_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_claims_reward ON reward_claims(reward_id);

-- 3. Celebration Queue Table (for UI animations)
CREATE TABLE IF NOT EXISTS celebration_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id TEXT NOT NULL,
    reward_name TEXT,
    diamonds INTEGER NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    icon TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    dismissed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_celebration_queue_user 
ON celebration_queue(user_id, dismissed, created_at DESC);

-- 4. Enable RLS
ALTER TABLE user_diamond_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_queue ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for user_diamond_balance
CREATE POLICY "Users view own balance" ON user_diamond_balance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own balance" ON user_diamond_balance
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Auto-create balance on first claim" ON user_diamond_balance
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. RLS Policies for reward_claims
CREATE POLICY "Users view own claims" ON reward_claims
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert claims" ON reward_claims
    FOR INSERT WITH CHECK (true);

-- 7. RLS Policies for celebration_queue
CREATE POLICY "Users view own celebrations" ON celebration_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users dismiss own celebrations" ON celebration_queue
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can insert celebrations" ON celebration_queue
    FOR INSERT WITH CHECK (true);

-- 8. Claim Reward Function (core of the payout engine)
CREATE OR REPLACE FUNCTION claim_reward(
    p_user_id UUID,
    p_reward_id TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reward reward_definitions%ROWTYPE;
    v_balance user_diamond_balance%ROWTYPE;
    v_multiplier DECIMAL(3,2) := 1.0;
    v_diamonds INTEGER;
    v_daily_cap INTEGER := 500;
    v_today_earned INTEGER;
    v_claim_id UUID;
BEGIN
    -- Get reward definition
    SELECT * INTO v_reward FROM reward_definitions WHERE id = p_reward_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reward not found');
    END IF;
    
    -- Get or create user balance
    SELECT * INTO v_balance FROM user_diamond_balance WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        INSERT INTO user_diamond_balance (user_id, balance, lifetime_earned)
        VALUES (p_user_id, 0, 0)
        RETURNING * INTO v_balance;
    END IF;
    
    -- Check if non-repeatable reward already claimed
    IF NOT v_reward.is_repeatable THEN
        IF EXISTS (SELECT 1 FROM reward_claims WHERE user_id = p_user_id AND reward_id = p_reward_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Already claimed', 'already_claimed', true);
        END IF;
    END IF;
    
    -- Calculate streak multiplier
    IF v_balance.current_streak >= 7 THEN
        v_multiplier := 2.0;
    ELSIF v_balance.current_streak >= 3 THEN
        v_multiplier := 1.5;
    END IF;
    
    -- Calculate diamonds
    v_diamonds := FLOOR(v_reward.base_amount * v_multiplier);
    
    -- Check daily cap (unless bypasses_cap is true)
    IF NOT COALESCE(v_reward.bypasses_cap, false) THEN
        SELECT COALESCE(SUM(diamonds_awarded), 0) INTO v_today_earned
        FROM reward_claims
        WHERE user_id = p_user_id AND created_at::date = CURRENT_DATE;
        
        IF v_today_earned >= v_daily_cap THEN
            RETURN jsonb_build_object('success', false, 'error', 'Daily cap reached', 'cap_reached', true);
        END IF;
        
        -- Reduce to stay under cap
        IF v_today_earned + v_diamonds > v_daily_cap THEN
            v_diamonds := v_daily_cap - v_today_earned;
        END IF;
    END IF;
    
    -- Create the claim
    INSERT INTO reward_claims (user_id, reward_id, diamonds_awarded, multiplier, metadata)
    VALUES (p_user_id, p_reward_id, v_diamonds, v_multiplier, p_metadata)
    RETURNING id INTO v_claim_id;
    
    -- Update balance
    UPDATE user_diamond_balance
    SET balance = balance + v_diamonds,
        lifetime_earned = lifetime_earned + v_diamonds,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Queue celebration
    INSERT INTO celebration_queue (user_id, reward_id, reward_name, diamonds, rarity, icon, message)
    VALUES (
        p_user_id,
        p_reward_id,
        v_reward.name,
        v_diamonds,
        v_reward.rarity,
        v_reward.icon,
        CASE v_reward.rarity
            WHEN 'legendary' THEN '🎊 LEGENDARY ACHIEVEMENT!'
            WHEN 'epic' THEN '⭐ EPIC DISCOVERY!'
            WHEN 'rare' THEN '✨ RARE FIND!'
            ELSE '💎 DIAMONDS EARNED!'
        END
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'claim_id', v_claim_id,
        'reward_id', p_reward_id,
        'reward_name', v_reward.name,
        'diamonds', v_diamonds,
        'multiplier', v_multiplier,
        'rarity', v_reward.rarity,
        'icon', v_reward.icon,
        'new_balance', v_balance.balance + v_diamonds
    );
END;
$$;

-- 9. Get Pending Celebrations Function
CREATE OR REPLACE FUNCTION get_pending_celebrations(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'reward_id', reward_id,
            'reward_name', reward_name,
            'diamonds', diamonds,
            'rarity', rarity,
            'icon', icon,
            'message', message,
            'created_at', created_at
        ) ORDER BY created_at DESC)
        FROM celebration_queue
        WHERE user_id = p_user_id AND dismissed = FALSE),
        '[]'::jsonb
    );
END;
$$;

-- 10. Dismiss Celebration Function
CREATE OR REPLACE FUNCTION dismiss_celebration(p_celebration_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE celebration_queue SET dismissed = TRUE WHERE id = p_celebration_id;
    RETURN TRUE;
END;
$$;

-- 11. Update Streak Function (call on daily login)
CREATE OR REPLACE FUNCTION update_daily_streak(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance user_diamond_balance%ROWTYPE;
    v_new_streak INTEGER;
BEGIN
    SELECT * INTO v_balance FROM user_diamond_balance WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        INSERT INTO user_diamond_balance (user_id, current_streak, last_claim_date)
        VALUES (p_user_id, 1, CURRENT_DATE)
        RETURNING * INTO v_balance;
        RETURN jsonb_build_object('streak', 1, 'is_new', true);
    END IF;
    
    IF v_balance.last_claim_date = CURRENT_DATE THEN
        -- Already claimed today
        RETURN jsonb_build_object('streak', v_balance.current_streak, 'already_claimed', true);
    ELSIF v_balance.last_claim_date = CURRENT_DATE - 1 THEN
        -- Consecutive day
        v_new_streak := v_balance.current_streak + 1;
    ELSE
        -- Streak broken
        v_new_streak := 1;
    END IF;
    
    UPDATE user_diamond_balance
    SET current_streak = v_new_streak,
        longest_streak = GREATEST(longest_streak, v_new_streak),
        last_claim_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object('streak', v_new_streak, 'longest', GREATEST(v_balance.longest_streak, v_new_streak));
END;
$$;

-- Done!
SELECT 'Diamond Payout Engine tables and functions created successfully!' as status;
