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
import { CardCustomizerPanel } from '../../src/world/components/CardCustomizerPanel';

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
    const [cardCustomizerOpen, setCardCustomizerOpen] = useState(false);

    // Special unlocked card IDs for this user (for the customizer panel)
    const [unlockedSpecialIds, setUnlockedSpecialIds] = useState([]);

    useEffect(() => {
        // getAuthUser is synchronous, returns user or null
        const authUser = getAuthUser();
        setUser(authUser);

        // Award daily login diamonds (fire-and-forget, once per session, with toast)
        if (authUser?.id && !sessionStorage.getItem('dailyLoginClaimed')) {
            sessionStorage.setItem('dailyLoginClaimed', 'true');
            claimReward('/api/rewards/daily-login', { userId: authUser.id }, 'Daily Login Reward');
        }

        // Detect which special cards are unlocked for this user
        const unlocked = ['toke-tracker']; // Always unlocked for all authenticated users
        try {
            // Commander account detection via localStorage cache (set by WorldHub on load)
            const commStored = localStorage.getItem('commander_staff');
            if (commStored) {
                const parsed = JSON.parse(commStored);
                if (parsed?.id || parsed?.venue_id || parsed?.role) unlocked.push('club-commander');
            }
            // Employee portal (venue-linked dealer) detection — check all possible cache keys
            const venueCache = localStorage.getItem('emp_venues') || localStorage.getItem('hub_linked_venues');
            if (venueCache) {
                const parsed = JSON.parse(venueCache);
                if (Array.isArray(parsed) && parsed.length > 0) unlocked.push('employee-portal');
            }
        } catch { }
        setUnlockedSpecialIds(unlocked);
    }, []);

    const handlers = {
        openCardCustomizer: () => {
            setMenuOpen(false);
            setTimeout(() => setCardCustomizerOpen(true), 150); // slight delay after menu closes
        },
    };

    // 🔴 BUS LISTENER — 'hub-open-customizer' can be dispatched from anywhere
    // (UniversalHeader, Settings page, etc.) to open the customizer panel
    useEffect(() => {
        const handleOpenCustomizer = () => setCardCustomizerOpen(true);
        window.addEventListener('hub-open-customizer', handleOpenCustomizer);
        return () => window.removeEventListener('hub-open-customizer', handleOpenCustomizer);
    }, []);

    const menuConfig = getMenuConfig('hub-home', user, {}, handlers);

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
            {/* Card Visibility Customizer Panel — triggered from hamburger menu or profile dropdown */}
            <CardCustomizerPanel
                isOpen={cardCustomizerOpen}
                onClose={() => setCardCustomizerOpen(false)}
                unlockedSpecialIds={unlockedSpecialIds}
            />
            <WorldHub onOpenCardCustomizer={() => setCardCustomizerOpen(true)} />
        </>
    );
}
