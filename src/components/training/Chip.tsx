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
    amount: number;
    size?: 'small' | 'medium' | 'large';
    showAmount?: boolean;
    animate?: boolean;
    delay?: number;
    onClick?: () => void;
}

interface ChipStackProps {
    amount: number;
    size?: 'small' | 'medium' | 'large';
    maxChips?: number;
    animate?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Chip denominations and colors (standard casino colors)
const CHIP_DENOMINATIONS = [
    { value: 1, color: '#FFFFFF', borderColor: '#CCCCCC', textColor: '#333333', label: '1' },
    { value: 5, color: '#E53935', borderColor: '#B71C1C', textColor: '#FFFFFF', label: '5' },
    { value: 25, color: '#43A047', borderColor: '#1B5E20', textColor: '#FFFFFF', label: '25' },
    { value: 100, color: '#212121', borderColor: '#000000', textColor: '#FFFFFF', label: '100' },
    { value: 500, color: '#7B1FA2', borderColor: '#4A148C', textColor: '#FFFFFF', label: '500' },
    { value: 1000, color: '#FF8F00', borderColor: '#E65100', textColor: '#000000', label: '1K' },
    { value: 5000, color: '#F06292', borderColor: '#AD1457', textColor: '#FFFFFF', label: '5K' },
    { value: 10000, color: '#FFD700', borderColor: '#B8860B', textColor: '#000000', label: '10K' },
];

const SIZE_CONFIG = {
    small: { diameter: 32, fontSize: 10, borderWidth: 2, stackOffset: 2 },
    medium: { diameter: 48, fontSize: 14, borderWidth: 3, stackOffset: 3 },
    large: { diameter: 64, fontSize: 18, borderWidth: 4, stackOffset: 4 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getChipConfig = (amount: number) => {
    // Find the largest denomination that fits
    for (let i = CHIP_DENOMINATIONS.length - 1; i >= 0; i--) {
        if (amount >= CHIP_DENOMINATIONS[i].value) {
            return CHIP_DENOMINATIONS[i];
        }
    }
    return CHIP_DENOMINATIONS[0]; // Default to lowest
};

const formatAmount = (amount: number): string => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
    return amount.toString();
};

// ============================================================================
// SINGLE CHIP COMPONENT
// ============================================================================

const SingleChip: React.FC<{
    color: string;
    borderColor: string;
    textColor: string;
    label: string;
    size: typeof SIZE_CONFIG.medium;
    showAmount?: boolean;
    amount?: number;
    offset?: number;
    animate?: boolean;
    delay?: number;
    onClick?: () => void;
}> = ({
    color,
    borderColor,
    textColor,
    label,
    size,
    showAmount = false,
    amount,
    offset = 0,
    animate = true,
    delay = 0,
    onClick,
}) => {
    const chipVariants = {
        hidden: { opacity: 0, scale: 0.5, y: 20 },
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
                delay,
                duration: 0.3,
                type: 'spring',
                stiffness: 300,
                damping: 20,
            },
        },
    };

    return (
        <motion.div
            initial={animate ? 'hidden' : undefined}
            animate="visible"
            variants={animate ? chipVariants : undefined}
            whileHover={onClick ? { scale: 1.1, y: -5 } : undefined}
            whileTap={onClick ? { scale: 0.95 } : undefined}
            onClick={onClick}
            style={{
                width: size.diameter,
                height: size.diameter,
                borderRadius: '50%',
                background: `radial-gradient(circle at 30% 30%, ${color}, ${borderColor})`,
                border: `${size.borderWidth}px solid ${borderColor}`,
                boxShadow: `
                    inset 0 2px 4px rgba(255,255,255,0.3),
                    inset 0 -2px 4px rgba(0,0,0,0.2),
                    0 ${4 + offset}px ${8 + offset * 2}px rgba(0,0,0,0.4)
                `,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: onClick ? 'pointer' : 'default',
                marginTop: offset > 0 ? -size.diameter + size.stackOffset : 0,
            }}
        >
            {/* Outer ring pattern */}
            <div style={{
                position: 'absolute',
                inset: 3,
                borderRadius: '50%',
                border: `2px dashed rgba(255,255,255,0.3)`,
            }} />

            {/* Inner circle */}
            <div style={{
                width: size.diameter * 0.6,
                height: size.diameter * 0.6,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${color}, ${borderColor})`,
                border: `1px solid rgba(255,255,255,0.2)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
            }}>
                <span style={{
                    fontSize: size.fontSize,
                    fontWeight: 900,
                    color: textColor,
                    textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    {showAmount && amount ? formatAmount(amount) : label}
                </span>
            </div>

            {/* Edge notches (decorative) */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <div
                    key={angle}
                    style={{
                        position: 'absolute',
                        width: 4,
                        height: 8,
                        background: 'rgba(255,255,255,0.4)',
                        borderRadius: 2,
                        transform: `rotate(${angle}deg) translateY(-${size.diameter / 2 - 2}px)`,
                    }}
                />
            ))}
        </motion.div>
    );
};

// ============================================================================
// MAIN CHIP COMPONENT
// ============================================================================

const Chip: React.FC<ChipProps> = ({
    amount,
    size = 'medium',
    showAmount = true,
    animate = true,
    delay = 0,
    onClick,
}) => {
    const sizeConfig = SIZE_CONFIG[size];
    const chipConfig = getChipConfig(amount);

    return (
        <SingleChip
            color={chipConfig.color}
            borderColor={chipConfig.borderColor}
            textColor={chipConfig.textColor}
            label={chipConfig.label}
            size={sizeConfig}
            showAmount={showAmount}
            amount={amount}
            animate={animate}
            delay={delay}
            onClick={onClick}
        />
    );
};

// ============================================================================
// CHIP STACK COMPONENT
// ============================================================================

export const ChipStack: React.FC<ChipStackProps> = ({
    amount,
    size = 'medium',
    maxChips = 5,
    animate = true,
}) => {
    const sizeConfig = SIZE_CONFIG[size];

    // Calculate how many chips to show based on amount
    const getStackCount = (amt: number): number => {
        if (amt >= 10000) return maxChips;
        if (amt >= 5000) return Math.min(4, maxChips);
        if (amt >= 1000) return Math.min(3, maxChips);
        if (amt >= 500) return Math.min(2, maxChips);
        return 1;
    };

    const stackCount = getStackCount(amount);
    const chipConfig = getChipConfig(amount);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
        }}>
            {/* Stacked chips */}
            {[...Array(stackCount)].map((_, index) => (
                <SingleChip
                    key={index}
                    color={chipConfig.color}
                    borderColor={chipConfig.borderColor}
                    textColor={chipConfig.textColor}
                    label={chipConfig.label}
                    size={sizeConfig}
                    showAmount={index === stackCount - 1}
                    amount={amount}
                    offset={index * sizeConfig.stackOffset}
                    animate={animate}
                    delay={index * 0.05}
                />
            ))}

            {/* Amount label below stack */}
            <motion.div
                initial={animate ? { opacity: 0, y: 10 } : undefined}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stackCount * 0.05 + 0.1 }}
                style={{
                    marginTop: 8,
                    padding: '4px 8px',
                    background: 'rgba(0,0,0,0.7)',
                    borderRadius: 4,
                    fontSize: sizeConfig.fontSize * 0.85,
                    fontWeight: 700,
                    color: '#FFD700',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
            >
                {formatAmount(amount)}
            </motion.div>
        </div>
    );
};

// ============================================================================
// POT DISPLAY COMPONENT
// ============================================================================

export const PotDisplay: React.FC<{
    amount: number;
    label?: string;
    size?: 'small' | 'medium' | 'large';
    animate?: boolean;
}> = ({ amount, label = 'POT', size = 'medium', animate = true }) => {
    const sizeConfig = SIZE_CONFIG[size];

    return (
        <motion.div
            initial={animate ? { opacity: 0, scale: 0.8 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
            }}
        >
            {/* Chip icon */}
            <div style={{
                display: 'flex',
                gap: -8,
            }}>
                <Chip amount={Math.max(100, amount / 3)} size={size} showAmount={false} animate={animate} />
                <div style={{ marginLeft: -sizeConfig.diameter * 0.3 }}>
                    <Chip amount={Math.max(100, amount / 2)} size={size} showAmount={false} animate={animate} delay={0.1} />
                </div>
            </div>

            {/* Pot amount */}
            <div style={{
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: sizeConfig.fontSize * 0.7,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                }}>
                    {label}
                </div>
                <div style={{
                    fontSize: sizeConfig.fontSize * 1.4,
                    fontWeight: 900,
                    color: '#FFD700',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}>
                    {formatAmount(amount)}
                </div>
            </div>
        </motion.div>
    );
};

// ============================================================================
// BET INDICATOR COMPONENT
// ============================================================================

export const BetIndicator: React.FC<{
    amount: number;
    position?: 'top' | 'bottom' | 'left' | 'right';
    size?: 'small' | 'medium' | 'large';
    animate?: boolean;
}> = ({ amount, position = 'bottom', size = 'small', animate = true }) => {
    const sizeConfig = SIZE_CONFIG[size];

    const positionStyles: Record<string, React.CSSProperties> = {
        top: { flexDirection: 'column-reverse' },
        bottom: { flexDirection: 'column' },
        left: { flexDirection: 'row-reverse' },
        right: { flexDirection: 'row' },
    };

    return (
        <motion.div
            initial={animate ? { opacity: 0, scale: 0.5 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                ...positionStyles[position],
            }}
        >
            <Chip amount={amount} size={size} showAmount={false} animate={false} />
            <span style={{
                fontSize: sizeConfig.fontSize,
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.5)',
                borderRadius: 4,
            }}>
                {formatAmount(amount)}
            </span>
        </motion.div>
    );
};

export default Chip;
