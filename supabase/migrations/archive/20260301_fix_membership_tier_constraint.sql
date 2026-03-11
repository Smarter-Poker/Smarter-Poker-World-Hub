-- =====================================================
-- FIX: Expand chk_membership_tier constraint
-- =====================================================
-- Original constraint only allows: standard, gold, platinum, vip
-- But membership plans use: daily, weekly, monthly, yearly
-- This migration drops the old constraint and creates one allowing ALL values

ALTER TABLE commander_members DROP CONSTRAINT IF EXISTS chk_membership_tier;

ALTER TABLE commander_members ADD CONSTRAINT chk_membership_tier
  CHECK (membership_tier IN ('standard', 'gold', 'platinum', 'vip', 'daily', 'weekly', 'monthly', 'yearly'));
