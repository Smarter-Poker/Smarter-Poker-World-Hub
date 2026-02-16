/**
 * Commander Deep Verification — checks FK integrity, data quality, orphan rows
 */
import { readFileSync } from 'fs';

const envPath = new URL('.env.local', import.meta.url).pathname;
const env = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2].replace(/\\n$/, '');
});

const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

async function query(table, select = '*', filter = '') {
    const url = `${SB}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter ? '&' + filter : ''}&limit=500`;
    const res = await fetch(url, { headers: hdrs });
    if (!res.ok) return { error: await res.text(), data: [] };
    return { data: await res.json(), error: null };
}

async function count(table) {
    const res = await fetch(`${SB}/rest/v1/${table}?select=id&limit=0`, {
        headers: { ...hdrs, 'Prefer': 'count=exact' },
    });
    const range = res.headers.get('content-range');
    return range ? parseInt(range.split('/')[1]) || 0 : 0;
}

let issues = [];
function issue(msg) { issues.push(msg); console.log(`  ⚠️  ${msg}`); }
function ok(msg) { console.log(`  ✅ ${msg}`); }

async function main() {
    console.log('\n🔬 COMMANDER DEEP VERIFICATION\n' + '═'.repeat(60) + '\n');

    // ─── 1. ROW COUNTS ───
    console.log('── 1. Row Counts ──');
    const tables = [
        'commander_staff', 'commander_tables', 'commander_games', 'commander_seats',
        'commander_waitlist', 'commander_waitlist_history', 'commander_dealers',
        'commander_dealer_rotations', 'commander_incidents', 'commander_service_requests',
        'commander_player_sessions', 'commander_notifications', 'commander_player_preferences',
        'commander_tournaments', 'commander_tournament_entries', 'commander_promotions',
        'commander_promotion_awards', 'commander_comp_rates', 'commander_comp_balances',
        'commander_comp_transactions', 'commander_analytics_daily', 'commander_player_stats',
        'commander_leaderboards', 'commander_leaderboard_entries', 'commander_audit_logs',
        'commander_leagues', 'commander_league_standings', 'commander_tax_events',
        'commander_self_exclusions', 'commander_spending_limits', 'commander_streams',
        'commander_hand_history', 'commander_home_groups', 'commander_home_members',
        'commander_home_games', 'commander_home_rsvps', 'commander_venue_posts',
        'commander_venue_photos', 'commander_venue_reviews', 'commander_venue_followers',
        'commander_club_announcements', 'commander_wait_time_predictions',
        'commander_dealer_marketplace', 'commander_equipment_rentals', 'commander_export_jobs',
        'commander_rate_limits', 'commander_system_health', 'commander_admin_settings',
    ];
    let totalRows = 0;
    let seeded = 0;
    for (const t of tables) {
        const c = await count(t);
        totalRows += c;
        if (c > 0) { seeded++; ok(`${t}: ${c} rows`); }
        else issue(`${t}: EMPTY (0 rows)`);
    }
    console.log(`\n  TOTALS: ${totalRows} rows across ${seeded}/${tables.length} tables\n`);

    // ─── 2. FK INTEGRITY: venue_id exists in poker_venues ───
    console.log('── 2. FK Integrity: venue_id ──');
    const { data: venues } = await query('poker_venues', 'id');
    const venueIds = new Set(venues.map(v => v.id));
    for (const t of ['commander_staff', 'commander_tables', 'commander_waitlist',
        'commander_tournaments', 'commander_promotions', 'commander_analytics_daily']) {
        const { data } = await query(t, 'id,venue_id');
        const bad = data.filter(r => r.venue_id && !venueIds.has(r.venue_id));
        if (bad.length > 0) issue(`${t}: ${bad.length} rows with orphan venue_id`);
        else ok(`${t}: all venue_ids valid (${data.length} rows)`);
    }

    // ─── 3. FK INTEGRITY: player_id exists in profiles ───
    console.log('\n── 3. FK Integrity: player_id ──');
    const { data: profiles } = await query('profiles', 'id');
    const profileIds = new Set(profiles.map(p => p.id));
    for (const t of ['commander_waitlist', 'commander_player_sessions',
        'commander_player_stats', 'commander_comp_balances', 'commander_leaderboard_entries']) {
        const { data } = await query(t, 'id,player_id');
        const bad = data.filter(r => r.player_id && !profileIds.has(r.player_id));
        if (bad.length > 0) issue(`${t}: ${bad.length} rows with orphan player_id`);
        else ok(`${t}: all player_ids valid (${data.length} rows)`);
    }

    // ─── 4. FK INTEGRITY: staff_id references ───
    console.log('\n── 4. FK Integrity: staff references ──');
    const { data: staff } = await query('commander_staff', 'id');
    const staffIds = new Set(staff.map(s => s.id));
    for (const t of ['commander_dealer_rotations', 'commander_incidents', 'commander_service_requests']) {
        const fkCol = t === 'commander_incidents' ? 'reported_by' : t === 'commander_dealer_rotations' ? 'dealer_id' : 'assigned_to';
        const { data } = await query(t, `id,${fkCol}`);
        // dealer_rotations references commander_dealers, not staff
        if (t === 'commander_dealer_rotations') {
            const { data: dealers } = await query('commander_dealers', 'id');
            const dealerIds = new Set(dealers.map(d => d.id));
            const bad = data.filter(r => r[fkCol] && !dealerIds.has(r[fkCol]));
            if (bad.length > 0) issue(`${t}: ${bad.length} rows with orphan ${fkCol}`);
            else ok(`${t}: all ${fkCol} valid (${data.length} rows)`);
        } else {
            const bad = data.filter(r => r[fkCol] && !staffIds.has(r[fkCol]));
            if (bad.length > 0) issue(`${t}: ${bad.length} rows with orphan ${fkCol}`);
            else ok(`${t}: all ${fkCol} valid (${data.length} rows)`);
        }
    }

    // ─── 5. Table→Game→Seat chain integrity ───
    console.log('\n── 5. Table → Game → Seat Chain ──');
    const { data: gameData } = await query('commander_games', 'id,table_id');
    const tableRes = await query('commander_tables', 'id');
    const tableIdSet = new Set(tableRes.data.map(t => t.id));
    const badGames = gameData.filter(g => g.table_id && !tableIdSet.has(g.table_id));
    if (badGames.length > 0) issue(`commander_games: ${badGames.length} orphan table_ids`);
    else ok(`commander_games: all table_ids valid (${gameData.length} rows)`);

    const gameIdSet = new Set(gameData.map(g => g.id));
    const { data: seatData } = await query('commander_seats', 'id,game_id');
    const badSeats = seatData.filter(s => s.game_id && !gameIdSet.has(s.game_id));
    if (badSeats.length > 0) issue(`commander_seats: ${badSeats.length} orphan game_ids`);
    else ok(`commander_seats: all game_ids valid (${seatData.length} rows)`);

    // ─── 6. Tournament→Entries chain ───
    console.log('\n── 6. Tournament → Entries Chain ──');
    const { data: tourneys } = await query('commander_tournaments', 'id');
    const tourneyIds = new Set(tourneys.map(t => t.id));
    const { data: entries } = await query('commander_tournament_entries', 'id,tournament_id');
    const badEntries = entries.filter(e => e.tournament_id && !tourneyIds.has(e.tournament_id));
    if (badEntries.length > 0) issue(`commander_tournament_entries: ${badEntries.length} orphan tournament_ids`);
    else ok(`commander_tournament_entries: all tournament_ids valid (${entries.length} rows)`);

    // ─── 7. Promotion→Awards chain ───
    console.log('\n── 7. Promotion → Awards Chain ──');
    const { data: promos } = await query('commander_promotions', 'id');
    const promoIds = new Set(promos.map(p => p.id));
    const { data: awards } = await query('commander_promotion_awards', 'id,promotion_id');
    const badAwards = awards.filter(a => a.promotion_id && !promoIds.has(a.promotion_id));
    if (badAwards.length > 0) issue(`commander_promotion_awards: ${badAwards.length} orphan promotion_ids`);
    else ok(`commander_promotion_awards: all promotion_ids valid (${awards.length} rows)`);

    // ─── 8. Leaderboard→Entries chain ───
    console.log('\n── 8. Leaderboard → Entries Chain ──');
    const { data: lbs } = await query('commander_leaderboards', 'id');
    const lbIds = new Set(lbs.map(l => l.id));
    const { data: lbEntries } = await query('commander_leaderboard_entries', 'id,leaderboard_id');
    const badLBEs = lbEntries.filter(e => e.leaderboard_id && !lbIds.has(e.leaderboard_id));
    if (badLBEs.length > 0) issue(`commander_leaderboard_entries: ${badLBEs.length} orphan leaderboard_ids`);
    else ok(`commander_leaderboard_entries: all leaderboard_ids valid (${lbEntries.length} rows)`);

    // ─── 9. Home Group→Members→Games→RSVPs chain ───
    console.log('\n── 9. Home Groups Chain ──');
    const { data: hgs } = await query('commander_home_groups', 'id');
    const hgIds = new Set(hgs.map(h => h.id));
    const { data: hm } = await query('commander_home_members', 'id,group_id');
    const badHM = hm.filter(m => m.group_id && !hgIds.has(m.group_id));
    if (badHM.length > 0) issue(`commander_home_members: ${badHM.length} orphan group_ids`);
    else ok(`commander_home_members: all group_ids valid (${hm.length} rows)`);

    const { data: hGames } = await query('commander_home_games', 'id,group_id');
    const badHG = hGames.filter(g => g.group_id && !hgIds.has(g.group_id));
    if (badHG.length > 0) issue(`commander_home_games: ${badHG.length} orphan group_ids`);
    else ok(`commander_home_games: all group_ids valid (${hGames.length} rows)`);

    const hGameIds = new Set(hGames.map(g => g.id));
    const { data: rsvps } = await query('commander_home_rsvps', 'id,game_id');
    const badRSVP = rsvps.filter(r => r.game_id && !hGameIds.has(r.game_id));
    if (badRSVP.length > 0) issue(`commander_home_rsvps: ${badRSVP.length} orphan game_ids`);
    else ok(`commander_home_rsvps: all game_ids valid (${rsvps.length} rows)`);

    // ─── 10. Data Quality: Analytics dates are recent ───
    console.log('\n── 10. Data Quality ──');
    const { data: analytics } = await query('commander_analytics_daily', 'date', 'order=date.desc&limit=1');
    if (analytics.length) {
        const latest = new Date(analytics[0].date);
        const daysAgo = Math.floor((Date.now() - latest.getTime()) / 86400000);
        if (daysAgo <= 1) ok(`Latest analytics date: ${analytics[0].date} (today/yesterday)`);
        else issue(`Latest analytics: ${analytics[0].date} — ${daysAgo} days old`);
    }

    // Check tournament status distribution
    const { data: tData } = await query('commander_tournaments', 'status');
    const tStatusMap = {};
    tData.forEach(t => { tStatusMap[t.status] = (tStatusMap[t.status] || 0) + 1; });
    ok(`Tournament statuses: ${JSON.stringify(tStatusMap)}`);

    // Check waitlist position uniqueness
    const { data: wl } = await query('commander_waitlist', 'position,game_type,stakes');
    ok(`Waitlist entries: ${wl.length}, positions range: 1-${Math.max(...wl.map(w => w.position))}`);

    // ─── SUMMARY ───
    console.log('\n' + '═'.repeat(60));
    if (issues.length === 0) {
        console.log('🎉 ALL CHECKS PASSED — 0 issues found!');
    } else {
        console.log(`⚠️  ${issues.length} issues found:`);
        issues.forEach((i, idx) => console.log(`  ${idx + 1}. ${i}`));
    }
    console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
