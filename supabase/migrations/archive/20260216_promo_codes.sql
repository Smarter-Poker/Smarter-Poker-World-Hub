-- ═══════════════════════════════════════════════════════════════
-- PROMO CODE SYSTEM
-- Created: 2026-02-16
-- Tables: promo_codes, promo_code_redemptions
-- ═══════════════════════════════════════════════════════════════

-- ── PROMO CODES TABLE ──
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('diamonds', 'vip_days', 'free_trial', 'commander_discount')),
  reward_value INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,             -- NULL = unlimited
  times_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,       -- NULL = never expires
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PROMO CODE REDEMPTIONS TABLE ──
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(promo_code_id, user_id)  -- Each user can redeem a code only once
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user ON promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_code ON promo_code_redemptions(promo_code_id);

-- ── RLS POLICIES ──
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Anyone can read active promo codes (for validation)
CREATE POLICY "Anyone can read active promo codes"
  ON promo_codes FOR SELECT
  USING (is_active = true);

-- Only service role can insert/update promo codes
CREATE POLICY "Service role manages promo codes"
  ON promo_codes FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read their own redemptions
CREATE POLICY "Users can read own redemptions"
  ON promo_code_redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all redemptions
CREATE POLICY "Service role manages redemptions"
  ON promo_code_redemptions FOR ALL
  USING (auth.role() = 'service_role');

-- ── SEED TEST PROMO CODES ──
INSERT INTO promo_codes (code, description, reward_type, reward_value, max_uses, expires_at) VALUES
  ('WELCOME500', 'Welcome bonus - 500 free diamonds', 'diamonds', 500, NULL, NULL),
  ('VIP30', '30 days free VIP trial', 'vip_days', 30, 100, '2026-12-31 23:59:59+00'),
  ('LAUNCH2026', 'Launch promo - 1000 diamonds', 'diamonds', 1000, 500, '2026-06-30 23:59:59+00')
ON CONFLICT (code) DO NOTHING;
