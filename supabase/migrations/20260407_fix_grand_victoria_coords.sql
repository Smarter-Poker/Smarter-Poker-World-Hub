-- Fix Grand Victoria Casino (id=3109) coordinates
-- Was showing Hollywood Aurora's coordinates (41.7758, -88.3159) instead of
-- Grand Victoria Elgin's actual coordinates (42.03235, -88.27987)
-- This caused WSOPC tour pin to appear at wrong location on map

UPDATE poker_venues
SET latitude = 42.03235,
    longitude = -88.27987,
    address = '250 South Grove Avenue'
WHERE id = 3109
  AND name = 'Grand Victoria Casino';
