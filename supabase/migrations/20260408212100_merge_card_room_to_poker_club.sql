-- Migration: Merge card_room → poker_club
-- card_room and poker_club are identical venue types (private poker rooms).
-- Unifying them to poker_club for consistent filtering/display.
-- Date: 2026-04-08

UPDATE poker_venues
SET venue_type = 'poker_club'
WHERE venue_type = 'card_room';

-- Verify result
-- SELECT venue_type, COUNT(*) FROM poker_venues GROUP BY venue_type ORDER BY count DESC;
