#!/usr/bin/env node
/** Native lock-subcontract proof, not the complete publication/reward RPC. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mac = process.platform === 'darwin';
const workRoot = mac ? '/Volumes/SmarterWork/agent-work' : process.env.RUNNER_TEMP || process.env.TMPDIR;
assert(workRoot, 'Cloud execution needs a configured runner scratch directory');
const evidenceRoot = mac ? '/Volumes/SmarterArchives/agent-evidence' : join(workRoot, 'horse-lock-evidence');
if (mac) {
  assert.notEqual(statSync(workRoot).dev, statSync('/').dev, 'Work SSD must be mounted');
  assert.notEqual(statSync(evidenceRoot).dev, statSync('/').dev, 'Archive SSD must be mounted');
  const space = statfsSync(workRoot);
  assert(space.bavail * space.bsize >= 64 * 1024 * 1024, 'Work SSD needs 64 MiB free');
}
mkdirSync(evidenceRoot, { recursive: true });
const configuredPg = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const installedPg = existsSync('/usr/lib/postgresql') ? readdirSync('/usr/lib/postgresql')
  .sort((a, b) => Number(b) - Number(a)).map(version => `/usr/lib/postgresql/${version}/bin`) : [];
const pg = [process.env.PG_BIN, '/opt/homebrew/opt/postgresql@17/bin',
  configuredPg.status === 0 ? configuredPg.stdout.trim() : null, ...installedPg]
  .find(path => path && ['initdb', 'pg_ctl', 'psql'].every(bin => existsSync(join(path, bin))));
assert(pg, 'Native PostgreSQL binaries unavailable; do not skip this check');
const red = process.argv.includes('--legacy-candidate');
const outputArg = process.argv.indexOf('--output');
const output = outputArg < 0
  ? mkdtempSync(join(evidenceRoot, 'horse-profile-lock-'))
  : resolve(process.argv[outputArg + 1]);
assert(output.startsWith(`${evidenceRoot}/`), 'Evidence must stay on the archive SSD');
mkdirSync(output, { recursive: true });
const cluster = mkdtempSync(join(workRoot, 'horse-profile-lock-'));
const socket = join(cluster, 'socket');
mkdirSync(socket, { mode: 0o700 });
const data = join(cluster, 'data');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
env.TMPDIR = cluster;
const cases = [];
let running = false;
let locker;
let lockerDone;
let passed = false;

function command(bin, args, input, timeout = 15000) {
  const result = spawnSync(join(pg, bin), args, { input, encoding: 'utf8', env, timeout });
  if (result.error) throw result.error;
  return result;
}
const connection = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', socket,
  '-p', '55489', '-U', 'postgres', '-d', 'postgres'];
function sql(name, statement, { code, expected } = {}) {
  const result = command('psql', connection, `\\set VERBOSITY verbose\n${statement}\n`);
  writeFileSync(join(output, `${name}.log`), result.stdout + result.stderr);
  const ok = code
    ? result.status !== 0 && result.stderr.includes(` ${code}:`)
    : result.status === 0 && (expected === undefined || result.stdout.trim() === expected);
  cases.push({ name, passed: ok, expectedCode: code ?? null, exitCode: result.status });
  assert(ok, `${name}: ${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}
const author = '00000000-0000-4000-8000-000000000001';
const legacyPath = 'supabase/migrations/20260926143400_horse_video_reels_atomic_publisher.sql';
const migrationPath = 'supabase/migrations/20261019164500_horse_video_profile_lock_before_rewards.sql';
const source = readFileSync(join(root, legacyPath), 'utf8');
const migration = readFileSync(join(root, migrationPath), 'utf8');
const oldClause = migration.match(/v_old constant text := '([^']+)';/)?.[1];
const newClause = migration.match(/v_new constant text := '([^']+)';/)?.[1];
assert.equal(oldClause, 'FOR SHARE OF p, ca;');
assert.equal(newClause, 'FOR UPDATE OF p NOWAIT FOR SHARE OF ca NOWAIT;');
// Execute the actual maintained identity SELECT with its actual replacement.
const guard = source.match(/PERFORM 1\s+FROM public\.profiles p[\s\S]*?FOR SHARE OF p, ca;/)?.[0];
assert(guard, 'The maintained identity query moved: requalify the native fixture');
assert.equal(guard.split(oldClause).length, 2);
const candidateGuard = guard.replace(oldClause, red ? oldClause : newClause);
const fixtureFunction = (name, identityGuard) => `
CREATE OR REPLACE FUNCTION ${name}(v_author_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE existing_post uuid; existing_reel uuid; new_post uuid; new_reel uuid;
BEGIN
  ${identityGuard}
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive author'; END IF;
  SELECT p.id, r.id INTO existing_post, existing_reel
    FROM social_posts p JOIN social_reels r ON r.source_post_id=p.id
    WHERE p.author_id=v_author_id AND p.asset_key='yt:AAAAAAAAAAA';
  IF FOUND THEN RETURN jsonb_build_object('post',existing_post,'reel',existing_reel,'created',false); END IF;
  INSERT INTO social_posts(author_id,asset_key) VALUES(v_author_id,'yt:AAAAAAAAAAA') RETURNING id INTO new_post;
  INSERT INTO social_reels(source_post_id) VALUES(new_post) RETURNING id INTO new_reel;
  RETURN jsonb_build_object('post',new_post,'reel',new_reel,'created',true);
END $fixture$;`;
const call = (name) => `SET statement_timeout='400ms'; SELECT ${name}('${author}');`;
const noEffects = `SELECT (SELECT count(*) FROM social_posts)||':'||
  (SELECT count(*) FROM social_reels)||':'||(SELECT count(*) FROM rewards)||':'||
  (SELECT diamonds FROM profiles WHERE id='${author}');`;

try {
  const initialized = command('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust',
    '--auth-host=reject', '--no-locale', '--encoding=UTF8'], undefined, 30000);
  assert.equal(initialized.status, 0, initialized.stderr);
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses=''\nunix_socket_directories='${socket}'\nunix_socket_permissions=0700\nport=55489\nshared_buffers='16MB'\nmax_connections=10\n`);
  const started = command('pg_ctl', ['-D', data, '-l', join(cluster, 'server.log'), '-w', 'start'], undefined, 30000);
  assert.equal(started.status, 0, started.stderr);
  running = true;
  sql('fixture', `
CREATE TABLE profiles(id uuid PRIMARY KEY,is_horse boolean,status text,diamonds integer DEFAULT 0);
CREATE TABLE content_authors(profile_id uuid PRIMARY KEY REFERENCES profiles(id),is_active boolean);
CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid REFERENCES profiles(id),asset_key text,UNIQUE(author_id,asset_key));
CREATE TABLE social_reels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_post_id uuid UNIQUE REFERENCES social_posts(id));
CREATE TABLE rewards(post_id uuid PRIMARY KEY REFERENCES social_posts(id),author_id uuid);
-- A sequence is not rolled back: distinguish an attempted INSERT from an
-- entry refusal, even though both failed transactions leave zero rows.
CREATE SEQUENCE post_insert_attempts;
CREATE FUNCTION count_post_insert_attempt() RETURNS trigger LANGUAGE plpgsql AS $attempt$
BEGIN PERFORM nextval('post_insert_attempts'); RETURN NEW; END $attempt$;
CREATE TRIGGER count_post_insert BEFORE INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION count_post_insert_attempt();
CREATE FUNCTION ordinary_post_reward() RETURNS trigger LANGUAGE plpgsql AS $reward$
BEGIN
  PERFORM 1 FROM profiles WHERE id=NEW.author_id FOR UPDATE;
  UPDATE profiles SET diamonds=diamonds+1 WHERE id=NEW.author_id;
  INSERT INTO rewards VALUES(NEW.id,NEW.author_id);
  RETURN NEW;
END $reward$;
CREATE TRIGGER post_reward AFTER INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION ordinary_post_reward();
INSERT INTO profiles VALUES('${author}',true,'active',0);
INSERT INTO content_authors VALUES('${author}',true);
${fixtureFunction('publish_legacy', guard)}
${fixtureFunction('publish_candidate', candidateGuard)}
`);
  locker = spawn(join(pg, 'psql'), connection, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  lockerDone = new Promise((done, reject) => {
    locker.once('error', reject);
    locker.once('exit', (code) => code === 0 ? done() : reject(new Error(`locker exit ${code}`)));
  });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('locker readiness timed out')), 5000);
    let outputText = '';
    locker.stdout.on('data', chunk => {
      outputText += chunk.toString();
      if (outputText.includes('LOCK_READY')) { clearTimeout(timer); done(); }
    });
    locker.stderr.on('data', chunk => { clearTimeout(timer); reject(new Error(chunk.toString())); });
    locker.stdin.write(`BEGIN; SELECT id FROM profiles WHERE id='${author}' FOR SHARE;\n\\echo LOCK_READY\n`);
  });
  sql('red-legacy-share-upgrade', call('publish_legacy'), { code: '57014' });
  sql('legacy-rollback-no-effects', noEffects, { expected: '0:0:0:0' });
  sql('legacy-reached-insert', 'SELECT last_value FROM post_insert_attempts;', { expected: '1' });
  sql('candidate-refuses-before-insert', call('publish_candidate'), { code: '55P03' });
  sql('candidate-refusal-no-effects', noEffects, { expected: '0:0:0:0' });
  sql('candidate-never-reached-insert', 'SELECT last_value FROM post_insert_attempts;', { expected: '1' });
  locker.stdin.end('ROLLBACK;\n\\q\n');
  await lockerDone;
  locker = null;
  const first = JSON.parse(sql('green-publish-with-ordinary-reward', call('publish_candidate')));
  assert.equal(first.created, true);
  assert(first.post && first.reel);
  sql('ordinary-reward-once', noEffects, { expected: '1:1:1:1' });
  const replay = JSON.parse(sql('replay-same-pair', call('publish_candidate')));
  assert.deepEqual(replay, { ...first, created: false });
  sql('replay-no-additional-reward', noEffects, { expected: '1:1:1:1' });
  // Qualify the actual migration as well as the isolated contention contract.
  // Creating the full historical body does not execute its business writes.
  const original = source.match(/CREATE OR REPLACE FUNCTION public\.publish_horse_video_reel\([\s\S]*?\$function\$;/)?.[0];
  assert(original, 'Maintained original publication function is missing');
  const signature = 'public.publish_horse_video_reel(uuid,text,text,text,text,text,text,jsonb)';
  sql('exact-original-function-fixture', `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions;
CREATE TABLE ca_money_rpc_registry(proname text PRIMARY KEY,status text,notes text);
${original}
REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ${signature} TO service_role;
CREATE TABLE function_snapshot AS SELECT pg_get_functiondef(oid) definition,
  proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='${signature}'::regprocedure;
`);
  sql('exact-installed-baseline-hash', `SELECT md5(pg_get_functiondef('${signature}'::regprocedure));`,
    { expected: '7c0a5c39b1a4a7351d3a10c3650a8cc7' });
  sql('apply-exact-migration', migration);
  sql('exact-body-and-authority-preserved', `SELECT
    pg_get_functiondef(p.oid)=replace(s.definition,'${oldClause}','${newClause}')
    AND p.proowner=s.proowner AND p.proacl=s.proacl
    AND p.prosecdef=s.prosecdef AND p.proconfig=s.proconfig
    FROM pg_proc p CROSS JOIN function_snapshot s WHERE p.oid='${signature}'::regprocedure;`, { expected: 't' });
  passed = true;
} finally {
  if (locker) {
    locker.stdin.end('ROLLBACK;\n\\q\n');
    await lockerDone;
  }
  if (running || existsSync(join(data, 'postmaster.pid'))) {
    const stopped = command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    assert.equal(stopped.status, 0, 'Owned local PostgreSQL did not stop');
  }
  if (existsSync(join(cluster, 'server.log'))) {
    writeFileSync(join(output, 'server.log'), readFileSync(join(cluster, 'server.log')));
  }
  // cluster is the exact mkdtemp-owned directory, never a checkout/shared root.
  rmSync(cluster, { recursive: true });
  writeFileSync(join(output, 'RESULTS.json'), JSON.stringify({
    passed, legacyCandidate: red, scope: 'native profile lock subcontract only',
    source: legacyPath, migration: migrationPath, cases, clusterRemoved: !existsSync(cluster),
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed, cases: cases.length, output, clusterRemoved: !existsSync(cluster) }));
}
