/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE SERVER CLIENT — Cookie-based SSR Auth
   ═══════════════════════════════════════════════════════════════════════════
   
   This module creates Supabase clients for server-side operations with
   cookie-based session storage. Sessions stored in cookies survive
   localStorage clears, providing "remembered device" functionality.
   
   CRITICAL: Use these utilities instead of the standard supabase.ts client
   for any server-side or middleware operations.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';

// [2026-08-03] No hardcoded anon-key fallback. The old literal was a committed
// secret and the project signing key has since been rotated, so falling back to
// it produced confusing per-request auth failures instead of one clear config
// error. Resolved at call time (not module scope) so that merely importing this
// module — e.g. for AUTH_COOKIE_OPTIONS — never explodes.
function requireAnonKey(): string {
    const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!key) {
        throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — refusing to create a Supabase server client. Set this environment variable.');
    }
    return key;
}

/**
 * Create a Supabase client for middleware that can read/write cookies.
 * This enables session refresh and persistence across localStorage clears.
 */
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
    return createServerClient(
        SUPABASE_URL.trim(),
        requireAnonKey(),
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                },
            },
        }
    );
}

/**
 * Cookie configuration for auth tokens
 * - 1 year expiry for "remember me" functionality
 * - Secure in production, httpOnly for security
 */
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
};
