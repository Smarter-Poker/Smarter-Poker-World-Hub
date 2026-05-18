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

export default async function handler(req, res) {
    if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    const anon = getAnon();
    if (!admin || !anon) return res.status(500).json({ status: 'unconfigured' });

    const probeEmail = process.env.PROBE_RECOVERY_EMAIL;
    if (!probeEmail) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing PROBE_RECOVERY_EMAIL env var. ' +
                'Create a permanent probe account in Supabase and add the email to Vercel env vars. ' +
                'See the file header comment for setup instructions.',
        });
    }

    const startedAt = Date.now();
    const flows = {};

    try {
        // ── Probe A: password reset ────────────────────────────────────────
        // Tests that the resetPasswordForEmail API endpoint accepts the request.
        // We can't verify actual email delivery (probe.smarter.poker has no MX),
        // but a 4xx/5xx indicates the flow is broken at the API level.
        const { error: rpe } = await anon.auth.resetPasswordForEmail(probeEmail, {
            redirectTo: 'https://smarter.poker/auth/callback',
        });
        flows.password_reset = {
            ok: !rpe,
            error: rpe?.message,
            note: 'API accepted the request — actual delivery requires a real inbox (not measured here)',
        };

        // ── Probe B: magic link ────────────────────────────────────────────
        // Tests that the signInWithOtp (magic link) API endpoint accepts the request.
        const { error: mle } = await anon.auth.signInWithOtp({
            email: probeEmail,
            options: {
                emailRedirectTo: 'https://smarter.poker/auth/callback',
                shouldCreateUser: false, // user already exists — never create a new one
            },
        });
        flows.magic_link = {
            ok: !mle,
            error: mle?.message,
            note: 'API accepted the request — actual delivery requires a real inbox',
        };

        const failures = Object.entries(flows).filter(([_, v]) => !v.ok);
        const status = failures.length === 0 ? 'ok' : 'failed';

        // Heartbeat
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'recovery-probe',
                status,
                duration_ms: Date.now() - startedAt,
                details: { flows, failure_count: failures.length },
            });
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
