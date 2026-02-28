const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
let issues = [];
let passed = 0;

function check(label, condition, detail) {
    if (condition) { passed++; console.log('  ✅', label); }
    else { issues.push(label + (detail ? ': ' + detail : '')); console.log('  ❌', label, detail || ''); }
}

(async () => {
    console.log('══════════════════════════════════════════════');
    console.log('  FULL VERIFICATION SWEEP #2 — Club JAQK');
    console.log('══════════════════════════════════════════════\n');

    // ═══ 1. MEMBERS ═══
    console.log('── 1. MEMBERS ──');
    const { data: members, count: mCount } = await sb.from('commander_members').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID);
    check('100 members exist', mCount === 100, 'got ' + mCount);

    const noTier = (members || []).filter(m => !m.membership_tier);
    check('All members have membership_tier', noTier.length === 0, noTier.length + ' missing');

    const noExpiry = (members || []).filter(m => !m.membership_expires);
    check('All members have membership_expires', noExpiry.length === 0, noExpiry.length + ' missing');

    const noStatus = (members || []).filter(m => !m.membership_status);
    check('All members have membership_status', noStatus.length === 0, noStatus.length + ' missing');

    const validTiers = ['daily', 'weekly', 'monthly', 'yearly'];
    const badTiers = (members || []).filter(m => !validTiers.includes(m.membership_tier));
    check('All tiers valid (daily/weekly/monthly/yearly)', badTiers.length === 0, badTiers.map(m => m.membership_tier).join(','));

    const noVisits = (members || []).filter(m => m.total_visits === null || m.total_visits === undefined);
    check('All members have total_visits', noVisits.length === 0, noVisits.length + ' missing');

    const noHours = (members || []).filter(m => m.total_hours_played === null || m.total_hours_played === undefined);
    check('All members have total_hours_played', noHours.length === 0, noHours.length + ' missing');

    // ═══ 2. TIME SESSIONS ═══
    console.log('\n── 2. TIME SESSIONS ──');
    const { data: sessions, count: sCount } = await sb.from('commander_table_sessions').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID).eq('status', 'active');
    check('100 active time sessions', sCount === 100, 'got ' + sCount);

    const now = Date.now();
    const lowTime = (sessions || []).filter(s => {
        const alloc = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
        const elapsed = Math.floor((now - new Date(s.started_at).getTime()) / 1000);
        return (alloc - elapsed) < 20 * 3600; // less than 20 hours
    });
    check('All sessions have 20+ hrs remaining', lowTime.length === 0, lowTime.length + ' below 20hrs');

    // Check sessions are on tables 1-14 (where games are)
    const sessionTables = new Set((sessions || []).map(s => s.table_number));
    check('Sessions on tables with games', sessionTables.size > 0 && !sessionTables.has(16) && !sessionTables.has(17) && !sessionTables.has(18) && !sessionTables.has(19) && !sessionTables.has(20), 'tables: ' + [...sessionTables].sort((a, b) => a - b).join(','));

    // ═══ 3. GAMES ═══
    console.log('\n── 3. GAMES ──');
    const { data: games, count: gCount } = await sb.from('commander_games').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID).in('status', ['running', 'waiting']);
    check('15 active games', gCount === 15, 'got ' + gCount);

    const gameTypes = {};
    (games || []).forEach(g => {
        const k = g.game_type + ' ' + g.stakes;
        gameTypes[k] = (gameTypes[k] || 0) + 1;
    });
    console.log('    Game distribution:', JSON.stringify(gameTypes));

    // ═══ 4. SEATS ═══
    console.log('\n── 4. SEATS ──');
    const gameIds = (games || []).map(g => g.id);
    let seatCount = 0;
    if (gameIds.length > 0) {
        const { count: sc } = await sb.from('commander_seats').select('id', { count: 'exact' }).in('game_id', gameIds).eq('status', 'occupied');
        seatCount = sc || 0;
    }
    check('90+ occupied seats', seatCount >= 90, 'got ' + seatCount);

    // Check seats per table
    const { data: allSeats } = await sb.from('commander_seats').select('game_id, seat_number, player_name').in('game_id', gameIds).eq('status', 'occupied');
    const seatsByGame = {};
    (allSeats || []).forEach(s => {
        seatsByGame[s.game_id] = (seatsByGame[s.game_id] || 0) + 1;
    });
    const gameSeatCounts = Object.values(seatsByGame);
    check('All games have players seated', gameSeatCounts.every(c => c >= 1), 'min: ' + Math.min(...gameSeatCounts) + ' max: ' + Math.max(...gameSeatCounts));

    // ═══ 5. TABLES ═══
    console.log('\n── 5. TABLES ──');
    const { data: tables, count: tCount } = await sb.from('commander_tables').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID);
    check('20 tables total', tCount === 20, 'got ' + tCount);

    const inUse = (tables || []).filter(t => t.status === 'in_use');
    const available = (tables || []).filter(t => t.status === 'available');
    check('15 tables in_use', inUse.length === 15, 'got ' + inUse.length);
    check('5 tables available', available.length === 5, 'got ' + available.length);

    // ═══ 6. DEALERS ═══
    console.log('\n── 6. DEALERS ──');
    const { data: dealers, count: dCount } = await sb.from('commander_dealers').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID);
    check('8 dealers registered', dCount === 8, 'got ' + dCount);

    const activeDealers = (dealers || []).filter(d => d.is_active === true);
    check('7+ dealers active', activeDealers.length >= 7, 'got ' + activeDealers.length + ' active');

    // Check all dealers have name
    const noName = (dealers || []).filter(d => !d.name);
    check('All dealers have name column', noName.length === 0, noName.length + ' missing name');

    // ═══ 7. DEALER ROTATIONS ═══
    console.log('\n── 7. DEALER ROTATIONS ──');
    const { data: rotations, count: rCount } = await sb.from('commander_dealer_rotations').select('*', { count: 'exact' }).eq('venue_id', VENUE_ID).is('ended_at', null);
    check('8 active rotations', rCount === 8, 'got ' + rCount);

    const rotTables = new Set((rotations || []).map(r => r.table_number));
    check('Rotations at tables 1-8', rotTables.size === 8, 'tables: ' + [...rotTables].sort((a, b) => a - b).join(','));

    // FK join test
    const { data: fkTest, error: fkErr } = await sb.from('commander_dealer_rotations')
        .select('id, dealer_name, table_number, commander_dealers:dealer_id (id, name)')
        .eq('venue_id', VENUE_ID).is('ended_at', null).limit(1);
    check('Rotation FK join to dealers works', !fkErr, fkErr?.message || '');

    // ═══ 8. MUST-MOVE ═══
    console.log('\n── 8. MUST-MOVE GROUPS ──');
    const mmGroups = {};
    (games || []).forEach(g => {
        const k = g.game_type + '|' + g.stakes;
        if (!mmGroups[k]) mmGroups[k] = [];
        mmGroups[k].push(g);
    });
    const multiTableGroups = Object.entries(mmGroups).filter(([_, v]) => v.length >= 2);
    check('4 must-move groups (2+ tables same game)', multiTableGroups.length === 4, 'got ' + multiTableGroups.length);
    multiTableGroups.forEach(([k, v]) => console.log('    ', k, '=>', v.length, 'games'));

    // ═══ 9. WAITLIST ═══
    console.log('\n── 9. WAITLIST ──');
    const { count: wCount } = await sb.from('commander_waitlist').select('id', { count: 'exact' }).eq('venue_id', VENUE_ID).in('status', ['waiting', 'called']);
    check('20+ waitlist entries', wCount >= 20, 'got ' + wCount);

    // ═══ 10. SESSION-SEAT ALIGNMENT ═══
    console.log('\n── 10. SESSION-SEAT ALIGNMENT ──');
    // For each game table, verify sessions exist on that table number
    const { data: gameTables } = await sb.from('commander_games').select('id, table_id').eq('venue_id', VENUE_ID).in('status', ['running', 'waiting']);
    const tableIdToNum = {};
    (tables || []).forEach(t => { tableIdToNum[t.id] = t.table_number; });
    const activeTableNums = new Set((gameTables || []).map(g => tableIdToNum[g.table_id]).filter(Boolean));
    const sessionTableNums = new Set((sessions || []).map(s => s.table_number));

    let missingSessionTables = [];
    for (const tn of activeTableNums) {
        if (!sessionTableNums.has(tn)) missingSessionTables.push(tn);
    }
    check('Every game table has time sessions', missingSessionTables.length === 0, 'missing on tables: ' + missingSessionTables.join(','));

    // ═══ 11. VENUE SETTINGS ═══
    console.log('\n── 11. VENUE SETTINGS ──');
    const { data: vs } = await sb.from('commander_venue_settings').select('*').eq('venue_id', VENUE_ID).single();
    check('Venue settings exist', !!vs, 'no venue settings row');
    check('Time billing rate set', vs?.time_billing_rate > 0, 'rate: ' + vs?.time_billing_rate);

    // ═══ RESULTS ═══
    console.log('\n══════════════════════════════════════════════');
    console.log('  RESULTS: ' + passed + ' passed, ' + issues.length + ' failed');
    console.log('══════════════════════════════════════════════');
    if (issues.length > 0) {
        console.log('\n  ISSUES:');
        issues.forEach((i, idx) => console.log('  ' + (idx + 1) + '. ' + i));
    } else {
        console.log('\n  ✅ ALL CHECKS PASSED — 100% VERIFIED');
    }
})();
