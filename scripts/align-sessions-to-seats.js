#!/usr/bin/env node
/**
 * Align time sessions with actual seating
 * 
 * Problem: commander_table_sessions had random table/seat numbers,
 * but commander_seats has players at specific game tables.
 * The dealer sessions API queries by table_number, so they must match.
 *
 * This script:
 * 1. Gets all occupied seats (from commander_seats + commander_games)
 * 2. Gets all active time sessions (from commander_table_sessions)
 * 3. Matches each seated player to their time session via member name
 * 4. Updates time session table_number + seat_number to match actual seating
 * 5. Creates sessions for seated players who don't have one
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

(async () => {
    console.log('=== Aligning Time Sessions with Table Seating ===\n');

    // 1. Get all active games + their table numbers
    const { data: games } = await sb
        .from('commander_games')
        .select('id, table_id')
        .eq('venue_id', VENUE_ID)
        .in('status', ['running', 'waiting']);

    const { data: tables } = await sb
        .from('commander_tables')
        .select('id, table_number')
        .eq('venue_id', VENUE_ID);

    const tableNumById = {};
    (tables || []).forEach(t => { tableNumById[t.id] = t.table_number; });
    const gameTableNum = {};
    (games || []).forEach(g => { gameTableNum[g.id] = tableNumById[g.table_id]; });

    // 2. Get all occupied seats
    const gameIds = (games || []).map(g => g.id);
    const { data: seats } = await sb
        .from('commander_seats')
        .select('id, game_id, seat_number, player_name, status')
        .in('game_id', gameIds)
        .in('status', ['occupied', 'away']);

    console.log('  Seated players:', (seats || []).length);

    // 3. Get all active time sessions
    const { data: sessions } = await sb
        .from('commander_table_sessions')
        .select('id, player_name, table_number, seat_number, member_id, time_allocated_minutes, time_added_minutes, started_at')
        .eq('venue_id', VENUE_ID)
        .eq('status', 'active');

    console.log('  Active time sessions:', (sessions || []).length);

    // 4. Build lookup: player_name -> session
    const sessionByName = {};
    (sessions || []).forEach(s => { sessionByName[s.player_name] = s; });

    // 5. For each seated player, update their time session to match table+seat
    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const seat of (seats || [])) {
        const tableNum = gameTableNum[seat.game_id];
        if (!tableNum) continue;

        const session = sessionByName[seat.player_name];
        if (session) {
            // Update time session's table/seat to match actual seating
            if (session.table_number !== tableNum || session.seat_number !== seat.seat_number) {
                const { error } = await sb
                    .from('commander_table_sessions')
                    .update({ table_number: tableNum, seat_number: seat.seat_number })
                    .eq('id', session.id);

                if (error) {
                    // Might be unique constraint — try deleting and reinserting
                    await sb.from('commander_table_sessions').delete().eq('id', session.id);
                    const { error: e2 } = await sb.from('commander_table_sessions').insert({
                        venue_id: VENUE_ID,
                        member_id: session.member_id,
                        player_name: session.player_name,
                        table_number: tableNum,
                        seat_number: seat.seat_number,
                        time_allocated_minutes: session.time_allocated_minutes,
                        time_added_minutes: session.time_added_minutes,
                        started_at: session.started_at,
                        status: 'active',
                        membership_tier: session.membership_tier,
                        member_number: session.member_number,
                    });
                    if (e2) { errors++; console.log('    ERR:', seat.player_name, e2.message); }
                    else updated++;
                } else {
                    updated++;
                }
            }
            // Remove from lookup so we don't double-match
            delete sessionByName[seat.player_name];
        } else {
            // Player is seated but has no time session — create one
            const { data: member } = await sb
                .from('commander_members')
                .select('id, membership_tier, member_number')
                .eq('venue_id', VENUE_ID)
                .ilike('first_name', seat.player_name.split(' ')[0])
                .ilike('last_name', seat.player_name.split(' ').slice(1).join(' '))
                .maybeSingle();

            const { error } = await sb.from('commander_table_sessions').insert({
                venue_id: VENUE_ID,
                member_id: member?.id || null,
                player_name: seat.player_name,
                table_number: tableNum,
                seat_number: seat.seat_number,
                time_allocated_minutes: rand(1200, 1800),
                time_added_minutes: 0,
                started_at: new Date(Date.now() - rand(1, 3) * 3600000).toISOString(),
                status: 'active',
                membership_tier: member?.membership_tier || null,
                member_number: member?.member_number || null,
            });
            if (error) { errors++; console.log('    ERR creating:', seat.player_name, error.message); }
            else created++;
        }
    }

    // 6. End leftover sessions not matched to any seated player (orphans)
    const matchedNames = new Set((seats || []).map(s => s.player_name));
    let ended = 0;
    for (const [name, session] of Object.entries(sessionByName)) {
        if (!matchedNames.has(name)) {
            await sb.from('commander_table_sessions')
                .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'system' })
                .eq('id', session.id);
            ended++;
        }
    }

    // 7. Verify: count sessions per table
    const { data: finalSessions } = await sb
        .from('commander_table_sessions')
        .select('table_number, seat_number, player_name')
        .eq('venue_id', VENUE_ID)
        .eq('status', 'active')
        .order('table_number')
        .order('seat_number');

    const byTable = {};
    (finalSessions || []).forEach(s => {
        if (!byTable[s.table_number]) byTable[s.table_number] = [];
        byTable[s.table_number].push(s);
    });

    console.log('\n--- Results ---');
    console.log('  Sessions updated:', updated);
    console.log('  Sessions created:', created);
    console.log('  Orphans ended:', ended);
    console.log('  Errors:', errors);
    console.log('\n--- Sessions per table (matching seats) ---');
    Object.entries(byTable).sort((a, b) => a[0] - b[0]).forEach(([t, arr]) => {
        console.log('  Table', t + ':', arr.length, 'sessions');
    });
    console.log('\n  Total active sessions:', finalSessions?.length || 0);
    console.log('\n=== DONE ===');
})();
