import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import geoBlocks from './config/geo-blocks.json';
import { createMiddlewareClient } from './src/lib/supabaseServer';

/**
 * Smarter.Poker Edge Middleware
 *
 * 1. www → root domain redirect (localStorage session consistency)
 * 2. Jurisdiction gate (Phase 6.1.11 — Trust & Safety §1.3.3)
 * 3. Admin/debug/destructive route guard (ADMIN_ROUTE_SECRET header)
 * 4. User-data route JWT presence gate (Bearer token required)
 *    — Defense-in-depth: handlers still do full JWT verification.
 *    — This prevents unauthenticated requests from reaching handlers at all.
 */

// ── Geo-block config (compiled in at edge build time) ─────────────────────
const DENIED_COUNTRIES = new Set<string>(
    (geoBlocks.denied_countries || []).map((c: string) => c.toUpperCase()),
);
const RESTRICTED_US_STATES = new Set<string>(
    (geoBlocks.restricted_us_states || []).map((s: string) => s.toUpperCase()),
);
const ALLOW_PATHS: string[] = geoBlocks.allow_paths || [];
const ADMIN_BYPASS_HEADER = geoBlocks.admin_bypass_header || 'x-geo-bypass';

// ── [2026-05-03] Hardcoded auth allowlist (cannot be disabled via JSON) ───
// Account creation, login, and OAuth callback MUST be reachable from every
// jurisdiction. State-tier gating happens AFTER signup via
// profiles.access_tier = 'Restricted_Tier' (set by handle_new_user trigger
// for users in WA/ID/MI/NV/CA), which gates real-money / prize-redemption
// features inside the app. Geo-blocking the SIGNUP page itself silently
// bricked every signup originating from WA/UT/LA/ID/MT/SD/IN/MI/MS/TN
// between 2026-04-24 and 2026-05-03 with zero observable signal because
// users were redirected before reaching Supabase auth — nothing showed up
// in auth logs, the audit trail was empty, and every "is signup down?"
// dashboard returned green. This list is a hard-fail guard: if a future
// change to geo-blocks.json removes /auth/ from allow_paths, this list
// still allows the auth flow through. Only edit if you genuinely need to
// block account creation in a jurisdiction (which requires legal review).
const AUTH_ALWAYS_ALLOW = [
    '/auth/',
    '/api/auth/',
    '/api/sms/send-otp',
    '/api/sms/verify-otp',
    '/api/promo/validate-promo-code',
    '/api/promo/validate-referral-code',
    '/api/health',
    '/api/health/signup',
];

function isAuthAlwaysAllow(pathname: string): boolean {
    for (const p of AUTH_ALWAYS_ALLOW) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}

function isAllowPath(pathname: string): boolean {
    if (isAuthAlwaysAllow(pathname)) return true;
    for (const p of ALLOW_PATHS) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}

export async function middleware(request: NextRequest) {
    const { hostname, pathname, search } = request.nextUrl;

    // ── 1. Redirect www → root domain ──────────────────────────────────────
    if (hostname.startsWith('www.')) {
        const cleanHost = hostname.replace('www.', '');
        const newUrl = `https://${cleanHost}${pathname}${search}`;
        return NextResponse.redirect(newUrl, 301);
    }

    // ── VIP Gate for MLB Analytics ─────────────────────────────────────────
    if (pathname.startsWith('/hub/MLB-ANALYTICS')) {
        let response = NextResponse.next();
        const supabase = createMiddlewareClient(request, response);
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                const loginUrl = request.nextUrl.clone();
                loginUrl.pathname = '/auth/login';
                loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
                return NextResponse.redirect(loginUrl);
            }
            
            // All logged in users have access to MLB Analytics right now (No VIP required)
        } catch (err) {
            console.warn('[Middleware] MLB Gate Auth Error:', err);
            // On error, let them pass or redirect to login? Let's redirect to login for safety.
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/auth/login';
            loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
            return NextResponse.redirect(loginUrl);
        }
        
        // If we reach here, user is VIP and session is valid.
        // We must return the response object created by createMiddlewareClient
        // so any refreshed cookies are passed along.
        return response;
    }

    // ── 2. Jurisdiction gate (geo-block) ───────────────────────────────────
    // Vercel injects { country, region, city } onto request.geo at the edge.
    // For local dev (where geo is undefined) we fail-open.
    if (!isAllowPath(pathname)) {
        // Operator bypass — value must match ADMIN_ROUTE_SECRET (same secret
        // that already guards /api/admin). Lets us test blocked regions via
        // a VPN without being locked out ourselves.
        const bypass = request.headers.get(ADMIN_BYPASS_HEADER);
        const bypassOk =
            bypass &&
            process.env.ADMIN_ROUTE_SECRET &&
            bypass === process.env.ADMIN_ROUTE_SECRET;

        if (!bypassOk) {
            // @ts-ignore — request.geo is populated by Vercel
            const geo = (request.geo || {}) as { country?: string; region?: string };
            const country = (geo.country || '').toUpperCase();
            const region = (geo.region || '').toUpperCase();

            const countryBlocked = country && DENIED_COUNTRIES.has(country);
            const stateBlocked =
                country === 'US' && region && RESTRICTED_US_STATES.has(region);

            if (countryBlocked || stateBlocked) {
                const reason = countryBlocked
                    ? `country:${country}`
                    : `us-state:${region}`;

                // For API requests, return JSON so the client can detect it
                if (pathname.startsWith('/api/')) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'Service unavailable in your jurisdiction.',
                            reason,
                        },
                        { status: 451 }, // RFC 7725 — Unavailable For Legal Reasons
                    );
                }

                // Browser navigation → redirect to info page
                const blockedUrl = request.nextUrl.clone();
                blockedUrl.pathname = '/jurisdiction-blocked';
                blockedUrl.search = `?reason=${encodeURIComponent(reason)}`;
                const resp = NextResponse.redirect(blockedUrl, 307);
                resp.headers.set('x-geo-blocked', reason);
                return resp;
            }
        }
    }

    // ── 3. Admin / destructive route guard ─────────────────────────────────
    // These are one-off migration scripts that should never be publicly accessible.
    const DESTRUCTIVE_POKER_ROUTES = [
        '/api/poker/nuclear-import',
        '/api/poker/full-import',
        '/api/poker/import-fresh-data',
        '/api/poker/seed-database',
        '/api/poker/seed',
        '/api/poker/create-tables',
        '/api/poker/setup-venue-scraping',
    ];
    const isAdminRoute = pathname.startsWith('/api/admin') ||
        pathname.startsWith('/api/debug') ||
        pathname.startsWith('/api/emergency') ||
        DESTRUCTIVE_POKER_ROUTES.includes(pathname);

    if (isAdminRoute) {
        const adminSecret = request.headers.get('x-admin-secret');
        const envSecret = process.env.ADMIN_ROUTE_SECRET;
        const hasAdminSecret = envSecret && adminSecret && adminSecret === envSecret;

        if (!hasAdminSecret) {
            // No admin secret = must be a human session. Require both
            // Bearer auth and (for write methods) a valid MFA cookie.
            // [Phase 6.1.22] MFA gate at the edge.
            const authHeader = request.headers.get('authorization');
            const hasBearer = authHeader?.startsWith('Bearer ') && (authHeader?.length ?? 0) > 20;

            if (!hasBearer) {
                return NextResponse.json(
                    { error: 'Admin routes require authentication.' },
                    { status: 401 }
                );
            }

            // Require MFA cookie on any non-GET method. GET handlers are
            // read-only introspection (health, check-*, list-*) and are
            // already covered by the Bearer check + handler-level auth.
            const method = request.method.toUpperCase();
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                const mfaCookie = request.cookies.get('mfa_session')?.value;
                if (!mfaCookie) {
                    return NextResponse.json(
                        {
                            error: 'MFA challenge required for admin write actions.',
                            requiresMfa: true,
                        },
                        { status: 403 }
                    );
                }

                // Lightweight edge-safe shape check. Full HMAC verification
                // happens in the handler via requireMfaEnrolled() from
                // src/lib/mfaGate.js — we can't use Node crypto in edge
                // runtime without bundling subtle-crypto wrappers, and
                // doing it twice (edge + handler) is belt-and-braces.
                const parts = mfaCookie.split('.');
                if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
                    return NextResponse.json(
                        { error: 'Malformed MFA token.', requiresMfa: true },
                        { status: 403 }
                    );
                }

                const issuedAt = parseInt(parts[1], 10);
                const MFA_TTL_MS = 12 * 60 * 60 * 1000;
                if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MFA_TTL_MS) {
                    return NextResponse.json(
                        {
                            error: 'MFA session expired — please re-verify.',
                            requiresMfa: true,
                        },
                        { status: 403 }
                    );
                }
            }
        }
    }

    // ── 4. User-data JWT presence gate ─────────────────────────────────────
    // These routes ALWAYS require authentication — reject at the edge
    // if no Authorization header is present. Handlers still validate the token.
    // This prevents DB queries from running on guaranteed-to-fail requests.
    const requiresAuthPrefix = [
        '/api/rewards/',
        '/api/bankroll/',
        '/api/user/',
        '/api/vip/',
        '/api/god-mode/',
        '/api/friends/',
        '/api/jarvis/',
        '/api/livekit/',
        '/api/gto/',
        '/api/avatar/',
        '/api/calls/',
        '/api/geeves/',
        '/api/session/',
        '/api/assistant/leaks',
        '/api/poker-brain/',
    ];

    // Tombstoned endpoints (Operation Grok-Sweep, 2026-05) — return 410 Gone
    // unconditionally. Skip the JWT gate so the helpful "endpoint removed" message
    // reaches every caller, not just authenticated ones.
    const TOMBSTONED_PATHS = new Set<string>([
        '/api/gto/session-recommendations',
        '/api/gto/generate-batch',
        '/api/gto/generate-alternate-lines',
        '/api/training/generate-batch-questions',
        '/api/training/test-generate',
        '/api/training/generate-infinite',
    ]);
    const isTombstoned = TOMBSTONED_PATHS.has(pathname);

    const needsAuth = !isTombstoned && requiresAuthPrefix.some(prefix => pathname.startsWith(prefix));

    if (needsAuth) {
        const authHeader = request.headers.get('authorization');
        const hasBearer = authHeader?.startsWith('Bearer ') && (authHeader?.length ?? 0) > 20;

        if (!hasBearer) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }
        // Token presence confirmed — handler validates it fully
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Non-API routes (www redirect + jurisdiction gate)
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
        // Admin guard routes
        '/api/admin/:path*',
        '/api/debug/:path*',
        '/api/emergency/:path*',
        // Destructive poker data import routes
        '/api/poker/nuclear-import',
        '/api/poker/full-import',
        '/api/poker/import-fresh-data',
        '/api/poker/seed-database',
        '/api/poker/seed',
        '/api/poker/create-tables',
        '/api/poker/setup-venue-scraping',
        // User-data routes requiring JWT presence (also geo-gated)
        '/api/rewards/:path*',
        '/api/bankroll/:path*',
        '/api/user/:path*',
        '/api/vip/:path*',
        '/api/god-mode/:path*',
        '/api/friends/:path*',
        '/api/jarvis/:path*',
        '/api/livekit/:path*',
        '/api/gto/:path*',
        '/api/avatar/:path*',
        '/api/calls/:path*',
        '/api/geeves/:path*',
        '/api/session/:path*',
        '/api/assistant/leaks/:path*',
        '/api/poker-brain/:path*',
    ],
};
