/**
 * /api/cron/login-probe — Synthetic Login Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Sister probe to /api/cron/signup-probe. Verifies the LOGIN flow works
 * end-to-end: signInWithPassword → assert session returned →
 * assert getUser returns the correct user.
 *
 * ⚠️  MAU FIX (2026-05-18)
 * ────────────────────────
 * The original probe created a NEW unique user on every invocation and
 * called signInWithPassword on it.  Each unique signInWithPassword call
 * registers as a Monthly Active User in Supabase billing.  Running every
 * 5 min = 288 new MAU/day = ~8,640 fake MAU/month — the primary cause of
 * the inflated MAU bill.
 *
 * This version reuses a single PERMANENT probe account.  1 MAU/month total.
 *
 * SETUP (one-time)
 * ────────────────
 *   1. In Supabase → Authentication → Users, create a user manually:
 *        Email:    probe-login@probe.smarter.poker
 *        Password: (strong random password, 24+ chars)
 *        Confirm the user immediately (set email_confirmed_at)
 *   2. Add to Vercel env vars (all environments):
 *        PROBE_LOGIN_EMAIL    = probe-login@probe.smarter.poker
 *        PROBE_LOGIN_PASSWORD = <the password you set above>
 *   3. Do NOT delete this user.  It should persist indefinitely.
 *
 * ⚠️  THE 2026-09-03 OUTAGE - THIS PROBE SIGNED A REAL PERSON OUT EVERY 15 MIN
 * ────────────────────────────────────────────────────────────────────────
 * On 2026-09-03 20:15 UTC PROBE_LOGIN_EMAIL / PROBE_LOGIN_PASSWORD were set
 * in Vercel to Dan's OWN account instead of the dedicated probe user above.
 * From the very next tick (20:45 UTC) this handler signed in as him and then
 * called `anon.auth.signOut()` - whose DEFAULT scope is 'global', i.e.
 * "revoke every session this user has, on every device". Ninety-six times a
 * day. Supabase's audit log shows the pair (login, logout, user_agent "node")
 * at :00/:15/:30/:45 for 22 hours straight.
 *
 * The visible symptom was nowhere near here: the Club Arena engine verifies
 * every table socket with auth.getUser(), GoTrue answered
 * "session_not_found", the engine returned HTTP 401 on the upgrade, and every
 * table Dan opened sat on "Reconnecting To The Table" for as long as he
 * looked at it. The lobby still worked because PostgREST only checks the JWT
 * signature, not the session - so the app LOOKED signed in while the engine
 * refused it. The access token has a 7-day life, so nothing on the client
 * ever noticed either.
 *
 * Two rules, both pinned by
 * __tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs:
 *   1. A probe signs out with { scope: 'local' } - ONLY the session it made.
 *      A bare signOut() in a synthetic monitor is a bug, whatever account it
 *      is pointed at.
 *   2. A probe refuses to run against anything but a dedicated probe account
 *      (an address under @probe.smarter.poker, exactly as the SETUP block
 *      above has always said). A misconfigured probe reports 'misconfigured'
 *      and does nothing; it never borrows a person's identity.
 *
 * What is tested
 * ──────────────
 *   • signInWithPassword returns a valid session (access_token + refresh_token)
 *   • getUser with that access_token returns the correct user id
 *   • THE ENGINE ACCEPTS THAT SESSION (GET /voice/ice -> 200). Steps 1-3 only
 *     prove GoTrue will ISSUE a token; this proves an issued token is worth
 *     something. All three passed for the entire 22 hours of the 2026-09-03
 *     outage while no player could hold a table socket.
 *   • The entire auth JWT pipeline is healthy
 *
 * What is NOT tested (by design)
 * ──────────────────────────────
 *   • User creation (tested by signup-probe)
 *   • Trigger chain on new user insert (tested by signup-probe)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { isDedicatedProbeAccount } from '../../../src/lib/probeIdentity';
import { unconfiguredProbe } from '../../../src/lib/probeUnconfigured';

let _admin = null, _anon = null;
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

export const config = { maxDuration: 30 };

/**
 * The gate that says who a probe may be lives in src/lib/probeIdentity.js and
 * is SHARED, since 2026-09-06, with the Club Arena table-socket probe.
 *
 * It used to be declared right here. When a second probe needed the same rule
 * the choice was to copy it or to move it, and a copied security gate is one
 * that drifts - the drifted copy always being the one nobody remembers exists.
 * Re-exported so anything importing it from this route keeps working.
 */
export {
    PROBE_ACCOUNT_DOMAIN,
    PROBE_ALLOWED_ACCOUNTS,
    isDedicatedProbeAccount,
} from '../../../src/lib/probeIdentity';

// ── Ops alert (mirrors auth-integrity-audit.js's Resend block) ────────────
// A probe_heartbeats row alone is not an alert — nobody is watching the
// dashboard at 3am. Failure of THIS probe emails OPS_ALERT_EMAIL directly.
async function alertOps(subject, text) {
    try {
        const key = (process.env.RESEND_API_KEY || '').trim();
        const to = (process.env.OPS_ALERT_EMAIL || '').trim();
        if (!key || !to) {
            console.warn('[login-probe] alert email skipped: RESEND_API_KEY / OPS_ALERT_EMAIL unset');
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
        console.warn('[login-probe] alert email failed:', e?.message || e);
    }
}

async function handler(req, res) {
    if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    const anon = getAnon();
    if (!admin || !anon) return unconfiguredProbe(res, admin, 'login-probe', 'Missing Supabase env vars');

    const email = (process.env.PROBE_LOGIN_EMAIL || '').trim();
    const password = process.env.PROBE_LOGIN_PASSWORD;
    if (!email || !password) {
        return unconfiguredProbe(res, admin, 'login-probe', 'Missing PROBE_LOGIN_EMAIL or PROBE_LOGIN_PASSWORD env vars. ' +
                'Create a permanent probe account in Supabase and add the creds to Vercel env vars. ' +
                'See the file header comment for setup instructions.');
    }

    // 2026-09-04: never run as a person. See the outage note in the header.
    if (!isDedicatedProbeAccount(email)) {
        const failure = {
            status: 'misconfigured',
            error: 'PROBE_LOGIN_EMAIL is not a probe account (an address under @probe.smarter.poker, or the platform service account in PROBE_ALLOWED_ACCOUNTS). ' +
                'Refusing to sign in as it: a synthetic monitor must never borrow a real person\'s identity. ' +
                'Point the env var at the service account or at probe-login@probe.smarter.poker (see the file header).',
            probe_email_domain: email.split('@')[1] || null,
        };
        {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'login-probe',
                status: 'failed',
                duration_ms: 0,
                details: failure,
            });
            if (hbErr) console.warn('[login-probe] heartbeat insert failed:', hbErr.message);
        }
        console.error('[login-probe] ' + failure.error);
        return res.status(500).json(failure);
    }

    const startedAt = Date.now();
    const steps = {};

    try {
        // Step 1: Sign in via the anon client (same path real users take)
        steps.login = { started_at: Date.now() };
        const { data: ld, error: le } = await anon.auth.signInWithPassword({ email, password });
        steps.login.duration_ms = Date.now() - steps.login.started_at;
        if (le || !ld?.session?.access_token) {
            steps.login.ok = false;
            steps.login.error = le?.message || 'no session returned';
            throw new Error(`signInWithPassword failed: ${steps.login.error}`);
        }
        steps.login.ok = true;
        steps.login.has_access_token = !!ld.session.access_token;
        steps.login.has_refresh_token = !!ld.session.refresh_token;

        // Step 2: Verify the session JWT works for getUser
        steps.getuser = { started_at: Date.now() };
        const { data: ud, error: ue } = await anon.auth.getUser(ld.session.access_token);
        steps.getuser.duration_ms = Date.now() - steps.getuser.started_at;
        if (ue || !ud?.user?.id) {
            steps.getuser.ok = false;
            steps.getuser.error = ue?.message || 'getUser returned no user';
            throw new Error(`getUser failed: ${steps.getuser.error}`);
        }
        steps.getuser.ok = true;

        // ── Step 3: OAuth-chain health ─────────────────────────────────────
        // [2026-07-25] This is the check that would have caught the outage
        // where auth.smarter.poker (Supabase custom auth domain) died at the
        // TLS layer: Google approved every sign-in, redirected the browser
        // to the dead custom-domain callback, and users stranded — while
        // password-based probes stayed green for weeks because they talk to
        // the supabase.co URL directly.
        //
        // GoTrue advertises its external callback host inside the /authorize
        // redirect it builds for Google, so we discover the host dynamically
        // (zero new env vars, tracks custom-domain changes automatically)
        // and require that host to answer /auth/v1/health over TLS.
        steps.oauth_chain = { started_at: Date.now() };
        const authorizeRes = await fetch(
            `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()}/auth/v1/authorize?provider=google`,
            { redirect: 'manual' },
        );
        if (authorizeRes.status < 300 || authorizeRes.status >= 400) {
            steps.oauth_chain.ok = false;
            steps.oauth_chain.severity = 'CRITICAL';
            steps.oauth_chain.error = `authorize returned ${authorizeRes.status} (expected 302 to Google - provider disabled or misconfigured?)`;
            throw new Error(`oauth-chain: ${steps.oauth_chain.error}`);
        }
        let callbackHost = null;
        const googleLocation = authorizeRes.headers.get('location') || '';
        try {
            const redirectUri = new URL(googleLocation).searchParams.get('redirect_uri');
            callbackHost = redirectUri ? new URL(redirectUri).host : null;
        } catch (_parseErr) { /* handled below */ }
        if (!callbackHost) {
            steps.oauth_chain.ok = false;
            steps.oauth_chain.severity = 'CRITICAL';
            steps.oauth_chain.error = `could not parse redirect_uri from authorize Location: ${googleLocation.slice(0, 140)}`;
            throw new Error(`oauth-chain: ${steps.oauth_chain.error}`);
        }
        steps.oauth_chain.callback_host = callbackHost;
        let cbRes = null;
        try {
            cbRes = await fetch(`https://${callbackHost}/auth/v1/health`);
        } catch (netErr) {
            steps.oauth_chain.ok = false;
            steps.oauth_chain.severity = 'CRITICAL';
            steps.oauth_chain.error = `OAuth callback host ${callbackHost} is UNREACHABLE (TLS/DNS/connection): ${netErr?.message || netErr}. Every Google sign-in is stranding after consent.`;
            throw new Error(`oauth-chain: ${steps.oauth_chain.error}`);
        }
        // 2xx = healthy. 401 = reachable GoTrue behind the apikey gate, which
        // still proves TLS + edge routing (the layer that actually broke).
        if (!(cbRes.ok || cbRes.status === 401)) {
            steps.oauth_chain.ok = false;
            steps.oauth_chain.severity = 'CRITICAL';
            steps.oauth_chain.error = `OAuth callback host ${callbackHost} /auth/v1/health returned ${cbRes.status}`;
            throw new Error(`oauth-chain: ${steps.oauth_chain.error}`);
        }
        steps.oauth_chain.ok = true;
        steps.oauth_chain.duration_ms = Date.now() - steps.oauth_chain.started_at;

        // ── Step 4: the session actually WORKS AT THE ENGINE ───────────────
        //
        // THIS IS THE STEP THAT WOULD HAVE CAUGHT THE 2026-09-03 OUTAGE ON
        // ITS FIRST TICK, and its absence is why the outage ran 22 hours.
        //
        // Steps 1-3 all passed throughout that outage, because all three ask
        // GoTrue to ISSUE or DESCRIBE a token, and issuing kept working
        // perfectly. What was broken was whether an issued token was worth
        // anything: this probe's own global signOut() was deleting the session
        // row behind it, so every table socket Dan opened was refused
        // 'session_not_found' while this probe reported 'ok' four times an
        // hour. A monitor that proves a key can be cut, and never that it
        // opens the door, is decoration.
        //
        // GET /voice/ice is the cheapest honest door: it runs the engine's
        // authenticateRequest -> supabase.auth.getUser(token), the exact call
        // that answered session_not_found, and it touches no table, no seat,
        // no hand and no money (it mints a short-lived STUN/TURN credential
        // for the caller and nothing else). A 200 proves the whole chain -
        // token issued by GoTrue, accepted by GoTrue on the engine's side of
        // the network, and honoured by the engine.
        //
        // A 401 here is the loud one: the session exists as far as step 2 is
        // concerned and the engine still refuses it, which is exactly the
        // shape of a revocation loop, a retired signing key, or an engine
        // pointed at the wrong Supabase project. Anything else (a network
        // error, a 5xx, a timeout) is the engine being unreachable, which
        // EngineDown and EngineScrapeDown already page for - so it is recorded
        // and NOT raised here, to avoid a second alarm for one event.
        steps.engine_accepts_session = { started_at: Date.now() };
        const engineBase = (process.env.ENGINE_URL || 'https://engine.smarter.poker').trim().replace(/\/$/, '');
        steps.engine_accepts_session.url = `${engineBase}/voice/ice`;
        let engineRes = null;
        try {
            engineRes = await fetch(steps.engine_accepts_session.url, {
                headers: { Authorization: `Bearer ${ld.session.access_token}` },
                signal: AbortSignal.timeout(8000),
            });
        } catch (netErr) {
            // Unreachable is not "the session is bad". Record and move on.
            steps.engine_accepts_session.ok = null;
            steps.engine_accepts_session.skipped = `engine unreachable: ${netErr?.message || netErr}`;
        }
        if (engineRes) {
            steps.engine_accepts_session.status = engineRes.status;
            if (engineRes.status === 401 || engineRes.status === 403) {
                steps.engine_accepts_session.ok = false;
                steps.engine_accepts_session.severity = 'CRITICAL';
                steps.engine_accepts_session.error =
                    `The engine REFUSED a session GoTrue had just issued (HTTP ${engineRes.status}). ` +
                    'Sign-in works and the session is worthless: every table socket is being ' +
                    'refused the same way. Check auth_audit_logs for logout events with ' +
                    'user_agent "node" (something revoking sessions), a signing-key rotation, ' +
                    'or an engine pointed at the wrong Supabase project.';
                throw new Error(`engine-accepts-session: ${steps.engine_accepts_session.error}`);
            }
            if (!engineRes.ok) {
                // 5xx or anything else: the engine is unwell, not the session.
                steps.engine_accepts_session.ok = null;
                steps.engine_accepts_session.skipped = `engine returned ${engineRes.status}`;
            } else {
                steps.engine_accepts_session.ok = true;
            }
        }
        steps.engine_accepts_session.duration_ms =
            Date.now() - steps.engine_accepts_session.started_at;

        // Sign out to avoid accumulating open sessions (best-effort).
        // scope: 'local' ends ONLY the session this run created. The default
        // scope is 'global' and revokes every session the account has on
        // every device - which is the 2026-09-03 outage in one line.
        await anon.auth.signOut({ scope: 'local' }).catch(() => null);

        // Heartbeat OK. NOTE: supabase-js builders resolve with {error} —
        // they don't reject — so check the error field, not try/catch.
        {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'login-probe',
                status: 'ok',
                duration_ms: Date.now() - startedAt,
                details: { steps },
            });
            if (hbErr) console.warn('[login-probe] heartbeat insert failed:', hbErr.message);
        }

        return res.status(200).json({ status: 'ok', duration_ms: Date.now() - startedAt, steps });
    } catch (err) {
        // Sign out any partial session (best-effort). Local scope, same reason.
        await anon.auth.signOut({ scope: 'local' }).catch(() => null);

        const failure = {
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            error: err?.message || String(err),
            failed_step: Object.keys(steps).find((k) => steps[k]?.ok === false) || 'unknown',
            steps,
        };

        {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'login-probe',
                status: 'failed',
                duration_ms: failure.duration_ms,
                details: failure,
            });
            if (hbErr) console.warn('[login-probe] heartbeat insert failed:', hbErr.message);
        }

        // Active alert — email ops directly. This is the difference between
        // "a red badge on a dashboard nobody opens" and someone finding out.
        await alertOps(
            `[smarter.poker] login-probe FAILED: ${failure.failed_step}`,
            `Login probe failure at ${new Date().toISOString()}\n\n` +
            `Failed step: ${failure.failed_step}\n` +
            `Error: ${failure.error}\n\n` +
            `Steps: ${JSON.stringify(steps, null, 2)}\n\n` +
            `Dashboard: https://smarter.poker/admin/auth-health`,
        );

        return res.status(503).json(failure);
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('login-probe', handler);
