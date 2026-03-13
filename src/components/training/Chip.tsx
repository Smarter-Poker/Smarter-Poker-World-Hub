/**
 * Chip.tsx
 * =========
 * Poker chip component with stacking animation effects.
 *
 * Features:
 * - Color-coded by denomination (Red=5, Green=25, Black=100, etc.)
 * - Stacking effect for large amounts
 * - 3D depth and shadows
 * - Animated entrance and hover effects
 *
 * @author Smarter.Poker Engineering
 */

import React from 'react';
import { motion } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface ChipProps {
    amount?: number;
    denomination?: 1 | 5 | 25 | 100 | 500 | 1000;
    size?: 'small' | 'medium' | 'large';
    animate?: boolean;
}

interface ChipStackProps {
    amount: number;
    maxChips?: number;
    size?: 'small' | 'medium' | 'large';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHIP_COLORS: Record<number, { main: string; edge: string; stripe: string }> = {
    1: { main: '#e8e8e8', edge: '#b0b0b0', stripe: '#cccccc' },      // White
    5: { main: '#dc3545', edge: '#a52a35', stripe: '#ff4757' },      // Red
    25: { main: '#28a745', edge: '#1e7b35', stripe: '#32d35a' },     // Green
    100: { main: '#1a1a2e', edge: '#0a0a1e', stripe: '#333366' },    // Black
    500: { main: '#8b5cf6', edge: '#6b3fd6', stripe: '#a78bfa' },    // Purple
    1000: { main: '#f59e0b', edge: '#d97706', stripe: '#fbbf24' },   // Gold
};

const SIZES = {
    small: { width: 24, height: 24, borderWidth: 2, fontSize: 8 },
    medium: { width: 36, height: 36, borderWidth: 3, fontSize: 11 },
    large: { width: 48, height: 48, borderWidth: 4, fontSize: 14 },
};

// ============================================================================
// GET DENOMINATION FOR AMOUNT
// ============================================================================

const getDenomination = (amount: number): number => {
    if (amount >= 1000) return 1000;
    if (amount >= 500) return 500;
    if (amount >= 100) return 100;
    if (amount >= 25) return 25;
    if (amount >= 5) return 5;
    return 1;
};

// ============================================================================
// SINGLE CHIP COMPONENT
// ============================================================================

const Chip: React.FC<ChipProps> = ({
    amount,
    denomination,
    size = 'medium',
    animate = true,
}) => {
    const denom = denomination || (amount ? getDenomination(amount) : 100);
    const colors = CHIP_COLORS[denom] || CHIP_COLORS[100];
    const dims = SIZES[size];

    const chipStyle: React.CSSProperties = {
        width: dims.width,
        height: dims.height,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${colors.main} 0%, ${colors.edge} 100%)`,
        border: `${dims.borderWidth}px solid ${colors.edge}`,
        boxShadow: `
            inset 0 2px 4px rgba(255, 255, 255, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3),
            0 2px 8px rgba(0, 0, 0, 0.4)
        `,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
    };

    const stripeStyle: React.CSSProperties = {
        position: 'absolute',
        width: '100%',
        height: dims.borderWidth,
        background: colors.stripe,
        opacity: 0.6,
    };

    const labelStyle: React.CSSProperties = {
        fontSize: dims.fontSize,
        fontWeight: 700,
        color: denom === 1 ? '#333' : '#fff',
        textShadow: denom === 1 ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.5)',
        zIndex: 1,
    };

    return (
        <motion.div
            style={chipStyle}
            initial={animate ? { scale: 0, rotate: -180 } : {}}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200 }}
            whileHover={{ scale: 1.1, y: -2 }}
        >
            {/* Decorative stripes */}
            <div style={{ ...stripeStyle, top: '20%' }} />
            <div style={{ ...stripeStyle, bottom: '20%' }} />

            {/* Amount label */}
            <span style={labelStyle}>
                {amount ? formatChipAmount(amount) : denom}
            </span>
        </motion.div>
    );
};

// ============================================================================
// CHIP STACK COMPONENT
// ============================================================================

export const ChipStack: React.FC<ChipStackProps> = ({
    amount,
    maxChips = 5,
    size = 'medium',
}) => {
    const dims = SIZES[size];
    const stackHeight = Math.min(Math.ceil(amount / 100), maxChips);
    const chipOffset = 3;

    return (
        <div style={{
            position: 'relative',
            width: dims.width,
            height: dims.height + (stackHeight - 1) * chipOffset,
        }}>
            {Array.from({ length: stackHeight }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                        position: 'absolute',
                        bottom: i * chipOffset,
                        left: 0,
                    }}
                >
                    <Chip
                        denomination={getDenomination(amount) as any}
                        size={size}
                        animate={false}
                    />
                </motion.div>
            ))}
            {/* Amount label on top */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: stackHeight * 0.05 + 0.1 }}
                style={{
                    position: 'absolute',
                    bottom: stackHeight * chipOffset + dims.height / 2,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.8)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: dims.fontSize,
                    fontWeight: 700,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                }}
            >
                {formatChipAmount(amount)}
            </motion.div>
        </div>
    );
};

// ============================================================================
// POT DISPLAY COMPONENT
// ============================================================================

interface PotDisplayProps {
    amount: number;
    animate?: boolean;
}

export const PotDisplay: React.FC<PotDisplayProps> = ({
    amount,
    animate = true,
}) => {
    return (
        <motion.div
            initial={animate ? { scale: 0 } : {}}
            animate={{ scale: 1 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: 'rgba(0, 0, 0, 0.7)',
                borderRadius: 20,
                border: '1px solid rgba(255, 215, 0, 0.4)',
            }}
        >
            <span style={{ fontSize: 16 }}>🏆</span>
            <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#ffd700',
            }}>
                POT {formatChipAmount(amount)}
            </span>
        </motion.div>
    );
};

// ============================================================================
// HELPERS
// ============================================================================

const formatChipAmount = (amount: number): string => {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
};

export default Chip;
