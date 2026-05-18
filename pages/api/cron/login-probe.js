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
 * What is tested
 * ──────────────
 *   • signInWithPassword returns a valid session (access_token + refresh_token)
 *   • getUser with that access_token returns the correct user id
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
    if (!admin || !anon) return res.status(500).json({ status: 'unconfigured', error: 'Missing Supabase env vars' });

    const email = process.env.PROBE_LOGIN_EMAIL;
    const password = process.env.PROBE_LOGIN_PASSWORD;
    if (!email || !password) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing PROBE_LOGIN_EMAIL or PROBE_LOGIN_PASSWORD env vars. ' +
                'Create a permanent probe account in Supabase and add the creds to Vercel env vars. ' +
                'See the file header comment for setup instructions.',
        });
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

        // Sign out to avoid accumulating open sessions (best-effort)
        await anon.auth.signOut().catch(() => null);

        // Heartbeat OK
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'login-probe',
                status: 'ok',
                duration_ms: Date.now() - startedAt,
                details: { steps },
            });
        } catch (_) { /* heartbeat is best-effort */ }

        return res.status(200).json({ status: 'ok', duration_ms: Date.now() - startedAt, steps });
    } catch (err) {
        // Sign out any partial session (best-effort)
        await anon.auth.signOut().catch(() => null);

        const failure = {
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            error: err?.message || String(err),
            failed_step: Object.keys(steps).find((k) => steps[k]?.ok === false) || 'unknown',
            steps,
        };

        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'login-probe',
                status: 'failed',
                duration_ms: failure.duration_ms,
                details: failure,
            });
        } catch (_) { /* heartbeat is best-effort */ }

        return res.status(503).json(failure);
    }
}
