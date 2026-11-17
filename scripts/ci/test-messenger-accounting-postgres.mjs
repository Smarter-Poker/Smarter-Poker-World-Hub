// Isolated PostgreSQL qualification, using the same exact PG17 provisioning as other CI fixtures.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const bin = process.env.PHASE6_POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const parent = process.platform === 'darwin' ? execFileSync('python3', ['/Users/smarter.poker/Documents/ssd-tools/ssd-paths.py', 'work'], { encoding: 'utf8' }).trim() : process.env.RUNNER_TEMP;
if (!parent || (process.platform === 'darwin' && statSync(parent).dev === statSync('/').dev)) throw new Error('Verified external/runner scratch required');
const dir = mkdtempSync(path.join(parent, 'ms-pg-'));
const socket = path.join(dir, 's'), data = path.join(dir, 'data'); mkdirSync(socket);
const run = (name, args) => execFileSync(path.join(bin, name), args, { cwd: root, stdio: 'inherit' });
const connection = ['-h', socket, '-p', '55489']; let started = false;
try {
    const version = execFileSync(path.join(bin, 'postgres'), ['--version'], { encoding: 'utf8' });
    if (!/\b17\./.test(version)) throw new Error('PostgreSQL 17 required');
    run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'server.log'), '-o', `-k ${socket} -p 55489 -h ''`, 'start']); started = true;
    run('psql', [...connection, '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-f', '__tests__/sql/messenger-statements.sql']);
    run('createdb', [...connection, 'payments']);
    run('psql', [...connection, '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'payments', '-f', '__tests__/sql/messenger-payments.sql']);
    const invoice = '00000000-0000-4000-8000-000000000060';
    const actor = '00000000-0000-4000-8000-000000000001';
    const sql = query => execFileSync(path.join(bin, 'psql'), [...connection, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-d', 'payments', '-c', query], { encoding: 'utf8' }).trim();
    sql(`INSERT INTO settlement_invoices(id,club_id,invoice_number,invoice_type,net_amount,status,breakdown) VALUES('${invoice}','00000000-0000-4000-8000-000000000010','RACE','union_weekly_squareup',300,'generated','{"union_id":"00000000-0000-4000-8000-000000000099"}');`);
    const race = (operation, expected, reference) => new Promise((resolve,reject) => {
        const child=spawn(path.join(bin,'psql'), [...connection,'-X','-At','-v','ON_ERROR_STOP=1','-d','payments','-c',`SET test.service='true'; SELECT fn_accounting_record_received_payment('${actor}','${invoice}','${operation}',100,${expected},'${reference}');`]);
        let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>out+=v);child.once('error',reject);child.once('exit',code=>resolve({code,out}));
    });
    const same=await Promise.all([race('00000000-0000-4000-8000-000000000070',300,'race-1'),race('00000000-0000-4000-8000-000000000070',300,'race-1')]);
    if(same.some(r=>r.code!==0)||sql(`SELECT count(*) FROM accounting_received_payments WHERE invoice_id='${invoice}'`)!=='1') throw new Error('Concurrent retry duplicated: '+JSON.stringify(same));
    const different=await Promise.all([race('00000000-0000-4000-8000-000000000071',200,'race-2'),race('00000000-0000-4000-8000-000000000072',200,'race-3')]);
    if(different.filter(r=>r.code===0).length!==1||!different.some(r=>r.out.includes('Invoice changed'))||sql(`SELECT sum(amount) FROM accounting_received_payments WHERE invoice_id='${invoice}'`)!=='200.00') throw new Error('Concurrent balance protection failed: '+JSON.stringify(different));
    console.log('Concurrent operation replay and stale-balance race passed');
    const readerPath='supabase/migrations/20261117190800_union_readers_include_received_payments.sql';
    const readerSql=readFileSync(path.join(root,readerPath),'utf8');
    const readerOriginal=path.join(dir,'reader-original.sql');
    const rollback=readerSql.split('/*\n')[1].split('*/')[0];
    writeFileSync(readerOriginal,rollback.slice(rollback.indexOf('CREATE OR REPLACE FUNCTION'),rollback.lastIndexOf('COMMIT;')));
    run('psql',[...connection,'-X','-v','ON_ERROR_STOP=1','-d','payments','-f','__tests__/sql/messenger-balance-readers.sql','-f',readerOriginal,'-f',readerPath,'-f','__tests__/sql/messenger-balance-readers-assert.sql']);
    run('createdb', [...connection, 'delivery']);
    const migration = readFileSync(path.join(root, 'supabase/migrations/20261117190600_weekly_statement_messenger_delivery.sql'), 'utf8');
    const prior = migration.split('/*\n')[1].split('*/')[0];
    const original = path.join(dir, 'original.sql'); writeFileSync(original, prior);
    run('psql', [...connection, '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'delivery', '-f', '__tests__/sql/messenger-delivery.sql', '-f', original, '-f', 'supabase/migrations/20261117190600_weekly_statement_messenger_delivery.sql', '-f', '__tests__/sql/messenger-delivery-assert.sql']);
} finally { if (started) run('pg_ctl', ['-D', data, '-m', 'fast', 'stop']); rmSync(dir, { recursive: true, force: true }); }
