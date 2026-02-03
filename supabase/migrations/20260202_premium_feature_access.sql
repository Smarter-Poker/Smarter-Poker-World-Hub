-- ═══════════════════════════════════════════════════════════════════════════
-- PREMIUM FEATURE ACCESS TABLE
-- Track per-diem premium feature unlocks for non-VIP users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS premium_feature_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    diamonds_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE premium_feature_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own premium access" ON premium_feature_access
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own premium access" ON premium_feature_access
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_premium_access_user ON premium_feature_access(user_id);
CREATE INDEX IF NOT EXISTS idx_premium_access_feature ON premium_feature_access(user_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_premium_access_expires ON premium_feature_access(expires_at);

-- Cleanup old expired access records (optional cron job)
-- DELETE FROM premium_feature_access WHERE expires_at < NOW() - INTERVAL '7 days';
