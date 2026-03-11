-- Add Grinder Settings configuration to the content_settings table
ALTER TABLE content_settings 
ADD COLUMN IF NOT EXISTS grinder_max_tables integer DEFAULT 4,
ADD COLUMN IF NOT EXISTS grinder_daily_hours integer DEFAULT 16,
ADD COLUMN IF NOT EXISTS grinder_starting_chips integer DEFAULT 10000,
ADD COLUMN IF NOT EXISTS grinder_ai_model text DEFAULT 'gpt-4o';
