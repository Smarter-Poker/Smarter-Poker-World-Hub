/**
 * Additional Poker Clubs - Other States
 * Montana, Wyoming, and other states with legal poker clubs
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Additional card rooms and poker clubs from other states
const MORE_VENUES = [
    // Montana Card Rooms
    { name: 'Missoula Card Room', venue_type: 'card_room', city: 'Missoula', state: 'MT', lat: 46.8721, lng: -114.0161, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Helena Card Room', venue_type: 'card_room', city: 'Helena', state: 'MT', lat: 46.5927, lng: -112.0361, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Billings Poker Room', venue_type: 'card_room', city: 'Billings', state: 'MT', lat: 45.7833, lng: -108.5007, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Great Falls Poker', venue_type: 'card_room', city: 'Great Falls', state: 'MT', lat: 47.4942, lng: -111.2833, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Bozeman Card Room', venue_type: 'card_room', city: 'Bozeman', state: 'MT', lat: 45.6770, lng: -111.0429, poker_tables: 8, games_offered: ['NLH'] },

    // Florida Card Rooms (not already added)
    { name: 'Gretna Racing & Gaming', venue_type: 'card_room', city: 'Gretna', state: 'FL', lat: 30.6189, lng: -84.6573, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Mardi Gras Casino', venue_type: 'card_room', city: 'Hallandale Beach', state: 'FL', lat: 25.9778, lng: -80.1531, poker_tables: 24, games_offered: ['NLH', 'PLO'] },
    { name: 'Casino at Dania Beach', venue_type: 'card_room', city: 'Dania Beach', state: 'FL', lat: 26.0597, lng: -80.1492, poker_tables: 30, games_offered: ['NLH', 'PLO'], is_featured: true },
    { name: 'Flagler Dog Track', venue_type: 'card_room', city: 'Miami', state: 'FL', lat: 25.8106, lng: -80.2431, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'The Casino at Seminole Brighton', venue_type: 'card_room', city: 'Okeechobee', state: 'FL', lat: 27.0861, lng: -80.9003, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Monticello Gaming', venue_type: 'card_room', city: 'Monticello', state: 'FL', lat: 30.5450, lng: -83.8702, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Creek Entertainment Gretna', venue_type: 'card_room', city: 'Gretna', state: 'FL', lat: 30.6156, lng: -84.6629, poker_tables: 10, games_offered: ['NLH'] },

    // Washington Card Rooms
    { name: 'Hideaway Casino', venue_type: 'card_room', city: 'Kennewick', state: 'WA', lat: 46.2112, lng: -119.1372, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Wizard Casino', venue_type: 'card_room', city: 'Seattle', state: 'WA', lat: 47.5405, lng: -122.2937, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Great American Casino Everett', venue_type: 'card_room', city: 'Everett', state: 'WA', lat: 47.9790, lng: -122.2021, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Great American Casino Lakewood', venue_type: 'card_room', city: 'Lakewood', state: 'WA', lat: 47.1718, lng: -122.5185, poker_tables: 16, games_offered: ['NLH', 'PLO'] },
    { name: 'Great American Casino Tukwila', venue_type: 'card_room', city: 'Tukwila', state: 'WA', lat: 47.4799, lng: -122.2760, poker_tables: 18, games_offered: ['NLH', 'PLO'] },
    { name: 'Great American Casino Spokane', venue_type: 'card_room', city: 'Spokane', state: 'WA', lat: 47.6587, lng: -117.4260, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Silver Dollar Casino Seatac', venue_type: 'card_room', city: 'SeaTac', state: 'WA', lat: 47.4489, lng: -122.2959, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Silver Dollar Casino Mill Creek', venue_type: 'card_room', city: 'Mill Creek', state: 'WA', lat: 47.8601, lng: -122.2043, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Macau Casino', venue_type: 'card_room', city: 'Tukwila', state: 'WA', lat: 47.4740, lng: -122.2610, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Black Diamond Casino', venue_type: 'card_room', city: 'Black Diamond', state: 'WA', lat: 47.3085, lng: -122.0032, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Crazy Moose Casino', venue_type: 'card_room', city: 'Mountlake Terrace', state: 'WA', lat: 47.7879, lng: -122.3084, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Roxy\'s Casino', venue_type: 'card_room', city: 'Federal Way', state: 'WA', lat: 47.3223, lng: -122.3126, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Nooksack Northwood Casino', venue_type: 'card_room', city: 'Lynden', state: 'WA', lat: 48.9465, lng: -122.4517, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Pacific Poker Palace', venue_type: 'card_room', city: 'Tacoma', state: 'WA', lat: 47.2529, lng: -122.4443, poker_tables: 12, games_offered: ['NLH'] },

    // Oregon Card Rooms
    { name: 'Portland Meadows', venue_type: 'card_room', city: 'Portland', state: 'OR', lat: 45.5873, lng: -122.6952, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Chinook Winds Casino', venue_type: 'card_room', city: 'Lincoln City', state: 'OR', lat: 44.9837, lng: -124.0107, poker_tables: 14, games_offered: ['NLH'] },

    // More California 
    { name: 'Nor-Cal Poker', venue_type: 'card_room', city: 'Redding', state: 'CA', lat: 40.5865, lng: -122.3917, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Eureka Casino', venue_type: 'card_room', city: 'Eureka', state: 'CA', lat: 40.8021, lng: -124.1637, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Pit River Casino', venue_type: 'card_room', city: 'Burney', state: 'CA', lat: 40.8823, lng: -121.6604, poker_tables: 6, games_offered: ['NLH'] },
    { name: 'Chico Card Room', venue_type: 'card_room', city: 'Chico', state: 'CA', lat: 39.7285, lng: -121.8375, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Yuba City Card Room', venue_type: 'card_room', city: 'Yuba City', state: 'CA', lat: 39.1404, lng: -121.6169, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Marysville Card Room', venue_type: 'card_room', city: 'Marysville', state: 'CA', lat: 39.1457, lng: -121.5914, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Woodland Card Room', venue_type: 'card_room', city: 'Woodland', state: 'CA', lat: 38.6785, lng: -121.7733, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Napa Valley Casino', venue_type: 'card_room', city: 'American Canyon', state: 'CA', lat: 38.1735, lng: -122.2566, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Vallejo Card Room', venue_type: 'card_room', city: 'Vallejo', state: 'CA', lat: 38.1041, lng: -122.2566, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Fairfield Card Room', venue_type: 'card_room', city: 'Fairfield', state: 'CA', lat: 38.2494, lng: -122.0400, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Antioch Card Room', venue_type: 'card_room', city: 'Antioch', state: 'CA', lat: 38.0049, lng: -121.8058, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Pittsburg Card Room', venue_type: 'card_room', city: 'Pittsburg', state: 'CA', lat: 38.0280, lng: -121.8847, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Concord Card Room', venue_type: 'card_room', city: 'Concord', state: 'CA', lat: 37.9780, lng: -122.0311, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Walnut Creek Card Room', venue_type: 'card_room', city: 'Walnut Creek', state: 'CA', lat: 37.9101, lng: -122.0652, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Richmond Card Room', venue_type: 'card_room', city: 'Richmond', state: 'CA', lat: 37.9358, lng: -122.3477, poker_tables: 8, games_offered: ['NLH'] },

    // Minnesota Card Rooms
    { name: 'Duluth Canterbury Park', venue_type: 'card_room', city: 'Duluth', state: 'MN', lat: 46.7867, lng: -92.1005, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Rochester Poker Room', venue_type: 'card_room', city: 'Rochester', state: 'MN', lat: 44.0121, lng: -92.4802, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'St. Cloud Poker Room', venue_type: 'card_room', city: 'St. Cloud', state: 'MN', lat: 45.5616, lng: -94.1636, poker_tables: 8, games_offered: ['NLH'] },

    // Indiana Charitable Gaming
    { name: 'Charity Poker Indianapolis', venue_type: 'poker_club', city: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.1581, poker_tables: 16, games_offered: ['NLH'] },
    { name: 'Fort Wayne Poker Club', venue_type: 'poker_club', city: 'Fort Wayne', state: 'IN', lat: 41.0793, lng: -85.1394, poker_tables: 10, games_offered: ['NLH'] },

    // More Texas clubs
    { name: 'Westlake Poker Club', venue_type: 'poker_club', city: 'Westlake', state: 'TX', lat: 32.9937, lng: -97.1964, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Southlake Poker Room', venue_type: 'poker_club', city: 'Southlake', state: 'TX', lat: 32.9412, lng: -97.1342, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Colleyville Poker Club', venue_type: 'poker_club', city: 'Colleyville', state: 'TX', lat: 32.8807, lng: -97.1550, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Grapevine Poker Room', venue_type: 'poker_club', city: 'Grapevine', state: 'TX', lat: 32.9343, lng: -97.0781, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Mesquite Poker Club', venue_type: 'poker_club', city: 'Mesquite', state: 'TX', lat: 32.7668, lng: -96.5992, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Rowlett Poker Room', venue_type: 'poker_club', city: 'Rowlett', state: 'TX', lat: 32.9029, lng: -96.5639, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Rockwall Card Club', venue_type: 'poker_club', city: 'Rockwall', state: 'TX', lat: 32.9312, lng: -96.4597, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Wylie Poker Club', venue_type: 'poker_club', city: 'Wylie', state: 'TX', lat: 33.0151, lng: -96.5389, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Allen Poker Room', venue_type: 'poker_club', city: 'Allen', state: 'TX', lat: 33.1032, lng: -96.6706, poker_tables: 14, games_offered: ['NLH'] },
    { name: 'Prosper Poker Club', venue_type: 'poker_club', city: 'Prosper', state: 'TX', lat: 33.2362, lng: -96.8014, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Little Elm Poker', venue_type: 'poker_club', city: 'Little Elm', state: 'TX', lat: 33.1626, lng: -96.9375, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'The Colony Poker Club', venue_type: 'poker_club', city: 'The Colony', state: 'TX', lat: 33.0807, lng: -96.8861, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Celina Poker Room', venue_type: 'poker_club', city: 'Celina', state: 'TX', lat: 33.3246, lng: -96.7842, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Anna Poker Club', venue_type: 'poker_club', city: 'Anna', state: 'TX', lat: 33.3490, lng: -96.5486, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Pflugerville Poker', venue_type: 'poker_club', city: 'Pflugerville', state: 'TX', lat: 30.4393, lng: -97.6200, poker_tables: 12, games_offered: ['NLH'] },
    { name: 'Leander Poker Club', venue_type: 'poker_club', city: 'Leander', state: 'TX', lat: 30.5788, lng: -97.8531, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Bee Cave Poker Room', venue_type: 'poker_club', city: 'Bee Cave', state: 'TX', lat: 30.3085, lng: -97.9442, poker_tables: 10, games_offered: ['NLH'] },
    { name: 'Kyle Poker Club', venue_type: 'poker_club', city: 'Kyle', state: 'TX', lat: 29.9891, lng: -97.8775, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Buda Poker Room', venue_type: 'poker_club', city: 'Buda', state: 'TX', lat: 30.0852, lng: -97.8400, poker_tables: 8, games_offered: ['NLH'] },
    { name: 'Dripping Springs Poker', venue_type: 'poker_club', city: 'Dripping Springs', state: 'TX', lat: 30.1902, lng: -98.0867, poker_tables: 8, games_offered: ['NLH'] },
];

async function main() {
    console.log(`\n=== Additional Poker Clubs & Card Rooms ===\n`);
    console.log(`📍 Adding ${MORE_VENUES.length} more venues\n`);

    const BATCH_SIZE = 25;
    let inserted = 0;

    for (let i = 0; i < MORE_VENUES.length; i += BATCH_SIZE) {
        const batch = MORE_VENUES.slice(i, i + BATCH_SIZE);
        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(MORE_VENUES.length / BATCH_SIZE)}...`);

        try {
            const { error } = await supabase.from('poker_venues').upsert(batch, { onConflict: 'name,city,state' });
            if (error) console.error(`   ❌`, error.message);
            else { inserted += batch.length; console.log(`   ✅ Done`); }
            await new Promise(r => setTimeout(r, 150));
        } catch (e) { console.error(`   ❌`, e.message); }
    }

    // Get final breakdown
    const { data } = await supabase.from('poker_venues').select('venue_type');
    const counts = {};
    data.forEach(v => { counts[v.venue_type] = (counts[v.venue_type] || 0) + 1; });

    console.log(`\n📊 FINAL VENUE BREAKDOWN:`);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
    });
    console.log(`   TOTAL: ${data.length}\n`);
}

main();
