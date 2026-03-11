/* ═══════════════════════════════════════════════════════════════════════════
   PERMANENT REDIRECT — /auth/signin → /auth/login
   ═══════════════════════════════════════════════════════════════════════════
   This page exists SOLELY as a safety net. The canonical sign-in page is
   pages/auth/login.js (URL: /auth/login).

   DO NOT DELETE THIS FILE. It prevents 404 errors when any code, agent, or
   user navigates to /auth/signin instead of /auth/login.

   If you want to edit the sign-in UI, edit pages/auth/login.js — NOT this file.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SignInRedirect() {
    const router = useRouter();

    useEffect(() => {
        // Preserve any query params (e.g. ?redirect=...)
        const query = router.asPath.split('?')[1];
        const target = query ? `/auth/login?${query}` : '/auth/login';
        router.replace(target);
    }, [router]);

    // Minimal loading state while redirect fires (< 100ms)
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a1628',
            color: '#fff',
            fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            <span style={{ opacity: 0.5, fontSize: 14 }}>Redirecting...</span>
        </div>
    );
}
