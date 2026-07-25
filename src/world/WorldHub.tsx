// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — POKERBROS WORLD HUB (6 FOOTER CARDS)
   Profile with reactive glow + 6 most visited cards at bottom
   
   v19.1 — Baked-in Assets Standard (no duplicate labels)
   ═══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { CarouselEngine } from './carousel/CarouselEngine';
import { getFooterCards, recordCardVisit, triggerHaptic, getLastCarouselIndex, setLastCarouselIndex, getHiddenCardIds, hydrateHiddenCardIds } from '../state/userPreferences';
import { getAuthUser } from '../lib/authUtils';
import { useWorldStore } from '../state/worldStore';
import type { OrbConfig } from '../orbs/manifest/registry';
import { COMMANDER_ORB, POKER_IQ_ORBS, TOKE_TRACKER_ORB, PINNED_ORB_IDS } from '../orbs/manifest/registry';
import { NeuronLights } from './components/NeuronLights';
import { useLaunchAnimation } from './components/LaunchPad';
import { useCinematicIntro } from './components/CinematicIntro';
import { useReturnBurst } from './components/ReturnBurst';
import { HubErrorBoundary } from '../components/ui/HubErrorBoundary';

// ─────────────────────────────────────────────────────────────────────────────
// 📱 MOBILE DETECTION HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return isMobile;
}

// UI Components
// WelcomeBack removed — was showing hardcoded 'PokerPro' mock data
import { StreakPopup } from './components/StreakPopup';
import { SearchOverlay } from './components/GlobalSearch';

import { useLiveHelp } from './components/Geeves';
import NewUserWelcomeModal from '../components/gates/NewUserWelcomeModal';
import { useAvatar } from '../contexts/AvatarContext';



// ─────────────────────────────────────────────────────────────────────────────
// 🎮 LOADING FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
function LoadingFallback() {
    return (
        <Float speed={2.5} rotationIntensity={0.6}>
            <mesh>
                <icosahedronGeometry args={[1.5, 1]} />
                <meshBasicMaterial color="#00f6ff" wireframe />
            </mesh>
        </Float>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🃏 FOOTER CARD - STANDING HOLOGRAPHIC CARDS
// 6 cards with 3D perspective, holographic edges, and subtle animations
// Color palette: Cyan, Blue, Green, White (no purple/pink)
// ─────────────────────────────────────────────────────────────────────────────
interface FooterCardProps {
    orb: OrbConfig;
    index: number;
    onSelect: (id: string) => void;
    isIntroComplete: boolean;
}



function FooterCard({ orb, index, onSelect, isIntroComplete }: FooterCardProps) {
    const [hasAnimatedIn, setHasAnimatedIn] = useState(false);

    // Intro animation only - no continuous floating (footer cards are static)
    useEffect(() => {
        if (isIntroComplete && !hasAnimatedIn) {
            const delay = 200 + index * 80; // Faster: 200ms base + 80ms stagger
            const timer = setTimeout(() => setHasAnimatedIn(true), delay);
            return () => clearTimeout(timer);
        }
    }, [isIntroComplete, index, hasAnimatedIn]);



    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                transform: hasAnimatedIn
                    ? `translateY(0px) scale(1)`
                    : `translateY(150px) scale(0.5)`,
                opacity: hasAnimatedIn ? 1 : 0,
                flex: 1,
                maxWidth: `clamp(140px, 17vw, 186px)`,  // Viewport-scaled card width
                transition: hasAnimatedIn ? 'none' : 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease-out',
                transformStyle: 'preserve-3d',
            }}
            onClick={() => onSelect(orb.id)}
            title={orb.label}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = `translateY(-8px) scale(1.1)`;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = `translateY(0px) scale(1)`;
            }}
        >
            {/* Card Container */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 186,
                }}
            >

                {/* Main card face */}
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '2 / 3',
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'transparent',
                        border: 'none',
                        boxShadow: `0 20px 40px rgba(0, 0, 0, 0.5)`,
                    }}
                >
                    {/* Card image - Static for footer cards (full image, no cropping) */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100%',
                            height: '100%',
                            backgroundImage: orb.imageUrl
                                ? `url('${orb.imageUrl}')`
                                : `linear-gradient(135deg, ${orb.gradient?.[0] || orb.color}, ${orb.gradient?.[1] || orb.color})`,
                            backgroundSize: '120% 100%',
                            backgroundPosition: 'center',
                            borderRadius: 8,
                        }}
                    />

                    {/* WHITE BORDERS REMOVED — Clean card look per user request */}
                </div>
            </div>

            {/* CARD TITLE REMOVED — Clean card look per user request */}
        </div>
    );
}



// ─────────────────────────────────────────────────────────────────────────────
// 🔔 HUD ICON (Messages, Notifications - same size as profile orb)
// ─────────────────────────────────────────────────────────────────────────────
interface HudIconProps {
    iconUrl: string;
    title: string;
    badgeCount?: number;
    size?: number;
    onClick: () => void;
}

function HudIconOrb({ iconUrl, title, badgeCount = 0, size = 60, onClick }: HudIconProps) {
    const [edgeOpacity, setEdgeOpacity] = useState(0.3);

    // Gentle pulsing edge glow - same as ProfileOrbInline
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pulse = (Math.sin(elapsed * 0.5) + 1) / 2;
            setEdgeOpacity(0.2 + pulse * 0.3);
            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, []);

    return (
        <div
            style={{
                position: 'relative',
                width: size,
                height: size,
                borderRadius: '50%',
                background: `url('${iconUrl}') center/cover`,
                border: '2px solid rgba(255, 255, 255, 0.8)',
                boxShadow: `
                    0 0 ${8 + edgeOpacity * 12}px rgba(0, 212, 255, ${edgeOpacity}),
                    0 4px 16px rgba(0, 0, 0, 0.4)
                `,
                cursor: 'pointer',
                transition: 'transform 0.2s ease-out',
                flexShrink: 0,
            }}
            onClick={onClick}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
            title={title}
        >
            {/* Badge - only shows when count > 0 */}
            {badgeCount > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        minWidth: 22,
                        height: 22,
                        borderRadius: 11,
                        background: '#ff3b3b',
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 6px',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                        border: '2px solid #0a0a0f',
                    }}
                >
                    {badgeCount > 99 ? '99+' : badgeCount}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔮 PROFILE ORB INLINE (for flexbox layout, no absolute positioning)
// ─────────────────────────────────────────────────────────────────────────────
interface ProfileOrbInlineProps {
    onClick?: () => void;
    size?: number;
    avatarUrl?: string | null;
}

function ProfileOrbInline({ onClick, size = 48, avatarUrl }: ProfileOrbInlineProps) {
    const [edgeOpacity, setEdgeOpacity] = useState(0.3);

    // Gentle pulsing edge glow
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;

            // Soft pulse cycle
            const pulse = (Math.sin(elapsed * 0.5) + 1) / 2;
            setEdgeOpacity(0.2 + pulse * 0.3); // Range: 0.2 - 0.5

            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, []);

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: `url('${avatarUrl || '/default-avatar.png'}') center/cover`,
                border: '2px solid rgba(255, 255, 255, 0.8)',
                boxShadow: `
                    0 0 ${8 + edgeOpacity * 12}px rgba(0, 212, 255, ${edgeOpacity}),
                    0 4px 16px rgba(0, 0, 0, 0.4)
                `,
                cursor: 'pointer',
                transition: 'transform 0.2s ease-out',
                flexShrink: 0,
            }}
            onClick={onClick}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
            title="View Profile / Social Media"
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 POKERBROS WORLD HUB — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function WorldHub({ onOpenCardCustomizer }: { onOpenCardCustomizer?: () => void } = {}) {
    // Get store actions for navigation
    const selectOrb = useWorldStore((state) => state.selectOrb);
    const exitOrb = useWorldStore((state) => state.exitOrb);

    // NEW USER WELCOME: Get modal state from AvatarContext
    const { showWelcomeModal, dismissWelcomeModal, user: avatarUser } = useAvatar();

    // Next.js router for actual page navigation
    const router = useRouter();

    // Mobile detection
    const isMobile = useIsMobile();

    // Real-time Cloud Hydration for Hub Preferences
    useEffect(() => {
        const user = getAuthUser();
        if (user?.id) {
            hydrateHiddenCardIds(user.id);
        }
    }, []);

    const [hiddenCardIds, setHiddenCardIdsState] = useState<string[]>(
        // Lazy init: reads localStorage on first render (client-side only, no SSR flash)
        () => getHiddenCardIds()
    );

    // Get the 6 footer cards (most visited or defaults) — reactive to hiddenCardIds
    // Also ensures TOKE_TRACKER_ORB is always available for quick-launch
    const footerCards = useMemo(() => {
        const cards = getFooterCards(hiddenCardIds);
        // Inject TOKE_TRACKER_ORB at front if not already in the personalized list
        const hasInList = cards.some(c => c.id === 'toke-tracker');
        const base = hasInList ? cards : [TOKE_TRACKER_ORB, ...cards.slice(0, 5)];
        // Filter any cards the user has hidden — PINNED cards can never be filtered out
        return hiddenCardIds.length > 0
            ? base.filter(c => !hiddenCardIds.includes(c.id) || PINNED_ORB_IDS.includes(c.id))
            : base;
    }, [hiddenCardIds]);

    // ═══════════════════════════════════════════════════════════════════════
    // UI STATE
    // ═══════════════════════════════════════════════════════════════════════
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════
    // LOGIN DETECTION — Cinematic intro ONLY on login, not navigation
    // Check sessionStorage SYNCHRONOUSLY during initial render so the hook
    // gets the correct value on first render (useEffect would be too late)
    // ═══════════════════════════════════════════════════════════════════════
    const [shouldShowCinematic] = useState(() => {
        // Must check during initial state - useEffect runs AFTER first render
        if (typeof window !== 'undefined') {
            const justAuthenticated = sessionStorage.getItem('just_authenticated');
            if (justAuthenticated === 'true') {
                // Clear immediately to prevent re-triggering
                sessionStorage.removeItem('just_authenticated');
                console.log('[WorldHub] 🎬 Login detected! Triggering cinematic intro...');
                return true;
            }
        }
        return false;
    });

    // Cinematic intro state (ONLY for login)
    const { showIntro, introComplete, CinematicIntroComponent } = useCinematicIntro(shouldShowCinematic);

    // Return burst is NOT used - no animations on navigation
    const { showBurst, burstComplete, ReturnBurstComponent, triggerBurst } = useReturnBurst();

    // DO NOT trigger return burst - we want no animations on navigation

    // Launch animation disabled - cards appear immediately
    const { isLaunching, isComplete: isIntroComplete, onBurst } = useLaunchAnimation();

    // Notification counts - users start with 0 (no seed data)
    const [messageCount] = useState(0);
    const [notificationCount] = useState(0);
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
    const [hasCommanderAccount, setHasCommanderAccount] = useState(false);
    // hasLinkedVenues removed — Work Schedule merged into Toke Tracker
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check if user has a Commander account — localStorage first for instant display
    useEffect(() => {
        try {
            const stored = localStorage.getItem('commander_staff');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Accept any valid staff record — venue_id may be null for owners without a venue
                if (parsed?.id || parsed?.venue_id || parsed?.role) setHasCommanderAccount(true);
            }
        } catch (e) { console.warn('[App] Handled exception:', e); }
        // Load hidden card preferences
        setHiddenCardIdsState(getHiddenCardIds());
    }, []);

    // 🔴 BUS LISTENER — Real-time card visibility sync from CardCustomizerPanel
    // Fires whenever user toggles or resets cards in the customizer panel
    // Updates carousel + footer cards instantly without page reload
    useEffect(() => {
        const handleCardsHiddenChanged = (e: Event) => {
            const detail = (e as CustomEvent<{ hiddenIds: string[] }>).detail;
            if (detail && Array.isArray(detail.hiddenIds)) {
                setHiddenCardIdsState(detail.hiddenIds);
            } else {
                // Fallback: re-read from localStorage
                setHiddenCardIdsState(getHiddenCardIds());
            }
        };
        window.addEventListener('hub-cards-hidden-changed', handleCardsHiddenChanged);
        return () => window.removeEventListener('hub-cards-hidden-changed', handleCardsHiddenChanged);
    }, []);

    // Build carousel orbs — inject Toke Tracker (always) and Commander card
    const carouselOrbs = useMemo(() => {
        const orbs = [...POKER_IQ_ORBS];
        // Always inject Toke Tracker at position 2 (after Social Media + Diamond Arena)
        if (!orbs.find(o => o.id === 'toke-tracker')) {
            orbs.splice(2, 0, TOKE_TRACKER_ORB);
        }
        if (hasCommanderAccount) orbs.unshift(COMMANDER_ORB);
        // Filter out user-hidden cards — PINNED cards are immune to filtering
        return hiddenCardIds.length > 0
            ? orbs.filter(o => !hiddenCardIds.includes(o.id) || PINNED_ORB_IDS.includes(o.id))
            : orbs;
    }, [hasCommanderAccount, hiddenCardIds]);

    // Fetch user profile data including avatar + Commander account detection via Supabase
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                // 🛡️ BULLETPROOF: Use authUtils instead of getUser() to avoid AbortError
                const { getAuthUser } = await import('../lib/authUtils');
                const user = getAuthUser();

                if (user) {
                    const { supabase } = await import('../lib/supabase');

                    // Fetch profile avatar
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('avatar_url')
                        .eq('id', user.id)
                        .maybeSingle();
                    if (profile?.avatar_url) {
                        setUserAvatarUrl(profile.avatar_url);
                    }

                    // 🔑 Commander account detection — use server-side API to bypass RLS
                    if (!hasCommanderAccount) {
                        try {
                            // Get access token from authUtils (same pattern as all Commander APIs)
                            const { getAccessToken } = await import('../lib/authUtils');
                            const token = getAccessToken();
                            if (token) {
                                const res = await fetch('/api/check-access', {
                                    headers: { 'Authorization': `Bearer ${token}` },
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    if (data.hasAccess) {
                                        setHasCommanderAccount(true);
                                        // Backfill localStorage so future visits are instant
                                        try {
                                            localStorage.setItem('commander_staff', JSON.stringify({ role: 'owner', venue_id: data.venueIds?.[0] || '1' }));
                                            // Store tier for tier-gated sidebar
                                            if (data.tier) {
                                                const sub = JSON.parse(localStorage.getItem('commander_subscription') || '{}');
                                                sub.tier = data.tier;
                                                localStorage.setItem('commander_subscription', JSON.stringify(sub));
                                            }
                                            console.log('[WorldHub] 🏢 Commander account detected via API');
                                        } catch (e) { console.warn('[App] Handled exception:', e); }
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[WorldHub] Commander check failed (non-critical):', e);
                        }
                    }

                    // Employee Portal removed — Work Schedule merged into Toke Tracker
                }
                // Mark user as authenticated (sets isAuthenticated for future features)
                if (user) setIsAuthenticated(true);
            } catch (e) {
                console.warn('Failed to fetch user profile:', e);
            }
        };
        fetchUserProfile();
    }, []);

    // Handle buy diamonds click - navigate to store
    const handleBuyDiamonds = () => {
        console.log('Buy diamonds clicked — navigating to diamond store');
        router.push('/hub/diamond-store');
    };

    // Live Help state
    const liveHelp = useLiveHelp();

    // Keyboard shortcut for search (Ctrl+K / Cmd+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Listen for Live Help open event from header button
    useEffect(() => {
        const handleOpenLiveHelp = () => {
            liveHelp.setIsOpen(true);
        };
        window.addEventListener('openLiveHelp', handleOpenLiveHelp);
        return () => window.removeEventListener('openLiveHelp', handleOpenLiveHelp);
    }, [liveHelp]);

    // Navigate to settings page
    const handleSettings = () => {
        console.log('Settings clicked — navigating to settings page');
        router.push('/hub/settings');
    };

    // ═══════════════════════════════════════════════════════════════════════
    // NAVIGATION HANDLERS — Use Next.js router for actual page navigation
    // ═══════════════════════════════════════════════════════════════════════

    // Handle logo click → Return to hub home
    const handleLogoClick = () => {
        console.log('Logo clicked — Returning to World Hub home');
        exitOrb();
        router.push('/hub');
    };

    // Handle footer card click → Navigate to that world page
    const handleCardSelect = (cardId: string) => {
        console.log(`Footer card clicked: ${cardId}`);
        triggerHaptic('medium');
        recordCardVisit(cardId);
        selectOrb(cardId as any);

        // Commander card → Club Commander management software (standalone app)
        if (cardId === 'club-commander') {
            window.location.href = 'https://commander.smarter.poker/commander/login';
            return;
        }

        // Employee Portal removed — Work Schedule merged into Toke Tracker

        // Toke Tracker card routes to dedicated hub page with 4 icon cards
        if (cardId === 'toke-tracker') {
            router.push('/hub/toke-tracker');
            return;
        }

        // Poker Near Me routes to the 12-icon lobby, not the tab-based page
        if (cardId === 'poker-near-me') {
            router.push('/hub/poker-near-me/lobby');
            return;
        }

        // Club Arena is a standalone Vite SPA — MUST use full page navigation.
        // Next.js router.push loads the HTML but type="module" scripts don't
        // re-execute, leaving React unmounted (black screen bug).
        if (cardId === 'club-arena') {
            window.location.href = '/hub/club-arena';
            return;
        }

        const targetRoute = `/hub/${cardId}`;

        router.push(targetRoute);
    };

    // Handle main carousel card click → Navigate to that world page
    const handleOrbSelect = (orbId: string) => {
        console.log(`Main card selected: ${orbId}`);
        triggerHaptic('heavy');
        recordCardVisit(orbId);
        selectOrb(orbId as any);

        const targetRoute = `/hub/${orbId}`;

        // Commander card → Club Commander management software (standalone app)
        if (orbId === 'club-commander') {
            window.location.href = 'https://commander.smarter.poker/commander/login';
            return;
        }

        // Club Arena is a full SPA served via getServerSideProps — needs full page load
        if (orbId === 'club-arena') {
            window.location.href = '/hub/club-arena';
            return;
        }

        // Employee Portal removed — Work Schedule merged into Toke Tracker

        // Toke Tracker card routes to dedicated hub page with 4 icon cards
        if (orbId === 'toke-tracker') {
            router.push('/hub/toke-tracker');
            return;
        }

        // Poker Near Me routes to the 12-icon lobby
        if (orbId === 'poker-near-me') {
            router.push('/hub/poker-near-me/lobby');
            return;
        }

        router.push(targetRoute);
    };

    // Handle HUD icon navigation
    const handleNavigate = (destination: string) => {
        console.log(`Navigating to: ${destination}`);
        triggerHaptic('light');
        // Map destination names to page routes
        const routeMap: Record<string, string> = {
            'profile': '/hub/social-media',
            'messages': '/hub/messenger',
            'notifications': '/hub/social-media?tab=notifications',
        };
        const route = routeMap[destination] || `/hub/${destination}`;
        router.push(route);
    };



    return (
        <>
            {/* NEW USER WELCOME MODAL — Shows once on first signup */}
            <NewUserWelcomeModal
                isOpen={showWelcomeModal}
                onClose={dismissWelcomeModal}
                userName={avatarUser?.user_metadata?.poker_alias || avatarUser?.user_metadata?.full_name || ''}
            />

            {/* EPIC CINEMATIC INTRO - Shows ONLY on login (Authentication Handshake Exception) */}
            <HubErrorBoundary name="Cinematic Intro" fallback={<></>}>
                {CinematicIntroComponent}
            </HubErrorBoundary>


            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #050510 50%, #0a1218 100%)',
                overflow: 'visible',
                opacity: showIntro ? 0 : 1,
                transition: 'opacity 0.5s ease-out',
                pointerEvents: showIntro ? 'none' : 'auto',
            }}>
                {/* ═══════════════════════════════════════════════════════════════
                HEXAGON GRID FLOOR — Premium video game aesthetic
                ═══════════════════════════════════════════════════════════════ */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '50vh',
                        background: `
                        linear-gradient(180deg, transparent 0%, rgba(0, 212, 255, 0.03) 100%),
                        repeating-linear-gradient(
                            0deg,
                            transparent,
                            transparent 40px,
                            rgba(0, 212, 255, 0.05) 40px,
                            rgba(0, 212, 255, 0.05) 41px
                        ),
                        repeating-linear-gradient(
                            90deg,
                            transparent,
                            transparent 40px,
                            rgba(0, 212, 255, 0.05) 40px,
                            rgba(0, 212, 255, 0.05) 41px
                        )
                    `,
                        transform: 'perspective(500px) rotateX(60deg) translateY(50%)',
                        transformOrigin: 'center bottom',
                        zIndex: 1,
                        pointerEvents: 'none',
                    }}
                />

                {/* Volumetric light beam from top center */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        width: '60vw',
                        height: '70vh',
                        transform: 'translateX(-50%)',
                        background: 'radial-gradient(ellipse at top center, rgba(0, 212, 255, 0.08) 0%, transparent 60%)',
                        pointerEvents: 'none',
                        zIndex: 1,
                    }}
                />

                {/* ═══════════════════════════════════════════════════════════════
                3D SPATIAL LAYER — Camera for massive main card
                z-index: 5 puts cards ABOVE background but BELOW HUD (z-index: 10)
                ═══════════════════════════════════════════════════════════════ */}
                <HubErrorBoundary name="3D Canvas Engine" fallback={<div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'Orbitron, sans-serif' }}>[3D Engine Offline]</div>}>
                    <Canvas
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5 }}
                        dpr={[1, 2]}
                        camera={{ position: [0, 0, 24], fov: 60 }}
                        gl={{
                            antialias: true,
                            powerPreference: 'high-performance',
                            outputColorSpace: THREE.SRGBColorSpace,
                            toneMapping: THREE.ACESFilmicToneMapping,
                            toneMappingExposure: 1.1,
                            alpha: true,
                        }}
                    >
                        <Suspense fallback={<LoadingFallback />}>
                            {/* Premium Lighting — Cyan/Blue/Green palette only */}
                            <ambientLight intensity={0.4} />
                            <pointLight position={[0, 12, 15]} intensity={2.5} color="#ffffff" />
                            <pointLight position={[-15, 5, 8]} intensity={0.3} color="#ffffff" />
                            <pointLight position={[15, 5, 8]} intensity={0.3} color="#ffffff" />
                            <pointLight position={[0, -10, 10]} intensity={0.2} color="#ffffff" />
                            <spotLight
                                position={[0, 20, 12]}
                                angle={0.5}
                                penumbra={0.6}
                                intensity={1.5}
                                color="#ffffff"
                            />
                            {/* Rim light from behind */}
                            <directionalLight
                                position={[0, 5, -15]}
                                intensity={0.4}
                                color="#ffffff"
                            />

                            {/* Launch Pad Animation */}
                            {/* LaunchPad disabled - no cinematic intro except on login */}
                            {/* <LaunchPad isActive={isLaunching} onBurst={onBurst} /> */}

                            {/* Card Carousel with Snap */}
                            <CarouselEngine
                                onOrbSelect={handleOrbSelect}
                                initialIndex={getLastCarouselIndex()}
                                onIndexChange={setLastCarouselIndex}
                                isIntroComplete={isIntroComplete}
                                orbs={carouselOrbs}
                            />
                        </Suspense>
                    </Canvas>
                </HubErrorBoundary>


                {/* Keyframe animations for shine, pedestal, and holographic inner effects */}
                <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pedestalPulse {
                    0%, 100% { opacity: 0.6; transform: translateX(-50%) rotateX(75deg) scale(1); }
                    50% { opacity: 1; transform: translateX(-50%) rotateX(75deg) scale(1.05); }
                }
                @keyframes shineFlash {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                }
                /* Holographic inner image floating - each card gets unique animation */
                @keyframes holoFloat0 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(2%, 1%) rotateX(3deg) rotateY(-2deg) scale(1.02); }
                    50% { transform: translate(-1%, 2%) rotateX(-2deg) rotateY(3deg) scale(1); }
                    75% { transform: translate(-2%, -1%) rotateX(2deg) rotateY(-1deg) scale(1.01); }
                }
                @keyframes holoFloat1 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(-2%, 2%) rotateX(-3deg) rotateY(2deg) scale(1.01); }
                    50% { transform: translate(2%, -1%) rotateX(2deg) rotateY(-3deg) scale(1.02); }
                    75% { transform: translate(1%, 1%) rotateX(-1deg) rotateY(2deg) scale(1); }
                }
                @keyframes holoFloat2 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(1%, -2%) rotateX(2deg) rotateY(3deg) scale(1.02); }
                    50% { transform: translate(-2%, 1%) rotateX(-3deg) rotateY(-2deg) scale(1); }
                    75% { transform: translate(2%, 2%) rotateX(1deg) rotateY(-3deg) scale(1.01); }
                }
                @keyframes holoFloat3 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(-1%, 1%) rotateX(-2deg) rotateY(-3deg) scale(1.01); }
                    50% { transform: translate(2%, 2%) rotateX(3deg) rotateY(2deg) scale(1.02); }
                    75% { transform: translate(-2%, -2%) rotateX(-1deg) rotateY(1deg) scale(1); }
                }
                @keyframes holoFloat4 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(2%, -1%) rotateX(3deg) rotateY(2deg) scale(1); }
                    50% { transform: translate(-1%, -2%) rotateX(-2deg) rotateY(-3deg) scale(1.01); }
                    75% { transform: translate(1%, 2%) rotateX(2deg) rotateY(1deg) scale(1.02); }
                }
                @keyframes holoFloat5 {
                    0%, 100% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) scale(1); }
                    25% { transform: translate(-2%, -1%) rotateX(-1deg) rotateY(3deg) scale(1.02); }
                    50% { transform: translate(1%, 2%) rotateX(2deg) rotateY(-2deg) scale(1); }
                    75% { transform: translate(2%, -2%) rotateX(-3deg) rotateY(-1deg) scale(1.01); }
                }
                /* Light sweep animation */
                @keyframes lightSweep {
                    0%, 100% { left: -100%; opacity: 0; }
                    40% { opacity: 0; }
                    50% { left: 50%; opacity: 1; }
                    60% { opacity: 0; }
                    100% { left: 200%; opacity: 0; }
                }
                /* Hide scrollbar for mobile footer */
                div::-webkit-scrollbar {
                    display: none;
                }
            `}} />

                {/* ═══════════════════════════════════════════════════════════════
                CIRCUIT BRAIN BACKGROUND OVERLAY
                ═══════════════════════════════════════════════════════════════ */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundImage: `url('/circuit-brain-bg.png')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: 0.2,
                        zIndex: 2,
                        pointerEvents: 'none',
                    }}
                />

                {/* Subtle vignette overlay for cinematic feel */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.4) 100%)',
                        zIndex: 3,
                        pointerEvents: 'none',
                    }}
                />

                {/* ═══════════════════════════════════════════════════════════════
                NEURON LIGHTS — Subtle traveling pulses along circuit paths
                ═══════════════════════════════════════════════════════════════ */}
                <HubErrorBoundary name="Neuron Lights" fallback={<></>}>
                    <NeuronLights />
                </HubErrorBoundary>

                {/* ═══════════════════════════════════════════════════════════════
                HUD OVERLAY LAYER — All interactive UI elements
                z-index: 10 ensures cards and UI are ABOVE background/neurons
                NOTE: TOP BAR REMOVED - Using UniversalHeader from pages/hub/index.js
                ═══════════════════════════════════════════════════════════════ */}
                <div className="hud-overlay" style={{ zIndex: 10 }}>
                    {/* TOP BAR is now provided by UniversalHeader in pages/hub/index.js */}

                    {/* WELCOME BACK REMOVED — was showing hardcoded mock username */}

                    {/* ═══════════════════════════════════════════════════════════════
                    STREAK POPUP — Subtle toast that appears and fades
                    ═══════════════════════════════════════════════════════════════ */}
                    <HubErrorBoundary name="Streak Popup" fallback={<></>}>
                        <StreakPopup />
                    </HubErrorBoundary>

                    {/* 6 MOST VISITED CARDS AT BOTTOM */}
                    {!isMobile && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 120,
                                left: 32,
                                right: 32,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-end',
                                gap: 16,
                                overflow: 'visible',
                                paddingBottom: 40,
                            }}
                        >
                            {/* Desktop footer cards — each isolated so one bad card never crashes the row */}
                            {footerCards.map((orb, index) => (
                                <HubErrorBoundary key={orb.id} name={`FooterCard-${orb.id}`} fallback={<div style={{ width: 80, height: 120 }} />}>
                                    <FooterCard
                                        orb={orb}
                                        index={index}
                                        onSelect={handleCardSelect}
                                        isIntroComplete={isIntroComplete}
                                    />
                                </HubErrorBoundary>
                            ))}
                        </div>
                    )}

                    {/* MOBILE: Horizontal scrolling footer */}
                    {isMobile && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 20,
                                left: 0,
                                right: 0,
                                overflowX: 'auto',
                                overflowY: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                                display: 'flex',
                                gap: 12,
                                padding: '0 16px 12px 16px',
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none',
                            }}
                        >
                            {/* Mobile footer cards — each isolated */}
                            {footerCards.map((orb, index) => (
                                <HubErrorBoundary key={orb.id} name={`MobileCard-${orb.id}`} fallback={<div style={{ flex: '0 0 auto', width: 100, height: 150 }} />}>
                                    <div
                                        onClick={() => handleCardSelect(orb.id)}
                                        style={{
                                            flex: '0 0 auto',
                                            width: `clamp(100px, 18vw, 115px)`,  // Viewport-scaled mobile card
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '100%',
                                                aspectRatio: '2 / 3',
                                                borderRadius: 8,
                                                background: orb.imageUrl
                                                    ? `url('${orb.imageUrl}') center/cover`
                                                    : `linear-gradient(135deg, ${orb.gradient?.[0] || orb.color}, ${orb.gradient?.[1] || orb.color})`,
                                                border: 'none',
                                                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
                                                position: 'relative',
                                            }}
                                        />
                                        <div
                                            style={{
                                                marginTop: 6,
                                                fontSize: `clamp(9px, 1.2vh, 10px)`,  // Viewport-scaled label
                                                fontWeight: 600,
                                                color: 'rgba(255, 255, 255, 0.9)',
                                                textAlign: 'center',
                                                textShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {orb.label}
                                        </div>
                                    </div>
                                </HubErrorBoundary>
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                OVERLAYS — Search, Live Help (highest z-index)
                ═══════════════════════════════════════════════════════════════ */}
                <HubErrorBoundary name="Search Overlay" fallback={<></>}>
                    <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
                </HubErrorBoundary>

                {/* Live Help Panel - DISABLED per user request (no Jarvis/Geeves popups)
                <LiveHelpPanel
                    isOpen={liveHelp.isOpen}
                    onClose={() => liveHelp.setIsOpen(false)}
                    messages={liveHelp.messages}
                    currentAgent={liveHelp.currentAgent}
                    isAgentTyping={liveHelp.isAgentTyping}
                    inputValue={liveHelp.inputValue}
                    onInputChange={liveHelp.setInputValue}
                    onSendMessage={liveHelp.sendMessage}
                    onSwitchAgent={liveHelp.switchAgent}
                />
                */}
            </div>
        </>
    );
}
