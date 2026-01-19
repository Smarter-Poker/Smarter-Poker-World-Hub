/**
 * Ultimate Final Expansion - Reaching 450+
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Remaining venues to hit 450+
const VENUES = [
    // More California - Remaining
    { name: 'Oaks Club Poker', venue_type: 'card_room', city: 'Oakland', state: 'CA', lat: 37.8047, lng: -122.2727, poker_tables: 15, games_offered: ['NLH'] },
    { name: 'Club One Casino', venue_type: 'card_room', city: 'Fresno', state: 'CA', lat: 36.7477, lng: -119.7727, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Paso Robles Casino', venue_type: 'card_room', city: 'Paso Robles', state: 'CA', lat: 35.6267, lng: -120.6797, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Diamond Jims Casino', venue_type: 'card_room', city: 'Rosamond', state: 'CA', lat: 34.8637, lng: -118.1617, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Caribbean Gardens Casino', venue_type: 'card_room', city: 'Colton', state: 'CA', lat: 34.0737, lng: -117.3137, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Limelight Card Room', venue_type: 'card_room', city: 'Sacramento', state: 'CA', lat: 38.5817, lng: -121.4947, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Capitol Casino', venue_type: 'card_room', city: 'Sacramento', state: 'CA', lat: 38.5537, lng: -121.4777, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: '500 Club Casino', venue_type: 'card_room', city: 'Clovis', state: 'CA', lat: 36.8257, lng: -119.7037, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Ocean\'s Eleven Casino', venue_type: 'card_room', city: 'Oceanside', state: 'CA', lat: 33.1957, lng: -117.3797, poker_tables: 25, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Palomar Card Club', venue_type: 'card_room', city: 'San Marcos', state: 'CA', lat: 33.1437, lng: -117.1657, poker_tables: 14, games_offered: ['NLH'] },

    // More Nevada
    { name: 'Santa Fe Station', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1847, lng: -115.2857, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Fiesta Rancho', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2217, lng: -115.1397, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Cannery Casino', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2497, lng: -115.1177, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Jerry Nugget Casino', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2167, lng: -115.1267, poker_tables: 4, games_offered: ['NLH'] },
    { name: 'Westgate Las Vegas', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1317, lng: -115.1527, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Rampart Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1897, lng: -115.3217, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Rail City Casino', venue_type: 'casino', city: 'Sparks', state: 'NV', lat: 39.5357, lng: -119.7427, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Wendover Nugget', venue_type: 'casino', city: 'West Wendover', state: 'NV', lat: 40.7397, lng: -114.0737, poker_tables: 6, games_offered: ['NLH'] },

    // More Texas
    { name: 'Pocket Aces Poker', venue_type: 'poker_club', city: 'Beaumont', state: 'TX', lat: 30.0857, lng: -94.1027, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Action Poker Club', venue_type: 'poker_club', city: 'Tyler', state: 'TX', lat: 32.3517, lng: -95.3017, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'High Roller Poker', venue_type: 'poker_club', city: 'Killeen', state: 'TX', lat: 31.1177, lng: -97.7277, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'River City Poker Club', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4247, lng: -98.4937, poker_tables: 16, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Bayou City Poker', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7607, lng: -95.3697, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Aces Poker Room', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2677, lng: -97.7437, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'The Chip Room', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7977, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Alamo Card Room', venue_type: 'poker_club', city: 'San Antonio', state: 'TX', lat: 29.4257, lng: -98.4897, poker_tables: 12, games_offered: ['NLH'] },

    // More Florida
    { name: 'Silks Poker Room', venue_type: 'card_room', city: 'Tampa', state: 'FL', lat: 28.0117, lng: -82.4537, poker_tables: 20, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Casino Miami Jai-Alai', venue_type: 'card_room', city: 'Miami', state: 'FL', lat: 25.7867, lng: -80.3157, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Dania Jai-Alai Casino', venue_type: 'card_room', city: 'Dania Beach', state: 'FL', lat: 26.0517, lng: -80.1437, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Fort Pierce Jai Alai & Poker', venue_type: 'card_room', city: 'Fort Pierce', state: 'FL', lat: 27.4387, lng: -80.3437, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Hamilton Jai Alai & Poker', venue_type: 'card_room', city: 'Jasper', state: 'FL', lat: 30.5197, lng: -82.9497, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Clubhouse Casino', venue_type: 'card_room', city: 'West Palm Beach', state: 'FL', lat: 26.7157, lng: -80.0637, poker_tables: 14, games_offered: ['NLH'] },

    // More Midwest
    { name: 'FireLake Grand Casino', venue_type: 'casino', city: 'Shawnee', state: 'OK', lat: 35.3277, lng: -96.9357, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Indigo Sky Casino', venue_type: 'casino', city: 'Wyandotte', state: 'OK', lat: 36.7667, lng: -94.6837, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Buffalo Run Casino', venue_type: 'casino', city: 'Miami', state: 'OK', lat: 36.8577, lng: -94.8737, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Seven Clans Casino', venue_type: 'casino', city: 'Red Rock', state: 'OK', lat: 35.9777, lng: -97.0937, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Grand Falls Casino', venue_type: 'casino', city: 'Larchwood', state: 'IA', lat: 43.4537, lng: -96.4577, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Wild Rose Casino', venue_type: 'casino', city: 'Clinton', state: 'IA', lat: 41.8437, lng: -90.1877, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Catfish Bend Casino', venue_type: 'casino', city: 'Burlington', state: 'IA', lat: 40.8087, lng: -91.1137, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Isle of Capri Waterloo', venue_type: 'casino', city: 'Waterloo', state: 'IA', lat: 42.4977, lng: -92.3427, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Par-A-Dice Casino', venue_type: 'casino', city: 'East Peoria', state: 'IL', lat: 40.6657, lng: -89.5797, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Argosy Casino Alton', venue_type: 'casino', city: 'Alton', state: 'IL', lat: 38.8897, lng: -90.1837, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Hollywood Casino Bangor', venue_type: 'casino', city: 'Bangor', state: 'ME', lat: 44.7997, lng: -68.7787, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Oxford Casino', venue_type: 'casino', city: 'Oxford', state: 'ME', lat: 44.1357, lng: -70.4937, poker_tables: 16, games_offered: ['NLH', 'PLO'], is_featured: true },

    // More Southeast
    { name: 'Lady Luck Casino Nemacolin', venue_type: 'casino', city: 'Farmington', state: 'PA', lat: 39.8177, lng: -79.5877, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Mt Airy Casino Resort', venue_type: 'casino', city: 'Mount Pocono', state: 'PA', lat: 41.1197, lng: -75.3517, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Mohegan Sun Pocono', venue_type: 'casino', city: 'Wilkes-Barre', state: 'PA', lat: 41.2577, lng: -75.8617, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Valley Forge Casino Resort', venue_type: 'casino', city: 'King of Prussia', state: 'PA', lat: 40.0877, lng: -75.3697, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Tioga Downs Casino Resort', venue_type: 'casino', city: 'Nichols', state: 'NY', lat: 42.0347, lng: -76.3467, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Empire City Casino', venue_type: 'casino', city: 'Yonkers', state: 'NY', lat: 40.9297, lng: -73.8597, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Finger Lakes Gaming & Racetrack', venue_type: 'casino', city: 'Farmington', state: 'NY', lat: 42.9847, lng: -77.3277, poker_tables: 8, games_offered: ['NLH'] },

    // More West
    { name: 'Arizona Charlies Boulder', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1367, lng: -115.0637, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Arizona Charlies Decatur', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1047, lng: -115.2017, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Poker Palace Casino', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2257, lng: -115.1247, poker_tables: 4, games_offered: ['NLH'] },
    { name: 'Silver Sevens Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1147, lng: -115.1557, poker_tables: 4, games_offered: ['NLH'] },
    { name: 'Bighorn Casino', venue_type: 'casino', city: 'North Las Vegas', state: 'NV', lat: 36.2197, lng: -115.1227, poker_tables: 4, games_offered: ['NLH'] },
    { name: 'Club Fortune Casino', venue_type: 'casino', city: 'Henderson', state: 'NV', lat: 36.0247, lng: -114.9967, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Oasis Resort Casino', venue_type: 'casino', city: 'Mesquite', state: 'NV', lat: 36.8057, lng: -114.0647, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Eureka Casino', venue_type: 'casino', city: 'Mesquite', state: 'NV', lat: 36.8017, lng: -114.0717, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'CasaBlanca Resort Casino', venue_type: 'casino', city: 'Mesquite', state: 'NV', lat: 36.8107, lng: -114.0617, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Virgin River Hotel Casino', venue_type: 'casino', city: 'Mesquite', state: 'NV', lat: 36.8087, lng: -114.0637, poker_tables: 6, games_offered: ['NLH'] },

    // Washington continued
    { name: 'Seven Cedars Casino', venue_type: 'casino', city: 'Sequim', state: 'WA', lat: 48.0797, lng: -123.1197, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Mill Bay Casino', venue_type: 'casino', city: 'Manson', state: 'WA', lat: 47.8867, lng: -120.1997, poker_tables: 6, games_offered: ['NLH'] },
    { name: '12 Tribes Colville Casino', venue_type: 'casino', city: 'Omak', state: 'WA', lat: 48.4087, lng: -119.5177, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Cowlitz Indian Tribe Casino', venue_type: 'casino', city: 'La Center', state: 'WA', lat: 45.8627, lng: -122.6677, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Quinault Beach Resort Casino', venue_type: 'casino', city: 'Ocean Shores', state: 'WA', lat: 46.9717, lng: -124.1617, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Little Creek Casino Resort', venue_type: 'casino', city: 'Shelton', state: 'WA', lat: 47.2167, lng: -122.9367, poker_tables: 10, games_offered: ['NLH'] },

    // Oregon continued
    { name: 'The Mill Casino', venue_type: 'casino', city: 'North Bend', state: 'OR', lat: 43.4267, lng: -124.2477, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Kah-Nee-Ta Resort', venue_type: 'casino', city: 'Warm Springs', state: 'OR', lat: 44.8427, lng: -121.1947, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'The Old Camp Casino', venue_type: 'casino', city: 'Burns', state: 'OR', lat: 43.5867, lng: -119.0567, poker_tables: 4, games_offered: ['NLH'] },

    // Montana
    { name: 'Glacier Peaks Casino', venue_type: 'casino', city: 'Browning', state: 'MT', lat: 48.5557, lng: -113.0127, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Northern Winz Casino', venue_type: 'casino', city: 'Great Falls', state: 'MT', lat: 47.5057, lng: -111.3007, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Gray Wolf Peak Casino', venue_type: 'casino', city: 'Missoula', state: 'MT', lat: 46.8717, lng: -114.0197, poker_tables: 8, games_offered: ['NLH'] },
    { name: '4 Bears Casino & Lodge', venue_type: 'casino', city: 'New Town', state: 'ND', lat: 47.9747, lng: -102.4787, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Spirit Lake Casino', venue_type: 'casino', city: 'St Michael', state: 'ND', lat: 47.9367, lng: -98.9527, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Sky Dancer Casino', venue_type: 'casino', city: 'Belcourt', state: 'ND', lat: 48.8427, lng: -99.7847, poker_tables: 4, games_offered: ['NLH'] },

    // Wyoming
    { name: 'Wind River Hotel & Casino', venue_type: 'casino', city: 'Riverton', state: 'WY', lat: 43.0447, lng: -108.3887, poker_tables: 6, games_offered: ['NLH'] },
    { name: '789 Casino', venue_type: 'casino', city: 'Riverton', state: 'WY', lat: 43.0287, lng: -108.3797, poker_tables: 4, games_offered: ['NLH'] },

    // Idaho  
    { name: 'Coeur d\'Alene Casino Resort', venue_type: 'casino', city: 'Worley', state: 'ID', lat: 47.4027, lng: -116.9217, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Clearwater River Casino', venue_type: 'casino', city: 'Lewiston', state: 'ID', lat: 46.3717, lng: -116.9907, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'It\'sé-Ye-Ye Casino', venue_type: 'casino', city: 'Kamiah', state: 'ID', lat: 46.2277, lng: -116.0287, poker_tables: 4, games_offered: ['NLH'] },

    // South Dakota continued
    { name: 'Royal River Casino & Hotel', venue_type: 'casino', city: 'Flandreau', state: 'SD', lat: 44.0497, lng: -96.5957, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Grand Falls Casino & Golf Resort', venue_type: 'casino', city: 'Larchwood', state: 'SD', lat: 43.4537, lng: -96.4577, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Dakota Sioux Casino', venue_type: 'casino', city: 'Watertown', state: 'SD', lat: 44.9057, lng: -97.1147, poker_tables: 6, games_offered: ['NLH'] },

    // Nebraska
    { name: 'Ohiya Casino & Resort', venue_type: 'casino', city: 'Niobrara', state: 'NE', lat: 42.7617, lng: -98.0347, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Native Star Casino', venue_type: 'casino', city: 'Winnebago', state: 'NE', lat: 42.2497, lng: -96.4677, poker_tables: 4, games_offered: ['NLH'] },

    // Kansas  
    { name: 'Boot Hill Casino & Resort', venue_type: 'casino', city: 'Dodge City', state: 'KS', lat: 37.7547, lng: -100.0147, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Kansas Star Casino', venue_type: 'casino', city: 'Mulvane', state: 'KS', lat: 37.4747, lng: -97.2517, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Sac & Fox Casino', venue_type: 'casino', city: 'Powhattan', state: 'KS', lat: 39.7677, lng: -95.6347, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Golden Eagle Casino', venue_type: 'casino', city: 'Horton', state: 'KS', lat: 39.6607, lng: -95.5277, poker_tables: 6, games_offered: ['NLH'] },

    // Missouri
    { name: 'Isle of Capri Boonville', venue_type: 'casino', city: 'Boonville', state: 'MO', lat: 38.9737, lng: -92.7427, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Mark Twain Casino', venue_type: 'casino', city: 'La Grange', state: 'MO', lat: 40.0467, lng: -91.5007, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'St Jo Frontier Casino', venue_type: 'casino', city: 'St Joseph', state: 'MO', lat: 39.7687, lng: -94.8467, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Isle of Capri Kansas City', venue_type: 'casino', city: 'Kansas City', state: 'MO', lat: 39.1167, lng: -94.5527, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'River City Casino', venue_type: 'casino', city: 'St Louis', state: 'MO', lat: 38.5217, lng: -90.2597, poker_tables: 18, games_offered: ['NLH', 'PLO'], is_featured: true },
];

async function main() {
    console.log(`\n=== Ultimate Final Expansion ===\n`);
    console.log(`📍 Adding ${VENUES.length} venues\n`);

    const BATCH_SIZE = 25;
    let inserted = 0;

    for (let i = 0; i < VENUES.length; i += BATCH_SIZE) {
        const batch = VENUES.slice(i, i + BATCH_SIZE);
        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(VENUES.length / BATCH_SIZE)}...`);

        try {
            const { error } = await supabase.from('poker_venues').upsert(batch, { onConflict: 'name,city,state' });
            if (error) console.error(`   ❌`, error.message);
            else { inserted += batch.length; console.log(`   ✅ Done`); }
            await new Promise(r => setTimeout(r, 150));
        } catch (e) { console.error(`   ❌`, e.message); }
    }

    const { count: venueCount } = await supabase.from('poker_venues').select('*', { count: 'exact', head: true });
    const { count: tournamentCount } = await supabase.from('tournament_series').select('*', { count: 'exact', head: true });

    console.log(`\n📊 FINAL DATABASE CENSUS:`);
    console.log(`   Venues: ${venueCount}`);
    console.log(`   Tournaments: ${tournamentCount}\n`);
}

main();
