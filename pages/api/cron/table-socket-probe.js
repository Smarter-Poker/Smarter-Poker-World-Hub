/**
 * /api/cron/table-socket-probe - CAN A PLAYER HOLD A TABLE?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Realtime Connections Programme, Phase 6 of 7: "prove it from outside".
 *
 * WHAT THIS IS FOR, IN ONE PARAGRAPH. On 2026-09-03 every Club Arena table
 * said "Reconnecting To The Table" for twenty-two hours while the engine dealt
 * 5,700 hands per ten minutes. Every monitor was green. `/api/health` was
 * green because the engine was healthy. The lobby was green because PostgREST
 * checks a JWT's signature and not its session. `login-probe` was green
 * because GoTrue was happily issuing tokens - it was this platform's own cron
 * revoking them a moment later. Not one of those monitors did the thing a
 * player does, which is OPEN A SOCKET TO A TABLE AND WAIT FOR THE FELT TO
 * ARRIVE. This one does exactly that and nothing else.
 *
 * THE PATH IT TAKES IS THE PLAYER'S PATH, deliberately, step for step:
 *
 *   1. sign in with a password through the anon client   (GoTrue)
 *   2. find a table that is actually dealing             (PostgREST)
 *   3. `new WebSocket(wss://.../ws/table/<id>?v=1, ['bearer', <jwt>])`
 *                                                        (the engine's upgrade)
 *   4. wait for the first SNAPSHOT frame                 (TableStateHub)
 *   5. close it, sign out `{ scope: 'local' }`
 *
 * Step 3 is the whole point and it is why this could not be a `fetch`. The
 * upgrade runs code no HTTP request touches: the protocol-version gate
 * (4426), the token verdict that separates "revoked" from "GoTrue is down"
 * (4401 vs a pre-handshake 503), the per-user socket cap (4429), and then the
 * subscribe that makes a room deliver its snapshot. `login-probe` step 4 asks
 * the engine `GET /voice/ice`, which proves the engine will accept the token
 * over HTTP - a real and useful check, and one that would still have passed if
 * the WebSocket route alone had been broken.
 *
 * Step 4 matters as much as step 3. A socket that opens and then says nothing
 * is what a player sees as a table that never paints, and it is a completely
 * different fault (a hub with no snapshot, an engine not driving the table)
 * from a socket that is refused. They are reported as different outcomes here
 * because the runbook sends you to different places for them.
 *
 * WHY THIS DOES NOT REPORT ITS RESULT TO THE ENGINE'S /metrics.
 * ────────────────────────────────────────────────────────────
 * It would be tidy: Phases 1, 2 and 5 all put their numbers on the engine's
 * always-on exposition, and Grafana is where people look. It is also the one
 * mistake this probe exists to avoid. A monitor that reports through the thing
 * it is monitoring cannot report the outage it was built for - if the engine
 * is refusing sockets it can also be refusing this probe's POST, and the
 * result is a gauge that stops moving, which looks exactly like a quiet night.
 * Everything about the 2026-09-03 outage was a green signal that shared a
 * failure domain with the thing it claimed to be watching.
 *
 * So the result goes to three places that do NOT share a failure domain with
 * the Club Arena engine:
 *
 *   - `probe_heartbeats` in Postgres - the durable record, and what the
 *     /admin/auth-health dashboard reads.
 *   - an email to OPS_ALERT_EMAIL on failure, because a row in a table nobody
 *     opens at 3am is not an alert.
 *   - a non-200 to the Open Claw dispatcher, which is listed in CRITICAL_JOBS
 *     and pages by SMS after two consecutive failures.
 *
 * And SILENCE is covered separately, which is the half that is usually
 * missing: `scripts/ci/check-cron-fleet-alive.mjs` (in publish-watchdog.yml,
 * every 15 minutes) asks Postgres how long it has been since ANY Open Claw job
 * recorded a run. A probe that stops running stops being green; it does not
 * stay green. That distinction is why a Claude-scheduler cron could read
 * `enabled: true` for two and a half months after it last fired.
 *
 * Putting these numbers on Prometheus as well is deliberately left to Phase 7,
 * which owns the finding that the alert rules on the box are not the alert
 * rules in the repo. Adding a hand-edited scrape target now would be adding to
 * the drift that phase exists to end.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { isDedicatedProbeAccount } from '../../../src/lib/probeIdentity';
import { unconfiguredProbe } from '../../../src/lib/probeUnconfigured';

export const config = { maxDuration: 60 };

/**
 * The client's wire protocol version, from Club Arena's `EngineSocketMux.ts`.
 *
 * A number copied between two repos drifts, so the drift is made LOUD instead
 * of prevented: when the engine moves past this, it closes the socket with
 * 4426 and this probe reports `probe_outdated`, which the runbook reads as
 * "raise this constant", NOT as "the tables are down". A probe that cried
 * outage every time the protocol advanced would be turned off within a week,
 * and then it would not be there for the real one.
 */
export const PROBE_PROTOCOL_VERSION = 1;

/** How long the whole socket phase may take before we call it a failure. */
export const SOCKET_TIMEOUT_MS = 15_000;

/**
 * Close codes this probe knows by name. Kept beside the runbook section that
 * explains each one; `docs/runbooks/tables-say-reconnecting.md` in the Club
 * Arena repo is the page you want at 3am.
 */
export const CLOSE_CODES = Object.freeze({
  1000: 'normal',
  1006: 'abnormal_no_close_frame',
  4400: 'bad_request',
  4401: 'auth_refused',
  4403: 'banned',
  4404: 'table_not_found',
  4426: 'upgrade_required',
  4429: 'rate_limited_or_socket_cap',
  4500: 'server_error',
  4901: 'mux_superseded',
});

let _admin = null;
let _anon = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
function getAnon() {
  if (_anon) return _anon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _anon = createClient(url, key, { auth: { persistSession: false } });
  return _anon;
}

/** Ops email. Mirrors login-probe's block, same reasoning. */
async function alertOps(subject, text) {
  try {
    const key = (process.env.RESEND_API_KEY || '').trim();
    const to = (process.env.OPS_ALERT_EMAIL || '').trim();
    if (!key || !to) {
      console.warn('[table-socket-probe] alert email skipped: RESEND_API_KEY / OPS_ALERT_EMAIL unset');
      return;
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker').trim(),
        to,
        subject,
        text,
      }),
    });
  } catch (e) {
    console.warn('[table-socket-probe] alert email failed:', e?.message || e);
  }
}

/**
 * A table this viewer is actually entitled to open, that is actually dealing.
 *
 * THE VIEWER ID IS NOT DECORATION. The first version of this asked for any
 * busy horse-only table, and running it against production before shipping
 * showed why that is wrong: the engine answered a pre-handshake
 * `HTTP/1.1 403 Forbidden`, which a client can only report as close 1006.
 * Nothing was broken. `authorizeTableViewer` fails CLOSED on club membership -
 * deliberately, so that a stale client result can never open a private club's
 * table - and this account is not a member of every club. A probe that picks
 * tables it may not open does not measure whether a player can hold a table;
 * it measures its own membership, and it alarms every five minutes forever
 * while the platform is perfectly healthy.
 *
 * So `fn_probe_table_candidate` mirrors every gate the upgrade will apply:
 * membership in the table's club, a room that admits observers, a table that
 * is dealing, and no human seated. See the migration for the full reasoning.
 *
 * "Dealing" is the load-bearing half of that. The hub only sends a snapshot
 * when it has one, so an idle table would time out and report "the felt never
 * came" - a real fault signature - for a table that is merely quiet.
 */
export async function pickProbeTable(admin, viewerId) {
  const { data, error } = await admin.rpc('fn_probe_table_candidate', { p_viewer: viewerId });
  if (error) throw new Error(`table lookup failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.table_id || null;
}

/**
 * Open a real socket to `tableId`, wait for the first SNAPSHOT, close.
 *
 * Resolves with an outcome either way; it throws only for a programming error.
 * `WebSocket` is Node's own global (Node 22 on Vercel) - the same WHATWG API
 * the browser gives `EngineStateClient`, including the subprotocol array that
 * carries the bearer token, so this is the client's code path and not an
 * imitation of it.
 */
export function openTableSocket(engineBase, tableId, token, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const url = `${engineBase.replace(/^http/, 'ws')}/ws/table/${tableId}?v=${PROBE_PROTOCOL_VERSION}`;
    const startedAt = Date.now();
    const result = {
      url,
      opened: false,
      snapshot: false,
      open_ms: null,
      snapshot_ms: null,
      close_code: null,
      close_reason: null,
      close_name: null,
      frames_seen: [],
    };

    let ws;
    try {
      ws = new WebSocket(url, ['bearer', token]);
    } catch (err) {
      result.outcome = 'construct_failed';
      result.error = err?.message || String(err);
      resolve(result);
      return;
    }

    let settled = false;
    const finish = (outcome, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      result.outcome = outcome;
      if (error) result.error = error;
      // Always close deliberately. A probe that leaks a socket every run walks
      // itself into the per-user cap (4429) and then reports an outage it
      // caused - which is this whole programme's founding mistake in miniature.
      try {
        ws.close(1000, 'probe complete');
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Two OUTCOMES, written as two literals rather than one ternary, because
      // an outcome hidden inside an expression is one the registry scan cannot
      // see - which is how the audit's first version of that law passed while
      // two outcomes were unregistered.
      if (result.opened) {
        finish('no_snapshot', `socket opened but no SNAPSHOT arrived within ${timeoutMs}ms`);
      } else {
        finish('handshake_timeout', `socket never opened within ${timeoutMs}ms`);
      }
    }, timeoutMs);

    ws.onopen = () => {
      result.opened = true;
      result.open_ms = Date.now() - startedAt;
    };

    ws.onmessage = (ev) => {
      let type = null;
      try {
        type = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))?.type ?? null;
      } catch {
        type = 'unparseable';
      }
      if (result.frames_seen.length < 8) result.frames_seen.push(type);
      if (type === 'SNAPSHOT') {
        result.snapshot = true;
        result.snapshot_ms = Date.now() - startedAt;
        finish('ok');
      }
    };

    ws.onerror = () => {
      // Deliberately not resolved here. A WHATWG WebSocket reports a refused
      // upgrade as an error followed by close 1006, and the CLOSE is where the
      // information is - resolving on the error would throw the code away.
    };

    ws.onclose = (ev) => {
      result.close_code = ev?.code ?? null;
      result.close_reason = ev?.reason || null;
      result.close_name = CLOSE_CODES[result.close_code] || 'unknown';
      if (settled) return;
      if (result.snapshot) {
        finish('ok');
        return;
      }
      // Everything below is a socket that died before the felt arrived. The
      // NAME is the diagnosis and the runbook is organised by it.
      if (result.close_code === 4426) finish('probe_outdated', 'engine requires a newer client protocol');
      else if (result.close_code === 4401) finish('auth_refused', `engine refused the session: ${result.close_reason || 'no reason'}`);
      else if (result.close_code === 4404) finish('table_not_found', 'the table vanished between the lookup and the socket');
      else if (result.close_code === 4429) finish('rate_limited', `refused as rate-limited or over the socket cap: ${result.close_reason || 'no reason'}`);
      else if (result.opened) finish('closed_before_snapshot', `closed ${result.close_code} before any SNAPSHOT`);
      else
        finish(
          'refused',
          `the upgrade never completed (close ${result.close_code}). 1006 with no reason is what a PRE-HANDSHAKE refusal ` +
            'looks like from a client - it is indistinguishable from a dropped link, and it is exactly what players saw ' +
            'for twenty-two hours on 2026-09-03.'
        );
    };
  });
}

/**
 * EVERY outcome this probe can report, in one place.
 *
 * The outcome is the diagnosis - it is what the ops email says, what the
 * heartbeat records, and what the runbook is organised by - so an outcome that
 * exists in code and nowhere else is a page with no page to turn to. The
 * 2026-09-06 audit found two of them (`construct_failed`, `closed_before_snapshot`)
 * already shipped and undocumented.
 *
 * The law pins that every `finish('...')` in this file appears here and that
 * nothing here is unused, so a new outcome cannot be added quietly. When you
 * add one, add its section to
 * `club-arena/docs/runbooks/tables-say-reconnecting.md` in the same change:
 * the two repos cannot check each other, so that half is on you.
 */
export const PROBE_OUTCOMES = Object.freeze([
  'ok',
  'no_snapshot',
  'handshake_timeout',
  'closed_before_snapshot',
  'refused',
  'auth_refused',
  'table_not_found',
  'rate_limited',
  'probe_outdated',
  'construct_failed',
]);

/**
 * Is the platform on its announced maintenance break right now?
 *
 * CLAUDE.md 13 rule 6 (Club Arena): "fleet-level alert rules carry the break
 * guard, or they page hourly about a stop we scheduled." This probe is a
 * fleet-level monitor and did not carry it. Measured over its first two hours
 * live: 22 runs, 20 ok, and BOTH failures at `:58` - one `pick_table` (no
 * table has dealt for ten minutes, because every table is parked) and one
 * `no_snapshot` (the socket opens and the room publishes nothing, for the same
 * reason). Neither is a fault. Reporting them as failures puts a red row on
 * the dashboard every hour and teaches whoever reads it to skip `:58`.
 *
 * The freeze lives in Postgres precisely because the engine is away for two of
 * the five minutes (rule 1), so this asks the database, not the engine - the
 * one source that is still answering while the tables are parked.
 *
 * Fails OPEN: if the question cannot be asked, the failure stays a failure. A
 * probe that swallowed a real outage because it could not reach Postgres would
 * be worse than one that cries at `:58`.
 */
async function platformIsFrozen(admin) {
  try {
    const { data, error } = await admin.rpc('fn_platform_frozen');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Outcomes that mean the platform is fine and the PROBE needs attention. */
export const PROBE_FAULT_OUTCOMES = Object.freeze(['probe_outdated']);

async function handler(req, res) {
  if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'no-store');

  const admin = getAdmin();
  const anon = getAnon();
  // A PROBE THAT CANNOT RUN SAYS SO WHERE PROBES SPEAK. Every early return
  // below goes through `unconfiguredProbe`, which writes a 'failed' heartbeat
  // FIRST and then returns the 500 - because a probe that writes no row is
  // indistinguishable from one that was never scheduled, and the dashboard
  // cannot draw a red badge for a row that does not exist. That is
  // recovery-probe's 2026-09-04 defect, and it is law here
  // (`__tests__/a-probe-that-cannot-run-says-so.law.test.mjs`).
  if (!admin || !anon) {
    // `admin` may be the thing that is missing; the helper is fail-open and
    // still returns the 500 with no client to write through.
    return unconfiguredProbe(res, admin, 'table-socket-probe', 'Missing Supabase env vars');
  }
  if (typeof WebSocket === 'undefined') {
    return unconfiguredProbe(
      res,
      admin,
      'table-socket-probe',
      'No global WebSocket in this runtime - the probe cannot take the client path.'
    );
  }

  const email = (process.env.PROBE_LOGIN_EMAIL || '').trim();
  const password = process.env.PROBE_LOGIN_PASSWORD;
  if (!email || !password) {
    return unconfiguredProbe(
      res,
      admin,
      'table-socket-probe',
      'Missing PROBE_LOGIN_EMAIL or PROBE_LOGIN_PASSWORD. See pages/api/cron/login-probe.js for setup.'
    );
  }

  // Never run as a person. One gate, shared with login-probe.
  if (!isDedicatedProbeAccount(email)) {
    const failure = {
      status: 'misconfigured',
      error:
        'PROBE_LOGIN_EMAIL is not a probe account. Refusing to sign in as it: a synthetic monitor must never ' +
        "borrow a real person's identity. See src/lib/probeIdentity.js.",
      probe_email_domain: email.split('@')[1] || null,
    };
    const { error: hbErr } = await admin
      .from('probe_heartbeats')
      .insert({ probe_name: 'table-socket-probe', status: 'failed', duration_ms: 0, details: failure });
    if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);
    console.error('[table-socket-probe] ' + failure.error);
    return res.status(500).json(failure);
  }

  const startedAt = Date.now();
  const steps = {};
  let signedIn = false;

  try {
    // ── Step 1: be a player ────────────────────────────────────────────────
    steps.login = { started_at: Date.now() };
    const { data: ld, error: le } = await anon.auth.signInWithPassword({ email, password });
    steps.login.duration_ms = Date.now() - steps.login.started_at;
    if (le || !ld?.session?.access_token) {
      steps.login.ok = false;
      steps.login.error = le?.message || 'no session returned';
      throw new Error(`signInWithPassword failed: ${steps.login.error}`);
    }
    steps.login.ok = true;
    signedIn = true;

    // ── Step 2: find a table that is dealing ───────────────────────────────
    steps.pick_table = { started_at: Date.now() };
    const tableId = await pickProbeTable(admin, ld.user.id);
    steps.pick_table.duration_ms = Date.now() - steps.pick_table.started_at;
    steps.pick_table.table_id = tableId;
    steps.pick_table.viewer_id = ld.user.id;
    if (!tableId) {
      // NOT a "skip". Every condition in that function mirrors a gate the
      // upgrade would apply, so a zero result means "no table this account may
      // open has dealt a hand in ten minutes" on a platform that deals
      // ~221,000 a day. Either the fleet has stopped, or the probe account has
      // lost the club membership it needs to watch anything - and the runbook
      // says how to tell those apart. Both are incidents; neither is a skip.
      steps.pick_table.ok = false;
      steps.pick_table.error =
        'no table this account may open has dealt a hand in the last 10 minutes - ' +
        'either the fleet is not dealing, or the probe account is no longer a member of a club that runs cash tables';
      throw new Error(`pick-table: ${steps.pick_table.error}`);
    }
    steps.pick_table.ok = true;

    // ── Step 3 + 4: a real socket, and the felt ────────────────────────────
    const engineBase = (process.env.ENGINE_URL || 'https://engine.smarter.poker').trim().replace(/\/$/, '');
    steps.socket = await openTableSocket(engineBase, tableId, ld.session.access_token);
    steps.socket.ok = steps.socket.outcome === 'ok';

    await anon.auth.signOut({ scope: 'local' }).catch(() => null);

    if (!steps.socket.ok && (await platformIsFrozen(admin))) {
      // The announced break, not a fault. 200 so the dispatcher's
      // consecutive-failure counter never sees it.
      const skipped = {
        status: 'skipped',
        reason: 'maintenance_break',
        duration_ms: Date.now() - startedAt,
        outcome: steps.socket.outcome,
        steps,
      };
      const { error: hbErr } = await admin.from('probe_heartbeats').insert({
        probe_name: 'table-socket-probe',
        status: 'skipped',
        duration_ms: skipped.duration_ms,
        details: skipped,
      });
      if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);
      return res.status(200).json(skipped);
    }

    if (!steps.socket.ok) {
      const probeFault = PROBE_FAULT_OUTCOMES.includes(steps.socket.outcome);
      const failure = {
        status: probeFault ? 'probe_outdated' : 'failed',
        duration_ms: Date.now() - startedAt,
        failed_step: 'socket',
        outcome: steps.socket.outcome,
        error: steps.socket.error || steps.socket.outcome,
        steps,
      };
      const { error: hbErr } = await admin.from('probe_heartbeats').insert({
        probe_name: 'table-socket-probe',
        status: 'failed',
        duration_ms: failure.duration_ms,
        details: failure,
      });
      if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);
      await alertOps(
        `[smarter.poker] table-socket-probe ${probeFault ? 'NEEDS UPGRADING' : 'FAILED'}: ${steps.socket.outcome}`,
        `A synthetic client could not hold a Club Arena table at ${new Date().toISOString()}.\n\n` +
          `Outcome: ${steps.socket.outcome}\n` +
          `Close:   ${steps.socket.close_code} ${steps.socket.close_name || ''} ${steps.socket.close_reason || ''}\n` +
          `Table:   ${tableId}\n` +
          `Error:   ${failure.error}\n\n` +
          'Runbook: club-arena/docs/runbooks/tables-say-reconnecting.md\n'
      );
      return res.status(503).json(failure);
    }

    const ok = {
      status: 'ok',
      duration_ms: Date.now() - startedAt,
      table_id: tableId,
      open_ms: steps.socket.open_ms,
      snapshot_ms: steps.socket.snapshot_ms,
      steps,
    };
    const { error: hbErr } = await admin.from('probe_heartbeats').insert({
      probe_name: 'table-socket-probe',
      status: 'ok',
      duration_ms: ok.duration_ms,
      details: { steps },
    });
    if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);
    return res.status(200).json(ok);
  } catch (err) {
    if (signedIn) await anon.auth.signOut({ scope: 'local' }).catch(() => null);

    // Same guard on the thrown path - `pick_table` fails during the break for
    // the same reason, because a parked fleet deals no hands.
    if (await platformIsFrozen(admin)) {
      const skipped = {
        status: 'skipped',
        reason: 'maintenance_break',
        duration_ms: Date.now() - startedAt,
        error: err?.message || String(err),
        steps,
      };
      const { error: hbErr } = await admin.from('probe_heartbeats').insert({
        probe_name: 'table-socket-probe',
        status: 'skipped',
        duration_ms: skipped.duration_ms,
        details: skipped,
      });
      if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);
      return res.status(200).json(skipped);
    }

    const failure = {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error: err?.message || String(err),
      failed_step: Object.keys(steps).find((k) => steps[k]?.ok === false) || 'unknown',
      steps,
    };
    const { error: hbErr } = await admin.from('probe_heartbeats').insert({
      probe_name: 'table-socket-probe',
      status: 'failed',
      duration_ms: failure.duration_ms,
      details: failure,
    });
    if (hbErr) console.warn('[table-socket-probe] heartbeat insert failed:', hbErr.message);

    await alertOps(
      `[smarter.poker] table-socket-probe FAILED: ${failure.failed_step}`,
      `A synthetic client could not hold a Club Arena table at ${new Date().toISOString()}.\n\n` +
        `Failed step: ${failure.failed_step}\n` +
        `Error: ${failure.error}\n\n` +
        `Steps: ${JSON.stringify(steps, null, 2)}\n\n` +
        'Runbook: club-arena/docs/runbooks/tables-say-reconnecting.md\n'
    );
    return res.status(503).json(failure);
  }
}

export default withCronHealth('table-socket-probe', handler);
