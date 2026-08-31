/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARENA — Live Poker Room
   Embeds the Diamond Arena poker application
   
   FIX: Proper cleanup on navigation to prevent page freeze
   ═══════════════════════════════════════════════════════════════════════════ */

import SEOHead from '../../src/components/seo/SEOHead';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAvatar } from '../../src/contexts/AvatarContext';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getDiamondArenaPreferences, updateDiamondArenaPreferences } from '../../src/services/diamondArenaPreferences';

export default function DiamondArenaPage({ initialArenaAvailable = false }) {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const iframeRef = useRef(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [arenaAvailable, setArenaAvailable] = useState(initialArenaAvailable);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        soundEffects: true,
        animations: true,
        autoRebuy: false
    });

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getDiamondArenaPreferences(userId).then(setPreferences);
        }
    }, []);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateDiamondArenaPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('diamond-arena', user, preferences, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setAnimations: (val) => updatePreference('animations', val),
        setAutoRebuy: (val) => updatePreference('autoRebuy', val)
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    // Cleanup iframe on unmount or navigation
    useEffect(() => {
        const handleRouteChangeStart = () => {
            setIsNavigating(true);
            // Immediately clear iframe to prevent freeze
            if (iframeRef.current) {
                iframeRef.current.src = 'about:blank';
            }
        };

        const handleRouteChangeComplete = () => {
            setIsNavigating(false);
        };

        router.events.on('routeChangeStart', handleRouteChangeStart);
        router.events.on('routeChangeComplete', handleRouteChangeComplete);
        router.events.on('routeChangeError', handleRouteChangeComplete);

        return () => {
            // Cleanup on unmount
            if (iframeRef.current) {
                iframeRef.current.src = 'about:blank';
            }
            router.events.off('routeChangeStart', handleRouteChangeStart);
            router.events.off('routeChangeComplete', handleRouteChangeComplete);
            router.events.off('routeChangeError', handleRouteChangeComplete);
        };
    }, [router.events]);

    // Don't render iframe content if navigating away
    if (isNavigating) {
        return null;
    }

    if (!mounted) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}>Diamonds</div>
                <p style={styles.loadingText}>Loading Diamond Arena...</p>
            </div>
        );
    }

    return (
        <PageTransition>
            <SEOHead
                title="Diamond Arena: Competitive Poker Games"
                description="Compete In High-Stakes Diamond Arena Poker Games. Earn Diamonds, Climb Rankings, And Prove Your Skills."
                canonical="/hub/diamond-arena"
            >
                
            </SEOHead>

            <div className="diamond-arena-page" style={styles.container}>
                {/* Universal Header */}
                <div style={styles.header}>
                    <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
                </div>

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                <main style={styles.arenaStage}>
                    {!arenaAvailable ? (
                        <section style={styles.unavailablePanel} role="status" aria-live="polite">
                            <div style={styles.unavailableGem} aria-hidden="true">◆</div>
                            <p style={styles.unavailableEyebrow}>Arena Status</p>
                            <h1 style={styles.unavailableTitle}>Diamond Arena Is Temporarily Unavailable</h1>
                            <p style={styles.unavailableCopy}>
                                The Live Poker Room Did Not Pass Its Availability Check. Your Hub Session Is Safe, And You Can Retry Without Losing Your Place.
                            </p>
                            <div style={styles.unavailableActions}>
                                <button type="button" style={styles.retryButton} onClick={() => router.reload()}>
                                    Retry Arena
                                </button>
                                <button type="button" style={styles.hubButton} onClick={() => router.push('/hub')}>
                                    Return To Hub
                                </button>
                            </div>
                        </section>
                    ) : (
                        <>
                            {/* Loading Overlay */}
                            {!iframeLoaded && (
                                <div style={styles.loadingOverlay}>
                                    <div style={styles.loadingContent}>
                                        <div style={styles.diamondPulse}>◆</div>
                                        <h2 style={styles.loadingTitle}>Diamond Arena</h2>
                                        <p style={styles.loadingSubtitle}>Entering The Arena...</p>
                                        <div style={styles.progressBar}>
                                            <div style={styles.progressFill} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Diamond Arena iframe */}
                            <iframe
                                ref={iframeRef}
                                src="https://diamond.smarter.poker"
                                title="Diamond Arena Live Poker Room"
                                style={{
                                    ...styles.iframe,
                                    opacity: iframeLoaded ? 1 : 0,
                                }}
                                onLoad={() => setIframeLoaded(true)}
                                onError={() => setArenaAvailable(false)}
                                allow="fullscreen; autoplay; clipboard-write"
                                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                            />
                        </>
                    )}
                </main>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
    </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 'var(--active-world-footer-height, 70px)',
        background: '#050507',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
    },
    header: {
        position: 'relative',
        flex: '0 0 auto',
        zIndex: 1001,
    },
    arenaStage: {
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden',
        background: '#050507',
    },
    backButton: {
        position: 'fixed',
        top: '16px',
        left: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid rgba(255, 184, 0, 0.4)',
        borderRadius: '8px',
        color: '#FFB800',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        textDecoration: 'none',
        zIndex: 1000,
        backdropFilter: 'blur(8px)',
        transition: 'all 0.2s ease',
    },
    iframe: {
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#050507',
        transition: 'opacity 0.3s ease',
    },
    loadingContainer: {
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050507',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#050507',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    loadingContent: {
        textAlign: 'center',
    },
    diamondPulse: {
        fontSize: '72px',
        marginBottom: '24px',
        animation: 'pulse 2s ease-in-out infinite',
    },
    loadingTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '32px',
        fontWeight: 800,
        color: '#FFB800',
        marginBottom: '12px',
        letterSpacing: '0.08em',
        textShadow: '0 0 30px rgba(255, 184, 0, 0.4)',
    },
    loadingSubtitle: {
        fontSize: '16px',
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: '32px',
    },
    progressBar: {
        width: '200px',
        height: '4px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        overflow: 'hidden',
        margin: '0 auto',
    },
    progressFill: {
        height: '100%',
        width: '100%',
        background: 'linear-gradient(90deg, #FFB800, #00E0FF)',
        animation: 'shimmer 1.5s ease-in-out infinite',
    },
    loadingSpinner: {
        fontSize: '64px',
        animation: 'pulse 1s ease-in-out infinite',
    },
    loadingText: {
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '16px',
        fontFamily: 'Inter, sans-serif',
    },
    unavailablePanel: {
        position: 'absolute',
        inset: 'clamp(12px, 4vw, 48px)',
        margin: 'auto',
        width: 'min(680px, calc(100% - 24px))',
        height: 'fit-content',
        boxSizing: 'border-box',
        padding: 'clamp(24px, 5vw, 52px)',
        borderRadius: '28px',
        border: '1px solid rgba(255, 184, 0, 0.5)',
        background: 'radial-gradient(circle at 50% 0%, rgba(0, 224, 255, 0.16), transparent 48%), linear-gradient(145deg, rgba(18, 20, 28, 0.98), rgba(3, 4, 8, 0.98))',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.65), inset 0 0 30px rgba(255, 184, 0, 0.06)',
        textAlign: 'center',
        color: '#f8fafc',
    },
    unavailableGem: {
        color: '#00E0FF',
        fontSize: 'clamp(42px, 8vw, 72px)',
        lineHeight: 1,
        textShadow: '0 0 34px rgba(0, 224, 255, 0.75)',
    },
    unavailableEyebrow: {
        margin: '16px 0 8px',
        color: '#FFB800',
        fontSize: '12px',
        fontWeight: 800,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
    },
    unavailableTitle: {
        margin: 0,
        fontFamily: 'Orbitron, Inter, sans-serif',
        fontSize: 'clamp(24px, 5vw, 42px)',
        lineHeight: 1.15,
    },
    unavailableCopy: {
        maxWidth: '560px',
        margin: '18px auto 0',
        color: 'rgba(226, 232, 240, 0.78)',
        fontSize: 'clamp(14px, 2.5vw, 17px)',
        lineHeight: 1.65,
    },
    unavailableActions: {
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginTop: '28px',
    },
    retryButton: {
        minWidth: '152px',
        minHeight: '48px',
        padding: '12px 20px',
        borderRadius: '999px',
        border: '1px solid rgba(255, 184, 0, 0.9)',
        background: 'linear-gradient(135deg, #FFB800, #d88100)',
        color: '#07090d',
        fontWeight: 900,
        cursor: 'pointer',
    },
    hubButton: {
        minWidth: '152px',
        minHeight: '48px',
        padding: '12px 20px',
        borderRadius: '999px',
        border: '1px solid rgba(0, 224, 255, 0.55)',
        background: 'rgba(0, 224, 255, 0.08)',
        color: '#dffbff',
        fontWeight: 800,
        cursor: 'pointer',
    },
};

export async function getServerSideProps({ res }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let initialArenaAvailable = false;

    try {
        const response = await fetch('https://diamond.smarter.poker', {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: { Accept: 'text/html' },
        });
        initialArenaAvailable = response.status >= 200 && response.status < 400;
        await response.body?.cancel?.();
    } catch (_error) {
        initialArenaAvailable = false;
    } finally {
        clearTimeout(timeout);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return { props: { initialArenaAvailable } };
}
