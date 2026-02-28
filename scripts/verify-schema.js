const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

(async () => {
    // Test actual announcements table names
    const tables = ['commander_announcements', 'commander_venue_announcements', 'commander_display_announcements', 'commander_club_announcements'];
    console.log('=== ANNOUNCEMENTS TABLE CHECK ===');
    for (const t of tables) {
        const { data, error } = await sb.from(t).select('id').limit(1);
        console.log(error ? '  [X] ' + t + ': ' + error.message.substring(0, 50) : '  [OK] ' + t + ': found');
    }

    // Test commander_staff columns
    console.log('\n=== COMMANDER_STAFF COLUMNS ===');
    const staffTests = [
        'id, display_name, role',
        'id, name',
        'id, display_name, name',
        'id, pin, venue_id',
    ];
    for (const sel of staffTests) {
        const { data, error } = await sb.from('commander_staff').select(sel).limit(1);
        console.log(error ? '  [X] ' + sel + ': ' + error.message.substring(0, 50) : '  [OK] ' + sel);
    }

    // Test commander_table_displays
    console.log('\n=== DISPLAY TABLES ===');
    for (const t of ['commander_table_displays', 'commander_display_devices']) {
        const { data, error } = await sb.from(t).select('id').limit(1);
        console.log(error ? '  [X] ' + t + ': ' + error.message.substring(0, 60) : '  [OK] ' + t);
    }

    // Test incidents FK
    console.log('\n=== INCIDENTS FK TESTS ===');
    const { error: e1 } = await sb.from('commander_incidents')
        .select('id, reported_by_staff:commander_staff!reported_by (id, display_name, role)').limit(1);
    console.log(e1 ? '  [X] staff!reported_by: ' + e1.message.substring(0, 80) : '  [OK] staff!reported_by');

    const { error: e2 } = await sb.from('commander_incidents')
        .select('id, reported_by, resolved_by, player_id').limit(1);
    console.log(e2 ? '  [X] raw cols: ' + e2.message : '  [OK] raw cols');

    // Test commander_dealers column: status
    console.log('\n=== COMMANDER_DEALERS COLUMNS ===');
    const dealerTests = ['id, name, employee_id', 'id, name, status', 'id, name, skill_level', 'id, name, certified_games'];
    for (const sel of dealerTests) {
        const { data, error } = await sb.from('commander_dealers').select(sel).limit(1);
        console.log(error ? '  [X] ' + sel + ': ' + error.message.substring(0, 50) : '  [OK] ' + sel);
    }

    // Test commander_venue_settings columns
    console.log('\n=== COMMANDER_VENUE_SETTINGS COLUMNS ===');
    const settingsTests = ['venue_id, time_billing_rate', 'venue_id, auto_comp_rate', 'venue_id, currency', 'id, venue_id'];
    for (const sel of settingsTests) {
        const { data, error } = await sb.from('commander_venue_settings').select(sel).limit(1);
        console.log(error ? '  [X] ' + sel + ': ' + error.message.substring(0, 60) : '  [OK] ' + sel);
    }

    // Test commander_tournaments: which columns exist
    console.log('\n=== COMMANDER_TOURNAMENTS COLUMNS ===');
    const tournTests = [
        'id, name, status, buyin_amount, guaranteed_pool',
        'id, blind_structure, settings',
        'id, clock_state',
        'id, current_entries, players_remaining',
        'id, starting_chips, tournament_type',
    ];
    for (const sel of tournTests) {
        const { data, error } = await sb.from('commander_tournaments').select(sel).limit(1);
        console.log(error ? '  [X] ' + sel + ': ' + error.message.substring(0, 60) : '  [OK] ' + sel);
    }

    // Test commander_tournament_entries: which columns exist  
    console.log('\n=== COMMANDER_TOURNAMENT_ENTRIES COLUMNS ===');
    const entryTests = [
        'id, tournament_id, player_id, player_name, status',
        'id, current_chips, table_number, seat_number',
        'id, chip_count',
        'id, finish_position, entry_type',
    ];
    for (const sel of entryTests) {
        const { data, error } = await sb.from('commander_tournament_entries').select(sel).limit(1);
        console.log(error ? '  [X] ' + sel + ': ' + error.message.substring(0, 60) : '  [OK] ' + sel);
    }

    process.exit(0);
})();
