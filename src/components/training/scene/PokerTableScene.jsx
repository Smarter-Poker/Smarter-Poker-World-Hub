/**
 * 🎯 Poker Table Scene — SVG + HTML Top-Down Table
 * ═══════════════════════════════════════════════════════════════════
 * Renders a dynamic poker table with 2-9 seats using SVG + HTML.
 * NO CANVAS. All elements are DOM nodes.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import SceneSeat from './SceneSeat';
import SceneCards from './SceneCards';

// Calculate seat positions around an ellipse
function calculateSeatPositions(seatCount, width, height) {
    const positions = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width * 0.38;
    const radiusY = height * 0.35;

    // Start from bottom center and go clockwise
    // Seat 0 (Hero) at bottom center
    for (let i = 0; i < seatCount; i++) {
        // Angle: start at -90° (bottom) and go clockwise
        const angle = (-90 + (i * 360 / seatCount)) * (Math.PI / 180);
        positions.push({
            seatId: i,
            x: centerX + radiusX * Math.cos(angle),
            y: centerY + radiusY * Math.sin(angle),
            angle: angle * (180 / Math.PI) + 90, // For label rotation
        });
    }

    return positions;
}

export default function PokerTableScene({
    seatCount = 6,
    seats = [],
    currentState = {},
    heroCards = null,
    onSeatClick = null,
    width = 400,
    height = 320,
    debugMode = false,
}) {
    const {
        street = 'preflop',
        board = [],
        potBB = 0,
        activePlayerSeatId = null,
        lastAction = null,
        stacksAfter = [],
    } = currentState;

    // Calculate seat positions
    const seatPositions = useMemo(
        () => calculateSeatPositions(seatCount, width, height),
        [seatCount, width, height]
    );

    // Merge seat data with positions
    const seatsWithPositions = useMemo(() => {
        return seatPositions.map((pos, i) => {
            const seatData = seats[i] || {};
            const stackInfo = stacksAfter.find(s => s.seatId === i);
            return {
                ...pos,
                ...seatData,
                currentStackBB: stackInfo?.stackBB ?? seatData.startingStackBB ?? 100,
                isActive: activePlayerSeatId === i,
            };
        });
    }, [seatPositions, seats, stacksAfter, activePlayerSeatId]);

    // Find hero seat
    const heroSeat = seatsWithPositions.find(s => s.isHero);

    return (
        <div style={styles.container}>
            {/* SVG Table Background */}
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={styles.svg}
            >
                {/* Outer table border */}
                <ellipse
                    cx={width / 2}
                    cy={height / 2}
                    rx={width * 0.46}
                    ry={height * 0.44}
                    fill="none"
                    stroke="#b8860b"
                    strokeWidth={8}
                    style={{ filter: 'drop-shadow(0 0 10px rgba(184, 134, 11, 0.5))' }}
                />

                {/* Felt */}
                <ellipse
                    cx={width / 2}
                    cy={height / 2}
                    rx={width * 0.42}
                    ry={height * 0.38}
                    fill="url(#feltGradient)"
                />

                {/* Gradient definitions */}
                <defs>
                    <radialGradient id="feltGradient" cx="50%" cy="40%" r="60%">
                        <stop offset="0%" stopColor="#1a4d2e" />
                        <stop offset="100%" stopColor="#0d2818" />
                    </radialGradient>

                    {/* Active player glow */}
                    <filter id="activeGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
            </svg>

            {/* HTML Overlays */}
            <div style={styles.overlays}>
                {/* Pot Display */}
                <div style={styles.potContainer}>
                    <motion.div
                        style={styles.pot}
                        key={potBB}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <span style={styles.chipIcon}>🪙</span>
                        <span style={styles.potText}>POT: {potBB.toFixed(1)} BB</span>
                    </motion.div>
                </div>

                {/* Street Indicator */}
                <div style={styles.streetIndicator}>
                    {street.toUpperCase()}
                </div>

                {/* Board Cards */}
                {board.length > 0 && (
                    <div style={styles.boardContainer}>
                        <SceneCards cards={board} size="large" />
                    </div>
                )}

                {/* Seats */}
                {seatsWithPositions.map((seat) => (
                    <SceneSeat
                        key={seat.seatId}
                        seat={seat}
                        heroCards={seat.isHero ? heroCards : null}
                        isActive={seat.isActive}
                        lastAction={seat.isActive ? lastAction : null}
                        onClick={onSeatClick}
                        debugMode={debugMode}
                    />
                ))}

                {/* Action Bubble for last action */}
                {lastAction && lastAction.action && (
                    <motion.div
                        style={{
                            ...styles.actionBubble,
                            left: '50%',
                            top: '18%',
                        }}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div style={styles.actionText}>
                            {formatAction(lastAction)}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Debug Overlay */}
            {debugMode && (
                <div style={styles.debugOverlay}>
                    <div>Street: {street}</div>
                    <div>Pot: {potBB}BB</div>
                    <div>Active: Seat {activePlayerSeatId}</div>
                    <div>Board: {board.join(', ') || '-'}</div>
                </div>
            )}
        </div>
    );
}

function formatAction(action) {
    if (!action) return '';
    const { action: act, amount } = action;
    if (amount && amount > 0) {
        return `${act.toUpperCase()} ${amount}BB`;
    }
    return act.toUpperCase();
}

const styles = {
    container: {
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        aspectRatio: '5 / 4',
        margin: '0 auto',
    },

    svg: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },

    overlays: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
    },

    potContainer: {
        position: 'absolute',
        top: '25%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5,
    },

    pot: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'linear-gradient(180deg, rgba(40, 40, 55, 0.95), rgba(20, 20, 30, 0.95))',
        padding: '8px 16px',
        borderRadius: 20,
        border: '2px solid rgba(251, 191, 36, 0.5)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(251, 191, 36, 0.2)',
    },

    chipIcon: {
        fontSize: 18,
    },

    potText: {
        color: '#fbbf24',
        fontSize: 15,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        textShadow: '0 0 10px rgba(251, 191, 36, 0.6)',
    },

    streetIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 3,
        fontFamily: "'Orbitron', monospace",
    },

    boardContainer: {
        position: 'absolute',
        top: '42%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 4,
    },

    actionBubble: {
        position: 'absolute',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        padding: '10px 20px',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(239, 68, 68, 0.5)',
        zIndex: 10,
    },

    actionText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        textAlign: 'center',
    },

    debugOverlay: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: 'rgba(0,0,0,0.8)',
        color: '#0f0',
        fontSize: 10,
        fontFamily: 'monospace',
        padding: 6,
        borderRadius: 4,
        zIndex: 100,
    },
};
