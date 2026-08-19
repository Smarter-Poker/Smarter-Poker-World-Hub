/**
 * /api/client-crash — durable sink for React error-boundary crashes
 * ═══════════════════════════════════════════════════════════════════════════
 * HubErrorBoundary and PageErrorBoundary POST here from componentDidCatch.
 *
 * This exists because every other reporting path in this app is a black hole:
 *   - Sentry's browser SDK never initialises (no NEXT_PUBLIC_SENTRY_DSN is
 *     baked into the production bundle), so Sentry.captureException() in the
 *     boundaries does nothing.
 *   - public.sentry_error_log has 0 rows — the snapshot mirror never ran.
 *   - PageErrorBoundary's sessionStorage log dies with the tab.
 *
 * So on 2026-08-19 a live page showed "Temporarily Unavailable" and there was
 * no way to learn what threw. Rows in public.client_crash_log are that answer.
 *
 * Contract: this endpoint NEVER fails loudly. A crash reporter that throws
 * inside an error boundary turns one broken section into a broken page, so
 * every path returns 200 and swallows.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../src/lib/supabaseServerClient';
import { applyRateLimit } from '../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) return null; // no service role -> nothing to write with
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const ALLOWED_BOUNDARIES = new Set(['hub', 'page']);
const clip = (v, n) => (v === undefined || v === null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
    // Generous but bounded: a render loop could fire this repeatedly, and we
    // would rather drop duplicates than let one tab fill the table.
    if (!applyRateLimit(req, res, { max: 20, windowMs: 60_000, scope: ':client-crash' })) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const boundary = ALLOWED_BOUNDARIES.has(body.boundary) ? body.boundary : 'page';

        const message = clip(body.message, 1000);
        const stack = clip(body.stack, 6000);
        const componentStack = clip(body.componentStack, 6000);

        if (!message && !stack && !componentStack) {
            return res.status(200).json({ ok: false, reason: 'empty' });
        }

        const supabase = getSupabase();
        if (!supabase) {
            // Still surface it in the function log so it is not lost entirely.
            console.warn('[client-crash] no service role key; crash not persisted:', message);
            return res.status(200).json({ ok: false, reason: 'no-service-key' });
        }

        const userId = typeof body.userId === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)
            ? body.userId
            : null;

        const { error } = await supabase.from('client_crash_log').insert({
            boundary,
            section: clip(body.section, 120),
            route: clip(body.route, 300),
            url: clip(body.url || req.headers.referer, 800),
            error_name: clip(body.errorName, 120),
            message,
            stack,
            component_stack: componentStack,
            user_agent: clip(body.userAgent || req.headers['user-agent'], 400),
            user_id: userId,
            embedded: body.embedded === true,
            build_sha: clip(body.buildSha || process.env.VERCEL_GIT_COMMIT_SHA, 60),
        });

        if (error) {
            console.warn('[client-crash] insert failed:', error.message);
            return res.status(200).json({ ok: false, reason: 'insert-failed' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.warn('[client-crash] handler internal error:', err?.message);
        return res.status(200).json({ ok: false, swallowed: true });
    }
}
