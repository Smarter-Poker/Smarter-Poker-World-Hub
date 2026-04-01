-- Remove Harrahs Joliet from the database (no longer has a poker room)
-- Run this on Supabase after deploying the front-end changes

-- Soft-delete: set is_active = false so historical data is preserved
UPDATE venues
SET is_active = false,
    updated_at = NOW()
WHERE name ILIKE '%harrahs joliet%'
   OR (city ILIKE '%joliet%' AND name ILIKE '%harrah%');

-- Also remove from any daily tournaments if linked
DELETE FROM venue_daily_tournaments
WHERE venue_id IN (
    SELECT id FROM venues
    WHERE name ILIKE '%harrahs joliet%'
       OR (city ILIKE '%joliet%' AND name ILIKE '%harrah%')
);
