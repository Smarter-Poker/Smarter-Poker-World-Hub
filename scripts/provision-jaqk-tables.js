require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function provision() {
    const venueId = 1996;

    const { data: existing } = await supabase
        .from('commander_tables')
        .select('table_number')
        .eq('venue_id', venueId);

    const existingNumbers = new Set((existing || []).map(t => t.table_number));
    console.log('Existing table numbers:', [...existingNumbers].sort((a, b) => a - b));

    const toInsert = [];
    for (let i = 1; i <= 20; i++) {
        if (!existingNumbers.has(i)) {
            toInsert.push({
                venue_id: venueId,
                table_number: i,
                table_name: `Table ${i}`,
                max_seats: 9,
                status: 'available',
            });
        }
    }

    if (toInsert.length > 0) {
        const { error } = await supabase.from('commander_tables').insert(toInsert);
        if (error) {
            console.error('Insert error:', error.message);
        } else {
            console.log(`Created ${toInsert.length} new tables:`, toInsert.map(t => t.table_number));
        }
    } else {
        console.log('All 20 tables already exist!');
    }

    // Verify
    const { data: all } = await supabase
        .from('commander_tables')
        .select('table_number')
        .eq('venue_id', venueId)
        .order('table_number');
    console.log(`Total tables now: ${all?.length}`, all?.map(t => t.table_number));
}

provision().catch(console.error);
