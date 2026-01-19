/**
 * 🎮 UNIVERSAL TRAINING TABLE — Pure React Poker Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * SCORCHED EARTH REWRITE - 100% Self-Contained React Component
 * 
 * FIXES:
 * - Hero locked to bottom-center
 * - Villain locked to top-center
 * - Board locked to dead-center
 * - State-driven card rendering (no hanging cards)
 * - Built-in game loop (no external scripts)
 * - CSS-generated cards (no image dependencies)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRAINING_CLINICS, getClinicById, getRemediationXPMultiplier } from '../../data/TRAINING_CLINICS';
import LeakFixerIntercept from './LeakFixerIntercept';
import { createClient } from '@supabase/supabase-js';

// Card suit configuration
const SUITS = {
    s: { symbol: '♠', color: '#000' },
    h: { symbol: '♥', color: '#e74c3c' },
    d: { symbol: '♦', color: '#3498db' },
    c: { symbol: '♣', color: '#27ae60' },
};

// Playing card component
function PlayingCard({ card, size = 'medium' }: { card: string; size?: 'small' | 'medium' | 'large' }) {
    if (!card || card === '??') {
        // Card back
        const sizes = {
            small: { w: 40, h: 56 },
            medium: { w: 60, h: 84 },
            large: { w: 80, h: 112 },
        };
        const s = sizes[size];

        return (
            <div
                style={{
                    width: s.w,
                    height: s.h,
                    background: 'linear-gradient(135deg, #c0392b, #e74c3c)',
                    borderRadius: 6,
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                }}
            >
                <div style={{
                    fontSize: s.w * 0.4,
                    color: '#fff',
                    fontWeight: 'bold',
                }}>
                    ?
                </div>
            </div>
        );
    }

    // Parse card (e.g., "Ah" = Ace of hearts)
    const rank = card.slice(0, -1);
    const suit = card.slice(-1) as keyof typeof SUITS;
    const suitConfig = SUITS[suit] || SUITS.s;

    const sizes = {
        small: { w: 40, h: 56, fontSize: 14 },
        medium: { w: 60, h: 84, fontSize: 20 },
        large: { w: 80, h: 112, fontSize: 28 },
    };
    const s = sizes[size];

    return (
        <div
            style={{
                width: s.w,
                height: s.h,
                background: 'linear-gradient(135deg, #fff, #f5f5f5)',
                borderRadius: 6,
                border: '2px solid #333',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                position: 'relative',
            }}
        >
            <div style={{
                fontSize: s.fontSize,
                fontWeight: 'bold',
                color: suitConfig.color,
                lineHeight: 1,
            }}>
                {rank}
            </div>
            <div style={{
                fontSize: s.fontSize * 1.2,
                color: suitConfig.color,
                lineHeight: 1,
            }}>
                {suitConfig.symbol}
            </div>
        </div>
    );
}

// Chip stack component
function ChipStack({ amount, label }: { amount: number; label: string }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
        }}>
            <div style={{
                display: 'flex',
                gap: 2,
            }}>
                {[...Array(Math.min(5, Math.ceil(amount / 10)))].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ scale: 0, y: -20 }}
                        animate={{ scale: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: amount >= 100 ? '#000' : amount >= 25 ? '#27ae60' : amount >= 5 ? '#3498db' : '#e74c3c',
                            border: '2px solid #fff',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        }}
                    />
                ))}
            </div>
            <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#FFD700',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}>
                {amount} BB
            </div>
            <div style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
            }}>
                {label}
            </div>
        </div>
    );
}

// Main component
export default function UniversalTrainingTable({
    gameId,
    clinicId,
    question,
    onAnswer,
    showResult = false,
    isCorrect = false,
    isRemediationMode = false,
}: {
    gameId?: string;
    clinicId?: string;
    question?: any;
    onAnswer?: (answerId: string) => void;
    showResult?: boolean;
    isCorrect?: boolean;
    isRemediationMode?: boolean;
}) {
    // Game state
    const [heroCards, setHeroCards] = useState<string[]>(['??', '??']);
    const [villainCards, setVillainCards] = useState<string[]>(['??', '??']);
    const [boardCards, setBoardCards] = useState<string[]>([]);
    const [pot, setPot] = useState(12);
    const [heroStack, setHeroStack] = useState(40);
    const [villainStack, setVillainStack] = useState(40);
    const [dealerButton, setDealerButton] = useState<'hero' | 'villain'>('villain');
    const [isDealing, setIsDealing] = useState(false);
    const [villainAction, setVillainAction] = useState<string | null>(null);

    // Leak detection state
    const [showLeakIntercept, setShowLeakIntercept] = useState(false);
    const [detectedLeak, setDetectedLeak] = useState<any>(null);
    const [mistakeCount, setMistakeCount] = useState(0);
    const [totalAttempts, setTotalAttempts] = useState(0);

    // Initialize Supabase client (lazy initialization)
    const supabase = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        );
    }, []);

    // Load clinic data
    const activeClinic = clinicId ? getClinicById(clinicId) : null;
    const correctAction = question?.correctAction || question?.options?.find((o: any) => o.isCorrect)?.id;

    // Initialize from question
    useEffect(() => {
        if (question) {
            setHeroCards(question.heroCards || ['Ah', 'Kh']);
            setVillainCards(['??', '??']); // Always hidden
            setBoardCards(question.board || []);
            setPot(question.potSize || 12);
            setHeroStack(question.heroStack || 40);
            setVillainStack(question.villainStack || 40);

            // Trigger deal animation
            setIsDealing(true);
            setTimeout(() => setIsDealing(false), 1000);
        }
    }, [question]);


    // Universal action handler with leak detection and XP logging
    const handleAction = useCallback(async (action: string) => {
        setTotalAttempts(prev => prev + 1);

        const isCorrectMove = action === correctAction;

        // LAW 1: Leak Detection
        if (!isCorrectMove) {
            setMistakeCount(prev => prev + 1);

            // Calculate error rate
            const errorRate = (mistakeCount + 1) / (totalAttempts + 1);

            // Detect leak at 75% threshold (3 out of 4 mistakes)
            if (errorRate >= 0.75 && totalAttempts >= 3) {
                const leakCategory = activeClinic?.target_leak || 'GENERAL_MISTAKE';

                // Show leak intercept instead of normal feedback
                setDetectedLeak({
                    category: leakCategory,
                    name: activeClinic?.name || 'Strategic Error',
                    confidence: errorRate,
                    clinic_id: clinicId
                });
                setShowLeakIntercept(true);

                // Log leak to Supabase
                if (supabase) {
                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            await supabase.from('user_leaks').insert({
                                user_id: user.id,
                                leak_category: leakCategory,
                                leak_name: activeClinic?.name || 'Strategic Error',
                                error_rate: errorRate,
                                confidence: errorRate,
                                total_samples: totalAttempts + 1,
                                mistake_count: mistakeCount + 1,
                                clinic_id: clinicId,
                                is_active: true
                            });
                        }
                    } catch (err) {
                        console.error('[LEAK] Failed to log:', err);
                    }
                }

                return; // Don't proceed to normal answer flow
            }
        }

        // Log XP to Supabase
        if (isCorrectMove && supabase) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const baseXP = 100;
                    const remediationMultiplier = isRemediationMode
                        ? getRemediationXPMultiplier(clinicId || '')
                        : 1.0;
                    const xpAwarded = Math.round(baseXP * remediationMultiplier);

                    await supabase.from('xp_logs').insert({
                        user_id: user.id,
                        game_id: gameId || clinicId || 'unknown',
                        session_type: isRemediationMode ? 'remediation' : 'game',
                        xp_awarded: xpAwarded,
                        base_xp: baseXP,
                        streak_multiplier: 1.0,
                        speed_multiplier: 1.0,
                        remediation_multiplier: remediationMultiplier,
                        is_correct: true,
                        metadata: {
                            clinic_id: clinicId,
                            action: action
                        }
                    });

                    console.log(`[XP] Awarded ${xpAwarded} XP (${remediationMultiplier}x multiplier)`);
                }
            } catch (err) {
                console.error('[XP] Failed to log:', err);
            }
        }

        // Proceed with normal answer flow
        onAnswer?.(action);
    }, [correctAction, mistakeCount, totalAttempts, activeClinic, clinicId, gameId, isRemediationMode, onAnswer]);

    // Handle fold - CRITICAL FIX: Immediately clear villain cards
    const handleFold = useCallback(() => {
        setVillainCards([]); // Force unmount
        setVillainAction('FOLD');
        setTimeout(() => {
            handleAction('fold');
        }, 500);
    }, [handleAction]);

    const handleCall = useCallback(() => {
        handleAction('call');
    }, [handleAction]);

    const handleRaise = useCallback(() => {
        handleAction('raise');
    }, [handleAction]);

    const handleAllIn = useCallback(() => {
        handleAction('all-in');
    }, [handleAction]);

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: 'linear-gradient(180deg, #0a1628 0%, #1a2744 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Poker Table */}
            <div style={{
                position: 'relative',
                width: 700,
                height: 400,
                background: 'linear-gradient(135deg, #1e5631, #2d7a47)',
                borderRadius: '50%',
                border: '8px solid #3d2a1a',
                boxShadow: '0 0 60px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)',
            }}>
                {/* BOARD - Dead Center */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    gap: 8,
                }}>
                    <AnimatePresence>
                        {boardCards.length > 0 ? (
                            boardCards.map((card, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ scale: 0, rotateY: 180 }}
                                    animate={{ scale: 1, rotateY: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <PlayingCard card={card} size="medium" />
                                </motion.div>
                            ))
                        ) : (
                            <div style={{
                                color: 'rgba(255,255,255,0.3)',
                                fontSize: 14,
                                fontWeight: 600,
                                letterSpacing: 2,
                            }}>
                                PRE-FLOP
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* POT - Above Board */}
                <div style={{
                    position: 'absolute',
                    top: '30%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '2px solid #FFD700',
                }}>
                    <div style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.5)',
                        textAlign: 'center',
                    }}>
                        POT
                    </div>
                    <div style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#FFD700',
                        fontFamily: 'monospace',
                    }}>
                        {pot} BB
                    </div>
                </div>

                {/* VILLAIN - Top Center */}
                <div style={{
                    position: 'absolute',
                    top: '-10%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    {/* Villain Seat */}
                    <div style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                        border: '3px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fff',
                        }}>
                            VILLAIN
                        </div>
                    </div>

                    {/* Villain Cards */}
                    <div style={{
                        display: 'flex',
                        gap: 4,
                    }}>
                        <AnimatePresence>
                            {villainCards.map((card, i) => (
                                <motion.div
                                    key={`villain-${i}`}
                                    initial={{ scale: 0, y: -50 }}
                                    animate={{ scale: 1, y: 0 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <PlayingCard card={card} size="small" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Villain Action Label */}
                    <AnimatePresence>
                        {villainAction && (
                            <motion.div
                                initial={{ scale: 0, y: -10 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0, opacity: 0 }}
                                style={{
                                    padding: '6px 16px',
                                    background: villainAction === 'FOLD' ? '#e74c3c' : '#27ae60',
                                    borderRadius: 20,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#fff',
                                }}
                            >
                                {villainAction}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Villain Stack */}
                    <ChipStack amount={villainStack} label="Villain" />
                </div>

                {/* HERO - Bottom Center */}
                <div style={{
                    position: 'absolute',
                    bottom: '-10%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    {/* Hero Stack */}
                    <ChipStack amount={heroStack} label="You" />

                    {/* Hero Cards */}
                    <div style={{
                        display: 'flex',
                        gap: 4,
                    }}>
                        <AnimatePresence>
                            {heroCards.map((card, i) => (
                                <motion.div
                                    key={`hero-${i}`}
                                    initial={{ scale: 0, y: 50 }}
                                    animate={{ scale: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.15 }}
                                >
                                    <PlayingCard card={card} size="medium" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Hero Seat */}
                    <motion.div
                        animate={{
                            boxShadow: [
                                '0 0 20px rgba(255,215,0,0.5)',
                                '0 0 40px rgba(255,215,0,0.8)',
                                '0 0 20px rgba(255,215,0,0.5)',
                            ],
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            border: '3px solid #fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#000',
                        }}>
                            YOU
                        </div>
                    </motion.div>
                </div>

                {/* Dealer Button */}
                <motion.div
                    animate={{
                        left: dealerButton === 'hero' ? '50%' : '50%',
                        bottom: dealerButton === 'hero' ? '15%' : 'auto',
                        top: dealerButton === 'villain' ? '15%' : 'auto',
                    }}
                    style={{
                        position: 'absolute',
                        transform: 'translateX(-50%)',
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: '#fff',
                        border: '3px solid #000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 900,
                        color: '#000',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                    }}
                >
                    D
                </motion.div>
            </div>

            {/* Action Buttons - Bottom HUD */}
            {!showResult && (
                <div style={{
                    position: 'absolute',
                    bottom: 40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 12,
                }}>
                    <motion.button
                        onClick={handleFold}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '16px 32px',
                            background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}
                    >
                        FOLD
                    </motion.button>
                    <motion.button
                        onClick={handleCall}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '16px 32px',
                            background: 'linear-gradient(135deg, #3498db, #2980b9)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}
                    >
                        CALL
                    </motion.button>
                    <motion.button
                        onClick={handleRaise}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '16px 32px',
                            background: 'linear-gradient(135deg, #27ae60, #229954)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}
                    >
                        RAISE
                    </motion.button>
                    <motion.button
                        onClick={handleAllIn}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '16px 32px',
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#000',
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}
                    >
                        ALL-IN
                    </motion.button>
                </div>
            )}

            {/* Result Overlay */}
            <AnimatePresence>
                {showResult && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <div style={{
                            padding: 40,
                            background: isCorrect
                                ? 'linear-gradient(135deg, #27ae60, #229954)'
                                : 'linear-gradient(135deg, #e74c3c, #c0392b)',
                            borderRadius: 20,
                            textAlign: 'center',
                        }}>
                            <div style={{
                                fontSize: 64,
                                marginBottom: 16,
                            }}>
                                {isCorrect ? '✓' : '✗'}
                            </div>
                            <div style={{
                                fontSize: 32,
                                fontWeight: 700,
                                color: '#fff',
                            }}>
                                {isCorrect ? 'CORRECT!' : 'INCORRECT'}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* LAW 1: Leak Fixer Intercept - Shows when leak detected */}
            {showLeakIntercept && detectedLeak && (
                <LeakFixerIntercept
                    onDismiss={() => {
                        setShowLeakIntercept(false);
                        setDetectedLeak(null);
                    }}
                    onAccept={(clinic) => {
                        console.log('[LAW 1] Routing to clinic:', clinic.name);
                        setShowLeakIntercept(false);
                        // Route to clinic page
                        window.location.href = `/hub/training/clinic/${clinic.id}`;
                    }}
                />
            )}
        </div>
    );
}
