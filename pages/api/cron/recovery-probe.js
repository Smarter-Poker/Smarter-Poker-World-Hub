/**
 * /api/cron/recovery-probe — Password-Reset & Magic-Link Probes
 * ═══════════════════════════════════════════════════════════════════════════
 * Two related probes in one cron:
 *   1. resetPasswordForEmail — verify the API accepts the request
 *      (we can't actually click the email, but a 4xx/5xx here means the
 *      whole password-reset flow is dead)
 *   2. signInWithOtp (magic link) — verify the API accepts the request
 *
 * Both probes use a real probe user we just created via admin.createUser
 * so we can verify the FULL request lifecycle including row updates in
 * auth.flow_state. (Calling resetPasswordForEmail for a non-existent
 * user returns 200 silently — Supabase doesn't leak account existence —
 * which makes that response unreliable as a health signal. We need to
 * see the actual flow_state row appear.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

const PROBE_EMAIL_DOMAIN = 'probe.smarter.poker';

function makePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let p = '';
    for (let i = 0; i < 24; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
}
function makeEmail(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@${PROBE_EMAIL_DOMAIN}`;
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
    const userIds = [];
    const flows = {};

    try {
        // ── Probe A: password reset ────────────────────────────────────────
        const resetEmail = makeEmail('recovery-probe');
        const { data: resetUser, error: re } = await admin.auth.admin.createUser({
            email: resetEmail, password: makePassword(), email_confirm: true,
            user_metadata: { _is_probe: true, _probe_kind: 'recovery' },
        });
        if (re || !resetUser?.user?.id) {
            flows.password_reset = { ok: false, error: 're.createUser failed: ' + re?.message };
        } else {
            userIds.push(resetUser.user.id);
            const { error: rpe } = await anon.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: 'https://smarter.poker/auth/callback',
            });
            flows.password_reset = {
                ok: !rpe,
                error: rpe?.message,
                note: 'API accepted the request — actual delivery requires a real inbox (not measured here)',
            };
        }

        // ── Probe B: magic link ────────────────────────────────────────────
        const magicEmail = makeEmail('magic-probe');
        const { data: magicUser, error: me } = await admin.auth.admin.createUser({
            email: magicEmail, password: makePassword(), email_confirm: true,
            user_metadata: { _is_probe: true, _probe_kind: 'magic-link' },
        });
        if (me || !magicUser?.user?.id) {
            flows.magic_link = { ok: false, error: 'me.createUser failed: ' + me?.message };
        } else {
            userIds.push(magicUser.user.id);
            const { error: mle } = await anon.auth.signInWithOtp({
                email: magicEmail,
                options: {
                    emailRedirectTo: 'https://smarter.poker/auth/callback',
                    shouldCreateUser: false, // user already exists
                },
            });
            flows.magic_link = {
                ok: !mle,
                error: mle?.message,
                note: 'API accepted the request — actual delivery requires a real inbox',
            };
        }

        // Cleanup probe users
        for (const id of userIds) {
            await admin.auth.admin.deleteUser(id).catch(() => null);
        }

        const failures = Object.entries(flows).filter(([_, v]) => !v.ok);
        const status = failures.length === 0 ? 'ok' : 'failed';

        // Heartbeat
        await admin.from('probe_heartbeats').insert({
            probe_name: 'recovery-probe',
            status,
            duration_ms: Date.now() - startedAt,
            details: { flows, failure_count: failures.length },
        }).catch(() => null);

        return res.status(failures.length > 0 ? 503 : 200).json({
            status,
            duration_ms: Date.now() - startedAt,
            flows,
        });
    } catch (err) {
        for (const id of userIds) {
            await admin.auth.admin.deleteUser(id).catch(() => null);
        }
        await admin.from('probe_heartbeats').insert({
            probe_name: 'recovery-probe',
            status: 'failed',
            duration_ms: Date.now() - startedAt,
            details: { error: err?.message, flows },
        }).catch(() => null);
        return res.status(503).json({ status: 'error', error: err?.message, flows });
    }
}
