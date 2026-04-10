-- Fix level_duration_minutes and length fields to allow text formats like '20-30 mins', '2-4 hours'.
ALTER TABLE poker_events ALTER COLUMN level_duration_minutes TYPE text USING level_duration_minutes::text;
