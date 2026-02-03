/**
 * 🎮 Poker Table Scene — Golden Template Design
 * ═══════════════════════════════════════════════════════════════════
 * Renders the Golden Template poker table with:
 * - Racetrack shape with double gold rails
 * - Dark felt (Facebook Dark palette)
 * - 3D layered depth effect
 * - Premium pot display
 * - Community cards
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import SceneSeat from './SceneSeat';
import SceneCards from './SceneCards';
import { FACEBOOK_DARK } from '../../../hooks/useTrainingTheme';

// =============================================================================
// SEAT POSITIONS (Golden Template layout - 9-max with hero at bottom)
// Positions are % of container
// =============================================================================

const SEAT_CONFIGS = {
    6: [
        { id: 0, x: 50, y: 88, isHero: true, label: 'HERO' },      // Bottom center
        { id: 1, x: 12, y: 65, label: 'SB' },                       // Left lower
        { id: 2, x: 12, y: 35, label: 'BB' },                       // Left upper
        { id: 3, x: 50, y: 8, label: 'UTG' },                       // Top center
        { id: 4, x: 88, y: 35, label: 'MP' },                       // Right upper
        { id: 5, x: 88, y: 65, label: 'CO' },                       // Right lower
    ],
    9: [
        { id: 0, x: 50, y: 92, isHero: true, label: 'HERO' },       // Bottom center
        { id: 1, x: 14, y: 78, label: 'SB' },                        // Bottom left
        { id: 2, x: 6, y: 52, label: 'BB' },                         // Left mid-lower
        { id: 3, x: 8, y: 28, label: 'UTG' },                        // Left mid-upper
        { id: 4, x: 28, y: 6, label: 'UTG+1' },                      // Top left
        { id: 5, x: 72, y: 6, label: 'MP' },                         // Top right
        { id: 6, x: 92, y: 28, label: 'MP+1' },                      // Right mid-upper
        { id: 7, x: 94, y: 52, label: 'CO' },                        // Right mid-lower
        { id: 8, x: 86, y: 78, label: 'BTN' },                       // Bottom right
    ],
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PokerTableScene({
    seatCount = 6,
    seats = [],
    currentState = {},
    heroCards = null,
    onSeatClick = null,
    gameTitle = 'GTO Training',
    debugMode = false,
}) {
    const {
        street = 'preflop',
        board = [],
        potBB = 0,
        activePlayerSeatId = null,
        lastAction = null,
        stacksAfter = [],
        dealerSeatId = 0,
    } = currentState;

    // Get seat configuration
    const seatConfig = SEAT_CONFIGS[seatCount] || SEAT_CONFIGS[6];

    // Merge seat data with positions
    const seatsWithData = useMemo(() => {
        return seatConfig.map((config, i) => {
            const seatData = seats[i] || {};
            const stackInfo = stacksAfter.find(s => s.seatId === config.id);
            return {
                ...config,
                ...seatData,
                position: seatData.position || config.label,
                currentStackBB: stackInfo?.stackBB ?? seatData.startingStackBB ?? 100,
                isActive: activePlayerSeatId === config.id,
                isDealer: dealerSeatId === config.id,
                isFolded: seatData.isFolded || false,
            };
        });
    }, [seatConfig, seats, stacksAfter, activePlayerSeatId, dealerSeatId]);

    return (
        <div style={styles.container}>
            {/* ═══════════════════════════════════════════════════════════════
                GOLDEN TEMPLATE TABLE - Layered 3D Racetrack Design
            ═══════════════════════════════════════════════════════════════ */}

            {/* OUTER DARK FRAME - 3D raised effect */}
            <div style={styles.outerFrame}>
                {/* OUTER GOLD RAIL */}
                <div style={styles.outerGoldRail}>
                    {/* BLACK GAP */}
                    <div style={styles.blackGap}>
                        {/* INNER GOLD RAIL */}
                        <div style={styles.innerGoldRail}>
                            {/* THIN DARK EDGE */}
                            <div style={styles.darkEdge}>
                                {/* INNER GLOW LINE */}
                                <div style={styles.glowLine}>
                                    {/* FELT */}
                                    <div style={styles.felt}>
                                        {/* POT Display (center top) */}
                                        <div style={styles.potContainer}>
                                            <motion.div
                                                style={styles.pot}
                                                key={potBB}
                                                initial={{ scale: 0.9, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                            >
                                                <div style={styles.chipIcon} />
                                                <span style={styles.potText}>
                                                    POT {potBB.toFixed(1)}
                                                </span>
                                            </motion.div>
                                        </div>

                                        {/* Game Title (center) */}
                                        <div style={styles.gameTitle}>
                                            <div style={styles.gameTitleText}>
                                                {gameTitle}
                                            </div>
                                            <div style={styles.brandText}>
                                                Smarter.Poker
                                            </div>
                                        </div>

                                        {/* Community Cards (center, below title) */}
                                        {board.length > 0 && (
                                            <div style={styles.boardContainer}>
                                                <SceneCards
                                                    cards={board}
                                                    size="large"
                                                    showFlip={true}
                                                />
                                            </div>
                                        )}

                                        {/* Street Badge */}
                                        {street !== 'preflop' && (
                                            <div style={styles.streetBadge}>
                                                {street.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                SEATS - Positioned around table (extending OUTSIDE)
            ═══════════════════════════════════════════════════════════════ */}
            {seatsWithData.map((seat) => (
                <SceneSeat
                    key={seat.id}
                    seat={seat}
                    heroCards={seat.isHero ? heroCards : null}
                    isActive={seat.isActive}
                    isDealer={seat.isDealer}
                    lastAction={seat.isActive ? lastAction : null}
                    onClick={onSeatClick}
                    debugMode={debugMode}
                />
            ))}

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

// =============================================================================
// STYLES — Golden Template Design with Facebook Dark
// =============================================================================

const styles = {
    container: {
        position: 'relative',
        width: '100%',
        maxWidth: 500,
        aspectRatio: '5 / 4',
        margin: '0 auto',
    },

    // Outer dark frame with 3D effect
    outerFrame: {
        position: 'absolute',
        top: '12%',
        left: '8%',
        right: '8%',
        bottom: '12%',
        borderRadius: '50% / 38%',
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.mid} 0%, ${FACEBOOK_DARK.base} 50%, ${FACEBOOK_DARK.darkest} 100%)`,
        boxShadow: `
            0 25px 80px rgba(0,0,0,0.95),
            0 8px 30px rgba(0,0,0,0.8),
            inset 0 -8px 20px rgba(0,0,0,0.6),
            inset 0 8px 20px rgba(50,50,50,0.2)
        `,
    },

    // Outer gold rail
    outerGoldRail: {
        position: 'absolute',
        inset: 12,
        borderRadius: '50% / 37%',
        background: 'linear-gradient(180deg, #f0d050 0%, #d4a000 25%, #a07800 60%, #705000 100%)',
        boxShadow: `
            inset 0 3px 6px rgba(255,255,180,0.5),
            inset 0 -3px 6px rgba(0,0,0,0.5)
        `,
    },

    // Black gap between rails
    blackGap: {
        position: 'absolute',
        inset: 10,
        borderRadius: '50% / 36%',
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.base} 0%, ${FACEBOOK_DARK.darkest} 100%)`,
    },

    // Inner gold rail
    innerGoldRail: {
        position: 'absolute',
        inset: 8,
        borderRadius: '50% / 35%',
        background: 'linear-gradient(180deg, #ffe070 0%, #e8b810 25%, #b08000 60%, #785500 100%)',
        boxShadow: `
            inset 0 3px 6px rgba(255,255,180,0.6),
            inset 0 -3px 6px rgba(0,0,0,0.5)
        `,
    },

    // Thin dark edge
    darkEdge: {
        position: 'absolute',
        inset: 6,
        borderRadius: '50% / 34%',
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.base} 0%, ${FACEBOOK_DARK.darkest} 100%)`,
    },

    // Inner glow line
    glowLine: {
        position: 'absolute',
        inset: 4,
        borderRadius: '50% / 33%',
        border: '3px solid rgba(180,140,50,0.35)',
        background: 'transparent',
    },

    // Felt with radial gradient
    felt: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50% / 33%',
        background: `radial-gradient(
            ellipse at 50% 35%,
            ${FACEBOOK_DARK.mid} 0%,
            ${FACEBOOK_DARK.base} 25%,
            ${FACEBOOK_DARK.darkest} 50%,
            #0d0d0d 75%,
            #080808 100%
        )`,
        boxShadow: `
            inset 0 0 120px rgba(0,0,0,0.9),
            inset 0 0 60px rgba(0,0,0,0.7),
            inset 0 -20px 40px rgba(0,0,0,0.5)
        `,
    },

    // Pot container
    potContainer: {
        position: 'absolute',
        top: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5,
    },

    pot: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: `rgba(25,25,25,0.95)`,
        borderRadius: 14,
        padding: '5px 12px',
        border: `1px solid ${FACEBOOK_DARK.highlight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },

    chipIcon: {
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.highlight} 0%, ${FACEBOOK_DARK.mid} 100%)`,
        border: `2px solid ${FACEBOOK_DARK.light}`,
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
    },

    potText: {
        color: FACEBOOK_DARK.textPrimary,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        fontFamily: "'Inter', sans-serif",
    },

    gameTitle: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
    },

    gameTitleText: {
        fontSize: 20,
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        color: FACEBOOK_DARK.light,
        letterSpacing: 2,
        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    },

    brandText: {
        fontSize: 12,
        color: FACEBOOK_DARK.gold,
        marginTop: 4,
        textShadow: `0 0 10px ${FACEBOOK_DARK.goldGlow}`,
    },

    boardContainer: {
        position: 'absolute',
        top: '68%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        zIndex: 10,
    },

    streetBadge: {
        position: 'absolute',
        bottom: '15%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: FACEBOOK_DARK.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },

    debugOverlay: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: 'rgba(0,0,0,0.9)',
        color: '#0f0',
        fontSize: 10,
        fontFamily: 'monospace',
        padding: 6,
        borderRadius: 4,
        zIndex: 100,
    },
};
