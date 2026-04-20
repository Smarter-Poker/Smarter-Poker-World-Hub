import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import geoBlocks from './config/geo-blocks.json';

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

function isAllowPath(pathname: string): boolean {
    for (const p of ALLOW_PATHS) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}

export function middleware(request: NextRequest) {
    const { hostname, pathname, search } = request.nextUrl;

    // ── 1. Redirect www → root domain ──────────────────────────────────────
    if (hostname.startsWith('www.')) {
        const cleanHost = hostname.replace('www.', '');
        const newUrl = `https://${cleanHost}${pathname}${search}`;
        return NextResponse.redirect(newUrl, 301);
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

        if (!envSecret || !adminSecret || adminSecret !== envSecret) {
            return NextResponse.json(
                { error: 'Admin routes are disabled in production.' },
                { status: 403 }
            );
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

    const needsAuth = requiresAuthPrefix.some(prefix => pathname.startsWith(prefix));

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
