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
        '-f', '__tests__/digest-spins-spend-assert.sql']);
    console.log('Digest PostgreSQL qualification passed: ' + JSON.stringify([
        'supabase/migrations/20261027183951_digest_player_report_bbj_and_result_breakdown.sql',
        'supabase/migrations/20261028150757_digest_spins_and_spend.sql',
        'supabase/migrations/20261028151456_digest_promo_wallet_payouts.sql',
    ].map(file => ({ path: file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), postgresMajor: 17 }))));
} finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', 'stop']);
    rmSync(dir, { recursive: true, force: true });
}
