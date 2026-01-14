/**
 * 🎬 FEATURED HERO — Exact Mockup Match
 * ═══════════════════════════════════════════════════════════════════════════
 * Cinematic hero banner matching the reference design exactly
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { dailyRotationEngine } from '../../engine/DailyRotationEngine';

export default function FeaturedHero({ onPlayNow, userStreak = 5, xpMultiplier = 2.5 }) {
    const [featuredContent, setFeaturedContent] = useState(null);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        const hero = dailyRotationEngine.getFeaturedHero();
        setFeaturedContent(hero);
    }, []);

    const handlePlayNow = () => {
        if (featuredContent?.gameId && onPlayNow) {
            onPlayNow(featuredContent.gameId);
        } else {
            onPlayNow?.('mtt_01');
        }
    };

    return (
        <div style={styles.container}>
            {/* Background image - poker chips and cards */}
            <div style={styles.backgroundImage} />

            {/* Gradient overlay for text readability */}
            <div style={styles.gradientOverlay} />

            {/* Top border glow */}
            <div style={styles.topBorder} />

            {/* Content */}
            <div style={styles.content}>
                {/* Left side - Text content */}
                <div style={styles.textSection}>
                    {/* Daily Challenge label */}
                    <div style={styles.challengeLabel}>
                        DAILY CHALLENGE
                    </div>

                    {/* Main title */}
                    <h1 style={styles.title}>
                        HIGH STAKES BLUFFS
                    </h1>

                    {/* Stats row */}
                    <div style={styles.statsRow}>
                        <div style={styles.statItem}>
                            <span style={styles.statIcon}>✨</span>
                            <span style={styles.statText}>XP MULTIPLIER ACTIVE</span>
                            <span style={styles.statValue}>×{xpMultiplier}</span>
                        </div>
                        <span style={styles.statDivider}>•</span>
                        <div style={styles.statItem}>
                            <span style={styles.statIcon}>🔥</span>
                            <span style={styles.statText}>CURRENT STREAK:</span>
                            <span style={styles.statValue}>{userStreak}</span>
                        </div>
                    </div>

                    {/* Play Now button */}
                    <button
                        onClick={handlePlayNow}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                        style={{
                            ...styles.playButton,
                            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                            boxShadow: isHovered
                                ? '0 0 30px rgba(255, 107, 53, 0.6), 0 8px 25px rgba(0,0,0,0.4)'
                                : '0 4px 15px rgba(0,0,0,0.3)',
                        }}
                    >
                        PLAY NOW
                    </button>
                </div>

                {/* Right side - Floating cards */}
                <div style={styles.cardsSection}>
                    <div style={styles.cardStack}>
                        <div style={{ ...styles.floatingCard, transform: 'rotate(-15deg) translateX(-20px)' }} />
                        <div style={{ ...styles.floatingCard, ...styles.cardOverlay1, transform: 'rotate(-5deg)' }} />
                        <div style={{ ...styles.floatingCard, ...styles.cardOverlay2, transform: 'rotate(5deg) translateX(20px)' }} />
                        <div style={{ ...styles.floatingCard, ...styles.cardOverlay3, transform: 'rotate(15deg) translateX(40px)' }} />
                    </div>
                </div>
            </div>

            {/* Bottom glow line */}
            <div style={styles.bottomGlow} />
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        width: '100%',
        height: 280,
        background: '#0d1117',
        overflow: 'hidden',
    },

    backgroundImage: {
        position: 'absolute',
        inset: 0,
        backgroundImage: 'url("/cards/training.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.4,
    },

    gradientOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, rgba(13,17,23,0.95) 0%, rgba(13,17,23,0.8) 40%, rgba(13,17,23,0.3) 100%)',
    },

    topBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'linear-gradient(90deg, #FF6B35, #FFD700, #FF6B35)',
    },

    content: {
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '100%',
        padding: '0 60px',
        maxWidth: 1400,
        margin: '0 auto',
    },

    textSection: {
        flex: 1,
    },

    challengeLabel: {
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 8,
    },

    title: {
        fontSize: 48,
        fontWeight: 900,
        color: '#fff',
        margin: '0 0 20px 0',
        textShadow: '0 4px 20px rgba(0,0,0,0.5)',
        fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
        letterSpacing: 2,
    },

    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
        flexWrap: 'wrap',
    },

    statItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },

    statIcon: {
        fontSize: 14,
    },

    statText: {
        fontSize: 12,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
    },

    statValue: {
        fontSize: 14,
        fontWeight: 800,
        color: '#FFD700',
        marginLeft: 4,
    },

    statDivider: {
        color: 'rgba(255,255,255,0.3)',
        margin: '0 8px',
    },

    playButton: {
        padding: '14px 40px',
        fontSize: 14,
        fontWeight: 800,
        fontFamily: 'Arial, sans-serif',
        color: '#fff',
        background: 'linear-gradient(180deg, #FF6B35 0%, #E55A2B 100%)',
        border: '2px solid rgba(255,255,255,0.2)',
        borderRadius: 6,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: 2,
        transition: 'all 0.2s ease',
    },

    cardsSection: {
        position: 'relative',
        width: 300,
        height: 200,
    },

    cardStack: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },

    floatingCard: {
        position: 'absolute',
        width: 80,
        height: 110,
        background: 'linear-gradient(135deg, #fff 0%, #f8f8f8 100%)',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
    },

    cardOverlay1: {
        background: 'linear-gradient(135deg, #ffebee 0%, #fff 100%)',
    },

    cardOverlay2: {
        background: 'linear-gradient(135deg, #fff 0%, #f5f5f5 100%)',
    },

    cardOverlay3: {
        background: 'linear-gradient(135deg, #fff8e1 0%, #fff 100%)',
    },

    bottomGlow: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 0%, #FF6B35 20%, #FFD700 50%, #FF6B35 80%, transparent 100%)',
    },
};
