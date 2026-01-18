/**
 * 🎬 OPENING CHOREOGRAPHY - Premium Hand Start Sequence
 * 
 * Hearthstone/PokerStars quality animation system.
 * Executes a timed script every time a new hand loads.
 * 
 * TIMELINE:
 * T=0.0s - Setup: Clear board, shuffle sound, dealer button slides
 * T=0.5s - Deal: Cards fly from center to all seats
 * T=1.0s - Blinds: Chips slide to center
 * T=1.5s - Action: First player ring lights up
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ChoreographyPhase =
    | 'idle'
    | 'setup'
    | 'dealing'
    | 'blinds'
    | 'action';

export interface ChoreographyState {
    phase: ChoreographyPhase;
    timestamp: number;
    dealerButtonTarget: number;
    cardsDealt: Set<number>;
    blindsPosted: boolean;
    activePlayer: number | null;
}

export interface SoundEffects {
    shuffle?: HTMLAudioElement;
    cardWhip?: HTMLAudioElement;
    chipClick?: HTMLAudioElement;
    actionStart?: HTMLAudioElement;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

// Card dealing animation - flies from center with easeOutBack
export const cardDealVariants: Variants = {
    initial: {
        x: 0,
        y: 0,
        scale: 0.3,
        opacity: 0,
        rotateY: 180,
    },
    dealt: (custom: { targetX: number; targetY: number; delay: number }) => ({
        x: custom.targetX,
        y: custom.targetY,
        scale: 1,
        opacity: 1,
        rotateY: 0,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 25,
            delay: custom.delay,
            duration: 0.4,
        }
    }),
    exit: {
        opacity: 0,
        scale: 0.8,
        transition: { duration: 0.2 }
    }
};

// Dealer button slide animation
export const dealerButtonVariants: Variants = {
    initial: (custom: { fromX: number; fromY: number }) => ({
        x: custom.fromX,
        y: custom.fromY,
        scale: 1,
        opacity: 1,
    }),
    slide: (custom: { toX: number; toY: number }) => ({
        x: custom.toX,
        y: custom.toY,
        scale: 1,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 200,
            damping: 20,
            duration: 0.5,
        }
    })
};

// Chip animation - slides to center
export const chipSlideVariants: Variants = {
    initial: (custom: { startX: number; startY: number }) => ({
        x: custom.startX,
        y: custom.startY,
        scale: 1,
        opacity: 1,
    }),
    posted: {
        x: 0,
        y: 0,
        scale: 0.8,
        opacity: 1,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 20,
            duration: 0.3,
        }
    }
};

// Active player ring animation
export const activeRingVariants: Variants = {
    inactive: {
        opacity: 0,
        scale: 0.9,
        boxShadow: '0 0 0 0 rgba(245, 158, 11, 0)',
    },
    active: {
        opacity: 1,
        scale: 1,
        boxShadow: [
            '0 0 0 0 rgba(245, 158, 11, 0.8)',
            '0 0 20px 10px rgba(245, 158, 11, 0.4)',
            '0 0 0 0 rgba(245, 158, 11, 0)'
        ],
        transition: {
            boxShadow: {
                repeat: Infinity,
                duration: 1.5,
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CHOREOGRAPHY HOOK
// ═══════════════════════════════════════════════════════════════════════════

interface UseChoreographyOptions {
    dealerSeat: number;
    playerSeats: number[];
    heroSeat: number;
    onPhaseComplete?: (phase: ChoreographyPhase) => void;
    onChoreographyComplete?: () => void;
    soundEnabled?: boolean;
}

export function useOpeningChoreography({
    dealerSeat,
    playerSeats,
    heroSeat,
    onPhaseComplete,
    onChoreographyComplete,
    soundEnabled = true
}: UseChoreographyOptions) {
    const [state, setState] = useState<ChoreographyState>({
        phase: 'idle',
        timestamp: 0,
        dealerButtonTarget: dealerSeat,
        cardsDealt: new Set(),
        blindsPosted: false,
        activePlayer: null
    });

    const soundsRef = useRef<SoundEffects>({});
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // Preload sounds
    useEffect(() => {
        if (typeof window !== 'undefined' && soundEnabled) {
            soundsRef.current = {
                shuffle: new Audio('/audio/deck_shuffle_riffle.mp3'),
                cardWhip: new Audio('/audio/card_whip_loud.mp3'),
                chipClick: new Audio('/audio/chip_single_click.mp3'),
                actionStart: new Audio('/audio/action_start.mp3'),
            };

            // Preload all sounds
            Object.values(soundsRef.current).forEach(audio => {
                if (audio) {
                    audio.volume = 0.5;
                    audio.load();
                }
            });
        }

        return () => {
            // Cleanup timeouts
            timeoutsRef.current.forEach(clearTimeout);
        };
    }, [soundEnabled]);

    const playSound = useCallback((soundKey: keyof SoundEffects) => {
        const audio = soundsRef.current[soundKey];
        if (audio && soundEnabled) {
            audio.currentTime = 0;
            audio.play().catch(() => { }); // Ignore autoplay restrictions
        }
    }, [soundEnabled]);

    const clearTimeouts = useCallback(() => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
    }, []);

    // Main choreography execution
    const startChoreography = useCallback(() => {
        clearTimeouts();
        const startTime = Date.now();

        // ═══ T = 0.0s: SETUP ═══
        setState(prev => ({
            ...prev,
            phase: 'setup',
            timestamp: 0,
            cardsDealt: new Set(),
            blindsPosted: false,
            activePlayer: null
        }));
        playSound('shuffle');
        onPhaseComplete?.('setup');

        // ═══ T = 0.5s: DEALING ═══
        const dealTimeout = setTimeout(() => {
            setState(prev => ({ ...prev, phase: 'dealing', timestamp: 500 }));
            playSound('cardWhip');
            onPhaseComplete?.('dealing');

            // Stagger card deals
            playerSeats.forEach((seat, index) => {
                const cardTimeout = setTimeout(() => {
                    setState(prev => ({
                        ...prev,
                        cardsDealt: new Set([...prev.cardsDealt, seat])
                    }));
                }, index * 50); // 50ms stagger
                timeoutsRef.current.push(cardTimeout);
            });
        }, 500);
        timeoutsRef.current.push(dealTimeout);

        // ═══ T = 1.0s: BLINDS ═══
        const blindsTimeout = setTimeout(() => {
            setState(prev => ({
                ...prev,
                phase: 'blinds',
                timestamp: 1000,
                blindsPosted: true
            }));
            playSound('chipClick');
            onPhaseComplete?.('blinds');
        }, 1000);
        timeoutsRef.current.push(blindsTimeout);

        // ═══ T = 1.5s: ACTION ═══
        const actionTimeout = setTimeout(() => {
            // Find first active player (not hero, not dealer)
            const firstActive = playerSeats.find(seat => seat !== heroSeat);

            setState(prev => ({
                ...prev,
                phase: 'action',
                timestamp: 1500,
                activePlayer: firstActive ?? null
            }));
            playSound('actionStart');
            onPhaseComplete?.('action');
            onChoreographyComplete?.();
        }, 1500);
        timeoutsRef.current.push(actionTimeout);

    }, [dealerSeat, playerSeats, heroSeat, playSound, onPhaseComplete, onChoreographyComplete, clearTimeouts]);

    const reset = useCallback(() => {
        clearTimeouts();
        setState({
            phase: 'idle',
            timestamp: 0,
            dealerButtonTarget: dealerSeat,
            cardsDealt: new Set(),
            blindsPosted: false,
            activePlayer: null
        });
    }, [dealerSeat, clearTimeouts]);

    return {
        state,
        startChoreography,
        reset,
        isComplete: state.phase === 'action',
        isPlaying: state.phase !== 'idle' && state.phase !== 'action'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface AnimatedCardProps {
    cardCode: string;
    isVisible: boolean;
    isFaceDown?: boolean;
    targetX: number;
    targetY: number;
    delay: number;
    cardIndex: number;
}

export function AnimatedCard({
    cardCode,
    isVisible,
    isFaceDown = false,
    targetX,
    targetY,
    delay,
    cardIndex
}: AnimatedCardProps) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    custom={{ targetX, targetY, delay }}
                    variants={cardDealVariants}
                    initial="initial"
                    animate="dealt"
                    exit="exit"
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: '55px',
                        height: '75px',
                        marginLeft: '-27.5px',
                        marginTop: '-37.5px',
                        perspective: '1000px'
                    }}
                >
                    <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '6px',
                        background: isFaceDown
                            ? 'linear-gradient(135deg, #1a1a3a, #0a0a2a)'
                            : 'linear-gradient(135deg, #fff, #f0f0f0)',
                        border: '2px solid rgba(255,255,255,0.2)',
                        boxShadow: `
                            0 5px 15px rgba(0,0,0,0.4),
                            inset 0 1px 0 rgba(255,255,255,0.2)
                        `,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isFaceDown ? '16px' : '14px',
                        fontWeight: 700,
                        color: isFaceDown ? '#333' : getCardColor(cardCode)
                    }}>
                        {isFaceDown ? '🂠' : formatCardDisplay(cardCode)}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED CHIP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface AnimatedChipProps {
    amount: number;
    startX: number;
    startY: number;
    isPosted: boolean;
    delay?: number;
}

export function AnimatedChip({
    amount,
    startX,
    startY,
    isPosted,
    delay = 0
}: AnimatedChipProps) {
    return (
        <motion.div
            custom={{ startX, startY }}
            variants={chipSlideVariants}
            initial="initial"
            animate={isPosted ? "posted" : "initial"}
            transition={{ delay }}
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                marginLeft: '-20px',
                marginTop: '-20px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                border: '3px solid #fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                color: '#fff'
            }}
        >
            {amount}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEALER BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface AnimatedDealerButtonProps {
    targetX: number;
    targetY: number;
    previousX?: number;
    previousY?: number;
}

export function AnimatedDealerButton({
    targetX,
    targetY,
    previousX = targetX,
    previousY = targetY
}: AnimatedDealerButtonProps) {
    return (
        <motion.div
            custom={{ fromX: previousX, fromY: previousY, toX: targetX, toY: targetY }}
            variants={dealerButtonVariants}
            initial="initial"
            animate="slide"
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '32px',
                height: '32px',
                marginLeft: '-16px',
                marginTop: '-16px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                border: '3px solid #fff',
                boxShadow: `
                    0 0 15px rgba(255, 215, 0, 0.6),
                    0 4px 12px rgba(0,0,0,0.3)
                `,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 900,
                color: '#000',
                zIndex: 100
            }}
        >
            D
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE PLAYER RING
// ═══════════════════════════════════════════════════════════════════════════

interface ActivePlayerRingProps {
    isActive: boolean;
    size?: number;
}

export function ActivePlayerRing({ isActive, size = 80 }: ActivePlayerRingProps) {
    return (
        <motion.div
            variants={activeRingVariants}
            animate={isActive ? 'active' : 'inactive'}
            style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '50%',
                border: '3px solid #f59e0b',
                pointerEvents: 'none',
                left: '50%',
                top: '50%',
                marginLeft: -size / 2,
                marginTop: -size / 2
            }}
        />
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getCardColor(cardCode: string): string {
    if (!cardCode || cardCode.length < 2) return '#000';
    const suit = cardCode.charAt(1).toLowerCase();
    return (suit === 'h' || suit === 'd') ? '#dc2626' : '#1a1a2e';
}

function formatCardDisplay(cardCode: string): string {
    if (!cardCode || cardCode.length < 2) return '?';
    const rank = cardCode.charAt(0);
    const suit = cardCode.charAt(1).toLowerCase();
    const suitSymbols: Record<string, string> = { 'h': '♥', 'd': '♦', 'c': '♣', 's': '♠' };
    return `${rank}${suitSymbols[suit] || '?'}`;
}

export default useOpeningChoreography;
