// The large-inbox fixture generator (scripts/dev/messenger-large-inbox.mjs)
// must reproduce, byte for byte, the seed and cleanup that were reviewed and
// run on 2026-11-06 (fixtures/messenger-large-inbox-20261106), refuse inputs
// that could be interpolated into SQL, and only ever name the designated test
// identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  seedSql, cleanupSql, fixtureNames, TEST_ACCOUNT_ID, FIXTURE_SENDER_ID, SEND_FIXTURE_TITLE, MAX_COUNT,
} from '../scripts/dev/messenger-large-inbox.mjs';
import { FIXTURE_TITLE } from '../scripts/ci/messenger-send-live-check.mjs';

const reviewed = name => readFileSync(new URL(`./fixtures/messenger-large-inbox-20261106/${name}`, import.meta.url), 'utf8');
const doBlock = sql => sql.slice(0, sql.indexOf('END $$;') + 'END $$;'.length);

test('tag 20261106 reproduces the reviewed seed and cleanup exactly', () => {
  assert.equal(doBlock(seedSql({ tag: '20261106', count: 720 })), reviewed('seed.sql').trimEnd());
  assert.equal(doBlock(cleanupSql({ tag: '20261106', count: 720 })), reviewed('cleanup.sql').trimEnd());
});

test('seed and cleanup derive the same owned identities for any tag', () => {
  const f = fixtureNames('20261201-b');
  const seed = seedSql({ tag: '20261201-b', count: 50 });
  const cleanup = cleanupSql({ tag: '20261201-b', count: 50 });
  for (const value of [f.conversationSeed, f.sendFixtureSeed, f.groupName, f.marker, f.messageSeed]) {
    assert.ok(seed.includes(value), `seed names ${value}`);
    assert.ok(cleanup.includes(value), `cleanup names ${value}`);
  }
  assert.match(seed, /n int := 50;/);
  assert.match(cleanup, /n int := 50;/);
  assert.match(cleanup, /generate_series\(1,50\)/);
});

test('the send fixture title is the one the live send check requires', () => {
  assert.equal(SEND_FIXTURE_TITLE, FIXTURE_TITLE);
});

test('inputs that are not a plain tag or a bounded integer are refused', () => {
  for (const tag of ["2026'; drop table profiles;--", '2026-11-06', '20261106-UPPER', '', undefined, '20261106-' + 'x'.repeat(17)]) {
    assert.throws(() => seedSql({ tag, count: 10 }), /tag must be/);
    assert.throws(() => cleanupSql({ tag, count: 10 }), /tag must be/);
  }
  for (const count of [0, -1, 1.5, MAX_COUNT + 1, '10; select 1', NaN]) {
    assert.throws(() => seedSql({ tag: '20261106', count }), /count must be/);
    assert.throws(() => cleanupSql({ tag: '20261106', count }), /count must be/);
  }
});

test('only the designated test identities are ever named', () => {
  const uuids = sql => new Set(sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g));
  for (const sql of [seedSql({ tag: '20261106', count: 720 }), cleanupSql({ tag: '20261106', count: 720 })]) {
    assert.deepEqual([...uuids(sql)].sort(), [FIXTURE_SENDER_ID, TEST_ACCOUNT_ID].sort());
  }
});

test('seed refuses to run twice and cleanup refuses data it does not own', () => {
  const seed = seedSql({ tag: '20261106', count: 720 });
  assert.match(seed, /Owned IDs already exist; inspect durable outcome before retry/);
  assert.match(seed, /Designated test identities changed/);
  assert.match(seed, /Unexpected profile side effect/);
  const cleanup = cleanupSql({ tag: '20261106', count: 720 });
  assert.match(cleanup, /user_id IS DISTINCT FROM official/);
  for (const table of ['message_reactions', 'live_help_tickets', 'accounting_conversations', 'accounting_invoice_deliveries', 'notifications']) {
    assert.ok(cleanup.includes(table), `cleanup guards ${table}`);
  }
  assert.match(cleanup, /Fixture changed or acquired other data; preserve and inspect/);
  assert.match(cleanup, /lock_timeout','3s'/);
  assert.ok(!/\b(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(seed + cleanup), 'DML only: no DDL');
});

test('the CLI prints SQL and nothing else', () => {
  const script = new URL('../scripts/dev/messenger-large-inbox.mjs', import.meta.url).pathname;
  const out = execFileSync(process.execPath, [script, 'cleanup', '--tag', '20261106', '--count', '720'], { encoding: 'utf8' });
  assert.equal(out, cleanupSql({ tag: '20261106', count: 720 }));
  assert.throws(() => execFileSync(process.execPath, [script, 'seed', '--tag', 'x'], { stdio: 'pipe' }));
  assert.throws(() => execFileSync(process.execPath, [script, 'wipe', '--tag', '20261106'], { stdio: 'pipe' }));
});
