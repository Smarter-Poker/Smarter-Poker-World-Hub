/**
 * /api/cron/login-probe — Synthetic Login Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Sister probe to /api/cron/signup-probe. Verifies the LOGIN flow works
 * end-to-end: createUser → signInWithPassword → assert session returned →
 * assert getUser returns the user → cleanup.
 *
 * The signup-probe does NOT exercise login — only signUp. A user could
 * sign up successfully but be unable to log in (e.g. password hashing
 * broken, session refresh broken, JWT signer broken). This probe catches
 * that distinct failure class.
 *
 * Uses the same probe.smarter.poker domain as signup-probe; cleanup +
 * heartbeat patterns are identical.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

const PROBE_EMAIL_DOMAIN = 'probe.smarter.poker';
const PROBE_EMAIL_PREFIX = 'login-probe-';

function makePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let p = '';
    for (let i = 0; i < 24; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
}
function makeEmail() {
    return `${PROBE_EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${PROBE_EMAIL_DOMAIN}`;
}

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

    const startedAt = Date.now();
    const email = makeEmail();
    const password = makePassword();
    let userId = null;
    const steps = {};

    try {
        // Step 1: Create the user (admin path; bypasses email confirm)
        steps.create = { started_at: Date.now() };
        const { data: cd, error: ce } = await admin.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { _is_probe: true, _probe_kind: 'login' },
        });
        steps.create.duration_ms = Date.now() - steps.create.started_at;
        if (ce || !cd?.user?.id) {
            steps.create.ok = false;
            steps.create.error = ce?.message;
            throw new Error(`createUser failed: ${steps.create.error}`);
        }
        userId = cd.user.id;
        steps.create.ok = true;

        // Step 2: Sign in via the anon client (same path real users take)
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

        // Step 3: Verify the session JWT works for getUser
        steps.getuser = { started_at: Date.now() };
        const { data: ud, error: ue } = await anon.auth.getUser(ld.session.access_token);
        steps.getuser.duration_ms = Date.now() - steps.getuser.started_at;
        if (ue || !ud?.user?.id || ud.user.id !== userId) {
            steps.getuser.ok = false;
            steps.getuser.error = ue?.message || 'getUser returned different/no user';
            throw new Error(`getUser failed: ${steps.getuser.error}`);
        }
        steps.getuser.ok = true;

        // Heartbeat OK
        await admin.from('probe_heartbeats').insert({
            probe_name: 'login-probe',
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            details: { steps },
        }).catch(() => null);

        // Cleanup
        await admin.auth.admin.deleteUser(userId).catch(() => null);

        return res.status(200).json({ status: 'ok', duration_ms: Date.now() - startedAt, steps });
    } catch (err) {
        if (userId) await admin.auth.admin.deleteUser(userId).catch(() => null);

        const failure = {
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            error: err?.message || String(err),
            failed_step: Object.keys(steps).find((k) => steps[k]?.ok === false) || 'unknown',
            steps,
        };

        await admin.from('probe_heartbeats').insert({
            probe_name: 'login-probe',
            status: 'failed',
            duration_ms: failure.duration_ms,
            details: failure,
        }).catch(() => null);

        return res.status(503).json(failure);
    }
}
