// Your Bankroll Data (2026-11-28): export everything (paged past 1,000 rows,
// formula-safe CSVs, a valid ZIP), delete everything in a safe order with an
// honest report, and undo an import exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DATA_SOURCES, DELETE_ORDER, buildZip, bankrollFileUrls, deleteBankrollData, deleteEach, exportFiles,
  findLastImport, importedRows, ownedBankrollFile, readBankrollData, tableCsv,
} from '../src/lib/bankroll/bankrollDataIo.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/**
 * An in-memory PostgREST stand-in: eq / in / not-is-null / like filters,
 * order by id, range, limit, head counts and deletes. `deny` lists tables the
 * session may read but not delete from (row security without a DELETE policy
 * deletes nothing and reports no error). `fail` makes a table's reads fail.
 */
function memoryDb(tables, { deny = [], fail = [], refs = {} } = {}) {
  const log = [];
  const client = {
    log,
    from(table) {
      const state = { table, filters: [], op: 'select', range: null, limit: null, head: false, count: false };
      const rowsOfTable = () => (tables[table] = tables[table] || []);
      const match = (row) => state.filters.every((f) => f(row));
      const run = () => {
        log.push({ table, op: state.op });
        if (state.op === 'select' && fail.includes(table)) return { data: null, error: { message: 'boom' } };
        if (state.op === 'delete') {
          if (deny.includes(table)) return { data: null, error: null };
          const doomed = rowsOfTable().filter(match);
          for (const [refTable, fk] of Object.entries(refs[table] || {})) {
            const ids = new Set(doomed.map((r) => r.id));
            if ((tables[refTable] || []).some((r) => ids.has(r[fk]))) return { data: null, error: { message: `still referenced by ${refTable}` } };
          }
          tables[table] = rowsOfTable().filter((r) => !match(r));
          return { data: null, error: null, count: doomed.length };
        }
        let rows = rowsOfTable().filter(match).sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (state.desc) rows = rows.reverse();
        const count = rows.length;
        if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
        if (state.limit !== null) rows = rows.slice(0, state.limit);
        return { data: state.head ? null : rows, error: null, count: state.count ? count : null };
      };
      const b = {
        select(_cols, opts = {}) { state.head = !!opts.head; state.count = !!opts.count; return b; },
        delete() { state.op = 'delete'; return b; },
        eq(col, v) { state.filters.push((r) => r[col] === v); return b; },
        in(col, vs) { state.filters.push((r) => vs.includes(r[col])); return b; },
        not(col, op, v) { if (op === 'is' && v === null) state.filters.push((r) => r[col] !== null && r[col] !== undefined); return b; },
        like(col, pattern) {
          const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 's');
          state.filters.push((r) => re.test(String(r[col] ?? '')));
          return b;
        },
        order(col, { ascending = true } = {}) { if (col === 'created_at') state.desc = !ascending; return b; },
        range(a, z) { state.range = [a, z]; return b; },
        limit(n) { state.limit = n; return b; },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return b;
    },
  };
  return client;
}

const fileUrl = (bucket, p) => `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/${bucket}/${p}`;

function fixture() {
  const ledger = Array.from({ length: 2345 }, (_, i) => ({
    id: `l${String(i).padStart(5, '0')}`, user_id: UID, category: 'poker_cash', gross_in: 100, gross_out: 50,
    entry_date: '2026-01-01', notes: i === 0 ? '=HYPERLINK("http://x")' : null, original_entry_id: null,
    media_urls: i === 1 ? [fileUrl('user-media', `${UID}/bankroll/a.jpg`)] : null,
  }));
  ledger.push({ id: 'l99999', user_id: UID, category: 'poker_cash', gross_in: 1, gross_out: 1, original_entry_id: 'l00002' });
  return {
    bankroll_ledger: [...ledger, { id: 'x1', user_id: OTHER, category: 'poker_cash' }],
    bankroll_trips: [{ id: 't1', user_id: UID, trip_type: 'trip' }, { id: 't2', user_id: UID, trip_type: 'series' }],
    staking_arrangements: [{ id: 'd1', user_id: UID }],
    staking_sessions: [{ id: 's1', arrangement_id: 'd1', ledger_entry_id: 'l00003' }, { id: 's2', arrangement_id: 'dX' }],
    bankroll_receipts: [{ id: 'r1', user_id: UID, image_url: fileUrl('user-media', `${UID}/bankroll/r.jpg`) }],
    w2g_forms: [{ id: 'w1', user_id: UID, file_url: fileUrl('images', `${UID}/w2g.pdf`) }],
    player_notes: [{ id: 'p1', user_id: UID, photo_url: fileUrl('avatars', `${OTHER}/face.jpg`) }],
    bankroll_locations: [{ id: 'v1', user_id: UID, name: 'Aria' }],
    bankroll_alerts: [{ id: 'a1', user_id: UID }],
    toke_gigs: [{ id: 'g1', user_id: UID }],
    toke_downs: [{ id: 'dn1', user_id: UID, gig_id: 'g1' }],
  };
}

test('the export reads every source past 1,000 rows, staking sessions by the player\'s own deals', async () => {
  const db = memoryDb(fixture());
  const steps = [];
  const data = await readBankrollData(db, UID, { onProgress: (d, t) => steps.push([d, t]) });
  assert.equal(data.ledger.length, 2346, 'every page, and nobody else\'s rows');
  assert.deepEqual(data.staking_sessions.map((s) => s.id), ['s1']);
  assert.equal(steps.at(-1)[0], DATA_SOURCES.length);
});

test('a failed read stops the export instead of writing an empty table', async () => {
  const db = memoryDb(fixture(), { fail: ['toke_downs'] });
  await assert.rejects(readBankrollData(db, UID), /Could not read the Toke Downs/);
});

test('CSV cells are formula-safe and the files say USD', async () => {
  const data = await readBankrollData(memoryDb(fixture()), UID);
  const files = exportFiles(data, { exportedAt: '2026-11-28T12:00:00Z', day: '2026-11-28' });
  const names = files.map((f) => f.name);
  for (const n of ['bankroll-data.json', 'csv/ledger.csv', 'csv/trips.csv', 'csv/series.csv', 'csv/files.csv', 'README.txt']) assert.ok(names.includes(n), n);
  const ledgerCsv = files.find((f) => f.name === 'csv/ledger.csv').content;
  assert.match(ledgerCsv, /"'=HYPERLINK\(""http:\/\/x""\)"/, 'a formula becomes text');
  assert.equal(ledgerCsv.split('\r\n').length, 2347);
  assert.match(files.find((f) => f.name === 'README.txt').content, /US dollars/);
  assert.equal(JSON.parse(files[0].content).currency, 'USD');
  assert.equal(tableCsv([{ a: { b: 1 }, c: true }]), 'a,c\r\n"{""b"":1}",true');
});

test('the ZIP opens with a standard unzip', { skip: !hasUnzip() && 'unzip is not installed' }, () => {
  const zip = buildZip([{ name: 'a.txt', content: 'hello' }, { name: 'csv/b.csv', content: 'x,y\r\n1,2' }], new Date(2026, 10, 28, 12, 0, 0));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const file = path.join(dir, 'out.zip');
  fs.writeFileSync(file, zip);
  const out = execFileSync('unzip', ['-t', file]).toString();
  assert.match(out, /No errors detected/);
  assert.equal(execFileSync('unzip', ['-p', file, 'csv/b.csv']).toString(), 'x,y\r\n1,2');
});

test('only files the Bankroll Manager stored for this player may be removed', () => {
  assert.equal(ownedBankrollFile(fileUrl('user-media', `${UID}/bankroll/a.jpg`), UID), true);
  assert.equal(ownedBankrollFile(fileUrl('user-media', `${UID}/avatar.jpg`), UID), false, 'not a bankroll file');
  assert.equal(ownedBankrollFile(fileUrl('images', `${UID}/w2g.pdf`), UID), true);
  assert.equal(ownedBankrollFile(fileUrl('player-photos', `${UID}/p.jpg`), UID), true);
  assert.equal(ownedBankrollFile(fileUrl('avatars', `${OTHER}/face.jpg`), UID), false);
  assert.equal(ownedBankrollFile(fileUrl('user-media', `${UID}/bankroll/../../x`), UID), false);
  assert.equal(ownedBankrollFile('https://example.com/a.jpg', UID), false);
});

test('delete runs in a safe order and the report counts what is really left', async () => {
  const tables = fixture();
  // The real foreign keys that are NOT cascades: these fail if the order is wrong.
  const refs = {
    bankroll_ledger: { bankroll_ledger: 'original_entry_id', staking_sessions: 'ledger_entry_id' },
    bankroll_trips: { bankroll_ledger: 'trip_id' },
    bankroll_locations: { bankroll_ledger: 'location_id', bankroll_alerts: 'location_id', bankroll_trips: 'location_id' },
    staking_arrangements: { staking_sessions: 'arrangement_id' },
    toke_gigs: { toke_downs: 'gig_id' },
  };
  const db = memoryDb(tables, { deny: ['bankroll_alerts'], refs });
  const data = await readBankrollData(db, UID);
  const removed = [];
  const report = await deleteBankrollData(db, UID, data, { removeFile: async (u) => { removed.push(u); return true; } });
  assert.deepEqual(report.files, { removed: 3, failed: 0, kept: 1 }, 'the avatar of another player is not touched');
  const by = Object.fromEntries(report.sources.map((s) => [s.key, s]));
  assert.equal(by.ledger.left, 0);
  assert.equal(by.ledger.deleted, 2346);
  assert.equal(by.staking_sessions.left, 0);
  assert.equal(by.venues.left, 0, 'venues go after the ledger and trips');
  assert.equal(by.alerts.left, 1, 'no DELETE policy: reported, not called cleared');
  assert.equal(by.alerts.error, 'Your Session Could Not Delete These Rows');
  assert.equal(report.ok, false);
  assert.ok(tables.bankroll_ledger.some((r) => r.user_id === OTHER), 'another player\'s rows stay');
  assert.ok(tables.staking_sessions.some((r) => r.id === 's2'), 'another deal\'s sessions stay');
  assert.ok(DELETE_ORDER.indexOf('staking_sessions') < DELETE_ORDER.indexOf('staking_deals'));
  assert.ok(DELETE_ORDER.indexOf('ledger_revisions') < DELETE_ORDER.indexOf('ledger'));
  assert.ok(DELETE_ORDER.indexOf('ledger') < DELETE_ORDER.indexOf('trips'));
  assert.ok(DELETE_ORDER.indexOf('alerts') < DELETE_ORDER.indexOf('venues'));
});

test('a step that fails is reported and the rest still run', async () => {
  const tables = fixture();
  const db = memoryDb(tables, { refs: { bankroll_locations: { bankroll_alerts: 'location_id' } } });
  tables.bankroll_alerts[0].location_id = 'v1';
  const data = await readBankrollData(db, UID);
  const failing = memoryDb(tables, { deny: ['bankroll_alerts'], refs: { bankroll_locations: { bankroll_alerts: 'location_id' } } });
  const report = await deleteBankrollData(failing, UID, data, { removeFile: async () => false });
  const venues = report.sources.find((s) => s.key === 'venues');
  assert.equal(venues.left, 1);
  assert.match(venues.error, /still referenced/);
  assert.equal(report.sources.find((s) => s.key === 'ledger').left, 0);
  assert.equal(report.files.failed, 3);
});

test('undo finds the newest import and exactly its rows, past 1,000', async () => {
  const rows = [];
  for (let i = 0; i < 1500; i++) rows.push({ id: `a${String(i).padStart(4, '0')}`, user_id: UID, notes: '[Import imp-20261127-aaaaaa] x', created_at: '2026-11-27T10:00:00Z', category: 'poker_cash' });
  for (let i = 0; i < 30; i++) rows.push({ id: `b${i}`, user_id: UID, notes: `[Import imp-20261128-bbbbbb]${i % 2 ? ' note' : ''}`, created_at: '2026-11-28T10:00:00Z', category: 'expense' });
  rows.push({ id: 'c1', user_id: UID, notes: 'typed [Import imp-20261128-bbbbbb]', created_at: '2026-11-28T11:00:00Z' });
  rows.push({ id: 'c2', user_id: OTHER, notes: '[Import imp-20261129-zzzzzz]', created_at: '2026-11-29T11:00:00Z' });
  const db = memoryDb({ bankroll_ledger: rows });
  assert.deepEqual(await findLastImport(db, UID), { id: 'imp-20261128-bbbbbb', createdAt: '2026-11-28T10:00:00Z' });
  assert.equal((await importedRows(db, UID, 'imp-20261128-bbbbbb')).length, 30);
  assert.equal((await importedRows(db, UID, 'imp-20261127-aaaaaa')).length, 1500);
  assert.equal(await findLastImport(memoryDb({ bankroll_ledger: [] }), UID), null);
});

test('deleteEach reports every row it could not delete', async () => {
  const seen = [];
  const result = await deleteEach(['a', 'b', 'c', 'd', 'e'], async (id) => { seen.push(id); if (id === 'c') throw new Error('Entry Not Found'); });
  assert.equal(result.deleted, 4);
  assert.deepEqual(result.failed, [{ id: 'c', error: 'Entry Not Found' }]);
  assert.equal(seen.length, 5);
});

test('file links are listed from every table that holds one', () => {
  const urls = bankrollFileUrls({ ledger: [{ id: 'l', media_urls: ['u1', { url: 'u2' }] }], toke_expenses: [{ id: 't', receipt_url: 'u3' }], w2g_forms: [{ id: 'w', file_url: '' }] });
  assert.deepEqual(urls.map((u) => u.url), ['u1', 'u2', 'u3']);
});

function hasUnzip() {
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; }
}
