/**
 * /api/cron/trigger-audit — Critical Trigger Existence Cron
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs nightly. Asserts that all auth-critical DB objects still exist:
 *
 *   - 3 triggers on auth.users (handle_new_user, ..._wallet, _diamonds)
 *   - 3 corresponding functions, non-empty, with structured error logging
 *   - Tables: profiles, wallets, user_diamonds, signup_errors, probe_heartbeats
 *   - View: signup_health_view
 *   - Sequence: profiles_player_number_seq
 *   - Unique index: wallets_user_id_wallet_type_key (powers ON CONFLICT)
 *
 * What this catches that the signup-probe doesn't:
 *   - A trigger silently dropped by a migration (probe would still pass
 *     because handle_new_user errors get swallowed, but downstream
 *     wallet/diamonds wouldn't be created)
 *   - A unique index dropped that breaks ON CONFLICT clauses
 *   - A function rewritten to no-op (passes signup-probe row checks but
 *     no longer logs to signup_errors → loss of observability)
 *
 * Reports:
 *   - 200 OK if all assertions pass
 *   - 503 + structured detail of which assertion failed
 *   - Optionally emails OPS_ALERT_EMAIL on failure
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

// Each assertion is a SQL query that returns a single boolean column `ok`.
// If ok=false the audit fails. Keep the SQL short so failures are obvious.
const ASSERTIONS = [
    {
        name: 'three_triggers_on_auth_users',
        sql: `SELECT count(*) = 3 AS ok FROM pg_trigger
              WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal`,
    },
    {
        name: 'handle_new_user_function_exists_nonempty',
        sql: `SELECT length(prosrc) > 1000 AS ok FROM pg_proc
              WHERE proname = 'handle_new_user'`,
    },
    {
        name: 'handle_new_user_logs_to_signup_errors',
        sql: `SELECT prosrc ~ 'INSERT INTO public.signup_errors' AS ok FROM pg_proc
              WHERE proname = 'handle_new_user'`,
    },
    {
        name: 'wallet_trigger_function_exists',
        sql: `SELECT length(prosrc) > 100 AS ok FROM pg_proc
              WHERE proname = 'handle_new_user_v2_create_wallet'`,
    },
    {
        name: 'diamonds_trigger_function_exists',
        sql: `SELECT length(prosrc) > 100 AS ok FROM pg_proc
              WHERE proname = 'initialize_user_diamonds'`,
    },
    {
        name: 'profiles_table_exists',
        sql: `SELECT to_regclass('public.profiles') IS NOT NULL AS ok`,
    },
    {
        name: 'wallets_table_exists',
        sql: `SELECT to_regclass('public.wallets') IS NOT NULL AS ok`,
    },
    {
        name: 'user_diamonds_table_exists',
        sql: `SELECT to_regclass('public.user_diamonds') IS NOT NULL AS ok`,
    },
    {
        name: 'signup_errors_table_exists',
        sql: `SELECT to_regclass('public.signup_errors') IS NOT NULL AS ok`,
    },
    {
        name: 'probe_heartbeats_table_exists',
        sql: `SELECT to_regclass('public.probe_heartbeats') IS NOT NULL AS ok`,
    },
    {
        name: 'signup_health_view_exists',
        sql: `SELECT to_regclass('public.signup_health_view') IS NOT NULL AS ok`,
    },
    {
        name: 'player_number_sequence_exists',
        sql: `SELECT to_regclass('public.profiles_player_number_seq') IS NOT NULL AS ok`,
    },
    {
        name: 'wallets_unique_index_exists',
        sql: `SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'wallets'
                  AND schemaname = 'public'
                  AND indexname = 'wallets_user_id_wallet_type_key'
              ) AS ok`,
    },
];

async function runAssertions(admin) {
    const results = [];
    for (const a of ASSERTIONS) {
        try {
            // Use the rpc-like approach: run a parameterless SELECT via REST
            // Supabase's standard JS client doesn't expose raw SQL, but we
            // can use a tiny RPC. Cleaner: define a SQL helper. For
            // simplicity we'll wrap each assertion as an `rpc` call to a
            // generic helper if it exists, else fall back to direct
            // PostgREST queries via a helper view.
            //
            // To avoid creating an open SQL gateway, we hardcode the
            // assertion list above and read each via the
            // postgres_changes helper view ('public._trigger_audit') OR
            // we just call execute-sql via the supabase admin REST.
            //
            // For now, use rpc('exec_audit_check', { check_name: a.name })
            // if it exists; otherwise call our own SQL runner. We'll
            // create the rpc in the migration paired with this file.
            const { data, error } = await admin.rpc('signup_audit_check', { check_name: a.name });
            if (error) {
                results.push({ name: a.name, ok: false, error: error.message });
            } else {
                results.push({ name: a.name, ok: data === true });
            }
        } catch (e) {
            results.push({ name: a.name, ok: false, error: e?.message || String(e) });
        }
    }
    return results;
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({
            status: 'unconfigured',
            error: 'Missing SUPABASE env vars',
        });
    }

    try {
        const results = await runAssertions(admin);
        const failures = results.filter((r) => !r.ok);

        // Heartbeat into probe_heartbeats with probe_name='trigger-audit'
        // Thenable, not a Promise — .catch() does not exist on the builder, so
        // this threw TypeError before the await and crashed the audit probe.
        const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'trigger-audit',
            status: failures.length === 0 ? 'ok' : 'failed',
            duration_ms: 0,
            details: { results, failure_count: failures.length },
        });
        if (heartbeatErr) {
            console.warn('[trigger-audit] heartbeat write failed:', heartbeatErr.message);
        }

        if (failures.length === 0) {
            return res.status(200).json({
                status: 'ok',
                checks_passed: results.length,
                checked_at: new Date().toISOString(),
            });
        }

        // Optional email alert
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
                        subject: `[smarter.poker] Trigger audit FAILED — ${failures.length} assertions`,
                        text: JSON.stringify({ failures, allResults: results }, null, 2),
                    }),
                });
            } catch (_) { /* never fail cron because of alerting */ }
        }

        return res.status(503).json({
            status: 'failed',
            failure_count: failures.length,
            failures,
            checked_at: new Date().toISOString(),
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) { /* ignore */ }
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}
