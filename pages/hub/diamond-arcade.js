/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND ARCADE — Mini-Games for Diamonds
   Play fun poker-themed mini-games to earn diamonds
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { motion } from 'framer-motion';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// ARCADE GAMES DATA
// ═══════════════════════════════════════════════════════════════════════════
const ARCADE_GAMES = [
    {
        id: 'quick-fold',
        name: 'Quick Fold Challenge',
        icon: '⚡',
        description: 'How fast can you identify the fold?',
        reward: '5-25 💎',
        color: '#00D4FF',
        available: false,
    },
    {
        id: 'range-match',
        name: 'Range Matcher',
        icon: '🎯',
        description: 'Match hands to their correct range',
        reward: '10-50 💎',
        color: '#8a2be2',
        available: false,
    },
    {
        id: 'pot-odds',
        name: 'Pot Odds Blitz',
        icon: '🧮',
        description: 'Calculate pot odds under pressure',
        reward: '15-75 💎',
        color: '#00ff88',
        available: false,
    },
    {
        id: 'position-master',
        name: 'Position Master',
        icon: '🪑',
        description: 'Identify optimal plays by position',
        reward: '10-40 💎',
        color: '#ff6b9d',
        available: false,
    },
    {
        id: 'card-memory',
        name: 'Card Memory',
        icon: '🃏',
        description: 'Remember the board cards',
        reward: '5-30 💎',
        color: '#FFD700',
        available: false,
    },
    {
        id: 'stack-builder',
        name: 'Stack Builder',
        icon: '📊',
        description: 'Build the biggest stack in limited hands',
        reward: '20-100 💎',
        color: '#ff4444',
        available: false,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// GAME CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function GameCard({ game }) {
    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -4 }}
            style={{
                ...styles.gameCard,
                borderColor: game.available ? game.color : 'rgba(255, 255, 255, 0.1)',
                opacity: game.available ? 1 : 0.6,
            }}
        >
            <div style={{ ...styles.gameIcon, background: `linear-gradient(135deg, ${game.color}33, ${game.color}11)` }}>
                <span style={{ fontSize: 40 }}>{game.icon}</span>
            </div>
            <div style={styles.gameInfo}>
                <h3 style={styles.gameName}>{game.name}</h3>
                <p style={styles.gameDescription}>{game.description}</p>
                <div style={styles.gameReward}>
                    <span style={{ color: game.color }}>Reward: {game.reward}</span>
                </div>
            </div>
            {!game.available && (
                <div style={styles.comingSoonBadge}>COMING SOON</div>
            )}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND ARCADE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondArcadePage() {
    const router = useRouter();
    const [dailyPlays, setDailyPlays] = useState(5);

    return (
        <PageTransition>
            <Head>
                <title>Diamond Arcade — Smarter.Poker</title>
                <meta name="description" content="Play mini-games to earn diamonds" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .arcade-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .arcade-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .arcade-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .arcade-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .arcade-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .arcade-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="arcade-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                <div style={styles.header}>
                    <h1 style={styles.pageTitle}>🎮 Diamond Arcade</h1>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {/* Daily Plays Banner */}
                    <div style={styles.dailyBanner}>
                        <div style={styles.dailyInfo}>
                            <span style={styles.dailyLabel}>Daily Plays Remaining</span>
                            <span style={styles.dailyCount}>{dailyPlays} / 5</span>
                        </div>
                        <div style={styles.dailyNote}>
                            Plays reset at midnight UTC • VIP members get 10 daily plays
                        </div>
                    </div>

                    {/* Games Grid */}
                    <div style={styles.gamesGrid}>
                        {ARCADE_GAMES.map(game => (
                            <GameCard key={game.id} game={game} />
                        ))}
                    </div>

                    {/* Coming Soon Notice */}
                    <div style={styles.notice}>
                        <span style={styles.noticeIcon}>🚀</span>
                        <div>
                            <strong>Arcade Games Launching Soon!</strong>
                            <p style={styles.noticeText}>
                                We're building fun, skill-based mini-games where you can earn diamonds
                                while sharpening your poker skills. Stay tuned!
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(138, 43, 226, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(138, 43, 226, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(138, 43, 226, 0.1), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: 0,
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    content: {
        maxWidth: 800,
        margin: '0 auto',
        padding: '32px 24px',
    },
    dailyBanner: {
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(100, 30, 180, 0.2))',
        border: '1px solid rgba(138, 43, 226, 0.4)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 32,
        textAlign: 'center',
    },
    dailyInfo: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        marginBottom: 8,
    },
    dailyLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    dailyCount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#8a2be2',
    },
    dailyNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    gamesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        marginBottom: 32,
    },
    gameCard: {
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 16,
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    gameIcon: {
        width: 70,
        height: 70,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    gameInfo: {},
    gameName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 8,
    },
    gameDescription: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 12,
        lineHeight: 1.5,
    },
    gameReward: {
        fontSize: 14,
        fontWeight: 600,
    },
    comingSoonBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    notice: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 16,
        padding: '20px 24px',
    },
    noticeIcon: {
        fontSize: 32,
    },
    noticeText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 8,
        lineHeight: 1.5,
    },
};
