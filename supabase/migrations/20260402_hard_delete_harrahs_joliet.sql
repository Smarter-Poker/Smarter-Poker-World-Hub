DELETE FROM venues
WHERE name ILIKE '%harrahs joliet%'
   OR (city ILIKE '%joliet%' AND name ILIKE '%harrah%');
