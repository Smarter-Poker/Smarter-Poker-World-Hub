/**
 * 🎬 ACTION REPLAY ENGINE — Data-Driven GameLoop Phase 4
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Cinematic replay of pre-hero actions with animations.
 * Uses Framer Motion for smooth, GPU-accelerated animations.
 * 
 * FEATURES:
 * - Ghost player transitions for folds (opacity 0.4)
 * - Chip animations for bets/raises
 * - Narrative text generation ("UTG folds, MP raises...")
 * - All-in indicators with glow effects
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ActionHistoryEntry } from './gameDataLoader';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Animation state for a player seat */
export interface SeatAnimationState {
    seat: number;
    position: string;
    isGhosted: boolean;        // Player has folded
    isAllIn: boolean;          // Player went all-in
    chipAmount?: number;       // Amount bet/raised
    animationPhase: 'idle' | 'acting' | 'complete';
}

/** Replay sequence step */
export interface ReplayStep {
    action: ActionHistoryEntry;
    seatState: SeatAnimationState;
    narrativeText: string;
    delayMs: number;           // Delay before this step
}

/** Full replay sequence */
export interface ReplaySequence {
    steps: ReplayStep[];
    totalDurationMs: number;
    finalNarrative: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION TIMING CONSTANTS (Premium feel)
// ═══════════════════════════════════════════════════════════════════════════

export const ANIMATION_TIMING = {
    // Per-action delays (milliseconds)
    FOLD_DELAY: 400,           // Fast fold transition
    CALL_DELAY: 600,           // Chip slide + settle
    RAISE_DELAY: 800,          // Chip stack + emphasis
    ALLIN_DELAY: 1000,         // Dramatic all-in with glow
    CHECK_DELAY: 300,          // Quick tap gesture

    // Animation durations
    GHOST_FADE_DURATION: 0.3,  // Seconds for fold ghost effect
    CHIP_SLIDE_DURATION: 0.4,  // Seconds for chip movement
    GLOW_PULSE_DURATION: 0.5,  // Seconds for action highlight

    // Base delay between actions
    ACTION_GAP: 200,
};

// ═══════════════════════════════════════════════════════════════════════════
// FRAMER MOTION ANIMATION PRESETS
// ═══════════════════════════════════════════════════════════════════════════

/** Ghost player animation (fold) */
export const ghostPlayerVariants = {
    active: {
        opacity: 1,
        scale: 1,
        filter: 'grayscale(0%)'
    },
    folded: {
        opacity: 0.4,
        scale: 0.95,
        filter: 'grayscale(60%)',
        transition: {
            duration: ANIMATION_TIMING.GHOST_FADE_DURATION,
            ease: 'easeOut'
        }
    }
};

/** Chip stack to pot animation */
export const chipToPotVariants = {
    initial: (custom: { fromX: number; fromY: number }) => ({
        x: custom.fromX,
        y: custom.fromY,
        scale: 1,
        opacity: 1
    }),
    animate: {
        x: 0,
        y: 0,
        scale: 0.7,
        opacity: 1,
        transition: {
            duration: ANIMATION_TIMING.CHIP_SLIDE_DURATION,
            ease: [0.25, 0.8, 0.25, 1] // Custom bezier for smooth poker feel
        }
    },
    exit: {
        scale: 0,
        opacity: 0,
        transition: { duration: 0.2 }
    }
};

/** All-in glow pulse animation */
export const allInGlowVariants = {
    initial: {
        boxShadow: '0 0 0px rgba(255, 215, 0, 0)',
        scale: 1
    },
    pulse: {
        boxShadow: [
            '0 0 10px rgba(255, 215, 0, 0.3)',
            '0 0 30px rgba(255, 215, 0, 0.6)',
            '0 0 10px rgba(255, 215, 0, 0.3)'
        ],
        scale: [1, 1.05, 1],
        transition: {
            duration: ANIMATION_TIMING.GLOW_PULSE_DURATION * 2,
            repeat: 2,
            ease: 'easeInOut'
        }
    }
};

/** Action bubble pop-in */
export const actionBubbleVariants = {
    hidden: {
        opacity: 0,
        scale: 0.8,
        y: 10
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            duration: 0.25,
            ease: 'backOut'
        }
    },
    exit: {
        opacity: 0,
        scale: 0.9,
        transition: { duration: 0.15 }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// NARRATIVE TEXT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate narrative text for an action
 */
function generateActionNarrative(action: ActionHistoryEntry): string {
    const position = action.position;

    switch (action.action) {
        case 'fold':
            return `${position} folds`;
        case 'check':
            return `${position} checks`;
        case 'call':
            return action.amount
                ? `${position} calls ${action.amount}BB`
                : `${position} calls`;
        case 'raise':
            return action.amount
                ? `${position} raises to ${action.amount}BB`
                : `${position} raises`;
        case 'all-in':
            return action.amount
                ? `${position} is ALL-IN for ${action.amount}BB!`
                : `${position} is ALL-IN!`;
        default:
            return `${position} acts`;
    }
}

/**
 * Generate cumulative narrative for action sequence
 */
export function generateFullNarrative(actionHistory: ActionHistoryEntry[]): string {
    if (actionHistory.length === 0) return 'Action on you';

    const parts = actionHistory.map(generateActionNarrative);

    // Group consecutive folds
    const grouped: string[] = [];
    let consecutiveFolds: string[] = [];

    for (const part of parts) {
        if (part.endsWith('folds')) {
            consecutiveFolds.push(part.split(' ')[0]);
        } else {
            if (consecutiveFolds.length > 0) {
                if (consecutiveFolds.length === 1) {
                    grouped.push(`${consecutiveFolds[0]} folds`);
                } else {
                    grouped.push(`${consecutiveFolds.slice(0, -1).join(', ')} and ${consecutiveFolds.slice(-1)} fold`);
                }
                consecutiveFolds = [];
            }
            grouped.push(part);
        }
    }

    // Handle remaining folds
    if (consecutiveFolds.length > 0) {
        if (consecutiveFolds.length === 1) {
            grouped.push(`${consecutiveFolds[0]} folds`);
        } else {
            grouped.push(`${consecutiveFolds.join(' and ')} fold`);
        }
    }

    return grouped.join('. ') + '.';
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLAY SEQUENCE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a replay sequence from action history
 */
export function buildReplaySequence(actionHistory: ActionHistoryEntry[]): ReplaySequence {
    const steps: ReplayStep[] = [];
    let cumulativeDelay = 0;
    let cumulativeNarrative: string[] = [];

    for (const action of actionHistory) {
        // Determine delay based on action type
        let delayMs: number;
        switch (action.action) {
            case 'fold':
                delayMs = ANIMATION_TIMING.FOLD_DELAY;
                break;
            case 'call':
                delayMs = ANIMATION_TIMING.CALL_DELAY;
                break;
            case 'raise':
                delayMs = ANIMATION_TIMING.RAISE_DELAY;
                break;
            case 'all-in':
                delayMs = ANIMATION_TIMING.ALLIN_DELAY;
                break;
            case 'check':
                delayMs = ANIMATION_TIMING.CHECK_DELAY;
                break;
            default:
                delayMs = ANIMATION_TIMING.ACTION_GAP;
        }

        // Build seat state
        const seatState: SeatAnimationState = {
            seat: action.seat,
            position: action.position,
            isGhosted: action.action === 'fold',
            isAllIn: action.action === 'all-in',
            chipAmount: action.amount,
            animationPhase: 'acting'
        };

        // Generate narrative
        const narrativeText = generateActionNarrative(action);
        cumulativeNarrative.push(narrativeText);

        steps.push({
            action,
            seatState,
            narrativeText,
            delayMs: cumulativeDelay
        });

        cumulativeDelay += delayMs + ANIMATION_TIMING.ACTION_GAP;
    }

    return {
        steps,
        totalDurationMs: cumulativeDelay,
        finalNarrative: generateFullNarrative(actionHistory)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLAY EXECUTOR (Hook-compatible)
// ═══════════════════════════════════════════════════════════════════════════

export interface ReplayExecutorCallbacks {
    onStepStart: (step: ReplayStep) => void;
    onStepComplete: (step: ReplayStep) => void;
    onSequenceComplete: (sequence: ReplaySequence) => void;
    onNarrativeUpdate: (narrative: string) => void;
}

/**
 * Execute the replay sequence with callbacks
 * Returns a cleanup function to abort replay
 */
export function executeReplaySequence(
    sequence: ReplaySequence,
    callbacks: Partial<ReplayExecutorCallbacks>
): () => void {
    const timeouts: NodeJS.Timeout[] = [];
    let isAborted = false;

    // Schedule each step
    for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];

        // Step start
        const startTimeout = setTimeout(() => {
            if (isAborted) return;
            callbacks.onStepStart?.(step);
            callbacks.onNarrativeUpdate?.(step.narrativeText);
        }, step.delayMs);
        timeouts.push(startTimeout);

        // Step complete (at next step's start or sequence end)
        const nextDelay = sequence.steps[i + 1]?.delayMs ?? sequence.totalDurationMs;
        const completeTimeout = setTimeout(() => {
            if (isAborted) return;
            callbacks.onStepComplete?.(step);
        }, nextDelay - 50); // Slight early completion for overlap
        timeouts.push(completeTimeout);
    }

    // Sequence complete
    const finalTimeout = setTimeout(() => {
        if (isAborted) return;
        callbacks.onSequenceComplete?.(sequence);
        callbacks.onNarrativeUpdate?.(sequence.finalNarrative);
    }, sequence.totalDurationMs);
    timeouts.push(finalTimeout);

    // Return cleanup function
    return () => {
        isAborted = true;
        timeouts.forEach(clearTimeout);
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT HOOK: useActionReplay
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseActionReplayResult {
    isReplaying: boolean;
    currentStep: ReplayStep | null;
    ghostedSeats: Set<number>;
    allInSeats: Set<number>;
    narrative: string;
    startReplay: () => void;
    skipReplay: () => void;
}

/**
 * React hook for action replay with state management
 */
export function useActionReplay(
    actionHistory: ActionHistoryEntry[] | undefined,
    options: { autoStart?: boolean; onComplete?: () => void } = {}
): UseActionReplayResult {
    const [isReplaying, setIsReplaying] = useState(false);
    const [currentStep, setCurrentStep] = useState<ReplayStep | null>(null);
    const [ghostedSeats, setGhostedSeats] = useState<Set<number>>(new Set());
    const [allInSeats, setAllInSeats] = useState<Set<number>>(new Set());
    const [narrative, setNarrative] = useState('');

    const cleanupRef = useRef<(() => void) | null>(null);
    const sequenceRef = useRef<ReplaySequence | null>(null);

    // Build sequence when action history changes
    useEffect(() => {
        if (actionHistory && actionHistory.length > 0) {
            sequenceRef.current = buildReplaySequence(actionHistory);
        } else {
            sequenceRef.current = null;
        }
    }, [actionHistory]);

    // Start replay
    const startReplay = useCallback(() => {
        if (!sequenceRef.current || isReplaying) return;

        setIsReplaying(true);
        setGhostedSeats(new Set());
        setAllInSeats(new Set());
        setNarrative('');

        cleanupRef.current = executeReplaySequence(sequenceRef.current, {
            onStepStart: (step) => {
                setCurrentStep(step);

                if (step.seatState.isGhosted) {
                    setGhostedSeats(prev => new Set(Array.from(prev).concat(step.seatState.seat)));
                }

                if (step.seatState.isAllIn) {
                    setAllInSeats(prev => new Set(Array.from(prev).concat(step.seatState.seat)));
                }
            },
            onNarrativeUpdate: setNarrative,
            onSequenceComplete: () => {
                setIsReplaying(false);
                setCurrentStep(null);
                options.onComplete?.();
            }
        });
    }, [isReplaying, options.onComplete]);

    // Skip replay (complete immediately)
    const skipReplay = useCallback(() => {
        cleanupRef.current?.();

        if (sequenceRef.current) {
            // Apply all fold states immediately
            const ghosted = new Set<number>();
            const allIn = new Set<number>();

            for (const step of sequenceRef.current.steps) {
                if (step.seatState.isGhosted) ghosted.add(step.seatState.seat);
                if (step.seatState.isAllIn) allIn.add(step.seatState.seat);
            }

            setGhostedSeats(ghosted);
            setAllInSeats(allIn);
            setNarrative(sequenceRef.current.finalNarrative);
        }

        setIsReplaying(false);
        setCurrentStep(null);
        options.onComplete?.();
    }, [options.onComplete]);

    // Auto-start if enabled
    useEffect(() => {
        if (options.autoStart && sequenceRef.current && !isReplaying) {
            startReplay();
        }
    }, [options.autoStart, startReplay]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanupRef.current?.();
    }, []);

    return {
        isReplaying,
        currentStep,
        ghostedSeats,
        allInSeats,
        narrative,
        startReplay,
        skipReplay
    };
}

export default {
    buildReplaySequence,
    executeReplaySequence,
    generateFullNarrative,
    useActionReplay,
    ANIMATION_TIMING,
    ghostPlayerVariants,
    chipToPotVariants,
    allInGlowVariants,
    actionBubbleVariants
};
