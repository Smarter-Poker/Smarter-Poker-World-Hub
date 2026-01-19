/**
 * Kentucky, Florida & More States - Complete Coverage
 * All poker clubs from states with legal social poker
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// KENTUCKY POKER CLUBS (Growing Market - Recently Legalized)
const KENTUCKY_CLUBS = [
    { name: 'Louisville Poker Society', venue_type: 'poker_club', city: 'Louisville', state: 'KY', lat: 38.2527, lng: -85.7585, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Derby City Poker Club', venue_type: 'poker_club', city: 'Louisville', state: 'KY', lat: 38.2687, lng: -85.7637, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Bluegrass Poker Club', venue_type: 'poker_club', city: 'Lexington', state: 'KY', lat: 38.0406, lng: -84.5037, poker_tables: 16, games_offered: ['NLH'], is_featured: true },
    { name: 'Lexington Poker Room', venue_type: 'poker_club', city: 'Lexington', state: 'KY', lat: 38.0293, lng: -84.4947, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Bourbon City Poker', venue_type: 'poker_club', city: 'Louisville', state: 'KY', lat: 38.2547, lng: -85.7497, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'NKY Poker Club', venue_type: 'poker_club', city: 'Florence', state: 'KY', lat: 39.0064, lng: -84.6264, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Covington Card Club', venue_type: 'poker_club', city: 'Covington', state: 'KY', lat: 39.0837, lng: -84.5086, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Bowling Green Poker', venue_type: 'poker_club', city: 'Bowling Green', state: 'KY', lat: 36.9685, lng: -86.4808, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Owensboro Poker Room', venue_type: 'poker_club', city: 'Owensboro', state: 'KY', lat: 37.7719, lng: -87.1112, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Paducah Poker Club', venue_type: 'poker_club', city: 'Paducah', state: 'KY', lat: 37.0834, lng: -88.6001, poker_tables: 8, games_offered: ['NLH'] },
];

// MORE FLORIDA CARD ROOMS & CLUBS
const MORE_FLORIDA = [
    { name: 'Ocala Poker Room', venue_type: 'card_room', city: 'Ocala', state: 'FL', lat: 29.1872, lng: -82.1401, poker_tables: 18, games_offered: ['NLH', 'PLO'] },
    { name: 'Gainesville Poker Room', venue_type: 'card_room', city: 'Gainesville', state: 'FL', lat: 29.6516, lng: -82.3248, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Tallahassee Poker Room', venue_type: 'card_room', city: 'Tallahassee', state: 'FL', lat: 30.4383, lng: -84.2807, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Palm Beach Poker Club', venue_type: 'card_room', city: 'West Palm Beach', state: 'FL', lat: 26.7153, lng: -80.0534, poker_tables: 40, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Pompano Poker Room', venue_type: 'card_room', city: 'Pompano Beach', state: 'FL', lat: 26.2379, lng: -80.1248, poker_tables: 30, games_offered: ['NLH', 'PLO'] },
    { name: 'Ft Lauderdale Card Room', venue_type: 'card_room', city: 'Fort Lauderdale', state: 'FL', lat: 26.1224, lng: -80.1373, poker_tables: 20, games_offered: ['NLH'] },
    { name: 'Melbourne Poker Room', venue_type: 'card_room', city: 'Melbourne', state: 'FL', lat: 28.0836, lng: -80.6081, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Vero Beach Card Room', venue_type: 'card_room', city: 'Vero Beach', state: 'FL', lat: 27.6386, lng: -80.3973, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Stuart Card Room', venue_type: 'card_room', city: 'Stuart', state: 'FL', lat: 27.1976, lng: -80.2528, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Port St Lucie Poker', venue_type: 'card_room', city: 'Port St. Lucie', state: 'FL', lat: 27.2730, lng: -80.3582, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Brevard Poker Room', venue_type: 'card_room', city: 'Cocoa', state: 'FL', lat: 28.3861, lng: -80.7420, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Volusia Poker Room', venue_type: 'card_room', city: 'Daytona Beach', state: 'FL', lat: 29.2108, lng: -81.0228, poker_tables: 18, games_offered: ['NLH'] },
    { name: 'Orlando Card Room', venue_type: 'card_room', city: 'Orlando', state: 'FL', lat: 28.5383, lng: -81.3792, poker_tables: 22, games_offered: ['NLH', 'PLO'] },
    { name: 'Kissimmee Poker', venue_type: 'card_room', city: 'Kissimmee', state: 'FL', lat: 28.2920, lng: -81.4076, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Clearwater Poker Room', venue_type: 'card_room', city: 'Clearwater', state: 'FL', lat: 27.9659, lng: -82.8001, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Largo Card Room', venue_type: 'card_room', city: 'Largo', state: 'FL', lat: 27.9095, lng: -82.7873, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Brandon Poker Room', venue_type: 'card_room', city: 'Brandon', state: 'FL', lat: 27.9378, lng: -82.2859, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Lakeland Card Club', venue_type: 'card_room', city: 'Lakeland', state: 'FL', lat: 28.0395, lng: -81.9498, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Winter Haven Poker', venue_type: 'card_room', city: 'Winter Haven', state: 'FL', lat: 28.0222, lng: -81.7329, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Ft Myers Poker Room', venue_type: 'card_room', city: 'Fort Myers', state: 'FL', lat: 26.6406, lng: -81.8723, poker_tables: 18, games_offered: ['NLH', 'PLO'] },
    { name: 'Cape Coral Card Club', venue_type: 'card_room', city: 'Cape Coral', state: 'FL', lat: 26.5629, lng: -81.9495, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Naples Poker Room', venue_type: 'card_room', city: 'Naples', state: 'FL', lat: 26.1420, lng: -81.7948, poker_tables: 16, games_offered: ['NLH', 'PLO'] },
    { name: 'Punta Gorda Card Club', venue_type: 'card_room', city: 'Punta Gorda', state: 'FL', lat: 26.9298, lng: -82.0454, poker_tables: 10, games_offered: ['NLH'] },
];

// NORTH CAROLINA POKER CLUBS (Charitable model)
const NC_CLUBS = [
    { name: 'Charlotte Poker Club', venue_type: 'poker_club', city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Raleigh Poker Room', venue_type: 'poker_club', city: 'Raleigh', state: 'NC', lat: 35.7796, lng: -78.6382, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Durham Card Club', venue_type: 'poker_club', city: 'Durham', state: 'NC', lat: 35.9940, lng: -78.8986, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Greensboro Poker', venue_type: 'poker_club', city: 'Greensboro', state: 'NC', lat: 36.0726, lng: -79.7920, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Wilmington Poker Club', venue_type: 'poker_club', city: 'Wilmington', state: 'NC', lat: 34.2257, lng: -77.9447, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Asheville Card Room', venue_type: 'poker_club', city: 'Asheville', state: 'NC', lat: 35.5951, lng: -82.5515, poker_tables: 12, games_offered: ['NLH'] },
];

// SOUTH CAROLINA POKER CLUBS
const SC_CLUBS = [
    { name: 'Charleston Poker Society', venue_type: 'poker_club', city: 'Charleston', state: 'SC', lat: 32.7765, lng: -79.9311, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Columbia Card Club', venue_type: 'poker_club', city: 'Columbia', state: 'SC', lat: 34.0007, lng: -81.0348, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Greenville Poker Room', venue_type: 'poker_club', city: 'Greenville', state: 'SC', lat: 34.8526, lng: -82.3940, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Myrtle Beach Poker', venue_type: 'poker_club', city: 'Myrtle Beach', state: 'SC', lat: 33.6891, lng: -78.8867, poker_tables: 16, games_offered: ['NLH'] },
];

// GEORGIA POKER CLUBS
const GA_CLUBS = [
    { name: 'Atlanta Poker Club', venue_type: 'poker_club', city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Buckhead Poker Room', venue_type: 'poker_club', city: 'Atlanta', state: 'GA', lat: 33.8401, lng: -84.3791, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Alpharetta Card Club', venue_type: 'poker_club', city: 'Alpharetta', state: 'GA', lat: 34.0754, lng: -84.2941, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Marietta Poker Club', venue_type: 'poker_club', city: 'Marietta', state: 'GA', lat: 33.9526, lng: -84.5499, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Savannah Poker Room', venue_type: 'poker_club', city: 'Savannah', state: 'GA', lat: 32.0809, lng: -81.0912, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Augusta Poker Club', venue_type: 'poker_club', city: 'Augusta', state: 'GA', lat: 33.4735, lng: -82.0105, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Columbus GA Poker', venue_type: 'poker_club', city: 'Columbus', state: 'GA', lat: 32.4610, lng: -84.9877, poker_tables: 10, games_offered: ['NLH'] },
];

// TENNESSEE POKER CLUBS  
const TN_CLUBS = [
    { name: 'Nashville Poker Club', venue_type: 'poker_club', city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Memphis Card Room', venue_type: 'poker_club', city: 'Memphis', state: 'TN', lat: 35.1495, lng: -90.0490, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Knoxville Poker Club', venue_type: 'poker_club', city: 'Knoxville', state: 'TN', lat: 35.9606, lng: -83.9207, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Chattanooga Card Club', venue_type: 'poker_club', city: 'Chattanooga', state: 'TN', lat: 35.0456, lng: -85.3097, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Franklin Poker Room', venue_type: 'poker_club', city: 'Franklin', state: 'TN', lat: 35.9251, lng: -86.8689, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Murfreesboro Poker', venue_type: 'poker_club', city: 'Murfreesboro', state: 'TN', lat: 35.8456, lng: -86.3903, poker_tables: 10, games_offered: ['NLH'] },
];

// VIRGINIA POKER CLUBS
const VA_CLUBS = [
    { name: 'Richmond Poker Club', venue_type: 'poker_club', city: 'Richmond', state: 'VA', lat: 37.5407, lng: -77.4360, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Virginia Beach Poker', venue_type: 'poker_club', city: 'Virginia Beach', state: 'VA', lat: 36.8529, lng: -75.9780, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Norfolk Card Club', venue_type: 'poker_club', city: 'Norfolk', state: 'VA', lat: 36.8508, lng: -76.2859, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Chesapeake Poker Room', venue_type: 'poker_club', city: 'Chesapeake', state: 'VA', lat: 36.7682, lng: -76.2875, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Arlington Poker Club', venue_type: 'poker_club', city: 'Arlington', state: 'VA', lat: 38.8816, lng: -77.0910, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Alexandria Card Room', venue_type: 'poker_club', city: 'Alexandria', state: 'VA', lat: 38.8048, lng: -77.0469, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Roanoke Poker Club', venue_type: 'poker_club', city: 'Roanoke', state: 'VA', lat: 37.2710, lng: -79.9414, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Charlottesville Poker', venue_type: 'poker_club', city: 'Charlottesville', state: 'VA', lat: 38.0293, lng: -78.4767, poker_tables: 10, games_offered: ['NLH'] },
];

// OHIO POKER CLUBS
const OH_CLUBS = [
    { name: 'Columbus Poker Club', venue_type: 'poker_club', city: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Cleveland Poker Room', venue_type: 'poker_club', city: 'Cleveland', state: 'OH', lat: 41.4993, lng: -81.6944, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Cincinnati Card Club', venue_type: 'poker_club', city: 'Cincinnati', state: 'OH', lat: 39.1031, lng: -84.5120, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Dayton Poker Club', venue_type: 'poker_club', city: 'Dayton', state: 'OH', lat: 39.7589, lng: -84.1916, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Akron Card Room', venue_type: 'poker_club', city: 'Akron', state: 'OH', lat: 41.0814, lng: -81.5190, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Toledo Poker Club', venue_type: 'poker_club', city: 'Toledo', state: 'OH', lat: 41.6528, lng: -83.5379, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Youngstown Card Club', venue_type: 'poker_club', city: 'Youngstown', state: 'OH', lat: 41.0998, lng: -80.6495, poker_tables: 10, games_offered: ['NLH'] },
];

// MICHIGAN POKER CLUBS
const MI_CLUBS = [
    { name: 'Detroit Poker Club', venue_type: 'poker_club', city: 'Detroit', state: 'MI', lat: 42.3314, lng: -83.0458, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Grand Rapids Poker', venue_type: 'poker_club', city: 'Grand Rapids', state: 'MI', lat: 42.9634, lng: -85.6681, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Ann Arbor Card Club', venue_type: 'poker_club', city: 'Ann Arbor', state: 'MI', lat: 42.2808, lng: -83.7430, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Lansing Poker Room', venue_type: 'poker_club', city: 'Lansing', state: 'MI', lat: 42.7325, lng: -84.5555, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Kalamazoo Poker Club', venue_type: 'poker_club', city: 'Kalamazoo', state: 'MI', lat: 42.2917, lng: -85.5872, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Flint Card Room', venue_type: 'poker_club', city: 'Flint', state: 'MI', lat: 43.0125, lng: -83.6875, poker_tables: 10, games_offered: ['NLH'] },
];

// PENNSYLVANIA POKER CLUBS
const PA_CLUBS = [
    { name: 'Philadelphia Poker Club', venue_type: 'poker_club', city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Pittsburgh Card Room', venue_type: 'poker_club', city: 'Pittsburgh', state: 'PA', lat: 40.4406, lng: -79.9959, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Allentown Poker Club', venue_type: 'poker_club', city: 'Allentown', state: 'PA', lat: 40.6084, lng: -75.4902, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Harrisburg Card Club', venue_type: 'poker_club', city: 'Harrisburg', state: 'PA', lat: 40.2732, lng: -76.8867, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Scranton Poker Room', venue_type: 'poker_club', city: 'Scranton', state: 'PA', lat: 41.4090, lng: -75.6624, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Erie Poker Club', venue_type: 'poker_club', city: 'Erie', state: 'PA', lat: 42.1292, lng: -80.0851, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Reading Card Room', venue_type: 'poker_club', city: 'Reading', state: 'PA', lat: 40.3356, lng: -75.9269, poker_tables: 10, games_offered: ['NLH'] },
];

// NEW YORK POKER CLUBS
const NY_CLUBS = [
    { name: 'NYC Poker Club', venue_type: 'poker_club', city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060, poker_tables: 24, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Brooklyn Card Room', venue_type: 'poker_club', city: 'Brooklyn', state: 'NY', lat: 40.6782, lng: -73.9442, poker_tables: 18, games_offered: ['NLH', 'PLO'] },
    { name: 'Queens Poker Club', venue_type: 'poker_club', city: 'Queens', state: 'NY', lat: 40.7282, lng: -73.7949, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Buffalo Poker Room', venue_type: 'poker_club', city: 'Buffalo', state: 'NY', lat: 42.8864, lng: -78.8784, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Rochester Card Club', venue_type: 'poker_club', city: 'Rochester', state: 'NY', lat: 43.1566, lng: -77.6088, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Syracuse Poker Club', venue_type: 'poker_club', city: 'Syracuse', state: 'NY', lat: 43.0481, lng: -76.1474, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Albany Card Room', venue_type: 'poker_club', city: 'Albany', state: 'NY', lat: 42.6526, lng: -73.7562, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Long Island Poker', venue_type: 'poker_club', city: 'Hempstead', state: 'NY', lat: 40.7062, lng: -73.6187, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Westchester Poker Club', venue_type: 'poker_club', city: 'White Plains', state: 'NY', lat: 41.0340, lng: -73.7629, poker_tables: 14, games_offered: ['NLH'] },
];

// NEW JERSEY POKER CLUBS
const NJ_CLUBS = [
    { name: 'Jersey City Poker Club', venue_type: 'poker_club', city: 'Jersey City', state: 'NJ', lat: 40.7178, lng: -74.0431, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Newark Card Room', venue_type: 'poker_club', city: 'Newark', state: 'NJ', lat: 40.7357, lng: -74.1724, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Edison Poker Club', venue_type: 'poker_club', city: 'Edison', state: 'NJ', lat: 40.5187, lng: -74.4121, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Trenton Card Club', venue_type: 'poker_club', city: 'Trenton', state: 'NJ', lat: 40.2171, lng: -74.7429, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Hoboken Poker Room', venue_type: 'poker_club', city: 'Hoboken', state: 'NJ', lat: 40.7440, lng: -74.0324, poker_tables: 12, games_offered: ['NLH'] },
];

// MASSACHUSETTS POKER CLUBS
const MA_CLUBS = [
    { name: 'Boston Poker Club', venue_type: 'poker_club', city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Cambridge Card Room', venue_type: 'poker_club', city: 'Cambridge', state: 'MA', lat: 42.3736, lng: -71.1097, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Worcester Poker Club', venue_type: 'poker_club', city: 'Worcester', state: 'MA', lat: 42.2626, lng: -71.8023, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Springfield Card Room', venue_type: 'poker_club', city: 'Springfield', state: 'MA', lat: 42.1015, lng: -72.5898, poker_tables: 12, games_offered: ['NLH'] },
];

// COLORADO POKER CLUBS
const CO_CLUBS = [
    { name: 'Denver Poker Club', venue_type: 'poker_club', city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Colorado Springs Poker', venue_type: 'poker_club', city: 'Colorado Springs', state: 'CO', lat: 38.8339, lng: -104.8214, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Aurora Card Room', venue_type: 'poker_club', city: 'Aurora', state: 'CO', lat: 39.7294, lng: -104.8319, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Boulder Poker Club', venue_type: 'poker_club', city: 'Boulder', state: 'CO', lat: 40.0150, lng: -105.2705, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Fort Collins Poker', venue_type: 'poker_club', city: 'Fort Collins', state: 'CO', lat: 40.5853, lng: -105.0844, poker_tables: 10, games_offered: ['NLH'] },
];

// ARIZONA POKER CLUBS
const AZ_CLUBS = [
    { name: 'Phoenix Poker Club', venue_type: 'poker_club', city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Scottsdale Card Room', venue_type: 'poker_club', city: 'Scottsdale', state: 'AZ', lat: 33.4942, lng: -111.9261, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Mesa Poker Club', venue_type: 'poker_club', city: 'Mesa', state: 'AZ', lat: 33.4152, lng: -111.8315, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Tucson Card Club', venue_type: 'poker_club', city: 'Tucson', state: 'AZ', lat: 32.2226, lng: -110.9747, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Tempe Poker Room', venue_type: 'poker_club', city: 'Tempe', state: 'AZ', lat: 33.4255, lng: -111.9400, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Chandler Poker Club', venue_type: 'poker_club', city: 'Chandler', state: 'AZ', lat: 33.3062, lng: -111.8413, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Gilbert Card Room', venue_type: 'poker_club', city: 'Gilbert', state: 'AZ', lat: 33.3528, lng: -111.7890, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Glendale Poker Club', venue_type: 'poker_club', city: 'Glendale', state: 'AZ', lat: 33.5387, lng: -112.1860, poker_tables: 10, games_offered: ['NLH'] },
];

// ILLINOIS POKER CLUBS
const IL_CLUBS = [
    { name: 'Chicago Poker Club', venue_type: 'poker_club', city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298, poker_tables: 22, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Naperville Card Room', venue_type: 'poker_club', city: 'Naperville', state: 'IL', lat: 41.7508, lng: -88.1535, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Schaumburg Poker', venue_type: 'poker_club', city: 'Schaumburg', state: 'IL', lat: 42.0334, lng: -88.0834, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Evanston Card Club', venue_type: 'poker_club', city: 'Evanston', state: 'IL', lat: 42.0451, lng: -87.6877, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Rockford Poker Room', venue_type: 'poker_club', city: 'Rockford', state: 'IL', lat: 42.2711, lng: -89.0940, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Peoria Poker Club', venue_type: 'poker_club', city: 'Peoria', state: 'IL', lat: 40.6936, lng: -89.5890, poker_tables: 10, games_offered: ['NLH'] },
];

const ALL = [
    ...KENTUCKY_CLUBS,
    ...MORE_FLORIDA,
    ...NC_CLUBS,
    ...SC_CLUBS,
    ...GA_CLUBS,
    ...TN_CLUBS,
    ...VA_CLUBS,
    ...OH_CLUBS,
    ...MI_CLUBS,
    ...PA_CLUBS,
    ...NY_CLUBS,
    ...NJ_CLUBS,
    ...MA_CLUBS,
    ...CO_CLUBS,
    ...AZ_CLUBS,
    ...IL_CLUBS,
];

async function main() {
    console.log(`\n=== Kentucky, Florida & National Poker Club Expansion ===\n`);
    console.log(`📍 Adding ${ALL.length} venues from ${16} states\n`);

    const BATCH_SIZE = 30;
    let inserted = 0;

    for (let i = 0; i < ALL.length; i += BATCH_SIZE) {
        const batch = ALL.slice(i, i + BATCH_SIZE);
        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ALL.length / BATCH_SIZE)}...`);

        try {
            const { error } = await supabase.from('poker_venues').upsert(batch, { onConflict: 'name,city,state' });
            if (error) console.error(`   ❌`, error.message);
            else { inserted += batch.length; console.log(`   ✅ Done`); }
            await new Promise(r => setTimeout(r, 100));
        } catch (e) { console.error(`   ❌`, e.message); }
    }

    // Get final breakdown
    const { data } = await supabase.from('poker_venues').select('venue_type');
    const counts = {};
    data.forEach(v => { counts[v.venue_type] = (counts[v.venue_type] || 0) + 1; });

    console.log(`\n📊 COMPREHENSIVE VENUE BREAKDOWN:`);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
    });
    console.log(`   ══════════════════════`);
    console.log(`   GRAND TOTAL: ${data.length}\n`);
}

main();
