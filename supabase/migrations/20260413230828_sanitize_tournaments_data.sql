-- Migration: Data integrity sweep for Events & Tournaments
-- Purpose: Safely deactivates records that bypass UI timezone rendering checks
-- Risk Level: Modest (Soft deletes instead of hard drops)

BEGIN;

-- 1. Soft delete tournaments dragging NaN/Null time vectors into the Discovery Hubs
UPDATE public.tournaments
SET is_active = false
WHERE 
  start_date IS NULL OR 
  game_type IS NULL OR 
  buy_in < 0;

-- 2. Clean malformed time strings causing formatTime regex failure
UPDATE public.tournaments
SET is_active = false
WHERE 
  start_time != '' AND 
  start_time !~ '^[0-2]?[0-9]:[0-5][0-9]\s*(AM|PM|am|pm)?$' AND
  start_time !~ '^[0-2][0-9]:[0-5][0-9]$';

-- 3. Scrub zombie venues without coordinates disrupting PostGIS bounding maps
UPDATE public.venues
SET is_active = false
WHERE 
  latitude IS NULL OR 
  longitude IS NULL;

-- 4. Set unhandled buy_in entries to 0 rather than dropping
UPDATE public.tournaments
SET buy_in = 0
WHERE buy_in IS NULL;

COMMIT;
