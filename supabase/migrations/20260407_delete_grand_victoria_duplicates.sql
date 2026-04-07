-- ============================================================
-- HARD DELETE: Grand Victoria duplicate venue records
-- These are stale records showing an old/closed Grand Victoria
-- location that no longer exists. The correct Grand Victoria
-- Casino entry should remain (Elgin, IL casino).
-- Run date: 2026-04-07
-- ============================================================

-- First, preview what we're about to delete (for audit trail)
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE 'Grand Victoria venues found:';
    FOR rec IN
        SELECT id, name, city, state, latitude, longitude, venue_type, trust_score
        FROM venues
        WHERE name ILIKE '%grand victoria%'
        ORDER BY trust_score DESC NULLS LAST
    LOOP
        RAISE NOTICE 'ID: %, Name: %, City: %, State: %, Type: %, Trust: %',
            rec.id, rec.name, rec.city, rec.state, rec.venue_type, rec.trust_score;
    END LOOP;
END $$;

-- Delete ALL Grand Victoria records with low trust scores or bad coordinates
-- Keep only the authoritative Elgin, IL record (highest trust score)
DELETE FROM venues
WHERE name ILIKE '%grand victoria%'
  AND id NOT IN (
    -- Keep the single best Grand Victoria record by trust score
    SELECT id FROM venues
    WHERE name ILIKE '%grand victoria%'
    ORDER BY trust_score DESC NULLS LAST, id ASC
    LIMIT 1
  );

-- Verify final state
SELECT id, name, city, state, latitude, longitude, venue_type, trust_score
FROM venues
WHERE name ILIKE '%grand victoria%';
