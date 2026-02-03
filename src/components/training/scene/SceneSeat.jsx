/**
 * 🎮 Scene Seat — Golden Template Avatar System
 * ═══════════════════════════════════════════════════════════════════
 * Renders player seats with:
 * - Large illustrated avatars (extending OUTSIDE table)
 * - Gold name badges below avatars
 * - Action tags (PokerBros colors)
 * - Dealer button
 * - Facebook Dark palette
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SceneCards from './SceneCards';
import { ACTION_COLORS, FACEBOOK_DARK } from '../../../hooks/useTrainingTheme';

// =============================================================================
// AVATAR IMAGES (illustrated characters)
// =============================================================================

const AVATAR_IMAGES = {
    hero: '/avatars/table/free_fox.png',
    0: '/avatars/table/free_fox.png',
    1: '/avatars/table/vip_viking_warrior.png',
    2: '/avatars/table/free_wizard.png',
    3: '/avatars/table/free_ninja.png',
    4: '/avatars/table/vip_wolf.png',
    5: '/avatars/table/vip_spartan.png',
    6: '/avatars/table/vip_pharaoh.png',
    7: '/avatars/table/free_cowboy.png',
    8: '/avatars/table/free_pirate.png',
};

// =============================================================================
// ACTION TAG COMPONENT (PokerBros style)
// =============================================================================

function ActionTag({ action, amount }) {
    if (!action) return null;

    const actionKey = action.toLowerCase().replace('-', '_');
    const colorConfig = ACTION_COLORS[actionKey] || ACTION_COLORS.fold;

    // Format label with amount if applicable
    let label = colorConfig.label;
    if (amount && amount > 0 && ['bet', 'raise', 'call'].includes(actionKey)) {
        label = `${colorConfig.label} ${amount}BB`;
    }

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
                position: 'absolute',
                top: -32,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: colorConfig.bg,
                color: colorConfig.text,
                padding: '5px 12px',
                borderRadius: 14,
                fontSize: 11,
                fontWeight: 'bold',
                fontFamily: "'Inter', sans-serif",
                whiteSpace: 'nowrap',
                boxShadow: `0 2px 10px rgba(0,0,0,0.4), 0 0 15px ${colorConfig.bg}50`,
                zIndex: 100,
            }}
        >
            {label}
        </motion.div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SceneSeat({
    seat = {},
    heroCards = null,
    isActive = false,
    isDealer = false,
    lastAction = null,
    onClick = null,
    debugMode = false,
}) {
    const {
        id: seatId = 0,
        x = 50,
        y = 50,
        isHero = false,
        position = 'V',
        currentStackBB = 100,
        isFolded = false,
    } = seat;

    const avatarSize = isHero ? 90 : 75;
    const avatarImage = AVATAR_IMAGES[seatId] || AVATAR_IMAGES[0];

    return (
        <motion.div
            style={{
                ...styles.seatContainer,
                left: `${x}%`,
                top: `${y}%`,
                zIndex: isHero ? 100 : 50,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: seatId * 0.05 }}
            onClick={() => onClick?.(seatId)}
        >
            {/* Action Tag (above avatar) */}
            <AnimatePresence>
                {lastAction && (
                    <ActionTag
                        action={lastAction.action || lastAction}
                        amount={lastAction.amountBB || lastAction.amount}
                    />
                )}
            </AnimatePresence>

            {/* Avatar Container */}
            <motion.div
                style={{
                    ...styles.avatarContainer,
                    width: avatarSize,
                    height: avatarSize * 1.2,
                }}
                animate={isActive ? {
                    boxShadow: [
                        `0 0 0 3px ${FACEBOOK_DARK.primary}`,
                        `0 0 20px 5px ${FACEBOOK_DARK.primaryGlow}`,
                        `0 0 0 3px ${FACEBOOK_DARK.primary}`,
                    ]
                } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
            >
                <img
                    src={avatarImage}
                    alt={position}
                    style={{
                        ...styles.avatarImage,
                        filter: isFolded ? 'grayscale(100%) brightness(0.5)' : 'none',
                    }}
                    onError={(e) => {
                        e.target.src = '/avatars/default.png';
                    }}
                />
            </motion.div>

            {/* Gold Name Badge (below avatar) */}
            <motion.div
                style={styles.nameBadge}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
            >
                <div style={styles.playerName}>
                    {isHero ? 'HERO' : position}
                </div>
                <div style={styles.stackAmount}>
                    {currentStackBB.toFixed(0)} BB
                </div>
            </motion.div>

            {/* Dealer Button */}
            {isDealer && (
                <motion.div
                    style={styles.dealerButton}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                >
                    D
                </motion.div>
            )}

            {/* Hero Cards (displayed next to hero seat) */}
            {isHero && heroCards && heroCards.length > 0 && (
                <div style={styles.heroCardsContainer}>
                    <SceneCards cards={heroCards} size="medium" />
                </div>
            )}

            {/* Debug Label */}
            {debugMode && (
                <div style={styles.debugLabel}>
                    S{seatId} | {x},{y}
                </div>
            )}
        </motion.div>
    );
}

// =============================================================================
// STYLES — Golden Template with Facebook Dark
// =============================================================================

const styles = {
    seatContainer: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
    },

    avatarContainer: {
        position: 'relative',
        borderRadius: 8,
        overflow: 'visible',
    },

    avatarImage: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        transition: 'filter 0.3s ease',
    },

    nameBadge: {
        background: 'linear-gradient(180deg, #f0c040 0%, #c4960a 100%)',
        border: '2px solid #8b6914',
        borderRadius: 6,
        padding: '3px 14px',
        marginTop: -8,
        minWidth: 70,
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },

    playerName: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#000',
        textShadow: '0 1px 0 rgba(255,255,255,0.3)',
        whiteSpace: 'nowrap',
        fontFamily: "'Inter', sans-serif",
    },

    stackAmount: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#1a1a00',
        fontFamily: "'Inter', sans-serif",
    },

    dealerButton: {
        position: 'absolute',
        bottom: 45,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: '#ffffff',
        border: `2px solid ${FACEBOOK_DARK.mid}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 'bold',
        color: '#000',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        zIndex: 200,
    },

    heroCardsContainer: {
        position: 'absolute',
        bottom: -60,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: -10,
        zIndex: 150,
    },

    debugLabel: {
        position: 'absolute',
        top: -40,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 8,
        color: '#0f0',
        fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.9)',
        padding: '2px 6px',
        borderRadius: 3,
        zIndex: 200,
    },
};
