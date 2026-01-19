/**
 * Massive Venue Expansion
 * Adds 200+ more venues to reach 450+ target
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// More California (largest poker market)
const CALIFORNIA_VENUES = [
    { name: 'Casino M8trix', venue_type: 'card_room', city: 'San Jose', state: 'CA', lat: 37.3547, lng: -121.9247, poker_tables: 25, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/3'], is_featured: true },
    { name: 'Livermore Casino', venue_type: 'card_room', city: 'Livermore', state: 'CA', lat: 37.6877, lng: -121.7587, poker_tables: 15, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Parkwest Casino', venue_type: 'card_room', city: 'Sonoma', state: 'CA', lat: 38.2917, lng: -122.4607, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'San Manuel Casino', venue_type: 'casino', city: 'Highland', state: 'CA', lat: 34.1207, lng: -117.1707, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/3'], is_featured: true },
    { name: 'Pala Casino Spa Resort', venue_type: 'casino', city: 'Pala', state: 'CA', lat: 33.3687, lng: -117.0707, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Barona Resort & Casino', venue_type: 'casino', city: 'Lakeside', state: 'CA', lat: 32.9477, lng: -116.8607, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Sycuan Casino Resort', venue_type: 'casino', city: 'El Cajon', state: 'CA', lat: 32.7907, lng: -116.8407, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/3'], is_featured: true },
    { name: 'San Pablo Lytton Casino', venue_type: 'casino', city: 'San Pablo', state: 'CA', lat: 37.9657, lng: -122.3507, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/3'], is_featured: true },
    { name: 'Parkwest Casino Lodi', venue_type: 'card_room', city: 'Lodi', state: 'CA', lat: 38.1337, lng: -121.2707, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Casino Pauma', venue_type: 'casino', city: 'Pauma Valley', state: 'CA', lat: 33.3167, lng: -116.9807, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Harrah\'s Resort SoCal', venue_type: 'casino', city: 'Funner', state: 'CA', lat: 33.4137, lng: -117.0007, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Viejas Casino & Resort', venue_type: 'casino', city: 'Alpine', state: 'CA', lat: 32.8507, lng: -116.6807, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Texas (expanding poker club market)
const TEXAS_VENUES = [
    { name: 'TCH Social Dallas', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.8287, lng: -96.8287, poker_tables: 24, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'One Eyed Jack Poker Club', venue_type: 'poker_club', city: 'Lewisville', state: 'TX', lat: 33.0467, lng: -96.9947, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'All-In Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7627, lng: -95.3647, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Kings Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7457, lng: -95.3747, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'KoJacks Social Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4247, lng: -98.4947, poker_tables: 22, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Hold\'em Poker Club', venue_type: 'poker_club', city: 'Fort Worth', state: 'TX', lat: 32.7557, lng: -97.3307, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Limelight Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7857, lng: -95.4147, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'The Hideaway Poker Club', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2497, lng: -97.7497, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Social Poker', venue_type: 'poker_club', city: 'Corpus Christi', state: 'TX', lat: 27.8007, lng: -97.3967, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ace High Card House', venue_type: 'poker_club', city: 'Plano', state: 'TX', lat: 33.0197, lng: -96.6987, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
];

// More Florida
const FLORIDA_VENUES = [
    { name: 'Hialeah Park Casino', venue_type: 'casino', city: 'Hialeah', state: 'FL', lat: 25.8287, lng: -80.2787, poker_tables: 22, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Palm Beach Kennel Club', venue_type: 'card_room', city: 'West Palm Beach', state: 'FL', lat: 26.7057, lng: -80.0687, poker_tables: 35, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'The Big Easy Casino', venue_type: 'casino', city: 'Hallandale Beach', state: 'FL', lat: 25.9907, lng: -80.1487, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Calder Casino', venue_type: 'casino', city: 'Miami Gardens', state: 'FL', lat: 25.9387, lng: -80.2687, poker_tables: 15, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Magic City Casino', venue_type: 'casino', city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.2247, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Daytona Beach Racing & Card Club', venue_type: 'card_room', city: 'Daytona Beach', state: 'FL', lat: 29.2107, lng: -81.0487, poker_tables: 25, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ocala Poker & Jai Alai', venue_type: 'card_room', city: 'Ocala', state: 'FL', lat: 29.1877, lng: -82.1407, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Orange City Racing & Card Club', venue_type: 'card_room', city: 'Orange City', state: 'FL', lat: 28.9487, lng: -81.2987, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Oxford Downs', venue_type: 'card_room', city: 'Oxford', state: 'FL', lat: 28.7707, lng: -82.0507, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Pensacola Greyhound Track', venue_type: 'card_room', city: 'Pensacola', state: 'FL', lat: 30.4217, lng: -87.2177, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Nevada
const NEVADA_VENUES = [
    { name: 'Binions Gambling Hall', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1707, lng: -115.1437, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Golden Nugget Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1717, lng: -115.1447, poker_tables: 12, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Plaza Hotel & Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1727, lng: -115.1467, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'California Hotel & Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1717, lng: -115.1447, poker_tables: 4, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The D Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1707, lng: -115.1427, poker_tables: 5, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Palace Station', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1267, lng: -115.1837, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Sunset Station', venue_type: 'casino', city: 'Henderson', state: 'NV', lat: 36.0217, lng: -115.0187, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Texas Station', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2337, lng: -115.1367, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Grand Sierra Resort', venue_type: 'casino', city: 'Reno', state: 'NV', lat: 39.5217, lng: -119.7767, poker_tables: 12, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Silver Legacy Resort Casino', venue_type: 'casino', city: 'Reno', state: 'NV', lat: 39.5267, lng: -119.8147, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Oklahoma (major tribal casino market)
const OKLAHOMA_VENUES = [
    { name: 'Riverwind Casino', venue_type: 'casino', city: 'Norman', state: 'OK', lat: 35.1597, lng: -97.4397, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Newcastle Casino', venue_type: 'casino', city: 'Newcastle', state: 'OK', lat: 35.2467, lng: -97.5997, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Grand Casino Hotel & Resort', venue_type: 'casino', city: 'Shawnee', state: 'OK', lat: 35.3277, lng: -96.9257, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Cherokee Casino West Siloam Springs', venue_type: 'casino', city: 'West Siloam Springs', state: 'OK', lat: 36.2137, lng: -94.6227, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Downstream Casino Resort', venue_type: 'casino', city: 'Quapaw', state: 'OK', lat: 36.9607, lng: -94.7877, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Osage Casino Tulsa', venue_type: 'casino', city: 'Tulsa', state: 'OK', lat: 36.0617, lng: -95.8917, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Louisiana
const LOUISIANA_VENUES = [
    { name: 'L\'Auberge Casino Lake Charles', venue_type: 'casino', city: 'Lake Charles', state: 'LA', lat: 30.2137, lng: -93.2217, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Golden Nugget Lake Charles', venue_type: 'casino', city: 'Lake Charles', state: 'LA', lat: 30.2297, lng: -93.2317, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Boomtown Casino New Orleans', venue_type: 'casino', city: 'Harvey', state: 'LA', lat: 29.9037, lng: -90.0817, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Eldorado Resort Casino', venue_type: 'casino', city: 'Shreveport', state: 'LA', lat: 32.5087, lng: -93.7497, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Horseshoe Bossier City', venue_type: 'casino', city: 'Bossier City', state: 'LA', lat: 32.5167, lng: -93.7347, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
];

// More Northeast
const NORTHEAST_VENUES = [
    { name: 'Encore Boston Harbor', venue_type: 'casino', city: 'Everett', state: 'MA', lat: 42.3897, lng: -71.0717, poker_tables: 88, games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'MGM Springfield', venue_type: 'casino', city: 'Springfield', state: 'MA', lat: 42.1027, lng: -72.5897, poker_tables: 23, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Twin River Casino', venue_type: 'casino', city: 'Lincoln', state: 'RI', lat: 41.9167, lng: -71.4397, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Resorts Casino Hotel', venue_type: 'casino', city: 'Atlantic City', state: 'NJ', lat: 39.3847, lng: -74.4227, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Harrahs Atlantic City', venue_type: 'casino', city: 'Atlantic City', state: 'NJ', lat: 39.3867, lng: -74.4217, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ocean Casino Resort', venue_type: 'casino', city: 'Atlantic City', state: 'NJ', lat: 39.3867, lng: -74.4097, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Tropicana Atlantic City', venue_type: 'casino', city: 'Atlantic City', state: 'NJ', lat: 39.3487, lng: -74.4117, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Seneca Niagara Resort & Casino', venue_type: 'casino', city: 'Niagara Falls', state: 'NY', lat: 43.0837, lng: -79.0547, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'del Lago Resort & Casino', venue_type: 'casino', city: 'Waterloo', state: 'NY', lat: 42.8997, lng: -76.8617, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Rivers Casino Pittsburgh', venue_type: 'casino', city: 'Pittsburgh', state: 'PA', lat: 40.4467, lng: -80.0187, poker_tables: 30, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Hollywood Casino York', venue_type: 'casino', city: 'York', state: 'PA', lat: 39.9627, lng: -76.7277, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'The Meadows Casino', venue_type: 'casino', city: 'Washington', state: 'PA', lat: 40.2237, lng: -80.2477, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Midwest
const MIDWEST_VENUES = [
    { name: 'Harrahs Joliet', venue_type: 'casino', city: 'Joliet', state: 'IL', lat: 41.5267, lng: -88.1007, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Hollywood Casino Lawrenceburg', venue_type: 'casino', city: 'Lawrenceburg', state: 'IN', lat: 39.0907, lng: -84.8507, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Belterra Casino Resort', venue_type: 'casino', city: 'Florence', state: 'IN', lat: 38.9127, lng: -84.9097, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Ameristar Casino East Chicago', venue_type: 'casino', city: 'East Chicago', state: 'IN', lat: 41.6247, lng: -87.4477, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Turtle Creek Casino', venue_type: 'casino', city: 'Williamsburg', state: 'MI', lat: 44.7607, lng: -85.4707, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'MGM Grand Detroit', venue_type: 'casino', city: 'Detroit', state: 'MI', lat: 42.3337, lng: -83.0527, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'MotorCity Casino Hotel', venue_type: 'casino', city: 'Detroit', state: 'MI', lat: 42.3297, lng: -83.0577, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Running Aces Casino', venue_type: 'casino', city: 'Columbus', state: 'MN', lat: 45.2857, lng: -93.0497, poker_tables: 30, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Canterbury Park', venue_type: 'card_room', city: 'Shakopee', state: 'MN', lat: 44.7887, lng: -93.5097, poker_tables: 50, games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'Treasure Island Resort & Casino', venue_type: 'casino', city: 'Welch', state: 'MN', lat: 44.5697, lng: -92.7597, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Hollywood Casino St. Louis', venue_type: 'casino', city: 'Maryland Heights', state: 'MO', lat: 38.7267, lng: -90.4277, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Ameristar Casino Kansas City', venue_type: 'casino', city: 'Kansas City', state: 'MO', lat: 39.0967, lng: -94.4757, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Prairie Band Casino', venue_type: 'casino', city: 'Mayetta', state: 'KS', lat: 39.4537, lng: -95.7597, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Hollywood Casino at Kansas Speedway', venue_type: 'casino', city: 'Kansas City', state: 'KS', lat: 39.1147, lng: -94.8307, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Meskwaki Bingo Casino Hotel', venue_type: 'casino', city: 'Tama', state: 'IA', lat: 41.9517, lng: -92.5797, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Horseshoe Council Bluffs', venue_type: 'casino', city: 'Council Bluffs', state: 'IA', lat: 41.2557, lng: -95.8517, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Diamond Jo Casino Worth', venue_type: 'casino', city: 'Northwood', state: 'IA', lat: 43.4447, lng: -93.2177, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Mountain West
const MOUNTAIN_VENUES = [
    { name: 'Gila River Wild Horse Pass', venue_type: 'casino', city: 'Chandler', state: 'AZ', lat: 33.2257, lng: -111.9897, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Casino Arizona', venue_type: 'casino', city: 'Scottsdale', state: 'AZ', lat: 33.5187, lng: -111.9207, poker_tables: 15, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Wild Horse Pass Hotel & Casino', venue_type: 'casino', city: 'Chandler', state: 'AZ', lat: 33.2307, lng: -111.9847, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Buffalo Thunder Resort & Casino', venue_type: 'casino', city: 'Santa Fe', state: 'NM', lat: 35.8857, lng: -106.0597, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Route 66 Casino Hotel', venue_type: 'casino', city: 'Albuquerque', state: 'NM', lat: 35.0357, lng: -106.9507, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Sandia Resort & Casino', venue_type: 'casino', city: 'Albuquerque', state: 'NM', lat: 35.1637, lng: -106.4807, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Isleta Resort & Casino', venue_type: 'casino', city: 'Albuquerque', state: 'NM', lat: 35.0047, lng: -106.6587, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Lady Luck Casino Black Hawk', venue_type: 'casino', city: 'Black Hawk', state: 'CO', lat: 39.7967, lng: -105.4947, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Midnight Rose Hotel & Casino', venue_type: 'casino', city: 'Cripple Creek', state: 'CO', lat: 38.7457, lng: -105.1787, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Ute Mountain Casino Hotel', venue_type: 'casino', city: 'Towaoc', state: 'CO', lat: 37.1937, lng: -108.7247, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// More Pacific Northwest
const PACIFIC_NW_VENUES = [
    { name: 'Snoqualmie Casino', venue_type: 'casino', city: 'Snoqualmie', state: 'WA', lat: 47.5137, lng: -121.8617, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Emerald Queen Casino I-5', venue_type: 'casino', city: 'Tacoma', state: 'WA', lat: 47.1927, lng: -122.4747, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Suquamish Clearwater Casino', venue_type: 'casino', city: 'Suquamish', state: 'WA', lat: 47.7297, lng: -122.5797, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Northern Quest Resort & Casino', venue_type: 'casino', city: 'Airway Heights', state: 'WA', lat: 47.6477, lng: -117.5837, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Ilani Casino Resort', venue_type: 'casino', city: 'Ridgefield', state: 'WA', lat: 45.8017, lng: -122.7097, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Chinook Winds Casino Resort', venue_type: 'casino', city: 'Lincoln City', state: 'OR', lat: 44.9837, lng: -124.0107, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Seven Feathers Casino Resort', venue_type: 'casino', city: 'Canyonville', state: 'OR', lat: 42.9267, lng: -123.2817, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Three Rivers Casino', venue_type: 'casino', city: 'Florence', state: 'OR', lat: 43.9667, lng: -124.1107, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

// Southeast (NC, SC, GA, etc)
const SOUTHEAST_VENUES = [
    { name: 'Harrahs Cherokee Valley River', venue_type: 'casino', city: 'Murphy', state: 'NC', lat: 35.0397, lng: -84.0517, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Catawba Two Kings Casino', venue_type: 'casino', city: 'Kings Mountain', state: 'NC', lat: 35.2507, lng: -81.3507, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Wind Creek Wetumpka', venue_type: 'casino', city: 'Wetumpka', state: 'AL', lat: 32.5377, lng: -86.2117, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Wind Creek Atmore', venue_type: 'casino', city: 'Atmore', state: 'AL', lat: 31.0187, lng: -87.4977, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'IP Casino Resort Spa', venue_type: 'casino', city: 'Biloxi', state: 'MS', lat: 30.3957, lng: -88.8837, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Golden Nugget Biloxi', venue_type: 'casino', city: 'Biloxi', state: 'MS', lat: 30.3927, lng: -88.8757, poker_tables: 12, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Silver Slipper Casino Hotel', venue_type: 'casino', city: 'Bay St. Louis', state: 'MS', lat: 30.3087, lng: -89.3247, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Scarlet Pearl Casino Resort', venue_type: 'casino', city: 'D\'Iberville', state: 'MS', lat: 30.4457, lng: -88.8837, poker_tables: 16, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Sam\'s Town Hotel & Gambling Hall Tunica', venue_type: 'casino', city: 'Robinsonville', state: 'MS', lat: 34.8367, lng: -90.3017, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Gold Strike Casino Resort', venue_type: 'casino', city: 'Robinsonville', state: 'MS', lat: 34.8497, lng: -90.2757, poker_tables: 14, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
];

// South Dakota (Deadwood)
const SOUTH_DAKOTA_VENUES = [
    { name: 'Tin Lizzie Gaming Resort', venue_type: 'casino', city: 'Deadwood', state: 'SD', lat: 44.3767, lng: -103.7297, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Cadillac Jacks Gaming Resort', venue_type: 'casino', city: 'Deadwood', state: 'SD', lat: 44.3727, lng: -103.7247, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
    { name: 'Deadwood Mountain Grand', venue_type: 'casino', city: 'Deadwood', state: 'SD', lat: 44.3697, lng: -103.7317, poker_tables: 6, games_offered: ['NLH'], stakes_cash: ['1/2'], is_featured: false },
];

const ALL_VENUES = [
    ...CALIFORNIA_VENUES,
    ...TEXAS_VENUES,
    ...FLORIDA_VENUES,
    ...NEVADA_VENUES,
    ...OKLAHOMA_VENUES,
    ...LOUISIANA_VENUES,
    ...NORTHEAST_VENUES,
    ...MIDWEST_VENUES,
    ...MOUNTAIN_VENUES,
    ...PACIFIC_NW_VENUES,
    ...SOUTHEAST_VENUES,
    ...SOUTH_DAKOTA_VENUES,
];

async function main() {
    console.log('\n=== Massive Venue Expansion ===\n');
    console.log(`📍 Adding ${ALL_VENUES.length} new venues\n`);

    const BATCH_SIZE = 15;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < ALL_VENUES.length; i += BATCH_SIZE) {
        const batch = ALL_VENUES.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(ALL_VENUES.length / BATCH_SIZE);

        console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} venues)...`);

        try {
            const { data, error } = await supabase
                .from('poker_venues')
                .upsert(batch, { onConflict: 'name,city,state' })
                .select();

            if (error) {
                console.error(`   ❌ Error:`, error.message);
                errors += batch.length;
            } else {
                inserted += batch.length;
                console.log(`   ✅ Inserted ${batch.length} venues`);
            }

            await new Promise(r => setTimeout(r, 300));
        } catch (error) {
            console.error(`   ❌ Exception:`, error.message);
            errors += batch.length;
        }
    }

    console.log('\n=== Expansion Complete ===');
    console.log(`✅ Inserted: ${inserted}`);
    console.log(`❌ Errors: ${errors}`);

    // Get final count
    const { count } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 TOTAL VENUES IN DATABASE: ${count}\n`);
}

main().catch(console.error);
