-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Add missing columns referenced by handle_new_user trigger
-- The 20260330 VIP paywall migration updated the trigger to write to columns
-- that don't exist in the profiles table, causing "Database error saving new user"
-- on every signup attempt.
-- ════════════════════════════════════════════════════════════════════════════════

-- streak_count (trigger writes it, table only has streak_days)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0;

-- access_tier (used for state-based restrictions)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_tier TEXT DEFAULT 'Full_Access';

-- vip_tier (trigger writes 'monthly', table only has generic 'tier')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_tier TEXT DEFAULT NULL;

-- vip_expires_at (trigger writes NOW() + 30 days)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ DEFAULT NULL;

-- last_active (trigger writes NOW(), table only has last_seen)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();
