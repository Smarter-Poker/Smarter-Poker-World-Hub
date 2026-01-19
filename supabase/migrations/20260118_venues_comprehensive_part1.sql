-- ============================================
-- COMPREHENSIVE US POKER VENUES - PART 1
-- Nevada, California, Florida
-- ============================================

-- NEVADA (60+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Las Vegas Strip
('Bellagio', 'casino', '3600 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-693-7291', 'https://bellagio.mgmresorts.com', ARRAY['NLH','PLO','Mixed','Stud'], ARRAY['$1/$3','$2/$5','$5/$10','$10/$20','$25/$50'], 40, '24/7', 4.8, true),
('Aria', 'casino', '3730 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-590-7667', 'https://aria.mgmresorts.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10','$10/$20'], 24, '24/7', 4.7, true),
('Wynn', 'casino', '3131 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-770-3385', 'https://wynnlasvegas.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10','$10/$20','$25/$50'], 28, '24/7', 4.9, true),
('Venetian', 'casino', '3355 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-414-1320', 'https://venetianlasvegas.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 37, '24/7', 4.6, true),
('Caesars Palace', 'casino', '3570 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-731-7110', 'https://caesars.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 18, '24/7', 4.4, false),
('MGM Grand', 'casino', '3799 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-891-7733', 'https://mgmgrand.mgmresorts.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$1/$3','$2/$5'], 16, '24/7', 4.3, false),
('Resorts World', 'casino', '3000 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-676-7070', 'https://rwlasvegas.com', ARRAY['NLH','PLO'], ARRAY['$1/$3','$2/$5','$5/$10'], 22, '24/7', 4.5, true),
('Paris', 'casino', '3655 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-946-7000', 'https://caesars.com/paris-las-vegas', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.1, false),
('Planet Hollywood', 'casino', '3667 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-785-5555', 'https://caesars.com/planet-hollywood', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Flamingo', 'casino', '3555 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-733-3111', 'https://caesars.com/flamingo-las-vegas', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.9, false),
('Horseshoe LV', 'casino', '3645 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-739-4111', 'https://caesars.com/horseshoe-las-vegas', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.5, true),
('The STRAT', 'casino', '2000 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-380-7777', 'https://thestrat.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Sahara', 'casino', '2535 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-761-7000', 'https://saharalasvegas.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.7, false),
('Treasure Island', 'casino', '3300 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-894-7111', 'https://treasureisland.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.8, false),
('Mirage', 'casino', '3400 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-791-7111', 'https://mirage.mgmresorts.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Mandalay Bay', 'casino', '3950 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-632-7777', 'https://mandalaybay.mgmresorts.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 4.0, false),

-- Downtown Las Vegas
('Golden Nugget', 'casino', '129 Fremont St', 'Las Vegas', 'NV', '702-385-7111', 'https://goldennugget.com/las-vegas', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.3, false),
('Binions', 'casino', '128 Fremont St', 'Las Vegas', 'NV', '702-382-1600', 'https://binions.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.9, false),
('Fremont', 'casino', '200 Fremont St', 'Las Vegas', 'NV', '702-385-3232', 'https://fremontcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.6, false),
('Four Queens', 'casino', '202 Fremont St', 'Las Vegas', 'NV', '702-385-4011', 'https://fourqueens.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('The D', 'casino', '301 Fremont St', 'Las Vegas', 'NV', '702-388-2400', 'https://thed.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.6, false),
('Plaza', 'casino', '1 Main St', 'Las Vegas', 'NV', '702-386-2110', 'https://plazahotelcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),

-- Off-Strip Las Vegas
('Orleans', 'casino', '4500 W Tropicana Ave', 'Las Vegas', 'NV', '702-365-7163', 'https://orleanscasino.com', ARRAY['NLH','PLO','Omaha Hi-Lo'], ARRAY['$1/$2','$2/$5','$3/$6 Limit'], 35, '24/7', 4.2, false),
('South Point', 'casino', '9777 S Las Vegas Blvd', 'Las Vegas', 'NV', '702-797-8009', 'https://southpointcasino.com', ARRAY['NLH','PLO','Stud'], ARRAY['$1/$2','$2/$4 Limit'], 22, '24/7', 4.1, false),
('Rio', 'casino', '3700 W Flamingo Rd', 'Las Vegas', 'NV', '702-777-7777', 'https://riolasvegas.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.0, true),
('Red Rock', 'casino', '11011 W Charleston Blvd', 'Las Vegas', 'NV', '702-797-7777', 'https://stationcasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.3, false),
('Green Valley Ranch', 'casino', '2300 Paseo Verde Pkwy', 'Henderson', 'NV', '702-617-7777', 'https://stationcasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.2, false),
('Sunset Station', 'casino', '1301 W Sunset Rd', 'Henderson', 'NV', '702-547-7777', 'https://stationcasinos.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.0, false),
('Palace Station', 'casino', '2411 W Sahara Ave', 'Las Vegas', 'NV', '702-367-2411', 'https://stationcasinos.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Boulder Station', 'casino', '4111 Boulder Hwy', 'Las Vegas', 'NV', '702-432-7777', 'https://stationcasinos.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.8, false),
('Texas Station', 'casino', '2101 Texas Star Ln', 'N Las Vegas', 'NV', '702-631-1000', 'https://stationcasinos.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.7, false),
('Santa Fe Station', 'casino', '4949 N Rancho Dr', 'Las Vegas', 'NV', '702-658-4900', 'https://stationcasinos.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.7, false),
('Cannery', 'casino', '2121 E Craig Rd', 'N Las Vegas', 'NV', '702-507-5700', 'https://cannerycasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Eastside Cannery', 'casino', '5255 Boulder Hwy', 'Las Vegas', 'NV', '702-856-5300', 'https://eastsidecannery.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('M Resort', 'casino', '12300 S Las Vegas Blvd', 'Henderson', 'NV', '702-797-1000', 'https://themresort.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.1, false),
('Aliante', 'casino', '7300 Aliante Pkwy', 'N Las Vegas', 'NV', '702-692-7777', 'https://aliantecasinohotel.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.8, false),
('Arizona Charlies Decatur', 'casino', '740 S Decatur Blvd', 'Las Vegas', 'NV', '702-258-5200', 'https://arizonacharliesdecatur.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Arizona Charlies Boulder', 'casino', '4575 Boulder Hwy', 'Las Vegas', 'NV', '702-951-5800', 'https://arizonacharliesboulder.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Jokers Wild', 'casino', '920 N Boulder Hwy', 'Henderson', 'NV', '702-564-8100', 'https://jokerswildcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false),
('Club Fortune', 'casino', '725 S Racetrack Rd', 'Henderson', 'NV', '702-566-5555', 'https://clubfortunecasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.3, false),
('Poker Palace', 'card_room', '2757 N Las Vegas Blvd', 'N Las Vegas', 'NV', '702-649-3799', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false),

-- Reno/Tahoe
('Atlantis Casino', 'casino', '3800 S Virginia St', 'Reno', 'NV', '775-825-4700', 'https://atlantiscasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.2, false),
('Peppermill', 'casino', '2707 S Virginia St', 'Reno', 'NV', '775-826-2121', 'https://peppermillreno.com', ARRAY['NLH','Omaha Hi-Lo'], ARRAY['$2/$4 Limit','$1/$2'], 12, '24/7', 4.1, false),
('Grand Sierra Resort', 'casino', '2500 E 2nd St', 'Reno', 'NV', '775-789-2000', 'https://grandsierraresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 4.0, false),
('Silver Legacy', 'casino', '407 N Virginia St', 'Reno', 'NV', '775-325-7401', 'https://silverlegacyreno.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.9, false),
('Eldorado', 'casino', '345 N Virginia St', 'Reno', 'NV', '775-786-5700', 'https://eldoradoreno.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 6, '24/7', 3.8, false),
('Circus Circus Reno', 'casino', '500 N Sierra St', 'Reno', 'NV', '775-329-0711', 'https://circusreno.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('Nugget Sparks', 'casino', '1100 Nugget Ave', 'Sparks', 'NV', '775-356-3300', 'https://nuggetcasinoresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 4.0, false),
('Boomtown Reno', 'casino', '2100 Garson Rd', 'Verdi', 'NV', '775-345-6000', 'https://boomtownreno.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('Harveys Lake Tahoe', 'casino', '18 US-50', 'Stateline', 'NV', '775-588-2411', 'https://caesars.com/harveys-tahoe', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 4.2, false),
('Montbleu', 'casino', '55 US-50', 'Stateline', 'NV', '775-588-3515', 'https://montbleuresort.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.8, false),

-- Laughlin
('Tropicana Laughlin', 'casino', '2121 S Casino Dr', 'Laughlin', 'NV', '702-298-4200', 'https://tropicanalaughlin.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),
('Riverside Laughlin', 'casino', '1650 S Casino Dr', 'Laughlin', 'NV', '702-298-2535', 'https://riversideresort.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false),

-- Mesquite
('Eureka Mesquite', 'casino', '275 Mesa Blvd', 'Mesquite', 'NV', '702-346-4600', 'https://eurekamesquite.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.6, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- CALIFORNIA (80+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
-- Los Angeles Area
('Commerce Casino', 'card_room', '6131 Telegraph Rd', 'Commerce', 'CA', '323-721-2100', 'https://commercecasino.com', ARRAY['NLH','PLO','Mixed','Limit','Stud','Omaha Hi-Lo'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$20','$25/$50'], 200, '24/7', 4.3, true),
('Bicycle Casino', 'card_room', '888 Bicycle Casino Dr', 'Bell Gardens', 'CA', '562-806-4646', 'https://thebike.com', ARRAY['NLH','PLO','Mixed','Limit'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$20'], 180, '24/7', 4.4, true),
('Hustler Casino', 'card_room', '1000 W Redondo Beach Blvd', 'Gardena', 'CA', '310-719-9800', 'https://hustlercasinola.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$3','$2/$5','$5/$10','$10/$20','$25/$50'], 80, '24/7', 4.5, true),
('Hollywood Park Casino', 'card_room', '3883 W Century Blvd', 'Inglewood', 'CA', '310-330-2800', 'https://playhpc.com', ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$2/$5','$5/$10'], 60, '24/7', 4.1, false),
('Gardens Casino', 'card_room', '11871 E Carson St', 'Hawaiian Gardens', 'CA', '562-860-5887', 'https://thegardenscasino.com', ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$1/$3','$2/$5'], 40, '24/7', 4.0, false),
('Larry Flynt Lucky Lady', 'card_room', '1045 W Rosecrans Ave', 'Gardena', 'CA', '310-352-3400', 'https://larryflynt.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 45, '24/7', 4.0, false),
('Normandie Casino', 'card_room', '1045 W Rosecrans Ave', 'Gardena', 'CA', '310-352-3400', NULL, ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$2/$5'], 30, '24/7', 3.8, false),
('Crystal Park Casino', 'card_room', '123 E Artesia Blvd', 'Compton', 'CA', '310-631-3838', 'https://crystalparkcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 3.6, false),
('Rainbow Casino', 'card_room', '750 W Alondra Blvd', 'Gardena', 'CA', '310-327-4700', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 15, '24/7', 3.4, false),
('Tachi Palace', 'casino', '17225 Jersey Ave', 'Lemoore', 'CA', '559-924-7751', 'https://tachipalace.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),

-- Indian Casinos SoCal
('Pechanga', 'casino', '45000 Pechanga Pkwy', 'Temecula', 'CA', '951-693-1819', 'https://pechanga.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 22, '24/7', 4.3, false),
('San Manuel', 'casino', '777 San Manuel Blvd', 'Highland', 'CA', '909-864-5050', 'https://sanmanuel.com', ARRAY['NLH','PLO','Omaha Hi-Lo'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.2, false),
('Morongo', 'casino', '49500 Seminole Dr', 'Cabazon', 'CA', '951-849-3080', 'https://morongocasinoresort.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.1, false),
('Pala Casino', 'casino', '11154 CA-76', 'Pala', 'CA', '760-510-5100', 'https://palacasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Viejas Casino', 'casino', '5000 Willows Rd', 'Alpine', 'CA', '619-445-5400', 'https://viejas.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 4.0, false),
('Sycuan Casino', 'casino', '5469 Casino Way', 'El Cajon', 'CA', '619-445-6002', 'https://sycuan.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.1, false),
('Harrahs SoCal', 'casino', '777 Harrahs Rincon Way', 'Valley Center', 'CA', '760-751-3100', 'https://caesars.com/harrahs-socal', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('Barona', 'casino', '1932 Wildcat Canyon Rd', 'Lakeside', 'CA', '619-443-2300', 'https://barona.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Valley View Casino', 'casino', '16300 Nyemii Pass Rd', 'Valley Center', 'CA', '760-291-5500', 'https://valleyviewcasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Agua Caliente Rancho Mirage', 'casino', '32-250 Bob Hope Dr', 'Rancho Mirage', 'CA', '760-321-2000', 'https://aguacalientecasinos.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 15, '24/7', 4.2, false),
('Spotlight 29', 'casino', '46-200 Harrison Pl', 'Coachella', 'CA', '760-775-5566', 'https://spotlight29.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Fantasy Springs', 'casino', '84-245 Indio Springs Pkwy', 'Indio', 'CA', '760-342-5000', 'https://fantasyspringsresort.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.9, false),
('Soboba Casino', 'casino', '22777 Soboba Rd', 'San Jacinto', 'CA', '951-665-1000', 'https://soboba.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Paiute Palace', 'casino', '2742 N Sierra Hwy', 'Bishop', 'CA', '760-873-4150', 'https://paiutepalace.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),

-- Bay Area
('Bay 101', 'card_room', '1801 Bering Dr', 'San Jose', 'CA', '408-451-8888', 'https://bay101.com', ARRAY['NLH','PLO','Mixed','Limit'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$20'], 40, '24/7', 4.5, true),
('Lucky Chances', 'card_room', '1700 Hillside Blvd', 'Colma', 'CA', '650-758-2237', 'https://luckychances.com', ARRAY['NLH','PLO','Omaha Hi-Lo'], ARRAY['$1/$2','$2/$5','$5/$10'], 35, '24/7', 4.2, false),
('Artichoke Joes', 'card_room', '659 Huntington Ave', 'San Bruno', 'CA', '650-589-3145', 'https://artichokejoes.com', ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$2/$5','$3/$6 Limit'], 20, '24/7', 4.0, false),
('Oaks Card Club', 'card_room', '4097 San Pablo Ave', 'Emeryville', 'CA', '510-653-4456', 'https://oakscardclub.com', ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.0, false),
('Livermore Casino', 'card_room', '2600 S Vasco Rd', 'Livermore', 'CA', '925-447-1702', 'https://livermorecasino.net', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('M8trix', 'card_room', '1887 Matrix Blvd', 'San Jose', 'CA', '408-645-0083', 'https://m8trix.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, false),
('Marina Club', 'card_room', '1999 University Ave', 'East Palo Alto', 'CA', '650-325-1766', NULL, ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.7, false),
('Capitol Casino', 'card_room', '411 N 16th St', 'Sacramento', 'CA', '916-446-0700', 'https://capitol-casino.com', ARRAY['NLH','PLO','Limit'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.0, false),
('Stones Gambling Hall', 'card_room', '6510 Antelope Rd', 'Citrus Heights', 'CA', '916-735-8440', 'https://stonesgamblinghall.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.1, false),
('Club One Casino', 'card_room', '1033 Van Ness Ave', 'Fresno', 'CA', '559-497-3000', 'https://clubonecasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.9, false),

-- NorCal Indian Casinos
('Thunder Valley', 'casino', '1200 Athens Ave', 'Lincoln', 'CA', '916-408-7777', 'https://thundervalleyresort.com', ARRAY['NLH','PLO','Stud'], ARRAY['$1/$2','$2/$5','$5/$10'], 25, '24/7', 4.4, true),
('Graton', 'casino', '288 Golf Course Dr W', 'Rohnert Park', 'CA', '707-588-7100', 'https://gratonresortcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$3','$3/$5','$5/$10'], 20, '24/7', 4.3, false),
('Cache Creek', 'casino', '14455 CA-16', 'Brooks', 'CA', '530-796-3118', 'https://cachecreek.com', ARRAY['NLH','PLO'], ARRAY['$1/$3','$2/$5','$5/$10'], 15, '24/7', 4.1, false),
('Jackson Rancheria', 'casino', '12222 New York Ranch Rd', 'Jackson', 'CA', '209-223-1677', 'https://jacksoncasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.8, false),
('Red Hawk', 'casino', '1 Red Hawk Pkwy', 'Placerville', 'CA', '530-677-7000', 'https://redhawkcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 4.0, false),
('Twin Pine Casino', 'casino', '22223 CA-29', 'Middletown', 'CA', '707-987-0197', 'https://twinpine.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.5, false),
('Black Oak Casino', 'casino', '19400 Tuolumne Rd N', 'Tuolumne', 'CA', '209-928-9300', 'https://blackoakcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Chukchansi Gold', 'casino', '711 Lucky Ln', 'Coarsegold', 'CA', '559-692-5200', 'https://chukchansigold.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.7, false),
('Table Mountain', 'casino', '8184 Table Mountain Rd', 'Friant', 'CA', '559-822-7777', 'https://tmcasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Elk Valley Casino', 'casino', '2500 Howland Hill Rd', 'Crescent City', 'CA', '707-464-1020', 'https://elkvalleycasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.4, false),
('Win-River Casino', 'casino', '2100 Redding Rancheria Rd', 'Redding', 'CA', '530-243-3377', 'https://winrivercasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.6, false),
('Rolling Hills Casino', 'casino', '2655 Everett Freeman Way', 'Corning', 'CA', '530-528-3500', 'https://rollinghillscasino.com', ARRAY['NLH'], ARRAY['$1/$2'], 4, '24/7', 3.5, false)
ON CONFLICT (name, city, state) DO NOTHING;

-- FLORIDA (50+ venues)
INSERT INTO poker_venues (name, venue_type, address, city, state, phone, website, games_offered, stakes_cash, poker_tables, hours_weekday, trust_score, is_featured) VALUES
('Seminole Hard Rock Hollywood', 'casino', '1 Seminole Way', 'Hollywood', 'FL', '954-327-7465', 'https://seminolehardrockhollywood.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10','$10/$25'], 45, '24/7', 4.7, true),
('Seminole Hard Rock Tampa', 'casino', '5223 Orient Rd', 'Tampa', 'FL', '813-627-7651', 'https://seminolehardrocktampa.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 46, '24/7', 4.5, true),
('Gulfstream Park', 'card_room', '901 S Federal Hwy', 'Hallandale Beach', 'FL', '954-454-7087', 'https://gulfstreampark.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 20, '24/7', 4.2, false),
('Palm Beach Kennel Club', 'card_room', '1111 N Congress Ave', 'West Palm Beach', 'FL', '561-683-2222', 'https://pbkennelclub.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 35, '24/7', 4.0, false),
('Derby Lane', 'card_room', '10490 Gandy Blvd', 'St. Petersburg', 'FL', '727-812-3339', 'https://derbylane.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 50, '24/7', 4.1, true),
('TGT Poker', 'card_room', '8300 N Nebraska Ave', 'Tampa', 'FL', '813-932-4313', 'https://tgtpoker.com', ARRAY['NLH','PLO','Mixed'], ARRAY['$1/$2','$2/$5','$5/$10'], 40, '24/7', 4.2, false),
('Hialeah Park', 'card_room', '100 E 21st St', 'Hialeah', 'FL', '305-885-8000', 'https://hialeahpark.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 4.0, false),
('Magic City Casino', 'card_room', '450 NW 37th Ave', 'Miami', 'FL', '305-649-3000', 'https://magiccitycasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.8, false),
('Daytona Beach Racing', 'card_room', '960 S Williamson Blvd', 'Daytona Beach', 'FL', '386-252-6484', 'https://daytonabeachpoker.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.0, false),
('Orange City Racing', 'card_room', '860 S Volusia Ave', 'Orange City', 'FL', '386-252-6484', 'https://orangecitypoker.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 3.8, false),
('Jacksonville Poker Room', 'card_room', '201 Monument Rd', 'Jacksonville', 'FL', '904-646-0002', 'https://jaxpokerroom.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 30, '24/7', 4.0, false),
('bestbet Jacksonville', 'card_room', '201 Monument Rd', 'Jacksonville', 'FL', '904-646-0002', 'https://bestbetjax.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 35, '24/7', 4.2, false),
('bestbet Orange Park', 'card_room', '455 Park Ave', 'Orange Park', 'FL', '904-646-0002', 'https://bestbetjax.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 25, '24/7', 4.0, false),
('Ocala Poker', 'card_room', '3900 NW Gainesville Rd', 'Ocala', 'FL', '352-237-2221', 'https://ocalapoker.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.7, false),
('Melbourne Greyhound Park', 'card_room', '1100 N Wickham Rd', 'Melbourne', 'FL', '321-259-9800', 'https://melbournegreyhoundpark.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.7, false),
('Seminole Coconut Creek', 'casino', '5550 NW 40th St', 'Coconut Creek', 'FL', '954-977-6700', 'https://seminolecoconutcreekcasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5','$5/$10'], 30, '24/7', 4.4, false),
('Seminole Brighton', 'casino', '17735 Reservation Rd', 'Okeechobee', 'FL', '863-467-9998', 'https://seminolebrighton.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 8, '24/7', 3.6, false),
('Seminole Immokalee', 'casino', '506 S 1st St', 'Immokalee', 'FL', '239-658-1313', 'https://moreinparadise.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.8, false),
('Seminole Classic', 'casino', '4150 N SR 7', 'Hollywood', 'FL', '954-961-3220', 'https://seminoleclassiccasino.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 12, '24/7', 3.9, false),
('Calder Casino', 'casino', '21001 NW 27th Ave', 'Miami Gardens', 'FL', '305-625-1311', 'https://caldercasino.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 18, '24/7', 4.0, false),
('Pensacola Greyhound', 'card_room', '951 Dog Track Rd', 'Pensacola', 'FL', '850-456-9800', 'https://pensacolagreyhoundtrack.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 10, '24/7', 3.5, false),
('Ebro Greyhound Park', 'card_room', '6558 Dog Track Rd', 'Ebro', 'FL', '850-234-3943', 'https://goebro.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.4, false),
('Creek Entertainment', 'card_room', '2750 Crimson Ridge Rd', 'Gretna', 'FL', '850-875-6930', 'https://creekentertainment.com', ARRAY['NLH'], ARRAY['$1/$2'], 6, '24/7', 3.3, false),
('Treasure Chest', 'card_room', '4301 SW 13th St', 'Gainesville', 'FL', '352-375-4300', NULL, ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.5, false),
('Naples-Fort Myers', 'card_room', '10601 Bonita Beach Rd', 'Bonita Springs', 'FL', '239-992-2411', 'https://naplesfortmyersdogs.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.8, false),
('Fort Pierce Jai-Alai', 'card_room', '1750 S Kings Hwy', 'Fort Pierce', 'FL', '772-464-7500', 'https://jaialai.net', ARRAY['NLH'], ARRAY['$1/$2'], 10, '24/7', 3.5, false),
('Dania Jai-Alai', 'card_room', '301 E Dania Beach Blvd', 'Dania Beach', 'FL', '954-920-1511', 'https://daniacasinofl.com', ARRAY['NLH','PLO'], ARRAY['$1/$2','$2/$5'], 20, '24/7', 3.9, false),
('Oxford Downs', 'card_room', '7171 S County Rd 25', 'Oxford', 'FL', '352-237-3100', 'https://oxforddowns.com', ARRAY['NLH'], ARRAY['$1/$2'], 8, '24/7', 3.4, false),
('Sarasota Kennel Club', 'card_room', '5400 Bradenton Rd', 'Sarasota', 'FL', '941-355-7744', 'https://skcpoker.com', ARRAY['NLH'], ARRAY['$1/$2','$2/$5'], 15, '24/7', 3.7, false)
ON CONFLICT (name, city, state) DO NOTHING;
