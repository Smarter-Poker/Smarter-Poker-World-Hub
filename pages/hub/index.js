/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Premium Video Game Lobby
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import dynamic from 'next/dynamic';

// Dynamic import with SSR disabled to prevent hydration mismatches
const PremiumHub = dynamic(() => import('../../src/world/PremiumHub'), {
    ssr: false,
    loading: () => (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a0a18 0%, #0f0a20 50%, #0a1018 100%)',
            color: '#00d4ff',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
        }}>
            Loading Premium Hub...
        </div>
    ),
});

export default function HubPage() {
    return <PremiumHub />;
}

