/**
 * 🎯 Scene Seat — Individual Player Seat Component
 * ═══════════════════════════════════════════════════════════════════
 * Renders a single seat with avatar, stack, position badge, and cards.
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import SceneCards from './SceneCards';

export default function SceneSeat({
    seat,
    heroCards = null,
    isActive = false,
    lastAction = null,
    onClick = null,
    debugMode = false,
}) {
    const {
        seatId,
        x,
        y,
        position,
        playerName,
        isHero,
        currentStackBB = 100,
    } = seat;

    // Offset from center for seat placement
    const seatWidth = 70;
    const seatHeight = isHero ? 100 : 70;

    return (
        <motion.div
            style={{
                ...styles.seat,
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                width: seatWidth,
                height: seatHeight,
            }}
            animate={{
                boxShadow: isActive
                    ? '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)'
                    : 'none',
            }}
            transition={{ duration: 0.3 }}
            onClick={() => onClick?.(seatId)}
        >
            {/* Avatar Container */}
            <div style={{
                ...styles.avatarContainer,
                borderColor: isHero ? '#00d4ff' : isActive ? '#fbbf24' : '#555',
            }}>
                {/* Avatar placeholder - using position initial */}
                <div style={styles.avatar}>
                    {isHero ? '👤' : (position?.[0] || 'V')}
                </div>

                {/* Active glow ring */}
                {isActive && (
                    <motion.div
                        style={styles.activeRing}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                )}
            </div>

            {/* Position Badge */}
            <div style={{
                ...styles.badge,
                background: isHero
                    ? 'linear-gradient(180deg, #00d4ff, #0099cc)'
                    : 'linear-gradient(180deg, #4a4a5a, #2d2d3a)',
            }}>
                {isHero ? 'HERO' : position}
            </div>

            {/* Stack */}
            <div style={styles.stack}>
                {currentStackBB.toFixed(0)} BB
            </div>

            {/* Hero Cards (only for hero seat) */}
            {isHero && heroCards && heroCards.length > 0 && (
                <div style={styles.heroCards}>
                    <SceneCards cards={heroCards} size="small" />
                </div>
            )}

            {/* Debug info */}
            {debugMode && (
                <div style={styles.debugLabel}>
                    S{seatId}
                </div>
            )}
        </motion.div>
    );
}

const styles = {
    seat: {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'auto',
        cursor: 'pointer',
        zIndex: 10,
    },

    avatarContainer: {
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '3px solid #555',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #2d2d3a, #1a1a24)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
    },

    avatar: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        color: '#888',
    },

    activeRing: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: '50%',
        border: '2px solid #00d4ff',
        pointerEvents: 'none',
    },

    badge: {
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    },

    stack: {
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        color: '#fbbf24',
        textShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
    },

    heroCards: {
        marginTop: 4,
    },

    debugLabel: {
        position: 'absolute',
        top: -12,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 8,
        color: '#0f0',
        fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.8)',
        padding: '1px 4px',
        borderRadius: 2,
    },
};
