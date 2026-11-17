// OWNER REAL-ALERT TITLES ARE OPERATIONAL (2026-11-17).
//
// Club Arena's fn_ca_a_real_alert_reaches_the_owner() raises a 'system'
// notification with one of six titles. The push guard skips an operational
// push only when fn_is_platform_operational_alert classifies its title, and
// three of the six were missing, so 19 operational pushes reached the owner's
// phone between 2026-11-09 and 2026-11-17 (Dan 2026-10-09 and 2026-10-31:
// operational alerts are never pushed to a phone).
//
// This file proves, in JavaScript and in real PostgreSQL, that every owner
// real-alert title is operational and routed to Production Alerts, that the
// pre-fix classifier refused them (the regression), and that the migration is
// idempotent and leaves player notices alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { OWNER_REAL_ALERT_TITLES, PLATFORM_ALERT_TITLES, isRoutedToProductionAlerts } from '../src/lib/notifications/deliveryPolicy.mjs';

const root = resolve(import.meta.dirname, '..');
const policy = readFileSync(join(root, 'supabase/migrations/20261012152000_notification_delivery_policy.sql'), 'utf8');
const fixPath = join(root, 'supabase/migrations/20261117175009_owner_real_alert_titles_are_operational.sql');
const fix = readFileSync(fixPath, 'utf8');
const MISSING = ['Engine Update Missed At 4 AM', 'Merged Migration Not Installed', '3 AM Lobby Close Keeps Failing'];

test('every owner real-alert title is operational and never pushed (JavaScript mirror)', () => {
  assert.equal(OWNER_REAL_ALERT_TITLES.length, 6);
  for (const title of OWNER_REAL_ALERT_TITLES) {
    assert.ok(PLATFORM_ALERT_TITLES.includes(title), title);
    assert.equal(isRoutedToProductionAlerts({ type: 'system', title }), true, title);
    assert.equal(isRoutedToProductionAlerts({ type: 'new_message', title }), false, `${title} as a player message`);
  }
});

test('the database classifier carries every owner real-alert title', () => {
  const sql = policy + '\n' + fix;
  for (const title of OWNER_REAL_ALERT_TITLES) assert.ok(sql.includes(`'${title}'`) || sql.includes(`''${title}''`), title);
  assert.match(fix, /^-- @live-proof: /m);
  assert.match(fix, /expected exactly one operational title list to amend/);
  assert.equal((fix.match(/^BEGIN;$/gm) || []).length, 1, 'one transaction');
});

const bin = process.env.PG17_BINDIR || (existsSync('/opt/homebrew/opt/postgresql@17/bin') ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
test('real PostgreSQL: the pre-fix guard pushes the three titles, the fixed guard skips them', async () => {
  const base = process.env.NOTIFICATION_POLICY_POSTGRES_ROOT;
  assert.ok(base && existsSync(base), 'An owned PostgreSQL scratch directory is required');
  assert.ok(existsSync(join(bin, 'initdb')), `PostgreSQL binaries required at ${bin}`);
  const scratch = mkdtempSync(join(base, 'owner-real-alert-pg-'));
  const data = join(scratch, 'data');
  const server = net.createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
  const q = sql => execFileSync(join(bin, 'psql'), [...args, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const apply = () => execFileSync(join(bin, 'psql'), [...args, '-f', fixPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // The classifier exactly as 20261012152000 created it (the installed pre-image).
  const classifier = policy.match(/CREATE FUNCTION public\.fn_is_platform_operational_alert[\s\S]*?\n\$\$;/)[0];
  const recipient = policy.match(/CREATE FUNCTION public\.fn_is_platform_alert_recipient[\s\S]*?\n\$\$;/)[0];
  const owner = '47965354-0e56-43ef-931c-ddaab82af765';
  const player = '11111111-1111-4111-8111-111111111111';
  let started = false;
  try {
    execFileSync(join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale'], { stdio: 'pipe' });
    execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1 -k ''`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    q(`${classifier}
       ${recipient}
       CREATE TABLE push_outbox(id serial,recipient_user_id uuid,title text,event text,status text,claimed_at timestamptz,failure_reason text);
       -- The live push guard (Club Arena 20261031172116).
       CREATE FUNCTION public.fn_platform_push_recipient_guard() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
        IF (TG_OP='INSERT' OR NEW.status IN ('pending','processing'))
           AND public.fn_is_platform_operational_alert(NEW.event,NEW.title,'{}'::jsonb) THEN
         IF NOT public.fn_is_platform_alert_recipient(NEW.recipient_user_id) THEN
          NEW.status:='skipped'; NEW.claimed_at:=NULL; NEW.failure_reason:='platform_alert_recipient_not_allowed';
         ELSIF COALESCE(NEW.title,'') NOT IN ('Push Health Alert','Notifications May Not Be Reaching This Device','Push Notifications Are Off') THEN
          NEW.status:='skipped'; NEW.claimed_at:=NULL; NEW.failure_reason:='routed_to_production_alerts';
         END IF;
        END IF;
        RETURN NEW;
       END $$;
       CREATE TRIGGER aa_platform_push_recipient_guard BEFORE INSERT OR UPDATE ON push_outbox FOR EACH ROW EXECUTE FUNCTION public.fn_platform_push_recipient_guard();`);
    const push = (title, event = 'system', user = owner) =>
      q(`INSERT INTO push_outbox(recipient_user_id,title,event,status) VALUES('${user}','${title}','${event}','pending') RETURNING status||':'||COALESCE(failure_reason,'')`);

    // Regression: the pre-fix classifier lets the three titles reach the phone.
    for (const title of MISSING) assert.equal(push(title), 'pending:', `pre-fix ${title} is pushed`);
    assert.equal(push('Money Check Failed'), 'skipped:routed_to_production_alerts');

    apply();
    for (const title of OWNER_REAL_ALERT_TITLES) assert.equal(push(title), 'skipped:routed_to_production_alerts', title);
    assert.equal(push('Push Health Alert'), 'pending:', 'device-health notices about the owner phone still push');
    assert.equal(push('Merged Migration Not Installed', 'new_message', player), 'pending:', 'a player message with the same words still pushes');
    assert.equal(push('Daily Digest: 1 Signups'), 'pending:', 'business digests are untouched');

    const before = q(`SELECT md5(pg_get_functiondef('public.fn_is_platform_operational_alert(text,text,jsonb)'::regprocedure))`);
    apply();
    assert.equal(q(`SELECT md5(pg_get_functiondef('public.fn_is_platform_operational_alert(text,text,jsonb)'::regprocedure))`), before, 'replay is a no-op');
    assert.equal(q(`SELECT count(*) FROM pg_proc WHERE proname='fn_is_platform_operational_alert'`), '1');
  } finally {
    if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(scratch, { recursive: true, force: true });
  }
});
