/**
 * ♠ SMARTER.POKER HUB — Club Arena (Orb #2)
 * Loads Club Engine iframe from club.smarter.poker
 * 
 * FIX: Proper cleanup on navigation to prevent page freeze
 */

import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';

export default function ClubArenaPage() {
    const router = useRouter();
    const iframeRef = useRef(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);

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

    return (
        <>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="description" content="Private poker clubs, better than PokerBros" />
            </Head>

            <div style={styles.container}>
                {/* Brain Home Button */}
                <BrainHomeButton style={{ zIndex: 10001 }} />

                {/* Loading state */}
                {!iframeLoaded && (
                    <div style={styles.loadingContainer}>
                        <div style={styles.spinner}></div>
                        <p style={styles.loadingText}>Loading Club Arena...</p>
                    </div>
                )}

                {/* Club Engine iframe */}
                <iframe
                    ref={iframeRef}
                    src="https://club.smarter.poker"
                    style={{
                        ...styles.iframe,
                        opacity: iframeLoaded ? 1 : 0,
                    }}
                    onLoad={() => setIframeLoaded(true)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>

            <style jsx global>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </>
    );
}

const styles = {
    container: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#030a14',
    },
    loadingContainer: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        zIndex: 10,
    },
    spinner: {
        width: '50px',
        height: '50px',
        border: '3px solid rgba(0, 180, 255, 0.2)',
        borderTopColor: 'rgba(0, 220, 255, 0.9)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    loadingText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '16px',
        fontFamily: 'Inter, sans-serif',
    },
    iframe: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        transition: 'opacity 0.3s ease',
    },
};
