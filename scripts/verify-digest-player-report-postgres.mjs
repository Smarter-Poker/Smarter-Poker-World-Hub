/** Runs the actual report migration and financial boundary fixture in a private DB. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const bin = process.env.PHASE6_POSTGRES_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(path.join(tmpdir(), 'digest-report-pg-'));
const socket = path.join(dir, 'socket');
const data = path.join(dir, 'data');
mkdirSync(socket);
const run = (name, args) => execFileSync(path.join(bin, name), args, { cwd: root, stdio: 'inherit' });
let started = false;
try {
    run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-k ${socket} -p 56474 -h ''`, 'start']);
    started = true;
    const version = execFileSync(path.join(bin, 'psql'), ['-X', '-At', '-h', socket, '-p', '56474', '-d', 'postgres', '-c', 'SHOW server_version_num'], { encoding: 'utf8' }).trim();
    if (Math.floor(Number(version) / 10000) !== 17) throw new Error('Digest qualification requires PostgreSQL 17');
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '56474', '-d', 'postgres',
        '-f', '__tests__/digest-player-report.sql',
        '-f', 'supabase/migrations/20261027183951_digest_player_report_bbj_and_result_breakdown.sql',
        '-f', '__tests__/digest-player-report-assert.sql']);
    run('createdb', ['-h', socket, '-p', '56474', 'spins_report']);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '56474', '-d', 'spins_report',
        '-f', '__tests__/digest-spins-spend.sql',
        '-f', 'supabase/migrations/20261028150757_digest_spins_and_spend.sql',
        '-f', 'supabase/migrations/20261028151456_digest_promo_wallet_payouts.sql',
        '-f', 'supabase/migrations/20261028152704_digest_profit_fractional_diamonds.sql',
        '-f', '__tests__/digest-spins-spend-assert.sql']);
    run('createdb', ['-h', socket, '-p', '56474', 'house_figures']);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '56474', '-d', 'house_figures',
        '-f', '__tests__/digest-house-figures.sql',
        '-f', 'supabase/migrations/20261111220642_digest_bbj_rake_and_horse_cash_chips.sql',
        '-f', '__tests__/digest-house-figures-assert.sql',
        '-f', '__tests__/digest-daily-results.sql',
        '-f', 'supabase/migrations/20261112140947_digest_kingfish_player_totals.sql',
        '-f', '__tests__/digest-kingfish-assert.sql',
        '-f', 'supabase/migrations/20261112140952_digest_daily_chip_reconciliation.sql',
        '-f', 'supabase/migrations/20261112141236_digest_daily_results_bounded_plan.sql',
        '-f', 'supabase/migrations/20261112141734_digest_daily_chip_supply_verification.sql',
        '-f', 'supabase/migrations/20261113154407_digest_tournaments_reconcile_on_start_day.sql',
        '-f', 'supabase/migrations/20261113154919_digest_start_day_index_ranges.sql',
        '-f', 'supabase/migrations/20261113160502_digest_start_day_primary_key_probe.sql',
        '-f', '__tests__/digest-daily-results-assert.sql',
        '-f', '__tests__/digest-tournament-start-day-assert.sql',
        '-f', '__tests__/digest-daily-results-snapshot-before.sql',
        '-f', 'supabase/migrations/20261114163320_digest_daily_results_are_computed_before_the_digest.sql',
        '-f', '__tests__/digest-daily-results-snapshot-assert.sql']);
    // Promo controls (Dan, 2026-11-14): Welcome Back only for never-funded
    // players, the ledger write guard, the digest's promo chips and rule
    // check, the agent daily cap and the cashier's union/club names.
    run('createdb', ['-h', socket, '-p', '56474', 'promo_controls']);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '56474', '-d', 'promo_controls',
        '-f', '__tests__/promo-controls.sql',
        '-f', 'supabase/migrations/20261114163112_welcome_back_only_for_players_who_never_received_chips.sql',
        '-f', 'supabase/migrations/20261114163728_digest_promo_chips_agent_to_player_and_automated.sql',
        '-f', 'supabase/migrations/20261114171206_welcome_back_refused_at_the_ledger_write.sql',
        '-f', 'supabase/migrations/20261114171319_digest_promo_rule_check.sql',
        '-f', 'supabase/migrations/20261114174204_agent_promo_daily_cap.sql',
        '-f', 'supabase/migrations/20261114174518_cashier_history_names_the_union_or_club_that_sent.sql',
        '-f', '__tests__/promo-controls-assert.sql']);
    console.log('Digest PostgreSQL qualification passed: ' + JSON.stringify([
        'supabase/migrations/20261027183951_digest_player_report_bbj_and_result_breakdown.sql',
        'supabase/migrations/20261028150757_digest_spins_and_spend.sql',
        'supabase/migrations/20261028151456_digest_promo_wallet_payouts.sql',
        'supabase/migrations/20261028152704_digest_profit_fractional_diamonds.sql',
        'supabase/migrations/20261111220642_digest_bbj_rake_and_horse_cash_chips.sql',
        'supabase/migrations/20261112140947_digest_kingfish_player_totals.sql',
        'supabase/migrations/20261112140952_digest_daily_chip_reconciliation.sql',
        'supabase/migrations/20261112141236_digest_daily_results_bounded_plan.sql',
        'supabase/migrations/20261112141734_digest_daily_chip_supply_verification.sql',
        'supabase/migrations/20261113154407_digest_tournaments_reconcile_on_start_day.sql',
        'supabase/migrations/20261113154919_digest_start_day_index_ranges.sql',
        'supabase/migrations/20261113160502_digest_start_day_primary_key_probe.sql',
        'supabase/migrations/20261114163320_digest_daily_results_are_computed_before_the_digest.sql',
        'supabase/migrations/20261114163112_welcome_back_only_for_players_who_never_received_chips.sql',
        'supabase/migrations/20261114163728_digest_promo_chips_agent_to_player_and_automated.sql',
        'supabase/migrations/20261114171206_welcome_back_refused_at_the_ledger_write.sql',
        'supabase/migrations/20261114171319_digest_promo_rule_check.sql',
        'supabase/migrations/20261114174204_agent_promo_daily_cap.sql',
        'supabase/migrations/20261114174518_cashier_history_names_the_union_or_club_that_sent.sql',
    ].map(file => ({ path: file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), postgresMajor: 17 }))));
} finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', 'stop']);
    rmSync(dir, { recursive: true, force: true });
}
