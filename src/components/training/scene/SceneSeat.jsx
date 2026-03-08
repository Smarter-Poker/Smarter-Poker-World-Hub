/**
 * Scene Seat — Professional Layout
 * ═══════════════════════════════════════════════════════════════════
 * Clean player seats with:
 * - Small circular avatar (40px)
 * - Position label (BTN, SB, BB, UTG, MP, CO)
 * - Stack display
 * - Action tag above
 * - Hero cards BELOW hero seat (largest)
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SceneCards from './SceneCards';

// Action colors per Online Poker Flow skill
const ACTION_COLORS = {
    fold: { bg: '#6b7280', text: '#fff', label: 'Fold' },
    check: { bg: '#3b82f6', text: '#fff', label: 'Check' },
    call: { bg: '#22c55e', text: '#fff', label: 'Call' },
    bet: { bg: '#eab308', text: '#000', label: 'Bet' },
    raise: { bg: '#eab308', text: '#000', label: 'Raise' },
    allin: { bg: '#a855f7', text: '#fff', label: 'All-In' },
    post: { bg: '#22c55e', text: '#fff', label: 'Post' },
};

function ActionTag({ action, amount }) {
    if (!action) return null;

    const key = action.toLowerCase().replace(/[-_\s]/g, '');
    const style = ACTION_COLORS[key] || ACTION_COLORS.fold;

    let label = style.label;
    if (amount && amount > 0) {
        label = `${style.label} ${amount}`;
    }

    return (
        <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: -10 }}
            style={{
                position: 'absolute',
                top: -24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: style.bg,
                color: style.text,
                padding: '3px 10px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                zIndex: 100,
            }}
        >
            {label}
        </motion.div>
    );
}

export default function SceneSeat({
    seat = {},
    heroCards = null,
    isActive = false,
    isDealer = false,
    lastAction = null,
    onClick = null,
}) {
    const {
        id: seatId = 0,
        x = 50,
        y = 50,
        isHero = false,
        position = 'P1',
        currentStackBB = 100,
        isFolded = false,
    } = seat;

    return (
        <motion.div
            style={{
                ...styles.wrapper,
                left: `${x}%`,
                top: `${y}%`,
                opacity: isFolded ? 0.4 : 1,
                zIndex: isHero ? 50 : 20,
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1, opacity: isFolded ? 0.4 : 1 }}
            transition={{ duration: 0.2, delay: seatId * 0.03 }}
            onClick={() => onClick?.(seatId)}
        >
            {/* Action Tag */}
            <AnimatePresence>
                {lastAction && (
                    <ActionTag
                        action={lastAction.action || lastAction}
                        amount={lastAction.amountBB}
                    />
                )}
            </AnimatePresence>

            {/* Avatar Circle */}
            <div
                style={{
                    ...styles.avatar,
                    width: isHero ? 44 : 38,
                    height: isHero ? 44 : 38,
                    borderColor: isActive ? '#f59e0b' : isHero ? '#3b82f6' : '#555',
                    boxShadow: isActive ? '0 0 12px rgba(245,158,11,0.5)' : 'none',
                }}
            >
                <span style={styles.avatarLetter}>
                    {position.charAt(0)}
                </span>
            </div>

            {/* Stack Box */}
            <div style={styles.infoBox}>
                <span style={styles.posLabel}>{position}</span>
                <span style={styles.stackLabel}>{currentStackBB.toFixed(0)} BB</span>
            </div>

            {/* Dealer Button */}
            {isDealer && <div style={styles.dealer}>D</div>}

            {/* HERO CARDS — largest, below hero seat */}
            {isHero && heroCards && heroCards.length > 0 && (
                <div style={styles.heroCards}>
                    <SceneCards cards={heroCards} size="xlarge" />
                </div>
            )}
        </motion.div>
    );
}

const styles = {
    wrapper: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
    },

    avatar: {
        borderRadius: '50%',
        background: 'linear-gradient(180deg, #333 0%, #1a1a1a 100%)',
        border: '3px solid',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    avatarLetter: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },

    infoBox: {
        marginTop: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.75)',
        padding: '3px 10px',
        borderRadius: 6,
        minWidth: 50,
    },

    posLabel: {
        color: '#888',
        fontSize: 9,
        fontWeight: '600',
        textTransform: 'uppercase',
    },

    stackLabel: {
        color: '#f59e0b',
        fontSize: 12,
        fontWeight: 'bold',
    },

    dealer: {
        position: 'absolute',
        top: 0,
        right: -10,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    },

    heroCards: {
        marginTop: 8,
        display: 'flex',
        gap: 4,
    },
};
