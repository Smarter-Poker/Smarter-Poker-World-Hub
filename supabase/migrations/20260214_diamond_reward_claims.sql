-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 DIAMOND REWARD CLAIMS TABLE
-- Tracks all diamond reward claims to enforce cooldowns and daily caps
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diamond_reward_claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_type TEXT NOT NULL,          -- daily_login, social_post, strategy_comment, referral, etc.
    diamonds_awarded INT NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    claim_date DATE DEFAULT CURRENT_DATE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Performance indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_date 
    ON diamond_reward_claims(user_id, claim_date);

CREATE INDEX IF NOT EXISTS idx_reward_claims_type 
    ON diamond_reward_claims(user_id, reward_type, claim_date);

-- RLS: Users can only read their own claims
ALTER TABLE diamond_reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own claims" ON diamond_reward_claims
    FOR SELECT USING (auth.uid() = user_id);

-- Service role insert (APIs use service role key)
CREATE POLICY "Service role can insert claims" ON diamond_reward_claims
    FOR INSERT WITH CHECK (true);

-- Unique constraint to prevent duplicate daily_login claims per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_login
    ON diamond_reward_claims(user_id, reward_type, claim_date) 
    WHERE reward_type = 'daily_login';

-- Unique constraint to prevent duplicate social_post claims per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_social_post
    ON diamond_reward_claims(user_id, reward_type, claim_date) 
    WHERE reward_type = 'social_post';
