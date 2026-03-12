-- Phase 15-20 Horse Realism Migrations
-- Run in Supabase SQL Editor

-- Phase 16: Reaction Diversity
ALTER TABLE social_likes ADD COLUMN IF NOT EXISTS reaction_type text DEFAULT 'like';

-- Phase 17: DM Read Receipts
ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Phase 19: Location-Aware Scheduling
ALTER TABLE content_authors ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
