/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Re-exports WorldHub for /hub route
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubCollectionSchema } from '../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): the hub is an index of the products, not a
// product of its own, so CollectionPage is the honest type. It carries
// 3,276 server-rendered words and shipped no structured data at all.
const HUB_SCHEMA = hubCollectionSchema({
    path: '/hub',
    name: 'Smarter.Poker Hub',
    description:
        'Every Smarter.Poker Product In One Place: GTO Training, Private Clubs In Poker Arena, Club Commander Room Management, Poker Near Me, Home Games And The Bankroll Manager.',
    trail: [['Hub', '/hub']],
});
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import dynamic from 'next/dynamic';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAuthUser } from '../../src/lib/authUtils';
import { claimReward } from '../../src/lib/claimReward';
import { warmCache } from '../../src/lib/cacheWarmer';
import { reapStaleCaches } from '../../src/lib/cacheReaper';
import { CardCustomizerPanel } from '../../src/world/components/CardCustomizerPanel';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';

// Dynamic import with SSR disabled to prevent hydration mismatches from R3F/WebGL
// Error handling on the dynamic import itself catches module-level init failures
const WorldHub = dynamic(
    () => import('../../src/world/WorldHub').catch(err => {
        console.warn('[HubPage] WorldHub module failed to load:', err);
        // Return a safe fallback module when the import itself throws
        return {
            default: function WorldHubReloadFallback() {
                useEffect(() => {
                    const timer = setTimeout(() => window.location.reload(), 3000);
                    return () => clearTimeout(timer);
                }, []);
                return (
                    <div style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', flexDirection: 'column', gap: 16 }}>
                        <div style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 18 }}>World Hub - Reloading...</div>
                        <button onClick={() => window.location.reload()} style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontFamily: 'inherit' }}>Refresh</button>
                    </div>
                );
            }
        };
    }),
    {
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
    }
);

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

        // Warm cache — prefetch profile/friends/stats (once per session, fire-and-forget)
        warmCache(authUser);

        // Reap stale caches — clean entries older than 30 min (once per session, idle)
        reapStaleCaches();

        // Award daily login diamonds (fire-and-forget, once per session, with toast)
        if (authUser?.id && !sessionStorage.getItem('dailyLoginClaimed')) {
            sessionStorage.setItem('dailyLoginClaimed', 'true');
            claimReward('/api/rewards/daily-login', { userId: authUser.id }, 'Daily Login Reward');
        }

        // Birthday reward — 300💎 if today is user's birthday (fire-and-forget, once per session)
        // API handles all validation: birthday match, 60-day account age, yearly dedup
        if (authUser?.id && !sessionStorage.getItem('birthdayRewardChecked')) {
            sessionStorage.setItem('birthdayRewardChecked', 'true');
            claimReward('/api/rewards/birthday-reward', {}, 'Happy Birthday! 🎂');
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
            // Employee Portal removed — Work Schedule merged into Toke Tracker
        } catch (e) { console.warn('[App] Handled exception:', e); }
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
                title="Poker Hub: Training, Clubs And Live Games"
                description="Access All Smarter.Poker Features From One Hub: GTO Training, Private Clubs In Poker Arena, Poker Near Me, Home Games, Bankroll Tracking, Trivia, News And Social. Free To Play, No Real-Money Gambling."
                canonical="/hub"
                jsonLd={HUB_SCHEMA}
            />
            <Head>
                {/* The hub's largest paint is the circuit-brain background that
                    WorldHub sets from JavaScript. Preloading it lets the fetch
                    start with the HTML instead of after the bundle runs. */}
                <link rel="preload" as="image" href="/circuit-brain-bg.webp" />
            </Head>
            <UniversalHeader
                pageDepth={1}
                hideLeftIcon
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
            {/* NO ADVERT RENDERS ON THE HUB HOME. Dan, 2026-08-29: "DO NOT PUT
               ADS IN RANDOM PLACES OR OVERLAPPING IMAGES EVER."

               HubPromoStrip was mounted here on 2026-08-28 with a comment
               reasoning that the 3D carousel is position:fixed "so nothing
               moves". That is precisely why it was wrong: a fixed carousel is
               not in the flow, so a strip placed in the flow does not sit
               above it in an empty band - it sits ON it. In production it
               covered the featured cards, which are the page.

               The house-ad surface for the Hub is the promotions rail on
               /hub/promotions, which is in-page, in-flow, and owns its space.
               The hub_promotions slot still serves there; nothing in the
               catalog changed. Do not re-add an ad to this page. */}

            {/* Card Visibility Customizer Panel — isolated in its own error boundary */}
            <HubErrorBoundary name="Card Customizer" fallback={<></>}>
                <CardCustomizerPanel
                    isOpen={cardCustomizerOpen}
                    onClose={() => setCardCustomizerOpen(false)}
                    unlockedSpecialIds={unlockedSpecialIds}
                />
            </HubErrorBoundary>

            {/* THE HUB SAYS WHAT IT IS (AEO phase 3, 2026-09-17). WorldHub is
                `ssr: false`, so the server sends no part of it; measured on
                production with scripts stripped, this page - priority 0.9,
                changefreq daily in the sitemap - carried 31 words and NO
                heading for any crawler that does not run JavaScript.

                It stays in the flow for good. The first cut removed it once
                the carousel mounted, and a page that adds 200 words to the
                flow and then takes them away is a layout shift waiting to
                happen: measured 0.95 on one load in three. The carousel is a
                position:fixed layer over the whole viewport, so this sits
                under it, out of the way, and a reader who scrolls finds it. */}
            <HubPageSummary page="hub" as="h1" />

            {/* WorldHub 3D carousel — isolated so a bad orb/import NEVER crashes the page */}
            <HubErrorBoundary name="World Hub">
                <WorldHub onOpenCardCustomizer={() => setCardCustomizerOpen(true)} />
            </HubErrorBoundary>
        </>
    );
}
