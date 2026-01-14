/**
 * 🎮 GAME CARD — Exact Mockup Match
 * ═══════════════════════════════════════════════════════════════════════════
 * Premium game card matching reference design with rank badges
 * Poker chips/cards visuals with S/A/B/C/D-RANK badges
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';

// Rank badge colors matching reference
const RANK_CONFIG = {
    S: { label: 'S-RANK', bg: 'linear-gradient(135deg, #FFD700, #FFA500)', textColor: '#000' },
    A: { label: 'A-RANK', bg: 'linear-gradient(135deg, #4CAF50, #2E7D32)', textColor: '#fff' },
    B: { label: 'B-RANK', bg: 'linear-gradient(135deg, #2196F3, #1565C0)', textColor: '#fff' },
    C: { label: 'C-RANK', bg: 'linear-gradient(135deg, #FF6B35, #E64A19)', textColor: '#fff' },
    D: { label: 'D-RANK', bg: 'linear-gradient(135deg, #9E9E9E, #616161)', textColor: '#fff' },
};

// Card visual types
const CARD_VISUALS = {
    gto: { type: 'grid', color: '#4CAF50' },  // GTO grid visual
    chips: { type: 'chips', color: '#FFD700' }, // Poker chips
    cards: { type: 'cards', color: '#E53935' }, // Playing cards
};

export default function GameCard({
    game,
    mastery = 0,
    levelsCompleted = 0,
    onClick,
}) {
    const [isHovered, setIsHovered] = useState(false);

    if (!game) return null;

    // Determine rank from mastery
    const getRank = () => {
        if (mastery >= 95) return 'S';
        if (mastery >= 85) return 'A';
        if (mastery >= 70) return 'B';
        if (mastery >= 50) return 'C';
        return 'D';
    };
    const rank = getRank();
    const rankConfig = RANK_CONFIG[rank];

    // Determine visual type based on game category
    const getVisualType = () => {
        const id = game.id || '';
        if (id.includes('psy') || id.includes('adv')) return 'cards';
        if (id.includes('mtt') || id.includes('spin')) return 'chips';
        return 'gto';
    };
    const visualType = getVisualType();

    return (
        <div
            onClick={() => onClick?.(game)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                ...styles.container,
                transform: isHovered ? 'scale(1.05) translateY(-4px)' : 'scale(1)',
                boxShadow: isHovered
                    ? '0 12px 30px rgba(255, 107, 53, 0.3), 0 0 0 2px rgba(255, 107, 53, 0.5)'
                    : '0 4px 12px rgba(0,0,0,0.4)',
            }}
        >
            {/* Visual area (top section) */}
            <div style={styles.visualArea}>
                {/* Render visual based on type */}
                {visualType === 'gto' && <GTOGridVisual />}
                {visualType === 'chips' && <ChipsVisual />}
                {visualType === 'cards' && <CardsVisual />}

                {/* Rank badge */}
                {mastery > 0 && (
                    <div style={{
                        ...styles.rankBadge,
                        background: rankConfig.bg,
                        color: rankConfig.textColor,
                    }}>
                        {rankConfig.label}
                    </div>
                )}
            </div>

            {/* Info area (bottom section) */}
            <div style={styles.infoArea}>
                <h3 style={styles.gameTitle}>{game.name}</h3>
                <p style={styles.gameFocus}>{game.focus}</p>

                {/* Difficulty stars */}
                <div style={styles.starsRow}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <span
                            key={i}
                            style={{
                                ...styles.star,
                                color: i < game.difficulty ? '#FFD700' : 'rgba(255,255,255,0.15)',
                            }}
                        >
                            ★
                        </span>
                    ))}
                </div>

                {/* Level progress */}
                <div style={styles.levelProgress}>
                    <span style={styles.levelText}>{levelsCompleted}/10</span>
                </div>
            </div>
        </div>
    );
}

// GTO Grid visual (color squares)
function GTOGridVisual() {
    const colors = ['#4CAF50', '#F44336', '#FFD700', '#2196F3', '#9C27B0', '#FF9800'];
    return (
        <div style={styles.gtoGrid}>
            {Array.from({ length: 24 }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        ...styles.gtoCell,
                        background: colors[Math.floor(Math.random() * colors.length)],
                        opacity: 0.5 + Math.random() * 0.5,
                    }}
                />
            ))}
        </div>
    );
}

// Poker chips visual
function ChipsVisual() {
    return (
        <div style={styles.chipsContainer}>
            <div style={{ ...styles.chip, background: '#FFD700', left: '20%', top: '30%' }} />
            <div style={{ ...styles.chip, background: '#E53935', left: '40%', top: '20%' }} />
            <div style={{ ...styles.chip, background: '#2196F3', left: '55%', top: '35%' }} />
            <div style={{ ...styles.chip, background: '#4CAF50', left: '35%', top: '50%' }} />
        </div>
    );
}

// Playing cards visual
function CardsVisual() {
    return (
        <div style={styles.cardsContainer}>
            <div style={{ ...styles.miniCard, transform: 'rotate(-10deg)', left: '25%' }}>
                <span style={{ color: '#E53935' }}>♦</span>
            </div>
            <div style={{ ...styles.miniCard, transform: 'rotate(5deg)', left: '45%' }}>
                <span style={{ color: '#000' }}>♠</span>
            </div>
        </div>
    );
}

const styles = {
    container: {
        width: 160,
        height: 200,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'linear-gradient(180deg, #1a2744 0%, #0d1628 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        transition: 'all 0.25s ease',
    },

    visualArea: {
        position: 'relative',
        height: 100,
        background: 'linear-gradient(135deg, rgba(26,39,68,0.8), rgba(13,22,40,0.9))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },

    rankBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: '3px 8px',
        fontSize: 9,
        fontWeight: 800,
        borderRadius: 10,
        letterSpacing: 0.5,
    },

    infoArea: {
        padding: '12px 10px',
        height: 100,
        display: 'flex',
        flexDirection: 'column',
    },

    gameTitle: {
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 2px 0',
        lineHeight: 1.2,
    },

    gameFocus: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        margin: '0 0 8px 0',
    },

    starsRow: {
        marginBottom: 8,
    },

    star: {
        fontSize: 11,
        marginRight: 1,
    },

    levelProgress: {
        marginTop: 'auto',
    },

    levelText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
    },

    // GTO Grid styles
    gtoGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 2,
        width: 80,
        height: 60,
    },

    gtoCell: {
        borderRadius: 2,
    },

    // Chips styles
    chipsContainer: {
        position: 'relative',
        width: 100,
        height: 70,
    },

    chip: {
        position: 'absolute',
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    },

    // Cards styles
    cardsContainer: {
        position: 'relative',
        width: 100,
        height: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    miniCard: {
        position: 'absolute',
        width: 36,
        height: 50,
        background: '#fff',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    },
};
