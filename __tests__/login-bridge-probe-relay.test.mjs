/**
 * GUARD: __tests__/login-bridge-probe-relay.test.mjs
 * The Open Claw probe reaches Commander through this hub relay with a
 * SUPABASE_JWT_SECRET-signed ticket, not a CRON_SECRET copy (2026-09-04, the
 * copy drifted on its first day). Pins the relay's bearer check, the ticket
 * header, and the shared vector that keeps the two ticket.js copies identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintProbeTicket, verifyProbeTicket } from '../src/lib/probeTicket.js';

const root = path.resolve(import.meta.dirname, '..');
const relay = fs.readFileSync(path.join(root, 'pages', 'api', 'internal', 'login-bridge-probe.js'), 'utf8');
const dispatcher = fs.readFileSync(path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');

test('the relay checks the CRON_SECRET bearer exactly like cron-auth-probe, and signs a ticket', () => {
  assert.match(relay, /if \(!secret \|\| auth !== `Bearer \$\{secret\}`\)/);
  assert.match(relay, /'x-probe-ticket': mintProbeTicket\(ticketSecret\)/);
  assert.match(relay, /process\.env\.SUPABASE_JWT_SECRET/);
  assert.doesNotMatch(relay, /supabase-js/, 'no database client in the relay');
});

test('the dispatcher schedules the relay path and pages on it', () => {
  assert.match(dispatcher, /\('\/api\/internal\/login-bridge-probe',\s+dict\(minute=22\)\)/);
  assert.match(dispatcher, /CRITICAL_JOBS\s*=\s*\{[\s\S]*?'\/api\/internal\/login-bridge-probe':\s*2/);
  assert.doesNotMatch(dispatcher, /\('\/api\/commander\/internal\/login-bridge-probe'/, 'the direct commander path needed a CRON_SECRET copy');
});

test('the ticket vector matches Commander byte for byte', () => {
  // Pinned identically in smarter-poker-commander tests/unit/loginBridgeProbeRoute.test.js.
  const t = mintProbeTicket('k', 1700000000000);
  assert.equal(t, 'v1.1700000000000.9ae520ae96223798a843414cee48929719c33d937ec319ea13e13512a55bdfb1');
  assert.deepEqual(verifyProbeTicket(t, 'k', 1700000000000), { ok: true, ts: 1700000000000 });
  assert.deepEqual(verifyProbeTicket(t, 'k', 1700000000000 + 6 * 60 * 1000), { ok: false, reason: 'expired' });
  assert.deepEqual(verifyProbeTicket(t, 'x', 1700000000000), { ok: false, reason: 'bad_signature' });
});
