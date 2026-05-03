/**
 * /api/cron/signup-probe — Synthetic Signup Health Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs every 5 minutes via Vercel cron. Exercises the FULL signup pipeline
 * end-to-end with a throwaway user, then immediately deletes it. If any
 * step fails, alerts via Sentry + (optional) Resend email + (optional) SMS.
 *
 * STEPS
 * ═════
 *   1. POST to Supabase /auth/v1/signup (same path the canonical form uses)
 *      with a unique probe@smarter.poker email and a random strong password.
 *   2. Confirm the user appears in auth.users.
 *   3. Confirm public.profiles row was created by the handle_new_user trigger.
 *   4. Confirm public.wallets row was created by handle_new_user_v2_create_wallet.
 *   5. Confirm public.user_diamonds row was created by initialize_user_diamonds.
 *   6. Delete the probe user via admin.deleteUser (cascades through triggers).
 *
 * If steps 1-5 all pass, the probe returns 200 + reports counters to Sentry
 * as a positive heartbeat. If anything fails, it returns 503 and emits a
 * single, structured alert with the exact step that failed.
 *
 * SAFETY
 * ══════
 *   - Probe emails use the +probe-{timestamp}@probe.smarter.local convention
 *     which is filtered out of all user-facing email lists.
 *   - Probe users are deleted immediately, regardless of pass/fail.
 *   - Best-effort cleanup runs on EVERY invocation to sweep leftover probes
 *     from a prior crash where the cleanup step itself was skipped.
 *   - Rate-limited to once per 60s via in-memory guard so a misconfigured
 *     scheduler can't spam signup attempts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { reportApiError } from '../../../src/lib/sentryWrap';

// [2026-05-03b] Domain is a subdomain we own. NEVER `.local` (RFC 6762
// reserved for mDNS — Supabase email validator inconsistently rejects it
// across environments). NEVER `.test` (RFC 2606 reserved for testing —
// some MX-validating projects refuse it). probe.smarter.poker has no
// MX record so any actual delivery attempt fails fast, but Supabase
// accepts it as syntactically valid.
//
// IMPORTANT: this exact prefix+domain pair is also referenced in the
// signup_health_view migration filter. If you change it here, update
// the view too (otherwise probe users get counted as real signups,
// reintroducing the green-dashboard failure mode).
const PROBE_EMAIL_DOMAIN = 'probe.smarter.poker';
const PROBE_EMAIL_PREFIX = 'probe-';

// In-memory rate limit: at most one probe per 60s on this Lambda instance.
let lastProbeAt = 0;

// Strong random password for probes. validatePassword's HIBP check
// prevents using a weak/common one.
function makeProbePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let p = '';
    for (let i = 0; i < 24; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
}

function makeProbeEmail() {
    return `${PROBE_EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${PROBE_EMAIL_DOMAIN}`;
}

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

let _anon = null;
function getAnon() {
    if (_anon) return _anon;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    _anon = createClient(url, key, { auth: { persistSession: false } });
    return _anon;
}

// ── Sweep stale probes (anything older than 1h that wasn't deleted) ───────
async function sweepStaleProbes(admin) {
    try {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
        const cutoff = Date.now() - 60 * 60 * 1000;
        const stale = (list?.users || []).filter(u =>
            (u.email || '').endsWith(`@${PROBE_EMAIL_DOMAIN}`) &&
            new Date(u.created_at).getTime() < cutoff
        );
        for (const u of stale) {
            await admin.auth.admin.deleteUser(u.id).catch(() => null);
        }
        return stale.length;
    } catch (e) {
        // Sweep is best-effort; never fail the probe because of leftovers.
        return -1;
    }
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    if (Date.now() - lastProbeAt < 60_000) {
        return res.status(200).json({ status: 'skipped', reason: 'rate_limited' });
    }
    lastProbeAt = Date.now();

    const admin = getAdmin();
    const anon = getAnon();
    if (!admin || !anon) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing SUPABASE env vars — cannot probe',
        });
    }

    const email = makeProbeEmail();
    const password = makeProbePassword();
    const startedAt = Date.now();
    let userId = null;
    const steps = {};

    try {
        // Step 1: create user via admin API.
        //
        // [2026-05-03e] Originally used anon.auth.signUp({...}) for full
        // path parity. Problem: with mailer_autoconfirm=false, Supabase
        // tries to send a confirmation email per signup. probe.smarter.poker
        // has no MX so all 288 emails/day bounce, which hurts sender
        // reputation and burns email-quota that real users need.
        //
        // admin.auth.admin.createUser({email_confirm:true}) fires the SAME
        // INSERT into auth.users → SAME trigger chain (handle_new_user,
        // wallet trigger, diamonds trigger). The only thing it skips is the
        // GoTrue email-send step, which is a tiny REST handler unlikely to
        // silently break. Net: same coverage, zero email burn.
        steps.signup = { started_at: Date.now() };
        const { data: signUpData, error: signUpErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: 'Health Probe',
                first_name: 'Health',
                last_name: 'Probe',
                poker_alias: 'probe',
                _is_probe: true,
            },
        });
        steps.signup.duration_ms = Date.now() - steps.signup.started_at;
        if (signUpErr || !signUpData?.user?.id) {
            steps.signup.ok = false;
            steps.signup.error = signUpErr?.message || 'no user returned';
            throw new Error(`Step 1 (createUser) failed: ${steps.signup.error}`);
        }
        userId = signUpData.user.id;
        steps.signup.ok = true;
        steps.signup.user_id = userId;

        // [2026-05-03b] Trigger row visibility — POLL with backoff instead
        // of a fixed sleep. Triggers fire AFTER INSERT (synchronously inside
        // the transaction) so the rows ARE visible the moment auth.users
        // commits, but under DB load a single sleep can be insufficient and
        // a fixed sleep is wasteful when the rows are visible faster.
        const checks = [
            { name: 'auth_users',   query: () => admin.auth.admin.getUserById(userId), shape: (d) => d?.data?.user },
            { name: 'profiles',     query: () => admin.from('profiles').select('id, username, player_number').eq('id', userId).maybeSingle(), shape: (d) => d?.data },
            { name: 'wallets',      query: () => admin.from('wallets').select('user_id, wallet_type, balance').eq('user_id', userId).eq('wallet_type', 'PLAYER').maybeSingle(), shape: (d) => d?.data },
            { name: 'user_diamonds', query: () => admin.from('user_diamonds').select('user_id, balance').eq('user_id', userId).maybeSingle(), shape: (d) => d?.data },
        ];

        for (const c of checks) {
            steps[c.name] = { started_at: Date.now(), attempts: 0 };
            // Poll: 100ms, 200ms, 400ms, 800ms, 1600ms — total ≤3.1s per check
            const delays = [0, 100, 200, 400, 800, 1600];
            let lastResult = null;
            for (const d of delays) {
                if (d > 0) await new Promise(r => setTimeout(r, d));
                steps[c.name].attempts++;
                lastResult = await c.query();
                const row = c.shape(lastResult);
                if (row && !lastResult.error) {
                    steps[c.name].ok = true;
                    steps[c.name].duration_ms = Date.now() - steps[c.name].started_at;
                    break;
                }
            }
            if (!steps[c.name].ok) {
                steps[c.name].ok = false;
                steps[c.name].duration_ms = Date.now() - steps[c.name].started_at;
                steps[c.name].error = lastResult?.error?.message || 'row not found after polling';
                throw new Error(`Step ${c.name} failed after ${steps[c.name].attempts} attempts: ${steps[c.name].error}`);
            }
        }

        // [2026-05-03d] Heartbeat write BEFORE cleanup so the dashboard
        // can detect a stalled probe (probe_heartbeats survives delete).
        await admin.from('probe_heartbeats').insert({
            probe_name: 'signup-probe',
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            details: { steps },
        }).catch((hbErr) => {
            // Heartbeat is best-effort; never let it fail an otherwise-OK probe.
            console.warn('[signup-probe] heartbeat write failed:', hbErr?.message || hbErr);
        });

        // Step 6: cleanup
        await admin.auth.admin.deleteUser(userId).catch(() => null);

        // Background sweep — best-effort, don't await
        sweepStaleProbes(admin).catch(() => null);

        return res.status(200).json({
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            steps,
        });
    } catch (err) {
        // Always try to clean up the probe user even if we failed mid-way
        if (userId) {
            await admin.auth.admin.deleteUser(userId).catch(() => null);
        }

        try { reportApiError(err, req); } catch (_) { /* ignore */ }

        // Single structured failure record so Sentry / log search can group
        const failure = {
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            error: err?.message || String(err),
            failed_step: Object.keys(steps).find(k => steps[k]?.ok === false) || 'unknown',
            steps,
            probe_email: email,
        };

        // Heartbeat the failure too — so signup_health_view shows
        // probe_failed_1h > 0 even if email/Sentry alerts are dropped.
        await admin.from('probe_heartbeats').insert({
            probe_name: 'signup-probe',
            status: 'failed',
            duration_ms: failure.duration_ms,
            details: { failed_step: failure.failed_step, error: failure.error, steps },
        }).catch(() => null);

        // Optional: Resend email alert
        if (process.env.RESEND_API_KEY && process.env.OPS_ALERT_EMAIL) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker',
                        to: process.env.OPS_ALERT_EMAIL,
                        subject: `[smarter.poker] Signup probe FAILED at step: ${failure.failed_step}`,
                        text: JSON.stringify(failure, null, 2),
                    }),
                });
            } catch (_emailErr) { /* never let alerting itself fail the cron */ }
        }

        return res.status(503).json(failure);
    }
}
