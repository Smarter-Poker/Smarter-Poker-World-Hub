/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Re-exports WorldHub for /hub route
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import Head from 'next/head';
import dynamic from 'next/dynamic';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// Dynamic import with SSR disabled to prevent hydration mismatches from R3F/WebGL
const WorldHub = dynamic(() => import('../../src/world/WorldHub'), {
    ssr: false,
    loading: () => (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#00d4ff',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
        }}>
            Loading World Hub...
        </div>
    ),
});

export default function HubPage() {
    return (
        <>
            <Head>
                <title>World Hub | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>
            <UniversalHeader pageDepth={1} />
            <WorldHub />
        </>
    );
}
