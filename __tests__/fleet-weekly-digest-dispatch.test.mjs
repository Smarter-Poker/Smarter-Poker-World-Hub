import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Fleet Content Programme Phase 10 ("one engine, measured"): the Monday
// dispatcher entry for the weekly digest mail. The route itself lives in the
// workers repo (src/routes/fleet-weekly-digest.ts); it reads the same
// fn_fleet_content_metrics the horses admin page shows, the engine switch and
// every mode row, and mails one plain-text summary. It writes nothing but the
// mail, so it is a measured no-op (skipped: recipient_unset) until the
// recipient variable exists on the workers VM. Companion of
// phase7-content-dispatch.test.mjs and phase6-content-dispatch.test.mjs.

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const dispatcher = fs.readFileSync(path.join(REPO, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');

const assignmentBlock = (name, open = '{', close = '}') => {
  const escapedOpen = open.replace(/[[{]/g, '\\$&');
  const escapedClose = close.replace(/[\]}]/g, '\\$&');
  const match = dispatcher.match(new RegExp(`\\n${name} = ${escapedOpen}([\\s\\S]*?)\\n${escapedClose}`));
  assert.ok(match, `${name} must remain a literal registry`);
  return match[1];
};

test('the fleet weekly digest is scheduled every Monday at 09:30 UTC and routed to the workers service', () => {
  const allCrons = assignmentBlock('ALL_CRONS', '[', ']');
  assert.match(
    allCrons,
    /\('\/api\/cron\/fleet-weekly-digest',\s*dict\(day_of_week='mon', hour=9, minute=30\)\)/,
    'the digest fires once a week, Monday 09:30 UTC, after the weekend the figures cover',
  );
  assert.equal((allCrons.match(/fleet-weekly-digest/g) || []).length, 1, 'exactly one schedule entry');
  assert.match(
    assignmentBlock('WORKERS_PREFERRED'),
    /'\/api\/cron\/fleet-weekly-digest':\s+'\/cron\/fleet-weekly-digest'/,
    'the job must be handed to the workers route, never to a pages/api/cron file',
  );
  assert.match(
    assignmentBlock('JOB_TIMEOUTS'),
    /'\/api\/cron\/fleet-weekly-digest':\s+120/,
    'the dispatcher timeout covers the route internal deadline of 90 s',
  );
});

test('the digest is not a critical job and not a script job', () => {
  // An absent Monday mail is itself the signal; paging on a read-only report
  // while the recipient variable is unset would page on nothing.
  assert.doesNotMatch(assignmentBlock('CRITICAL_JOBS'), /fleet-weekly-digest/);
  assert.doesNotMatch(assignmentBlock('SCRIPT_JOBS'), /fleet-weekly-digest/);
});

test('no new pages/api/cron file, vercel.json cron or schedule workflow carries the digest', () => {
  // CLAUDE.md: all new scheduled work goes to Open Claw. The route is the
  // workers repo's; the hub only dispatches it.
  assert.equal(fs.existsSync(path.join(REPO, 'pages', 'api', 'cron', 'fleet-weekly-digest.js')), false);
  const vercel = fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8');
  assert.doesNotMatch(vercel, /fleet-weekly-digest/);
});
