/**
 * Seed commander_tables and commander_games for Club JAQK (venue_id: 1995)
 * 
 * This creates the operational tables and running games that the Floor Map
 * uses as the source of truth. Club pages then bridge data FROM commander.
 * 
 * Usage: node scripts/seed-commander-tables.js
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const VENUE_ID = 1995;

const TABLES = [
    { table_number: 1, table_name: 'Featured Table', max_seats: 9, status: 'in_use' },
    { table_number: 2, table_name: 'Table 2', max_seats: 9, status: 'in_use' },
    { table_number: 3, table_name: 'Table 3', max_seats: 9, status: 'in_use' },
    { table_number: 4, table_name: 'Table 4', max_seats: 9, status: 'in_use' },
    { table_number: 5, table_name: 'Table 5', max_seats: 9, status: 'in_use' },
    { table_number: 6, table_name: 'Table 6', max_seats: 9, status: 'available' },
    { table_number: 7, table_name: 'Table 7', max_seats: 9, status: 'available' },
    { table_number: 8, table_name: 'Table 8', max_seats: 9, status: 'available' },
    { table_number: 9, table_name: 'Table 9', max_seats: 6, status: 'reserved' },
    { table_number: 10, table_name: 'High-Stakes', max_seats: 9, status: 'available' },
];

const GAMES = [
    { table_number: 1, game_type: 'nlh', stakes: '$1/$2', max_players: 9, current_players: 8, status: 'running' },
    { table_number: 2, game_type: 'nlh', stakes: '$2/$5', max_players: 9, current_players: 7, status: 'running' },
    { table_number: 3, game_type: 'plo', stakes: '$1/$2', max_players: 9, current_players: 9, status: 'running' },
    { table_number: 4, game_type: 'nlh', stakes: '$5/$10', max_players: 9, current_players: 6, status: 'running' },
    { table_number: 5, game_type: 'plo', stakes: '$2/$5', max_players: 9, current_players: 5, status: 'running' },
];

async function seed() {
    console.log(`Seeding commander_tables for venue ${VENUE_ID}...`);

    // Clear existing data for this venue
    await supabase.from('commander_games').delete().eq('venue_id', VENUE_ID);
    await supabase.from('commander_tables').delete().eq('venue_id', VENUE_ID);

    // Insert tables
    const tablesToInsert = TABLES.map(t => ({
        venue_id: VENUE_ID,
        table_number: t.table_number,
        table_name: t.table_name,
        max_seats: t.max_seats,
        status: t.status,
    }));

    const { data: insertedTables, error: tablesErr } = await supabase
        .from('commander_tables')
        .insert(tablesToInsert)
        .select();

    if (tablesErr) {
        console.error('Failed to insert tables:', tablesErr);
        process.exit(1);
    }
    console.log(`✅ Inserted ${insertedTables.length} tables`);

    // Insert games on in-use tables
    const tableIdMap = {};
    insertedTables.forEach(t => { tableIdMap[t.table_number] = t.id; });

    const gamesToInsert = GAMES.map(g => ({
        venue_id: VENUE_ID,
        table_id: tableIdMap[g.table_number],
        game_type: g.game_type,
        stakes: g.stakes,
        max_players: g.max_players,
        current_players: g.current_players,
        status: g.status,
        started_at: new Date(Date.now() - Math.floor(Math.random() * 7200000)).toISOString(), // random 0-2hrs ago
    }));

    const { data: insertedGames, error: gamesErr } = await supabase
        .from('commander_games')
        .insert(gamesToInsert)
        .select();

    if (gamesErr) {
        console.error('Failed to insert games:', gamesErr);
        process.exit(1);
    }
    console.log(`✅ Inserted ${insertedGames.length} games`);

    // Verify
    const { data: verify } = await supabase
        .from('commander_tables')
        .select('table_number, table_name, status, max_seats')
        .eq('venue_id', VENUE_ID)
        .order('table_number');

    console.log('\n📋 Commander Tables:');
    verify?.forEach(t => console.log(`  Table ${t.table_number} (${t.table_name}) — ${t.status} — ${t.max_seats} seats`));

    const { data: verifyGames } = await supabase
        .from('commander_games')
        .select('game_type, stakes, status, current_players, max_players, table_id')
        .eq('venue_id', VENUE_ID);

    console.log('\n🎮 Commander Games:');
    verifyGames?.forEach(g => console.log(`  ${g.game_type} ${g.stakes} — ${g.status} (${g.current_players}/${g.max_players})`));

    console.log('\n✅ Seeding complete. Floor map should now show data.');
}

seed().catch(console.error);
