/**
 * 🎯 useTrainingTimeline — GSAP Timeline Hook
 * ═══════════════════════════════════════════════════════════════════
 * Creates and manages a deterministic GSAP timeline for scenario playback.
 * Seeking to step N always produces the same visual state.
 * ═══════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { getStateAtStep } from '@/src/utils/training/timelineMapper';

export default function useTrainingTimeline(scenario, options = {}) {
    const {
        autoPlay = true,
        playbackSpeed = 1,
        onStepChange = null,
        onDecisionPoint = null,
    } = options;

    const timelineRef = useRef(null);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentState, setCurrentState] = useState(null);

    // Timeline configuration
    const timeline = scenario?.timeline;
    const steps = timeline?.steps || [];
    const decisionStepIndex = timeline?.decisionStepIndex ?? steps.length - 1;

    // Initialize timeline
    useEffect(() => {
        if (!scenario || !steps.length) return;

        // Create GSAP timeline
        const tl = gsap.timeline({
            paused: !autoPlay,
            onUpdate: () => {
                const progress = tl.progress();
                const stepIndex = Math.floor(progress * steps.length);
                const clampedIndex = Math.min(stepIndex, steps.length - 1);

                if (clampedIndex !== currentStepIndex) {
                    setCurrentStepIndex(clampedIndex);
                    const state = getStateAtStep(timeline, clampedIndex);
                    setCurrentState(state);
                    onStepChange?.(clampedIndex, state);

                    // Check for decision point
                    if (clampedIndex >= decisionStepIndex) {
                        tl.pause();
                        setIsPlaying(false);
                        onDecisionPoint?.();
                    }
                }
            },
            onComplete: () => {
                setIsPlaying(false);
            },
        });

        // Add duration for each step
        steps.forEach((step, i) => {
            const duration = (step.durationMs || 600) / 1000 / playbackSpeed;
            tl.to({}, { duration }, `step-${i}`);
        });

        timelineRef.current = tl;

        // Set initial state
        const initialState = getStateAtStep(timeline, 0);
        setCurrentState(initialState);
        setCurrentStepIndex(0);

        // Auto-play if enabled
        if (autoPlay) {
            tl.play();
            setIsPlaying(true);
        }

        return () => {
            tl.kill();
            timelineRef.current = null;
        };
    }, [scenario?.id, playbackSpeed]);

    // Play control
    const play = useCallback(() => {
        if (timelineRef.current && currentStepIndex < decisionStepIndex) {
            timelineRef.current.play();
            setIsPlaying(true);
        }
    }, [currentStepIndex, decisionStepIndex]);

    // Pause control
    const pause = useCallback(() => {
        if (timelineRef.current) {
            timelineRef.current.pause();
            setIsPlaying(false);
        }
    }, []);

    // Seek to specific step (DETERMINISTIC)
    const seekToStep = useCallback((stepIndex) => {
        if (!timelineRef.current || !steps.length) return;

        const clampedIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
        const progress = clampedIndex / steps.length;

        timelineRef.current.progress(progress);
        timelineRef.current.pause();

        setCurrentStepIndex(clampedIndex);
        const state = getStateAtStep(timeline, clampedIndex);
        setCurrentState(state);
        setIsPlaying(false);
    }, [steps.length, timeline]);

    // Step forward
    const stepForward = useCallback(() => {
        seekToStep(currentStepIndex + 1);
    }, [currentStepIndex, seekToStep]);

    // Step backward
    const stepBackward = useCallback(() => {
        seekToStep(currentStepIndex - 1);
    }, [currentStepIndex, seekToStep]);

    // Reset to beginning
    const reset = useCallback(() => {
        seekToStep(0);
    }, [seekToStep]);

    // Set playback speed
    const setSpeed = useCallback((speed) => {
        if (timelineRef.current) {
            timelineRef.current.timeScale(speed);
        }
    }, []);

    return {
        // State
        currentStepIndex,
        currentState,
        isPlaying,
        stepCount: steps.length,
        decisionStepIndex,
        isAtDecision: currentStepIndex >= decisionStepIndex,

        // Controls
        play,
        pause,
        seekToStep,
        stepForward,
        stepBackward,
        reset,
        setSpeed,

        // Debug info
        debug: {
            scenarioId: scenario?.id,
            gameId: scenario?.gameId,
            stepCount: steps.length,
            currentStep: currentStepIndex,
            street: currentState?.street,
            pot: currentState?.potBB,
        },
    };
}
