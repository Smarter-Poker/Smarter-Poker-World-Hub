/**
 * Final Venue Expansion - Reaching 450+
 * Adds remaining venues to complete the database
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// More California - Complete coverage
const MORE_CA = [
    { name: 'Jackson Rancheria Casino Resort', venue_type: 'casino', city: 'Jackson', state: 'CA', lat: 38.3697, lng: -120.7597, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Table Mountain Casino', venue_type: 'casino', city: 'Friant', state: 'CA', lat: 36.9957, lng: -119.6797, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Tachi Palace Casino Resort', venue_type: 'casino', city: 'Lemoore', state: 'CA', lat: 36.2507, lng: -119.8497, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Eagle Mountain Casino', venue_type: 'casino', city: 'Porterville', state: 'CA', lat: 36.0667, lng: -118.9897, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Spotlight 29 Casino', venue_type: 'casino', city: 'Coachella', state: 'CA', lat: 33.6807, lng: -116.1497, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Agua Caliente Casino Palm Springs', venue_type: 'casino', city: 'Palm Springs', state: 'CA', lat: 33.8257, lng: -116.5397, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Fantasy Springs Resort Casino', venue_type: 'casino', city: 'Indio', state: 'CA', lat: 33.7197, lng: -116.2597, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Pechanga Resort Casino', venue_type: 'casino', city: 'Temecula', state: 'CA', lat: 33.4537, lng: -117.0597, poker_tables: 54, games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'Soboba Casino', venue_type: 'casino', city: 'San Jacinto', state: 'CA', lat: 33.8057, lng: -116.9297, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Valley View Casino & Hotel', venue_type: 'casino', city: 'Valley Center', state: 'CA', lat: 33.2287, lng: -117.0197, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Jamul Casino', venue_type: 'casino', city: 'Jamul', state: 'CA', lat: 32.7157, lng: -116.8797, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Chumash Casino Resort', venue_type: 'casino', city: 'Santa Ynez', state: 'CA', lat: 34.5867, lng: -120.0697, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Chukchansi Gold Resort & Casino', venue_type: 'casino', city: 'Coarsegold', state: 'CA', lat: 37.3057, lng: -119.6797, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Black Oak Casino Resort', venue_type: 'casino', city: 'Tuolumne', state: 'CA', lat: 37.9667, lng: -120.2297, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Red Hawk Casino', venue_type: 'casino', city: 'Placerville', state: 'CA', lat: 38.6957, lng: -120.8197, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Win-River Resort & Casino', venue_type: 'casino', city: 'Redding', state: 'CA', lat: 40.5397, lng: -122.3897, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Konocti Vista Casino', venue_type: 'casino', city: 'Lakeport', state: 'CA', lat: 39.0437, lng: -122.9197, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'River Rock Casino', venue_type: 'casino', city: 'Geyserville', state: 'CA', lat: 38.7107, lng: -122.9097, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Texas Clubs
const MORE_TX = [
    { name: 'Poker Guys DFW', venue_type: 'poker_club', city: 'Irving', state: 'TX', lat: 32.8587, lng: -96.9497, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'South Side Poker Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.3947, lng: -98.5197, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'River Card Club', venue_type: 'poker_club', city: 'New Braunfels', state: 'TX', lat: 29.6997, lng: -98.1247, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Spades Social Club', venue_type: 'poker_club', city: 'McAllen', state: 'TX', lat: 26.2037, lng: -98.2297, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Lucky 7 Poker Club', venue_type: 'poker_club', city: 'El Paso', state: 'TX', lat: 31.7617, lng: -106.4857, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Aces and Eights Poker Room', venue_type: 'poker_club', city: 'Lubbock', state: 'TX', lat: 33.5777, lng: -101.8547, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The Social Poker Club', venue_type: 'poker_club', city: 'Arlington', state: 'TX', lat: 32.7357, lng: -97.1077, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Rounders Card Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.5247, lng: -98.5297, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'The Card Room ATX', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2667, lng: -97.7327, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Poker Palace', venue_type: 'poker_club', city: 'Waco', state: 'TX', lat: 31.5497, lng: -97.1467, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Kings & Queens Poker', venue_type: 'poker_club', city: 'Amarillo', state: 'TX', lat: 35.2217, lng: -101.8317, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Main Event Poker Club', venue_type: 'poker_club', city: 'Midland', state: 'TX', lat: 31.9977, lng: -102.0777, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Florida complete coverage
const MORE_FL = [
    { name: 'Miccosukee Resort & Gaming', venue_type: 'casino', city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.4597, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ebro Greyhound Park', venue_type: 'card_room', city: 'Ebro', state: 'FL', lat: 30.4417, lng: -85.8897, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Melbourne Greyhound Park', venue_type: 'card_room', city: 'Melbourne', state: 'FL', lat: 28.0837, lng: -80.6397, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'St Johns Greyhound Park', venue_type: 'card_room', city: 'Jacksonville', state: 'FL', lat: 30.1887, lng: -81.5997, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Jacksonville Greyhound Racing', venue_type: 'card_room', city: 'Jacksonville', state: 'FL', lat: 30.2947, lng: -81.6597, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Tampa Bay Downs', venue_type: 'card_room', city: 'Tampa', state: 'FL', lat: 28.0537, lng: -82.6297, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Sarasota Poker Room', venue_type: 'card_room', city: 'Sarasota', state: 'FL', lat: 27.3367, lng: -82.5397, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'One Eyed Jacks Poker Room', venue_type: 'card_room', city: 'Sarasota', state: 'FL', lat: 27.3257, lng: -82.5297, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Nevada
const MORE_NV = [
    { name: 'Eldorado Resort Casino', venue_type: 'casino', city: 'Reno', state: 'NV', lat: 39.5277, lng: -119.8147, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Circus Circus Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1367, lng: -115.1657, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'TI - Treasure Island', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1247, lng: -115.1727, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The Strat Hotel Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1475, lng: -115.1557, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Planet Hollywood Resort', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1100, lng: -115.1717, poker_tables: 12, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Paris Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1127, lng: -115.1707, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Ballys Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1137, lng: -115.1687, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Cosmopolitan of Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1097, lng: -115.1757, poker_tables: 10, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Park MGM', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1037, lng: -115.1747, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'New York New York', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1017, lng: -115.1737, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Luxor Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.0957, lng: -115.1757, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Mandalay Bay', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.0907, lng: -115.1757, poker_tables: 10, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Delano Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.0887, lng: -115.1767, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The Linq Hotel & Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1177, lng: -115.1697, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Harrahs Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1197, lng: -115.1697, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Midwest Complete
const MORE_MW = [
    { name: 'Potawatomi Casino', venue_type: 'casino', city: 'Milwaukee', state: 'WI', lat: 43.0457, lng: -87.9257, poker_tables: 24, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Ho-Chunk Gaming Madison', venue_type: 'casino', city: 'Madison', state: 'WI', lat: 43.1257, lng: -89.3497, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Oneida Casino', venue_type: 'casino', city: 'Green Bay', state: 'WI', lat: 44.4697, lng: -88.0797, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'St. Croix Casino Turtle Lake', venue_type: 'casino', city: 'Turtle Lake', state: 'WI', lat: 45.3917, lng: -92.1497, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Soaring Eagle Casino & Resort', venue_type: 'casino', city: 'Mount Pleasant', state: 'MI', lat: 43.5547, lng: -84.7697, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Little River Casino Resort', venue_type: 'casino', city: 'Manistee', state: 'MI', lat: 44.2577, lng: -86.3297, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Four Winds Casino', venue_type: 'casino', city: 'New Buffalo', state: 'MI', lat: 41.7857, lng: -86.7597, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Mystic Lake Casino Hotel', venue_type: 'casino', city: 'Prior Lake', state: 'MN', lat: 44.7147, lng: -93.4497, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Grand Casino Mille Lacs', venue_type: 'casino', city: 'Onamia', state: 'MN', lat: 46.0617, lng: -93.6897, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Grand Casino Hinckley', venue_type: 'casino', city: 'Hinckley', state: 'MN', lat: 46.0157, lng: -92.9497, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Shooting Star Casino', venue_type: 'casino', city: 'Mahnomen', state: 'MN', lat: 47.3367, lng: -95.9597, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Prairie Meadows Casino', venue_type: 'casino', city: 'Altoona', state: 'IA', lat: 41.6697, lng: -93.4897, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ameristar Casino Council Bluffs', venue_type: 'casino', city: 'Council Bluffs', state: 'IA', lat: 41.2557, lng: -95.8617, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Riverside Casino & Golf Resort', venue_type: 'casino', city: 'Riverside', state: 'IA', lat: 41.4717, lng: -91.5697, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Hollywood Casino Joliet', venue_type: 'casino', city: 'Joliet', state: 'IL', lat: 41.5217, lng: -88.0997, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Hollywood Casino Tunica', venue_type: 'casino', city: 'Tunica Resorts', state: 'MS', lat: 34.8407, lng: -90.3097, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Fitz Casino Tunica', venue_type: 'casino', city: 'Tunica Resorts', state: 'MS', lat: 34.8417, lng: -90.3047, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More South & Southeast
const MORE_SOUTH = [
    { name: 'Margaritaville Resort Casino', venue_type: 'casino', city: 'Bossier City', state: 'LA', lat: 32.5177, lng: -93.7297, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Evangeline Downs Racetrack & Casino', venue_type: 'casino', city: 'Opelousas', state: 'LA', lat: 30.5217, lng: -92.0497, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Coushatta Casino Resort', venue_type: 'casino', city: 'Kinder', state: 'LA', lat: 30.4837, lng: -92.8497, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Delta Downs Racetrack Casino', venue_type: 'casino', city: 'Vinton', state: 'LA', lat: 30.1997, lng: -93.5797, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Paragon Casino Resort', venue_type: 'casino', city: 'Marksville', state: 'LA', lat: 31.1317, lng: -92.0797, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Jena Choctaw Pines Casino', venue_type: 'casino', city: 'Dry Prong', state: 'LA', lat: 31.6097, lng: -92.5497, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Washington State
const MORE_WA = [
    { name: 'Red Wind Casino', venue_type: 'casino', city: 'Olympia', state: 'WA', lat: 46.9457, lng: -122.7497, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Lucky Eagle Casino & Hotel', venue_type: 'casino', city: 'Rochester', state: 'WA', lat: 46.7917, lng: -123.1097, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The Point Casino', venue_type: 'casino', city: 'Kingston', state: 'WA', lat: 47.8197, lng: -122.5097, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Silver Reef Casino', venue_type: 'casino', city: 'Ferndale', state: 'WA', lat: 48.8517, lng: -122.5897, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Swinomish Casino & Lodge', venue_type: 'casino', city: 'Anacortes', state: 'WA', lat: 48.4577, lng: -122.5997, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Skagit Valley Casino Resort', venue_type: 'casino', city: 'Bow', state: 'WA', lat: 48.5517, lng: -122.4397, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Angel of the Winds Casino Resort', venue_type: 'casino', city: 'Arlington', state: 'WA', lat: 48.1917, lng: -122.1097, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Legends Casino Hotel', venue_type: 'casino', city: 'Toppenish', state: 'WA', lat: 46.3717, lng: -120.3097, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Arizona
const MORE_AZ = [
    { name: 'Desert Diamond Casino Tucson', venue_type: 'casino', city: 'Tucson', state: 'AZ', lat: 32.0967, lng: -110.9697, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Casino Del Sol', venue_type: 'casino', city: 'Tucson', state: 'AZ', lat: 32.1897, lng: -111.0197, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Desert Diamond Casino Sahuarita', venue_type: 'casino', city: 'Sahuarita', state: 'AZ', lat: 31.9227, lng: -110.9497, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Harrahs Ak-Chin Casino', venue_type: 'casino', city: 'Maricopa', state: 'AZ', lat: 33.0367, lng: -112.0497, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'We-Ko-Pa Casino Resort', venue_type: 'casino', city: 'Fort McDowell', state: 'AZ', lat: 33.6917, lng: -111.6097, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Cliff Castle Casino Hotel', venue_type: 'casino', city: 'Camp Verde', state: 'AZ', lat: 34.5637, lng: -111.8397, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Apache Gold Casino Resort', venue_type: 'casino', city: 'San Carlos', state: 'AZ', lat: 33.3557, lng: -110.4897, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Twin Arrows Navajo Casino Resort', venue_type: 'casino', city: 'Flagstaff', state: 'AZ', lat: 35.2127, lng: -111.3297, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Connecticut & Rhode Island Complete
const MORE_NE_SMALL = [
    { name: 'MGM Grand at Foxwoods', venue_type: 'casino', city: 'Mashantucket', state: 'CT', lat: 41.4617, lng: -71.9697, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Bally\'s Twin River Lincoln', venue_type: 'casino', city: 'Lincoln', state: 'RI', lat: 41.9217, lng: -71.4397, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Bally\'s Tiverton Casino Hotel', venue_type: 'casino', city: 'Tiverton', state: 'RI', lat: 41.6147, lng: -71.2097, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Ohio Complete
const MORE_OH = [
    { name: 'Hard Rock Casino Cincinnati', venue_type: 'casino', city: 'Cincinnati', state: 'OH', lat: 39.0947, lng: -84.5117, poker_tables: 31, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'MGM Northfield Park', venue_type: 'casino', city: 'Northfield', state: 'OH', lat: 41.3217, lng: -81.5297, poker_tables: 33, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'Hollywood Casino Toledo', venue_type: 'casino', city: 'Toledo', state: 'OH', lat: 41.6317, lng: -83.4997, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Hollywood Casino Mahoning Valley', venue_type: 'casino', city: 'Austintown', state: 'OH', lat: 41.0797, lng: -80.7897, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Indiana Complete
const MORE_IN = [
    { name: 'Tropicana Evansville', venue_type: 'casino', city: 'Evansville', state: 'IN', lat: 37.9637, lng: -87.5897, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Blue Chip Casino', venue_type: 'casino', city: 'Michigan City', state: 'IN', lat: 41.6987, lng: -86.8897, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Majestic Star Casino', venue_type: 'casino', city: 'Gary', state: 'IN', lat: 41.6077, lng: -87.3397, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Grand Victoria Casino', venue_type: 'casino', city: 'Rising Sun', state: 'IN', lat: 38.9527, lng: -84.8597, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'French Lick Resort Casino', venue_type: 'casino', city: 'French Lick', state: 'IN', lat: 38.5497, lng: -86.6297, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

const ALL = [
    ...MORE_CA,
    ...MORE_TX,
    ...MORE_FL,
    ...MORE_NV,
    ...MORE_MW,
    ...MORE_SOUTH,
    ...MORE_WA,
    ...MORE_AZ,
    ...MORE_NE_SMALL,
    ...MORE_OH,
    ...MORE_IN,
];

async function main() {
    console.log('\n=== Final Venue Expansion ===\n');
    console.log(`📍 Adding ${ALL.length} new venues\n`);

    const BATCH_SIZE = 20;
    let inserted = 0;

    for (let i = 0; i < ALL.length; i += BATCH_SIZE) {
        const batch = ALL.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`📦 Batch ${batchNum}/${Math.ceil(ALL.length / BATCH_SIZE)} (${batch.length} venues)...`);

        try {
            const { error } = await supabase.from('poker_venues').upsert(batch, { onConflict: 'name,city,state' });
            if (error) console.error(`   ❌`, error.message);
            else {
                inserted += batch.length;
                console.log(`   ✅ Done`);
            }
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.error(`   ❌`, e.message);
        }
    }

    const { count } = await supabase.from('poker_venues').select('*', { count: 'exact', head: true });
    console.log(`\n📊 TOTAL VENUES: ${count}\n`);
}

main();
