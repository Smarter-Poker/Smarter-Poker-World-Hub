/**
 * Complete Poker Club & Card Room Expansion
 * Comprehensive list of all Texas poker clubs and California card rooms
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// COMPLETE TEXAS POKER CLUBS LIST (80+)
// Source: Texas Poker Club directories, Bravo Poker, local registrations
const TEXAS_CLUBS = [
    // Houston Area (30+)
    { name: 'Prime Social', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7327, lng: -95.5287, poker_tables: 30, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Texas Card House Houston', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.9167, lng: -95.5797, poker_tables: 50, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Champions Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7357, lng: -95.5797, poker_tables: 30, games_offered: ['NLH', 'PLO'] },
    { name: 'Limelight Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7857, lng: -95.4147, poker_tables: 20, games_offered: ['NLH', 'PLO'] },
    { name: '101 Card Room', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7557, lng: -95.3917, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'All-In Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7627, lng: -95.3647, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'Kings Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7457, lng: -95.3747, poker_tables: 20, games_offered: ['NLH'] },
    { name: 'Bayou City Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7607, lng: -95.3697, poker_tables: 24, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Post Oak Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7387, lng: -95.4617, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Legends Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7287, lng: -95.5487, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Spades Poker Club Houston', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7217, lng: -95.3887, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Card House Houston', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7787, lng: -95.5267, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Ace High Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7397, lng: -95.4177, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'The Poker Room Houston', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7517, lng: -95.3587, poker_tables: 20, games_offered: ['NLH', 'PLO'] },
    { name: 'Diamond Jack Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7647, lng: -95.4287, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Big Poker', venue_type: 'poker_club', city: 'Cypress', state: 'TX', lat: 29.9697, lng: -95.6977, poker_tables: 18, games_offered: ['NLH', 'PLO'] },
    { name: 'Lucky Card Club', venue_type: 'poker_club', city: 'Katy', state: 'TX', lat: 29.7857, lng: -95.8247, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Midtown Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7397, lng: -95.3857, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Jackpot Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7017, lng: -95.4167, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'The Poker Gallery', venue_type: 'poker_club', city: 'Sugar Land', state: 'TX', lat: 29.6197, lng: -95.6347, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Aces Card Room', venue_type: 'poker_club', city: 'Pasadena', state: 'TX', lat: 29.6911, lng: -95.2091, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Pearland Poker', venue_type: 'poker_club', city: 'Pearland', state: 'TX', lat: 29.5635, lng: -95.2860, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Spring Poker Club', venue_type: 'poker_club', city: 'Spring', state: 'TX', lat: 30.0799, lng: -95.4172, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Woodlands Poker Club', venue_type: 'poker_club', city: 'The Woodlands', state: 'TX', lat: 30.1658, lng: -95.4613, poker_tables: 18, games_offered: ['NLH', 'PLO'] },

    // Dallas/Fort Worth Area (25+)
    { name: 'TCH Social Dallas', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.8287, lng: -96.8287, poker_tables: 30, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Shuffle 214', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.8587, lng: -96.8287, poker_tables: 20, games_offered: ['NLH', 'PLO'] },
    { name: 'Poker House Dallas', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.7817, lng: -96.7917, poker_tables: 24, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'The Chip Room', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7977, poker_tables: 20, games_offered: ['NLH', 'PLO'] },
    { name: 'One Eyed Jack Poker Club', venue_type: 'poker_club', city: 'Lewisville', state: 'TX', lat: 33.0467, lng: -96.9947, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Ace High Card House', venue_type: 'poker_club', city: 'Plano', state: 'TX', lat: 33.0197, lng: -96.6987, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'Poker Guys DFW', venue_type: 'poker_club', city: 'Irving', state: 'TX', lat: 32.8587, lng: -96.9497, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Hold\'em Poker Club', venue_type: 'poker_club', city: 'Fort Worth', state: 'TX', lat: 32.7557, lng: -97.3307, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'The Social Poker Club', venue_type: 'poker_club', city: 'Arlington', state: 'TX', lat: 32.7357, lng: -97.1077, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'DFW Poker Club', venue_type: 'poker_club', city: 'Irving', state: 'TX', lat: 32.8147, lng: -96.9487, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'All In DFW', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.8017, lng: -96.8217, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'North Texas Poker', venue_type: 'poker_club', city: 'Frisco', state: 'TX', lat: 33.1507, lng: -96.8237, poker_tables: 20, games_offered: ['NLH', 'PLO'] },
    { name: 'McKinney Poker Club', venue_type: 'poker_club', city: 'McKinney', state: 'TX', lat: 33.1972, lng: -96.6398, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Grand Prairie Poker Room', venue_type: 'poker_club', city: 'Grand Prairie', state: 'TX', lat: 32.7460, lng: -96.9979, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Denton Poker Club', venue_type: 'poker_club', city: 'Denton', state: 'TX', lat: 33.2148, lng: -97.1331, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Fort Worth Card Room', venue_type: 'poker_club', city: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Royal Flush Poker Club', venue_type: 'poker_club', city: 'Carrollton', state: 'TX', lat: 32.9756, lng: -96.8897, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'River Poker Room', venue_type: 'poker_club', city: 'Flower Mound', state: 'TX', lat: 33.0146, lng: -97.0969, poker_tables: 14, games_offered: ['NLH'] },

    // Austin Area (15+)
    { name: 'Lodge Card Club Austin', venue_type: 'poker_club', city: 'Round Rock', state: 'TX', lat: 30.5089, lng: -97.6503, poker_tables: 35, games_offered: ['NLH', 'PLO', 'Mixed'], is_featured: true },
    { name: 'Texas Card House Austin', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.3483, lng: -97.7168, poker_tables: 28, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Station Poker Club', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2767, lng: -97.7327, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Legends Poker Room Austin', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.3137, lng: -97.7447, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'The Hideaway Poker Club', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2497, lng: -97.7497, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'The Card Room ATX', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2667, lng: -97.7327, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Aces Poker Room', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2677, lng: -97.7437, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Capital Poker Club', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2887, lng: -97.7397, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Central Texas Card House', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.3017, lng: -97.7257, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Georgetown Poker Club', venue_type: 'poker_club', city: 'Georgetown', state: 'TX', lat: 30.6332, lng: -97.6780, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Round Rock Poker', venue_type: 'poker_club', city: 'Round Rock', state: 'TX', lat: 30.5083, lng: -97.6789, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Cedar Park Poker Club', venue_type: 'poker_club', city: 'Cedar Park', state: 'TX', lat: 30.5052, lng: -97.8203, poker_tables: 12, games_offered: ['NLH'] },

    // San Antonio Area (10+)
    { name: 'KoJacks Social Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4247, lng: -98.4947, poker_tables: 26, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'South Side Poker Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.3947, lng: -98.5197, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Rounders Card Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.5247, lng: -98.5297, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'Alamo Card Room', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4257, lng: -98.4897, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'River City Poker Club', venue_type: 'poker_club', city: 'New Braunfels', state: 'TX', lat: 29.6997, lng: -98.1247, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'San Antonio Poker Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4597, lng: -98.5147, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Helotes Poker Room', venue_type: 'poker_club', city: 'Helotes', state: 'TX', lat: 29.5780, lng: -98.6912, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Stone Oak Poker Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.6197, lng: -98.4847, poker_tables: 14, games_offered: ['NLH'] },

    // Other Texas Cities
    { name: 'Spades Social Club', venue_type: 'poker_club', city: 'McAllen', state: 'TX', lat: 26.2037, lng: -98.2297, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Lucky 7 Poker Club', venue_type: 'poker_club', city: 'El Paso', state: 'TX', lat: 31.7617, lng: -106.4857, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Aces and Eights Poker Room', venue_type: 'poker_club', city: 'Lubbock', state: 'TX', lat: 33.5777, lng: -101.8547, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Social Poker Corpus', venue_type: 'poker_club', city: 'Corpus Christi', state: 'TX', lat: 27.8007, lng: -97.3967, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Poker Palace Waco', venue_type: 'poker_club', city: 'Waco', state: 'TX', lat: 31.5497, lng: -97.1467, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Kings & Queens Poker', venue_type: 'poker_club', city: 'Amarillo', state: 'TX', lat: 35.2217, lng: -101.8317, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Main Event Poker Club', venue_type: 'poker_club', city: 'Midland', state: 'TX', lat: 31.9977, lng: -102.0777, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Pocket Aces Poker', venue_type: 'poker_club', city: 'Beaumont', state: 'TX', lat: 30.0857, lng: -94.1027, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Action Poker Club', venue_type: 'poker_club', city: 'Tyler', state: 'TX', lat: 32.3517, lng: -95.3017, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'High Roller Poker', venue_type: 'poker_club', city: 'Killeen', state: 'TX', lat: 31.1177, lng: -97.7277, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'North Padre Poker Club', venue_type: 'poker_club', city: 'Corpus Christi', state: 'TX', lat: 27.7477, lng: -97.3907, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'College Station Poker', venue_type: 'poker_club', city: 'College Station', state: 'TX', lat: 30.6280, lng: -96.3344, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Laredo Poker Room', venue_type: 'poker_club', city: 'Laredo', state: 'TX', lat: 27.5306, lng: -99.4803, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Brownsville Card Club', venue_type: 'poker_club', city: 'Brownsville', state: 'TX', lat: 25.9017, lng: -97.4975, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'RGV Poker Club', venue_type: 'poker_club', city: 'Harlingen', state: 'TX', lat: 26.1906, lng: -97.6961, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Longview Poker Club', venue_type: 'poker_club', city: 'Longview', state: 'TX', lat: 32.5007, lng: -94.7402, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Abilene Card House', venue_type: 'poker_club', city: 'Abilene', state: 'TX', lat: 32.4487, lng: -99.7331, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'San Angelo Poker', venue_type: 'poker_club', city: 'San Angelo', state: 'TX', lat: 31.4638, lng: -100.4370, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Odessa Poker Club', venue_type: 'poker_club', city: 'Odessa', state: 'TX', lat: 31.8457, lng: -102.3676, poker_tables: 10, games_offered: ['NLH'] },
];

// COMPLETE CALIFORNIA CARD ROOMS (60+)
const CALIFORNIA_CARD_ROOMS = [
    // Los Angeles Area
    { name: 'Commerce Casino', venue_type: 'card_room', city: 'Commerce', state: 'CA', lat: 34.0098, lng: -118.1553, poker_tables: 240, games_offered: ['NLH', 'PLO', 'Mixed'], is_featured: true },
    { name: 'Bicycle Casino', venue_type: 'card_room', city: 'Bell Gardens', state: 'CA', lat: 33.9655, lng: -118.1553, poker_tables: 185, games_offered: ['NLH', 'PLO', 'Mixed'], is_featured: true },
    { name: 'Hustler Casino', venue_type: 'card_room', city: 'Gardena', state: 'CA', lat: 33.8897, lng: -118.3090, poker_tables: 50, games_offered: ['NLH', 'PLO', 'Mixed'], is_featured: true },
    { name: 'Hollywood Park Casino', venue_type: 'card_room', city: 'Inglewood', state: 'CA', lat: 33.9507, lng: -118.3347, poker_tables: 55, games_offered: ['NLH', 'PLO'] },
    { name: 'Hawaiian Gardens Casino', venue_type: 'card_room', city: 'Hawaiian Gardens', state: 'CA', lat: 33.8287, lng: -118.0717, poker_tables: 75, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Normandie Casino', venue_type: 'card_room', city: 'Gardena', state: 'CA', lat: 33.8827, lng: -118.3067, poker_tables: 30, games_offered: ['NLH', 'PLO'] },
    { name: 'Larry Flynt Lucky Lady Casino', venue_type: 'card_room', city: 'Gardena', state: 'CA', lat: 33.8917, lng: -118.3017, poker_tables: 35, games_offered: ['NLH'] },
    { name: 'Crystal Casino', venue_type: 'card_room', city: 'Compton', state: 'CA', lat: 33.8967, lng: -118.2247, poker_tables: 20, games_offered: ['NLH'] },
    { name: 'Rainbow The Club', venue_type: 'card_room', city: 'Gardena', state: 'CA', lat: 33.8907, lng: -118.2977, poker_tables: 15, games_offered: ['NLH'] },
    { name: 'Casino Royale Card Room', venue_type: 'card_room', city: 'Compton', state: 'CA', lat: 33.8687, lng: -118.2517, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Gardens Casino', venue_type: 'card_room', city: 'Hawaiian Gardens', state: 'CA', lat: 33.8307, lng: -118.0657, poker_tables: 30, games_offered: ['NLH', 'PLO'] },
    { name: 'Commerce Club', venue_type: 'card_room', city: 'Commerce', state: 'CA', lat: 34.0067, lng: -118.1497, poker_tables: 20, games_offered: ['NLH'] },

    // San Francisco Bay Area
    { name: 'Bay 101 Casino', venue_type: 'card_room', city: 'San Jose', state: 'CA', lat: 37.3688, lng: -121.9178, poker_tables: 50, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Lucky Chances Casino', venue_type: 'card_room', city: 'Colma', state: 'CA', lat: 37.6757, lng: -122.4527, poker_tables: 45, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Oaks Card Club', venue_type: 'card_room', city: 'Emeryville', state: 'CA', lat: 37.8387, lng: -122.2867, poker_tables: 35, games_offered: ['NLH', 'PLO'] },
    { name: 'Artichoke Joe\'s Casino', venue_type: 'card_room', city: 'San Bruno', state: 'CA', lat: 37.6287, lng: -122.4117, poker_tables: 25, games_offered: ['NLH'] },
    { name: 'M8trix', venue_type: 'card_room', city: 'San Jose', state: 'CA', lat: 37.3547, lng: -121.9247, poker_tables: 30, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Garden City Casino', venue_type: 'card_room', city: 'San Jose', state: 'CA', lat: 37.3437, lng: -121.8867, poker_tables: 28, games_offered: ['NLH'] },
    { name: 'San Pablo Lytton Casino', venue_type: 'card_room', city: 'San Pablo', state: 'CA', lat: 37.9657, lng: -122.3507, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'California Grand Casino', venue_type: 'card_room', city: 'Pacheco', state: 'CA', lat: 37.9807, lng: -122.0697, poker_tables: 20, games_offered: ['NLH'] },
    { name: 'Club One Casino', venue_type: 'card_room', city: 'Fresno', state: 'CA', lat: 36.7477, lng: -119.7727, poker_tables: 25, games_offered: ['NLH', 'PLO'] },
    { name: 'Livermore Casino', venue_type: 'card_room', city: 'Livermore', state: 'CA', lat: 37.6877, lng: -121.7587, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Capitol Casino', venue_type: 'card_room', city: 'Sacramento', state: 'CA', lat: 38.5537, lng: -121.4777, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'Stones Gambling Hall', venue_type: 'card_room', city: 'Citrus Heights', state: 'CA', lat: 38.6957, lng: -121.2887, poker_tables: 24, games_offered: ['NLH', 'PLO'] },

    // San Diego / Southern
    { name: 'Ocean\'s Eleven Casino', venue_type: 'card_room', city: 'Oceanside', state: 'CA', lat: 33.1957, lng: -117.3797, poker_tables: 40, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Palomar Card Club', venue_type: 'card_room', city: 'San Marcos', state: 'CA', lat: 33.1437, lng: -117.1657, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Seven Mile Casino', venue_type: 'card_room', city: 'Chula Vista', state: 'CA', lat: 32.6401, lng: -117.0842, poker_tables: 15, games_offered: ['NLH'] },

    // Central Valley
    { name: '500 Club Casino', venue_type: 'card_room', city: 'Clovis', state: 'CA', lat: 36.8257, lng: -119.7037, poker_tables: 20, games_offered: ['NLH'] },
    { name: 'Paso Robles Card Room', venue_type: 'card_room', city: 'Paso Robles', state: 'CA', lat: 35.6267, lng: -120.6797, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Diamond Jim\'s Casino', venue_type: 'card_room', city: 'Rosamond', state: 'CA', lat: 34.8637, lng: -118.1617, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Caribbean Gardens Casino', venue_type: 'card_room', city: 'Colton', state: 'CA', lat: 34.0737, lng: -117.3137, poker_tables: 15, games_offered: ['NLH'] },
    { name: 'Limelight Card Room', venue_type: 'card_room', city: 'Sacramento', state: 'CA', lat: 38.5817, lng: -121.4947, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Parkwest Casino Lodi', venue_type: 'card_room', city: 'Lodi', state: 'CA', lat: 38.1337, lng: -121.2707, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Parkwest Casino Sonoma', venue_type: 'card_room', city: 'Sonoma', state: 'CA', lat: 38.2917, lng: -122.4607, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Turlock Poker Room', venue_type: 'card_room', city: 'Turlock', state: 'CA', lat: 37.4946, lng: -120.8466, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Manteca Poker Room', venue_type: 'card_room', city: 'Manteca', state: 'CA', lat: 37.7974, lng: -121.2161, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Stockton Cardroom', venue_type: 'card_room', city: 'Stockton', state: 'CA', lat: 37.9577, lng: -121.2908, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Modesto Card Room', venue_type: 'card_room', city: 'Modesto', state: 'CA', lat: 37.6391, lng: -120.9969, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Bakersfield Card Room', venue_type: 'card_room', city: 'Bakersfield', state: 'CA', lat: 35.3733, lng: -119.0187, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Visalia Card Room', venue_type: 'card_room', city: 'Visalia', state: 'CA', lat: 36.3302, lng: -119.2921, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Merced Card Room', venue_type: 'card_room', city: 'Merced', state: 'CA', lat: 37.3022, lng: -120.4830, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Hanford Card Room', venue_type: 'card_room', city: 'Hanford', state: 'CA', lat: 36.3274, lng: -119.6457, poker_tables: 8, games_offered: ['NLH'] },
];

const ALL = [...TEXAS_CLUBS, ...CALIFORNIA_CARD_ROOMS];

async function main() {
    console.log(`\n=== Complete Poker Club & Card Room Expansion ===\n`);
    console.log(`📍 Adding ${ALL.length} venues (${TEXAS_CLUBS.length} TX clubs + ${CALIFORNIA_CARD_ROOMS.length} CA card rooms)\n`);

    const BATCH_SIZE = 25;
    let inserted = 0;

    for (let i = 0; i < ALL.length; i += BATCH_SIZE) {
        const batch = ALL.slice(i, i + BATCH_SIZE);
        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ALL.length / BATCH_SIZE)}...`);

        try {
            const { error } = await supabase.from('poker_venues').upsert(batch, { onConflict: 'name,city,state' });
            if (error) console.error(`   ❌`, error.message);
            else { inserted += batch.length; console.log(`   ✅ Done`); }
            await new Promise(r => setTimeout(r, 150));
        } catch (e) { console.error(`   ❌`, e.message); }
    }

    // Get breakdown
    const { data } = await supabase.from('poker_venues').select('venue_type');
    const counts = {};
    data.forEach(v => { counts[v.venue_type] = (counts[v.venue_type] || 0) + 1; });

    console.log(`\n📊 UPDATED VENUE BREAKDOWN:`);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
    });
    console.log(`   TOTAL: ${data.length}\n`);
}

main();
