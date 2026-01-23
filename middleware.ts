import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from './src/lib/supabaseServer';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHENTICATION MIDDLEWARE — Cookie-Based Session Persistence
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This middleware provides two critical functions:
 * 
 * 1. SESSION REFRESH: On every request, it refreshes the user's session from
 *    HTTP-only cookies. This ensures sessions survive localStorage clears.
 * 
 * 2. WWW REDIRECT: Redirects www.smarter.poker to smarter.poker for
 *    consistent cookie/storage domains.
 * 
 * When a user clears their browser cache but not cookies, the session
 * persists and they remain logged in on recognized devices.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function middleware(request: NextRequest) {
    const { hostname, pathname, search } = request.nextUrl;

    // Redirect www to root domain for cookie consistency
    if (hostname.startsWith('www.')) {
        const cleanHost = hostname.replace('www.', '');
        const newUrl = `https://${cleanHost}${pathname}${search}`;
        return NextResponse.redirect(newUrl, 301);
    }

    // Create response to pass to Supabase client  
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    // Create Supabase client with cookie handling
    const supabase = createMiddlewareClient(request, response);

    // Refresh session - this reads from cookies, not localStorage
    // If a valid session exists in cookies, it will be refreshed
    // and the new tokens written back to cookies automatically
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session) {
        // Session exists in cookies - user is authenticated
        // The response now includes refreshed cookie tokens
        console.log(`[Middleware] Valid session for: ${session.user.email}`);
    } else if (error) {
        console.log(`[Middleware] Session error:`, error.message);
    }

    return response;
}

export const config = {
    // Apply to all routes except static files and API routes
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files with extensions
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)',
    ],
};
