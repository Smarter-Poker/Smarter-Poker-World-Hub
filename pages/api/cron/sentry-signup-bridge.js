/**
 * /api/cron/sentry-signup-bridge — DB-to-Sentry signup_errors bridge
 * ═══════════════════════════════════════════════════════════════════════════
 * Closes a major observability gap: the user-facing auth pages
 * (signup.js, login.js, callback.js) currently DON'T explicitly call
 * Sentry.captureException — they just console.warn. With
 * `withSentryConfig` disabled in next.config.js (OOM workaround), Sentry
 * does NOT auto-instrument unhandled errors. So a real user can hit a
 * signup failure and NOTHING lands in Sentry.
 *
 * The DB-side trigger error trail (public.signup_errors) IS reliable —
 * every time handle_new_user / wallet trigger / diamonds trigger throws,
 * it inserts into signup_errors. This cron polls those rows and forwards
 * them to Sentry as captureMessage, with structured auth.flow=signup +
 * auth.error_code=<sqlstate> + auth.trigger=<name> tags so on-call can
 * filter for signup-related Sentry alerts in one click.
 *
 * Marks each row's forwarded_to_sentry=now() after success so we never
 * double-send.
 *
 * Cadence: every 5 min (matches the signup probe).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let Sentry;
let sentryIsStub = false;
try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    Sentry = require('@sentry/nextjs');
} catch (_) {
    sentryIsStub = true;
    Sentry = {
        captureMessage: () => null,
        captureException: () => null,
        withScope: (cb) => cb({ setTag: () => null, setContext: () => null, setLevel: () => null, setFingerprint: () => null }),
    };
}

// True only when events will actually be transmitted. If the SDK failed to
// load OR loaded but was never initialized (no client), captureMessage is a
// silent no-op — in that state we must NOT stamp rows as forwarded.
function sentryReady() {
    if (sentryIsStub) return false;
    try {
        if (typeof Sentry.getClient === 'function') return !!Sentry.getClient();
    } catch (_) { /* fall through */ }
    return true; // older SDK without getClient — assume initialized
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
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    const startedAt = Date.now();
    let forwarded = 0;
    let alreadyForwarded = 0;
    let failed = 0;

    try {
        // Fetch all unforwarded errors from the last 7 days.
        // (Older than that we don't bother — those would be backfill noise.)
        const { data: rows, error } = await admin
            .from('signup_errors')
            .select('id, user_id, email, trigger_name, error_code, error_msg, raw_meta, occurred_at, forwarded_to_sentry')
            .is('forwarded_to_sentry', null)
            .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('occurred_at', { ascending: true })
            .limit(100);

        if (error) {
            return res.status(500).json({
                status: 'failed',
                stage: 'fetch',
                error: error.message,
            });
        }

        // [2026-07-25] Guard: stamping forwarded_to_sentry while Sentry is a
        // no-op silently DESTROYS the alert trail (rows are never re-scanned).
        // Bail without stamping so the next run retries once Sentry works.
        if ((rows || []).length > 0 && !sentryReady()) {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'sentry-signup-bridge',
                status: 'failed',
                duration_ms: Date.now() - startedAt,
                details: { reason: 'sentry_unavailable', pending: rows.length },
            });
            if (hbErr) console.warn('[sentry-bridge] heartbeat insert failed:', hbErr.message);
            return res.status(200).json({ status: 'sentry_unavailable', pending: rows.length });
        }

        for (const row of rows || []) {
            try {
                Sentry.withScope((scope) => {
                    scope.setTag('auth.flow', 'signup');
                    scope.setTag('auth.trigger', row.trigger_name || 'unknown');
                    scope.setTag('auth.error_code', row.error_code || 'unknown');
                    scope.setTag('auth.source', 'signup_errors_bridge');
                    scope.setLevel('error');
                    // Group similar errors together in Sentry
                    scope.setFingerprint(['signup-error', row.trigger_name || 'unknown', row.error_code || 'unknown']);
                    scope.setContext('signup_error', {
                        row_id: row.id,
                        user_id: row.user_id,
                        email_domain: typeof row.email === 'string' ? (row.email.split('@')[1] || 'unknown') : 'unknown',
                        occurred_at: row.occurred_at,
                        trigger_name: row.trigger_name,
                        error_code: row.error_code,
                    });
                    Sentry.captureMessage(
                        `[signup ${row.trigger_name}] ${row.error_msg?.slice(0, 200) || row.error_code || 'unknown'}`,
                    );
                });

                // Flush before stamping — on Vercel the lambda can freeze
                // before the SDK's async transport transmits the event.
                if (typeof Sentry.flush === 'function') {
                    await Sentry.flush(2000).catch(() => null);
                }

                // Mark forwarded
                const { error: updateErr } = await admin
                    .from('signup_errors')
                    .update({ forwarded_to_sentry: new Date().toISOString() })
                    .eq('id', row.id);
                if (updateErr) {
                    failed++;
                } else {
                    forwarded++;
                }
            } catch (_e) {
                failed++;
            }
        }

        // Heartbeat — supabase-js builders resolve with {error}, they do NOT
        // reject, so .catch() was dead code and insert failures were silent.
        {
            const { error: hbErr } = await admin.from('probe_heartbeats').insert({
                probe_name: 'sentry-signup-bridge',
                status: failed > 0 ? 'partial' : 'ok',
                duration_ms: Date.now() - startedAt,
                details: { forwarded, failed, scanned: rows?.length || 0 },
            });
            if (hbErr) console.warn('[sentry-bridge] heartbeat insert failed:', hbErr.message);
        }

        return res.status(200).json({
            status: failed > 0 ? 'partial' : 'ok',
            forwarded,
            failed,
            already_forwarded: alreadyForwarded,
            scanned: rows?.length || 0,
            duration_ms: Date.now() - startedAt,
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('sentry-signup-bridge', handler);
