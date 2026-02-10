-- Add custom rule metadata columns to bankroll_rules
-- These columns support user-created custom bankroll rules with labels and descriptions

ALTER TABLE bankroll_rules ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE bankroll_rules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE bankroll_rules ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '$';
