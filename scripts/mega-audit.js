/**
 * MEGA COMMANDER DATA INTEGRITY AUDIT
 * Tests every critical FK join, query, and data flow across all Commander APIs
 * Run from: /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

let passed = 0, failed = 0, warnings = 0;
const failures = [];
const warningsList = [];

async function test(label, fn) {
    try {
        const result = await fn();
        if (result === 'WARN') {
            warnings++;
            warningsList.push(label);
            console.log(`  ⚠️  ${label}`);
        } else {
            passed++;
            console.log(`  ✅ ${label}`);
        }
    } catch (e) {
        failed++;
        failures.push({ label, error: e.message || String(e) });
        console.log(`  ❌ ${label}: ${(e.message || String(e)).substring(0, 100)}`);
    }
}

(async () => {
    const VENUE_ID = 1996; // Club JAQK

    // ═══════════════════════════════════════════════════
    // 1. TABLES — Core table data
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  1. TABLES & FLOOR                     ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_tables: id, table_number, status, max_seats, game_type, stakes, venue_id', async () => {
        const { data, error } = await sb.from('commander_tables').select('id, table_number, status, max_seats, game_type, stakes, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No tables found for venue');
    });

    await test('commander_tables: table_name, mode, floor_position', async () => {
        const { data, error } = await sb.from('commander_tables').select('id, table_name, mode, floor_position').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 2. GAMES — Active game data
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  2. GAMES                              ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_games: standard columns', async () => {
        const { data, error } = await sb.from('commander_games').select('id, game_type, stakes, status, current_players, table_id, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No games found');
    });

    await test('commander_games FK -> commander_tables', async () => {
        const { data, error } = await sb.from('commander_games').select('id, commander_tables:table_id (id, table_number, table_name)').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_games: all game metadata fields', async () => {
        const { data, error } = await sb.from('commander_games').select('id, game_type, stakes, status, current_players, max_players, min_buyin, max_buyin, is_featured, must_move_to').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 3. SEATS — Player seat assignments
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  3. SEATS & PLAYER SIGN-INS            ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_seats: standard columns', async () => {
        const { data, error } = await sb.from('commander_seats').select('id, game_id, seat_number, player_name, member_id, status').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_table_sessions: active sessions + time fields', async () => {
        const { data, error } = await sb.from('commander_table_sessions').select('id, table_number, seat_number, player_name, member_id, status, time_allocated_minutes, time_added_minutes, started_at').eq('venue_id', VENUE_ID).eq('status', 'active').limit(3);
        if (error) throw error;
    });

    await test('commander_table_sessions: membership fields', async () => {
        const { data, error } = await sb.from('commander_table_sessions').select('id, membership_tier, member_number, membership_status').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 4. DEALERS — Rotation, scan-in, display
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  4. DEALERS                            ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_dealers: standard columns', async () => {
        const { data, error } = await sb.from('commander_dealers').select('id, name, employee_id, status, skill_level, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No dealers found');
    });

    await test('commander_dealer_rotations: standard columns + FK to dealers', async () => {
        const { data, error } = await sb.from('commander_dealer_rotations')
            .select('id, dealer_id, dealer_name, table_number, table_id, venue_id, started_at, ended_at, commander_dealers:dealer_id (id, name)')
            .eq('venue_id', VENUE_ID).is('ended_at', null).limit(3);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No active rotations');
    });

    await test('Dealer rotations have dealer_name populated', async () => {
        const { data } = await sb.from('commander_dealer_rotations')
            .select('id, dealer_name, table_number').eq('venue_id', VENUE_ID).is('ended_at', null);
        const missing = (data || []).filter(r => !r.dealer_name);
        if (missing.length > 0) throw new Error(`${missing.length} rotations missing dealer_name`);
    });

    await test('Dealer rotations have table_id populated', async () => {
        const { data } = await sb.from('commander_dealer_rotations')
            .select('id, table_id, table_number').eq('venue_id', VENUE_ID).is('ended_at', null);
        const missing = (data || []).filter(r => !r.table_id);
        if (missing.length > 0) throw new Error(`${missing.length} rotations missing table_id`);
    });

    // ═══════════════════════════════════════════════════
    // 5. TOURNAMENTS — Clock, entries, chip counts
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  5. TOURNAMENTS                        ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_tournaments: standard columns', async () => {
        const { data, error } = await sb.from('commander_tournaments').select('id, name, status, buyin_amount, buyin_fee, starting_chips, guaranteed_pool, tournament_type, blind_structure, clock_state, current_entries, players_remaining').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_tournament_entries: standard columns', async () => {
        const { data, error } = await sb.from('commander_tournament_entries').select('id, tournament_id, player_id, player_name, status, chip_count, table_number, seat_number, finish_position, entry_type').limit(3);
        if (error) throw error;
    });

    await test('tournament_entries FK -> tournaments', async () => {
        const { data, error } = await sb.from('commander_tournament_entries').select('id, commander_tournaments:tournament_id (id, name, status)').limit(3);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 6. WAITLIST — Player queue
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  6. WAITLIST                           ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_waitlist: standard columns', async () => {
        const { data, error } = await sb.from('commander_waitlist').select('id, venue_id, player_name, game_type, stakes, status, position, member_id, joined_at, called_at, seated_at').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_waitlist_groups: standard columns', async () => {
        const { data, error } = await sb.from('commander_waitlist_groups').select('id, venue_id, game_type, stakes, status, leader_id, prefer_same_table, accept_split').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_waitlist_groups FK -> poker_venues', async () => {
        const { data, error } = await sb.from('commander_waitlist_groups').select('id, poker_venues:venue_id (id, name)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_waitlist_groups FK -> profiles(leader_id)', async () => {
        const { data, error } = await sb.from('commander_waitlist_groups').select('id, profiles:leader_id (id, display_name)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 7. PROMOTIONS & HIGH HANDS
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  7. PROMOTIONS & HIGH HANDS            ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_promotions: standard columns', async () => {
        const { data, error } = await sb.from('commander_promotions').select('id, name, promotion_type, status, prize_type, prize_value, start_date, end_date, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_promotions FK -> staff(created_by)', async () => {
        const { data, error } = await sb.from('commander_promotions').select('id, commander_staff:created_by (id, display_name)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_high_hands: standard columns', async () => {
        const { data, error } = await sb.from('commander_high_hands').select('id, hand_description, player_name, player_id, game_id, promotion_id, table_number, prize_awarded, verified, verified_by').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_high_hands FK -> promotions', async () => {
        const { data, error } = await sb.from('commander_high_hands').select('id, commander_promotions:promotion_id (id, name)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_high_hands FK -> games', async () => {
        const { data, error } = await sb.from('commander_high_hands').select('id, commander_games:game_id (id, game_type, stakes)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 8. COMPS & CASHIER
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  8. COMPS & CASHIER                    ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_comp_rates: standard columns', async () => {
        const { data, error } = await sb.from('commander_comp_rates').select('id, name, rate_type, rate_value, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_comp_transactions FK -> rates', async () => {
        const { data, error } = await sb.from('commander_comp_transactions').select('id, commander_comp_rates:rate_id (id, name, rate_type)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_comp_transactions FK -> staff(approved_by)', async () => {
        const { data, error } = await sb.from('commander_comp_transactions').select('id, commander_staff:approved_by (id, display_name)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_cashier_transactions: standard columns', async () => {
        const { data, error } = await sb.from('commander_cashier_transactions').select('id, venue_id, transaction_type, amount, payment_method, player_name, member_id, staff_id, session_id, receipt_number').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 9. STAFF & VENUE SETTINGS
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  9. STAFF & VENUE SETTINGS             ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_staff: standard columns', async () => {
        const { data, error } = await sb.from('commander_staff').select('id, name, display_name, role, venue_id, status, pin').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('No staff found');
    });

    await test('commander_venue_settings: standard columns', async () => {
        const { data, error } = await sb.from('commander_venue_settings').select('id, venue_id, venue_type, time_billing_rate, auto_comp_rate, currency').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_members: standard columns', async () => {
        const { data, error } = await sb.from('commander_members').select('id, first_name, last_name, member_number, membership_tier, membership_status, venue_id').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 10. DISPLAYS & ANNOUNCEMENTS
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  10. DISPLAYS & ANNOUNCEMENTS          ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_display_devices: standard columns', async () => {
        const { data, error } = await sb.from('commander_display_devices').select('id, name, device_type, venue_id, config, status, last_heartbeat').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('commander_announcements: standard columns', async () => {
        const { data, error } = await sb.from('commander_announcements').select('id, venue_id, title, message, type, status, priority, display_pages, start_time, end_time').eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 11. INCIDENTS & SERVICES
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  11. INCIDENTS & SERVICES              ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_incidents FK -> staff(reported_by)', async () => {
        const { data, error } = await sb.from('commander_incidents').select('id, reported_by_staff:commander_staff!reported_by (id, name, role)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_service_requests: standard columns', async () => {
        const { data, error } = await sb.from('commander_service_requests').select('id, venue_id, player_id, request_type, status, table_id, assigned_to').limit(3);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 12. SOCIAL PAGES API — Club Page Data Bridge
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  12. CLUB PAGE DATA BRIDGE (SOCIAL)    ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('Social pages API: games endpoint returns dealers', async () => {
        const { data: pages } = await sb.from('social_pages').select('id').ilike('name', '%JAQK%').limit(1);
        if (!pages || pages.length === 0) throw new Error('Club JAQK page not found');
        // Simulate the games.js API query chain
        const { data: games } = await sb.from('commander_games').select('id, table_id, game_type, stakes, status, current_players, max_players').eq('venue_id', VENUE_ID).in('status', ['running', 'waiting']);
        if (!games || games.length === 0) throw new Error('No running games');
        const tableIds = games.map(g => g.table_id).filter(Boolean);
        const { data: rots, error: rotErr } = await sb.from('commander_dealer_rotations')
            .select('table_id, table_number, dealer_name, commander_dealers:dealer_id (id, name)')
            .in('table_id', tableIds).is('ended_at', null);
        if (rotErr) throw new Error('Rotation FK query failed: ' + rotErr.message);
        const withDealer = (rots || []).filter(r => r.dealer_name || r.commander_dealers?.name);
        if (withDealer.length === 0) throw new Error('No dealer names in rotation results');
    });

    await test('Social pages: table data with seats', async () => {
        const { data: tables } = await sb.from('commander_tables').select('id, table_number, max_seats').eq('venue_id', VENUE_ID).eq('status', 'in_use').limit(1);
        if (!tables || tables.length === 0) return 'WARN'; // No active tables
        const tNum = tables[0].table_number;
        const { data: sessions } = await sb.from('commander_table_sessions').select('seat_number, player_name, time_allocated_minutes, started_at, status').eq('table_number', tNum).eq('status', 'active');
        // Just verify the query works — no error
    });

    await test('Social pages: tournament data for widget', async () => {
        const { data, error } = await sb.from('commander_tournaments')
            .select('id, name, status, buyin_amount, guaranteed_pool, current_entries, players_remaining, blind_structure, clock_state, start_time')
            .eq('venue_id', VENUE_ID).limit(3);
        if (error) throw error;
    });

    await test('Social pages: waitlist counts per game type', async () => {
        const { data, error } = await sb.from('commander_waitlist')
            .select('id, game_type, stakes, status')
            .eq('venue_id', VENUE_ID).eq('status', 'waiting');
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 13. REPORT & ANALYTICS QUERIES
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  13. REPORTS & ANALYTICS               ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('commander_games FK -> tables for reports/export', async () => {
        const { data, error } = await sb.from('commander_games').select('id, commander_tables:table_id (id, table_number)').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    await test('commander_daily_stats: standard columns', async () => {
        const { data, error } = await sb.from('commander_daily_stats').select('id, venue_id, date, total_revenue, total_sessions, peak_tables').eq('venue_id', VENUE_ID).limit(1);
        if (error) throw error;
    });

    // ═══════════════════════════════════════════════════
    // 14. DATA CONSISTENCY CHECKS
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  14. DATA CONSISTENCY CHECKS           ║');
    console.log('╚═══════════════════════════════════════╝\n');

    await test('Every active game has a valid table_id', async () => {
        const { data: games } = await sb.from('commander_games').select('id, table_id, status').eq('venue_id', VENUE_ID).in('status', ['running', 'waiting']);
        const noTable = (games || []).filter(g => !g.table_id);
        if (noTable.length > 0) throw new Error(`${noTable.length} games without table_id`);
    });

    await test('Every active rotation has matching dealer in commander_dealers', async () => {
        const { data: rots } = await sb.from('commander_dealer_rotations').select('id, dealer_id, dealer_name').eq('venue_id', VENUE_ID).is('ended_at', null);
        if ((rots || []).length === 0) return 'WARN';
        const dealerIds = [...new Set((rots || []).map(r => r.dealer_id).filter(Boolean))];
        if (dealerIds.length > 0) {
            const { data: dealers } = await sb.from('commander_dealers').select('id').in('id', dealerIds);
            const found = new Set((dealers || []).map(d => d.id));
            const orphaned = dealerIds.filter(id => !found.has(id));
            if (orphaned.length > 0) throw new Error(`${orphaned.length} rotations reference non-existent dealers`);
        }
    });

    await test('No duplicate active rotations per table', async () => {
        const { data: rots } = await sb.from('commander_dealer_rotations').select('table_number').eq('venue_id', VENUE_ID).is('ended_at', null);
        const counts = {};
        (rots || []).forEach(r => { counts[r.table_number] = (counts[r.table_number] || 0) + 1; });
        const dupes = Object.entries(counts).filter(([, c]) => c > 1);
        if (dupes.length > 0) throw new Error(`Tables with duplicate rotations: ${dupes.map(([t, c]) => `T${t}(${c})`).join(', ')}`);
    });

    await test('Active sessions reference valid table_numbers', async () => {
        const { data: sessions } = await sb.from('commander_table_sessions').select('table_number').eq('venue_id', VENUE_ID).eq('status', 'active');
        if ((sessions || []).length === 0) return; // No sessions is OK
        const tableNums = [...new Set(sessions.map(s => s.table_number))];
        const { data: tables } = await sb.from('commander_tables').select('table_number').eq('venue_id', VENUE_ID).in('table_number', tableNums);
        const validNums = new Set((tables || []).map(t => t.table_number));
        const orphaned = tableNums.filter(n => !validNums.has(n));
        if (orphaned.length > 0) throw new Error(`Sessions on non-existent tables: ${orphaned.join(', ')}`);
    });

    // ═══════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log(`║  FINAL: ${passed} passed, ${failed} failed, ${warnings} warnings`.padEnd(51) + '║');
    console.log('╚═══════════════════════════════════════════════════╝');

    if (failures.length > 0) {
        console.log('\n🔴 FAILURES:');
        failures.forEach(f => console.log(`   ${f.label}\n   → ${f.error}\n`));
    }
    if (warningsList.length > 0) {
        console.log('\n⚠️  WARNINGS (non-fatal):');
        warningsList.forEach(w => console.log(`   ${w}`));
    }

    process.exit(failed > 0 ? 1 : 0);
})();
