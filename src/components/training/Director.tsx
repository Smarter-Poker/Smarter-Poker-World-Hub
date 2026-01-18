/**
 * 🎬 THE DIRECTOR - Visual Replay Engine
 * 
 * Consumes scenarios from The Architect and replays them visually.
 * Handles intro loading, action replay, and background scenario queue.
 * 
 * Key Responsibilities:
 * - Show intro while generating first scenario
 * - Replay action logs with visual chip movements
 * - Pre-generate 10 scenarios in background
 * - Maintain visual/math synchronization
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScenarioGenerator } from '../../lib/ScenarioGenerator';
import type { Scenario, ActionLogEntry, GameConfig } from '../../types/poker';

interface DirectorProps {
    config: GameConfig;
    onScenarioComplete: (correct: boolean) => void;
}

export function Director({ config, onScenarioComplete }: DirectorProps) {
    const [showIntro, setShowIntro] = useState(true);
    const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
    const [scenarioQueue, setScenarioQueue] = useState<Scenario[]>([]);
    const [replayIndex, setReplayIndex] = useState(0);
    const [isReplaying, setIsReplaying] = useState(false);

    const queueGenerationRef = useRef<IdleRequestCallback | null>(null);

    /**
     * 🎬 Initialize: Show intro and generate first scenario
     */
    useEffect(() => {
        // Generate first scenario immediately
        const firstScenario = ScenarioGenerator.create(config);

        // Validate it
        if (!ScenarioGenerator.validate(firstScenario)) {
            console.error('❌ First scenario failed validation!');
        }

        setCurrentScenario(firstScenario);

        // Pre-generate queue in background
        if ('requestIdleCallback' in window) {
            queueGenerationRef.current = requestIdleCallback(() => {
                generateScenarioQueue();
            });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(generateScenarioQueue, 100);
        }

        // Hide intro after 3 seconds
        const introTimer = setTimeout(() => {
            setShowIntro(false);
            startReplay();
        }, 3000);

        return () => {
            clearTimeout(introTimer);
            if (queueGenerationRef.current) {
                cancelIdleCallback(queueGenerationRef.current);
            }
        };
    }, []);

    /**
     * 📦 Generate 10 scenarios for the queue
     */
    const generateScenarioQueue = useCallback(() => {
        const queue: Scenario[] = [];

        for (let i = 0; i < 10; i++) {
            const scenario = ScenarioGenerator.create(config);

            if (ScenarioGenerator.validate(scenario)) {
                queue.push(scenario);
            } else {
                console.warn(`⚠️ Scenario ${i} failed validation, regenerating...`);
                i--; // Retry this iteration
            }
        }

        setScenarioQueue(queue);
        console.log('✅ Generated 10 scenarios in background queue');
    }, [config]);

    /**
     * ▶️ Start replaying the action log
     */
    const startReplay = useCallback(() => {
        if (!currentScenario) return;

        setIsReplaying(true);
        setReplayIndex(0);

        // Replay each action with timing
        const replayInterval = setInterval(() => {
            setReplayIndex(prev => {
                const nextIndex = prev + 1;

                if (nextIndex >= currentScenario.actionLog.length) {
                    clearInterval(replayInterval);
                    setIsReplaying(false);
                    return prev;
                }

                return nextIndex;
            });
        }, 500); // 500ms between actions

        return () => clearInterval(replayInterval);
    }, [currentScenario]);

    /**
     * ⏭️ Load next scenario from queue
     */
    const loadNextScenario = useCallback(() => {
        if (scenarioQueue.length === 0) {
            console.warn('⚠️ Scenario queue is empty, generating new scenario...');
            const newScenario = ScenarioGenerator.create(config);
            setCurrentScenario(newScenario);
            return;
        }

        // Take first scenario from queue
        const [nextScenario, ...remainingQueue] = scenarioQueue;
        setCurrentScenario(nextScenario);
        setScenarioQueue(remainingQueue);

        // Generate a new scenario to replace the one we just used
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                const newScenario = ScenarioGenerator.create(config);
                if (ScenarioGenerator.validate(newScenario)) {
                    setScenarioQueue(queue => [...queue, newScenario]);
                }
            });
        }

        // Restart replay
        setReplayIndex(0);
        startReplay();
    }, [scenarioQueue, config, startReplay]);

    /**
     * 🎨 Render current action log state
     */
    const getCurrentState = useCallback(() => {
        if (!currentScenario) return null;

        const visibleActions = currentScenario.actionLog.slice(0, replayIndex + 1);
        const lastAction = visibleActions[visibleActions.length - 1];

        return {
            players: currentScenario.players,
            pot: lastAction?.potAfter || 0,
            lastAction,
            visibleActions
        };
    }, [currentScenario, replayIndex]);

    const state = getCurrentState();

    if (showIntro) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}
            >
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 360],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut'
                    }}
                    style={{
                        fontSize: '64px',
                        fontWeight: 900,
                        background: 'linear-gradient(135deg, #00d4ff, #FFD700)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textAlign: 'center'
                    }}
                >
                    SMARTER.POKER
                </motion.div>
            </motion.div>
        );
    }

    if (!state) {
        return <div>Loading scenario...</div>;
    }

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: '#0a1628',
            position: 'relative'
        }}>
            {/* Pot Display */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '32px',
                fontWeight: 900,
                color: '#FFD700',
                textShadow: '0 0 20px rgba(255, 215, 0, 0.5)'
            }}>
                POT: {state.pot}
            </div>

            {/* Players */}
            {state.players.map((player, index) => (
                <div
                    key={player.seat}
                    style={{
                        position: 'absolute',
                        top: `${20 + (index * 10)}%`,
                        left: `${20 + (index * 8)}%`,
                        padding: '12px',
                        background: 'rgba(0, 0, 0, 0.8)',
                        border: '2px solid #FFD700',
                        borderRadius: '8px',
                        color: '#fff'
                    }}
                >
                    <div style={{ fontWeight: 700 }}>{player.name}</div>
                    <div style={{ color: '#FFD700' }}>Stack: {player.stack}</div>
                    {player.currentBet > 0 && (
                        <div style={{ color: '#00d4ff' }}>Bet: {player.currentBet}</div>
                    )}
                    {player.hasFolded && (
                        <div style={{ color: '#ff4444' }}>FOLDED</div>
                    )}
                </div>
            ))}

            {/* Question */}
            {!isReplaying && currentScenario && (
                <div style={{
                    position: 'absolute',
                    bottom: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '80%',
                    padding: '20px',
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '3px solid #00d4ff',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: '#fff',
                    fontSize: '18px'
                }}>
                    {currentScenario.question}
                </div>
            )}

            {/* Debug Info */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                fontSize: '12px',
                color: '#666',
                fontFamily: 'monospace'
            }}>
                Replay: {replayIndex + 1}/{currentScenario?.actionLog.length || 0} |
                Queue: {scenarioQueue.length}/10
            </div>
        </div>
    );
}
