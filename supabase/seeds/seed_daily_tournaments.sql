-- ============================================================
-- SEED DATA: DAILY TOURNAMENT SCHEDULES
-- Source: data/daily-tournament-schedules.json
-- Generated: 2026-01-26
-- ============================================================

-- Clear existing data (optional - uncomment if needed)
-- TRUNCATE venue_daily_tournaments RESTART IDENTITY CASCADE;

-- ============================================================
-- LODGE CARD CLUB AUSTIN (Round Rock, TX)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Lodge Card Club Austin', 'Tuesday', '6:15 PM', 30, 'NLH', 'Freeroll', 15000, 'Texas Freeroll', 'https://thelodgepokerclub.com/austin/tournaments/', true),
('Lodge Card Club Austin', 'Thursday', '6:15 PM', 30, 'NLH', 'Freeroll', 10000, 'Thursday Freeroll', 'https://thelodgepokerclub.com/austin/tournaments/', true),
('Lodge Card Club Austin', 'Friday', '6:15 PM', 120, 'NLH', 'Freezeout', 4000, 'Friday Freezeout', 'https://thelodgepokerclub.com/austin/tournaments/', true),
('Lodge Card Club Austin', 'Sunday', '12:15 PM', 200, 'NLH', 'Deep Stack', 10000, 'Sunday Deep Stack', 'https://thelodgepokerclub.com/austin/tournaments/', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- LODGE CARD CLUB SAN ANTONIO
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Lodge Card Club San Antonio', 'Sunday', '12:15 PM', 200, 'NLH', 'Deep Stack', 15000, 'Sunday Deep Stack', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Sunday', '4:15 PM', 100, 'NLH', 'Freezeout', 2000, 'Sunday Afternoon', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Monday', '12:15 PM', 100, 'NLH', 'Bounty', 2000, 'Monday Bounty', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Monday', '7:15 PM', 100, 'Big-O', NULL, 3500, 'Big-O Night', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Tuesday', '7:15 PM', 30, 'NLH', 'Freeroll', 15000, 'Texas Freeroll', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Wednesday', '7:15 PM', 50, 'PLO', 'Freeroll', 4000, 'PLO Freeroll', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Thursday', '7:15 PM', 30, 'NLH', 'Freeroll', 7500, 'The Dirty Thirty', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Friday', '12:15 PM', 100, 'NLH', 'Bounty', 2000, 'Friday Bounty', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Friday', '7:15 PM', 120, 'NLH', 'Freezeout', 4000, 'Friday Freezeout', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true),
('Lodge Card Club San Antonio', 'Saturday', '7:15 PM', 150, 'NLH', 'Bounty', 4000, 'Bounty Hunter', 'https://thelodgepokerclub.com/san-antonio/tournaments/', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- SOUTH POINT CASINO (Las Vegas, NV)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('South Point Casino', 'Daily', '10:10 AM', 120, 'NLH', NULL, NULL, 'Morning Tournament', 'https://www.southpointcasino.com/casino/poker-room', true),
('South Point Casino', 'Daily', '2:10 PM', 120, 'NLH', NULL, NULL, 'Afternoon Tournament', 'https://www.southpointcasino.com/casino/poker-room', true),
('South Point Casino', 'Daily', '6:10 PM', 120, 'NLH', NULL, NULL, 'Evening Tournament', 'https://www.southpointcasino.com/casino/poker-room', true),
('South Point Casino', 'Daily', '10:10 PM', 120, 'NLH', NULL, NULL, 'Late Night Tournament', 'https://www.southpointcasino.com/casino/poker-room', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- WYNN LAS VEGAS
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Wynn Las Vegas', 'Daily', '6:00 PM', 200, 'NLH', NULL, 10000, 'Nightly Tournament', 'https://www.wynnlasvegas.com/casino/poker', true),
('Wynn Las Vegas', 'Friday', '12:00 PM', 300, 'NLH', 'Rebuy', 40000, 'Friday $40K GTD Rebuy', 'https://www.wynnlasvegas.com/casino/poker', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- BELLAGIO (Las Vegas, NV)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Bellagio', 'Saturday', '11:00 AM', 200, 'NLH', NULL, 4000, 'Saturday Tournament', 'https://www.pokeratlas.com/poker-room/bellagio-las-vegas/tournaments', true),
('Bellagio', 'Sunday', '11:00 AM', 200, 'NLH', 'Mystery Bounty', 4000, 'Sunday Mystery Bounty', 'https://www.pokeratlas.com/poker-room/bellagio-las-vegas/tournaments', true),
('Bellagio', 'Sunday', '4:00 PM', 200, 'NLH', 'Mystery Bounty', 4000, 'Sunday Afternoon Mystery', 'https://www.pokeratlas.com/poker-room/bellagio-las-vegas/tournaments', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- ORLEANS CASINO (Las Vegas, NV)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Orleans Casino', 'Monday', '11:00 AM', 100, 'NLH', NULL, 5000, 'Morning NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Monday', '4:00 PM', 100, 'Mixed', NULL, 5000, 'Mixed Games', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Monday', '6:00 PM', 100, 'NLH', NULL, 5000, 'Evening NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Tuesday', '11:00 AM', 100, 'NLH', NULL, 5000, 'Morning NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Tuesday', '4:00 PM', 100, 'Mixed', NULL, 5000, 'Mixed Games', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Tuesday', '6:00 PM', 100, 'NLH', NULL, 5000, 'Evening NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Wednesday', '11:00 AM', 100, 'NLH', NULL, 5000, 'Morning NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Wednesday', '4:00 PM', 100, 'Mixed', NULL, 5000, 'Mixed Games', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Wednesday', '6:00 PM', 100, 'NLH', NULL, 5000, 'Evening NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Thursday', '11:00 AM', 100, 'NLH', NULL, 5000, 'Morning NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Thursday', '4:00 PM', 100, 'Mixed', NULL, 5000, 'Mixed Games', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Thursday', '6:00 PM', 100, 'NLH', NULL, 5000, 'Evening NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Friday', '11:00 AM', 100, 'NLH', NULL, 5000, 'Morning NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Friday', '6:00 PM', 150, 'NLH', NULL, 7500, 'Friday Night NLH', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Saturday', '11:00 AM', 150, 'NLH', NULL, 7500, 'Saturday Special', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Saturday', '4:00 PM', 100, 'Mixed', NULL, 5000, 'Saturday Mixed', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Sunday', '11:00 AM', 200, 'NLH', NULL, 10000, 'Sunday Special', 'https://orleans.boydgaming.com/play/poker-room', true),
('Orleans Casino', 'Sunday', '6:00 PM', 150, 'PLO', NULL, 7500, 'Sunday Big O', 'https://orleans.boydgaming.com/play/poker-room', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  game_type = EXCLUDED.game_type,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- RED ROCK CASINO (Las Vegas, NV)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Station Casinos Red Rock', 'Monday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon Tournament', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Monday', '6:30 PM', 100, 'NLH', 'Bounty', 3500, 'Monday Bounty', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Tuesday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon Tournament', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Wednesday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon Tournament', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Thursday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon Tournament', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Thursday', '6:30 PM', 100, 'NLH', 'Bounty', 3500, 'Thursday Bounty', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Friday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon Tournament', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Saturday', '12:00 PM', 80, 'NLH', NULL, NULL, 'Saturday Special', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true),
('Station Casinos Red Rock', 'Sunday', '12:00 PM', 80, 'NLH', NULL, NULL, 'Sunday Special', 'http://www.stationcasinospoker.com/dev/tournaments/red-rock.php', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  guaranteed = EXCLUDED.guaranteed,
  format = EXCLUDED.format,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- TALKING STICK RESORT (Scottsdale, AZ)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Talking Stick Resort', 'Monday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Weekday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Monday', '7:15 PM', 200, 'PLO', NULL, NULL, '5-Card PLO', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Tuesday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Weekday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Tuesday', '7:15 PM', 200, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Wednesday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Weekday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Wednesday', '7:15 PM', 200, 'NLH', 'Crazy Pineapple', NULL, 'Crazy Pineapple', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Thursday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Weekday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Thursday', '7:15 PM', 200, 'NLH', 'Bounty', NULL, 'Mini Bounty', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Friday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Weekday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Friday', '7:15 PM', 200, 'NLH', NULL, NULL, 'Friday Night NLH', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Saturday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Saturday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Saturday', '7:15 PM', 200, 'NLH', NULL, NULL, 'Saturday Night NLH', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true),
('Talking Stick Resort', 'Sunday', '11:15 AM', 200, 'NLH', NULL, NULL, 'Sunday Morning', 'https://www.talkingstickresort.com/phoenix-scottsdale-casino/poker/arena-poker-room-tournaments/', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  format = EXCLUDED.format,
  game_type = EXCLUDED.game_type,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- FOXWOODS RESORT CASINO (Ledyard, CT)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, starting_stack, source_url, is_active)
VALUES
('Foxwoods Resort Casino', 'Sunday', '10:10 AM', 395, 'NLH', NULL, NULL, 'Sunday Championship', 40000, 'https://foxwoods.com/game/poker', true),
('Foxwoods Resort Casino', 'Tuesday', '10:10 AM', 135, 'NLH', NULL, NULL, 'Tuesday Morning', 15000, 'https://foxwoods.com/game/poker', true),
('Foxwoods Resort Casino', 'Thursday', '5:10 PM', 255, 'NLH', NULL, NULL, 'Thursday Evening', 30000, 'https://foxwoods.com/game/poker', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  starting_stack = EXCLUDED.starting_stack,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- PARX CASINO (Bensalem, PA)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Parx Casino', 'Monday', '7:15 PM', 200, 'NLH', NULL, NULL, 'Monday Night NLH', 'https://www.parxcasino.com/bensalem/poker', true),
('Parx Casino', 'Friday', '11:15 AM', 340, 'NLH', NULL, NULL, 'Friday Morning Special', 'https://www.parxcasino.com/bensalem/poker', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- BESTBET JACKSONVILLE (Jacksonville, FL)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('bestbet Jacksonville', 'Daily', '3:00 PM', 100, 'NLH', NULL, NULL, 'Afternoon NLH', 'https://www.bestbetjax.com/poker/tournaments', true),
('bestbet Jacksonville', 'Daily', '7:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.bestbetjax.com/poker/tournaments', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- BESTBET ST. AUGUSTINE
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('bestbet St. Augustine', 'Monday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Monday Noon', 'https://www.bestbetjax.com/poker/tournaments', true),
('bestbet St. Augustine', 'Tuesday', '7:00 PM', 100, 'NLH', NULL, NULL, 'Tuesday Evening', 'https://www.bestbetjax.com/poker/tournaments', true),
('bestbet St. Augustine', 'Wednesday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Wednesday Noon', 'https://www.bestbetjax.com/poker/tournaments', true),
('bestbet St. Augustine', 'Thursday', '12:00 PM', 60, 'NLH', NULL, NULL, 'Thursday Noon', 'https://www.bestbetjax.com/poker/tournaments', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- PEPPERMILL RENO (Reno, NV)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Peppermill Resort Spa Casino', 'Daily', '12:00 PM', 135, 'NLH', NULL, NULL, 'Daily Noon Tournament', 'https://www.peppermillreno.com/gaming/poker/poker-tournaments', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- TEXAS CARD HOUSE DALLAS
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Texas Card House Dallas', 'Monday', '12:00 PM', 130, 'NLH', 'Turbo', NULL, 'Turbo Monday', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Monday', '7:00 PM', 200, 'NLH', 'Bounty', NULL, 'Green Chip Bounty', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Tuesday', '12:00 PM', 130, 'NLH', NULL, NULL, 'Tuesday Noon', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Tuesday', '7:00 PM', 300, 'PLO', 'Bounty', NULL, 'Black Chip Bounty', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Wednesday', '12:00 PM', 130, 'NLH', NULL, NULL, 'Wednesday Noon', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Wednesday', '7:00 PM', 200, 'NLH', NULL, NULL, 'Wednesday Night', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Thursday', '12:00 PM', 130, 'NLH', NULL, NULL, 'Thursday Noon', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Thursday', '7:00 PM', 200, 'NLH', 'Deep Stack', NULL, 'Deep Stack Thursday', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Friday', '7:00 PM', 200, 'NLH', NULL, NULL, 'Funky Friday', 'https://www.texascardhouse.com/dallas', true),
('Texas Card House Dallas', 'Saturday', '12:00 PM', 300, 'NLH', 'Freezeout', NULL, 'Saturday Freezeout', 'https://www.texascardhouse.com/dallas', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  format = EXCLUDED.format,
  game_type = EXCLUDED.game_type,
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- SEMINOLE HARD ROCK (Hollywood & Tampa, FL)
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
('Seminole Hard Rock Hollywood', 'Daily', '11:00 AM', 150, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.seminolehardrockhollywood.com/play/poker', true),
('Seminole Hard Rock Hollywood', 'Daily', '7:00 PM', 150, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.seminolehardrockhollywood.com/play/poker', true),
('Seminole Hard Rock Tampa', 'Daily', '12:00 PM', 130, 'NLH', NULL, NULL, 'Noon NLH', 'https://casino.hardrock.com/tampa/play/poker', true),
('Seminole Hard Rock Tampa', 'Daily', '7:00 PM', 130, 'NLH', NULL, NULL, 'Evening NLH', 'https://casino.hardrock.com/tampa/play/poker', true)
ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- OTHER MAJOR VENUES
-- ============================================================
INSERT INTO venue_daily_tournaments (venue_name, day_of_week, start_time, buy_in, game_type, format, guaranteed, tournament_name, source_url, is_active)
VALUES
-- MGM GRAND
('MGM Grand Poker Room', 'Daily', '10:00 AM', 80, 'NLH', NULL, NULL, 'Morning NLH', 'https://mgmgrand.mgmresorts.com/en/casino/poker.html', true),
('MGM Grand Poker Room', 'Daily', '2:00 PM', 100, 'NLH', NULL, NULL, 'Afternoon NLH', 'https://mgmgrand.mgmresorts.com/en/casino/poker.html', true),

-- ARIA
('Aria Resort & Casino', 'Daily', '1:00 PM', 150, 'NLH', NULL, NULL, 'Daily NLH', 'https://aria.mgmresorts.com/en/casino/poker.html', true),

-- RESORTS WORLD
('Resorts World Las Vegas', 'Daily', '11:00 AM', 200, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.rwlasvegas.com/casino/poker/', true),
('Resorts World Las Vegas', 'Daily', '7:00 PM', 200, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.rwlasvegas.com/casino/poker/', true),

-- GREEN VALLEY RANCH
('Station Casinos Green Valley Ranch', 'Monday', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'http://www.stationcasinospoker.com', true),
('Station Casinos Green Valley Ranch', 'Tuesday', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'http://www.stationcasinospoker.com', true),
('Station Casinos Green Valley Ranch', 'Wednesday', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'http://www.stationcasinospoker.com', true),
('Station Casinos Green Valley Ranch', 'Thursday', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'http://www.stationcasinospoker.com', true),
('Station Casinos Green Valley Ranch', 'Friday', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'http://www.stationcasinospoker.com', true),

-- WINSTAR
('WinStar World Casino', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Noon NLH', 'https://www.winstar.com/casino/poker', true),
('WinStar World Casino', 'Daily', '7:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.winstar.com/casino/poker', true),

-- CHOCTAW DURANT
('Choctaw Casino Durant', 'Daily', '7:00 PM', 60, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.choctawcasinos.com/durant', true),

-- HARRAH'S CHEROKEE
('Harrahs Cherokee', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Noon NLH', 'https://www.caesars.com/harrahs-cherokee', true),
('Harrahs Cherokee', 'Daily', '7:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.caesars.com/harrahs-cherokee', true),

-- RIVERS DES PLAINES
('Rivers Casino Des Plaines', 'Daily', '11:00 AM', 125, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.riverscasino.com/desplaines/play/poker', true),
('Rivers Casino Des Plaines', 'Daily', '7:00 PM', 125, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.riverscasino.com/desplaines/play/poker', true),

-- MGM NATIONAL HARBOR
('MGM National Harbor', 'Daily', '11:00 AM', 150, 'NLH', NULL, NULL, 'Daily NLH', 'https://mgmnationalharbor.mgmresorts.com', true),

-- LIVE! CASINO HANOVER
('Live! Casino & Hotel', 'Daily', '11:15 AM', 100, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.livecasinohotel.com/poker', true),
('Live! Casino & Hotel', 'Daily', '7:15 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.livecasinohotel.com/poker', true),

-- TURNING STONE
('Turning Stone Resort', 'Daily', '10:00 AM', 125, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.turningstone.com/gaming/poker', true),

-- DETROIT CASINOS
('MGM Grand Detroit', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.mgmgranddetroit.com', true),
('MotorCity Casino Hotel', 'Daily', '12:00 PM', 60, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.motorcitycasino.com', true),
('Hollywood Casino Greektown', 'Daily', '12:00 PM', 65, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.greektowncasino.com', true),
('FireKeepers Casino', 'Daily', '6:00 PM', 60, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.firekeeperscasino.com', true),

-- OHIO CASINOS
('Hard Rock Cincinnati', 'Daily', '12:00 PM', 80, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.hardrockcasinocincinnati.com', true),
('Hollywood Columbus', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.hollywoodcolumbus.com', true),
('JACK Cleveland Casino', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.jackcleveland.com', true),

-- PA CASINOS
('Rivers Casino Philadelphia', 'Daily', '11:00 AM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.riverscasino.com/philadelphia/play/poker', true),
('Live! Casino Philadelphia', 'Daily', '11:00 AM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://philadelphia.livecasinohotel.com', true),
('Rivers Casino Pittsburgh', 'Daily', '11:00 AM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.riverscasino.com/pittsburgh/play/poker', true),

-- WASHINGTON STATE
('Muckleshoot Casino', 'Daily', '10:00 AM', 60, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.muckleshootcasino.com', true),
('Tulalip Resort Casino', 'Daily', '6:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.tulalipresortcasino.com', true),

-- WISCONSIN
('Potawatomi Casino Hotel', 'Daily', '12:00 PM', 100, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.paysbig.com', true),

-- MINNESOTA
('Canterbury Park Card Club', 'Daily', '10:00 AM', 60, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.canterburypark.com', true),
('Canterbury Park Card Club', 'Daily', '6:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.canterburypark.com', true),

-- NEW HAMPSHIRE
('The Brook Poker Room', 'Daily', '10:00 AM', 40, 'NLH', NULL, NULL, 'Morning NLH', 'https://www.thebrooknh.com', true),
('The Brook Poker Room', 'Daily', '1:00 PM', 60, 'NLH', NULL, NULL, 'Afternoon NLH', 'https://www.thebrooknh.com', true),
('The Brook Poker Room', 'Daily', '7:00 PM', 80, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.thebrooknh.com', true),

-- FLORIDA CARD ROOMS
('Derby Lane Poker Room', 'Daily', '1:00 PM', 65, 'NLH', NULL, NULL, 'Afternoon NLH', 'https://www.derbylane.com', true),
('Derby Lane Poker Room', 'Daily', '7:00 PM', 65, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.derbylane.com', true),
('Palm Beach Kennel Club', 'Daily', '12:00 PM', 60, 'NLH', NULL, NULL, 'Noon NLH', 'https://www.pbkennelclub.com', true),
('Palm Beach Kennel Club', 'Daily', '7:00 PM', 100, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.pbkennelclub.com', true),
('One-Eyed Jacks Poker', 'Daily', '12:00 PM', 50, 'NLH', NULL, NULL, 'Noon NLH', 'https://www.oneeyedjackspoker.com', true),
('One-Eyed Jacks Poker', 'Daily', '7:00 PM', 80, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.oneeyedjackspoker.com', true),
('Daytona Racing & Card Club', 'Daily', '1:00 PM', 40, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.daytonapoker.com', true),
('Orange City Racing & Card Club', 'Daily', '1:00 PM', 50, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.orangecitypoker.com', true),
('Oxford Downs Poker Room', 'Daily', '12:00 PM', 40, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.oxforddowns.com', true),

-- OREGON
('Final Table Poker Club', 'Daily', '12:00 PM', 50, 'NLH', NULL, NULL, 'Noon NLH', 'https://www.finaltablepoker.com', true),
('Final Table Poker Club', 'Daily', '7:00 PM', 80, 'NLH', NULL, NULL, 'Evening NLH', 'https://www.finaltablepoker.com', true),

-- MONTANA
('Seat Open Poker Room', 'Daily', '7:00 PM', 40, 'NLH', NULL, NULL, 'Daily NLH', 'https://www.pokeratlas.com/poker-room/seat-open-bozeman', true)

ON CONFLICT (venue_name, day_of_week, start_time, buy_in) DO UPDATE SET
  last_scraped = NOW(),
  is_active = true;

-- ============================================================
-- SUMMARY STATISTICS
-- ============================================================
SELECT
  'Total Tournaments Loaded' as metric,
  COUNT(*) as count
FROM venue_daily_tournaments
WHERE is_active = true

UNION ALL

SELECT
  'Unique Venues with Tournaments',
  COUNT(DISTINCT venue_name)
FROM venue_daily_tournaments
WHERE is_active = true

UNION ALL

SELECT
  'Daily Tournaments',
  COUNT(*)
FROM venue_daily_tournaments
WHERE day_of_week = 'Daily' AND is_active = true;
