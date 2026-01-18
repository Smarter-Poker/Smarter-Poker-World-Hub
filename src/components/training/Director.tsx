/**
 * 🎬 THE DIRECTOR - Visual Replay Engine
 * 
 * Consumes scenarios from The Architect and replays them visually.
 * Handles intro loading, action replay, decision handling, and feedback.
 * 
 * Key Responsibilities:
 * - Show intro while generating first scenario
 * - Replay action logs with visual chip movements
 * - Handle user decisions with visual feedback
 * - Display GTO analysis on incorrect answers
 * - Pre-generate 10 scenarios in background
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScenarioGenerator } from '../../lib/ScenarioGenerator';
import { useGameAudio } from '../../hooks/useGameAudio';
import { useProgression, type RewardBreakdown, type Leak } from '../../hooks/useProgression';
import { useAssetPreloader } from '../../lib/AssetPreloader';
import { useNetworkGuard, OfflineBadge } from '../../lib/GameGuard';
import { SEAT_LAYOUTS, getTableFormatName, type TableSize } from '../../lib/SeatLayouts';
import type { Scenario, ActionLogEntry, GameConfig, Player } from '../../types/poker';

interface DirectorProps {
    config: GameConfig;
    onScenarioComplete: (correct: boolean, xpEarned: number, diamondsEarned: number) => void;
}

type GamePhase = 'INTRO' | 'REPLAYING' | 'AWAITING_DECISION' | 'SHOWING_RESULT' | 'SHOWING_GTO';

export function Director({ config, onScenarioComplete }: DirectorProps) {
    // Core state
    const [phase, setPhase] = useState<GamePhase>('INTRO');
    const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
    const [scenarioQueue, setScenarioQueue] = useState<Scenario[]>([]);
    const [replayIndex, setReplayIndex] = useState(0);

    // Decision state
    const [userAction, setUserAction] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [buttonsDisabled, setButtonsDisabled] = useState(false);

    // Visual effects state
    const [showChipSweep, setShowChipSweep] = useState(false);
    const [chipSweepTarget, setChipSweepTarget] = useState<'hero' | 'villain'>('hero');
    const [showGoldBurst, setShowGoldBurst] = useState(false);
    const [cameraShake, setCameraShake] = useState(false);
    const [showGTOCard, setShowGTOCard] = useState(false);
    const [gtoCardExpanded, setGtoCardExpanded] = useState(false);
    const [showNextHandButton, setShowNextHandButton] = useState(false);

    // Stats
    const [totalCorrect, setTotalCorrect] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);

    const queueGenerationRef = useRef<number | null>(null);

    // 🔊 AUDIO & HAPTICS
    const audio = useGameAudio();

    // 📦 ASSET PRELOADER
    const assets = useAssetPreloader();

    // 🌐 NETWORK GUARD
    const network = useNetworkGuard();

    // 🔥 PROGRESSION SYSTEM
    const progression = useProgression();
    const [lastReward, setLastReward] = useState<RewardBreakdown | null>(null);
    const [showLeakBadge, setShowLeakBadge] = useState(false);
    const [currentLeak, setCurrentLeak] = useState<Leak | null>(null);

    /**
     * 🎬 Initialize: Show intro and generate first scenario
     */
    useEffect(() => {
        const firstScenario = ScenarioGenerator.create(config);

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
            setTimeout(generateScenarioQueue, 100);
        }

        // Hide intro and start replay after 3 seconds
        const introTimer = setTimeout(() => {
            setPhase('REPLAYING');
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
                i--;
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

        setReplayIndex(0);
        setPhase('REPLAYING');

        const replayInterval = setInterval(() => {
            setReplayIndex(prev => {
                const nextIndex = prev + 1;

                if (nextIndex >= currentScenario.actionLog.length) {
                    clearInterval(replayInterval);
                    setPhase('AWAITING_DECISION');
                    // 🔔 Play turn alert when it's hero's turn
                    audio.playTurnAlert();
                    return prev;
                }

                // 🃏 Play appropriate sound for each action
                const action = currentScenario.actionLog[nextIndex];
                if (action) {
                    audio.playAction(action.type);
                }

                return nextIndex;
            });
        }, 400);

        return () => clearInterval(replayInterval);
    }, [currentScenario]);

    /**
     * 🎯 HANDLE USER DECISION
     */
    const handleDecision = useCallback((action: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN') => {
        if (!currentScenario || buttonsDisabled) return;

        // 1. FREEZE UI
        setButtonsDisabled(true);
        setUserAction(action);

        // 2. COMPARE
        const correct = action === currentScenario.correctAction;
        setIsCorrect(correct);
        setTotalQuestions(prev => prev + 1);

        // 3. RECORD IN PROGRESSION SYSTEM (optimistic update)
        const reward = progression.recordHandResult({
            type: 'PREFLOP_OPEN', // TODO: Determine from scenario
            userAction: action,
            correctAction: currentScenario.correctAction,
            difficulty: 'medium' // TODO: Determine from scenario
        });

        // 4. TRIGGER SEQUENCE
        if (correct) {
            setTotalCorrect(prev => prev + 1);
            audio.playSuccess(); // 🔊 Success chime + haptic
            startWinSequence(reward);
        } else {
            audio.playError(); // 🔊 Error thud + haptic
            startLossSequence();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentScenario, buttonsDisabled, audio, progression]);

    /**
     * 🏆 WIN SEQUENCE - Player got it right!
     */
    const startWinSequence = useCallback((reward: RewardBreakdown) => {
        setPhase('SHOWING_RESULT');
        setLastReward(reward);

        // Step 1: Chip sweep to hero
        setChipSweepTarget('hero');
        setShowChipSweep(true);

        // Step 2: Gold burst after chip sweep (800ms delay)
        setTimeout(() => {
            setShowGoldBurst(true);
        }, 800);

        // Step 3: Show GTO card (collapsed) + Next Hand button (2s total)
        setTimeout(() => {
            setShowChipSweep(false);
            setShowGoldBurst(false);
            setShowGTOCard(true);
            setGtoCardExpanded(false);
            setShowNextHandButton(true);
            setPhase('SHOWING_GTO');

            onScenarioComplete(true, reward.totalXP, reward.totalDiamonds);
        }, 2000);
    }, [onScenarioComplete]);

    /**
     * 💔 LOSS SEQUENCE - Player got it wrong
     */
    const startLossSequence = useCallback(() => {
        setPhase('SHOWING_RESULT');
        setLastReward(null);

        // Step 1: Camera shake
        setCameraShake(true);

        // Step 2: Chip sweep to villain
        setChipSweepTarget('villain');
        setShowChipSweep(true);

        // Step 3: Stop shake after 500ms
        setTimeout(() => {
            setCameraShake(false);
        }, 500);

        // Step 4: Check for leaks
        const leaks = progression.getLeaks();
        if (leaks.length > 0) {
            setCurrentLeak(leaks[0]);
            setShowLeakBadge(true);
        }

        // Step 5: Show expanded GTO card + Next Hand button (2s total)
        setTimeout(() => {
            setShowChipSweep(false);
            setShowGTOCard(true);
            setGtoCardExpanded(true); // Auto-expand on wrong answer
            setShowNextHandButton(true);
            setPhase('SHOWING_GTO');

            onScenarioComplete(false, 0, 0);
        }, 2000);
    }, [onScenarioComplete, progression]);

    /**
     * ⏭️ NEXT HAND - Zero latency transition
     */
    const handleNextHand = useCallback(() => {
        // Reset all state
        setUserAction(null);
        setIsCorrect(null);
        setButtonsDisabled(false);
        setShowChipSweep(false);
        setShowGoldBurst(false);
        setCameraShake(false);
        setShowGTOCard(false);
        setGtoCardExpanded(false);
        setShowNextHandButton(false);
        setReplayIndex(0);
        setLastReward(null);
        setShowLeakBadge(false);
        setCurrentLeak(null);

        // Pop next scenario from queue (zero latency!)
        if (scenarioQueue.length > 0) {
            const [nextScenario, ...remainingQueue] = scenarioQueue;
            setCurrentScenario(nextScenario);
            setScenarioQueue(remainingQueue);

            // Generate replacement in background (only if online)
            if ('requestIdleCallback' in window && network.isOnline) {
                requestIdleCallback(() => {
                    const newScenario = ScenarioGenerator.create(config);
                    if (ScenarioGenerator.validate(newScenario)) {
                        setScenarioQueue(queue => [...queue, newScenario]);
                    }
                });
            }
        } else {
            // Emergency: generate new scenario if queue is empty
            const newScenario = ScenarioGenerator.create(config);
            setCurrentScenario(newScenario);
        }

        // Start replay
        setPhase('REPLAYING');
        audio.playCardDeal(); // 🃏 Deal sound for new hand
        setTimeout(() => startReplay(), 100);
    }, [scenarioQueue, config, startReplay, audio]);

    /**
     * 🎨 Get current visual state
     */
    const getCurrentState = useCallback(() => {
        if (!currentScenario) return null;

        const visibleActions = currentScenario.actionLog.slice(0, replayIndex + 1);
        const lastAction = visibleActions[visibleActions.length - 1];

        // Calculate current player stacks and bets based on visible actions
        const playersWithCurrentState = currentScenario.players.map(player => {
            let currentStack = player.startingStack;
            let currentBet = 0;
            let hasFolded = false;

            visibleActions.forEach(action => {
                if (action.playerSeat === player.seat) {
                    if (action.type === 'BET' || action.type === 'RAISE' || action.type === 'CALL' || action.type === 'ALL_IN') {
                        currentStack -= action.amount;
                        currentBet += action.amount;
                    } else if (action.type === 'FOLD') {
                        hasFolded = true;
                    }
                }
            });

            return {
                ...player,
                stack: currentStack,
                currentBet: currentBet,
                hasFolded: hasFolded
            };
        });

        return {
            players: playersWithCurrentState,
            pot: lastAction?.potAfter || 0,
            lastAction,
            visibleActions
        };
    }, [currentScenario, replayIndex]);

    const state = getCurrentState();

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER: INTRO PHASE
    // ═══════════════════════════════════════════════════════════════════════════
    if (phase === 'INTRO') {
        const canStart = assets.isReady && currentScenario !== null;

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
                        scale: [1, 1.05, 1],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut'
                    }}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center'
                    }}
                >
                    {/* Logo */}
                    <div style={{
                        fontSize: '48px',
                        fontWeight: 900,
                        background: 'linear-gradient(135deg, #00d4ff, #FFD700)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        SMARTER.POKER
                    </div>

                    {/* Status Text */}
                    <div style={{ fontSize: '14px', color: '#888', marginTop: '12px' }}>
                        {assets.isReady
                            ? 'Ready to play!'
                            : `Loading assets... ${assets.loadedCount}/${assets.totalCount}`}
                    </div>

                    {/* 📊 PROGRESS BAR */}
                    <div style={{
                        width: '200px',
                        height: '4px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '2px',
                        marginTop: '16px',
                        overflow: 'hidden'
                    }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${assets.progress}%` }}
                            transition={{ duration: 0.3 }}
                            style={{
                                height: '100%',
                                background: assets.isReady
                                    ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                    : 'linear-gradient(90deg, #00d4ff, #0099cc)',
                                borderRadius: '2px'
                            }}
                        />
                    </div>

                    {/* 🔓 START GAME BUTTON - Only enabled when ready */}
                    <motion.button
                        onClick={() => {
                            if (!canStart) return;
                            audio.unlock();
                            setPhase('REPLAYING');
                            startReplay();
                        }}
                        whileHover={canStart ? { scale: 1.05 } : {}}
                        whileTap={canStart ? { scale: 0.95 } : {}}
                        style={{
                            marginTop: '24px',
                            padding: '16px 48px',
                            fontSize: '18px',
                            fontWeight: 700,
                            background: canStart
                                ? 'linear-gradient(135deg, #00d4ff, #0099cc)'
                                : 'linear-gradient(135deg, #444, #333)',
                            border: 'none',
                            borderRadius: '12px',
                            color: canStart ? '#fff' : '#666',
                            cursor: canStart ? 'pointer' : 'not-allowed',
                            boxShadow: canStart ? '0 0 30px rgba(0, 212, 255, 0.5)' : 'none',
                            opacity: canStart ? 1 : 0.6
                        }}
                    >
                        {canStart ? '🎮 START GAME' : '⏳ Loading...'}
                    </motion.button>

                    {/* Failed Assets Warning (subtle) */}
                    {assets.failedAssets.length > 0 && assets.isReady && (
                        <div style={{
                            fontSize: '11px',
                            color: '#f59e0b',
                            marginTop: '12px',
                            opacity: 0.7
                        }}>
                            ⚠️ {assets.failedAssets.length} assets using fallbacks
                        </div>
                    )}
                </motion.div>
            </motion.div>
        );
    }

    if (!state || !currentScenario) {
        return <div style={{ color: '#fff', padding: '20px' }}>Loading scenario...</div>;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER: MAIN GAME VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <motion.div
            animate={cameraShake ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
            transition={{ duration: 0.5 }}
            style={{
                width: '100%',
                height: '100vh',
                background: '#0a1628',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            {/* 📴 OFFLINE BADGE */}
            <OfflineBadge isVisible={network.isOfflineMode} />

            {/* ═══ HEADER ═══ */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                background: 'rgba(0,0,0,0.8)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                zIndex: 100
            }}>
                {/* Left: Game Info + Streak */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ color: '#00d4ff', fontWeight: 700 }}>
                        {getTableFormatName((currentScenario?.tableSize || 9) as TableSize)} • {currentScenario.config.bigBlind}BB
                    </div>
                    {/* 🔥 STREAK FIRE ICON */}
                    {progression.isStreakOnFire() && (
                        <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#fff'
                            }}
                        >
                            🔥 {progression.state.streak.currentStreak} Day Streak!
                        </motion.div>
                    )}
                </div>

                {/* Right: Stats + Mute */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* XP Display */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#a855f7',
                        fontWeight: 700,
                        fontSize: '14px'
                    }}>
                        ⚡ {progression.state.totalXP.toLocaleString()} XP
                    </div>

                    {/* Diamonds Display */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#00d4ff',
                        fontWeight: 700,
                        fontSize: '14px'
                    }}>
                        💎 {progression.state.totalDiamonds.toLocaleString()}
                    </div>

                    {/* Score */}
                    <div style={{ color: '#FFD700', fontWeight: 700 }}>
                        {totalCorrect}/{totalQuestions} Correct
                    </div>

                    {/* 🔇 MUTE BUTTON */}
                    <button
                        onClick={() => audio.toggleMute()}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '16px'
                        }}
                    >
                        {audio.isMuted ? '🔇' : '🔊'}
                    </button>
                </div>
            </div>

            {/* ═══ POT DISPLAY ═══ */}
            <motion.div
                animate={showChipSweep ? { scale: 0, y: chipSweepTarget === 'hero' ? 200 : -200 } : { scale: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                style={{
                    position: 'absolute',
                    top: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '36px',
                    fontWeight: 900,
                    color: '#FFD700',
                    textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
                    zIndex: 50
                }}
            >
                POT: {state.pot}
            </motion.div>

            {/* ═══ GOLD BURST EFFECT ═══ */}
            <AnimatePresence>
                {showGoldBurst && (
                    <motion.div
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 3, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        style={{
                            position: 'absolute',
                            bottom: '200px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, #FFD700 0%, transparent 70%)',
                            zIndex: 200
                        }}
                    />
                )}
            </AnimatePresence>

            {/* ═══ RESULT BANNER ═══ */}
            <AnimatePresence>
                {(phase === 'SHOWING_RESULT' || phase === 'SHOWING_GTO') && isCorrect !== null && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        style={{
                            position: 'absolute',
                            top: '150px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            padding: '16px 48px',
                            borderRadius: '12px',
                            fontSize: '28px',
                            fontWeight: 900,
                            color: '#fff',
                            background: isCorrect
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : 'linear-gradient(135deg, #ef4444, #dc2626)',
                            boxShadow: isCorrect
                                ? '0 0 30px rgba(34, 197, 94, 0.5)'
                                : '0 0 30px rgba(239, 68, 68, 0.5)',
                            zIndex: 100,
                            textAlign: 'center'
                        }}
                    >
                        <div>{isCorrect ? '✓ CORRECT!' : '✗ MISTAKE'}</div>
                        {/* 💰 REWARD BREAKDOWN */}
                        {isCorrect && lastReward && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    marginTop: '8px',
                                    color: '#FFD700'
                                }}
                            >
                                {lastReward.displayText}
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 🕳️ LEAK DETECTION BADGE */}
            <AnimatePresence>
                {showLeakBadge && currentLeak && (
                    <motion.div
                        initial={{ x: 100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 100, opacity: 0 }}
                        style={{
                            position: 'absolute',
                            top: '200px',
                            right: '20px',
                            maxWidth: '280px',
                            padding: '12px 16px',
                            background: currentLeak.severity === 'critical'
                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(185, 28, 28, 0.9))'
                                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(217, 119, 6, 0.9))',
                            borderRadius: '12px',
                            color: '#fff',
                            zIndex: 150
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '8px',
                            fontWeight: 700,
                            fontSize: '14px'
                        }}>
                            {currentLeak.severity === 'critical' ? '🚨' : '⚠️'} LEAK DETECTED
                        </div>
                        <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
                            {currentLeak.message}
                        </div>
                        <div style={{
                            fontSize: '11px',
                            marginTop: '8px',
                            opacity: 0.8
                        }}>
                            {Math.round(currentLeak.failureRate * 100)}% error rate in last {currentLeak.attemptCount} attempts
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ PLAYERS ═══ */}
            <div style={{ position: 'absolute', inset: '80px 20px 250px 20px' }}>
                {state.players.map((player, index) => {
                    const isHero = player.isHero;
                    const tableSize = (currentScenario?.tableSize || 9) as TableSize;
                    const seatLayout = SEAT_LAYOUTS[tableSize];

                    // Get position from seat layout, fallback to calculated position
                    const seatPosition = seatLayout[index];
                    const x = seatPosition?.x ?? 50;
                    const y = seatPosition?.y ?? 50;

                    return (
                        <motion.div
                            key={player.seat}
                            animate={isHero && showGoldBurst ? { scale: [1, 1.1, 1] } : {}}
                            style={{
                                position: 'absolute',
                                left: `${x}%`,
                                top: `${y}%`,
                                transform: 'translate(-50%, -50%)',
                                padding: '12px 16px',
                                background: isHero
                                    ? 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,0,0,0.9))'
                                    : 'rgba(0, 0, 0, 0.85)',
                                border: `2px solid ${isHero ? '#00d4ff' : player.hasFolded ? '#666' : '#FFD700'}`,
                                borderRadius: '12px',
                                color: '#fff',
                                opacity: player.hasFolded ? 0.5 : 1,
                                minWidth: '80px',
                                textAlign: 'center'
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{player.name}</div>
                            <div style={{ color: '#FFD700', fontSize: '16px', fontWeight: 700 }}>
                                {player.stack}
                            </div>
                            {player.currentBet > 0 && (
                                <div style={{ color: '#00d4ff', fontSize: '12px' }}>
                                    Bet: {player.currentBet}
                                </div>
                            )}
                            {player.hasFolded && (
                                <div style={{ color: '#ff4444', fontSize: '11px' }}>FOLDED</div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* ═══ QUESTION ═══ */}
            {phase === 'AWAITING_DECISION' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        position: 'absolute',
                        bottom: '180px',
                        left: '20px',
                        right: '20px',
                        padding: '16px 24px',
                        background: 'rgba(0, 0, 0, 0.9)',
                        border: '2px solid #00d4ff',
                        borderRadius: '12px',
                        textAlign: 'center',
                        color: '#fff',
                        fontSize: '16px',
                        lineHeight: 1.5
                    }}
                >
                    {currentScenario.question}
                </motion.div>
            )}

            {/* ═══ ACTION BUTTONS ═══ */}
            {phase === 'AWAITING_DECISION' && (
                <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '20px',
                    right: '20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px'
                }}>
                    {(['FOLD', 'CALL', 'RAISE', 'ALL_IN'] as const).map(action => (
                        <motion.button
                            key={action}
                            onClick={() => handleDecision(action)}
                            disabled={buttonsDisabled}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                padding: '18px',
                                fontSize: '16px',
                                fontWeight: 700,
                                border: 'none',
                                borderRadius: '12px',
                                cursor: buttonsDisabled ? 'not-allowed' : 'pointer',
                                color: '#fff',
                                opacity: buttonsDisabled ? 0.5 : 1,
                                background: action === 'FOLD'
                                    ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                                    : action === 'CALL'
                                        ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                                        : action === 'RAISE'
                                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                            : 'linear-gradient(135deg, #f59e0b, #d97706)'
                            }}
                        >
                            {action.replace('_', ' ')}
                        </motion.button>
                    ))}
                </div>
            )}

            {/* ═══ GTO ANALYSIS CARD ═══ */}
            <AnimatePresence>
                {showGTOCard && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        style={{
                            position: 'absolute',
                            bottom: '80px',
                            left: '20px',
                            right: '20px',
                            background: 'rgba(0, 0, 0, 0.95)',
                            border: '2px solid #00d4ff',
                            borderRadius: '12px',
                            overflow: 'hidden'
                        }}
                    >
                        {/* GTO Card Header */}
                        <div
                            onClick={() => setGtoCardExpanded(!gtoCardExpanded)}
                            style={{
                                padding: '14px 20px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                background: 'rgba(0, 212, 255, 0.1)'
                            }}
                        >
                            <span style={{ color: '#00d4ff', fontWeight: 700 }}>
                                📊 GTO Analysis
                            </span>
                            <span style={{ color: '#666' }}>
                                {gtoCardExpanded ? '▼' : '▶'}
                            </span>
                        </div>

                        {/* GTO Card Content */}
                        <AnimatePresence>
                            {gtoCardExpanded && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    <div style={{ padding: '16px 20px' }}>
                                        {/* User's Line */}
                                        <div style={{ marginBottom: '12px' }}>
                                            <div style={{ color: '#888', fontSize: '12px' }}>YOUR ACTION</div>
                                            <div style={{
                                                color: isCorrect ? '#22c55e' : '#ef4444',
                                                fontSize: '18px',
                                                fontWeight: 700
                                            }}>
                                                {userAction?.replace('_', ' ')}
                                            </div>
                                        </div>

                                        {/* GTO Line */}
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ color: '#888', fontSize: '12px' }}>GTO OPTIMAL</div>
                                            <div style={{
                                                color: '#00d4ff',
                                                fontSize: '18px',
                                                fontWeight: 700
                                            }}>
                                                {currentScenario.correctAction.replace('_', ' ')}
                                            </div>
                                        </div>

                                        {/* Alternate Lines */}
                                        <div style={{
                                            borderTop: '1px solid #333',
                                            paddingTop: '12px',
                                            color: '#888',
                                            fontSize: '13px',
                                            lineHeight: 1.6
                                        }}>
                                            <div style={{ color: '#FFD700', marginBottom: '4px' }}>
                                                Alternative Lines:
                                            </div>
                                            <div>• CALL is 2nd best (+0.3 EV)</div>
                                            <div>• FOLD is break-even (-0.1 EV)</div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ NEXT HAND BUTTON ═══ */}
            <AnimatePresence>
                {showNextHandButton && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{
                            opacity: 1,
                            scale: [1, 1.05, 1],
                        }}
                        transition={{
                            scale: { repeat: Infinity, duration: 1.5 }
                        }}
                        onClick={handleNextHand}
                        style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            padding: '16px 48px',
                            fontSize: '18px',
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #FFD700, #f59e0b)',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#000',
                            cursor: 'pointer',
                            boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
                            zIndex: 200
                        }}
                    >
                        NEXT HAND →
                    </motion.button>
                )}
            </AnimatePresence>

            {/* ═══ DEBUG INFO ═══ */}
            <div style={{
                position: 'absolute',
                top: '70px',
                right: '10px',
                fontSize: '11px',
                color: '#444',
                fontFamily: 'monospace',
                textAlign: 'right'
            }}>
                Phase: {phase}<br />
                Queue: {scenarioQueue.length}/10<br />
                Replay: {replayIndex + 1}/{currentScenario.actionLog.length}
            </div>
        </motion.div>
    );
}
