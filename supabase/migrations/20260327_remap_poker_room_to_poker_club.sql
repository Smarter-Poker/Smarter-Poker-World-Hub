-- Remap all poker_room venue_type entries to poker_club
-- There are 5 venues with venue_type = 'poker_room' that should be clubs
UPDATE poker_venues
SET venue_type = 'poker_club',
    updated_at = NOW()
WHERE venue_type = 'poker_room';
