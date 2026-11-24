/**
 * POST /api/trivia/integrity-signal
 *
 * Non-punitive anti-cheat integrity telemetry intake.
 * Authenticated via getServerUserWithFallback, rate-limited with LIMITS.write,
 * validates bounded numeric telemetry, and upserts idempotently via
 * public.trivia_record_integrity_signal_v1. Never blocks gameplay or leaks
 * internal risk scoring back to the player client.
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { parseIntegritySignalBody } from '../../../src/lib/trivia/integrityAndElo.mjs';

let cachedClient = null;
function serviceClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    if (!cachedClient) cachedClient = createClient(url, key, { auth: { persistSession: false } });
    return cachedClient;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const sb = serviceClient();
    if (!sb) {
        return res.status(503).json({ success: false, error: 'server_misconfigured' });
    }

    try {
        const { user, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !user?.id) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }

        const parsed = parseIntegritySignalBody(req.body);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        const s = parsed.value;
        const { data, error } = await sb.rpc('trivia_record_integrity_signal_v1', {
            p_session_id: s.sessionId,
            p_user_id: user.id,
            p_mode: s.mode,
            p_tab_blur_count: s.tabBlurCount,
            p_copy_attempt_count: s.copyAttemptCount,
            p_paste_attempt_count: s.pasteAttemptCount,
            p_avg_answer_ms: s.avgAnswerMs,
            p_min_answer_ms: s.minAnswerMs,
            p_fast_correct_count: s.fastCorrectCount,
            p_accuracy_pct: s.accuracyPct,
        });

        if (error) {
            console.warn('[trivia/integrity-signal] rpc failed:', error.code || error.message);
            return res.status(503).json({ success: false, error: 'integrity_signal_unavailable' });
        }

        if (!data || data.success !== true) {
            const code = typeof data?.error === 'string' ? data.error : 'integrity_signal_rejected';
            const status = code === 'session_owner_mismatch' ? 403 : 400;
            return res.status(status).json({ success: false, error: code });
        }

        return res.status(200).json({
            success: true,
            recorded: true,
            sessionId: s.sessionId,
        });
    } catch (err) {
        console.warn('[trivia/integrity-signal] unexpected error:', err?.message || err);
        try { reportApiError(err, req); } catch (_) { /* best effort */ }
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'integrity_signal_failed' });
        }
        return undefined;
    }
}
