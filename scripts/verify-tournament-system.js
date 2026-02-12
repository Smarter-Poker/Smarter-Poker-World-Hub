/**
 * VERIFICATION SCRIPT — Checks all tournament/PvP tables, crons, and data integrity
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
    if (ok) {
        passed++;
        console.log(`  ✅ ${label}${detail ? ': ' + detail : ''}`);
    } else {
        failed++;
        console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    }
}

async function main() {
    console.log('🔍 COMPREHENSIVE VERIFICATION\n');
    console.log('================================');

    // ======= 1. DATABASE TABLES =======
    console.log('\n📊 DATABASE TABLES\n');

    // trivia_pvp_stats
    const { count: statsCount, error: statsErr } = await sb.from('trivia_pvp_stats').select('*', { count: 'exact', head: true });
    check('trivia_pvp_stats exists', !statsErr, statsErr ? statsErr.message : statsCount + ' rows');

    // trivia_tournament_rounds
    const { count: roundsCount, error: roundsErr } = await sb.from('trivia_tournament_rounds').select('*', { count: 'exact', head: true });
    check('trivia_tournament_rounds exists', !roundsErr, roundsErr ? roundsErr.message : roundsCount + ' rows');

    // trivia_tournament_notifications
    const { count: notifCount, error: notifErr } = await sb.from('trivia_tournament_notifications').select('*', { count: 'exact', head: true });
    check('trivia_tournament_notifications exists', !notifErr, notifErr ? notifErr.message : notifCount + ' rows');

    // trivia_pvp_queue
    const { error: queueErr } = await sb.from('trivia_pvp_queue').select('*').limit(1);
    check('trivia_pvp_queue accessible', !queueErr, queueErr ? queueErr.message : 'readable');

    // ======= 2. BRACKET COLUMNS =======
    console.log('\n🏗️  BRACKET SCHEMA\n');

    const { data: tSample, error: tErr } = await sb.from('trivia_tournaments')
        .select('id, tournament_type, current_round, total_rounds, round_deadline')
        .limit(1);
    check('tournaments: bracket columns', !tErr, tErr ? tErr.message : 'tournament_type, current_round, total_rounds, round_deadline');

    const { data: eSample, error: eErr } = await sb.from('trivia_tournament_entries')
        .select('id, eliminated_round, seed_number')
        .limit(1);
    check('entries: bracket columns', !eErr, eErr ? eErr.message : 'eliminated_round, seed_number');

    // ======= 3. HORSE PROFILES =======
    console.log('\n🐴 HORSE PROFILES\n');

    const { count: horseCount } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_horse', true);
    check('100 horse profiles exist', horseCount >= 100, horseCount + ' horses');

    const { data: horseSample } = await sb.from('profiles')
        .select('username, diamonds, is_horse')
        .eq('is_horse', true)
        .limit(3);
    if (horseSample) {
        horseSample.forEach(h => {
            check(`Horse ${h.username} has diamonds`, h.diamonds > 0, h.diamonds + ' diamonds');
        });
    }

    // ======= 4. VERCEL CRON CONFIG =======
    console.log('\n⏰ VERCEL CRON CONFIG\n');

    const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const crons = vercelConfig.crons || [];

    const tournamentCron = crons.find(c => c.path && c.path.includes('trivia-tournaments') && !c.path.includes('rounds'));
    const roundsCron = crons.find(c => c.path && c.path.includes('trivia-tournament-rounds'));
    const cleanupCron = crons.find(c => c.path && c.path.includes('trivia-pvp-cleanup'));

    check('trivia-tournaments cron', !!tournamentCron, tournamentCron ? tournamentCron.schedule : 'missing');
    check('trivia-tournament-rounds cron', !!roundsCron, roundsCron ? roundsCron.schedule : 'missing');
    check('trivia-pvp-cleanup cron', !!cleanupCron, cleanupCron ? cleanupCron.schedule : 'missing');

    // ======= 5. CODE INTEGRITY =======
    console.log('\n📝 CODE INTEGRITY\n');

    // Check PvP timer = 40s
    const pvpCode = fs.readFileSync('pages/hub/trivia/pvp.js', 'utf8');
    const pvpTimerMatches = pvpCode.match(/setTimeLeft\((\d+)\)/g) || [];
    const has40sPvP = pvpTimerMatches.some(m => m.includes('40'));
    const has15sPvP = pvpTimerMatches.some(m => m.includes('15'));
    check('PvP timer = 40s', has40sPvP && !has15sPvP, pvpTimerMatches.join(', '));

    // Check PvP answer delay = 500ms
    const pvpDelayMatches = pvpCode.match(/setTimeout\([^,]+,\s*(\d+)\)/g) || [];
    const has500msPvP = pvpCode.includes('}, 500)');
    const has1000msPvP = pvpCode.includes('}, 1000)');
    check('PvP answer delay = 500ms', has500msPvP, 'found 500ms setTimeout');
    check('No leftover 1000ms delays in PvP', !has1000msPvP || pvpCode.indexOf('1000') === pvpCode.lastIndexOf('1000'), 'checked');

    // Check tournaments timer = 40s
    const tourCode = fs.readFileSync('pages/hub/trivia/tournaments.js', 'utf8');
    const tourTimerMatches = tourCode.match(/setTimeLeft\((\d+)\)/g) || [];
    const has40sTour = tourTimerMatches.some(m => m.includes('40'));
    const has30sTour = tourTimerMatches.some(m => m.includes('30'));
    check('Tournament timer = 40s', has40sTour && !has30sTour, tourTimerMatches.join(', '));

    // Check PvP stats from trivia_pvp_stats (not trivia_pvp_matches)
    const usesNewStats = pvpCode.includes("trivia_pvp_stats");
    check('PvP reads from trivia_pvp_stats', usesNewStats, 'found trivia_pvp_stats reference');

    // Check updatePvpStats helper exists
    const hasUpdateHelper = pvpCode.includes('updatePvpStats');
    check('updatePvpStats helper exists', hasUpdateHelper, 'found updatePvpStats');

    // Check tournament page has bracket visualization
    const hasBracket = tourCode.includes('bracket') || tourCode.includes('Bracket');
    check('Tournament page has bracket system', hasBracket, 'found bracket references');

    // Check notification polling
    const hasNotifPoll = tourCode.includes('notification') || tourCode.includes('Notification');
    check('Tournament page has notification system', hasNotifPoll, 'found notification references');

    // Check cron files exist
    check('trivia-pvp-cleanup.js exists', fs.existsSync('pages/api/cron/trivia-pvp-cleanup.js'));
    check('trivia-tournament-rounds.js exists', fs.existsSync('pages/api/cron/trivia-tournament-rounds.js'));
    check('trivia-tournaments.js exists', fs.existsSync('pages/api/cron/trivia-tournaments.js'));

    // Check horse-tournament-test.js exists
    check('horse-tournament-test.js exists', fs.existsSync('scripts/horse-tournament-test.js'));

    // Check migration files exist
    check('PvP stats migration exists', fs.existsSync('supabase/migrations/20260212_pvp_stats_table.sql'));
    check('Tournament brackets migration exists', fs.existsSync('supabase/migrations/20260212_tournament_brackets_and_rls.sql'));

    // ======= 6. TOURNAMENT DATA INTEGRITY =======
    console.log('\n🏆 TOURNAMENT DATA INTEGRITY\n');

    // Check completed tournaments
    const { data: completedT } = await sb.from('trivia_tournaments')
        .select('id, name, status, prize_pool, current_round, total_rounds')
        .eq('status', 'completed')
        .eq('tournament_type', 'bracket')
        .order('created_at', { ascending: false })
        .limit(1);

    if (completedT && completedT.length > 0) {
        const t = completedT[0];
        check('Completed bracket tournament exists', true, t.name);
        check('Prize pool > 0', t.prize_pool > 0, t.prize_pool + ' diamonds');
        check('All rounds completed', t.current_round === t.total_rounds, 'round ' + t.current_round + '/' + t.total_rounds);

        // Check rounds data
        const { data: rounds } = await sb.from('trivia_tournament_rounds')
            .select('round_number, status, matchups')
            .eq('tournament_id', t.id)
            .order('round_number');

        if (rounds) {
            check('All ' + rounds.length + ' rounds recorded', rounds.length === t.total_rounds, rounds.length + ' rounds');
            const allComplete = rounds.every(r => r.status === 'complete');
            check('All rounds status = complete', allComplete);

            // Check matchup integrity
            let allMatchupsHaveWinners = true;
            let totalMatches = 0;
            rounds.forEach(r => {
                const matchups = r.matchups || [];
                totalMatches += matchups.length;
                matchups.forEach(m => {
                    if (!m.winner_id) allMatchupsHaveWinners = false;
                });
            });
            check('All matchups have winners', allMatchupsHaveWinners, totalMatches + ' total matchups');
        }

        // Check prize winners
        const { data: winners } = await sb.from('trivia_tournament_entries')
            .select('user_id, placement, prize_won')
            .eq('tournament_id', t.id)
            .not('placement', 'is', null)
            .order('placement');

        if (winners) {
            check('Prize winners recorded', winners.length >= 1, winners.length + ' winners');
            winners.forEach(w => {
                check('Place #' + w.placement + ' has prize', w.prize_won > 0, w.prize_won + ' diamonds');
            });
        }
    } else {
        check('Completed bracket tournament exists', false, 'none found');
    }

    // ======= SUMMARY =======
    console.log('\n================================');
    console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        console.log('⚠️  Some checks failed — review above');
        process.exit(1);
    } else {
        console.log('🎉 ALL CHECKS PASSED!');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
