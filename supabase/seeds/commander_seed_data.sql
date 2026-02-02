-- =====================================================
-- CLUB COMMANDER - SEED DATA FOR TESTING
-- =====================================================
-- Run this AFTER all migrations are deployed
-- Creates a test venue with tables, games, and sample data
-- =====================================================

-- ===================
-- 1. CREATE TEST VENUE (or update existing)
-- ===================

-- First, check if we have a test venue, if not create one
INSERT INTO poker_venues (
  id,
  name,
  description,
  address,
  city,
  state,
  zip,
  country,
  phone,
  email,
  website,
  venue_type,
  is_verified,
  commander_enabled,
  commander_tier,
  commander_activated_at,
  auto_text_enabled,
  staff_pin_required,
  waitlist_settings,
  tournament_settings
) VALUES (
  1,  -- Using integer ID 1 for test venue
  'The Lodge Card Club',
  'Premier poker destination in Round Rock, Texas. Home of the Lodge Championship Series.',
  '1700 E Old Settlers Blvd',
  'Round Rock',
  'TX',
  '78664',
  'USA',
  '512-555-0100',
  'info@thelodgecardclub.com',
  'https://thelodgecardclub.com',
  'card_room',
  true,
  true,  -- commander_enabled
  'pro',
  now(),
  true,
  true,
  '{"max_waitlist_per_game": 50, "auto_remove_minutes": 30, "call_timeout_minutes": 5}',
  '{"default_late_reg_levels": 8, "default_break_duration": 15}'
)
ON CONFLICT (id) DO UPDATE SET
  commander_enabled = true,
  commander_tier = 'pro',
  commander_activated_at = COALESCE(poker_venues.commander_activated_at, now()),
  auto_text_enabled = true,
  staff_pin_required = true,
  waitlist_settings = EXCLUDED.waitlist_settings,
  tournament_settings = EXCLUDED.tournament_settings;

-- ===================
-- 2. CREATE TABLES (8 tables)
-- ===================

INSERT INTO commander_tables (id, venue_id, table_number, table_name, max_seats, status, features) VALUES
  (gen_random_uuid(), 1, 1, 'Table 1', 9, 'available', '{"has_usb": true, "has_shuffler": true}'),
  (gen_random_uuid(), 1, 2, 'Table 2', 9, 'available', '{"has_usb": true, "has_shuffler": true}'),
  (gen_random_uuid(), 1, 3, 'Table 3', 9, 'available', '{"has_usb": true, "has_shuffler": false}'),
  (gen_random_uuid(), 1, 4, 'Table 4', 9, 'available', '{"has_usb": true, "has_shuffler": false}'),
  (gen_random_uuid(), 1, 5, 'Table 5', 9, 'available', '{"has_usb": false, "has_shuffler": false}'),
  (gen_random_uuid(), 1, 6, 'Table 6', 9, 'available', '{"has_usb": false, "has_shuffler": false}'),
  (gen_random_uuid(), 1, 7, 'Feature Table', 10, 'available', '{"has_usb": true, "has_shuffler": true, "is_feature": true}'),
  (gen_random_uuid(), 1, 8, 'High Stakes', 9, 'available', '{"has_usb": true, "has_shuffler": true, "high_stakes": true}')
ON CONFLICT DO NOTHING;

-- ===================
-- 3. CREATE SAMPLE GAMES (4 running games)
-- ===================

-- Get table IDs for games
DO $$
DECLARE
  t1_id UUID;
  t2_id UUID;
  t3_id UUID;
  t4_id UUID;
  g1_id UUID;
  g2_id UUID;
  g3_id UUID;
  g4_id UUID;
BEGIN
  -- Get table IDs
  SELECT id INTO t1_id FROM commander_tables WHERE venue_id = 1 AND table_number = 1 LIMIT 1;
  SELECT id INTO t2_id FROM commander_tables WHERE venue_id = 1 AND table_number = 2 LIMIT 1;
  SELECT id INTO t3_id FROM commander_tables WHERE venue_id = 1 AND table_number = 3 LIMIT 1;
  SELECT id INTO t4_id FROM commander_tables WHERE venue_id = 1 AND table_number = 7 LIMIT 1;

  -- Create games
  INSERT INTO commander_games (id, venue_id, table_id, game_type, stakes, min_buyin, max_buyin, current_players, max_players, status, started_at)
  VALUES (gen_random_uuid(), 1, t1_id, 'nlh', '1/3', 100, 500, 9, 9, 'running', now() - interval '2 hours')
  RETURNING id INTO g1_id;

  INSERT INTO commander_games (id, venue_id, table_id, game_type, stakes, min_buyin, max_buyin, current_players, max_players, status, started_at)
  VALUES (gen_random_uuid(), 1, t2_id, 'nlh', '1/3', 100, 500, 8, 9, 'running', now() - interval '1 hour')
  RETURNING id INTO g2_id;

  INSERT INTO commander_games (id, venue_id, table_id, game_type, stakes, min_buyin, max_buyin, current_players, max_players, status, started_at)
  VALUES (gen_random_uuid(), 1, t3_id, 'nlh', '2/5', 200, 1000, 7, 9, 'running', now() - interval '3 hours')
  RETURNING id INTO g3_id;

  INSERT INTO commander_games (id, venue_id, table_id, game_type, stakes, min_buyin, max_buyin, current_players, max_players, status, started_at)
  VALUES (gen_random_uuid(), 1, t4_id, 'plo', '1/2', 100, 500, 6, 9, 'running', now() - interval '45 minutes')
  RETURNING id INTO g4_id;

  -- Update tables with current game
  UPDATE commander_tables SET current_game_id = g1_id, status = 'in_use' WHERE id = t1_id;
  UPDATE commander_tables SET current_game_id = g2_id, status = 'in_use' WHERE id = t2_id;
  UPDATE commander_tables SET current_game_id = g3_id, status = 'in_use' WHERE id = t3_id;
  UPDATE commander_tables SET current_game_id = g4_id, status = 'in_use' WHERE id = t4_id;

  -- Create seats for Game 1 (9/9 full)
  INSERT INTO commander_seats (game_id, seat_number, player_name, status, buyin_amount, seated_at) VALUES
    (g1_id, 1, 'Mike M.', 'occupied', 300, now() - interval '2 hours'),
    (g1_id, 2, 'Sarah K.', 'occupied', 500, now() - interval '2 hours'),
    (g1_id, 3, 'John D.', 'occupied', 200, now() - interval '1 hour'),
    (g1_id, 4, 'Alex T.', 'occupied', 400, now() - interval '90 minutes'),
    (g1_id, 5, 'Chris P.', 'occupied', 300, now() - interval '2 hours'),
    (g1_id, 6, 'David L.', 'away', 500, now() - interval '30 minutes'),
    (g1_id, 7, 'Emily R.', 'occupied', 200, now() - interval '45 minutes'),
    (g1_id, 8, 'Frank G.', 'occupied', 350, now() - interval '1 hour'),
    (g1_id, 9, 'Grace H.', 'occupied', 400, now() - interval '2 hours');

  -- Create seats for Game 2 (8/9)
  INSERT INTO commander_seats (game_id, seat_number, player_name, status, buyin_amount, seated_at) VALUES
    (g2_id, 1, 'Henry W.', 'occupied', 300, now() - interval '1 hour'),
    (g2_id, 2, 'Ivy N.', 'occupied', 200, now() - interval '1 hour'),
    (g2_id, 3, 'Jack B.', 'occupied', 500, now() - interval '45 minutes'),
    (g2_id, 4, NULL, 'empty', NULL, NULL),
    (g2_id, 5, 'Kate M.', 'occupied', 300, now() - interval '30 minutes'),
    (g2_id, 6, 'Leo S.', 'occupied', 400, now() - interval '1 hour'),
    (g2_id, 7, 'Mia C.', 'occupied', 200, now() - interval '20 minutes'),
    (g2_id, 8, 'Noah F.', 'occupied', 350, now() - interval '1 hour'),
    (g2_id, 9, 'Olivia P.', 'occupied', 300, now() - interval '50 minutes');

  -- Create seats for Game 3 (7/9)
  INSERT INTO commander_seats (game_id, seat_number, player_name, status, buyin_amount, seated_at) VALUES
    (g3_id, 1, 'Peter Q.', 'occupied', 500, now() - interval '3 hours'),
    (g3_id, 2, 'Quinn R.', 'occupied', 1000, now() - interval '2 hours'),
    (g3_id, 3, NULL, 'empty', NULL, NULL),
    (g3_id, 4, 'Ryan S.', 'occupied', 800, now() - interval '3 hours'),
    (g3_id, 5, 'Sofia T.', 'occupied', 600, now() - interval '1 hour'),
    (g3_id, 6, NULL, 'empty', NULL, NULL),
    (g3_id, 7, 'Tyler U.', 'occupied', 700, now() - interval '2 hours'),
    (g3_id, 8, 'Uma V.', 'occupied', 500, now() - interval '90 minutes'),
    (g3_id, 9, 'Victor W.', 'occupied', 900, now() - interval '3 hours');

  -- Create seats for Game 4 PLO (6/9)
  INSERT INTO commander_seats (game_id, seat_number, player_name, status, buyin_amount, seated_at) VALUES
    (g4_id, 1, 'Wendy X.', 'occupied', 300, now() - interval '45 minutes'),
    (g4_id, 2, 'Xavier Y.', 'occupied', 500, now() - interval '30 minutes'),
    (g4_id, 3, NULL, 'empty', NULL, NULL),
    (g4_id, 4, 'Yolanda Z.', 'occupied', 400, now() - interval '45 minutes'),
    (g4_id, 5, 'Zack A.', 'occupied', 300, now() - interval '20 minutes'),
    (g4_id, 6, NULL, 'empty', NULL, NULL),
    (g4_id, 7, NULL, 'empty', NULL, NULL),
    (g4_id, 8, 'Amy B.', 'occupied', 400, now() - interval '40 minutes'),
    (g4_id, 9, 'Brian C.', 'occupied', 500, now() - interval '45 minutes');

  -- Create waitlist entries
  INSERT INTO commander_waitlist (venue_id, game_type, stakes, player_name, player_phone, position, signup_method, status, created_at, estimated_wait_minutes) VALUES
    (1, 'nlh', '1/3', 'Daniel E.', '512-555-0001', 1, 'app', 'waiting', now() - interval '20 minutes', 15),
    (1, 'nlh', '1/3', 'Emma F.', '512-555-0002', 2, 'walk_in', 'waiting', now() - interval '15 minutes', 25),
    (1, 'nlh', '1/3', 'Fred G.', '512-555-0003', 3, 'app', 'waiting', now() - interval '10 minutes', 35),
    (1, 'nlh', '1/3', 'Gina H.', '512-555-0004', 4, 'kiosk', 'waiting', now() - interval '5 minutes', 45),
    (1, 'nlh', '2/5', 'Howard I.', '512-555-0005', 1, 'app', 'waiting', now() - interval '30 minutes', 20),
    (1, 'nlh', '2/5', 'Iris J.', '512-555-0006', 2, 'walk_in', 'waiting', now() - interval '25 minutes', 30),
    (1, 'plo', '1/2', 'James K.', '512-555-0007', 1, 'app', 'waiting', now() - interval '15 minutes', 10);

END $$;

-- ===================
-- 4. CREATE STAFF ACCOUNTS
-- ===================

-- Note: These reference profiles that may not exist yet
-- In production, staff would be created by linking real user accounts
-- For testing, we create placeholder staff entries

-- First, let's create a function to add staff if profiles exist
DO $$
DECLARE
  profile_count INTEGER;
BEGIN
  -- Check if any profiles exist
  SELECT COUNT(*) INTO profile_count FROM profiles LIMIT 1;

  IF profile_count > 0 THEN
    -- If profiles exist, make the first one a manager
    INSERT INTO commander_staff (venue_id, user_id, role, permissions, pin_code, is_active)
    SELECT
      1,
      id,
      'manager',
      '{"can_manage_games": true, "can_manage_waitlist": true, "can_manage_staff": true, "can_view_reports": true}',
      '1234',
      true
    FROM profiles
    LIMIT 1
    ON CONFLICT (venue_id, user_id) DO UPDATE SET
      role = 'manager',
      pin_code = '1234',
      is_active = true;

    RAISE NOTICE 'Staff member created from existing profile';
  ELSE
    RAISE NOTICE 'No profiles found - staff will be created when users log in';
  END IF;
END $$;

-- ===================
-- 5. CREATE SAMPLE TOURNAMENT
-- ===================

INSERT INTO commander_tournaments (
  venue_id,
  name,
  description,
  tournament_type,
  buyin_amount,
  buyin_fee,
  starting_chips,
  scheduled_start,
  registration_opens,
  late_registration_levels,
  blind_structure,
  break_schedule,
  payout_structure,
  status,
  max_entries,
  total_entries,
  players_remaining,
  allows_rebuys,
  broadcast_to_smarter
) VALUES (
  1,
  'Friday Night $100 NLH',
  'Weekly tournament with great structure and guaranteed prize pool.',
  'freezeout',
  100,
  20,
  15000,
  now() + interval '2 days',
  now(),
  6,
  '[
    {"level": 1, "small_blind": 25, "big_blind": 50, "ante": 0, "duration_minutes": 20},
    {"level": 2, "small_blind": 50, "big_blind": 100, "ante": 0, "duration_minutes": 20},
    {"level": 3, "small_blind": 75, "big_blind": 150, "ante": 0, "duration_minutes": 20},
    {"level": 4, "small_blind": 100, "big_blind": 200, "ante": 25, "duration_minutes": 20},
    {"level": 5, "small_blind": 150, "big_blind": 300, "ante": 25, "duration_minutes": 20},
    {"level": 6, "small_blind": 200, "big_blind": 400, "ante": 50, "duration_minutes": 20},
    {"level": 7, "small_blind": 300, "big_blind": 600, "ante": 75, "duration_minutes": 20},
    {"level": 8, "small_blind": 400, "big_blind": 800, "ante": 100, "duration_minutes": 20},
    {"level": 9, "small_blind": 500, "big_blind": 1000, "ante": 100, "duration_minutes": 20},
    {"level": 10, "small_blind": 600, "big_blind": 1200, "ante": 200, "duration_minutes": 20}
  ]'::jsonb,
  '[
    {"after_level": 4, "duration_minutes": 15},
    {"after_level": 8, "duration_minutes": 15}
  ]'::jsonb,
  '[
    {"place": 1, "percentage": 50},
    {"place": 2, "percentage": 30},
    {"place": 3, "percentage": 20}
  ]'::jsonb,
  'scheduled',
  50,
  12,
  12,
  false,
  true
)
ON CONFLICT DO NOTHING;

-- ===================
-- 6. CREATE SAMPLE PROMOTION
-- ===================

INSERT INTO commander_promotions (
  venue_id,
  name,
  description,
  promotion_type,
  starts_at,
  ends_at,
  qualifying_games,
  qualifying_stakes,
  rules,
  prize_type,
  prize_amount,
  status
) VALUES (
  1,
  'High Hand of the Hour',
  'Win $100 for the best hand each hour from 6pm-midnight!',
  'high_hand',
  now(),
  now() + interval '7 days',
  ARRAY['nlh', 'plo'],
  ARRAY['1/3', '2/5', '1/2'],
  '{"min_hand": "aces_full", "both_cards_play": true, "board_cards_required": 3}'::jsonb,
  'cash',
  100,
  'active'
)
ON CONFLICT DO NOTHING;

-- ===================
-- VERIFICATION QUERIES
-- ===================

-- Run these to verify seed data:
-- SELECT * FROM poker_venues WHERE commander_enabled = true;
-- SELECT * FROM commander_tables WHERE venue_id = 1;
-- SELECT * FROM commander_games WHERE venue_id = 1 AND status = 'running';
-- SELECT * FROM commander_waitlist WHERE venue_id = 1 AND status = 'waiting';
-- SELECT * FROM commander_tournaments WHERE venue_id = 1;
-- SELECT * FROM commander_promotions WHERE venue_id = 1;

-- ===================
-- STAFF LOGIN INFO
-- ===================
-- Default PIN for testing: 1234
-- This PIN is assigned to the first profile in the system
-- In production, each staff member gets their own PIN
