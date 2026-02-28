const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

(async () => {
    console.log('=== FK COLUMN EXISTENCE AUDIT ===\n');

    const tests = [
        // Direct column checks
        ['commander_staff.display_name', () => sb.from('commander_staff').select('id, display_name').limit(1)],
        ['commander_dealers.name', () => sb.from('commander_dealers').select('id, name').limit(1)],
        ['commander_dealers.employee_id', () => sb.from('commander_dealers').select('id, name, employee_id').limit(1)],
        ['commander_tables.table_number', () => sb.from('commander_tables').select('id, table_number').limit(1)],
        ['commander_promotions.name+type+value', () => sb.from('commander_promotions').select('id, name, prize_type, prize_value').limit(1)],
        ['commander_comp_rates.name+type', () => sb.from('commander_comp_rates').select('id, name, rate_type').limit(1)],
        ['commander_games.game_type+stakes', () => sb.from('commander_games').select('id, game_type, stakes').limit(1)],
        ['commander_home_games.title+date', () => sb.from('commander_home_games').select('id, title, scheduled_date, start_time, host_id, status').limit(1)],
        ['profiles.display_name', () => sb.from('profiles').select('id, display_name, avatar_url').limit(1)],
    ];

    for (const [label, qFn] of tests) {
        const { data, error } = await qFn();
        console.log(error ? `  ❌ ${label}: ${error.message.substring(0, 80)}` : `  ✅ ${label}`);
    }

    console.log('\n=== TESTING FK JOIN QUERIES ===\n');

    const fkTests = [
        // From promotions
        ['promotions->staff(created_by) display_name', () =>
            sb.from('commander_promotions').select('id, commander_staff:created_by (id, display_name)').limit(1)],

        // From services
        ['services->tables(table_id)', () =>
            sb.from('commander_service_requests').select('id, commander_tables:table_id (id, table_number)').limit(1)],
        ['services->staff(assigned_to) display_name', () =>
            sb.from('commander_service_requests').select('id, commander_staff:assigned_to (id, display_name)').limit(1)],

        // From comp transactions
        ['comp_txns->rates(rate_id)', () =>
            sb.from('commander_comp_transactions').select('id, commander_comp_rates:rate_id (id, name, rate_type)').limit(1)],
        ['comp_txns->staff(approved_by) display_name', () =>
            sb.from('commander_comp_transactions').select('id, commander_staff:approved_by (id, display_name)').limit(1)],

        // From high hands
        ['high_hands->profiles(player_id)', () =>
            sb.from('commander_high_hands').select('id, profiles:player_id (id, display_name, avatar_url)').limit(1)],
        ['high_hands->promotions(promotion_id)', () =>
            sb.from('commander_high_hands').select('id, commander_promotions:promotion_id (id, name)').limit(1)],
        ['high_hands->staff(verified_by) display_name', () =>
            sb.from('commander_high_hands').select('id, verifier:verified_by (id, display_name)').limit(1)],
        ['high_hands->games(game_id)', () =>
            sb.from('commander_high_hands').select('id, commander_games:game_id (id, game_type, stakes)').limit(1)],

        // From incidents
        ['incidents->profiles(player_id)', () =>
            sb.from('commander_incidents').select('id, involved_player:profiles!player_id (id, display_name, avatar_url)').limit(1)],

        // From dealer rotations -> dealers
        ['rotations->dealers(dealer_id)', () =>
            sb.from('commander_dealer_rotations').select('id, commander_dealers:dealer_id (id, name, employee_id)').limit(1)],

        // From tournament entries
        ['entries->tournaments(tournament_id)', () =>
            sb.from('commander_tournament_entries').select('id, commander_tournaments:tournament_id (id, name)').limit(1)],

        // From exports
        ['games->tables(table_id)', () =>
            sb.from('commander_games').select('id, commander_tables:table_id (id, table_number)').limit(1)],

        // From home game announcements
        ['announcements->home_games', () =>
            sb.from('commander_home_game_announcements').select('id, commander_home_games:related_game_id (id, title, scheduled_date, start_time)').limit(1)],

        // From squads
        ['squad_members->groups', () =>
            sb.from('commander_waitlist_group_members').select('id, commander_waitlist_groups:group_id (id, name)').limit(1)],

        // From comps/redeem
        ['comp_redemptions->staff(processed_by)', () =>
            sb.from('commander_comp_redemptions').select('id, commander_staff:processed_by (id, display_name)').limit(1)],
    ];

    let failures = 0;
    for (const [label, qFn] of fkTests) {
        const { data, error } = await qFn();
        if (error) {
            console.log(`  ❌ ${label}`);
            console.log(`     ERROR: ${error.message.substring(0, 120)}`);
            failures++;
        } else {
            console.log(`  ✅ ${label}`);
        }
    }

    console.log(`\n=== SUMMARY: ${failures} FAILURES out of ${fkTests.length} FK joins tested ===`);
    process.exit(failures > 0 ? 1 : 0);
})();
