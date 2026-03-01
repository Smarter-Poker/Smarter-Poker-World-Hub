/**
 * Fix script: Link dealer staff ↔ member records + seed active sessions
 * 
 * 1. Links commander_staff (dealers) to their commander_members records
 *    by matching display_name to first_name + last_name
 * 2. Copies QR codes from members to staff records
 * 3. Creates active commander_table_sessions for tables that are in_use
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VENUE_ID = 1996;

async function fixDealerLinks() {
    console.log('=== Fixing Dealer Staff ↔ Member Links ===\n');

    // Get dealer staff with missing member_id or qr_code
    const { data: dealers } = await supabase
        .from('commander_staff')
        .select('id, display_name, qr_code, member_id, role')
        .eq('venue_id', VENUE_ID)
        .eq('role', 'dealer');

    // Get employee members
    const { data: members } = await supabase
        .from('commander_members')
        .select('id, first_name, last_name, qr_code, member_type')
        .eq('venue_id', VENUE_ID)
        .eq('member_type', 'employee');

    let fixed = 0;
    for (const dealer of dealers || []) {
        // Find matching member by name
        const match = (members || []).find(m => {
            const memberName = `${m.first_name} ${m.last_name}`.trim();
            return memberName.toLowerCase() === dealer.display_name.toLowerCase();
        });

        if (match) {
            const updates = {};
            if (!dealer.member_id) updates.member_id = match.id;
            if (!dealer.qr_code && match.qr_code) updates.qr_code = match.qr_code;

            if (Object.keys(updates).length > 0) {
                const { error } = await supabase
                    .from('commander_staff')
                    .update(updates)
                    .eq('id', dealer.id);
                if (error) {
                    console.error(`  ✗ Failed to update ${dealer.display_name}:`, error.message);
                } else {
                    console.log(`  ✓ Linked ${dealer.display_name}: member_id=${updates.member_id || 'existing'}, qr=${updates.qr_code || 'existing'}`);
                    fixed++;
                }
            } else {
                console.log(`  ○ ${dealer.display_name} already linked`);
            }
        } else {
            console.log(`  ? No member match for ${dealer.display_name}`);
        }
    }
    console.log(`\nFixed ${fixed} dealer records\n`);
}

async function seedActiveSessions() {
    console.log('=== Seeding Active Sessions for In-Use Tables ===\n');

    // Get tables that are in_use
    const { data: tables } = await supabase
        .from('commander_tables')
        .select('id, table_number, max_seats, status, game_type, stakes')
        .eq('venue_id', VENUE_ID)
        .eq('status', 'in_use');

    if (!tables || tables.length === 0) {
        console.log('No in_use tables found. Checking for available tables with tournament...');
        // Check tournament tables
        const { data: tournTables } = await supabase
            .from('commander_tables')
            .select('id, table_number, max_seats, status, tournament_id')
            .eq('venue_id', VENUE_ID)
            .not('tournament_id', 'is', null);
        console.log('Tournament tables:', tournTables?.length || 0);
    }

    // Get some player members for seating
    const { data: players } = await supabase
        .from('commander_members')
        .select('id, first_name, last_name, qr_code, membership_tier, member_number, member_type')
        .eq('venue_id', VENUE_ID)
        .eq('member_type', 'player')
        .eq('membership_status', 'active')
        .limit(30);

    if (!players || players.length === 0) {
        console.log('No active players found!');
        return;
    }

    console.log(`Found ${tables?.length || 0} in_use tables and ${players.length} active players\n`);

    // Check for existing active sessions
    const { data: existingSessions, count } = await supabase
        .from('commander_table_sessions')
        .select('id', { count: 'exact' })
        .eq('venue_id', VENUE_ID)
        .eq('status', 'active');

    if (count > 0) {
        console.log(`Already have ${count} active sessions — skipping seed\n`);
        return;
    }

    let playerIdx = 0;
    let totalSeeded = 0;

    for (const table of (tables || [])) {
        const maxSeats = table.max_seats || 9;
        const playersToSeat = Math.min(maxSeats - 2, 7); // Leave 2 seats open

        console.log(`Table ${table.table_number}: seating ${playersToSeat} players`);

        for (let seat = 1; seat <= playersToSeat && playerIdx < players.length; seat++) {
            const player = players[playerIdx++];
            const playerName = `${player.first_name} ${player.last_name}`.trim();

            const { error } = await supabase
                .from('commander_table_sessions')
                .insert({
                    venue_id: VENUE_ID,
                    member_id: player.id,
                    player_name: playerName,
                    table_number: table.table_number,
                    seat_number: seat,
                    time_allocated_minutes: 120,
                    time_added_minutes: 0,
                    membership_tier: player.membership_tier || 'daily',
                    member_number: player.member_number,
                    status: 'active',
                    started_at: new Date(Date.now() - Math.random() * 3600000).toISOString(), // started within last hour
                });

            if (error) {
                console.error(`  ✗ seat ${seat}: ${error.message}`);
            } else {
                console.log(`  ✓ seat ${seat}: ${playerName}`);
                totalSeeded++;
            }
        }
    }

    console.log(`\nSeeded ${totalSeeded} active sessions\n`);

    // Also create active games for these tables if none exist
    for (const table of (tables || [])) {
        const { data: existingGames } = await supabase
            .from('commander_games')
            .select('id')
            .eq('venue_id', VENUE_ID)
            .eq('table_number', table.table_number)
            .eq('status', 'active')
            .limit(1);

        if (!existingGames || existingGames.length === 0) {
            const { error } = await supabase
                .from('commander_games')
                .insert({
                    venue_id: VENUE_ID,
                    table_id: table.id,
                    table_number: table.table_number,
                    game_type: table.game_type || 'nlh',
                    stakes: table.stakes || '1/2',
                    status: 'active',
                    current_players: Math.min((table.max_seats || 9) - 2, 7),
                    max_players: table.max_seats || 9,
                    started_at: new Date(Date.now() - 3600000).toISOString(),
                    settings: {},
                });

            if (error) {
                // table_number column might not exist on commander_games
                if (error.message?.includes('table_number')) {
                    // Try without table_number
                    await supabase
                        .from('commander_games')
                        .insert({
                            venue_id: VENUE_ID,
                            table_id: table.id,
                            game_type: table.game_type || 'nlh',
                            stakes: table.stakes || '1/2',
                            status: 'active',
                            current_players: Math.min((table.max_seats || 9) - 2, 7),
                            max_players: table.max_seats || 9,
                            started_at: new Date(Date.now() - 3600000).toISOString(),
                            settings: {},
                        });
                }
                console.log(`  Game for Table ${table.table_number}: ${error.message}`);
            } else {
                console.log(`  ✓ Created active game for Table ${table.table_number}`);
            }
        }
    }
}

async function main() {
    await fixDealerLinks();
    await seedActiveSessions();
    console.log('=== Done ===');
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
