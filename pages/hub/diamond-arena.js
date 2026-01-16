/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARENA — Live Poker Room
   Embeds the Diamond Arena poker application
   ═══════════════════════════════════════════════════════════════════════════ */

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';

export default function DiamondArenaPage() {
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}>💎</div>
                <p style={styles.loadingText}>Loading Diamond Arena...</p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Diamond Arena — Smarter.Poker</title>
                <meta name="description" content="High-stakes competitive poker with diamond entry fees and massive prize pools" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Brain Home Button */}
                <BrainHomeButton style={{ zIndex: 1001 }} />

                {/* Loading Overlay */}
                {!iframeLoaded && (
                    <div style={styles.loadingOverlay}>
                        <div style={styles.loadingContent}>
                            <div style={styles.diamondPulse}>💎</div>
                            <h2 style={styles.loadingTitle}>DIAMOND ARENA</h2>
                            <p style={styles.loadingSubtitle}>Entering the Arena...</p>
                            <div style={styles.progressBar}>
                                <div style={styles.progressFill} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Diamond Arena iframe */}
                <iframe
                    src="https://diamond.smarter.poker"
                    style={{
                        ...styles.iframe,
                        opacity: iframeLoaded ? 1 : 0,
                    }}
                    onLoad={() => setIframeLoaded(true)}
                    allow="fullscreen; autoplay; clipboard-write"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
            </div>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </>
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
        bottom: 0,
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
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050507',
    },
    loadingOverlay: {
        position: 'fixed',
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
        letterSpacing: '0.15em',
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
};
