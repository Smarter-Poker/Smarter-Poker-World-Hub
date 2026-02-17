/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Re-exports WorldHub for /hub route
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import dynamic from 'next/dynamic';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAuthUser } from '../../src/lib/authUtils';
import { claimReward } from '../../src/lib/claimReward';

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
    const [menuOpen, setMenuOpen] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        // getAuthUser is synchronous, returns user or null
        const authUser = getAuthUser();
        setUser(authUser);

        // Award daily login diamonds (fire-and-forget, once per session, with toast)
        if (authUser?.id && !sessionStorage.getItem('dailyLoginClaimed')) {
            sessionStorage.setItem('dailyLoginClaimed', 'true');
            claimReward('/api/rewards/daily-login', { userId: authUser.id }, 'Daily Login Reward');
        }
    }, []);

    const menuConfig = getMenuConfig('hub-home', user, {}, {});

    return (
        <>
            <SEOHead
                title="Poker Hub — Your Command Center"
                description="Access All Smarter.Poker Features From One Hub: GTO Training, Poker Near Me, Bankroll Tracking, Trivia, News, Social, And More."
                canonical="/hub"
            />
            <UniversalHeader
                pageDepth={1}
                onMenuClick={() => setMenuOpen(true)}
            />
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile={true}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />
            <WorldHub />
        </>
    );
}
