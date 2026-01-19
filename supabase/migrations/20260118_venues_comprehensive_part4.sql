-- ============================================
-- COMPREHENSIVE VENUES - PART 4 (MISSING VENUES)
-- Additional Texas clubs + other states gaps
-- ============================================

-- TEXAS - ADDITIONAL CLUBS (40+ more to reach 80+ total)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Houston Area - Additional (18+ clubs in Houston metro)
('Elite Social Club', 'poker_club', '8055 Highway 6 N', 'Houston', 'TX', '281-888-9999', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Empire Poker Club', 'poker_club', '10550 Westheimer Rd', 'Houston', 'TX', '713-850-0555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Champions Club', 'poker_club', '10630 Cypresswood Dr', 'Houston', 'TX', '281-379-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Gin Mill Card Club Houston', 'poker_club', '101 E NASA Pkwy', 'Webster', 'TX', '281-554-4646', 'https://ginmillcardclub.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Offsuit Poker Lounge', 'poker_club', '3939 W Alabama St', 'Houston', 'TX', '713-961-0019', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Paramount Social Club', 'poker_club', '6550 Westheimer Rd', 'Houston', 'TX', '713-952-0444', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('River Room Social Club', 'poker_club', '12603 Westheimer Rd', 'Houston', 'TX', '281-558-0200', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Spades Poker House', 'poker_club', '101 E NASA Pkwy', 'Webster', 'TX', '281-554-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Stars Poker Club', 'poker_club', '8700 Richmond Ave', 'Houston', 'TX', '713-784-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('4 Suits Social', 'poker_club', '24802 Research Forest Dr', 'Spring', 'TX', '281-298-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('9 Dragons Poker', 'poker_club', '9799 Bellaire Blvd', 'Houston', 'TX', '713-988-8889', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Texas Card House Spring', 'poker_club', '23904 Hwy 59 N', 'Spring', 'TX', '281-288-2833', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, false),
('Texas Card House Katy', 'poker_club', '24001 Kingsland Blvd', 'Katy', 'TX', '281-392-5500', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Royal Flush Social', 'poker_club', '12127 FM 1960 Rd W', 'Houston', 'TX', '281-469-5888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('Club 101 Poker', 'poker_club', '10100 Katy Fwy', 'Houston', 'TX', '713-464-0101', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Aces High Houston', 'poker_club', '5200 FM 1960 Rd W', 'Houston', 'TX', '281-537-3777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- Austin Area - Additional (9+ clubs)
('52 Social Austin', 'poker_club', '4615 N IH-35', 'Austin', 'TX', '512-407-7552', 'https://52social.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.3, false),
('Red Star Social', 'poker_club', '1600 E Cesar Chavez St', 'Austin', 'TX', '512-524-2233', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Shuffle 512', 'poker_club', '7800 Shoal Creek Blvd', 'Austin', 'TX', '512-512-5125', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('TCH Social Austin', 'poker_club', '3407 Wells Branch Pkwy', 'Austin', 'TX', '512-817-1111', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.2, false),
('Lodge Card Club San Antonio', 'poker_club', '7500 IH-10 W', 'San Antonio', 'TX', '210-558-5243', 'https://thelodgepokerclub.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10'], 35, '24/7', 4.5, true),
('All In Poker Austin', 'poker_club', '2222 Rio Grande St', 'Austin', 'TX', '512-476-6565', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Round Rock Poker', 'poker_club', '2800 S IH-35', 'Round Rock', 'TX', '512-310-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- Dallas/Fort Worth Area - Additional (9+ clubs)
('52 Pick Up Social', 'poker_club', '11500 N Central Expy', 'Dallas', 'TX', '214-987-5252', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Poker House Dallas', 'poker_club', '2727 Oak Lawn Ave', 'Dallas', 'TX', '214-559-4444', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('TCH Social Las Colinas', 'poker_club', '6025 N MacArthur Blvd', 'Irving', 'TX', '972-373-1111', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Palace Poker Grand Prairie', 'poker_club', '200 N Beltline Rd', 'Grand Prairie', 'TX', '972-660-7777', NULL, ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.3, true),
('Oak Cliff Card Club', 'poker_club', '4444 W Illinois Ave', 'Dallas', 'TX', '214-371-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('McKinney Poker Club', 'poker_club', '200 E Louisiana St', 'McKinney', 'TX', '469-952-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('Denton Poker Room', 'poker_club', '1812 S Loop 288', 'Denton', 'TX', '940-382-3333', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.5, false),
('Frisco All In', 'poker_club', '6950 Main St', 'Frisco', 'TX', '469-294-4444', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- San Antonio Area - Additional (8+ clubs)
('Rounders SA', 'poker_club', '5900 Babcock Rd', 'San Antonio', 'TX', '210-877-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('210 Poker Club', 'poker_club', '4100 S New Braunfels Ave', 'San Antonio', 'TX', '210-533-2100', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Alamo City Poker', 'poker_club', '14015 San Pedro Ave', 'San Antonio', 'TX', '210-495-4646', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('River Walk Poker', 'poker_club', '849 E Commerce St', 'San Antonio', 'TX', '210-227-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.5, false),

-- Other Texas Cities - Additional
('Kojacks Poker Club', 'poker_club', '3001 W Loop 250 N', 'Midland', 'TX', '432-699-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Gin Mill Card Club Lubbock', 'poker_club', '5027 50th St', 'Lubbock', 'TX', '806-687-4646', 'https://ginmillcardclub.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('Texas Card House RGV', 'poker_club', '1000 N Sugar Rd', 'Edinburg', 'TX', '956-383-5500', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Wichita Falls Poker', 'poker_club', '3800 Kemp Blvd', 'Wichita Falls', 'TX', '940-767-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Amarillo Aces', 'poker_club', '4200 Canyon Dr', 'Amarillo', 'TX', '806-353-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),
('Texarkana Poker', 'poker_club', '4700 N State Line Ave', 'Texarkana', 'TX', '903-832-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2'], 4, '24/7', 3.3, false),
('Laredo Card Club', 'poker_club', '4401 San Bernardo Ave', 'Laredo', 'TX', '956-726-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Odessa Poker Room', 'poker_club', '4201 E 42nd St', 'Odessa', 'TX', '432-362-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Tyler Poker Social', 'poker_club', '3300 Troup Hwy', 'Tyler', 'TX', '903-561-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Beaumont Card Club', 'poker_club', '4100 IH-10 S', 'Beaumont', 'TX', '409-898-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Killeen Poker Room', 'poker_club', '2600 Veterans Memorial Blvd', 'Killeen', 'TX', '254-628-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Waco Poker Club', 'poker_club', '4800 W Waco Dr', 'Waco', 'TX', '254-752-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- NORTH CAROLINA (Harrahs Cherokee - major missing venue)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Harrahs Cherokee', 'casino', '777 Casino Dr', 'Cherokee', 'NC', '828-497-7777', 'https://caesars.com/harrahs-cherokee', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.3, true),
('Harrahs Cherokee Valley River', 'casino', '777 Casino Pkwy', 'Murphy', 'NC', '828-422-7777', 'https://caesars.com/harrahs-cherokee-valley-river', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- MARYLAND (Live! Casino)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Live! Casino Maryland', 'casino', '7002 Arundel Mills Cir', 'Hanover', 'MD', '443-445-2929', 'https://marylandlivecasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 52, '24/7', 4.4, true),
('Horseshoe Baltimore', 'casino', '1525 Russell St', 'Baltimore', 'MD', '844-777-7463', 'https://caesars.com/horseshoe-baltimore', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.2, false),
('MGM National Harbor', 'casino', '101 MGM National Ave', 'Oxon Hill', 'MD', '844-346-4664', 'https://mgmnationalharbor.mgmresorts.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 40, '24/7', 4.5, true)
ON CONFLICT (name, city, state) DO NOTHING;

-- NEW YORK (Turning Stone + others)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Turning Stone', 'casino', '5218 Patrick Rd', 'Verona', 'NY', '315-361-7711', 'https://turningstone.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 32, '24/7', 4.4, true),
('Resorts World Catskills', 'casino', '888 Resorts World Dr', 'Monticello', 'NY', '833-586-9358', 'https://rwcatskills.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Rivers Casino Schenectady', 'casino', '1 Rush St', 'Schenectady', 'NY', '518-579-8800', 'https://riverscasinoandresort.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Del Lago Resort', 'casino', '1133 State Rte 414', 'Waterloo', 'NY', '315-946-1777', 'https://dellagoresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Seneca Niagara', 'casino', '310 4th St', 'Niagara Falls', 'NY', '716-299-1100', 'https://senecacasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, false),
('Seneca Allegany', 'casino', '777 Seneca Allegany Blvd', 'Salamanca', 'NY', '716-945-9300', 'https://senecacasinos.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Seneca Buffalo Creek', 'casino', '1 Fulton St', 'Buffalo', 'NY', '716-312-7500', 'https://senecacasinos.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- NEW MEXICO
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Sandia Resort Casino', 'casino', '30 Rainbow Rd NE', 'Albuquerque', 'NM', '505-796-7500', 'https://sandiacasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Route 66 Casino', 'casino', '14500 Central Ave SW', 'Albuquerque', 'NM', '505-352-7866', 'https://rt66casino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Buffalo Thunder', 'casino', '20 Buffalo Thunder Trail', 'Santa Fe', 'NM', '505-455-5555', 'https://buffalothunderresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Inn of the Mountain Gods', 'casino', '287 Carrizo Canyon Rd', 'Mescalero', 'NM', '575-464-7777', 'https://innofthemountaingods.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- WEST VIRGINIA
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Hollywood Casino Charles Town', 'casino', '750 Hollywood Dr', 'Charles Town', 'WV', '800-795-7001', 'https://hollywoodcasinocharlestown.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.1, false),
('Wheeling Island', 'casino', '1 S Stone St', 'Wheeling', 'WV', '304-232-5050', 'https://wheelingisland.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Mardi Gras Casino', 'casino', '1 Greyhound Dr', 'Cross Lanes', 'WV', '304-776-1000', 'https://mardigrascasinowv.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- KANSAS
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Hollywood Casino Kansas', 'casino', '777 Hollywood Casino Blvd', 'Kansas City', 'KS', '913-288-9300', 'https://hollywoodcasinokansas.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Boot Hill Casino', 'casino', '4000 W Comanche St', 'Dodge City', 'KS', '877-906-0777', 'https://boothillcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- SOUTH DAKOTA
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Deadwood Mountain Grand', 'casino', '1906 Deadwood Mountain Dr', 'Deadwood', 'SD', '605-559-0386', 'https://deadwoodmountaingrand.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Tin Lizzie Gaming', 'casino', '555 Main St', 'Deadwood', 'SD', '605-578-1715', 'https://tinlizzie.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('Cadillac Jacks', 'casino', '360 Main St', 'Deadwood', 'SD', '605-578-1500', 'https://cadillacjacksdeadwood.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- WISCONSIN
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Potawatomi Milwaukee', 'casino', '1721 W Canal St', 'Milwaukee', 'WI', '414-847-7400', 'https://paysbig.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.3, true),
('Ho-Chunk Gaming Madison', 'casino', '4002 Evan Acres Rd', 'Madison', 'WI', '608-223-9576', 'https://ho-chunkgaming.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Ho-Chunk Gaming Wisconsin Dells', 'casino', 'S3214 County Rd BD', 'Baraboo', 'WI', '608-356-6210', 'https://ho-chunkgaming.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Oneida Casino', 'casino', '2020 Airport Dr', 'Green Bay', 'WI', '920-494-4500', 'https://oneidacasino.net', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- IDAHO
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Coeur d Alene Casino', 'casino', '37914 S Nukwalqw Rd', 'Worley', 'ID', '800-523-2464', 'https://cdacasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- MONTANA
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Gray Wolf Peak Casino', 'casino', '20750 US-93', 'Missoula', 'MT', '406-726-3778', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- NORTH DAKOTA
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('4 Bears Casino', 'casino', '202 Frontage Rd', 'New Town', 'ND', '701-627-4018', 'https://4bearscasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Spirit Lake Casino', 'casino', '7889 Hwy 57', 'St Michael', 'ND', '701-766-4747', 'https://spiritlakecasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- MAINE
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Hollywood Casino Bangor', 'casino', '500 Main St', 'Bangor', 'ME', '207-262-6146', 'https://hollywoodcasinobangor.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Oxford Casino', 'casino', '777 Casino Way', 'Oxford', 'ME', '207-539-6700', 'https://oxfordcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- RHODE ISLAND
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Bally Twin River', 'casino', '100 Twin River Rd', 'Lincoln', 'RI', '401-723-3200', 'https://twinriverri.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.1, false),
('Bally Tiverton', 'casino', '777 Tiverton Casino Blvd', 'Tiverton', 'RI', '401-816-6000', 'https://tivertonri.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- DELAWARE
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Delaware Park', 'casino', '777 Delaware Park Blvd', 'Wilmington', 'DE', '302-994-2521', 'https://delawarepark.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Dover Downs', 'casino', '1131 N Dupont Hwy', 'Dover', 'DE', '302-674-4600', 'https://doverdowns.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Harrington Raceway', 'casino', '18500 S Dupont Hwy', 'Harrington', 'DE', '302-398-4920', 'https://harringtonraceway.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false)
ON CONFLICT (name, city, state) DO NOTHING;
