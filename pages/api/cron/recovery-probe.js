/**
 * /api/cron/recovery-probe — Password-Reset & Magic-Link Probes
 * ═══════════════════════════════════════════════════════════════════════════
 * Two related probes in one cron:
 *   1. resetPasswordForEmail — verify the API accepts the request
 *      (we can't actually click the email, but a 4xx/5xx here means the
 *      whole password-reset flow is dead)
 *   2. signInWithOtp (magic link) — verify the API accepts the request
 *
 * ⚠️  MAU FIX (2026-05-18)
 * ────────────────────────
 * The original probe created 2 brand-new unique users on every invocation.
 * Each auth.createUser call registers as a new auth identity, and signInWithOtp
 * counted as an MAU event.  Running every 15 min = 2,880 runs/month × 2 users
 * = ~5,760 additional fake MAU/month.
 *
 * This version reuses a single PERMANENT probe account.  1 MAU/month total.
 * We don't need a fresh user to verify that resetPasswordForEmail or
 * signInWithOtp accept requests — any confirmed user works.
 *
 * RATE-LIMIT HANDLING (2026-05-18)
 * ─────────────────────────────────
 * Supabase throttles email sends to the same address if called back-to-back.
 * The second call (signInWithOtp) often returns HTTP 429 immediately after
 * the first (resetPasswordForEmail) succeeds.  A 429 means the API endpoint
 * is alive and healthy — it is NOT a real failure.  We now treat 429 as
 * rate_limited=true / ok=true so the probe returns 200 in that case.
 *
 * SETUP (one-time)
 * ────────────────
 *   1. You can reuse the same account as login-probe, or create a dedicated one:
 *        Email:    probe-recovery@probe.smarter.poker
 *        (Confirm the user immediately in Supabase dashboard)
 *   2. Add to Vercel env vars (all environments):
 *        PROBE_RECOVERY_EMAIL = probe-recovery@probe.smarter.poker
 *        (No password needed — this probe only tests the API accepts the request,
 *        not that delivery works, since probe.smarter.poker has no MX record)
 *   3. Do NOT delete this user.  It should persist indefinitely.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
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

/** True if the Supabase error is just a rate-limit (429) — the API is healthy. */
function isRateLimit(err) {
    if (!err) return false;
    // Supabase AuthError carries .status (HTTP code) and .message
    if (err.status === 429) return true;
    const msg = (err.message || '').toLowerCase();
    return msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('email rate limit');
}

/**
 * "Signups not allowed for otp": GoTrue's answer to signInWithOtp with
 * shouldCreateUser:false when it does not find a user for the address (or
 * when OTP signups are disabled project-wide). The endpoint is up and
 * answering; what is wrong is the probe account or the OTP config, so it is
 * DEGRADED, not a dead magic-link flow (Phase 4, 2026-10-31).
 */
export function isOtpSignupRefusal(err) {
    return !!err && /signups not allowed for otp/i.test(err.message || '');
}

/**
 * probe_heartbeats_status_check allows only ok | failed | partial | skipped
 * (supabase/migrations/20261019101300_probe_heartbeats_record_a_skipped_run.sql).
 * A degraded run is written as 'partial' with details.degraded = true; a
 * literal 'degraded' (or the old 'ok_rate_limited') violates the CHECK and the
 * heartbeat row is silently lost.
 */
export const HEARTBEAT_STATUS_DEGRADED = 'partial';

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    const anon = getAnon();
    if (!admin || !anon) return res.status(500).json({ status: 'unconfigured' });

    const probeEmail = process.env.PROBE_RECOVERY_EMAIL;
    if (!probeEmail) {
        return unconfiguredProbe(res, admin, 'recovery-probe', 'Missing PROBE_RECOVERY_EMAIL env var. ' +
                'Create a permanent probe account in Supabase and add the email to Vercel env vars. ' +
                'See the file header comment for setup instructions.');
    }

    const startedAt = Date.now();
    const flows = {};

    try {
        // ── Probe A: password reset ────────────────────────────────────────
        // Tests that the resetPasswordForEmail API endpoint accepts the request.
        // We can't verify actual email delivery (probe.smarter.poker has no MX),
        // but a 4xx/5xx (non-429) indicates the flow is broken at the API level.
        const { error: rpe } = await anon.auth.resetPasswordForEmail(probeEmail, {
            redirectTo: 'https://smarter.poker/auth/callback',
        });
        const rpRateLimit = isRateLimit(rpe);
        flows.password_reset = {
            ok: !rpe || rpRateLimit,
            rate_limited: rpRateLimit,
            error: (rpe && !rpRateLimit) ? rpe?.message : null,
            note: rpRateLimit
                ? 'Rate-limited (429) - API is alive, throttling duplicate sends'
                : 'API accepted the request - actual delivery requires a real inbox (not measured here)',
        };

        // ── Probe B: magic link ────────────────────────────────────────────
        // Tests that the signInWithOtp (magic link) API endpoint accepts the request.
        // NOTE: Running immediately after Probe A often triggers a 429 rate-limit
        // on the same email address. That is expected healthy behaviour.
        const { error: mle } = await anon.auth.signInWithOtp({
            email: probeEmail,
            options: {
                emailRedirectTo: 'https://smarter.poker/auth/callback',
                shouldCreateUser: false, // user already exists — never create a new one
            },
        });
        const mlRateLimit = isRateLimit(mle);
        const mlRefused = !mlRateLimit && isOtpSignupRefusal(mle);
        flows.magic_link = {
            ok: !mle || mlRateLimit,
            rate_limited: mlRateLimit,
            degraded: mlRefused,
            error: (mle && !mlRateLimit) ? mle?.message : null,
            note: mlRateLimit
                ? 'Rate-limited (429) - API is alive, throttling duplicate sends'
                : mlRefused
                    ? 'Degraded: GoTrue refused the magic link with "Signups not allowed for otp" even with shouldCreateUser:false. '
                        + 'The endpoint answered; check that PROBE_RECOVERY_EMAIL still exists in auth.users and that email OTP is enabled.'
                    : 'API accepted the request - actual delivery requires a real inbox',
        };

        // Only count real failures (not rate-limits, not degraded) as probe failures
        const failures = Object.entries(flows).filter(([_, v]) => !v.ok && !v.degraded);
        const degraded = Object.entries(flows).filter(([_, v]) => v.degraded);
        const rateLimited = Object.entries(flows).filter(([_, v]) => v.rate_limited);
        const status = failures.length > 0
            ? 'failed'
            : degraded.length > 0
                ? 'degraded'
                : (rateLimited.length > 0 ? 'ok_rate_limited' : 'ok');
        const heartbeatStatus = status === 'failed' ? 'failed' : status === 'degraded' ? HEARTBEAT_STATUS_DEGRADED : 'ok';

        // Heartbeat (best-effort). The builder resolves { error } rather than
        // throwing, so the error is read and logged instead of swallowed.
        try {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'recovery-probe',
                status: heartbeatStatus,
                duration_ms: Date.now() - startedAt,
                details: {
                    flows,
                    probe_status: status,
                    degraded: degraded.length > 0,
                    degraded_note: degraded.length > 0 ? degraded.map(([k, v]) => `${k}: ${v.note}`).join(' | ') : null,
                    failure_count: failures.length,
                    degraded_count: degraded.length,
                    rate_limited_count: rateLimited.length,
                },
            });
            if (hbErr) console.warn('[recovery-probe] heartbeat write failed:', hbErr.message);
        } catch (_) { /* heartbeat is best-effort */ }

        return res.status(failures.length > 0 ? 503 : 200).json({
            status,
            duration_ms: Date.now() - startedAt,
            flows,
        });
    } catch (err) {
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'recovery-probe',
                status: 'failed',
                duration_ms: Date.now() - startedAt,
                details: { error: err?.message, flows },
            });
        } catch (_) { /* heartbeat is best-effort */ }
        return res.status(503).json({ status: 'error', error: err?.message, flows });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('recovery-probe', handler);
