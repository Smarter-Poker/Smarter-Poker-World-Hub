// Venue enrichment script for California poker rooms
// Run with: node scripts/california-enrichment.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const californiaVenues = [
    {
        name_pattern: '%Gardens%Casino%',
        alt_pattern: '%Hawaiian Gardens%',
        address: '11871 Carson Street, Hawaiian Gardens, CA 90716',
        phone: '(562) 860-5887',
        website: 'https://thegardenscasino.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Hustler%',
        address: '1000 West Redondo Beach Blvd, Gardena, CA 90247',
        phone: '(310) 719-9800',
        website: 'https://hustlercasino.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Graton%',
        address: '288 Golf Course Drive West, Rohnert Park, CA 94928',
        phone: '(707) 588-7100',
        website: 'https://gratonresortcasino.com/poker',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours',
        poker_tables: 20
    },
    {
        name_pattern: '%Morongo%',
        address: '49500 Seminole Drive, Cabazon, CA 92230',
        phone: '(951) 849-3080',
        website: 'https://morongocasinoresort.com/poker',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours',
        poker_tables: 31
    },
    {
        name_pattern: '%Pechanga%',
        address: '45000 Pechanga Pkwy, Temecula, CA 92592',
        phone: '(951) 770-8500',
        website: 'https://pechanga.com/poker',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Cache Creek%',
        address: '14455 State Hwy 16, Brooks, CA 95606',
        phone: '(530) 796-3118',
        website: 'https://cachecreek.com/casino/poker',
        hours_weekday: '10:00 AM - 2:00 AM',
        hours_weekend: '10:00 AM - 4:00 AM'
    },
    {
        name_pattern: '%Thunder Valley%',
        address: '1200 Athens Ave, Lincoln, CA 95648',
        phone: '(916) 408-7777',
        website: 'https://thundervalleyresort.com/poker',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Bay 101%',
        address: '1801 Bering Dr, San Jose, CA 95112',
        phone: '(408) 451-8888',
        website: 'https://bay101.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Lucky Chances%',
        address: '1700 Hillside Blvd, Colma, CA 94014',
        phone: '(650) 758-2237',
        website: 'https://luckychances.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Oaks Card Club%',
        address: '4097 San Pablo Ave, Emeryville, CA 94608',
        phone: '(510) 653-4456',
        website: 'https://oakscardclub.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Artichoke Joe%',
        address: '659 Huntington Ave, San Bruno, CA 94066',
        phone: '(650) 589-3145',
        website: 'https://artichokejoes.com',
        hours_weekday: '24 Hours',
        hours_weekend: '24 Hours'
    },
    {
        name_pattern: '%Livermore%',
        address: '1640 Railroad Ave, Livermore, CA 94550',
        phone: '(925) 447-1702',
        website: 'https://livermorecasino.net',
        hours_weekday: '9:00 AM - 2:00 AM',
        hours_weekend: '9:00 AM - 4:00 AM'
    }
];

async function enrichVenues() {
    console.log('Starting California venue enrichment...');
    let updated = 0;

    for (const venue of californiaVenues) {
        try {
            // Try primary pattern first
            let { data: matches, error: matchError } = await supabase
                .from('poker_venues')
                .select('id, name')
                .ilike('name', venue.name_pattern)
                .eq('state', 'CA');

            if (matchError) throw matchError;

            // Try alternate pattern if no matches
            if ((!matches || matches.length === 0) && venue.alt_pattern) {
                const altResult = await supabase
                    .from('poker_venues')
                    .select('id, name')
                    .ilike('name', venue.alt_pattern)
                    .eq('state', 'CA');
                matches = altResult.data;
            }

            if (matches && matches.length > 0) {
                for (const match of matches) {
                    const updateData = {
                        address: venue.address,
                        phone: venue.phone,
                        website: venue.website,
                        hours_weekday: venue.hours_weekday,
                        hours_weekend: venue.hours_weekend,
                        last_verified_at: new Date().toISOString()
                    };

                    if (venue.poker_tables) {
                        updateData.poker_tables = venue.poker_tables;
                    }

                    const { error: updateError } = await supabase
                        .from('poker_venues')
                        .update(updateData)
                        .eq('id', match.id);

                    if (updateError) {
                        console.error(`Error updating ${match.name}:`, updateError);
                    } else {
                        console.log(`✅ Updated: ${match.name}`);
                        updated++;
                    }
                }
            } else {
                console.log(`⚠️ No match found for pattern: ${venue.name_pattern}`);
            }
        } catch (err) {
            console.error(`Error processing ${venue.name_pattern}:`, err);
        }
    }

    // Get total enriched count
    const { count } = await supabase
        .from('poker_venues')
        .select('*', { count: 'exact', head: true })
        .not('last_verified_at', 'is', null);

    console.log(`\n✅ Updated ${updated} California venues`);
    console.log(`📊 Total enriched venues: ${count}`);
}

enrichVenues().catch(console.error);
