/**
 * /api/cron/signup-probe — Synthetic Signup Health Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs once daily at 2am UTC via Vercel cron (vercel.json "0 2 * * *").
 * Each run creates ONE throwaway auth user with the service role, checks
 * that the signup trigger chain wrote its rows, then deletes that user.
 *
 * WHY A THROWAWAY USER AGAIN (Phase 4, 2026-10-31)
 * ────────────────────────────────────────────────
 * From 2026-05-18 the probe inspected a PERMANENT account
 * (PROBE_SIGNUP_USER_ID). That account was deleted, so every check
 * (user / profile / wallet / diamonds) failed every day and the probe
 * reported a broken signup chain that was really a missing fixture. A
 * fixture check also only proves the triggers worked on the day the
 * fixture was made; it never exercised today's handle_new_user.
 *
 * MAU / cost bound: the 2026-05-18 removal was about a probe that inserted
 * into auth.users every 5-15 minutes (~2,880 users/month). This one runs
 * once a day: at most ~31 throwaway users a month, each deleted in the
 * same run. It never calls auth.signUp and never signs the user in, so no
 * session or refresh token is issued. __tests__/signup-hardening.test.mjs
 * pins both the once-a-day schedule and the delete-in-finally.
 *
 * The user:
 *   • email   signup-probe-<ts>-<rand>@example.invalid (RFC 2606: can never
 *             receive mail, can never collide with a real player)
 *   • email_confirm false: the confirmed-referral triggers stay out of it
 *   • user_metadata.signup_probe = true, so reports can exclude it
 *
 * What is tested
 * ──────────────
 *   • user_created:    admin.auth.admin.createUser succeeded
 *   • user_exists:     getUserById returns it
 *   • profile_exists:  handle_new_user wrote public.profiles
 *   • wallet_exists:   on_auth_user_created_wallet wrote public.wallets
 *   • diamonds_exists: on_auth_user_created_diamonds wrote public.user_diamonds
 *   • cleanup:         admin.auth.admin.deleteUser removed it again
 * handle_new_user swallows its own errors into public.signup_errors, so any
 * signup_errors rows for the throwaway id are attached to the heartbeat.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { unconfiguredProbe } from '../../../src/lib/probeUnconfigured';

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

// RFC 2606 reserves .invalid: this address can never receive mail and can
// never belong to a real player.
export const THROWAWAY_DOMAIN = 'example.invalid';

function throwawayEmail() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `signup-probe-${Date.now()}-${rand}@${THROWAWAY_DOMAIN}`;
}

function randomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let p = '';
    for (let i = 0; i < 32; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
}

/** One downstream row written by a signup trigger. */
async function rowCheck(admin, table, column, userId) {
    const started = Date.now();
    const { data, error } = await admin.from(table).select(column).eq(column, userId).maybeSingle();
    const out = { duration_ms: Date.now() - started };
    if (error || !data) {
        out.ok = false;
        out.error = error?.message || `row not found in ${table}`;
    } else {
        out.ok = true;
    }
    return out;
}

/** Hard-delete the throwaway user and confirm it is gone. Never throws. */
async function deleteThrowaway(admin, userId) {
    const started = Date.now();
    try {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return { ok: false, user_id: userId, error: error.message, duration_ms: Date.now() - started };
        const { data } = await admin.auth.admin.getUserById(userId);
        if (data?.user?.id) return { ok: false, user_id: userId, error: 'user still present after deleteUser', duration_ms: Date.now() - started };
        return { ok: true, duration_ms: Date.now() - started };
    } catch (err) {
        return { ok: false, user_id: userId, error: err?.message || String(err), duration_ms: Date.now() - started };
    }
}

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return unconfiguredProbe(res, admin, 'signup-probe', 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const startedAt = Date.now();
    const checks = {};
    let probeUserId = null;

    try {
        // Check 0: create the throwaway user (service role; no session issued)
        checks.user_created = { started_at: Date.now() };
        const probeEmail = throwawayEmail();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: probeEmail,
            password: randomPassword(),
            email_confirm: false,
            user_metadata: { full_name: 'Signup Probe', signup_probe: true },
        });
        checks.user_created.duration_ms = Date.now() - checks.user_created.started_at;
        probeUserId = created?.user?.id || null;
        if (createErr || !probeUserId) {
            checks.user_created.ok = false;
            checks.user_created.error = createErr?.message || 'createUser returned no user';
        } else {
            checks.user_created.ok = true;
            checks.user_created.email = probeEmail;
            checks.user_created.user_id = probeUserId;
        }

        if (probeUserId) {
            // Check 1: auth.users — the new account is readable
            checks.user_exists = { started_at: Date.now() };
            const { data: authData, error: authErr } = await admin.auth.admin.getUserById(probeUserId);
            checks.user_exists.duration_ms = Date.now() - checks.user_exists.started_at;
            if (authErr || !authData?.user?.id) {
                checks.user_exists.ok = false;
                checks.user_exists.error = authErr?.message || 'user not found in auth.users';
            } else {
                checks.user_exists.ok = true;
            }

            // Checks 2-4: the AFTER INSERT triggers wrote their rows
            checks.profile_exists = await rowCheck(admin, 'profiles', 'id', probeUserId);
            checks.wallet_exists = await rowCheck(admin, 'wallets', 'user_id', probeUserId);
            checks.diamonds_exists = await rowCheck(admin, 'user_diamonds', 'user_id', probeUserId);

            // handle_new_user records what it swallowed; attach it (informational)
            const { data: sErr } = await admin
                .from('signup_errors')
                .select('trigger_name, error_code, error_msg')
                .eq('user_id', probeUserId)
                .limit(5);
            if (Array.isArray(sErr) && sErr.length) checks.signup_errors = { ok: null, rows: sErr };
        }
    } catch (err) {
        checks.exception = { ok: false, error: err?.message || String(err) };
        try { reportApiError(err, req); } catch (_) { /* ignore */ }
    } finally {
        // Always remove the throwaway user, whatever happened above.
        if (probeUserId) checks.cleanup = await deleteThrowaway(admin, probeUserId);
    }

    try {
        // signup_errors is informational (ok: null); every other check must be ok.
        const failedChecks = Object.keys(checks).filter((k) => checks[k].ok === false);
        const allOk = failedChecks.length === 0 && checks.user_created?.ok === true && checks.cleanup?.ok === true;

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
                error: `Signup probe failed checks: ${failedChecks.join(', ') || 'unknown'}`,
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
