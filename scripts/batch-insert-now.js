/**
 * Batch Insert Script - Small Chunks
 * Inserts venues in batches of 5 to avoid timeouts
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VENUES = [
    // Batch 1: Nevada
    { name: 'Bellagio Poker Room', venue_type: 'casino', address: '3600 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', country: 'US', phone: '(702) 693-7111', website: 'https://bellagio.mgmresorts.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/3', '2/5', '5/10', '10/20'], poker_tables: 40, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1126, lng: -115.1767, is_featured: true, is_active: true },
    { name: 'Aria Resort & Casino', venue_type: 'casino', address: '3730 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', country: 'US', phone: '(702) 590-7111', website: 'https://aria.mgmresorts.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/3', '2/5', '5/10'], poker_tables: 24, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1069, lng: -115.1765, is_featured: true, is_active: true },
    { name: 'Wynn Las Vegas', venue_type: 'casino', address: '3131 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', country: 'US', phone: '(702) 770-7000', website: 'https://wynnlasvegas.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/3', '2/5', '5/10'], poker_tables: 27, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1277, lng: -115.1654, is_featured: true, is_active: true },
    { name: 'Venetian Las Vegas', venue_type: 'casino', address: '3355 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', country: 'US', phone: '(702) 414-1000', website: 'https://venetianlasvegas.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 50, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1212, lng: -115.1697, is_featured: true, is_active: true },
    { name: 'MGM Grand Poker Room', venue_type: 'casino', address: '3799 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', country: 'US', phone: '(702) 891-7777', website: 'https://mgmgrand.mgmresorts.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 23, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1024, lng: -115.1695, is_featured: true, is_active: true },

    // Batch 2: California
    { name: 'Commerce Casino', venue_type: 'card_room', address: '6131 E Telegraph Rd', city: 'Los Angeles', state: 'CA', country: 'US', phone: '(323) 721-2100', website: 'https://commercecasino.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/3', '3/5', '5/10'], poker_tables: 240, hours_weekday: '24/7', hours_weekend: '24/7', lat: 34.0098, lng: -118.1553, is_featured: true, is_active: true },
    { name: 'The Bicycle Casino', venue_type: 'card_room', address: '7301 Eastern Ave', city: 'Bell Gardens', state: 'CA', country: 'US', phone: '(562) 806-4646', website: 'https://thebike.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/3', '3/5'], poker_tables: 185, hours_weekday: '24/7', hours_weekend: '24/7', lat: 33.9655, lng: -118.1553, is_featured: true, is_active: true },
    { name: 'Hustler Casino', venue_type: 'card_room', address: '1000 W Redondo Beach Blvd', city: 'Gardena', state: 'CA', country: 'US', phone: '(310) 719-9800', website: 'https://hustlercasinolive.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/3', '2/5', '5/10'], poker_tables: 50, hours_weekday: '24/7', hours_weekend: '24/7', lat: 33.8897, lng: -118.3090, is_featured: true, is_active: true },
    { name: 'Bay 101 Casino', venue_type: 'card_room', address: '1801 Bering Dr', city: 'San Jose', state: 'CA', country: 'US', phone: '(408) 451-8888', website: 'https://bay101.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/3', '3/5'], poker_tables: 50, hours_weekday: '24/7', hours_weekend: '24/7', lat: 37.3688, lng: -121.9178, is_featured: true, is_active: true },
    { name: 'Thunder Valley Casino', venue_type: 'casino', address: '1200 Athens Ave', city: 'Lincoln', state: 'CA', country: 'US', phone: '(916) 408-7777', website: 'https://thundervalleyresort.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 20, hours_weekday: '24/7', hours_weekend: '24/7', lat: 38.8916, lng: -121.2897, is_featured: false, is_active: true },

    // Batch 3: Florida + NJ
    { name: 'Seminole Hard Rock Hollywood', venue_type: 'casino', address: '1 Seminole Way', city: 'Hollywood', state: 'FL', country: 'US', phone: '(866) 502-7529', website: 'https://seminolehardrockhollywood.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 45, hours_weekday: '24/7', hours_weekend: '24/7', lat: 26.0515, lng: -80.2098, is_featured: true, is_active: true },
    { name: 'Seminole Hard Rock Tampa', venue_type: 'casino', address: '5223 Orient Rd', city: 'Tampa', state: 'FL', country: 'US', phone: '(813) 627-7625', website: 'https://seminolehardrocktampa.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 46, hours_weekday: '24/7', hours_weekend: '24/7', lat: 27.9881, lng: -82.3885, is_featured: true, is_active: true },
    { name: 'bestbet Jacksonville', venue_type: 'card_room', address: '1825 Cassat Ave', city: 'Jacksonville', state: 'FL', country: 'US', phone: '(904) 646-0002', website: 'https://bestbetjax.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 70, hours_weekday: '24/7', hours_weekend: '24/7', lat: 30.3077, lng: -81.7154, is_featured: true, is_active: true },
    { name: 'TGT Poker & Racebook', venue_type: 'card_room', address: '5010 W Hillsborough Ave', city: 'Tampa', state: 'FL', country: 'US', phone: '(813) 932-4313', website: 'https://tgtpoker.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 30, hours_weekday: '24/7', hours_weekend: '24/7', lat: 27.9881, lng: -82.5026, is_featured: false, is_active: true },
    { name: 'Borgata Hotel Casino & Spa', venue_type: 'casino', address: '1 Borgata Way', city: 'Atlantic City', state: 'NJ', country: 'US', phone: '(609) 317-1000', website: 'https://theborgata.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 85, hours_weekday: '24/7', hours_weekend: '24/7', lat: 39.3784, lng: -74.4357, is_featured: true, is_active: true },

    // Batch 4: PA + MD
    { name: 'Harrahs Pompano Beach', venue_type: 'casino', address: '777 Harrahs Rincon Way', city: 'Pompano Beach', state: 'FL', country: 'US', phone: '(954) 946-5000', website: 'https://harrahspompano.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 20, hours_weekday: '24/7', hours_weekend: '24/7', lat: 26.2379, lng: -80.1248, is_featured: false, is_active: true },
    { name: 'Parx Casino', venue_type: 'casino', address: '2999 Street Rd', city: 'Bensalem', state: 'PA', country: 'US', phone: '(215) 639-9000', website: 'https://parxcasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 80, hours_weekday: '24/7', hours_weekend: '24/7', lat: 40.1045, lng: -74.9595, is_featured: true, is_active: true },
    { name: 'Live! Casino Philadelphia', venue_type: 'casino', address: '900 Packer Ave', city: 'Philadelphia', state: 'PA', country: 'US', phone: '(215) 297-0200', website: 'https://livecasinophiladelphia.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 28, hours_weekday: '24/7', hours_weekend: '24/7', lat: 39.9075, lng: -75.1536, is_featured: false, is_active: true },
    { name: 'Maryland Live! Casino at Arundel Mills', venue_type: 'casino', address: '7002 Arundel Mills Cir', city: 'Hanover', state: 'MD', country: 'US', phone: '(443) 842-7000', website: 'https://marylandlivecasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 52, hours_weekday: '24/7', hours_weekend: '24/7', lat: 39.1567, lng: -76.7297, is_featured: true, is_active: true },
    { name: 'MGM National Harbor', venue_type: 'casino', address: '101 MGM National Ave', city: 'Oxon Hill', state: 'MD', country: 'US', phone: '(844) 646-6847', website: 'https://mgmnationalharbor.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/3', '2/5', '5/10'], poker_tables: 27, hours_weekday: '24/7', hours_weekend: '24/7', lat: 38.7822, lng: -77.0174, is_featured: false, is_active: true },

    // Batch 5: Texas
    { name: 'Lodge Card Club Austin', venue_type: 'poker_club', address: '2601 E Gattis School Rd', city: 'Round Rock', state: 'TX', country: 'US', phone: '(512) 717-7529', website: 'https://thelodgepokerclub.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 30, hours_weekday: '24/7', hours_weekend: '24/7', lat: 30.5089, lng: -97.6503, is_featured: true, is_active: true },
    { name: 'Texas Card House Houston', venue_type: 'poker_club', address: '5959 W Sam Houston Pkwy N', city: 'Houston', state: 'TX', country: 'US', phone: '(832) 742-3335', website: 'https://texascardhouse.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 50, hours_weekday: '24/7', hours_weekend: '24/7', lat: 29.9167, lng: -95.5797, is_featured: true, is_active: true },
    { name: 'Champions Club', venue_type: 'poker_club', address: '11920 Westheimer Rd', city: 'Houston', state: 'TX', country: 'US', phone: '(281) 759-5626', website: 'https://championsclubpoker.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 25, hours_weekday: '24/7', hours_weekend: '24/7', lat: 29.7357, lng: -95.5797, is_featured: false, is_active: true },

    // Batch 6: CT + Others
    { name: 'Foxwoods Resort Casino', venue_type: 'casino', address: '350 Trolley Line Blvd', city: 'Mashantucket', state: 'CT', country: 'US', phone: '(800) 369-9663', website: 'https://foxwoods.com', games_offered: ['NLH', 'PLO', 'Mixed'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 114, hours_weekday: '24/7', hours_weekend: '24/7', lat: 41.4597, lng: -71.9756, is_featured: true, is_active: true },
    { name: 'Mohegan Sun', venue_type: 'casino', address: '1 Mohegan Sun Blvd', city: 'Uncasville', state: 'CT', country: 'US', phone: '(888) 226-7711', website: 'https://mohegansun.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5', '5/10'], poker_tables: 42, hours_weekday: '24/7', hours_weekend: '24/7', lat: 41.4833, lng: -72.0939, is_featured: true, is_active: true },
    { name: 'FireKeepers Casino', venue_type: 'casino', address: '11177 Michigan Ave', city: 'Battle Creek', state: 'MI', country: 'US', phone: '(877) 352-8777', website: 'https://firekeeperscasino.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 14, hours_weekday: '24/7', hours_weekend: '24/7', lat: 42.2987, lng: -85.1797, is_featured: false, is_active: true },
    { name: 'Choctaw Casino Durant', venue_type: 'casino', address: '4216 US-69', city: 'Durant', state: 'OK', country: 'US', phone: '(580) 920-0160', website: 'https://choctawcasinos.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 30, hours_weekday: '24/7', hours_weekend: '24/7', lat: 33.9242, lng: -96.3897, is_featured: false, is_active: true },
    { name: 'Hard Rock Tulsa', venue_type: 'casino', address: '777 W Cherokee St', city: 'Catoosa', state: 'OK', country: 'US', phone: '(918) 384-7625', website: 'https://hardrockcasinotulsa.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 20, hours_weekday: '24/7', hours_weekend: '24/7', lat: 36.1897, lng: -95.7297, is_featured: false, is_active: true },
    { name: 'Beau Rivage Resort & Casino', venue_type: 'casino', address: '875 Beach Blvd', city: 'Biloxi', state: 'MS', country: 'US', phone: '(228) 386-7111', website: 'https://beaurivage.mgmresorts.com', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 18, hours_weekday: '24/7', hours_weekend: '24/7', lat: 30.3897, lng: -88.8897, is_featured: false, is_active: true },
    { name: 'Horseshoe Casino Tunica', venue_type: 'casino', address: '1021 Casino Center Dr', city: 'Robinsonville', state: 'MS', country: 'US', phone: '(800) 303-7463', website: 'https://caesars.com/horseshoe-tunica', games_offered: ['NLH', 'PLO'], stakes_cash: ['1/2', '2/5'], poker_tables: 15, hours_weekday: '24/7', hours_weekend: '24/7', lat: 34.8597, lng: -90.2897, is_featured: false, is_active: true },
];

async function insertInBatches() {
    const BATCH_SIZE = 3; // Very small batches
    const DELAY_MS = 2000; // 2 second delay between batches

    let totalInserted = 0;
    let totalErrors = 0;

    console.log(`\n=== Batch Insert Started ===`);
    console.log(`Total venues: ${VENUES.length}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`Delay: ${DELAY_MS}ms\n`);

    for (let i = 0; i < VENUES.length; i += BATCH_SIZE) {
        const batch = VENUES.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(VENUES.length / BATCH_SIZE);

        console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} venues):`);

        try {
            const { data, error } = await supabase
                .from('poker_venues')
                .upsert(batch, {
                    onConflict: 'name,city,state',
                    ignoreDuplicates: false
                })
                .select();

            if (error) {
                console.error(`   ❌ Error:`, error.message);
                totalErrors += batch.length;
            } else {
                batch.forEach(v => console.log(`   ✅ ${v.name}`));
                totalInserted += batch.length;
            }

            // Delay between batches
            if (i + BATCH_SIZE < VENUES.length) {
                console.log(`   ⏳ Waiting ${DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }

        } catch (error) {
            console.error(`   ❌ Exception:`, error.message);
            totalErrors += batch.length;
        }
    }

    console.log(`\n=== Batch Insert Complete ===`);
    console.log(`✅ Inserted: ${totalInserted}`);
    console.log(`❌ Errors: ${totalErrors}`);

    // Verify
    const { count } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Total venues in database: ${count}`);
}

insertInBatches().catch(console.error);
