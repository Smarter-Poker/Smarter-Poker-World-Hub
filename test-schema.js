const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createTables() {
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', 'johndonnahue4485@yahoo.com').single();
    const { data: venue } = await supabase.from('poker_venues').select('id').eq('claimed_by', profile.id).single();
    console.log('Venue ID:', venue.id);

    // Check existing tables in commander_tables
    const { data: existing } = await supabase.from('commander_tables').select('*').eq('venue_id', venue.id);
    console.log('Existing commander_tables:', existing?.length ?? 0);
    if (existing && existing.length > 0) {
        console.log('Tables:', existing.map(t => `#${t.table_number} ${t.table_name} (${t.status})`).join(', '));
        return;
    }

    // Create 3 tables
    for (let i = 1; i <= 3; i++) {
        const { data, error } = await supabase.from('commander_tables').insert({
            venue_id: venue.id,
            table_number: i,
            table_name: `Table ${i}`,
            max_seats: 9,
            status: 'available'
        }).select().single();
        if (error) console.error(`Error creating Table ${i}:`, error.message);
        else console.log(`✅ Created Table ${i} (id: ${data.id})`);
    }
}
createTables();
