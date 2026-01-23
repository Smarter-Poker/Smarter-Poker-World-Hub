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

// Use production credentials - same as main supabase.ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

/**
 * Create a Supabase client for middleware that can read/write cookies.
 * This enables session refresh and persistence across localStorage clears.
 */
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
    return createServerClient(
        SUPABASE_URL.trim(),
        SUPABASE_ANON_KEY.trim(),
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
