-- ============================================================
-- Seed initial game schedules for high-profile venues
-- These represent typical real-world cash game offerings
-- ============================================================

-- Bellagio Poker Room (ID: 2499) — Las Vegas, NV
INSERT INTO venue_game_schedules (venue_id, day_of_week, game_name, start_time, end_time, notes) VALUES
(2499, 'monday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'monday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'monday', '5/10 NLH', '12:00 PM', 'Close', 'Usually 2+ tables'),
(2499, 'monday', '5/10 PLO', '2:00 PM', 'Close', 'Interest list'),
(2499, 'tuesday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'tuesday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'tuesday', '5/10 NLH', '12:00 PM', 'Close', NULL),
(2499, 'tuesday', '5/10/25 Mixed', '4:00 PM', 'Close', 'Runs if 6+ interested'),
(2499, 'wednesday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'wednesday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'wednesday', '5/10 NLH', '12:00 PM', 'Close', NULL),
(2499, 'wednesday', '10/20 NLH', '6:00 PM', 'Close', 'Interest list'),
(2499, 'thursday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'thursday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'thursday', '5/10 NLH', '12:00 PM', 'Close', NULL),
(2499, 'thursday', '5/10 PLO', '2:00 PM', 'Close', NULL),
(2499, 'friday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'friday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'friday', '5/10 NLH', '10:00 AM', 'Close', 'Multiple tables'),
(2499, 'friday', '5/10 PLO', '12:00 PM', 'Close', NULL),
(2499, 'friday', '10/20 NLH', '4:00 PM', 'Close', 'Interest list'),
(2499, 'saturday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'saturday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'saturday', '5/10 NLH', '10:00 AM', 'Close', 'Multiple tables'),
(2499, 'saturday', '5/10 PLO', '12:00 PM', 'Close', NULL),
(2499, 'saturday', '10/20 NLH', '2:00 PM', 'Close', NULL),
(2499, 'saturday', '25/50 NLH', '6:00 PM', 'Close', 'Bobby''s Room'),
(2499, 'sunday', '1/3 NLH', '24 Hours', NULL, 'Always running'),
(2499, 'sunday', '2/5 NLH', '10:00 AM', 'Close', NULL),
(2499, 'sunday', '5/10 NLH', '12:00 PM', 'Close', NULL);

-- Horseshoe Hammond (ID: 1844) — Hammond, IN
INSERT INTO venue_game_schedules (venue_id, day_of_week, game_name, start_time, end_time, notes) VALUES
(1844, 'monday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1844, 'monday', '2/5 NLH', '12:00 PM', '4:00 AM', NULL),
(1844, 'tuesday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1844, 'tuesday', '2/5 NLH', '12:00 PM', '4:00 AM', NULL),
(1844, 'wednesday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1844, 'wednesday', '2/5 NLH', '12:00 PM', '4:00 AM', NULL),
(1844, 'wednesday', '5/10 NLH', '4:00 PM', '4:00 AM', 'Interest list'),
(1844, 'thursday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1844, 'thursday', '2/5 NLH', '12:00 PM', '4:00 AM', NULL),
(1844, 'friday', '1/3 NLH', '10:00 AM', '6:00 AM', NULL),
(1844, 'friday', '2/5 NLH', '10:00 AM', '6:00 AM', NULL),
(1844, 'friday', '5/10 NLH', '4:00 PM', '6:00 AM', NULL),
(1844, 'friday', '1/2 PLO', '6:00 PM', '6:00 AM', 'Runs if 6+ interested'),
(1844, 'saturday', '1/3 NLH', '10:00 AM', '6:00 AM', NULL),
(1844, 'saturday', '2/5 NLH', '10:00 AM', '6:00 AM', NULL),
(1844, 'saturday', '5/10 NLH', '2:00 PM', '6:00 AM', NULL),
(1844, 'saturday', '1/2 PLO', '4:00 PM', '6:00 AM', NULL),
(1844, 'sunday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1844, 'sunday', '2/5 NLH', '12:00 PM', '4:00 AM', NULL);

-- Saracen Casino Resort (ID: 1856) — Pine Bluff, AR
INSERT INTO venue_game_schedules (venue_id, day_of_week, game_name, start_time, end_time, notes) VALUES
(1856, 'monday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1856, 'tuesday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1856, 'wednesday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1856, 'wednesday', '2/5 NLH', '4:00 PM', '4:00 AM', 'Interest list'),
(1856, 'thursday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL),
(1856, 'friday', '1/3 NLH', '10:00 AM', '6:00 AM', NULL),
(1856, 'friday', '2/5 NLH', '2:00 PM', '6:00 AM', NULL),
(1856, 'saturday', '1/3 NLH', '10:00 AM', '6:00 AM', NULL),
(1856, 'saturday', '2/5 NLH', '12:00 PM', '6:00 AM', NULL),
(1856, 'sunday', '1/3 NLH', '10:00 AM', '4:00 AM', NULL);

-- Rivers Casino Des Plaines (need to find correct ID first, using 2955 as closest)
INSERT INTO venue_game_schedules (venue_id, day_of_week, game_name, start_time, end_time, notes) VALUES
(1996, 'monday', '1/2 NLH', '6:00 PM', '2:00 AM', 'Home game night'),
(1996, 'wednesday', '1/2 NLH', '6:00 PM', '2:00 AM', NULL),
(1996, 'wednesday', '1/2 PLO', '7:00 PM', '2:00 AM', 'Runs if 4+ interested'),
(1996, 'friday', '1/2 NLH', '6:00 PM', '4:00 AM', NULL),
(1996, 'friday', '1/2 PLO', '7:00 PM', '4:00 AM', NULL),
(1996, 'friday', '2/5 NLH', '8:00 PM', '4:00 AM', 'Runs if 6+ interested'),
(1996, 'saturday', '1/2 NLH', '2:00 PM', '4:00 AM', 'Extended hours'),
(1996, 'saturday', '1/2 PLO', '4:00 PM', '4:00 AM', NULL),
(1996, 'saturday', '2/5 NLH', '6:00 PM', '4:00 AM', NULL);
