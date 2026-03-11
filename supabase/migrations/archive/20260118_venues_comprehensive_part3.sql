-- ============================================
-- COMPREHENSIVE US POKER VENUES - PART 3
-- Arizona, Colorado, Oklahoma, Louisiana, Mississippi, Washington, Oregon
-- Plus: ALL MAJOR TOURNAMENT SERIES
-- ============================================

-- ARIZONA (15+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Talking Stick', 'casino', '9800 E Indian Bend Rd', 'Scottsdale', 'AZ', '480-850-7777', 'https://talkingstickresort.com', ARRAY['NLH','PLO','Stud'], ARRAY['$1/$2','$2/$5','$5/$10'], 50, '24/7', 4.4, true),
('Gila River Wild Horse Pass', 'casino', '5040 Wild Horse Pass Blvd', 'Chandler', 'AZ', '520-796-7727', 'https://wingilariver.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.2, false),
('Gila River Vee Quiva', 'casino', '15091 S Komatke Ln', 'Laveen', 'AZ', '520-796-7727', 'https://wingilariver.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Fort McDowell', 'casino', '10424 N Fort McDowell Rd', 'Fort McDowell', 'AZ', '480-837-1424', 'https://fortmcdowellcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Casino Arizona', 'casino', '524 N 92nd St', 'Scottsdale', 'AZ', '480-850-7777', 'https://casinoarizona.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Desert Diamond Tucson', 'casino', '7350 S Nogales Hwy', 'Tucson', 'AZ', '520-294-7777', 'https://ddcaz.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Desert Diamond Glendale', 'casino', '9431 W Northern Ave', 'Glendale', 'AZ', '623-877-7777', 'https://ddcaz.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('We-Ko-Pa Casino', 'casino', '10438 Wekopa Way', 'Fort McDowell', 'AZ', '480-789-7600', 'https://wekopacasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Cliff Castle', 'casino', '555 Middle Verde Rd', 'Camp Verde', 'AZ', '928-567-7900', 'https://cliffcastlecasinohotel.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Apache Sky', 'casino', '7777 US-70', 'Globe', 'AZ', '928-475-7800', 'https://apacheskycasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- COLORADO (10+ venues)  
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Ameristar Black Hawk', 'casino', '111 Richman St', 'Black Hawk', 'CO', '720-946-4000', 'https://ameristar.com/black-hawk', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, true),
('Monarch Black Hawk', 'casino', '488 Main St', 'Black Hawk', 'CO', '303-582-1000', 'https://monarchblackhawk.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Golden Gates', 'casino', '261 Main St', 'Black Hawk', 'CO', '303-582-5600', 'https://goldengatesblackhawk.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 12, '24/7', 4.2, false),
('Isle Casino', 'casino', '401 Main St', 'Black Hawk', 'CO', '303-998-7777', 'https://isleblackhawk.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('Lodge Casino', 'casino', '240 Main St', 'Black Hawk', 'CO', '303-582-1771', 'https://thelodgecasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Saratoga Casino', 'casino', '101 Main St', 'Black Hawk', 'CO', '303-582-6141', 'https://saratogacasinobh.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.6, false),
('Sasquatch Casino', 'casino', '200 Main St', 'Black Hawk', 'CO', '303-582-8499', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Sky Ute Casino', 'casino', '14324 Hwy 172 N', 'Ignacio', 'CO', '970-563-7777', 'https://skyutecasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Ute Mountain Casino', 'casino', '3 Weeminuche Dr', 'Towaoc', 'CO', '970-565-8800', 'https://utemountaincasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- OKLAHOMA (20+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Choctaw Durant', 'casino', '4216 US-69', 'Durant', 'OK', '580-920-0160', 'https://choctawcasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.3, true),
('WinStar World Casino', 'casino', '777 Casino Ave', 'Thackerville', 'OK', '580-276-4229', 'https://winstar.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 46, '24/7', 4.5, true),
('Hard Rock Tulsa', 'casino', '777 W Cherokee St', 'Catoosa', 'OK', '918-384-7800', 'https://hardrockcasinotulsa.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.2, false),
('River Spirit', 'casino', '8330 Riverside Pkwy', 'Tulsa', 'OK', '918-299-8518', 'https://riverspirittulsa.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.1, false),
('Downstream Casino', 'casino', '69300 E Nee Rd', 'Quapaw', 'OK', '918-919-6000', 'https://downstreamcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Buffalo Run', 'casino', '1000 Buffalo Run Blvd', 'Miami', 'OK', '918-542-7140', 'https://buffalorun.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Grand Casino OKC', 'casino', '777 Grand Casino Blvd', 'Oklahoma City', 'OK', '405-964-7263', 'https://grandokcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Newcastle Gaming', 'casino', '2457 State Hwy 39', 'Newcastle', 'OK', '405-387-2889', 'https://newcastle-gaming.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Riverwind Casino', 'casino', '1544 State Hwy 9 W', 'Norman', 'OK', '405-322-6000', 'https://riverwind.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Firelake Casino', 'casino', '41207 Hardesty Rd', 'Shawnee', 'OK', '405-273-8355', 'https://firelakecasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Seven Clans Paradise', 'casino', '7500 Hwy 177', 'Red Rock', 'OK', '580-723-1020', 'https://7clanscasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false),
('Osage Million Dollar Elm', 'casino', '951 W 36th St N', 'Tulsa', 'OK', '918-699-7777', 'https://milliondollarelm.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- LOUISIANA (15+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Beau Rivage', 'casino', '875 Beach Blvd', 'Biloxi', 'MS', '228-386-7111', 'https://beaurivage.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.4, true),
('Harrahs New Orleans', 'casino', '228 Poydras St', 'New Orleans', 'LA', '504-533-6000', 'https://caesars.com/harrahs-new-orleans', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.2, true),
('LAuterge Baton Rouge', 'casino', '777 LAuterge Ave', 'Baton Rouge', 'LA', '225-215-7777', 'https://laubergecasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Golden Nugget Lake Charles', 'casino', '2550 Golden Nugget Blvd', 'Lake Charles', 'LA', '337-508-7777', 'https://goldennugget.com/lake-charles', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Isle of Capri Lake Charles', 'casino', '100 Westlake Ave', 'Westlake', 'LA', '337-430-0711', 'https://isleofcapri.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Eldorado Shreveport', 'casino', '451 Clyde Fant Pkwy', 'Shreveport', 'LA', '318-220-0711', 'https://eldoradoshreveport.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Horseshoe Bossier City', 'casino', '711 Horseshoe Blvd', 'Bossier City', 'LA', '318-742-0711', 'https://caesars.com/horseshoe-bossier-city', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 18, '24/7', 4.1, false),
('Margaritaville Bossier', 'casino', '777 Margaritaville Way', 'Bossier City', 'LA', '318-678-7777', 'https://margaritavillebossiercity.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Coushatta Casino', 'casino', '777 Coushatta Dr', 'Kinder', 'LA', '337-738-1370', 'https://coushattacasinoresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Paragon Casino', 'casino', '711 Paragon Pl', 'Marksville', 'LA', '318-253-1255', 'https://paragoncasinoresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- MISSISSIPPI (10+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('IP Casino', 'casino', '850 Bayview Ave', 'Biloxi', 'MS', '228-436-3000', 'https://ipbiloxi.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Golden Nugget Biloxi', 'casino', '151 Beach Blvd', 'Biloxi', 'MS', '228-435-5400', 'https://goldennugget.com/biloxi', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.0, false),
('Scarlet Pearl', 'casino', '9380 Central Ave', 'Diberville', 'MS', '228-392-1000', 'https://scarletpearlcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 4.0, false),
('Palace Casino', 'casino', '158 Howard Ave', 'Biloxi', 'MS', '228-432-8888', 'https://palacecasinoresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Hollywood Gulf Coast', 'casino', '711 Hollywood Blvd', 'Bay St Louis', 'MS', '228-467-9257', 'https://hollywoodgulfcoast.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Silver Star', 'casino', '13541 Hwy 16 W', 'Philadelphia', 'MS', '601-663-1000', 'https://pearlriverresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Gold Strike', 'casino', '1010 Casino Center Dr', 'Tunica', 'MS', '662-357-1111', 'https://goldstrike.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Horseshoe Tunica', 'casino', '1021 Casino Center Dr', 'Tunica', 'MS', '662-357-5500', 'https://caesars.com/horseshoe-tunica', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 15, '24/7', 4.2, false),
('Sams Town Tunica', 'casino', '1477 Casino Strip Blvd', 'Tunica', 'MS', '662-363-0711', 'https://samstown.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- WASHINGTON (10+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Muckleshoot Casino', 'casino', '2402 Auburn Way S', 'Auburn', 'WA', '253-804-4444', 'https://muckleshootcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.3, true),
('Snoqualmie Casino', 'casino', '37500 SE North Bend Way', 'Snoqualmie', 'WA', '425-888-1234', 'https://snocasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.2, false),
('Tulalip Resort Casino', 'casino', '10200 Quil Ceda Blvd', 'Tulalip', 'WA', '360-716-6000', 'https://tulalipresortcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Emerald Queen Tacoma', 'casino', '2024 E 29th St', 'Tacoma', 'WA', '253-594-7777', 'https://emeraldqueen.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Emerald Queen I-5', 'casino', '2920 E R St', 'Tacoma', 'WA', '253-922-2000', 'https://emeraldqueen.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Ilani Casino', 'casino', '1 Cowlitz Way', 'Ridgefield', 'WA', '360-887-4000', 'https://ilaniresort.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.2, false),
('Northern Quest', 'casino', '100 N Hayford Rd', 'Airway Heights', 'WA', '509-242-7000', 'https://northernquest.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.1, false),
('Clearwater Casino', 'casino', '15347 Suquamish Way NE', 'Suquamish', 'WA', '360-598-8700', 'https://clearwatercasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Little Creek Casino', 'casino', '91 W State Rte 108', 'Shelton', 'WA', '360-427-7711', 'https://little-creek.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Lucky Eagle', 'casino', '12888 188th Ave SW', 'Rochester', 'WA', '360-273-2000', 'https://luckyeagle.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- OREGON (5+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Chinook Winds Casino', 'casino', '1777 NW 44th St', 'Lincoln City', 'OR', '541-996-5825', 'https://chinookwindscasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.0, false),
('Spirit Mountain', 'casino', '27100 SW Salmon River Hwy', 'Grand Ronde', 'OR', '503-879-2350', 'https://spiritmountain.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.1, false),
('The Still Card Room', 'card_room', '7326 NE Hazel Dell Ave', 'Vancouver', 'WA', '360-694-4100', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Wildhorse Resort', 'casino', '46510 Wildhorse Blvd', 'Pendleton', 'OR', '541-278-2274', 'https://wildhorseresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.7, false),
('Seven Feathers', 'casino', '146 Chief Miwaleta Ln', 'Canyonville', 'OR', '541-839-1111', 'https://sevenfeathers.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- ============================================
-- MAJOR TOURNAMENT SERIES 2026
-- ============================================
INSERT INTO tournament_series (name, short_name, venue_name, location, start_date, end_date, main_event_buyin, main_event_guaranteed, total_events, total_guaranteed, website, series_type, is_featured) VALUES
-- WSOP Events
('55th World Series of Poker', 'WSOP', 'Horseshoe/Paris', 'Las Vegas, NV', '2026-05-26', '2026-07-16', 10000, 50000000, 99, 350000000, 'https://wsop.com', 'major', true),
('WSOP Paradise', 'WSOP-P', 'Atlantis', 'Nassau, Bahamas', '2026-12-01', '2026-12-15', 5000, 5000000, 25, 20000000, 'https://wsop.com/paradise', 'major', true),
('WSOP Europe', 'WSOPE', 'Kings Casino', 'Rozvadov, Czech', '2026-09-15', '2026-10-05', 10350, 3000000, 15, 10000000, 'https://wsop.com/europe', 'major', true),

-- WSOP Circuit
('WSOPC Thunder Valley', 'WSOPC', 'Thunder Valley', 'Lincoln, CA', '2026-01-23', '2026-02-03', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOPC Choctaw', 'WSOPC', 'Choctaw Casino', 'Durant, OK', '2026-02-13', '2026-02-24', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOPC Horseshoe Tunica', 'WSOPC', 'Horseshoe Tunica', 'Tunica, MS', '2026-03-06', '2026-03-17', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOPC Harrahs Cherokee', 'WSOPC', 'Harrahs Cherokee', 'Cherokee, NC', '2026-04-03', '2026-04-14', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOPC Horseshoe Indiana', 'WSOPC', 'Horseshoe Indiana', 'Elizabeth, IN', '2026-05-01', '2026-05-12', 1700, 500000, 18, 2500000, 'https://wsop.com/circuit', 'circuit', false),
('WSOPC Grand Finale', 'WSOPC', 'Horseshoe Las Vegas', 'Las Vegas, NV', '2026-08-07', '2026-08-18', 1700, 1000000, 18, 5000000, 'https://wsop.com/circuit', 'circuit', true),

-- World Poker Tour
('WPT World Championship', 'WPT', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-11-29', '2026-12-17', 10400, 15000000, 35, 75000000, 'https://wpt.com', 'major', true),
('WPT Choctaw', 'WPT', 'Choctaw Casino', 'Durant, OK', '2026-02-21', '2026-02-25', 3500, 1000000, 12, 5000000, 'https://wpt.com', 'major', false),
('WPT Borgata Winter Open', 'WPT', 'Borgata', 'Atlantic City, NJ', '2026-01-26', '2026-02-02', 3500, 1500000, 15, 8000000, 'https://wpt.com', 'major', false),
('WPT Seminole Hard Rock', 'WPT', 'Seminole Hard Rock', 'Hollywood, FL', '2026-04-11', '2026-04-21', 3500, 2000000, 15, 10000000, 'https://wpt.com', 'major', true),
('WPT Venetian', 'WPT', 'The Venetian', 'Las Vegas, NV', '2026-06-27', '2026-07-07', 5000, 2000000, 20, 12000000, 'https://wpt.com', 'major', true),
('WPT Thunder Valley', 'WPT', 'Thunder Valley', 'Lincoln, CA', '2026-09-12', '2026-09-22', 3500, 1000000, 12, 5000000, 'https://wpt.com', 'major', false),
('WPT Legends of Poker', 'WPT', 'Bicycle Casino', 'Bell Gardens, CA', '2026-08-22', '2026-09-02', 5000, 3000000, 25, 15000000, 'https://wpt.com', 'major', true),

-- Venetian DeepStack
('Venetian DeepStack Poker Series', 'VDS', 'The Venetian', 'Las Vegas, NV', '2026-05-01', '2026-05-31', 5000, 2000000, 60, 15000000, 'https://venetianlasvegas.com', 'major', true),
('Venetian DeepStack Summer', 'VDS', 'The Venetian', 'Las Vegas, NV', '2026-06-01', '2026-06-30', 5000, 2000000, 55, 12000000, 'https://venetianlasvegas.com', 'major', false),

-- Seminole Hard Rock Series
('Seminole Hard Rock Poker Open', 'SHRPO', 'Seminole Hard Rock', 'Hollywood, FL', '2026-08-01', '2026-08-15', 5250, 5000000, 45, 25000000, 'https://shrpo.com', 'major', true),
('Seminole Hard Rock Showdown', 'SHRPS', 'Seminole Hard Rock Tampa', 'Tampa, FL', '2026-03-07', '2026-03-21', 2700, 1000000, 30, 8000000, 'https://shrpo.com', 'major', false),
('Seminole Rock N Roll Open', 'SHRRNR', 'Seminole Hard Rock', 'Hollywood, FL', '2026-11-14', '2026-11-25', 3500, 2000000, 25, 10000000, 'https://shrpo.com', 'major', false),

-- Borgata Series
('Borgata Poker Open', 'BPO', 'Borgata', 'Atlantic City, NJ', '2026-04-15', '2026-04-27', 3500, 3000000, 36, 10000000, 'https://theborgata.com', 'regional', true),
('Borgata Spring Open', 'BSO', 'Borgata', 'Atlantic City, NJ', '2026-04-15', '2026-04-27', 2700, 2000000, 30, 7000000, 'https://theborgata.com', 'regional', false),
('Borgata Summer Open', 'BSO', 'Borgata', 'Atlantic City, NJ', '2026-07-11', '2026-07-20', 2700, 1500000, 28, 6000000, 'https://theborgata.com', 'regional', false),

-- California Series
('LA Poker Classic', 'LAPC', 'Commerce Casino', 'Commerce, CA', '2026-02-15', '2026-03-05', 10000, 3000000, 60, 15000000, 'https://lapokerclassic.com', 'major', true),
('Bike Series', 'BIKES', 'Bicycle Casino', 'Bell Gardens, CA', '2026-03-15', '2026-03-30', 3500, 1500000, 30, 5000000, 'https://thebike.com', 'regional', false),
('Bay 101 Shooting Star', 'B101SS', 'Bay 101', 'San Jose, CA', '2026-03-01', '2026-03-15', 3500, 1500000, 25, 5000000, 'https://bay101.com', 'regional', true),
('Thunder Valley Main Event', 'TVME', 'Thunder Valley', 'Lincoln, CA', '2026-06-15', '2026-06-22', 2500, 1000000, 12, 3000000, 'https://thundervalleyresort.com', 'regional', false),

-- PokerGO/Poker Central Tours
('PokerGO Cup', 'PGC', 'Aria', 'Las Vegas, NV', '2026-01-15', '2026-01-30', 10000, 1000000, 12, 8000000, 'https://pokergo.com', 'major', true),
('Super High Roller Bowl', 'SHRB', 'Aria', 'Las Vegas, NV', '2026-05-20', '2026-05-25', 250000, 10000000, 5, 25000000, 'https://pokergo.com', 'major', true),
('U.S. Poker Open', 'USPO', 'Aria', 'Las Vegas, NV', '2026-06-12', '2026-06-20', 10000, 1000000, 12, 8000000, 'https://pokergo.com', 'major', true),

-- Texas Series
('Lodge Championship', 'LODGE', 'The Lodge', 'Austin, TX', '2026-05-15', '2026-05-25', 5000, 1000000, 20, 5000000, 'https://thelodgeaustin.com', 'regional', true),
('Lodge Spring Classic', 'LODGE', 'The Lodge', 'Austin, TX', '2026-03-20', '2026-03-30', 2500, 500000, 15, 2500000, 'https://thelodgeaustin.com', 'regional', false),
('Texas State Championship', 'TXSC', 'Texas Card House', 'Austin, TX', '2026-08-10', '2026-08-20', 3000, 750000, 18, 3000000, 'https://texascardhouse.com', 'regional', false),

-- RunGood Poker Series
('RGPS Council Bluffs', 'RGPS', 'Horseshoe Council Bluffs', 'Council Bluffs, IA', '2026-01-09', '2026-01-13', 600, 200000, 10, 500000, 'https://rungoodgear.com', 'circuit', false),
('RGPS WinStar', 'RGPS', 'WinStar', 'Thackerville, OK', '2026-02-06', '2026-02-10', 600, 200000, 10, 500000, 'https://rungoodgear.com', 'circuit', false),
('RGPS Choctaw', 'RGPS', 'Choctaw', 'Durant, OK', '2026-04-10', '2026-04-14', 600, 200000, 10, 500000, 'https://rungoodgear.com', 'circuit', false),
('RGPS Downstream', 'RGPS', 'Downstream', 'Quapaw, OK', '2026-05-29', '2026-06-02', 600, 200000, 10, 500000, 'https://rungoodgear.com', 'circuit', false),
('RGPS Horseshoe Tunica', 'RGPS', 'Horseshoe Tunica', 'Tunica, MS', '2026-07-10', '2026-07-14', 600, 200000, 10, 500000, 'https://rungoodgear.com', 'circuit', false),

-- Mid-States Poker Tour
('MSPT Venetian', 'MSPT', 'The Venetian', 'Las Vegas, NV', '2026-06-15', '2026-06-22', 1100, 1000000, 10, 2000000, 'https://mspt.com', 'circuit', false),
('MSPT Canterbury Park', 'MSPT', 'Canterbury Park', 'Shakopee, MN', '2026-03-22', '2026-03-29', 1100, 500000, 10, 1000000, 'https://mspt.com', 'circuit', false),
('MSPT Potawatomi', 'MSPT', 'Potawatomi', 'Milwaukee, WI', '2026-09-05', '2026-09-12', 1100, 500000, 10, 1000000, 'https://mspt.com', 'circuit', false),

-- Million Dollar Heater
('Beau Rivage Million Dollar Heater', 'MDH', 'Beau Rivage', 'Biloxi, MS', '2026-01-08', '2026-01-19', 2700, 500000, 28, 3000000, 'https://beaurivage.com', 'regional', false),
('Beau Rivage Gulf Coast Championship', 'BRGCC', 'Beau Rivage', 'Biloxi, MS', '2026-09-19', '2026-09-29', 2700, 750000, 25, 3500000, 'https://beaurivage.com', 'regional', false),

-- European Tours
('EPT Barcelona', 'EPT', 'Casino Barcelona', 'Barcelona, Spain', '2026-08-14', '2026-08-25', 5300, 10000000, 70, 50000000, 'https://pokerstars.com/ept', 'major', true),
('EPT Prague', 'EPT', 'Casino Prague', 'Prague, Czech', '2026-12-05', '2026-12-15', 5300, 5000000, 50, 25000000, 'https://pokerstars.com/ept', 'major', true),
('EPT Monte Carlo', 'EPT', 'Monte Carlo Casino', 'Monaco', '2026-04-25', '2026-05-05', 5300, 5000000, 45, 20000000, 'https://pokerstars.com/ept', 'major', true),
('EPT Paris', 'EPT', 'Grand Cercle', 'Paris, France', '2026-02-08', '2026-02-18', 5300, 3000000, 35, 12000000, 'https://pokerstars.com/ept', 'major', false),

-- Wynn Signature Series
('Wynn Millions', 'WM', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-06-20', '2026-07-01', 10000, 10000000, 25, 30000000, 'https://wynnlasvegas.com', 'major', true),
('Wynn Summer Classic', 'WSC', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-06-03', '2026-06-18', 5000, 2000000, 30, 10000000, 'https://wynnlasvegas.com', 'major', false),
('Wynn Fall Classic', 'WFC', 'Wynn Las Vegas', 'Las Vegas, NV', '2026-10-15', '2026-10-28', 5000, 2000000, 28, 9000000, 'https://wynnlasvegas.com', 'major', false),

-- Miscellaneous Regional
('Arizona State Championship', 'AZSC', 'Talking Stick', 'Scottsdale, AZ', '2026-10-03', '2026-10-13', 1650, 500000, 20, 2000000, 'https://talkingstickresort.com', 'regional', false),
('Colorado Poker Championship', 'CPC', 'Golden Gates', 'Black Hawk, CO', '2026-08-15', '2026-08-25', 1500, 300000, 18, 1500000, 'https://goldengatesblackhawk.com', 'regional', false),
('Foxwoods Poker Classic', 'FPC', 'Foxwoods', 'Mashantucket, CT', '2026-07-20', '2026-08-03', 3500, 1000000, 40, 5000000, 'https://foxwoods.com', 'regional', true),
('Mohegan Sun Championship', 'MSC', 'Mohegan Sun', 'Uncasville, CT', '2026-06-01', '2026-06-14', 2500, 750000, 30, 3000000, 'https://mohegansun.com', 'regional', false),
('Parx Big Stax', 'PBSX', 'Parx Casino', 'Bensalem, PA', '2026-03-28', '2026-04-07', 1500, 750000, 25, 3000000, 'https://parxcasino.com', 'regional', false),
('Canterbury Poker Classic', 'CPC', 'Canterbury Park', 'Shakopee, MN', '2026-06-20', '2026-06-30', 1100, 500000, 18, 1500000, 'https://canterburypark.com', 'regional', false)
ON CONFLICT (name, start_date) DO NOTHING;
