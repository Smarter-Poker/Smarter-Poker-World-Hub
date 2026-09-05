/**
 * API-route error reporter - and, since 2026-09-04, the Sentry GATE.
 * ═══════════════════════════════════════════════════════════════════════════
 * Policy: docs/SENTRY-FREE-TIER-POLICY.md (World Hub repo), sections 2 and 3.
 *
 * Sentry is on the free Developer plan: 5,000 errors a month shared by three
 * projects. The World Hub server's share is 60 a day. ~541 catch blocks across
 * ~500 API routes call reportApiError(); if every one of them still reached
 * Sentry, one noisy route would blind the whole estate for a month.
 *
 * So reportApiError() stays as a FUNCTION at every call site, and this file
 * decides who gets through:
 *
 *   route on SENTRY_ROUTE_ALLOWLIST  ->  console.error + Sentry.captureException
 *   everything else                  ->  console.error (Vercel captures it)
 *                                        + a financial_alerts row when the
 *                                          failure is money-shaped
 *
 * ── THE ALLOWLIST (World Hub server, budget 60/day) ──────────────────────
 *
 *   /api/cron/rakeback-period-settle   moves chips on a schedule
 *   /api/cron/vip-stipend              moves chips on a schedule
 *   /api/cron/vip-lapse                moves chips on a schedule
 *   /api/live/gift, /api/live/gifts    move chips on demand
 *   /api/club-arena/settle-period      rakeback settlement (chips)
 *   /api/cron/pvp-settle               trivia PvP settlement (diamonds)
 *   /api/trivia/pvp-settle-match       trivia PvP settlement (diamonds)
 *   /api/trivia/tournament-lifecycle   trivia tournament payouts
 *   /api/poker/engine/tournament       tournament payouts
 *   /api/auth/*                        a sign-in failure is a locked-out player
 *   /api/internal/edge-error           middleware.ts geo-block / admin guard /
 *                                      JWT gate throwing (edge has no Sentry)
 *
 * Adding a route here is a PR that names the daily cost. The budget itself
 * (60/day, 3 per fingerprint) is enforced separately in
 * sentry.server.config.js beforeSend, so even an allowlisted route cannot
 * exceed it.
 *
 * ── MONEY-SHAPED, OFF THE LIST ───────────────────────────────────────────
 * A non-allowlisted failure is still recorded durably when it looks like
 * money: the caller passed `{ money: true }` (or context keys such as amount,
 * chips, wallet, balance, payout, ledger, diamonds), or the route path
 * matches /cron\/rakeback|vip|settle|payout|gift|ledger/. That row goes to
 * public.financial_alerts (severity 'warning', source 'api.<route>'), the
 * same table fn_financial_alert_health and the Prometheus gauge already
 * watch. It is an ALERT row, never a wallet write.
 *
 * Scope tags set on the Sentry path: route, method, user_id (if passed),
 * plus anything in extra.tags / extra.context. Redaction is handled by
 * sentry.server.config.js beforeSend. We never put req.body in the scope.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Static import - @sentry/nextjs is a hard dep. Any environment without a
// Sentry DSN just short-circuits inside Sentry.init (see sentry.server.config).
// eslint-disable-next-line import/no-unresolved
import * as SentrySdk from '@sentry/nextjs';

// Test seam. __tests__/sentry-wrap-allowlist.test.mjs swaps in a recorder so
// "sends" versus "does not send" is observable without a DSN.
let Sentry = SentrySdk;
export function _setSentryForTests(impl) {
    Sentry = impl || SentrySdk;
}

/**
 * Routes that may reach Sentry. Exact paths unless the entry ends with '/',
 * which is a prefix match. Keep this list in step with the header above.
 */
export const SENTRY_ROUTE_ALLOWLIST = Object.freeze([
    '/api/cron/rakeback-period-settle',
    '/api/cron/vip-stipend',
    '/api/cron/vip-lapse',
    '/api/live/gift',
    '/api/live/gifts',
    '/api/club-arena/settle-period',
    '/api/cron/pvp-settle',
    '/api/trivia/pvp-settle-match',
    '/api/trivia/tournament-lifecycle',
    '/api/poker/engine/tournament',
    '/api/auth/',
    '/api/internal/edge-error',
]);

/** Route paths whose failures are money-shaped even without a money context. */
export const MONEY_ROUTE_PATTERN = /cron\/rakeback|vip|settle|payout|gift|ledger/;

const MONEY_CONTEXT_KEY = /amount|chips|wallet|balance|payout|ledger|diamonds|credit|rake|stipend/i;

/**
 * Strip query string from a Next.js req.url for cleaner route tagging.
 * "/api/club-arena/approve-cashout?foo=1" -> "/api/club-arena/approve-cashout"
 */
export function routeOf(req) {
    if (!req?.url) return 'unknown';
    const qIdx = req.url.indexOf('?');
    return qIdx === -1 ? req.url : req.url.slice(0, qIdx);
}

/** True when this route path is on the allowlist. */
export function isSentryAllowlisted(routePath) {
    if (typeof routePath !== 'string') return false;
    for (const entry of SENTRY_ROUTE_ALLOWLIST) {
        if (entry.endsWith('/') ? routePath.startsWith(entry) : routePath === entry) return true;
    }
    return false;
}

/** True when the failure should also be filed in financial_alerts. */
export function isMoneyShaped(routePath, extra = {}) {
    if (extra?.money === true) return true;
    if (typeof routePath === 'string' && MONEY_ROUTE_PATTERN.test(routePath)) return true;
    const ctx = extra?.context;
    if (ctx && typeof ctx === 'object') {
        for (const k of Object.keys(ctx)) {
            if (MONEY_CONTEXT_KEY.test(k)) return true;
        }
    }
    const tags = extra?.tags;
    if (tags && typeof tags === 'object') {
        for (const [k, v] of Object.entries(tags)) {
            if (MONEY_CONTEXT_KEY.test(k) || MONEY_CONTEXT_KEY.test(String(v))) return true;
        }
    }
    return false;
}

function describe(error) {
    if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
    if (typeof error === 'string') return { name: 'string', message: error };
    try { return { name: 'value', message: JSON.stringify(error) }; } catch { return { name: 'value', message: String(error) }; }
}

let _alertClient = null;
async function alertClient() {
    if (_alertClient) return _alertClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const { createClient } = await import('./supabaseServerClient.js');
    _alertClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return _alertClient;
}

/**
 * File a financial_alerts row for a money-shaped API failure. Best-effort,
 * never throws. This is the existing durable alert table, not a wallet.
 */
export async function fileFinancialAlert(error, routePath, method, extra = {}) {
    try {
        const sb = extra.__alertClient || (await alertClient());
        if (!sb) return false;
        const d = describe(error);
        const { error: insErr } = await sb.from('financial_alerts').insert({
            severity: 'warning',
            source: `api.${routePath}`,
            message: `${method || 'unknown'} ${routePath} failed: ${String(d.message || '').slice(0, 500)}`,
            context: {
                route: routePath,
                method: method || null,
                user_id: extra.userId || null,
                error_name: d.name,
                tags: extra.tags || null,
                extra: extra.context || null,
                stack: d.stack ? String(d.stack).slice(0, 2000) : null,
                reported_by: 'reportApiError',
            },
            resolved: false,
        });
        if (insErr) {
            console.warn('[reportApiError] financial_alerts insert failed:', insErr.message || insErr);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[reportApiError] financial_alerts insert threw:', e?.message || e);
        return false;
    }
}

/**
 * Error reporter for catch blocks in API routes.
 *
 *   try { ... } catch (err) {
 *     reportApiError(err, req);
 *     return res.status(500)...;
 *   }
 *
 * Returns a promise that resolves to { sent, alerted }. Callers on money
 * paths should `await` it (and then `await flushSentry()`) so the lambda does
 * not freeze before the event leaves; everyone else may fire-and-forget as
 * before.
 *
 * @param {Error|unknown} error   The thrown value.
 * @param {object}        req     Next.js request object (for route + method tags).
 * @param {object}       [extra]  { userId?, tags?, context?, money? }
 */
export function reportApiError(error, req, extra = {}) {
    const routePath = routeOf(req);
    const method = req?.method || 'unknown';
    const d = describe(error);

    // Always: the console record. Vercel captures stderr for every route.
    try {
        console.error(`[API Error] ${method} ${routePath}: ${d.message}`, {
            error_name: d.name,
            user_id: extra?.userId || null,
            tags: extra?.tags || null,
            ...(extra?.context ? { context: extra.context } : {}),
            ...(d.stack ? { stack: String(d.stack).split('\n').slice(0, 6).join('\n') } : {}),
        });
    } catch { /* console must never throw us out of a catch block */ }

    const result = { sent: false, alerted: false };

    if (isSentryAllowlisted(routePath)) {
        try {
            Sentry.withScope((scope) => {
                scope.setTag('route', routePath);
                scope.setTag('method', method);
                if (extra.userId) scope.setUser({ id: extra.userId });
                if (extra.tags) {
                    for (const [k, v] of Object.entries(extra.tags || {})) {
                        scope.setTag(k, String(v));
                    }
                }
                if (extra.context) {
                    for (const [k, v] of Object.entries(extra.context || {})) {
                        scope.setExtra(k, v);
                    }
                }
                if (error instanceof Error) {
                    Sentry.captureException(error);
                } else {
                    Sentry.captureMessage(
                        typeof error === 'string' ? error : JSON.stringify(error),
                        'error'
                    );
                }
            });
            result.sent = true;
        } catch (innerErr) {
            console.warn('[reportApiError] Sentry capture threw:', innerErr?.message || innerErr);
        }
        return Promise.resolve(result);
    }

    if (isMoneyShaped(routePath, extra)) {
        return fileFinancialAlert(error, routePath, method, extra).then((ok) => {
            result.alerted = ok;
            return result;
        });
    }

    return Promise.resolve(result);
}

/**
 * Flush queued Sentry events. Await this before returning from a cron or a
 * money route that just called reportApiError(); Vercel freezes the lambda
 * once the response is sent. Never throws.
 */
export async function flushSentry(timeoutMs = 2000) {
    try {
        if (typeof Sentry.flush === 'function') {
            return await Sentry.flush(timeoutMs);
        }
    } catch (e) {
        console.warn('[reportApiError] Sentry flush failed:', e?.message || e);
    }
    return false;
}

/**
 * Wrap a Next.js API handler so any unhandled throw is reported and a generic
 * 500 is returned. Same gate as reportApiError().
 *
 *   export default withSentryRoute(async function handler(req, res) { ... });
 *
 * @param {Function} handler    The route handler (may be async).
 * @param {string}  [routeName] Optional human-readable override for the `route_name` tag.
 */
export function withSentryRoute(handler, routeName) {
    return async (req, res) => {
        try {
            return await handler(req, res);
        } catch (err) {
            await reportApiError(err, req, {
                tags: routeName ? { route_name: routeName } : undefined,
            });
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    error:
                        process.env.NODE_ENV === 'production'
                            ? 'Internal server error'
                            : err?.message || 'Internal server error',
                });
            }
            return undefined;
        }
    };
}

/**
 * Convenience: add a breadcrumb at runtime. Non-throwing. Breadcrumbs only
 * travel with an event that is actually sent, so this costs nothing.
 */
export function addBreadcrumb(breadcrumb) {
    try {
        Sentry.addBreadcrumb({
            category: breadcrumb?.category || 'api',
            message: breadcrumb?.message,
            data: breadcrumb?.data,
            level: breadcrumb?.level || 'info',
        });
    } catch {
        // ignore
    }
}

export default { reportApiError, withSentryRoute, addBreadcrumb, flushSentry };
