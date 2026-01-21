/**
 * ♠ SMARTER.POKER HUB — Club Arena (Orb #2)
 * Private poker clubs page
 * 
 * FIX: Proper cleanup on navigation to prevent page freeze
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';

// God-Mode Stack
import { useClubArenaStore } from '../../src/stores/clubArenaStore';
import PageTransition from '../../src/components/transitions/PageTransition';

export default function ClubArenaPage() {
    const router = useRouter();

    return (
        <PageTransition>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="description" content="Private poker clubs, better than PokerBros" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    .club-arena-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .club-arena-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .club-arena-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .club-arena-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .club-arena-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .club-arena-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="club-arena-page" style={styles.container}>
                {/* Brain Home Button */}
                <BrainHomeButton style={{ zIndex: 10001 }} />

                {/* Coming Soon Content */}
                <div style={styles.content}>
                    <div style={styles.icon}>🎰</div>
                    <h1 style={styles.title}>Club Arena</h1>
                    <p style={styles.subtitle}>Private Poker Clubs</p>
                    <div style={styles.comingSoon}>
                        <span style={styles.badge}>🚧 Coming Soon</span>
                        <p style={styles.description}>
                            Create and join private poker clubs. Host tournaments,
                            track stats, and compete with friends.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push('/hub')}
                        style={styles.backButton}
                    >
                        ← Back to Hub
                    </button>
                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #030a14 0%, #0a1628 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        textAlign: 'center',
        padding: '40px',
    },
    icon: {
        fontSize: '80px',
        marginBottom: '20px',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '42px',
        fontWeight: 700,
        color: '#00D4FF',
        marginBottom: '10px',
    },
    subtitle: {
        fontSize: '20px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '40px',
    },
    comingSoon: {
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '16px',
        padding: '30px',
        marginBottom: '30px',
        maxWidth: '400px',
    },
    badge: {
        display: 'inline-block',
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        borderRadius: '8px',
        color: '#000',
        fontWeight: 600,
        fontSize: '14px',
        marginBottom: '15px',
    },
    description: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: '16px',
        lineHeight: 1.6,
        margin: 0,
    },
    backButton: {
        padding: '14px 32px',
        background: 'rgba(0, 212, 255, 0.15)',
        border: '1px solid rgba(0, 212, 255, 0.4)',
        borderRadius: '12px',
        color: '#00D4FF',
        fontSize: '16px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
};
