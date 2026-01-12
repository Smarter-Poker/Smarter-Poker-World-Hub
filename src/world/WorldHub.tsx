// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — POKERBROS WORLD HUB (6 FOOTER CARDS)
   Profile with reactive glow + 6 most visited cards at bottom
   ═══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { CarouselEngine } from './carousel/CarouselEngine';
import { getFooterCards, recordCardVisit } from '../state/userPreferences';
import { useWorldStore } from '../state/worldStore';
import type { OrbConfig } from '../orbs/manifest/registry';
import { NeuronLights } from './components/NeuronLights';

// UI Components
import { DiamondStat, XPStat } from './components/HeaderStats';
import { WelcomeBack } from './components/WelcomeMessage';
import { StreakPopup } from './components/StreakPopup';
import { SearchOrb, SearchOverlay } from './components/GlobalSearch';
import { ProfileDropdown } from './components/ProfileDropdown';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { LiveHelpOrb } from './components/LiveHelpOrb';
import { useLiveHelp, LiveHelpPanel } from './components/LiveHelp';


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
// 🃏 FOOTER CARD - LARGER SIZE WITH SUBTLE EDGE FLICKER
// 6 cards spanning the full width with very subtle edge glow pulse
// ─────────────────────────────────────────────────────────────────────────────
interface FooterCardProps {
    orb: OrbConfig;
    index: number;
    onSelect: (id: string) => void;
}

// Subtle edge glow colors
const EDGE_COLORS = [
    'rgba(0, 212, 255, 0.4)',   // Cyan
    'rgba(138, 43, 226, 0.4)',  // Purple
    'rgba(0, 255, 136, 0.4)',   // Green
    'rgba(255, 165, 0, 0.4)',   // Orange
    'rgba(255, 0, 255, 0.4)',   // Magenta
    'rgba(100, 149, 237, 0.4)', // Cornflower blue
];

function FooterCard({ orb, index, onSelect }: FooterCardProps) {
    const [edgeOpacity, setEdgeOpacity] = useState(0);
    const [yOffset, setYOffset] = useState(0);

    // Each card gets a unique edge glow color
    const edgeColor = useMemo(() => EDGE_COLORS[index % EDGE_COLORS.length], [index]);

    // Animation parameters
    const animParams = useMemo(() => ({
        floatDuration: 5 + Math.random() * 3, // 5-8 seconds (very slow)
        floatAmplitude: 0.3 + Math.random() * 0.4, // 0.3-0.7px (very subtle)
        phase: Math.random() * Math.PI * 2,
        flickerSpeed: 0.3 + Math.random() * 0.4, // Slow flicker cycle
        flickerPhase: Math.random() * Math.PI * 2,
    }), []);

    // Very subtle float + gentle edge pulse
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;

            // Very subtle float
            const floatY = Math.sin((elapsed / animParams.floatDuration) * Math.PI * 2 + animParams.phase)
                * animParams.floatAmplitude;
            setYOffset(floatY);

            // Gentle edge pulse - very subtle, not strobe
            // Uses a soft sine wave with occasional slight intensity variation
            const basePulse = (Math.sin(elapsed * animParams.flickerSpeed + animParams.flickerPhase) + 1) / 2;
            // Add slight random variation every few seconds for organic feel
            const variation = Math.sin(elapsed * 0.1) * 0.1;
            setEdgeOpacity(basePulse * 0.25 + variation * 0.05); // Max opacity ~0.3

            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, [animParams]);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                transform: `translateY(${yOffset}px)`,
                flex: 1,
                maxWidth: 'calc(16.66% - 16px)', // 6 cards with gaps
            }}
            onClick={() => onSelect(orb.id)}
            title={orb.label}
        >
            {/* Card with subtle edge glow */}
            <div
                style={{
                    width: '100%',
                    aspectRatio: '2 / 3',
                    maxWidth: 100,
                    borderRadius: 6,
                    overflow: 'hidden',
                    backgroundImage: orb.imageUrl
                        ? `url('${orb.imageUrl}')`
                        : `linear-gradient(135deg, ${orb.gradient?.[0] || orb.color}, ${orb.gradient?.[1] || orb.color})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '2px solid rgba(255, 255, 255, 0.9)',
                    boxShadow: `
                        0 0 ${4 + edgeOpacity * 8}px ${edgeColor.replace('0.4', String(edgeOpacity))},
                        0 4px 16px rgba(0, 0, 0, 0.5)
                    `,
                    transition: 'transform 0.2s ease-out',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.08) translateY(-4px)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 1)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.9)';
                }}
            />
            {/* Card label */}
            <span
                style={{
                    marginTop: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.85)',
                    textAlign: 'center',
                    textShadow: '0 1px 3px rgba(0, 0, 0, 0.8)',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {orb.label}
            </span>
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
}

function ProfileOrbInline({ onClick, size = 48 }: ProfileOrbInlineProps) {
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
                background: `url('/default-avatar.png') center/cover`,
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
export default function WorldHub() {
    // Get store actions for navigation
    const selectOrb = useWorldStore((state) => state.selectOrb);
    const exitOrb = useWorldStore((state) => state.exitOrb);

    // Get the 6 footer cards (most visited or defaults)
    const footerCards = useMemo(() => getFooterCards(), []);

    // ═══════════════════════════════════════════════════════════════════════
    // UI STATE
    // ═══════════════════════════════════════════════════════════════════════
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
        // Check if user has completed onboarding
        if (typeof window === 'undefined') return false;
        const hasOnboarded = localStorage.getItem('hub-onboarding-complete');
        return !hasOnboarded;
    });
    const profileOrbRef = useRef<HTMLDivElement>(null);

    // Mock notification counts (TODO: Replace with real data)
    const [messageCount] = useState(3);
    const [notificationCount] = useState(7);

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

    // Complete onboarding
    const handleOnboardingComplete = () => {
        localStorage.setItem('hub-onboarding-complete', 'true');
        setIsOnboardingOpen(false);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // NAVIGATION HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    // Handle logo click → Return to home (this page)
    const handleLogoClick = () => {
        console.log('Logo clicked — Returning to World Hub home');
        exitOrb(); // Return to World Hub home view
    };

    // Handle footer card click → Navigate to that world
    const handleCardSelect = (cardId: string) => {
        console.log(`Footer card clicked: ${cardId}`);
        recordCardVisit(cardId);
        selectOrb(cardId as any); // Navigate to the card's world page
    };

    // Handle main carousel card click → Navigate to that world
    const handleOrbSelect = (orbId: string) => {
        console.log(`Main card selected: ${orbId}`);
        recordCardVisit(orbId);
        selectOrb(orbId as any); // Navigate to the card's world page
    };

    // Handle HUD icon navigation
    const handleNavigate = (destination: string) => {
        console.log(`Navigating to: ${destination}`);
        // Map destination names to orb IDs
        const destinationMap: Record<string, string> = {
            'profile': 'social-media',
            'messages': 'social-media', // Messages is part of Social Media
            'notifications': 'social-media', // Notifications is part of Social Media
        };
        const orbId = destinationMap[destination] || destination;
        selectOrb(orbId as any);
    };

    // Toggle profile dropdown
    const handleProfileClick = () => {
        setIsProfileDropdownOpen(prev => !prev);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: '#0a0a0f',
            overflow: 'hidden',
        }}>
            {/* ═══════════════════════════════════════════════════════════════
                3D SPATIAL LAYER — Camera for massive main card
                z-index: 5 puts cards ABOVE background but BELOW HUD (z-index: 10)
                ═══════════════════════════════════════════════════════════════ */}
            <Canvas
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5 }}
                dpr={[1, 2]}
                camera={{ position: [0, 0, 24], fov: 60 }}
                gl={{
                    antialias: true,
                    powerPreference: 'high-performance',
                    outputColorSpace: THREE.SRGBColorSpace,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.0,
                    alpha: true, // Enable transparency so background shows through
                }}
            >
                <Suspense fallback={<LoadingFallback />}>
                    {/* Transparent background - let circuit brain show through */}

                    {/* Lighting */}
                    <ambientLight intensity={0.5} />
                    <pointLight position={[0, 10, 15]} intensity={2} color="#ffffff" />
                    <pointLight position={[-15, 0, 5]} intensity={0.4} color="#4488ff" />
                    <pointLight position={[15, 0, 5]} intensity={0.4} color="#ff4488" />
                    <spotLight
                        position={[0, 15, 10]}
                        angle={0.6}
                        penumbra={0.5}
                        intensity={1.2}
                        color="#ffffff"
                    />

                    {/* Card Carousel with Snap */}
                    <CarouselEngine onOrbSelect={handleOrbSelect} />
                </Suspense>
            </Canvas>

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
                    opacity: 0.25,
                    zIndex: 2,
                    pointerEvents: 'none',
                }}
            />

            {/* ═══════════════════════════════════════════════════════════════
                NEURON LIGHTS — Subtle traveling pulses along circuit paths
                ═══════════════════════════════════════════════════════════════ */}
            <NeuronLights />

            {/* ═══════════════════════════════════════════════════════════════
                HUD OVERLAY LAYER — All interactive UI elements
                z-index: 10 ensures cards and UI are ABOVE background/neurons
                ═══════════════════════════════════════════════════════════════ */}
            <div className="hud-overlay" style={{ zIndex: 10 }}>
                {/* TOP BAR: Logo | Stats (centered) | Profile */}
                <div
                    style={{
                        position: 'absolute',
                        top: 4,
                        left: 24,
                        right: 24,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    {/* LEFT SECTION: Logo only */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {/* SMARTER POKER LOGO — Smaller, click to return home */}
                        <img
                            src="/smarter-poker-logo.png"
                            alt="Smarter Poker — Return to Home"
                            onClick={handleLogoClick}
                            style={{
                                height: 60,
                                width: 'auto',
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6))',
                                cursor: 'pointer',
                                transition: 'transform 0.2s ease-out, filter 0.2s ease-out',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.03)';
                                e.currentTarget.style.filter = 'drop-shadow(0 2px 12px rgba(0, 212, 255, 0.4))';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.filter = 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6))';
                            }}
                            title="Return to Home"
                        />
                    </div>

                    {/* CENTER SECTION: Stats (evenly spaced) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <DiamondStat />
                        <XPStat />
                    </div>

                    {/* RIGHT SECTION: Profile, Messages, Notifications, Search, Help */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                        {/* PROFILE ORB — Click to open dropdown */}
                        <div ref={profileOrbRef}>
                            <ProfileOrbInline onClick={handleProfileClick} size={48} />
                        </div>
                        <ProfileDropdown
                            isOpen={isProfileDropdownOpen}
                            onClose={() => setIsProfileDropdownOpen(false)}
                            anchorRef={profileOrbRef}
                        />

                        {/* MESSAGES ORB — With badge count */}
                        <HudIconOrb
                            iconUrl="/message-orb-icon.png"
                            title="Messages"
                            size={48}
                            badgeCount={messageCount}
                            onClick={() => handleNavigate('messages')}
                        />

                        {/* NOTIFICATIONS ORB — With badge count */}
                        <HudIconOrb
                            iconUrl="/notification-orb-icon.png"
                            title="Notifications"
                            size={48}
                            badgeCount={notificationCount}
                            onClick={() => handleNavigate('notifications')}
                        />

                        {/* SEARCH ORB */}
                        <SearchOrb onClick={() => setIsSearchOpen(true)} size={48} />

                        {/* LIVE HELP ORB — Far right, opens expert assistance panel */}
                        <LiveHelpOrb onClick={liveHelp.openHelp} size={48} />
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    WELCOME BACK — Below header, centered
                    ═══════════════════════════════════════════════════════════════ */}
                <WelcomeBack />

                {/* ═══════════════════════════════════════════════════════════════
                    STREAK POPUP — Subtle toast that appears and fades
                    ═══════════════════════════════════════════════════════════════ */}
                <StreakPopup />

                {/* 6 MOST VISITED CARDS AT BOTTOM */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 64,
                        left: 32,
                        right: 32,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        gap: 16,
                    }}
                >
                    {footerCards.map((orb, index) => (
                        <FooterCard
                            key={orb.id}
                            orb={orb}
                            index={index}
                            onSelect={handleCardSelect}
                        />
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                OVERLAYS — Search, Onboarding, Live Help (highest z-index)
                ═══════════════════════════════════════════════════════════════ */}
            <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
            <OnboardingOverlay isOpen={isOnboardingOpen} onComplete={handleOnboardingComplete} />

            {/* Live Help Panel */}
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
        </div>
    );
}
