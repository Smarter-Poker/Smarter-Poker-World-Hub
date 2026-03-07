#!/usr/bin/env node
/**
 * Seed a LIVE Running Tournament — Club JAQK
 * 
 * Creates a tournament on tables 16-19, currently at level 6, with real players.
 * ~32 players across 4 tables (8 per table, 9-max).
 * Some players already eliminated (5 out), 27 remaining.
 * 
 * Usage: node scripts/seed-live-tournament.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  LIVE TOURNAMENT SEEDER — Club JAQK');
    console.log('═══════════════════════════════════════════════\n');

    // ── 1. Get staff ID for created_by ──
    const { data: staffList } = await sb.from('commander_staff')
        .select('id').eq('venue_id', VENUE_ID).limit(1);
    const STAFF_ID = staffList?.[0]?.id || null;

    // ── 2. Get available tables (16-19) ──
    const TABLE_NUMBERS = [16, 17, 18, 19];
    const { data: tables } = await sb.from('commander_tables')
        .select('id, table_number')
        .eq('venue_id', VENUE_ID)
        .in('table_number', TABLE_NUMBERS);

    if (!tables || tables.length < 4) {
        console.error('❌ Not enough available tables. Need tables 16-19.');
        process.exit(1);
    }
    console.log(`  ✅ Found ${tables.length} tables for tournament`);

    // ── 3. Get all player members for registration ──
    const { data: allMembers } = await sb.from('commander_members')
        .select('id, first_name, last_name, member_type')
        .eq('venue_id', VENUE_ID)
        .eq('member_type', 'player')
        .eq('membership_status', 'active')
        .limit(40);

    if (!allMembers || allMembers.length < 32) {
        console.error(`❌ Not enough players. Found ${allMembers?.length || 0}, need 32.`);
        process.exit(1);
    }
    console.log(`  ✅ Found ${allMembers.length} eligible players`);

    // Take first 32 players
    const players = allMembers.slice(0, 32);

    // ── 4. Create the tournament ──
    console.log('\n── Creating Tournament ──\n');

    const STARTING_CHIPS = 20000;
    const BUYIN = 200;
    const FEE = 30;
    const now = new Date();
    // Tournament started ~2.5 hours ago (levels 1-5 completed, now on level 6)
    // Each level = 20 min, breaks after 4 and 8
    // 5 levels * 20 min = 100 min + 1 break = 115 min ≈ ~2 hrs ago
    const startedAt = new Date(now.getTime() - 115 * 60000);
    const scheduledStart = new Date(startedAt.getTime() - 30 * 60000); // Scheduled 30min before actual start

    const blindStructure = [
        { level: 1, small_blind: 100, big_blind: 200, ante: 0, duration_minutes: 20 },
        { level: 2, small_blind: 150, big_blind: 300, ante: 0, duration_minutes: 20 },
        { level: 3, small_blind: 200, big_blind: 400, ante: 50, duration_minutes: 20 },
        { level: 4, small_blind: 300, big_blind: 600, ante: 75, duration_minutes: 20 },
        { level: 5, small_blind: 400, big_blind: 800, ante: 100, duration_minutes: 20 },
        { level: 6, small_blind: 500, big_blind: 1000, ante: 100, duration_minutes: 20 },
        { level: 7, small_blind: 600, big_blind: 1200, ante: 200, duration_minutes: 20 },
        { level: 8, small_blind: 800, big_blind: 1600, ante: 200, duration_minutes: 20 },
        { level: 9, small_blind: 1000, big_blind: 2000, ante: 300, duration_minutes: 20 },
        { level: 10, small_blind: 1500, big_blind: 3000, ante: 400, duration_minutes: 20 },
        { level: 11, small_blind: 2000, big_blind: 4000, ante: 500, duration_minutes: 20 },
        { level: 12, small_blind: 3000, big_blind: 6000, ante: 600, duration_minutes: 20 },
    ];

    const breakSchedule = [
        { after_level: 4, duration_minutes: 15 },
        { after_level: 8, duration_minutes: 15 },
    ];

    const payoutStructure = [
        { place: 1, percentage: 35 },
        { place: 2, percentage: 22 },
        { place: 3, percentage: 15 },
        { place: 4, percentage: 10 },
        { place: 5, percentage: 8 },
        { place: 6, percentage: 5.5 },
        { place: 7, percentage: 4.5 },
    ];

    // Level 6 clock state: ~8 minutes into level 6
    const levelStartedAt = new Date(now.getTime() - 8 * 60000);
    const clockState = {
        running: true,
        current_level: 6,
        level_started_at: levelStartedAt.toISOString(),
        time_remaining_seconds: 720, // 12 minutes left in level
        paused: false,
    };

    const { data: tournament, error: tErr } = await sb.from('commander_tournaments')
        .insert({
            venue_id: VENUE_ID,
            name: 'Friday Night $200 NLH Freezeout',
            description: 'Weekly $200 freezeout with 20K starting stack. 20-minute levels. $5,000 guaranteed prize pool.',
            tournament_type: 'freezeout',
            buyin_amount: BUYIN,
            buyin_fee: FEE,
            starting_chips: STARTING_CHIPS,
            scheduled_start: scheduledStart.toISOString(),
            registration_opens: new Date(scheduledStart.getTime() - 60 * 60000).toISOString(),
            late_registration_levels: 6,
            actual_start: startedAt.toISOString(),
            min_entries: 10,
            max_entries: 80,
            guaranteed_pool: 5000,
            status: 'running',
            current_level: 6,
            blind_structure: blindStructure,
            break_schedule: breakSchedule,
            payout_structure: payoutStructure,
            allows_rebuys: false,
            broadcast_to_smarter: true,
            created_by: STAFF_ID,
            settings: {
                auto_level_advance: true,
                show_clock_on_displays: true,
            },
        })
        .select()
        .maybeSingle();

    if (tErr) {
        console.error('❌ Tournament create error:', tErr.message);
        process.exit(1);
    }
    console.log(`  ✅ Tournament created: ${tournament.name}`);
    console.log(`     ID: ${tournament.id}`);
    console.log(`     Status: ${tournament.status}, Level: ${tournament.current_level}`);

    // ── 5. Assign tables to tournament ──
    console.log('\n── Assigning Tables ──\n');

    for (const t of tables) {
        const { error: tblErr } = await sb.from('commander_tables')
            .update({
                tournament_id: tournament.id,
                status: 'in_use',
            })
            .eq('id', t.id);
        if (tblErr) {
            console.error(`  ❌ Table ${t.table_number} assignment error:`, tblErr.message);
        } else {
            console.log(`  ✅ Table ${t.table_number} → Tournament`);
        }
    }

    // ── 6. Register and seat players ──
    console.log('\n── Registering Players ──\n');

    // 32 players total: 5 eliminated, 27 active across 4 tables
    // Tables: 7 players each on tables 16-18, 6 on table 19
    const tableAssignments = [
        { tableNum: 16, seats: 7 },
        { tableNum: 17, seats: 7 },
        { tableNum: 18, seats: 7 },
        { tableNum: 19, seats: 6 },
    ];

    const totalActive = tableAssignments.reduce((s, t) => s + t.seats, 0); // 27 active
    const totalEliminated = 5;
    const totalPlayers = totalActive + totalEliminated; // 32

    // Generate realistic chip counts for active players
    // Total chips in play = 32 * 20000 = 640,000
    // Average stack for 27 remaining = 640000 / 27 ≈ 23,700
    const TOTAL_CHIPS = totalPlayers * STARTING_CHIPS; // 640,000

    function generateChipCounts(numPlayers, totalPool) {
        // Generate random chip counts that sum to totalPool
        const raw = Array.from({ length: numPlayers }, () => Math.random());
        const sum = raw.reduce((a, b) => a + b, 0);
        return raw.map(r => Math.round((r / sum) * totalPool / 100) * 100); // Round to 100s
    }

    const chipCounts = generateChipCounts(totalActive, TOTAL_CHIPS);
    // Sort so some tables have big stacks, some short stacks (realistic)
    chipCounts.sort((a, b) => b - a);

    const entries = [];
    let playerIdx = 0;
    let chipIdx = 0;

    // Active players across tables
    for (const ta of tableAssignments) {
        const seatNums = Array.from({ length: 9 }, (_, i) => i + 1);
        // Shuffle seats
        for (let i = seatNums.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seatNums[i], seatNums[j]] = [seatNums[j], seatNums[i]];
        }

        for (let s = 0; s < ta.seats; s++) {
            const p = players[playerIdx];
            const chips = chipCounts[chipIdx];
            entries.push({
                tournament_id: tournament.id,
                player_name: `${p.first_name} ${p.last_name}`,
                registered_at: new Date(startedAt.getTime() - rand(5, 30) * 60000).toISOString(),
                registration_method: pick(['app', 'walk_in', 'walk_in', 'app']),
                table_number: ta.tableNum,
                seat_number: seatNums[s],
                status: 'active',
                current_chips: chips,
                last_chip_count_at: new Date(now.getTime() - rand(1, 10) * 60000).toISOString(),
                rebuy_count: 0,
                addon_taken: false,
                notes: null,
            });
            playerIdx++;
            chipIdx++;
        }
    }

    // Eliminated players (5 players, no table/seat, eliminated at various points)
    for (let e = 0; e < totalEliminated; e++) {
        const p = players[playerIdx];
        const elimLevel = rand(3, 6); // Eliminated in levels 3-6
        const elimTime = new Date(startedAt.getTime() + (elimLevel - 1) * 20 * 60000 + rand(1, 19) * 60000);
        entries.push({
            tournament_id: tournament.id,
            player_name: `${p.first_name} ${p.last_name}`,
            registered_at: new Date(startedAt.getTime() - rand(5, 30) * 60000).toISOString(),
            registration_method: pick(['app', 'walk_in']),
            table_number: null,
            seat_number: null,
            status: 'eliminated',
            current_chips: 0,
            eliminated_at: elimTime.toISOString(),
            finish_position: totalPlayers - e, // 32, 31, 30, 29, 28
            rebuy_count: 0,
            addon_taken: false,
            notes: e === 0 ? 'Bad beat — ran KK into AA' : null,
        });
        playerIdx++;
    }

    // Insert all entries
    const { data: entryData, error: eErr } = await sb.from('commander_tournament_entries')
        .insert(entries)
        .select('id, player_name, status, table_number, seat_number, current_chips');

    if (eErr) {
        console.error('❌ Entry insert error:', eErr.message);
        process.exit(1);
    }

    console.log(`  ✅ ${entryData.length} players registered`);

    // Print table breakdown
    const activeEntries = entryData.filter(e => e.status === 'active');
    const elimEntries = entryData.filter(e => e.status === 'eliminated');

    console.log(`\n     Active: ${activeEntries.length}`);
    console.log(`     Eliminated: ${elimEntries.length}`);

    for (const tn of TABLE_NUMBERS) {
        const tPlayers = activeEntries.filter(e => e.table_number === tn);
        const totalChips = tPlayers.reduce((s, p) => s + (p.current_chips || 0), 0);
        console.log(`\n  ── Table ${tn} (${tPlayers.length}/9 seats) ──`);
        for (const p of tPlayers.sort((a, b) => a.seat_number - b.seat_number)) {
            const chipStr = (p.current_chips || 0).toLocaleString();
            console.log(`     Seat ${p.seat_number}: ${p.player_name.padEnd(22)} ${chipStr.padStart(8)} chips`);
        }
        console.log(`     Total: ${totalChips.toLocaleString()} chips`);
    }

    console.log('\n  ── Eliminated Players ──');
    for (const p of elimEntries) {
        console.log(`     ${p.player_name} — finished #${entries.find(e => e.player_name === p.player_name)?.finish_position || '?'}`);
    }

    // ── 7. Summary ──
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  TOURNAMENT: ${tournament.name}`);
    console.log(`  STATUS: RUNNING — Level 6 (500/1000 ante 100)`);
    console.log(`  PLAYERS: ${totalActive} remaining / ${totalPlayers} entries`);
    console.log(`  TABLES: ${TABLE_NUMBERS.join(', ')}`);
    console.log(`  PRIZE POOL: $${totalPlayers * BUYIN} (${totalPlayers} × $${BUYIN})`);
    console.log(`  AVG STACK: ${Math.round(TOTAL_CHIPS / totalActive).toLocaleString()}`);
    console.log('═══════════════════════════════════════════════\n');
})();
