/**
 * 🎬 HAND START SEQUENCE - Integrated Choreography Wrapper
 * 
 * Wraps the Director component with premium opening animations.
 * Executes the full choreography before handing control to the game.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    useOpeningChoreography,
    AnimatedCard,
    AnimatedChip,
    AnimatedDealerButton,
    ActivePlayerRing,
    type ChoreographyPhase
} from './OpeningChoreography';
import { SEAT_LAYOUTS, type TableSize } from '../../lib/SeatLayouts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Player {
    seat: number;
    name: string;
    stack: number;
    isHero: boolean;
    holeCards?: string[];
    currentBet: number;
}

interface HandStartSequenceProps {
    players: Player[];
    tableSize: TableSize;
    buttonSeat: number;
    heroSeat: number;
    sbSeat: number;
    bbSeat: number;
    smallBlind: number;
    bigBlind: number;
    onChoreographyComplete: () => void;
    children: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
    orange: '#f59e0b',
    cyan: '#00d4ff',
    gold: '#FFD700',
    darkBg: '#0a0a1a'
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HandStartSequence({
    players,
    tableSize,
    buttonSeat,
    heroSeat,
    sbSeat,
    bbSeat,
    smallBlind,
    bigBlind,
    onChoreographyComplete,
    children
}: HandStartSequenceProps) {
    const [showOverlay, setShowOverlay] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    // Get seat positions
    const seatLayout = SEAT_LAYOUTS[tableSize];
    const playerSeats = players.map(p => p.seat);

    // Initialize choreography hook
    const {
        state,
        startChoreography,
        isComplete
    } = useOpeningChoreography({
        dealerSeat: buttonSeat,
        playerSeats,
        heroSeat,
        onChoreographyComplete: () => {
            setTimeout(() => {
                setShowOverlay(false);
                onChoreographyComplete();
            }, 300);
        },
        soundEnabled: true
    });

    // Start choreography on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            startChoreography();
        }, 200); // Brief pause before starting

        return () => clearTimeout(timer);
    }, [startChoreography]);

    // Calculate pixel positions from percentages
    const getPixelPosition = useCallback((seat: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const layout = seatLayout[seat];
        if (!layout) return { x: 0, y: 0 };

        return {
            x: (layout.x / 100) * rect.width - rect.width / 2,
            y: (layout.y / 100) * rect.height - rect.height / 2
        };
    }, [seatLayout]);

    // Get hero's cards
    const heroPlayer = players.find(p => p.seat === heroSeat);
    const heroCards = heroPlayer?.holeCards || ['Ah', 'Kh']; // Default to AKs for demo

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                overflow: 'hidden'
            }}
        >
            {/* Game content (hidden during choreography) */}
            <div style={{
                opacity: showOverlay ? 0 : 1,
                transition: 'opacity 0.3s ease-out',
                width: '100%',
                height: '100%'
            }}>
                {children}
            </div>

            {/* Choreography Overlay */}
            <AnimatePresence>
                {showOverlay && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'transparent',
                            pointerEvents: 'none',
                            zIndex: 1000
                        }}
                    >
                        {/* Phase Indicator (Debug) */}
                        {process.env.NODE_ENV === 'development' && (
                            <div style={{
                                position: 'absolute',
                                top: 10,
                                left: 10,
                                padding: '4px 10px',
                                background: 'rgba(0,0,0,0.8)',
                                borderRadius: '4px',
                                color: COLORS.cyan,
                                fontSize: '10px',
                                fontWeight: 700,
                                zIndex: 1001
                            }}>
                                Phase: {state.phase} | T={state.timestamp}ms
                            </div>
                        )}

                        {/* Dealer Button */}
                        {state.phase !== 'idle' && (
                            <div style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: `translate(${getPixelPosition(buttonSeat).x}px, ${getPixelPosition(buttonSeat).y}px)`
                            }}>
                                <AnimatedDealerButton
                                    targetX={0}
                                    targetY={-40}
                                />
                            </div>
                        )}

                        {/* Hero Cards */}
                        {state.phase !== 'idle' && state.cardsDealt.has(heroSeat) && (
                            <div style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%'
                            }}>
                                <AnimatedCard
                                    cardCode={heroCards[0]}
                                    isVisible={true}
                                    isFaceDown={false}
                                    targetX={getPixelPosition(heroSeat).x - 20}
                                    targetY={getPixelPosition(heroSeat).y + 30}
                                    delay={0}
                                    cardIndex={0}
                                />
                                <AnimatedCard
                                    cardCode={heroCards[1]}
                                    isVisible={true}
                                    isFaceDown={false}
                                    targetX={getPixelPosition(heroSeat).x + 20}
                                    targetY={getPixelPosition(heroSeat).y + 30}
                                    delay={0.05}
                                    cardIndex={1}
                                />
                            </div>
                        )}

                        {/* Villain Cards (Face Down) */}
                        {players.filter(p => !p.isHero).map((villain, index) => (
                            state.cardsDealt.has(villain.seat) && (
                                <div
                                    key={villain.seat}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%'
                                    }}
                                >
                                    <AnimatedCard
                                        cardCode="XX"
                                        isVisible={true}
                                        isFaceDown={true}
                                        targetX={getPixelPosition(villain.seat).x - 15}
                                        targetY={getPixelPosition(villain.seat).y + 20}
                                        delay={index * 0.05}
                                        cardIndex={0}
                                    />
                                    <AnimatedCard
                                        cardCode="XX"
                                        isVisible={true}
                                        isFaceDown={true}
                                        targetX={getPixelPosition(villain.seat).x + 15}
                                        targetY={getPixelPosition(villain.seat).y + 20}
                                        delay={index * 0.05 + 0.02}
                                        cardIndex={1}
                                    />
                                </div>
                            )
                        ))}

                        {/* Blinds Animation */}
                        {state.blindsPosted && (
                            <>
                                {/* Small Blind Chip */}
                                <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%'
                                }}>
                                    <AnimatedChip
                                        amount={smallBlind}
                                        startX={getPixelPosition(sbSeat).x}
                                        startY={getPixelPosition(sbSeat).y}
                                        isPosted={true}
                                        delay={0}
                                    />
                                </div>

                                {/* Big Blind Chip */}
                                <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%'
                                }}>
                                    <AnimatedChip
                                        amount={bigBlind}
                                        startX={getPixelPosition(bbSeat).x}
                                        startY={getPixelPosition(bbSeat).y}
                                        isPosted={true}
                                        delay={0.1}
                                    />
                                </div>
                            </>
                        )}

                        {/* Active Player Ring */}
                        {state.activePlayer !== null && (
                            <div style={{
                                position: 'absolute',
                                left: `calc(50% + ${getPixelPosition(state.activePlayer).x}px)`,
                                top: `calc(50% + ${getPixelPosition(state.activePlayer).y}px)`,
                            }}>
                                <ActivePlayerRing isActive={true} size={100} />
                            </div>
                        )}

                        {/* Pot Display */}
                        {state.blindsPosted && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3 }}
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '45%',
                                    transform: 'translateX(-50%)',
                                    padding: '8px 20px',
                                    background: 'rgba(0,0,0,0.8)',
                                    borderRadius: '20px',
                                    border: '2px solid rgba(255,255,255,0.2)',
                                    color: COLORS.gold,
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                                }}
                            >
                                POT: {smallBlind + bigBlind}
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default HandStartSequence;
