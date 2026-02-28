#!/usr/bin/env node
/**
 * CLUB JAQK — Full Room Setup for Table Tablet Testing
 *
 * 1. Adds 80 NEW players with random memberships (tiers, expiry, visits, hours)
 * 2. Creates active time-billing sessions (20+ hrs) for ALL 100 players
 * 3. Opens running games on tables 1-15
 * 4. Seats players at tables with occupied seats
 * 5. Clocks in 8 dealers with active rotations at tables
 *
 * Run: node scripts/seed-jaqk-full-room.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
let inserted = 0;
let errors = 0;

// 80 realistic poker player names
const NEW_PLAYERS = [
    { first: 'Victor', last: 'Ramirez' }, { first: 'Sophia', last: 'Zhang' },
    { first: 'Ethan', last: 'Brooks' }, { first: 'Isabella', last: 'Foster' },
    { first: 'Liam', last: 'Ortega' }, { first: 'Ava', last: 'Sullivan' },
    { first: 'Noah', last: 'Pham' }, { first: 'Mia', last: 'Henderson' },
    { first: 'Lucas', last: 'Rivera' }, { first: 'Charlotte', last: 'Murphy' },
    { first: 'Mason', last: 'Cooper' }, { first: 'Amelia', last: 'Reed' },
    { first: 'Logan', last: 'Torres' }, { first: 'Harper', last: 'Powell' },
    { first: 'Alexander', last: 'Cox' }, { first: 'Evelyn', last: 'Ward' },
    { first: 'Jackson', last: 'Peterson' }, { first: 'Luna', last: 'Gray' },
    { first: 'Sebastian', last: 'Diaz' }, { first: 'Camila', last: 'James' },
    { first: 'Henry', last: 'Watson' }, { first: 'Penelope', last: 'Brooks' },
    { first: 'Jack', last: 'Bennett' }, { first: 'Layla', last: 'Wood' },
    { first: 'Owen', last: 'Barnes' }, { first: 'Riley', last: 'Ross' },
    { first: 'Benjamin', last: 'Coleman' }, { first: 'Zoey', last: 'Jenkins' },
    { first: 'Elijah', last: 'Perry' }, { first: 'Nora', last: 'Butler' },
    { first: 'Aiden', last: 'Simmons' }, { first: 'Lily', last: 'Bryant' },
    { first: 'Caleb', last: 'Russell' }, { first: 'Eleanor', last: 'Griffin' },
    { first: 'Ryan', last: 'Hayes' }, { first: 'Hannah', last: 'Long' },
    { first: 'Nathan', last: 'Webb' }, { first: 'Audrey', last: 'Cole' },
    { first: 'Samuel', last: 'Hunt' }, { first: 'Stella', last: 'Palmer' },
    { first: 'Dylan', last: 'Ellis' }, { first: 'Violet', last: 'Stevens' },
    { first: 'Gabriel', last: 'Murray' }, { first: 'Hazel', last: 'Graham' },
    { first: 'Matthew', last: 'Stone' }, { first: 'Aurora', last: 'Knight' },
    { first: 'Carter', last: 'Hicks' }, { first: 'Savannah', last: 'Wade' },
    { first: 'Jayden', last: 'Fox' }, { first: 'Brooklyn', last: 'Ray' },
    { first: 'Isaiah', last: 'Hart' }, { first: 'Claire', last: 'Carr' },
    { first: 'Connor', last: 'Mack' }, { first: 'Scarlett', last: 'Burns' },
    { first: 'Dominic', last: 'Park' }, { first: 'Aria', last: 'Spencer' },
    { first: 'Tyler', last: 'Nichols' }, { first: 'Madelyn', last: 'Dixon' },
    { first: 'Blake', last: 'Grant' }, { first: 'Skylar', last: 'Reyes' },
    { first: 'Eli', last: 'Pearson' }, { first: 'Bella', last: 'Hoffman' },
    { first: 'Jake', last: 'Manning' }, { first: 'Ruby', last: 'Price' },
    { first: 'Chase', last: 'Hawkins' }, { first: 'Aaliyah', last: 'Santos' },
    { first: 'Trevor', last: 'Fleming' }, { first: 'Naomi', last: 'Walsh' },
    { first: 'Wesley', last: 'Dunn' }, { first: 'Willow', last: 'Kim' },
    { first: 'Miles', last: 'Crawford' }, { first: 'Paisley', last: 'Boyd' },
    { first: 'Declan', last: 'Armstrong' }, { first: 'Elena', last: 'Castro' },
    { first: 'Finn', last: 'Harrison' }, { first: 'Gianna', last: 'Snyder' },
    { first: 'Derek', last: 'Fields' }, { first: 'Maya', last: 'Montgomery' },
    { first: 'Gavin', last: 'Sharp' }, { first: 'Jade', last: 'Estrada' },
];

const TIERS = ['daily', 'daily', 'weekly', 'monthly', 'monthly', 'monthly', 'monthly', 'monthly', 'yearly', 'yearly'];

const TIER_CONFIG = {
    daily: { expiryRange: [1, 7], visitRange: [1, 10], hoursRange: [5, 30] },
    weekly: { expiryRange: [7, 30], visitRange: [3, 20], hoursRange: [10, 80] },
    monthly: { expiryRange: [30, 180], visitRange: [10, 60], hoursRange: [30, 300] },
    yearly: { expiryRange: [180, 730], visitRange: [50, 200], hoursRange: [100, 1000] },
};

// Games for the running tables
const GAME_CONFIGS = [
    { table: 1, game_type: 'nlh', stakes: '1/2', max: 9 },
    { table: 2, game_type: 'nlh', stakes: '1/2', max: 9 },
    { table: 3, game_type: 'nlh', stakes: '1/2', max: 9 },
    { table: 4, game_type: 'nlh', stakes: '1/2', max: 9 },
    { table: 5, game_type: 'nlh', stakes: '2/5', max: 9 },
    { table: 6, game_type: 'nlh', stakes: '2/5', max: 9 },
    { table: 7, game_type: 'nlh', stakes: '2/5', max: 9 },
    { table: 8, game_type: 'nlh', stakes: '5/10', max: 9 },
    { table: 9, game_type: 'nlh', stakes: '5/10', max: 9 },
    { table: 10, game_type: 'plo', stakes: '1/2', max: 9 },
    { table: 11, game_type: 'plo', stakes: '1/2', max: 9 },
    { table: 12, game_type: 'plo', stakes: '2/5', max: 9 },
    { table: 13, game_type: 'mixed', stakes: '5/10', max: 9 },
    { table: 14, game_type: 'nlh', stakes: '1/2', max: 9 },
    { table: 15, game_type: 'nlh', stakes: '2/5', max: 9 },
];

// Dealer names (8 dealers)
const DEALER_ROSTER = [
    { name: 'Mike Torres', skill: 5, games: ['nlhe', 'plo'] },
    { name: 'Jenny Park', skill: 4, games: ['nlhe', 'plo', 'mixed'] },
    { name: 'Carlos Vega', skill: 4, games: ['nlhe'] },
    { name: 'Diana Chen', skill: 5, games: ['nlhe', 'plo', 'mixed', 'stud'] },
    { name: 'Roberto Cruz', skill: 3, games: ['nlhe'] },
    { name: 'Amy Tanaka', skill: 4, games: ['nlhe', 'plo'] },
    { name: 'Marcus Brown', skill: 3, games: ['nlhe', 'plo'] },
    { name: 'Sarah Kim', skill: 5, games: ['nlhe', 'plo', 'mixed'] },
];

// ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CLUB JAQK — Full Room Setup for Table Tablet Testing');
    console.log('═══════════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════
    //  PHASE 1: Add 80 new players
    // ═══════════════════════════════════════════════════
    console.log('── Phase 1: Creating 80 new players ─────────────────\n');

    const memberRows = NEW_PLAYERS.map((p, i) => {
        const tier = pick(TIERS);
        const config = TIER_CONFIG[tier];
        const roll = Math.random();
        let expiryDate, status;
        if (roll < 0.05) {
            expiryDate = ago(rand(1, 15));
            status = 'expired';
        } else if (roll < 0.1) {
            expiryDate = future(rand(1, 5));
            status = 'active';
        } else {
            expiryDate = future(rand(config.expiryRange[0], config.expiryRange[1]));
            status = 'active';
        }

        return {
            venue_id: VENUE_ID,
            member_number: `JAQK-${String(21 + i).padStart(5, '0')}`,
            qr_code: `CMD-${VENUE_ID}-${uuid().substring(0, 8)}`,
            first_name: p.first,
            last_name: p.last,
            email: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@email.com`,
            phone: `555200${String(1001 + i)}`,
            id_type: pick(['drivers_license', 'passport', 'state_id']),
            membership_tier: tier,
            membership_status: status,
            membership_expires: expiryDate,
            total_visits: rand(config.visitRange[0], config.visitRange[1]),
            total_hours_played: rand(config.hoursRange[0], config.hoursRange[1]),
            last_visit: ago(rand(0, 7)),
            address: { street: `${rand(100, 9999)} Oak Ave`, city: 'Houston', state: 'TX', zip: '77002' },
            notes: i % 10 === 0 ? 'Regular player — good for the game' : null,
            comp_balance: rand(0, 200),
        };
    });

    const { data: newMembers, error: mErr } = await sb
        .from('commander_members')
        .insert(memberRows)
        .select('id, first_name, last_name, membership_tier, member_number');

    if (mErr) {
        console.error(`  ❌ commander_members: ${mErr.message}`);
        errors++;
    } else {
        inserted += newMembers.length;
        console.log(`  ✅ ${newMembers.length} new players created`);
        const tierCounts = {};
        newMembers.forEach(m => { tierCounts[m.membership_tier] = (tierCounts[m.membership_tier] || 0) + 1; });
        Object.entries(tierCounts).forEach(([t, c]) => console.log(`     ${c} × ${t}`));
    }

    // Fetch ALL members (old 20 + new 80) for seating
    const { data: allMembers } = await sb
        .from('commander_members')
        .select('id, first_name, last_name, membership_tier, member_number')
        .eq('venue_id', VENUE_ID);

    console.log(`\n  Total members in Club JAQK: ${allMembers?.length || 0}\n`);

    // ═══════════════════════════════════════════════════
    //  PHASE 2: Time-billing sessions (20+ hrs for ALL players)
    // ═══════════════════════════════════════════════════
    console.log('── Phase 2: Creating time sessions (20+ hrs each) ────\n');

    // First, end any existing active sessions so we don't conflict
    const { error: endErr } = await sb
        .from('commander_table_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'system' })
        .eq('venue_id', VENUE_ID)
        .eq('status', 'active');

    if (endErr) console.log(`  ⚠️  Could not end old sessions: ${endErr.message}`);
    else console.log('  ✅ Ended any existing active sessions');

    // Create new active sessions for ALL members
    const usedSeats = new Set();
    const timeSessions = (allMembers || []).map((m, i) => {
        let tableNum, seatNum, key;
        do {
            tableNum = rand(1, 20);
            seatNum = rand(1, 9);
            key = `${tableNum}-${seatNum}`;
        } while (usedSeats.has(key));
        usedSeats.add(key);

        return {
            venue_id: VENUE_ID,
            member_id: m.id,
            player_name: `${m.first_name} ${m.last_name}`,
            table_number: tableNum,
            seat_number: seatNum,
            time_allocated_minutes: rand(1200, 1800), // 20-30 hours
            time_added_minutes: pick([0, 0, 0, 60, 120]),
            started_at: new Date(Date.now() - rand(1, 3) * 3600000).toISOString(),
            ended_at: null,
            membership_tier: m.membership_tier,
            member_number: m.member_number,
            status: 'active',
            ended_by: null,
        };
    });

    const { data: tsResult, error: tsErr } = await sb
        .from('commander_table_sessions')
        .insert(timeSessions)
        .select('id');

    if (tsErr) {
        console.error(`  ❌ commander_table_sessions: ${tsErr.message}`);
        errors++;
    } else {
        inserted += tsResult?.length || timeSessions.length;
        console.log(`  ✅ ${tsResult?.length || timeSessions.length} active sessions — all players have 20-30 hrs`);
    }

    // ═══════════════════════════════════════════════════
    //  PHASE 3: Open running games on tables 1-15
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 3: Opening games on 15 tables ──────────────\n');

    // Get existing tables
    const { data: existingTables } = await sb
        .from('commander_tables')
        .select('id, table_number')
        .eq('venue_id', VENUE_ID)
        .order('table_number');

    const tableMap = {};
    (existingTables || []).forEach(t => { tableMap[t.table_number] = t.id; });

    // Close any old running games
    await sb
        .from('commander_games')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('venue_id', VENUE_ID)
        .in('status', ['running', 'waiting']);

    const gameRows = [];
    for (const gc of GAME_CONFIGS) {
        const tableId = tableMap[gc.table];
        if (!tableId) {
            console.log(`  ⚠️  Table ${gc.table} not found in DB, skipping`);
            continue;
        }
        gameRows.push({
            venue_id: VENUE_ID,
            table_id: tableId,
            game_type: gc.game_type,
            stakes: gc.stakes,
            max_players: gc.max,
            status: 'running',
            started_at: new Date(Date.now() - rand(2, 8) * 3600000).toISOString(),
            current_players: 0, // Will be updated by seating
        });
    }

    const { data: games, error: gErr } = await sb
        .from('commander_games')
        .insert(gameRows)
        .select('id, table_id, game_type, stakes');

    if (gErr) {
        console.error(`  ❌ commander_games: ${gErr.message}`);
        errors++;
    } else {
        inserted += games.length;
        console.log(`  ✅ ${games.length} games opened`);
        games.forEach(g => {
            const tNum = Object.entries(tableMap).find(([_, id]) => id === g.table_id)?.[0];
            console.log(`     Table ${tNum}: ${g.game_type.toUpperCase()} ${g.stakes}`);
        });

        // Update tables to 'in_use' and link current_game_id
        for (const g of games) {
            await sb
                .from('commander_tables')
                .update({ status: 'in_use', current_game_id: g.id, game_type: g.game_type, stakes: g.stakes })
                .eq('id', g.table_id);
        }
    }

    // ═══════════════════════════════════════════════════
    //  PHASE 4: Seat players at tables (7-9 per table)
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 4: Seating players at tables ───────────────\n');

    if (games && games.length > 0 && allMembers && allMembers.length > 0) {
        // Clean old seats for this venue's games
        for (const g of games) {
            await sb.from('commander_seats').delete().eq('game_id', g.id);
        }

        const shuffledMembers = [...allMembers].sort(() => Math.random() - 0.5);
        let memberIdx = 0;
        let totalSeated = 0;
        const seatRows = [];

        for (const game of games) {
            const numPlayers = rand(7, 9); // near-full tables
            for (let seat = 1; seat <= numPlayers && memberIdx < shuffledMembers.length; seat++) {
                const m = shuffledMembers[memberIdx++];
                const buyinAmounts = { '1/2': [100, 200, 300], '2/5': [200, 500, 1000], '5/10': [500, 1000, 2000] };
                const buyins = buyinAmounts[game.stakes] || [200, 500];

                seatRows.push({
                    game_id: game.id,
                    seat_number: seat,
                    player_name: `${m.first_name} ${m.last_name}`,
                    status: seat <= numPlayers - 1 ? 'occupied' : pick(['occupied', 'away']),
                    buyin_amount: pick(buyins),
                    seated_at: new Date(Date.now() - rand(1, 6) * 3600000).toISOString(),
                });
                totalSeated++;
            }
        }

        const { data: seatResult, error: sErr } = await sb
            .from('commander_seats')
            .insert(seatRows)
            .select('id');

        if (sErr) {
            console.error(`  ❌ commander_seats: ${sErr.message}`);
            errors++;
        } else {
            inserted += seatResult?.length || seatRows.length;
            console.log(`  ✅ ${seatResult?.length || seatRows.length} players seated across ${games.length} tables`);
        }

        // Update current_players on each game
        for (const game of games) {
            const seatedAtGame = seatRows.filter(s => s.game_id === game.id && s.status === 'occupied').length;
            await sb
                .from('commander_games')
                .update({ current_players: seatedAtGame })
                .eq('id', game.id);
        }
    }

    // ═══════════════════════════════════════════════════
    //  PHASE 5: Clock in dealers with active rotations
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 5: Clocking in dealers ─────────────────────\n');

    // Upsert dealers into commander_dealers
    const dealerRows = DEALER_ROSTER.map((d, i) => ({
        venue_id: VENUE_ID,
        name: d.name,
        employee_id: `DLR-${String(i + 1).padStart(3, '0')}`,
        skill_level: d.skill,
        certified_games: d.games,
        status: 'active',
        notes: `Certified for ${d.games.join(', ')}`,
    }));

    // Check existing dealers
    const { data: existingDealers } = await sb
        .from('commander_dealers')
        .select('id, name')
        .eq('venue_id', VENUE_ID);

    let DEALER_IDS = [];
    if (existingDealers && existingDealers.length >= 8) {
        DEALER_IDS = existingDealers.map(d => ({ id: d.id, name: d.name }));
        console.log(`  ✅ ${existingDealers.length} dealers already exist, using them`);
    } else {
        const { data: dResult, error: dErr } = await sb
            .from('commander_dealers')
            .insert(dealerRows)
            .select('id, name');

        if (dErr) {
            console.error(`  ❌ commander_dealers: ${dErr.message}`);
            errors++;
        } else {
            DEALER_IDS = dResult.map(d => ({ id: d.id, name: d.name }));
            inserted += dResult.length;
            console.log(`  ✅ ${dResult.length} dealers registered`);
        }
    }

    // Create active dealer rotations — assign each dealer to a table
    if (DEALER_IDS.length > 0 && games && games.length > 0) {
        // End any existing open rotations
        await sb
            .from('commander_dealer_rotations')
            .update({ ended_at: new Date().toISOString(), duration_minutes: 30 })
            .eq('venue_id', VENUE_ID)
            .is('ended_at', null);

        const today = new Date().toISOString().split('T')[0];
        const rotationRows = [];

        for (let i = 0; i < DEALER_IDS.length && i < games.length; i++) {
            const dealer = DEALER_IDS[i];
            const game = games[i];
            const tableNum = Object.entries(tableMap).find(([_, id]) => id === game.table_id)?.[0];

            rotationRows.push({
                venue_id: VENUE_ID,
                dealer_id: dealer.id,
                dealer_name: dealer.name,
                table_number: parseInt(tableNum) || (i + 1),
                rotation_date: today,
                started_at: new Date(Date.now() - rand(10, 45) * 60000).toISOString(), // started 10-45 min ago
                ended_at: null, // still active
                break_after: i === 3 || i === 7, // some dealers scheduled for break after
            });
        }

        const { data: rotResult, error: rotErr } = await sb
            .from('commander_dealer_rotations')
            .insert(rotationRows)
            .select('id');

        if (rotErr) {
            console.error(`  ❌ commander_dealer_rotations: ${rotErr.message}`);
            errors++;
        } else {
            inserted += rotResult?.length || rotationRows.length;
            console.log(`  ✅ ${rotResult?.length || rotationRows.length} dealers clocked in at tables`);
            rotationRows.forEach(r => {
                console.log(`     ${r.dealer_name} → Table ${r.table_number}${r.break_after ? ' (break next)' : ''}`);
            });
        }
    }

    // ═══════════════════════════════════════════════════
    //  DONE
    // ═══════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  COMPLETE: ${inserted} rows inserted, ${errors} errors`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (errors > 0) process.exit(1);
})();
