/**
 * /api/cron/archive-signup-errors — Nightly Long-Term Retention
 * ═══════════════════════════════════════════════════════════════════════════
 * Calls public.archive_signup_errors(30) to move rows >30 days old from
 * signup_errors to signup_errors_archive. Keeps the live table small and
 * fast (it's queried by signup_health_view + the admin dashboard) while
 * preserving forensics indefinitely.
 *
 * Idempotent — safe to run multiple times in the same window.
 *
 * Cadence: once a day at 3am UTC (low-traffic window).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

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

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    const started = Date.now();
    try {
        const { data, error } = await admin.rpc('archive_signup_errors', { older_than_days: 30 });
        if (error) {
            return res.status(500).json({ status: 'failed', error: error.message });
        }

        // Heartbeat
        // Supabase's PostgREST builder is a THENABLE, not a Promise: it has
        // .then() but no .catch(), so this threw TypeError before the await
        // ran and took the whole probe down with it. Read the returned
        // { error } instead.
        const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'archive-signup-errors',
            status: 'ok',
            duration_ms: Date.now() - started,
            details: data || {},
        });
        if (heartbeatErr) {
            console.warn('[archive-signup-errors] heartbeat write failed:', heartbeatErr.message);
        }

        return res.status(200).json({
            status: 'ok',
            ...data,
            duration_ms: Date.now() - started,
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}
