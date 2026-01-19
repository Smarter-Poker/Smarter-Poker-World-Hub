/**
 * 🎮 TRAINING PLAY PAGE — Full Supabase Integration
 * 
 * Loads questions from 4000+ PioSolver solved hands in Supabase.
 * Uses iframe for 9-max games (golden template), React for others.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import feedback, { EFFECT_STYLES, screenEffects } from '../../../../src/engine/HapticsFeedback';
import { getQuestionsForGame } from '../../../../src/data/QUESTIONS_LIBRARY';
import { WorldNavHeader } from '../../../../src/components/navigation/WorldNavHeader';
import { getPlayerCount } from '../../../../src/data/PLAYER_COUNT_MAP';
import { generateLevelQuiz } from '../../../../lib/god-mode-service';
import { supabase } from '../../../../src/lib/supabase';
import UniversalTrainingTable from '../../../../src/components/training/UniversalTrainingTable';

// Constants
const TIME_PER_QUESTION = 21;
const QUESTIONS_PER_RUN = 20;
const PASS_THRESHOLD = 85;

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;
    const { recordSession, getGameProgress } = useTrainingProgress();
    const arenaRef = useRef(null);
    const iframeRef = useRef(null);

    // State
    const [game, setGame] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
    const [showResult, setShowResult] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isComplete, setIsComplete] = useState(false);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [xpEarned, setXpEarned] = useState(0);
    const [showXPBurst, setShowXPBurst] = useState(false);
    const [lastXP, setLastXP] = useState(0);
    const [playerCount, setPlayerCount] = useState(6);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    const timerRef = useRef(null);
    const currentScenario = questions[questionIndex] || questions[0];

    // Get user ID from Supabase auth (non-blocking)
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
                setUserId(data.user.id);
            }
        }).catch(() => {
            console.warn('⚠️ Could not get user, will use fallback questions');
        });
    }, []);

    // Load game and questions immediately - don't wait for Supabase
    useEffect(() => {
        async function loadGame() {
            if (!gameId) return;

            const foundGame = getGameById(gameId);
            if (!foundGame) {
                console.warn('❌ Game not found:', gameId);
                setLoading(false);
                return;
            }

            setGame(foundGame);
            setPlayerCount(getPlayerCount(gameId));

            // Always load fallback questions first (no waiting for Supabase)
            console.log('📚 Loading questions for game:', gameId);
            const gameQuestions = getQuestionsForGame(gameId);

            if (gameQuestions && gameQuestions.length > 0) {
                console.log(`✅ Loaded ${gameQuestions.length} static questions`);
                setQuestions(gameQuestions);
            } else {
                // Ultimate fallback - create sample questions
                console.log('📖 Using sample fallback questions');
                setQuestions([{
                    id: 'fallback-1', title: 'GTO Decision', scenario: 'What is your best move?',
                    situation: 'You are on the button with 20BB', heroCards: ['Ah', 'Kh'], board: [],
                    potSize: 12, heroPosition: 'BTN', heroStack: 20,
                    options: [
                        { id: 'fold', text: 'FOLD', isCorrect: false },
                        { id: 'call', text: 'CALL', isCorrect: false },
                        { id: 'raise', text: 'RAISE', isCorrect: true },
                        { id: 'all-in', text: 'ALL-IN', isCorrect: false },
                    ],
                    explanation: 'Raise is correct with premium hands.',
                }]);
            }
            setLoading(false);
        }

        loadGame();
    }, [gameId]); // Only depends on gameId - loads immediately

    // Optional: Upgrade to Supabase questions when userId becomes available
    useEffect(() => {
        async function upgradeToSupabase() {
            if (!userId || !gameId || questions.length === 0) return;

            try {
                console.log('🎯 Attempting to upgrade to Supabase questions...');
                const levelId = getLevelIdFromGameId(gameId);
                const quiz = await generateLevelQuiz(userId, levelId);

                if (quiz?.questions && quiz.questions.length > 0) {
                    console.log(`✅ Upgraded to ${quiz.questions.length} Supabase questions`);
                    const transformed = quiz.questions.map((q, idx) => ({
                        id: q.scenario_hash || `q-${idx}`,
                        title: q.level_name || 'GTO Decision',
                        scenario: `${q.street || 'Flop'} - ${q.board_cards?.join(' ') || 'Preflop'}`,
                        situation: `Stack: ${q.stack_depth}BB | ${q.game_type || 'Cash'} Game`,
                        heroCards: q.hero_cards || ['Ah', 'Kh'],
                        board: q.board_cards || [],
                        potSize: q.pot_size || 12,
                        heroPosition: q.position || 'BTN',
                        heroStack: q.stack_depth || 40,
                        options: [
                            { id: 'fold', text: 'FOLD', isCorrect: q.best_action === 'Fold', ev: q.fold_ev || 0 },
                            { id: 'call', text: 'CALL', isCorrect: q.best_action === 'Call', ev: q.call_ev || 0 },
                            { id: 'raise', text: 'RAISE', isCorrect: q.best_action === 'Raise', ev: q.raise_ev || 0 },
                            { id: 'all-in', text: 'ALL-IN', isCorrect: q.best_action === 'AllIn', ev: q.allin_ev || 0 },
                        ],
                        explanation: `Best action: ${q.best_action || 'Check'} based on GTO analysis.`,
                        is_review: q.is_review || false,
                    }));
                    setQuestions(transformed);
                }
            } catch (error) {
                console.warn('⚠️ Could not upgrade to Supabase questions:', error);
                // Keep using fallback - no action needed
            }
        }

        upgradeToSupabase();
    }, [userId]); // Only runs when userId changes (becomes available)

    // Map gameId to levelId
    function getLevelIdFromGameId(gameId) {
        const mapping = {
            'flop-mastery': 1, 'turn-tactics': 2, 'river-play': 3,
            'full-street-mix': 4, 'advanced-flops': 5, 'advanced-turns': 6,
            'mtt-fundamentals': 7, 'mtt-turn-play': 8, 'short-stack': 9, 'cash-mastery': 10,
        };
        return mapping[gameId] || 1;
    }

    // Timer
    useEffect(() => {
        if (showResult || isComplete || loading) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0.1) {
                    handleAnswer(null);
                    return 0;
                }
                return prev - 0.1;
            });
        }, 100);

        return () => clearInterval(timerRef.current);
    }, [questionIndex, showResult, isComplete, loading]);

    // Handle answer
    const handleAnswer = useCallback((optionId) => {
        if (showResult || !currentScenario?.options) return;
        clearInterval(timerRef.current);
        feedback.tap();

        const correct = currentScenario.options.find(o => o.id === optionId);
        const isCorrect = correct?.isCorrect || false;

        setSelectedAnswer(optionId);
        setShowResult(true);

        if (isCorrect) {
            feedback.correct();
            screenEffects.flash(arenaRef.current, 'green');
            setCorrectCount(prev => prev + 1);
            const newStreak = streak + 1;
            setStreak(newStreak);
            setBestStreak(prev => Math.max(prev, newStreak));

            const baseXP = 100;
            const streakMultiplier = newStreak >= 10 ? 2.5 : newStreak >= 7 ? 2.0 : newStreak >= 5 ? 1.75 : newStreak >= 3 ? 1.5 : 1.0;
            const speedMultiplier = timeLeft > TIME_PER_QUESTION * 0.8 ? 2.0 : timeLeft > TIME_PER_QUESTION * 0.6 ? 1.5 : 1.0;
            const earned = Math.round(baseXP * streakMultiplier * speedMultiplier);

            setLastXP(earned);
            setXpEarned(prev => prev + earned);
            setShowXPBurst(true);
            setTimeout(() => setShowXPBurst(false), 800);
        } else {
            feedback.incorrect();
            screenEffects.shake(arenaRef.current, 'medium');
            screenEffects.flash(arenaRef.current, 'red');
            setStreak(0);
        }
    }, [showResult, currentScenario, streak, timeLeft]);

    // Next question
    const handleNext = useCallback(() => {
        feedback.tap();

        if (questionIndex + 1 >= QUESTIONS_PER_RUN) {
            setIsComplete(true);
            const accuracy = Math.round((correctCount / QUESTIONS_PER_RUN) * 100);
            const passed = accuracy >= PASS_THRESHOLD;

            if (passed) feedback.levelUp();

            recordSession(gameId, {
                accuracy, score: correctCount, xpEarned, bestStreak, passed, level: 1,
            });
        } else {
            setQuestionIndex(prev => prev + 1);
            setShowResult(false);
            setSelectedAnswer(null);
            setTimeLeft(TIME_PER_QUESTION);
        }
    }, [questionIndex, correctCount, xpEarned, bestStreak, gameId, recordSession]);

    const handleExit = useCallback(() => {
        feedback.tap();
        router.push('/hub/training');
    }, [router]);

    // PostMessage handler for 9-max iframe
    useEffect(() => {
        if (playerCount !== 9) return;

        function handleMessage(event) {
            if (!event.data || typeof event.data !== 'object') return;
            const { type, data } = event.data;

            switch (type) {
                case 'TEMPLATE_READY':
                    console.log('📤 Template ready, sending game data...');
                    sendGameDataToIframe();
                    break;
                case 'ANSWER_SELECTED':
                    console.log('📥 Answer received:', data.answerId);
                    handleAnswer(data.answerId);
                    break;
                case 'NEXT_QUESTION':
                    handleNext();
                    break;
                case 'EXIT_GAME':
                    handleExit();
                    break;
                // LAW 1: Leak-Fixer Intercept
                case 'LEAKS_DETECTED':
                    console.log('[LAW 1] 🎯 Leaks detected from template:', data.leaks);
                    // Store leaks for remediation routing
                    if (data.leaks?.length > 0) {
                        try {
                            localStorage.setItem('pokeriq_detected_leaks', JSON.stringify(data.leaks));
                            // If high-confidence leak (≥0.9), show intercept notification
                            const criticalLeak = data.leaks.find(l => l.confidence >= 0.9);
                            if (criticalLeak) {
                                console.log('[LAW 1] Critical leak detected:', criticalLeak.name);
                                // Future: Trigger remediation intercept UI
                            }
                        } catch (e) { }
                    }
                    break;
            }
        }

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [playerCount, handleAnswer, handleNext, handleExit]);

    // Send game data to iframe
    const sendGameDataToIframe = useCallback(() => {
        if (!iframeRef.current?.contentWindow || !currentScenario) return;

        iframeRef.current.contentWindow.postMessage({
            type: 'GAME_DATA',
            data: {
                question: currentScenario,
                questionIndex,
                totalQuestions: QUESTIONS_PER_RUN,
                timeLimit: TIME_PER_QUESTION,
                gameName: game?.name || 'Training',
                streak, xpEarned, showResult, selectedAnswer, isComplete,
            }
        }, '*');
    }, [currentScenario, questionIndex, game, streak, xpEarned, showResult, selectedAnswer, isComplete]);

    // Update iframe when state changes
    useEffect(() => {
        if (playerCount === 9 && iframeRef.current?.contentWindow) {
            sendGameDataToIframe();
        }
    }, [playerCount, currentScenario, questionIndex, showResult, selectedAnswer, isComplete, sendGameDataToIframe]);

    // Loading state
    if (loading || !game || questions.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a1628' }}>
                <motion.div
                    style={{ width: 50, height: 50, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
            </div>
        );
    }

    // 9-max games: Use iframe template
    if (playerCount === 9) {
        return (
            <>
                <Head>
                    <title>{game.name} — PokerIQ</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                </Head>
                <style>{`
                    html, body { margin: 0; padding: 0; width: 100%; height: 100vh; overflow: hidden; }
                    iframe { border: none; width: 100%; height: 100vh; display: block; }
                `}</style>
                <iframe
                    ref={iframeRef}
                    src={`/templates/training_game_template.html?gameId=${gameId}&gameName=${encodeURIComponent(game.name)}&v=4`}
                    title={game.name}
                    onLoad={() => {
                        console.log('🖼️ Template iframe loaded');
                        setTimeout(sendGameDataToIframe, 100);
                    }}
                />
            </>
        );
    }

    // Completion screen
    if (isComplete) {
        const accuracy = Math.round((correctCount / QUESTIONS_PER_RUN) * 100);
        const passed = accuracy >= PASS_THRESHOLD;

        return (
            <>
                <Head><title>{passed ? 'Level Passed!' : 'Try Again'}</title></Head>
                <style>{EFFECT_STYLES}</style>
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', color: '#fff' }}>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 80, marginBottom: 16 }}>{passed ? '🏆' : '🔄'}</div>
                        <h1 style={{ fontSize: 32, color: passed ? '#4CAF50' : '#fff' }}>{passed ? 'LEVEL PASSED!' : 'TRY AGAIN'}</h1>
                        <div style={{ fontSize: 56, fontWeight: 800, color: passed ? '#4CAF50' : '#FF6B35' }}>{accuracy}%</div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                            {correctCount}/{QUESTIONS_PER_RUN} • Best streak: {bestStreak} • {xpEarned.toLocaleString()} XP
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            {!passed && (
                                <motion.button
                                    style={{ padding: '16px 32px', background: '#FF6B35', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                    onClick={() => { setQuestionIndex(0); setCorrectCount(0); setStreak(0); setBestStreak(0); setXpEarned(0); setIsComplete(false); setShowResult(false); setTimeLeft(TIME_PER_QUESTION); }}
                                    whileHover={{ scale: 1.05 }}
                                >RETRY</motion.button>
                            )}
                            <motion.button
                                style={{ padding: '16px 32px', background: '#2563EB', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                onClick={handleExit}
                                whileHover={{ scale: 1.05 }}
                            >{passed ? 'CONTINUE' : 'BACK'}</motion.button>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    }

    // Use UniversalTrainingTable for all games
    return (
        <>
            <Head>
                <title>{game?.name || 'Training'} — PokerIQ</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <UniversalTrainingTable
                gameId={gameId}
                onAnswer={handleAnswer}
            />
        </>
    );
}
