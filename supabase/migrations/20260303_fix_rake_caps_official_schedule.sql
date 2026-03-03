-- ============================================================================
-- Migration: Fix rake caps and percentages to match official schedule
-- Date: 2026-03-03
-- 
-- BUG #154 (HIGH): Rake percentages wrong at most stake levels (5%, 7%, 8% 
--   instead of uniform 10%)
-- BUG #155 (CRITICAL): Rake caps stored as small integers instead of actual
--   dollar amounts. E.g. 5/10 tables capped at $2 instead of $12.50 (84% less)
-- BUG #156 (MEDIUM): BBJ pool allocation model missing Main/BackUp/Promotional
--   40/30/30 split
--
-- This migration updates ALL existing tables to match the official schedule.
-- New tables created after the RakeConfig.js fix will already have correct values.
-- ============================================================================

-- Fix existing tables with incorrect rake caps and percentages
-- Match by stakes to apply the correct official cap

-- .10/.20
UPDATE tables SET rake_percent = 10, rake_cap_bb = 3
  WHERE small_blind = 0.10 AND big_blind = 0.20;

-- .20/.40
UPDATE tables SET rake_percent = 10, rake_cap_bb = 3
  WHERE small_blind = 0.20 AND big_blind = 0.40;

-- 0.25/0.50
UPDATE tables SET rake_percent = 10, rake_cap_bb = 3
  WHERE small_blind = 0.25 AND big_blind = 0.50;

-- .30/.60
UPDATE tables SET rake_percent = 10, rake_cap_bb = 5
  WHERE small_blind = 0.30 AND big_blind = 0.60;

-- 0.50/1.00
UPDATE tables SET rake_percent = 10, rake_cap_bb = 5
  WHERE small_blind = 0.50 AND big_blind = 1.00;

-- 1/2
UPDATE tables SET rake_percent = 10, rake_cap_bb = 5
  WHERE small_blind = 1 AND big_blind = 2;

-- 2/4
UPDATE tables SET rake_percent = 10, rake_cap_bb = 7.5
  WHERE small_blind = 2 AND big_blind = 4;

-- 2/5
UPDATE tables SET rake_percent = 10, rake_cap_bb = 7.5
  WHERE small_blind = 2 AND big_blind = 5;

-- 5/5
UPDATE tables SET rake_percent = 10, rake_cap_bb = 7.5
  WHERE small_blind = 5 AND big_blind = 5;

-- 3/6
UPDATE tables SET rake_percent = 10, rake_cap_bb = 8
  WHERE small_blind = 3 AND big_blind = 6;

-- 4/8
UPDATE tables SET rake_percent = 10, rake_cap_bb = 10
  WHERE small_blind = 4 AND big_blind = 8;

-- 5/10
UPDATE tables SET rake_percent = 10, rake_cap_bb = 12.5
  WHERE small_blind = 5 AND big_blind = 10;

-- 10/20
UPDATE tables SET rake_percent = 10, rake_cap_bb = 15
  WHERE small_blind = 10 AND big_blind = 20;

-- 10/25
UPDATE tables SET rake_percent = 10, rake_cap_bb = 15
  WHERE small_blind = 10 AND big_blind = 25;

-- Catch-all: any other tables that don't match official stakes
-- Set to 10% rake (was 5-8% in old config)
UPDATE tables SET rake_percent = 10
  WHERE rake_percent IS NOT NULL AND rake_percent < 10 AND rake_percent > 0;

-- Add comment to column clarifying it's dollars, not BB units
COMMENT ON COLUMN tables.rake_cap_bb IS 'Rake cap in ABSOLUTE DOLLARS (column name is legacy — not BB units)';
