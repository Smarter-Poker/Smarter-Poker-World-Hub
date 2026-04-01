-- Remove Harrahs Joliet from the database (no longer has a poker room)

-- Hard delete the venue directly
DELETE FROM venues
WHERE name ILIKE '%harrahs joliet%'
   OR (city ILIKE '%joliet%' AND name ILIKE '%harrah%');
