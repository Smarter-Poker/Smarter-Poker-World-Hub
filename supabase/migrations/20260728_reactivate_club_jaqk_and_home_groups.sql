-- ============================================================
-- Reactivate Club JAQK (poker_venues) + Fix Social Page
-- Reactivate 3 home groups hidden by 45-day inactivity filter
-- Date: 2026-07-28
-- ============================================================

-- 1. Reactivate Club JAQK in poker_venues (set is_active=true)
UPDATE poker_venues
SET is_active = true
WHERE id = 1996
  AND name = 'Club JAQK';  -- safety guard

-- 2. Fix Club JAQK social page:
--    a) Add slug so it can be deep-linked
--    b) Link it to the poker_venues record (id=1996)
UPDATE social_pages
SET
  slug = 'club-jaqk',
  linked_venue_id = '1996',
  updated_at = NOW()
WHERE id = '1170f414-0c80-43ea-bf06-ce3ec3680b81'
  AND name = 'Club JAQK';  -- safety guard

-- 3. Reactivate home groups hidden by 45-day inactivity filter
--    Set visibility_override_until = 1 year from today so they reappear
UPDATE commander_home_groups
SET visibility_override_until = NOW() + INTERVAL '1 year'
WHERE id IN (
  '046469d3-480b-42cd-8b35-c8c67db19ccb',  -- The Midway Club (Oak Lawn, IL)
  '1794b3be-8313-4e82-93da-1b33f7fca801',  -- Saturday Night Poker Club (Las Vegas, NV)
  '41d45c8f-533b-4fea-8c9c-61707fc6e288'   -- High Rollers Home Game (Las Vegas, NV)
)
AND is_active = true;  -- safety guard: only touch still-active groups
