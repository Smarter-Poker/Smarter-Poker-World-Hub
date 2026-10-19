import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const bindir = [process.env.PHASE6_POSTGRES_BIN, process.env.PG17_BINDIR, process.env.PG_BINDIR, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean).find(p => existsSync(join(p, 'initdb')));
const previous = read('supabase/migrations/20261007220628_welcome_package_earned_by_phone_verification.sql').match(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?\$function\$;/)[0];
const migration = read('supabase/migrations/20261018134229_signup_auth_uses_canonical_player_number.sql');

test('native signup skips occupied numbers, creates dependent rows, and preserves eligibility under concurrent signups', async () => {
  assert.ok(bindir, 'PostgreSQL binaries are required, never skip this regression');
  const base = process.env.AGENT_TEST_ROOT || (process.platform === 'darwin' ? '/Volumes/SmarterWork/agent-work/digest-fixes-01a14f3d' : tmpdir());
  const scratch = mkdtempSync(join(base, 'signup-pg-'));
  const port = 56000 + Math.floor(Math.random() * 5000);
  const args = ['-X', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const sql = input => execFileSync(join(bindir, 'psql'), args, { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  let started = false;
  try {
    execFileSync(join(bindir, 'initdb'), ['-D', join(scratch, 'data'), '-A', 'trust', '-U', process.env.USER || 'runner', '--no-locale'], { stdio:'pipe' });
    execFileSync(join(bindir, 'pg_ctl'), ['-D', join(scratch, 'data'), '-l', join(scratch, 'server.log'), '-o', `-h 127.0.0.1 -k ${scratch} -p ${port}`, '-w', 'start'], { stdio:'pipe' });
    started = true;
    sql(`CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text, first_name text, last_name text, email text, username text, avatar_url text,
        player_number text UNIQUE, streak_count int, diamonds numeric, diamond_balance numeric, diamond_multiplier numeric, skill_tier text,
        access_tier text, is_vip boolean, vip_tier text, vip_expires_at timestamptz, created_at timestamptz, updated_at timestamptz,
        last_login timestamptz, last_active timestamptz, is_online boolean);
      CREATE TABLE signup_errors(user_id uuid,email text,trigger_name text,error_code text,error_msg text,raw_meta jsonb);
      CREATE TABLE user_diamonds(user_id uuid PRIMARY KEY REFERENCES profiles(id),balance numeric,lifetime_earned numeric);
      CREATE TABLE user_daily_streaks(user_id uuid PRIMARY KEY REFERENCES profiles(id));
      CREATE TABLE wallets(user_id uuid REFERENCES profiles(id),wallet_type text,balance numeric,locked_balance numeric,UNIQUE(user_id,wallet_type));
      CREATE SEQUENCE profiles_player_number_seq START 100;
      CREATE SEQUENCE player_number_seq START 100;
      CREATE FUNCTION is_reserved_username(text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
      INSERT INTO profiles(id,player_number) VALUES ('00000000-0000-0000-0000-000000000001','100');
      ${previous}
      ${read('__tests__/fixtures/signup-allocator-functions.sql')}
      CREATE TRIGGER a_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
      CREATE TRIGGER b_diamonds AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION initialize_user_diamonds();
      CREATE TRIGGER c_wallet AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_v2_create_wallet();`);
    sql("INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000002','before@example.invalid');");
    assert.equal(sql('SELECT count(*) FROM signup_errors'), '3', 'before fix: collision plus both FK cascades reproduced');
    assert.equal(sql("SELECT count(*) FROM profiles WHERE id='00000000-0000-0000-0000-000000000002'"), '0');
    sql(migration);
    sql('TRUNCATE signup_errors');
    const insert = n => `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('00000000-0000-0000-0000-${String(n).padStart(12,'0')}','after${n}@example.invalid','{"full_name":"Signup Example","state":"CA"}');`;
    await Promise.all(Array.from({length:12}, (_,i) => new Promise((resolve,reject) => {
      const child = spawn(join(bindir,'psql'), args, { stdio:['pipe','pipe','pipe'] });
      let error=''; child.stderr.on('data', chunk => { error += chunk; });
      child.on('error',reject); child.on('exit', code => code===0 ? resolve() : reject(new Error(error)));
      child.stdin.end(insert(i+3));
    })));
    assert.equal(sql('SELECT count(*) FROM signup_errors'), '0');
    assert.equal(sql('SELECT count(*) FROM user_diamonds'), '12');
    assert.equal(sql('SELECT count(*) FROM wallets'), '12');
    assert.equal(sql("SELECT count(*) FROM profiles WHERE full_name='Signup Example' AND first_name='Signup' AND last_name='Example' AND access_tier='Restricted_Tier' AND is_vip=false AND vip_tier IS NULL AND vip_expires_at IS NULL AND diamonds=0 AND diamond_balance=0"), '12');
    assert.equal(sql('SELECT count(DISTINCT player_number) FROM profiles'), '13');
    assert.throws(() => sql(migration), /preimage changed/, 'replay refuses rather than silently editing another body');
  } finally {
    if (started) execFileSync(join(bindir,'pg_ctl'), ['-D',join(scratch,'data'),'-m','immediate','-w','stop'], {stdio:'pipe'});
    rmSync(scratch,{recursive:true,force:true});
  }
});
