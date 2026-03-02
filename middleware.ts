import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to ensure canonical domain for session persistence.
 * 
 * Since localStorage is per-domain, sessions on www.smarter.poker won't work
 * on smarter.poker. We redirect all www traffic to the root domain.
 */
export function middleware(request: NextRequest) {
    const { hostname, pathname, search, protocol } = request.nextUrl;

    // Redirect www to root domain for localStorage consistency
    if (hostname.startsWith('www.')) {
        const cleanHost = hostname.replace('www.', '');
        const newUrl = `https://${cleanHost}${pathname}${search}`;
        return NextResponse.redirect(newUrl, 301);
    }

    // ── Block admin/debug/emergency/destructive API routes without proper auth ──
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
    const isProtectedRoute = pathname.startsWith('/api/admin') ||
                             pathname.startsWith('/api/debug') ||
                             pathname.startsWith('/api/emergency') ||
                             DESTRUCTIVE_POKER_ROUTES.includes(pathname);
    
    if (isProtectedRoute) {
        const adminSecret = request.headers.get('x-admin-secret');
        const envSecret = process.env.ADMIN_ROUTE_SECRET;
        
        // Must have ADMIN_ROUTE_SECRET env var set AND header must match
        if (!envSecret || !adminSecret || adminSecret !== envSecret) {
            return NextResponse.json(
                { error: 'Admin routes are disabled in production.' },
                { status: 403 }
            );
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Non-API routes (www redirect)
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
        // Protected API routes (admin guard)
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
    ],
};
