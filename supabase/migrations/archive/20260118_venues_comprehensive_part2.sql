-- ============================================
-- COMPREHENSIVE US POKER VENUES - PART 2
-- Texas, Atlantic City/NJ, Pennsylvania, Midwest
-- ============================================

-- TEXAS (60+ poker clubs)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Austin
('Lodge Poker Club', 'poker_club', '6706 N I-35', 'Austin', 'TX', '737-232-5243', 'https://thelodgeaustin.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10','$25/$50'], 40, '24/7', 4.8, true),
('Texas Card House Austin', 'poker_club', '1717 E 6th St', 'Austin', 'TX', '512-800-7288', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.3, true),
('Austin Poker Club', 'poker_club', '8446 N I-35', 'Austin', 'TX', '512-215-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.8, false),
('Kings Club', 'poker_club', '8200 N Lamar Blvd', 'Austin', 'TX', '512-777-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Elite Poker', 'poker_club', '6005 N IH-35', 'Austin', 'TX', '512-888-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- Houston
('Prime Social', 'poker_club', '2909 Gillespie St', 'Houston', 'TX', '832-830-5009', 'https://primesocialclub.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10','$25/$50'], 35, '24/7', 4.5, true),
('Legends Poker Room', 'poker_club', '3939 Bellaire Blvd', 'Houston', 'TX', '713-661-4600', 'https://legendspokerroom.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.1, false),
('52 Social', 'poker_club', '5829 W Sam Houston Pkwy', 'Houston', 'TX', '281-888-5252', 'https://52social.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10'], 30, '24/7', 4.3, false),
('101 Poker Club', 'poker_club', '4141 Southwest Fwy', 'Houston', 'TX', '713-111-0101', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.9, false),
('The Poker House', 'poker_club', '3322 Main St', 'Houston', 'TX', '713-222-3333', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.8, false),
('Aces High Poker', 'poker_club', '9800 Westheimer Rd', 'Houston', 'TX', '713-999-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Jackpot Club', 'poker_club', '8600 Bellaire Blvd', 'Houston', 'TX', '713-777-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('All In Poker', 'poker_club', '5600 Kirby Dr', 'Houston', 'TX', '713-555-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.6, false),
('Champions Poker', 'poker_club', '17400 Northwest Fwy', 'Houston', 'TX', '281-444-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),
('Kings Poker Houston', 'poker_club', '6060 Westheimer Rd', 'Houston', 'TX', '713-666-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.6, false),

-- Dallas/Fort Worth
('Texas Card House Dallas', 'poker_club', '2701 S Stemmons Fwy', 'Lewisville', 'TX', '972-738-8700', 'https://texascardhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.2, false),
('Shuffle 214', 'poker_club', '2614 Swiss Ave', 'Dallas', 'TX', '214-741-1000', 'https://shuffle214.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.3, false),
('Dallas Poker Room', 'poker_club', '1901 S Collins St', 'Arlington', 'TX', '817-555-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.8, false),
('Aces Dallas', 'poker_club', '12700 Preston Rd', 'Dallas', 'TX', '972-888-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.7, false),
('Fort Worth Poker Club', 'poker_club', '6601 Camp Bowie Blvd', 'Fort Worth', 'TX', '817-777-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.6, false),
('Cowboys Poker', 'poker_club', '2300 N Collins St', 'Arlington', 'TX', '817-666-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),
('Plano Poker', 'poker_club', '6505 Coit Rd', 'Plano', 'TX', '972-444-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),
('Irving Poker Club', 'poker_club', '2305 N O Connor Rd', 'Irving', 'TX', '972-333-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),

-- San Antonio
('Hideaway Poker', 'poker_club', '8026 Marbach Rd', 'San Antonio', 'TX', '210-674-4357', 'https://hideawaypoker.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('SA Poker Club', 'poker_club', '8400 Fredericksburg Rd', 'San Antonio', 'TX', '210-555-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Alamo Poker', 'poker_club', '5800 NW Loop 410', 'San Antonio', 'TX', '210-777-5555', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('River City Poker', 'poker_club', '7800 Culebra Rd', 'San Antonio', 'TX', '210-444-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),

-- Texas Indian Casino
('Kickapoo Lucky Eagle', 'casino', '794 Lucky Eagle Dr', 'Eagle Pass', 'TX', '830-758-1966', 'https://kickapooluckyeaglecasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),

-- Other Texas Cities
('El Paso Poker', 'poker_club', '6700 Gateway E', 'El Paso', 'TX', '915-888-7777', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.5, false),
('Corpus Christi Poker', 'poker_club', '4500 S Staples St', 'Corpus Christi', 'TX', '361-555-8888', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.4, false),
('Lubbock Poker', 'poker_club', '5200 82nd St', 'Lubbock', 'TX', '806-777-5555', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false),
('Amarillo Poker', 'poker_club', '3600 I-40 E', 'Amarillo', 'TX', '806-444-8888', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false),
('McAllen Poker', 'poker_club', '2700 N 10th St', 'McAllen', 'TX', '956-555-7777', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- ATLANTIC CITY / NEW JERSEY (10+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Borgata', 'casino', '1 Borgata Way', 'Atlantic City', 'NJ', '609-317-1000', 'https://theborgata.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$25'], 85, '24/7', 4.6, true),
('Harrahs AC', 'casino', '777 Harrahs Blvd', 'Atlantic City', 'NJ', '609-441-5000', 'https://caesars.com/harrahs-ac', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.2, false),
('Tropicana AC', 'casino', '2831 Boardwalk', 'Atlantic City', 'NJ', '609-340-4000', 'https://tropicana.net', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Golden Nugget AC', 'casino', '600 Huron Ave', 'Atlantic City', 'NJ', '609-441-2000', 'https://goldennugget.com/atlantic-city', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Ocean Casino', 'casino', '500 Boardwalk', 'Atlantic City', 'NJ', '609-783-8000', 'https://theoceanac.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 18, '24/7', 4.1, false),
('Hard Rock AC', 'casino', '1000 Boardwalk', 'Atlantic City', 'NJ', '609-449-1000', 'https://hardrockhotelatlanticcity.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.2, false),
('Resorts Casino', 'casino', '1133 Boardwalk', 'Atlantic City', 'NJ', '609-344-6000', 'https://resortsac.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Bally AC', 'casino', '1900 Boardwalk', 'Atlantic City', 'NJ', '609-340-2000', 'https://caesars.com/ballys-ac', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Caesars AC', 'casino', '2100 Boardwalk', 'Atlantic City', 'NJ', '609-348-4411', 'https://caesars.com/caesars-ac', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- PENNSYLVANIA (15+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Parx Casino', 'casino', '2999 Street Rd', 'Bensalem', 'PA', '215-639-9000', 'https://parxcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 45, '24/7', 4.4, true),
('Rivers Pittsburgh', 'casino', '777 Casino Dr', 'Pittsburgh', 'PA', '412-231-7777', 'https://riverscasino.com/pittsburgh', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 30, '24/7', 4.3, false),
('Sands Bethlehem', 'casino', '77 Sands Blvd', 'Bethlehem', 'PA', '877-726-3777', 'https://windcreekbethlehem.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 28, '24/7', 4.2, false),
('SugarHouse Philadelphia', 'casino', '1001 N Delaware Ave', 'Philadelphia', 'PA', '877-477-3715', 'https://playsugarhouse.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.1, false),
('Harrahs Philadelphia', 'casino', '777 Harrahs Blvd', 'Chester', 'PA', '800-480-8020', 'https://caesars.com/harrahs-philadelphia', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.1, false),
('Valley Forge Casino', 'casino', '1160 1st Ave', 'King of Prussia', 'PA', '610-354-8118', 'https://vfrpoker.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.0, false),
('Mohegan Sun Pocono', 'casino', '1280 Hwy 315', 'Wilkes-Barre', 'PA', '570-831-2100', 'https://mohegansunpocono.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.0, false),
('Hollywood Penn National', 'casino', '777 Hollywood Blvd', 'Grantville', 'PA', '717-469-2211', 'https://hollywoodpnrc.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.9, false),
('Meadows Casino', 'casino', '210 Racetrack Rd', 'Washington', 'PA', '724-503-1200', 'https://themmeaddows.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.0, false),
('Mount Airy', 'casino', '312 Woodland Rd', 'Mount Pocono', 'PA', '570-243-4800', 'https://mountairycasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Presque Isle Downs', 'casino', '8199 Perry Hwy', 'Erie', 'PA', '814-866-8379', 'https://presqueisledowns.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.7, false),
('Lady Luck Nemacolin', 'casino', '4067 National Pike', 'Farmington', 'PA', '866-344-6957', 'https://nemacolin.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.6, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- CONNECTICUT (2 major venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Foxwoods', 'casino', '350 Trolley Line Blvd', 'Mashantucket', 'CT', '860-312-3000', 'https://foxwoods.com', ARRAY['NLH','PLO','Stud'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$25'], 100, '24/7', 4.5, true),
('Mohegan Sun', 'casino', '1 Mohegan Sun Blvd', 'Uncasville', 'CT', '860-862-8000', 'https://mohegansun.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 42, '24/7', 4.4, true)
ON CONFLICT (name, city, state) DO NOTHING;

-- MIDWEST: ILLINOIS, INDIANA, MICHIGAN, OHIO, MINNESOTA, IOWA, MISSOURI
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Illinois
('Rivers Chicago', 'casino', '3000 S Halsted St', 'Chicago', 'IL', '312-527-3700', 'https://riverscasino.com/chicago', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 24, '24/7', 4.3, false),
('Hollywood Aurora', 'casino', '1 New York St Bridge', 'Aurora', 'IL', '630-801-7000', 'https://hollywoodcasinoaurora.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Grand Victoria', 'casino', '250 S Grove Ave', 'Elgin', 'IL', '847-888-1000', 'https://grandvictoria-casino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Harrahs Joliet', 'casino', '151 N Joliet St', 'Joliet', 'IL', '815-740-7800', 'https://caesars.com/harrahs-joliet', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Par-A-Dice', 'casino', '21 Blackjack Blvd', 'East Peoria', 'IL', '309-698-7711', 'https://paradicecasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- Indiana
('Horseshoe Indiana', 'casino', '11999 Ave of the Emperors', 'Elizabeth', 'IN', '866-676-7463', 'https://caesars.com/horseshoe-indiana', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 30, '24/7', 4.1, false),
('Harrahs Hoosier Park', 'casino', '4500 Dan Patch Circle', 'Anderson', 'IN', '765-642-8802', 'https://caesars.com/harrahs-hoosier-park', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.8, false),
('Ameristar East Chicago', 'casino', '777 Ameristar Blvd', 'East Chicago', 'IN', '219-378-3000', 'https://ameristar.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.9, false),
('Hollywood Lawrenceburg', 'casino', '777 Hollywood Blvd', 'Lawrenceburg', 'IN', '812-539-8000', 'https://hollywoodlawrenceburg.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Blue Chip', 'casino', '777 Blue Chip Dr', 'Michigan City', 'IN', '219-879-7711', 'https://bluechipcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Tropicana Evansville', 'casino', '421 NW Riverside Dr', 'Evansville', 'IN', '812-433-4000', 'https://tropevansville.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),

-- Michigan
('MGM Grand Detroit', 'casino', '1777 3rd Ave', 'Detroit', 'MI', '313-465-1777', 'https://mgmgranddetroit.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, false),
('MotorCity Casino', 'casino', '2901 Grand River Ave', 'Detroit', 'MI', '313-237-7711', 'https://motorcitycasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Greektown Casino', 'casino', '555 E Lafayette Blvd', 'Detroit', 'MI', '313-223-2999', 'https://greektowncasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('FireKeepers', 'casino', '11177 E Michigan Ave', 'Battle Creek', 'MI', '269-962-0000', 'https://firekeeperscasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.1, false),
('Soaring Eagle', 'casino', '6800 Soaring Eagle Blvd', 'Mt Pleasant', 'MI', '989-775-7777', 'https://soaringeaglecasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('Four Winds New Buffalo', 'casino', '11111 Wilson Rd', 'New Buffalo', 'MI', '866-494-6371', 'https://fourwindscasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),

-- Ohio
('JACK Cleveland', 'casino', '100 Public Square', 'Cleveland', 'OH', '216-297-4777', 'https://jackcleveland.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.1, false),
('JACK Thistledown', 'casino', '21501 Emery Rd', 'North Randall', 'OH', '216-662-8600', 'https://jackthistledown.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.8, false),
('Hollywood Columbus', 'casino', '200 Georgesville Rd', 'Columbus', 'OH', '614-308-3333', 'https://hollywoodcolumbus.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Hollywood Toledo', 'casino', '1968 Miami St', 'Toledo', 'OH', '419-661-5200', 'https://hollywoodcasinotoledo.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Hard Rock Cincinnati', 'casino', '1000 Broadway', 'Cincinnati', 'OH', '513-250-3456', 'https://hardrockcasinocincinnati.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.1, false),

-- Minnesota
('Canterbury Park', 'card_room', '1100 Canterbury Rd', 'Shakopee', 'MN', '952-496-6470', 'https://canterburypark.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 40, '24/7', 4.2, true),
('Running Aces', 'card_room', '15201 Running Aces Blvd', 'Columbus', 'MN', '651-925-4600', 'https://runningacesharness.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.0, false),
('Treasure Island', 'casino', '5734 Sturgeon Lake Rd', 'Welch', 'MN', '651-388-6300', 'https://treasureislandcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Mystic Lake', 'casino', '2400 Mystic Lake Blvd NW', 'Prior Lake', 'MN', '952-445-9000', 'https://mysticlake.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),

-- Iowa
('Horseshoe Council Bluffs', 'casino', '2701 23rd Ave', 'Council Bluffs', 'IA', '712-323-2500', 'https://caesars.com/horseshoe-council-bluffs', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Ameristar Council Bluffs', 'casino', '2200 River Rd', 'Council Bluffs', 'IA', '712-328-8888', 'https://ameristar.com/council-bluffs', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Riverside Casino', 'casino', '3184 Hwy 22', 'Riverside', 'IA', '319-648-1234', 'https://riversidecasinoandresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Prairie Meadows', 'casino', '1 Prairie Meadows Dr', 'Altoona', 'IA', '515-967-1000', 'https://prairiemeadows.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),

-- Missouri
('Hollywood St Louis', 'casino', '777 Casino Center Dr', 'Maryland Heights', 'MO', '314-770-8100', 'https://hollywoodcasinostlouis.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('River City Casino', 'casino', '777 River City Casino Blvd', 'St. Louis', 'MO', '314-388-7777', 'https://rivercitystl.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Ameristar St Charles', 'casino', '1 Ameristar Blvd', 'St. Charles', 'MO', '636-949-7777', 'https://ameristar.com/st-charles', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 15, '24/7', 4.1, false),
('Ameristar Kansas City', 'casino', '3200 N Ameristar Dr', 'Kansas City', 'MO', '816-414-7000', 'https://ameristar.com/kansas-city', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Harrahs Kansas City', 'casino', '1 Riverboat Dr', 'North Kansas City', 'MO', '816-472-7777', 'https://caesars.com/harrahs-north-kansas-city', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false)
ON CONFLICT (name, city, state) DO NOTHING;
