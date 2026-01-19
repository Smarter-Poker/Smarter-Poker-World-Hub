const fs = require('fs');

// Load the PokerAtlas JSON data
const data = JSON.parse(fs.readFileSync('/Users/smarter.poker/Downloads/US_Poker_Series_Master_PokerAtlas_Upcoming_asof_2026-01-18.json', 'utf8'));

// Supabase connection
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function seedSeries() {
    console.log(`Found ${data.length} tournament series to insert`);

    let inserted = 0;
    let errors = 0;

    for (const s of data) {
        const name = s.series_name;
        const shortName = name.includes('WSOP') ? 'WSOP' :
            name.includes('WPT') ? 'WPT' :
                name.includes('MSPT') ? 'MSPT' :
                    name.includes('RGPS') || name.toLowerCase().includes('rungood') ? 'RGPS' :
                        name.includes('DeepStack') ? 'DSE' :
                            name.substring(0, 8);
        const location = `${s.city}, ${s.state}`;
        const seriesType = name.toLowerCase().includes('circuit') || name.toLowerCase().includes('mspt') || name.toLowerCase().includes('rgps') ? 'circuit' :
            name.toLowerCase().includes('wsop') || name.toLowerCase().includes('wpt') || name.toLowerCase().includes('classic') ? 'major' : 'regional';
        const isFeatured = name.toLowerCase().includes('wsop') || name.toLowerCase().includes('wpt') || name.toLowerCase().includes('classic');

        const body = {
            name: name,
            short_name: shortName,
            location: location,
            start_date: s.start_date,
            end_date: s.end_date || s.start_date,
            total_events: s.event_count || null,
            series_type: seriesType,
            is_featured: isFeatured
        };

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/tournament_series`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                inserted++;
                console.log(`✓ Inserted: ${name}`);
            } else {
                const err = await response.text();
                if (err.includes('duplicate') || err.includes('conflict')) {
                    console.log(`- Skipped (exists): ${name}`);
                } else {
                    errors++;
                    console.log(`✗ Error: ${name} - ${err}`);
                }
            }
        } catch (e) {
            errors++;
            console.log(`✗ Network Error: ${name} - ${e.message}`);
        }
    }

    console.log(`\nDone! Inserted: ${inserted}, Errors: ${errors}, Total: ${data.length}`);

    // Check final count
    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/tournament_series?select=count`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'count=exact'
        }
    });
    console.log('Final count headers:', countRes.headers.get('content-range'));
}

seedSeries().catch(console.error);
