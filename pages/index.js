/* ═══════════════════════════════════════════════════════════════════════════
   ROOT PAGE — Redirects to /hub
   Vanguard Silver | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function RootPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/hub');
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#00d4ff',
            fontFamily: 'Orbitron, sans-serif',
        }}>
            Loading World Hub...
        </div>
    );
}
