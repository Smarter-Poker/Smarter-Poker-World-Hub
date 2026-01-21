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

    return NextResponse.next();
}

export const config = {
    // Apply to all routes
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
