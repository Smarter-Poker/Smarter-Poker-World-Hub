/**
 * /api/cron/signup-probe — Synthetic Signup Health Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs once daily at 2am UTC via Vercel cron. Verifies the signup trigger
 * chain is intact by inspecting a PERMANENT probe account — it NEVER creates
 * a new user, so it generates exactly 0 MAU events per run.
 *
 * ⚠️  MAU FIX (2026-05-18)
 * ────────────────────────
 * The previous version called admin.auth.admin.createUser() on every
 * invocation (originally every 5 min, later every 15 min).  Supabase counts
 * every INSERT into auth.users as an MAU event regardless of subsequent
 * deletion.  At 96 runs/day that generated ~2,880 fake MAU/month.
 *
 * This version never touches auth.users writes.  It simply queries whether
 * the expected downstream rows exist for a known permanent probe account.
 * If they exist → triggers are confirmed working → 200.
 * If any are missing → trigger chain is broken → 503.
 *
 * SETUP (one-time, if not already done)
 * ──────────────────────────────────────
 *   1. In Supabase → Authentication → Users, create a user manually:
 *        Email:    probe-signup@probe.smarter.poker
 *        Confirm the user immediately (set email_confirmed_at)
 *   2. Note the UUID Supabase assigns to that user.
 *   3. Add to Vercel env vars (all environments):
 *        PROBE_SIGNUP_USER_ID = <the UUID from step 2>
 *   4. Do NOT delete this user.  It should persist indefinitely.
 *      The rows in profiles / wallets / user_diamonds must also persist.
 *
 * What is tested
 * ──────────────
 *   • auth.users: probe account exists (getUserById)
 *   • profiles:   row with id = PROBE_SIGNUP_USER_ID exists
 *   • wallets:    row with user_id = PROBE_SIGNUP_USER_ID exists
 *   • user_diamonds: row with user_id = PROBE_SIGNUP_USER_ID exists
 *
 * A missing row means the trigger that creates it is broken (or the probe
 * account was accidentally deleted — which should itself be alerted).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        });
    }

    const probeUserId = process.env.PROBE_SIGNUP_USER_ID;
    if (!probeUserId) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing PROBE_SIGNUP_USER_ID env var. ' +
                'Create a permanent probe account in Supabase and set this to its UUID. ' +
                'See the file header comment for setup instructions.',
        });
    }

    const startedAt = Date.now();
    const checks = {};

    try {
        // Check 1: auth.users — probe account itself exists
        checks.user_exists = { started_at: Date.now() };
        const { data: authData, error: authErr } = await admin.auth.admin.getUserById(probeUserId);
        checks.user_exists.duration_ms = Date.now() - checks.user_exists.started_at;
        if (authErr || !authData?.user?.id) {
            checks.user_exists.ok = false;
            checks.user_exists.error = authErr?.message || 'user not found in auth.users';
        } else {
            checks.user_exists.ok = true;
            checks.user_exists.email = authData.user.email;
        }

        // Check 2: profiles row
        checks.profile_exists = { started_at: Date.now() };
        const { data: profileData, error: profileErr } = await admin
            .from('profiles')
            .select('id')
            .eq('id', probeUserId)
            .maybeSingle();
        checks.profile_exists.duration_ms = Date.now() - checks.profile_exists.started_at;
        if (profileErr || !profileData) {
            checks.profile_exists.ok = false;
            checks.profile_exists.error = profileErr?.message || 'row not found in profiles';
        } else {
            checks.profile_exists.ok = true;
        }

        // Check 3: wallets row
        checks.wallet_exists = { started_at: Date.now() };
        const { data: walletData, error: walletErr } = await admin
            .from('wallets')
            .select('user_id')
            .eq('user_id', probeUserId)
            .maybeSingle();
        checks.wallet_exists.duration_ms = Date.now() - checks.wallet_exists.started_at;
        if (walletErr || !walletData) {
            checks.wallet_exists.ok = false;
            checks.wallet_exists.error = walletErr?.message || 'row not found in wallets';
        } else {
            checks.wallet_exists.ok = true;
        }

        // Check 4: user_diamonds row
        checks.diamonds_exists = { started_at: Date.now() };
        const { data: diamondsData, error: diamondsErr } = await admin
            .from('user_diamonds')
            .select('user_id')
            .eq('user_id', probeUserId)
            .maybeSingle();
        checks.diamonds_exists.duration_ms = Date.now() - checks.diamonds_exists.started_at;
        if (diamondsErr || !diamondsData) {
            checks.diamonds_exists.ok = false;
            checks.diamonds_exists.error = diamondsErr?.message || 'row not found in user_diamonds';
        } else {
            checks.diamonds_exists.ok = true;
        }

        const allOk = Object.values(checks).every((c) => c.ok === true);
        const failedChecks = Object.keys(checks).filter((k) => checks[k].ok === false);

        const duration_ms = Date.now() - startedAt;

        // Heartbeat write (best-effort — never fail a healthy probe because of this)
        // Supabase's PostgREST builder is a THENABLE, not a Promise — it has
        // .then() but no .catch(), so this threw TypeError before the await
        // ran. Crashing daily since 2026-06-17: the probe meant to detect a
        // broken signup flow was itself broken, so nobody would have been told.
        const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'signup-probe',
            status: allOk ? 'ok' : 'failed',
            duration_ms,
            details: { checks, failed_checks: failedChecks },
        });
        if (heartbeatErr) {
            console.warn('[signup-probe] heartbeat write failed:', heartbeatErr.message);
        }

        if (!allOk) {
            return res.status(503).json({
                status: 'failed',
                duration_ms,
                error: `Trigger chain broken — missing rows: ${failedChecks.join(', ')}`,
                failed_checks: failedChecks,
                checks,
            });
        }

        return res.status(200).json({
            status: 'ok',
            duration_ms,
            checks,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) { /* ignore */ }

        const duration_ms = Date.now() - startedAt;

        // Same thenable-not-a-Promise bug as above. This one sits in the error
        // path, so it converted a probe FAILURE into a TypeError and lost the
        // original error entirely.
        const { error: failHeartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'signup-probe',
            status: 'failed',
            duration_ms,
            details: { error: err?.message || String(err), checks },
        });
        if (failHeartbeatErr) {
            console.warn('[signup-probe] failure heartbeat write failed:', failHeartbeatErr.message);
        }

        return res.status(503).json({
            status: 'failed',
            duration_ms,
            error: err?.message || String(err),
            checks,
        });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('signup-probe', handler);
