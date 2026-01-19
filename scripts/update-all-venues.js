/**
 * Comprehensive Venue Updater
 * Updates existing venues with lat/lng coordinates and missing data
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Comprehensive venue data with precise coordinates
const VENUE_COORDINATES = {
    'Bellagio': { lat: 36.1126, lng: -115.1767, address: '3600 S Las Vegas Blvd' },
    'Aria': { lat: 36.1069, lng: -115.1765, address: '3730 S Las Vegas Blvd' },
    'Wynn': { lat: 36.1277, lng: -115.1654, address: '3131 S Las Vegas Blvd' },
    'Venetian': { lat: 36.1212, lng: -115.1697, address: '3355 S Las Vegas Blvd' },
    'MGM Grand': { lat: 36.1024, lng: -115.1695, address: '3799 S Las Vegas Blvd' },
    'Caesars Palace': { lat: 36.1162, lng: -115.1745, address: '3570 S Las Vegas Blvd' },
    'Mirage': { lat: 36.1215, lng: -115.1741, address: '3400 S Las Vegas Blvd' },
    'Excalibur': { lat: 36.0988, lng: -115.1757, address: '3850 S Las Vegas Blvd' },
    'Flamingo': { lat: 36.1161, lng: -115.1706, address: '3555 S Las Vegas Blvd' },
    'Orleans': { lat: 36.1028, lng: -115.2086, address: '4500 W Tropicana Ave' },
    'Red Rock': { lat: 36.2055, lng: -115.4093, address: '11011 W Charleston Blvd' },
    'Commerce': { lat: 34.0098, lng: -118.1553, address: '6131 E Telegraph Rd' },
    'Bicycle': { lat: 33.9655, lng: -118.1553, address: '7301 Eastern Ave' },
    'Hustler': { lat: 33.8897, lng: -118.3090, address: '1000 W Redondo Beach Blvd' },
    'Bay 101': { lat: 37.3688, lng: -121.9178, address: '1801 Bering Dr' },
    'Thunder Valley': { lat: 38.8916, lng: -121.2897, address: '1200 Athens Ave' },
    'Pechanga': { lat: 33.4545, lng: -117.0534, address: '45000 Pechanga Pkwy' },
    'Morongo': { lat: 33.9321, lng: -116.6867, address: '49500 Seminole Dr' },
    'Seminole Hard Rock Hollywood': { lat: 26.0515, lng: -80.2098, address: '1 Seminole Way' },
    'Seminole Hard Rock Tampa': { lat: 27.9881, lng: -82.3885, address: '5223 Orient Rd' },
    'bestbet Jacksonville': { lat: 30.3077, lng: -81.7154, address: '1825 Cassat Ave' },
    'bestbet Orange Park': { lat: 30.1569, lng: -81.7241, address: '455 Park Ave' },
    'Borgata': { lat: 39.3784, lng: -74.4357, address: '1 Borgata Way' },
    'Tropicana Atlantic City': { lat: 39.3475, lng: -74.4110, address: '2831 Boardwalk' },
    'Parx': { lat: 40.1045, lng: -74.9595, address: '2999 Street Rd' },
    'Rivers Philadelphia': { lat: 40.0179, lng: -75.1324, address: '1001 N Delaware Ave' },
    'Maryland Live': { lat: 39.1567, lng: -76.7297, address: '7002 Arundel Mills Cir' },
    'MGM National Harbor': { lat: 38.7822, lng: -77.0174, address: '101 MGM National Ave' },
    'Horseshoe Baltimore': { lat: 39.2827, lng: -76.6195, address: '1525 Russell St' },
    'Lodge': { lat: 30.5089, lng: -97.6503, address: '2601 E Gattis School Rd' },
    'Texas Card House Houston': { lat: 29.9167, lng: -95.5797, address: '5959 W Sam Houston Pkwy N' },
    'Texas Card House Austin': { lat: 30.3483, lng: -97.7168, address: '2627 Exposition Blvd' },
    'Champions Club': { lat: 29.7357, lng: -95.5797, address: '11920 Westheimer Rd' },
    'Foxwoods': { lat: 41.4597, lng: -71.9756, address: '350 Trolley Line Blvd' },
    'Mohegan Sun': { lat: 41.4833, lng: -72.0939, address: '1 Mohegan Sun Blvd' },
    'FireKeepers': { lat: 42.2987, lng: -85.1797, address: '11177 Michigan Ave' },
    'Choctaw Durant': { lat: 33.9242, lng: -96.3897, address: '4216 US-69' },
    'Hard Rock Tulsa': { lat: 36.1897, lng: -95.7297, address: '777 W Cherokee St' },
    'WinStar': { lat: 33.8645, lng: -97.0539, address: '777 Casino Ave' },
    'Beau Rivage': { lat: 30.3897, lng: -88.8897, address: '875 Beach Blvd' },
    'Horseshoe Tunica': { lat: 34.8597, lng: -90.2897, address: '1021 Casino Center Dr' },
    'Hollywood Penn National': { lat: 40.3973, lng: -76.4281, address: '777 Hollywood Blvd' },
    'Resorts World Las Vegas': { lat: 36.1292, lng: -115.1553, address: '3000 S Las Vegas Blvd' },
    'Sahara': { lat: 36.1422, lng: -115.1576, address: '2535 S Las Vegas Blvd' },
    'Encore': { lat: 36.1290, lng: -115.1657, address: '3131 S Las Vegas Blvd' },
    'Palms': { lat: 36.1148, lng: -115.1769, address: '4321 W Flamingo Rd' },
};

// Additional venues to INSERT (new venues not already in DB)
const NEW_VENUES = [
    // More Nevada
    { name: 'South Point Casino', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.0147, lng: -115.1737, poker_tables: 22, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Station Casinos Boulder', venue_type: 'casino', city: 'Las Vegas', state: 'NV', lat: 36.1507, lng: -115.0797, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Green Valley Ranch', venue_type: 'casino', city: 'Henderson', state: 'NV', lat: 36.0337, lng: -115.0737, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Atlantis Casino Resort Spa', venue_type: 'casino', city: 'Reno', state: 'NV', lat: 39.4807, lng: -119.7737, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Peppermill Resort Spa Casino', venue_type: 'casino', city: 'Reno', state: 'NV', lat: 39.4987, lng: -119.7737, poker_tables: 10, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4'], is_featured: false },

    // More California
    { name: 'Graton Resort & Casino', venue_type: 'casino', city: 'Rohnert Park', state: 'CA', lat: 38.3537, lng: -122.6977, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4'], is_featured: true },
    { name: 'Cache Creek Casino', venue_type: 'casino', city: 'Brooks', state: 'CA', lat: 38.7737, lng: -122.1387, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Oaks Card Club', venue_type: 'card_room', city: 'Emeryville', state: 'CA', lat: 37.8387, lng: -122.2867, poker_tables: 30, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4'], is_featured: true },
    { name: 'Garden City Casino', venue_type: 'card_room', city: 'San Jose', state: 'CA', lat: 37.3437, lng: -121.8867, poker_tables: 25, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Lucky Chances Casino', venue_type: 'card_room', city: 'Colma', state: 'CA', lat: 37.6757, lng: -122.4527, poker_tables: 35, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4'], is_featured: true },
    { name: 'Artichoke Joes Casino', venue_type: 'card_room', city: 'San Bruno', state: 'CA', lat: 37.6287, lng: -122.4117, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Hawaiian Gardens Casino', venue_type: 'card_room', city: 'Hawaiian Gardens', state: 'CA', lat: 33.8287, lng: -118.0717, poker_tables: 45, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/4', '3/5'], is_featured: true },
    { name: 'Hollywood Park Casino', venue_type: 'card_room', city: 'Inglewood', state: 'CA', lat: 33.9507, lng: -118.3347, poker_tables: 30, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },
    { name: 'Stones Gambling Hall', venue_type: 'card_room', city: 'Citrus Heights', state: 'CA', lat: 38.6957, lng: -121.2887, poker_tables: 20, games_offered: ['NLH'], stakes_cash: ['1/2', '2/4'], is_featured: false },

    // More Texas (Poker Clubs)
    { name: 'Prime Social Poker Club', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7327, lng: -95.5287, poker_tables: 25, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Shuffle 214', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.8587, lng: -96.8287, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Poker House Dallas', venue_type: 'poker_club', city: 'Dallas', state: 'TX', lat: 32.7817, lng: -96.7917, poker_tables: 22, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: '101 Card Room', venue_type: 'poker_club', city: 'Houston', state: 'TX', lat: 29.7557, lng: -95.3917, poker_tables: 15, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Station Poker Club', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.2767, lng: -97.7327, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Legends Poker Room', venue_type: 'poker_club', city: 'Austin', state: 'TX', lat: 30.3137, lng: -97.7447, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },

    // More Florida
    { name: 'Seminole Casino Coconut Creek', venue_type: 'casino', city: 'Coconut Creek', state: 'FL', lat: 26.2877, lng: -80.1787, poker_tables: 35, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Isle Casino Racing Pompano Park', venue_type: 'casino', city: 'Pompano Beach', state: 'FL', lat: 26.2377, lng: -80.1247, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Gulfstream Park Racing & Casino', venue_type: 'casino', city: 'Hallandale Beach', state: 'FL', lat: 25.9827, lng: -80.1377, poker_tables: 15, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Derby Lane', venue_type: 'card_room', city: 'St. Petersburg', state: 'FL', lat: 27.7777, lng: -82.6617, poker_tables: 25, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Naples Fort Myers Greyhound Racing', venue_type: 'card_room', city: 'Bonita Springs', state: 'FL', lat: 26.3647, lng: -81.7967, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },

    // More Northeast
    { name: 'Turning Stone Resort Casino', venue_type: 'casino', city: 'Verona', state: 'NY', lat: 43.0737, lng: -75.6217, poker_tables: 32, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Rivers Casino & Resort', venue_type: 'casino', city: 'Schenectady', state: 'NY', lat: 42.8067, lng: -73.9407, poker_tables: 16, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'SugarHouse Casino', venue_type: 'casino', city: 'Philadelphia', state: 'PA', lat: 39.9657, lng: -75.1317, poker_tables: 28, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Wind Creek Bethlehem', venue_type: 'casino', city: 'Bethlehem', state: 'PA', lat: 40.6147, lng: -75.3747, poker_tables: 22, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },

    // More Midwest
    { name: 'Horseshoe Casino Indiana', venue_type: 'casino', city: 'Elizabeth', state: 'IN', lat: 38.1327, lng: -85.9577, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Hollywood Casino Aurora', venue_type: 'casino', city: 'Aurora', state: 'IL', lat: 41.7617, lng: -88.3167, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Rivers Casino Des Plaines', venue_type: 'casino', city: 'Des Plaines', state: 'IL', lat: 42.0377, lng: -87.8887, poker_tables: 24, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Jack Cleveland Casino', venue_type: 'casino', city: 'Cleveland', state: 'OH', lat: 41.4997, lng: -81.6907, poker_tables: 30, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Hollywood Casino Columbus', venue_type: 'casino', city: 'Columbus', state: 'OH', lat: 39.9747, lng: -83.0047, poker_tables: 18, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },

    // More Southeast
    { name: 'Cherokee Harrahs Cherokee', venue_type: 'casino', city: 'Cherokee', state: 'NC', lat: 35.4567, lng: -83.2977, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Harrah\'s Gulf Coast', venue_type: 'casino', city: 'Biloxi', state: 'MS', lat: 30.3917, lng: -88.9237, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Ameristar Casino Vicksburg', venue_type: 'casino', city: 'Vicksburg', state: 'MS', lat: 32.3117, lng: -90.8747, poker_tables: 8, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'L\'Auberge Casino Hotel Baton Rouge', venue_type: 'casino', city: 'Baton Rouge', state: 'LA', lat: 30.4587, lng: -91.1767, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Harrahs New Orleans', venue_type: 'casino', city: 'New Orleans', state: 'LA', lat: 29.9447, lng: -90.0637, poker_tables: 20, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },

    // More West Coast (Washington, Oregon)
    { name: 'Muckleshoot Casino', venue_type: 'casino', city: 'Auburn', state: 'WA', lat: 47.2747, lng: -122.2537, poker_tables: 30, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Tulalip Resort Casino', venue_type: 'casino', city: 'Tulalip', state: 'WA', lat: 48.0857, lng: -122.2017, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Spirit Mountain Casino', venue_type: 'casino', city: 'Grand Ronde', state: 'OR', lat: 45.0507, lng: -123.5287, poker_tables: 14, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Wildhorse Resort & Casino', venue_type: 'casino', city: 'Pendleton', state: 'OR', lat: 45.7067, lng: -118.6377, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },

    // More Southwest (Arizona, Colorado)
    { name: 'Talking Stick Resort', venue_type: 'casino', city: 'Scottsdale', state: 'AZ', lat: 33.5287, lng: -111.8867, poker_tables: 47, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], is_featured: true },
    { name: 'Fort McDowell Casino', venue_type: 'casino', city: 'Fountain Hills', state: 'AZ', lat: 33.6327, lng: -111.6677, poker_tables: 10, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
    { name: 'Monarch Casino Resort Spa', venue_type: 'casino', city: 'Black Hawk', state: 'CO', lat: 39.7967, lng: -105.4967, poker_tables: 18, games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], is_featured: true },
    { name: 'Ameristar Black Hawk', venue_type: 'casino', city: 'Black Hawk', state: 'CO', lat: 39.7977, lng: -105.4997, poker_tables: 12, games_offered: ['NLH'], stakes_cash: ['1/2', '2/5'], is_featured: false },
];

async function updateExistingVenues() {
    console.log('\n=== Updating Existing Venues with Coordinates ===\n');

    // Get all existing venues
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('*');

    if (error) {
        throw new Error(`Failed to fetch venues: ${error.message}`);
    }

    console.log(`📍 Found ${venues.length} existing venues`);

    let updated = 0;
    let skipped = 0;

    for (const venue of venues) {
        // Find matching coordinate data
        let matchedCoords = null;

        for (const [key, coords] of Object.entries(VENUE_COORDINATES)) {
            if (venue.name.toLowerCase().includes(key.toLowerCase())) {
                matchedCoords = coords;
                break;
            }
        }

        if (matchedCoords && (!venue.lat || !venue.lng)) {
            const { error: updateError } = await supabase
                .from('poker_venues')
                .update({
                    lat: matchedCoords.lat,
                    lng: matchedCoords.lng,
                    address: matchedCoords.address,
                    is_active: true
                })
                .eq('id', venue.id);

            if (updateError) {
                console.error(`   ❌ Error updating ${venue.name}:`, updateError.message);
            } else {
                console.log(`   ✅ Updated: ${venue.name}`);
                updated++;
            }
        } else {
            skipped++;
        }
    }

    console.log(`\n📊 Updated: ${updated}, Skipped: ${skipped}`);
    return updated;
}

async function insertNewVenues() {
    console.log('\n=== Inserting New Venues ===\n');

    const BATCH_SIZE = 10;
    let inserted = 0;

    for (let i = 0; i < NEW_VENUES.length; i += BATCH_SIZE) {
        const batch = NEW_VENUES.slice(i, i + BATCH_SIZE);

        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(NEW_VENUES.length / BATCH_SIZE)}:`);

        const { data, error } = await supabase
            .from('poker_venues')
            .upsert(batch, { onConflict: 'name,city,state' })
            .select();

        if (error) {
            console.error(`   ❌ Error:`, error.message);
        } else {
            batch.forEach(v => console.log(`   ✅ ${v.name} (${v.city}, ${v.state})`));
            inserted += batch.length;
        }

        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n📊 Inserted: ${inserted} new venues`);
    return inserted;
}

async function main() {
    try {
        await updateExistingVenues();
        await insertNewVenues();

        // Get final count
        const { count } = await supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        console.log(`\n=== FINAL CENSUS ===`);
        console.log(`📊 Total venues in database: ${count}\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Failed:', error);
        process.exit(1);
    }
}

main();
