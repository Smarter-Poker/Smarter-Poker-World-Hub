// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — POKERBROS WORLD HUB (6 FOOTER CARDS)
   Profile with reactive glow + 6 most visited cards at bottom
   
   v19.1 — Baked-in Assets Standard (no duplicate labels)
   ═══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { CarouselEngine } from './carousel/CarouselEngine';
import { getFooterCards, recordCardVisit, triggerHaptic, getLastCarouselIndex, setLastCarouselIndex } from '../state/userPreferences';
import { useWorldStore } from '../state/worldStore';
import type { OrbConfig } from '../orbs/manifest/registry';
import { NeuronLights } from './components/NeuronLights';
import { LaunchPad, useLaunchAnimation } from './components/LaunchPad';
import { useCinematicIntro } from './components/CinematicIntro';
import { useReturnBurst } from './components/ReturnBurst';

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
import { DiamondStat, XPStat } from './components/HeaderStats';
import { WelcomeBack } from './components/WelcomeMessage';
import { StreakPopup } from './components/StreakPopup';
import { SearchOrb, SearchOverlay } from './components/GlobalSearch';
import { ProfileDropdown } from './components/ProfileDropdown';
import { LiveHelpOrb } from './components/LiveHelpOrb';
import { useLiveHelp, LiveHelpPanel } from './components/LiveHelp';
import { SettingsOrb } from './components/SettingsOrb';



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

// Holographic edge glow colors (cyan/blue/green/white only)
const HOLO_EDGE_COLORS = [
    { main: 'rgba(0, 212, 255, 0.6)', glow: 'rgba(0, 212, 255, 0.3)' },   // Electric Cyan
    { main: 'rgba(0, 255, 136, 0.6)', glow: 'rgba(0, 255, 136, 0.3)' },   // Neon Green
    { main: 'rgba(0, 191, 255, 0.6)', glow: 'rgba(0, 191, 255, 0.3)' },   // Deep Sky Blue
    { main: 'rgba(77, 210, 255, 0.6)', glow: 'rgba(77, 210, 255, 0.3)' }, // Light Cyan
    { main: 'rgba(0, 255, 159, 0.6)', glow: 'rgba(0, 255, 159, 0.3)' },   // Mint Green
    { main: 'rgba(255, 255, 255, 0.6)', glow: 'rgba(200, 255, 255, 0.3)' }, // Ice White
];

function FooterCard({ orb, index, onSelect, isIntroComplete }: FooterCardProps) {
    const [edgeOpacity, setEdgeOpacity] = useState(0.3);
    const [floatY, setFloatY] = useState(0);
    const [hasAnimatedIn, setHasAnimatedIn] = useState(false);

    // Intro animation - stagger each card (faster timing)
    useEffect(() => {
        if (isIntroComplete && !hasAnimatedIn) {
            const delay = 200 + index * 80; // Faster: 200ms base + 80ms stagger
            const timer = setTimeout(() => setHasAnimatedIn(true), delay);
            return () => clearTimeout(timer);
        }
    }, [isIntroComplete, index, hasAnimatedIn]);

    // Each card gets a unique edge glow color
    const edgeColor = useMemo(() => HOLO_EDGE_COLORS[index % HOLO_EDGE_COLORS.length], [index]);

    // Animation parameters unique to each card - truly independent
    const animParams = useMemo(() => ({
        floatSpeed: 0.25 + (index * 0.08) + Math.random() * 0.15,
        floatAmplitude: 2 + Math.random() * 3,
        phase: (index * 1.2) + Math.random() * Math.PI * 2,
        pulseSpeed: 0.6 + Math.random() * 0.5,
    }), [index]);

    // Holographic animations
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;

            // Gentle floating motion
            const float = Math.sin(elapsed * animParams.floatSpeed + animParams.phase) * animParams.floatAmplitude;
            setFloatY(float);

            // Pulsing edge glow
            const pulse = (Math.sin(elapsed * animParams.pulseSpeed) + 1) / 2;
            setEdgeOpacity(0.3 + pulse * 0.4);

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
                transform: hasAnimatedIn
                    ? `translateY(${floatY}px) perspective(800px) rotateX(10deg) scale(1)`
                    : `translateY(150px) perspective(800px) rotateX(-20deg) scale(0.5)`,
                opacity: hasAnimatedIn ? 1 : 0,
                flex: 1,
                maxWidth: `clamp(140px, 17vw, 186px)`,  // Viewport-scaled card width
                transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease-out',
                transformStyle: 'preserve-3d',
            }}
            onClick={() => onSelect(orb.id)}
            title={orb.label}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = `translateY(${floatY - 12}px) perspective(800px) rotateX(0deg) scale(1.15)`;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = `translateY(${floatY}px) perspective(800px) rotateX(10deg) scale(1)`;
            }}
        >
            {/* Holographic pedestal glow */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 25,
                    width: 160,
                    height: 45,
                    borderRadius: '50%',
                    background: `radial-gradient(ellipse, rgba(0, 212, 255, 0.4), rgba(0, 136, 255, 0.2), transparent 70%)`,
                    filter: 'blur(8px)',
                    opacity: edgeOpacity,
                    transform: 'rotateX(70deg)',
                }}
            />

            {/* 3D Glass Card Container */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 186,
                    transformStyle: 'preserve-3d',
                }}
            >

                {/* Card bottom edge - visible 3D glass thickness */}
                <div
                    style={{
                        position: 'absolute',
                        left: 3,
                        bottom: -6,
                        width: 'calc(100% - 6px)',
                        height: 10,
                        background: 'linear-gradient(90deg, rgba(50, 150, 200, 0.4), rgba(0, 180, 255, 0.3), rgba(100, 200, 255, 0.3))',
                        borderRadius: '0 0 6px 6px',
                        transform: 'rotateX(90deg) translateZ(3px)',
                    }}
                />

                {/* Main card face */}
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '2 / 3',
                        borderRadius: 8,
                        overflow: 'visible',
                        background: 'linear-gradient(135deg, rgba(10, 30, 60, 0.85), rgba(5, 20, 40, 0.9))',
                        border: '2px solid rgba(0, 212, 255, 0.85)',
                        boxShadow: `0 0 20px rgba(0, 180, 255, 0.3), 0 20px 40px rgba(0, 0, 0, 0.5)`,
                    }}
                >
                    {/* Card image */}
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            backgroundImage: orb.imageUrl
                                ? `url('${orb.imageUrl}')`
                                : `linear-gradient(135deg, ${orb.gradient?.[0] || orb.color}, ${orb.gradient?.[1] || orb.color})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            borderRadius: 6,
                        }}
                    />

                    {/* ═══════════════════════════════════════════════════════════════
                        INNER WHITE BORDER FRAME - Clean sharp line (matching mockup)
                        ═══════════════════════════════════════════════════════════════ */}
                    <div style={{ position: 'absolute', top: 8, left: 8, right: 8, height: 2, background: 'rgba(255, 255, 255, 0.95)' }} />
                    <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, height: 2, background: 'rgba(255, 255, 255, 0.95)' }} />
                    <div style={{ position: 'absolute', top: 8, bottom: 8, left: 8, width: 2, background: 'rgba(255, 255, 255, 0.95)' }} />
                    <div style={{ position: 'absolute', top: 8, bottom: 8, right: 8, width: 2, background: 'rgba(255, 255, 255, 0.95)' }} />
                </div>
            </div>
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
export default function WorldHub() {
    // Get store actions for navigation
    const selectOrb = useWorldStore((state) => state.selectOrb);
    const exitOrb = useWorldStore((state) => state.exitOrb);

    // Next.js router for actual page navigation
    const router = useRouter();

    // Mobile detection
    const isMobile = useIsMobile();

    // Get the 6 footer cards (most visited or defaults)
    const footerCards = useMemo(() => getFooterCards(), []);

    // ═══════════════════════════════════════════════════════════════════════
    // UI STATE
    // ═══════════════════════════════════════════════════════════════════════
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const profileOrbRef = useRef<HTMLDivElement>(null);

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

    // Fetch user profile data including avatar
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                // Import supabase dynamically to avoid SSR issues
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('avatar_url')
                        .eq('id', user.id)
                        .maybeSingle();
                    if (profile?.avatar_url) {
                        setUserAvatarUrl(profile.avatar_url);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch user profile:', e);
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
        router.push(`/hub/${cardId}`);
    };

    // Handle main carousel card click → Navigate to that world page
    const handleOrbSelect = (orbId: string) => {
        console.log(`Main card selected: ${orbId}`);
        triggerHaptic('heavy');
        recordCardVisit(orbId);
        selectOrb(orbId as any);
        router.push(`/hub/${orbId}`);
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

    // Toggle profile dropdown
    const handleProfileClick = () => {
        setIsProfileDropdownOpen(prev => !prev);
    };

    return (
        <>
            {/* EPIC CINEMATIC INTRO - Shows ONLY on login (Authentication Handshake Exception) */}
            {CinematicIntroComponent}

            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #050510 50%, #0a1218 100%)',
                overflow: 'hidden',
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
                        <pointLight position={[-15, 5, 8]} intensity={0.6} color="#00d4ff" />
                        <pointLight position={[15, 5, 8]} intensity={0.6} color="#00ff88" />
                        <pointLight position={[0, -10, 10]} intensity={0.3} color="#0088ff" />
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
                            color="#00d4ff"
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
                        />
                    </Suspense>
                </Canvas>


                {/* Keyframe animations for shine and pedestal effects */}
                <style jsx global>{`
                @keyframes pedestalPulse {
                    0%, 100% { opacity: 0.6; transform: translateX(-50%) rotateX(75deg) scale(1); }
                    50% { opacity: 1; transform: translateX(-50%) rotateX(75deg) scale(1.05); }
                }
                @keyframes shineFlash {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                }
                /* Hide scrollbar for mobile footer */
                div::-webkit-scrollbar {
                    display: none;
                }
            `}</style>

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
                <NeuronLights />

                {/* ═══════════════════════════════════════════════════════════════
                HUD OVERLAY LAYER — All interactive UI elements
                z-index: 10 ensures cards and UI are ABOVE background/neurons
                ═══════════════════════════════════════════════════════════════ */}
                <div className="hud-overlay" style={{ zIndex: 10 }}>
                    {/* TOP BAR: Full Width Glassmorphism Header */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: isMobile ? `clamp(10px, 1.5vh, 12px) clamp(12px, 2.0vh, 16px)` : `clamp(14px, 1.5vh, 16px) clamp(32px, 3.7vh, 40px)`,  // Viewport-scaled padding
                            background: 'linear-gradient(180deg, rgba(10, 22, 40, 0.92), rgba(5, 15, 30, 0.95))',
                            backdropFilter: 'blur(15px)',
                            WebkitBackdropFilter: 'blur(15px)',
                            borderBottom: '2px solid rgba(0, 212, 255, 0.3)',
                            boxShadow: `
                            0 4px 30px rgba(0, 0, 0, 0.5),
                            0 0 30px rgba(0, 212, 255, 0.1)
                        `,
                        }}
                    >
                        {/* LEFT SECTION: Logo */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <img
                                src="/smarter-poker-logo.png"
                                alt="Smarter Poker — Return to Home"
                                onClick={handleLogoClick}
                                style={{
                                    height: isMobile ? `clamp(32px, 6vh, 40px)` : `clamp(48px, 5.6vh, 60px)`,  // Viewport-scaled logo
                                    width: 'auto',
                                    objectFit: 'contain',
                                    filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease-out, filter 0.2s ease-out',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                    e.currentTarget.style.filter = 'drop-shadow(0 2px 12px rgba(0, 212, 255, 0.5))';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.filter = 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))';
                                }}
                                title="Return to Home"
                            />
                        </div>

                        {/* CENTER SECTION: Stats */}
                        {!isMobile && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <DiamondStat onBuyClick={handleBuyDiamonds} />
                                <XPStat />
                            </div>
                        )}

                        {/* RIGHT SECTION: Icons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, position: 'relative' }}>
                            {/* PROFILE ORB */}
                            <div ref={profileOrbRef}>
                                <ProfileOrbInline
                                    onClick={handleProfileClick}
                                    size={isMobile ? 36 : Math.min(56, Math.max(48, window.innerHeight * 0.052))}
                                    avatarUrl={userAvatarUrl}
                                />
                            </div>
                            <ProfileDropdown
                                isOpen={isProfileDropdownOpen}
                                onClose={() => setIsProfileDropdownOpen(false)}
                                anchorRef={profileOrbRef}
                            />

                            {/* MESSAGES ORB - Hidden on mobile */}
                            {!isMobile && (
                                <HudIconOrb
                                    iconUrl="/message-orb-icon.png"
                                    title="Messages"
                                    size={56}
                                    badgeCount={messageCount}
                                    onClick={() => handleNavigate('messages')}
                                />
                            )}

                            {/* NOTIFICATIONS ORB - Hidden on mobile */}
                            {!isMobile && (
                                <HudIconOrb
                                    iconUrl="/notification-orb-icon.png"
                                    title="Notifications"
                                    size={56}
                                    badgeCount={notificationCount}
                                    onClick={() => handleNavigate('notifications')}
                                />
                            )}

                            {/* SEARCH ORB */}
                            <SearchOrb onClick={() => setIsSearchOpen(true)} size={isMobile ? 36 : 56} />

                            {/* SETTINGS ORB - Hidden on mobile */}
                            {!isMobile && (
                                <SettingsOrb onClick={handleSettings} size={56} />
                            )}

                            {/* LIVE HELP ORB */}
                            <LiveHelpOrb onClick={liveHelp.openHelp} size={isMobile ? 36 : 56} />
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
                    {!isMobile && (
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
                                    isIntroComplete={isIntroComplete}
                                />
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
                            {footerCards.map((orb, index) => (
                                <div
                                    key={orb.id}
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
                                            border: '2px solid rgba(0, 212, 255, 0.6)',
                                            boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)',
                                            position: 'relative',
                                        }}
                                    >
                                        {/* Inner border frame */}
                                        <div style={{ position: 'absolute', top: 4, left: 4, right: 4, height: 1.5, background: 'rgba(255, 255, 255, 0.9)' }} />
                                        <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, height: 1.5, background: 'rgba(255, 255, 255, 0.9)' }} />
                                        <div style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 1.5, background: 'rgba(255, 255, 255, 0.9)' }} />
                                        <div style={{ position: 'absolute', top: 4, bottom: 4, right: 4, width: 1.5, background: 'rgba(255, 255, 255, 0.9)' }} />
                                    </div>
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
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                OVERLAYS — Search, Live Help (highest z-index)
                ═══════════════════════════════════════════════════════════════ */}
                <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

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
        </>
    );
}
