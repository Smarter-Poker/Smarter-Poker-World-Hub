/**
 * /api/cron/auth-integrity-audit — DB Integrity Audit + Auto-Heal
 * ═══════════════════════════════════════════════════════════════════════════
 * Detects orphan auth.users (rows with no profile, wallet, or
 * user_diamonds row) and optionally heals them by inserting the missing
 * rows with default values matching what the triggers would have created.
 *
 * Distinguishes REAL users from system/test users via
 * public.is_system_user(). Only real-user orphans alert.
 *
 * Two modes:
 *   - audit only (default, GET): runs audit_auth_integrity() and reports
 *   - audit + heal (GET ?heal=1): also runs heal_auth_integrity()
 *
 * The 9-day signup outage of 2026-04-24 → 2026-05-03 may have left orphans
 * in a different state class (Supabase wasn't reached so even auth.users
 * insertion was blocked). But future trigger failures could leave a user
 * in auth.users + profiles but not wallets, etc. This cron catches those.
 *
 * Cadence: nightly. Manual heal triggered via `?heal=1` after on-call review.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let Sentry;
try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    Sentry = require('@sentry/nextjs');
} catch (_) {
    Sentry = { captureMessage: () => null, withScope: (cb) => cb({ setTag: () => null, setLevel: () => null }) };
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

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured' });
    }

    const started = Date.now();

    try {
        const { data: auditData, error: auditErr } = await admin.rpc('audit_auth_integrity');
        if (auditErr) {
            return res.status(500).json({ status: 'failed', stage: 'audit', error: auditErr.message });
        }

        const realOrphans = auditData?.real_orphans || {};
        const realCount = (realOrphans.no_profile || 0) + (realOrphans.no_wallet || 0) + (realOrphans.no_diamonds || 0);

        let healResult = null;
        const shouldHeal = req.query?.heal === '1';
        if (shouldHeal && realCount > 0) {
            const { data: hData, error: hErr } = await admin.rpc('heal_auth_integrity');
            if (hErr) {
                healResult = { error: hErr.message };
            } else {
                healResult = hData;
            }
        }

        // Heartbeat
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'auth-integrity-audit',
                status: realCount > 0 ? 'partial' : 'ok',
                duration_ms: Date.now() - started,
                details: { audit: auditData, heal: healResult, healed: shouldHeal },
            });
        } catch (_) { /* heartbeat is best-effort */ }

        // Alert on real orphans
        if (realCount > 0) {
            try {
                Sentry.withScope((scope) => {
                    scope.setTag('auth.flow', 'integrity_audit');
                    scope.setLevel(realCount > 5 ? 'error' : 'warning');
                    Sentry.captureMessage(
                        `Auth integrity: ${realCount} REAL orphan(s) detected`
                        + ` (no_profile=${realOrphans.no_profile}, no_wallet=${realOrphans.no_wallet}, no_diamonds=${realOrphans.no_diamonds})`
                        + (shouldHeal ? ` — healed: ${JSON.stringify(healResult)}` : ' — pass ?heal=1 to fix'),
                    );
                });
            } catch (_) { /* ignore */ }

            if (process.env.RESEND_API_KEY && process.env.OPS_ALERT_EMAIL) {
                try {
                    await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            from: process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker',
                            to: process.env.OPS_ALERT_EMAIL,
                            subject: `[smarter.poker] Auth integrity: ${realCount} real orphan(s)`,
                            text: JSON.stringify({ audit: auditData, heal: healResult }, null, 2),
                        }),
                    });
                } catch (_) { /* ignore */ }
            }
        }

        return res.status(200).json({
            status: realCount > 0 ? 'real_orphans_detected' : 'ok',
            audit: auditData,
            heal: healResult,
            duration_ms: Date.now() - started,
            note: shouldHeal ? 'heal mode' : 'audit-only mode (pass ?heal=1 to fix orphans)',
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('auth-integrity-audit', handler);
