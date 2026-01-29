/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Re-exports WorldHub for /hub route
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAuthUser } from '../../src/lib/authUtils';

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
        getAuthUser().then(setUser);
    }, []);

    const menuConfig = getMenuConfig('hub-home', user, {}, {});

    return (
        <>
            <Head>
                <title>World Hub | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>
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
