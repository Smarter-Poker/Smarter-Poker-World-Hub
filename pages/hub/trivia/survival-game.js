/**
 * SURVIVAL MODE - 10 Level Progressive Trivia Game
 * Route: /hub/trivia/survival-game
 * 
 * System:
 * - 10 Levels, 20 questions each
 * - Level 1: 85% accuracy (17/20 correct)
 * - Each level adds 2% until Level 8: 99% (20/20 - can miss 0)
 * - Levels 9-10: 100% accuracy required (20/20)
 * - Increasing difficulty as levels progress
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import { busEmit } from '../../../src/engine/EventBus';

/** Shuffle answer options so correct answer isn't always A */
function shuffleOptions(questions) {
    return questions.map(q => {
        const opts = [...q.options];
        const correctText = opts[q.correct_index];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return { ...q, options: opts, correct_index: opts.indexOf(correctText) };
    });
}

// Level configuration: 10 levels, starting at 85%, +2% per level
const LEVEL_CONFIG = [
    { level: 1, accuracyRequired: 85, minCorrect: 17, difficulty: 'easy' },
    { level: 2, accuracyRequired: 87, minCorrect: 18, difficulty: 'easy' },
    { level: 3, accuracyRequired: 89, minCorrect: 18, difficulty: 'medium' },
    { level: 4, accuracyRequired: 91, minCorrect: 19, difficulty: 'medium' },
    { level: 5, accuracyRequired: 93, minCorrect: 19, difficulty: 'medium' },
    { level: 6, accuracyRequired: 95, minCorrect: 19, difficulty: 'hard' },
    { level: 7, accuracyRequired: 97, minCorrect: 20, difficulty: 'hard' },
    { level: 8, accuracyRequired: 99, minCorrect: 20, difficulty: 'hard' },
    { level: 9, accuracyRequired: 100, minCorrect: 20, difficulty: 'hard' },
    { level: 10, accuracyRequired: 100, minCorrect: 20, difficulty: 'hard' }
];

const QUESTIONS_PER_LEVEL = 20;

export default function SurvivalGamePage() {
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, levelComplete, gameOver, victory
    const [currentLevel, setCurrentLevel] = useState(1);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [incorrectCount, setIncorrectCount] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [totalDiamondsEarned, setTotalDiamondsEarned] = useState(0);

    // 50/50 Lifeline state
    const [fiftyFiftyUsedFree, setFiftyFiftyUsedFree] = useState(false); // One free per level
    const [eliminatedOptions, setEliminatedOptions] = useState([]); // Indices of eliminated wrong answers
    const [userDiamonds, setUserDiamonds] = useState(0); // Current diamond balance

    // Lifeline usage tracking (max 3 per level, all cost 5💎)
    const [lifelinesUsedThisLevel, setLifelinesUsedThisLevel] = useState(0);
    const LIFELINE_COST = 5;
    const MAX_LIFELINES_PER_LEVEL = 3;

    // Skip Question Lifeline state
    const [skipUsedThisQuestion, setSkipUsedThisQuestion] = useState(false);

    // Double Chance Lifeline state
    const [doubleChanceActive, setDoubleChanceActive] = useState(false);
    const [doubleChanceUsedThisQuestion, setDoubleChanceUsedThisQuestion] = useState(false);
    const [firstAttemptWrong, setFirstAttemptWrong] = useState(null);

    // 24-Second Shot Clock State
    const [timeLeft, setTimeLeft] = useState(24);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [screenShake, setScreenShake] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Visibility-based pause
    const timerRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);

    // Game Settings (persist to localStorage)
    const [settings, setSettings] = useState({
        haptics: true,      // Vibration feedback
        audio: true,        // Heartbeat sounds
        screenShake: true,  // Screen shake effect
        intensity: 'high'   // 'low', 'medium', 'high'
    });

    // Speed Bonus State
    const [speedBonus, setSpeedBonus] = useState(0);      // Bonus diamonds from fast answers
    const [lastAnswerTime, setLastAnswerTime] = useState(null); // Track answer speed
    const [showSpeedBonus, setShowSpeedBonus] = useState(false); // Show bonus animation

    // User state
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [userProgress, setUserProgress] = useState({ highestLevel: 0 });
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    const startTimeRef = useRef(null);

    // Initialize
    useEffect(() => {
        if (authLoading) return;
        const user = avatarUser || getAuthUser();
        if (user) {
            setUserId(user.id);
            loadUserProgress(user.id);
            loadUserDiamonds(user.id);
            // Check VIP status
            (async () => {
                await DiamondEngine.init(user.id);
                const v = await DiamondEngine.isVIP();
                setIsVip(v);
            })();
        }
        // Load settings from localStorage
        try {
            const savedSettings = localStorage.getItem('trivia_settings');
            if (savedSettings) {
                setSettings(JSON.parse(savedSettings));
            }
        } catch (e) { console.error("[survival-game.js]", e); }
    }, [avatarUser?.id, authLoading]);

    // Save settings to localStorage when changed
    useEffect(() => {
        try {
            localStorage.setItem('trivia_settings', JSON.stringify(settings));
        } catch (e) { console.error("[survival-game.js]", e); }
    }, [settings]);

    // Visibility-based timer pause (when user leaves app/tab)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && isTimerRunning) {
                setIsPaused(true);
                setIsTimerRunning(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isTimerRunning]);

    // Shot Clock Timer Effect - 24 seconds with haptics/audio/shake (respects settings)
    useEffect(() => {
        if (!isTimerRunning || showResult) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            setScreenShake(false);
            return;
        }

        // Intensity multipliers
        const intensityMultiplier = settings.intensity === 'high' ? 1 : settings.intensity === 'medium' ? 0.6 : 0.3;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                const newTime = prev - 1;

                // Haptic feedback every second (if enabled)
                if (settings.haptics && 'vibrate' in navigator) {
                    const baseVibration = newTime <= 3 ? 100 : newTime <= 8 ? 50 : 20;
                    navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
                }

                // Screen shake at 3 seconds (if enabled)
                if (settings.screenShake && newTime <= 3 && newTime > 0) setScreenShake(true);
                else setScreenShake(false);

                // Time's up - auto fail
                if (newTime <= 0) {
                    clearInterval(timerRef.current);
                    clearInterval(heartbeatIntervalRef.current);
                    handleTimeOut();
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        // Heartbeat audio at 8 seconds - speeds up (if enabled)
        if (settings.audio && timeLeft <= 8 && timeLeft > 0) {
            const playHeartbeat = () => {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 80;
                    osc.type = 'sine';
                    // Volume based on intensity
                    const volume = 0.3 * intensityMultiplier;
                    gain.gain.setValueAtTime(volume, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.15);
                } catch (e) { console.error("[survival-game.js]", e); }
            };
            const speed = Math.max(200, 600 - ((8 - timeLeft) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(playHeartbeat, speed);
            playHeartbeat();
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        };
    }, [isTimerRunning, showResult, timeLeft, settings]);

    // Handle timeout - count as wrong answer
    function handleTimeOut() {
        setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);

        setIncorrectCount(prev => prev + 1);
        setShowResult(true);

        const config = LEVEL_CONFIG[currentLevel - 1];
        const remainingQuestions = QUESTIONS_PER_LEVEL - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCount + remainingQuestions;

        setTimeout(() => {
            if (currentQuestionIndex + 1 >= QUESTIONS_PER_LEVEL) {
                evaluateLevelResult(correctCount);
            } else if (maxPossibleCorrect < config.minCorrect) {
                setGameState('gameOver');
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                setTimeLeft(24);
                setIsTimerRunning(true);
            }
        }, 1500);
    }

    async function loadUserDiamonds(uid) {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', uid)
                .maybeSingle();
            if (data) setUserDiamonds(data.diamonds || 0);
        } catch (e) {
            // Ignore
        }
    }

    async function loadUserProgress(uid) {
        try {
            const { data } = await supabase
                .from('survival_progress')
                .select('highest_level, last_played')
                .eq('user_id', uid)
                .maybeSingle();
            if (data) {
                setUserProgress({ highestLevel: data.highest_level || 0 });
            }
        } catch (e) {
            // No progress yet, that's fine
        }
    }

    async function loadQuestionsForLevel(level) {
        setIsLoading(true);
        const config = LEVEL_CONFIG[level - 1];

        try {
            // 60-day non-repeat: Get user's recently seen question IDs
            let excludeIds = [];
            if (userId) {
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

                const { data: history } = await supabase
                    .from('trivia_user_question_history')
                    .select('question_id')
                    .eq('user_id', userId)
                    .gte('seen_at', sixtyDaysAgo.toISOString())
                    .limit(200) // survival seen

                if (history) {
                    excludeIds = history.map(h => h.question_id);
                }
            }

            // Get questions with appropriate difficulty based on level
            let query = supabase
                .from('trivia_questions')
                .select('*')
                .limit(500) // question pool
            // Strict difficulty filtering for proper level progression
            // Levels 1-2 (easy): Only easy questions
            // Levels 3-5 (medium): Primarily medium, some easy fallback
            // Levels 6-10 (hard): Only hard questions
            if (config.difficulty === 'easy') {
                query = query.eq('difficulty', 'easy');
            } else if (config.difficulty === 'medium') {
                // Medium levels: prioritize medium, allow easy as fallback
                query = query.in('difficulty', ['medium', 'easy']);
            } else if (config.difficulty === 'hard') {
                // Hard levels: only hard questions for maximum challenge
                query = query.eq('difficulty', 'hard');
            }

            // Fetch more questions to allow for exclusion filtering
            const { data, error } = await query.limit(200);

            if (!error && data) {
                // Filter out recently seen questions
                let available = excludeIds.length > 0
                    ? data.filter(q => !excludeIds.includes(q.id))
                    : data;

                // If not enough unseen questions, fall back to all questions
                if (available.length < QUESTIONS_PER_LEVEL) {
                    available = data;
                }

                if (available.length >= QUESTIONS_PER_LEVEL) {
                    // Shuffle and take 20
                    const shuffled = available.sort(() => Math.random() - 0.5).slice(0, QUESTIONS_PER_LEVEL);
                    setQuestions(shuffleOptions(shuffled));
                } else {
                    // Ultimate fallback: get any questions
                    const { data: fallbackData } = await supabase
                        .from('trivia_questions')
                        .select('*')
                        .limit(QUESTIONS_PER_LEVEL);

                    if (fallbackData) {
                        setQuestions(shuffleOptions(fallbackData.sort(() => Math.random() - 0.5)));
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load questions:', e);
        }
        setIsLoading(false);
    }

    async function startLevel(level) {
        // Per-game diamond gate (VIP bypass) — only charge on level 1 (start of a new run)
        if (level === 1 && !isVip && userId) {
            const result = await DiamondEngine.deduct(10, 'trivia_survival_game');
            if (!result.success) {
                setShowOutOfDiamonds(true);
                return;
            }
        }
        setCurrentLevel(level);
        setCurrentQuestionIndex(0);
        setCorrectCount(0);
        setIncorrectCount(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setFiftyFiftyUsedFree(false);
        setEliminatedOptions([]);
        setLifelinesUsedThisLevel(0); // Reset lifeline counter
        // Reset and start shot clock
        setTimeLeft(24);
        setIsTimerRunning(true);
        setScreenShake(false);
        loadQuestionsForLevel(level);
        setGameState('playing');
        startTimeRef.current = Date.now();
    }

    // 50/50 Lifeline - removes 2 wrong answers
    async function useFiftyFifty() {
        if (eliminatedOptions.length > 0 || showResult) return; // Already used on this question or answered

        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return;

        // Check if we need to pay diamonds
        const needsToPay = fiftyFiftyUsedFree;

        if (needsToPay) {
            // Check if user has enough diamonds
            if (userDiamonds < 5) {
                setShowOutOfDiamonds(true);
                return;
            }
            // Deduct diamonds via audit-safe RPC
            if (userId) {
                try {
                    await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: -5,
                        p_type: 'survival_lifeline',
                        p_description: 'Survival 50/50 lifeline — 5💎',
                        p_reference_id: null
                    });
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsSpent(5, '50/50 Lifeline');
                } catch (e) {
                    console.error('Failed to deduct diamonds:', e);
                    return;
                }
            }
        } else {
            // Mark free use as consumed
            setFiftyFiftyUsedFree(true);
        }

        // Find wrong answer indices (not the correct one)
        const wrongIndices = currentQuestion.options
            .map((_, idx) => idx)
            .filter(idx => idx !== currentQuestion.correct_index);

        // Randomly select 2 to eliminate
        const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
        const toEliminate = shuffled.slice(0, 2);
        setEliminatedOptions(toEliminate);
    }

    // Skip Question Function (costs 5💎)
    async function useSkipQuestion() {
        if (showResult || skipUsedThisQuestion) return;
        if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) {
            alert(`Lifeline limit reached! Only ${MAX_LIFELINES_PER_LEVEL} lifelines per level.`);
            return;
        }
        if (userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        if (userId) {
            try {
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'survival_lifeline',
                    p_description: `Survival skip question — ${LIFELINE_COST}💎`,
                    p_reference_id: null
                });
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, 'Skip Question');
                setLifelinesUsedThisLevel(prev => prev + 1);
            } catch (e) {
                console.error('Failed to deduct diamonds:', e);
                return;
            }
        }

        setSkipUsedThisQuestion(true);
        setIsTimerRunning(false);

        if (currentQuestionIndex < QUESTIONS_PER_LEVEL - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowResult(false);
            setEliminatedOptions([]);
            setSkipUsedThisQuestion(false);
            setDoubleChanceActive(false);
            setDoubleChanceUsedThisQuestion(false);
            setFirstAttemptWrong(null);
            setTimeLeft(24);
            setIsTimerRunning(true);
        }
    }

    async function useDoubleChance() {
        if (showResult || doubleChanceUsedThisQuestion || doubleChanceActive) return;
        if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) {
            alert(`Lifeline limit reached! Only ${MAX_LIFELINES_PER_LEVEL} lifelines per level.`);
            return;
        }
        if (userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        if (userId) {
            try {
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'survival_lifeline',
                    p_description: `Survival double chance — ${LIFELINE_COST}💎`,
                    p_reference_id: null
                });
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, 'Double Chance');
                setLifelinesUsedThisLevel(prev => prev + 1);
            } catch (e) {
                console.error('Failed to deduct diamonds:', e);
                return;
            }
        }

        setDoubleChanceActive(true);
        setDoubleChanceUsedThisQuestion(true);
    }

    function selectAnswer(index) {

        if (selectedAnswer !== null || showResult) return;

        // Stop timer immediately on answer
        setIsTimerRunning(false);
        const answerTime = 24 - timeLeft; // How many seconds it took to answer

        // If Double Chance active and this is first attempt
        if (doubleChanceActive && firstAttemptWrong === null) {
            const currentQuestion = questions[currentQuestionIndex];
            const isCorrect = index === currentQuestion?.correct_index;

            if (!isCorrect) {
                // First wrong attempt - allow second try, reset timer
                setFirstAttemptWrong(index);
                setTimeLeft(24);
                setIsTimerRunning(true);
                return;
            }
        }

        const currentQuestion = questions[currentQuestionIndex];
        const isCorrect = index === currentQuestion?.correct_index;

        setSelectedAnswer(index);
        setShowResult(true);

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            busEmit.decisionCorrect(correctCount + 1);

            // Speed bonus for fast answers (under 10 seconds)
            if (answerTime < 10) {
                const bonus = answerTime <= 3 ? 3 : answerTime <= 5 ? 2 : 1; // 3💎 for ≤3s, 2💎 for ≤5s, 1💎 for <10s
                setSpeedBonus(bonus);
                setShowSpeedBonus(true);
                setTotalDiamondsEarned(prev => prev + bonus);
                setTimeout(() => setShowSpeedBonus(false), 1500);
            }
            setLastAnswerTime(answerTime);
        } else {
            setIncorrectCount(prev => prev + 1);
            busEmit.decisionIncorrect(correctCount);
            busEmit.screenShake('light');
        }

        const config = LEVEL_CONFIG[currentLevel - 1];
        const remainingQuestions = QUESTIONS_PER_LEVEL - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCount + (isCorrect ? 1 : 0) + remainingQuestions;

        setTimeout(() => {
            if (currentQuestionIndex + 1 >= QUESTIONS_PER_LEVEL) {
                const finalCorrect = correctCount + (isCorrect ? 1 : 0);
                evaluateLevelResult(finalCorrect);
            } else if (maxPossibleCorrect < config.minCorrect) {
                setGameState('gameOver');
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                // Reset and restart timer
                setTimeLeft(24);
                setIsTimerRunning(true);
            }
        }, 1200);
    }

    function evaluateLevelResult(finalCorrect) {
        const config = LEVEL_CONFIG[currentLevel - 1];
        const passed = finalCorrect >= config.minCorrect;

        if (passed) {
            // Award diamonds for this level
            const diamonds = currentLevel * 2; // 2, 4, 6, 8, 10, 12, 14, 16, 18, 20 diamonds per level
            setTotalDiamondsEarned(prev => prev + diamonds);

            if (currentLevel >= 10) {
                // Victory!
                setGameState('victory');
                saveProgress(10, totalDiamondsEarned + diamonds);
            } else {
                setGameState('levelComplete');
                saveProgress(currentLevel, totalDiamondsEarned + diamonds);
            }
        } else {
            setGameState('gameOver');
        }
    }

    async function saveProgress(level, diamonds) {
        if (!userId) return;

        try {
            // Update user diamonds via audit-safe RPC
            await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: diamonds,
                p_type: 'survival_reward',
                p_description: `Survival Level ${level} — ${diamonds}💎`,
                p_reference_id: null
            });
            const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
            busEmit.diamondsEarned(diamonds, `Survival Level ${level}`);
            busEmit.celebration('confetti');

            // Upsert survival progress
            await supabase
                .from('survival_progress')
                .upsert({
                    user_id: userId,
                    highest_level: Math.max(level, userProgress.highestLevel),
                    last_played: new Date().toISOString()
                }, { onConflict: 'user_id' });

            setUserProgress(prev => ({
                ...prev,
                highestLevel: Math.max(level, prev.highestLevel)
            }));

            // Record question history for 60-day non-repeat
            if (questions && questions.length > 0) {
                const historyRecords = questions.map(q => ({
                    user_id: userId,
                    question_id: q.id,
                    seen_at: new Date().toISOString(),
                    mode: 'survival'
                }));

                await supabase
                    .from('trivia_user_question_history')
                    .upsert(historyRecords, {
                        onConflict: 'user_id,question_id',
                        ignoreDuplicates: false
                    });
            }
        } catch (e) {
            console.error('Failed to save progress:', e);
        }
    }

    function continueToNextLevel() {
        startLevel(currentLevel + 1);
    }

    function restartFromLevel(level) {
        setTotalDiamondsEarned(0);
        startLevel(level);
    }

    function backToLobby() {
        router.push('/hub/trivia');
    }

    const currentQuestion = questions[currentQuestionIndex];
    const config = LEVEL_CONFIG[currentLevel - 1];
    const progressPercent = ((currentQuestionIndex + 1) / QUESTIONS_PER_LEVEL) * 100;

    return (
        <>
            <SEOHead
                title="Survival Trivia Game"
                description="Play The Survival Trivia Challenge. Answer Correctly Or Lose Your Streak."
                canonical="/hub/trivia/survival-game"
                noindex={true}
            />

            <UniversalHeader pageDepth={2} />

            {/* Per-game cost popup (one-time) */}
            {userId && !isVip && (
                <GameCostPopup userId={userId} featureKey="trivia_survival_game" isVip={isVip} cost={10} />
            )}

            {/* Out of diamonds modal */}
            {showOutOfDiamonds && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 16, padding: 32, textAlign: 'center', maxWidth: 360 }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
                        <h3 style={{ color: '#fff', marginBottom: 8 }}>Not Enough Diamonds</h3>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>Each Game Costs 10💎. Get More Diamonds Or Upgrade To VIP For Unlimited Access!</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #0088FF)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Get Diamonds</button>
                            <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <PageTransition>
                <div style={{
                    minHeight: '100vh',
                    background: "#0a0e1a",
                    backgroundColor: '#000000',
                    padding: '20px'
                }}>
                    <div style={{ maxWidth: '100%', margin: '0 auto' }}>
                        {/* In-game HUD (only visible during gameplay) */}
                        {gameState === 'playing' && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '16px 20px',
                                background: '#242526',
                                border: '1px solid #4e4f50',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                color: '#e4e6eb'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: '#2374e1', fontWeight: 'bold', fontSize: '18px' }}>SURVIVAL MODE</span>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                                    <span style={{ color: '#e69500' }}>Level {currentLevel}</span>
                                    <span style={{ color: '#31a24c' }}>Correct: {correctCount}</span>
                                    <span style={{ color: '#f02849' }}>Wrong: {incorrectCount}</span>
                                    <span style={{ color: '#2374e1' }}>Diamonds: {totalDiamondsEarned}</span>
                                </div>
                            </div>
                        )}

                        {/* Lobby State - Level Select */}
                        {gameState === 'lobby' && (
                            <div>
                                {/* Lobby Image */}
                                <div style={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    marginBottom: '24px',
                                    maxHeight: 'calc(100dvh - 60px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Image src="/images/trivia/lobby-survival.jpg" alt="Survival Mode - 10 Levels Progressive Challenge" width={686} height={1024} className="lobby-image" style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 'calc(100dvh - 60px)', objectFit: 'contain' }} />
                                </div>

                                {/* Accuracy Requirements */}
                                <div style={{
                                    background: '#242526',
                                    border: '1px solid #4e4f50',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '24px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ color: '#2374e1', fontSize: '14px', marginBottom: '8px' }}>
                                        Accuracy Required Per Level
                                    </div>
                                    <div style={{ color: '#b0b3b8', fontSize: '13px' }}>
                                        Lvl 1: 85% → Lvl 5: 93% → Lvl 8: 99% → Lvls 9-10: 100%
                                    </div>
                                    {userProgress.highestLevel > 0 && (
                                        <div style={{ marginTop: '12px', color: '#31a24c' }}>
                                            Your Best: Level {userProgress.highestLevel}
                                        </div>
                                    )}
                                </div>

                                {/* Level Grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: '10px',
                                    marginBottom: '24px'
                                }}>
                                    {LEVEL_CONFIG.map((lvl) => {
                                        const isUnlocked = lvl.level <= userProgress.highestLevel + 1;
                                        const isCompleted = lvl.level <= userProgress.highestLevel;

                                        return (
                                            <button
                                                key={lvl.level}
                                                onClick={() => isUnlocked && startLevel(lvl.level)}
                                                disabled={!isUnlocked}
                                                style={{
                                                    padding: '16px 12px',
                                                    background: isCompleted
                                                        ? 'rgba(49, 162, 76, 0.2)'
                                                        : isUnlocked
                                                            ? 'rgba(35, 116, 225, 0.2)'
                                                            : '#3a3b3c',
                                                    border: `2px solid ${isCompleted ? '#31a24c' : isUnlocked ? '#2374e1' : '#4e4f50'}`,
                                                    borderRadius: '10px',
                                                    color: isUnlocked ? '#e4e6eb' : '#65676b',
                                                    cursor: isUnlocked ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                                                    {isCompleted ? 'Done' : isUnlocked ? lvl.level : 'Locked'}
                                                </div>
                                                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                                                    {lvl.accuracyRequired}%
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => startLevel(Math.min(userProgress.highestLevel + 1, 10))}
                                    disabled={isLoading}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        background: '#2374e1',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(35, 116, 225, 0.4)'
                                    }}
                                >
                                    {isLoading ? 'Loading...' : userProgress.highestLevel > 0
                                        ? `CONTINUE FROM LEVEL ${Math.min(userProgress.highestLevel + 1, 10)}`
                                        : 'START LEVEL 1'}
                                </button>
                            </div>
                        )}

                        {/* Playing State */}
                        {gameState === 'playing' && currentQuestion && (
                            <div style={{
                                animation: screenShake ? 'shake 0.1s infinite' : 'none'
                            }}>
                                <style>{`
                                    @keyframes shake {
                                        0%, 100% { transform: translateX(0); }
                                        25% { transform: translateX(-5px); }
                                        75% { transform: translateX(5px); }
                                    }
                                `}</style>

                                {/* Paused Overlay */}
                                {isPaused && (
                                    <div style={{
                                        position: 'fixed',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        background: 'rgba(0,0,0,0.85)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 1000
                                    }}>
                                        <span style={{ fontSize: '48px', marginBottom: '20px' }}>⏸️</span>
                                        <h2 style={{ color: 'white', marginBottom: '10px' }}>Game Paused</h2>
                                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '20px' }}>
                                            You left the screen. Time remaining: {timeLeft}s
                                        </p>
                                        <button
                                            onClick={() => { setIsPaused(false); setIsTimerRunning(true); }}
                                            style={{
                                                padding: '16px 48px',
                                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                border: 'none',
                                                borderRadius: '12px',
                                                color: 'white',
                                                fontSize: '18px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ▶️ Resume Game
                                        </button>
                                    </div>
                                )}

                                {/* Speed Bonus Animation */}
                                {showSpeedBonus && (
                                    <div style={{
                                        position: 'fixed',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        zIndex: 100,
                                        animation: 'bonusPop 1.5s ease-out forwards',
                                        pointerEvents: 'none'
                                    }}>
                                        <style>{`
                                            @keyframes bonusPop {
                                                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                                                20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                                                80% { transform: translate(-50%, -80%) scale(1); opacity: 1; }
                                                100% { transform: translate(-50%, -100%) scale(0.8); opacity: 0; }
                                            }
                                        `}</style>
                                        <div style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                                            borderRadius: '16px',
                                            boxShadow: '0 8px 32px rgba(251, 191, 36, 0.5)'
                                        }}>
                                            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a' }}>
                                                ⚡ SPEED BONUS +{speedBonus}💎
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Shot Clock Timer */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    {/* Settings Button */}
                                    <button
                                        onClick={() => setSettings(prev => ({ ...prev, showPanel: !prev.showPanel }))}
                                        style={{
                                            width: '36px',
                                            height: '36px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '50%',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '16px'
                                        }}
                                    >
                                        ⚙️
                                    </button>

                                    {/* Timer Display */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '12px 24px',
                                        background: timeLeft <= 3 ? 'rgba(239, 68, 68, 0.3)' :
                                            timeLeft <= 8 ? 'rgba(251, 191, 36, 0.2)' :
                                                'rgba(0, 212, 255, 0.15)',
                                        border: `2px solid ${timeLeft <= 3 ? '#ef4444' :
                                            timeLeft <= 8 ? '#fbbf24' : '#00D4FF'}`,
                                        borderRadius: '50px'
                                    }}>
                                        <span style={{ fontSize: '18px' }}>⏱️</span>
                                        <span style={{
                                            fontSize: '28px',
                                            fontWeight: 'bold',
                                            fontFamily: 'monospace',
                                            color: timeLeft <= 3 ? '#ef4444' :
                                                timeLeft <= 8 ? '#fbbf24' : '#00D4FF',
                                            minWidth: '40px',
                                            textAlign: 'center'
                                        }}>
                                            {timeLeft}
                                        </span>
                                        {lifelinesUsedThisLevel > 0 && (
                                            <span style={{
                                                fontSize: '11px',
                                                color: 'rgba(255,255,255,0.6)',
                                                marginLeft: '8px'
                                            }}>
                                                ⚡{lifelinesUsedThisLevel}/{MAX_LIFELINES_PER_LEVEL}
                                            </span>
                                        )}
                                    </div>

                                    {/* Spacer for symmetry */}
                                    <div style={{ width: '36px' }} />
                                </div>

                                {/* Settings Panel */}
                                {settings.showPanel && (
                                    <div style={{
                                        background: 'rgba(0,0,0,0.8)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        marginBottom: '16px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ color: 'white' }}>🔊 Sound Effects</span>
                                            <button
                                                onClick={() => setSettings(prev => ({ ...prev, audio: !prev.audio }))}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: settings.audio ? '#22c55e' : '#666',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {settings.audio ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ color: 'white' }}>📳 Haptic Vibration</span>
                                            <button
                                                onClick={() => setSettings(prev => ({ ...prev, haptics: !prev.haptics }))}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: settings.haptics ? '#22c55e' : '#666',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {settings.haptics ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ color: 'white' }}>📱 Screen Shake</span>
                                            <button
                                                onClick={() => setSettings(prev => ({ ...prev, screenShake: !prev.screenShake }))}
                                                style={{
                                                    padding: '4px 12px',
                                                    background: settings.screenShake ? '#22c55e' : '#666',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {settings.screenShake ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'white' }}>⚡ Intensity</span>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {['low', 'medium', 'high'].map(level => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setSettings(prev => ({ ...prev, intensity: level }))}
                                                        style={{
                                                            padding: '4px 10px',
                                                            background: settings.intensity === level ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                                                            border: 'none',
                                                            borderRadius: '8px',
                                                            color: 'white',
                                                            fontSize: '11px',
                                                            cursor: 'pointer',
                                                            textTransform: 'capitalize'
                                                        }}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Progress Bar */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 16px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${progressPercent}%`,
                                            background: '#ef4444',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px', minWidth: '60px' }}>
                                        {currentQuestionIndex + 1} / {QUESTIONS_PER_LEVEL}
                                    </span>
                                </div>

                                {/* Accuracy Threshold Indicator */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: '16px',
                                    marginBottom: '16px',
                                    fontSize: '13px'
                                }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        Required: {config.minCorrect}/{QUESTIONS_PER_LEVEL} correct ({config.accuracyRequired}%)
                                    </span>
                                    <span style={{
                                        color: correctCount >= config.minCorrect ? '#22c55e' :
                                            incorrectCount > (QUESTIONS_PER_LEVEL - config.minCorrect) ? '#ef4444' : '#fbbf24'
                                    }}>
                                        Current: {correctCount}/{currentQuestionIndex + (showResult ? 1 : 0)}
                                    </span>
                                </div>

                                {/* Question Card */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    padding: '32px'
                                }}>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px', textTransform: 'uppercase' }}>
                                        Level {currentLevel} • Question {currentQuestionIndex + 1}
                                    </div>

                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 24px 0' }}>
                                        {toTitleCase(currentQuestion.question)}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {currentQuestion.options?.map((option, index) => {
                                            const isEliminated = eliminatedOptions.includes(index);
                                            let bg = 'rgba(255,255,255,0.05)';
                                            let borderColor = 'rgba(255,255,255,0.1)';

                                            if (isEliminated && !showResult) {
                                                // Eliminated by 50/50
                                                bg = 'rgba(100, 100, 100, 0.1)';
                                                borderColor = 'rgba(100, 100, 100, 0.2)';
                                            } else if (showResult) {
                                                if (index === currentQuestion.correct_index) {
                                                    bg = 'rgba(34, 197, 94, 0.2)';
                                                    borderColor = '#22c55e';
                                                } else if (index === selectedAnswer) {
                                                    bg = 'rgba(239, 68, 68, 0.2)';
                                                    borderColor = '#ef4444';
                                                }
                                            }

                                            return (
                                                <button
                                                    key={index}
                                                    onClick={() => selectAnswer(index)}
                                                    disabled={selectedAnswer !== null || isEliminated}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '14px',
                                                        padding: '14px 18px',
                                                        background: bg,
                                                        border: `2px solid ${borderColor}`,
                                                        borderRadius: '10px',
                                                        color: isEliminated ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)',
                                                        fontSize: '15px',
                                                        textAlign: 'left',
                                                        cursor: (selectedAnswer !== null || isEliminated) ? 'default' : 'pointer',
                                                        transition: 'all 0.2s',
                                                        textDecoration: isEliminated ? 'line-through' : 'none',
                                                        opacity: isEliminated ? 0.5 : 1
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: isEliminated ? 'rgba(100,100,100,0.2)' : 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '13px'
                                                    }}>
                                                        {isEliminated ? '✗' : String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span style={{ flex: 1 }}>{toTitleCase(option)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Lifeline Buttons Row */}
                                    {!showResult && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '10px',
                                            marginTop: '20px'
                                        }}>
                                            {/* 50/50 Button */}
                                            <button
                                                onClick={useFiftyFifty}
                                                disabled={eliminatedOptions.length > 0}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: eliminatedOptions.length > 0
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : fiftyFiftyUsedFree
                                                            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 150, 200, 0.3))'
                                                            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(20, 150, 80, 0.3))',
                                                    border: `2px solid ${eliminatedOptions.length > 0
                                                        ? '#666'
                                                        : fiftyFiftyUsedFree
                                                            ? '#00D4FF'
                                                            : '#22c55e'}`,
                                                    borderRadius: '12px',
                                                    color: eliminatedOptions.length > 0 ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: eliminatedOptions.length > 0 ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>⚡</span>
                                                <span>50/50</span>
                                                {eliminatedOptions.length > 0 ? (
                                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>USED</span>
                                                ) : fiftyFiftyUsedFree ? (
                                                    <span style={{ fontSize: '11px', color: '#00D4FF' }}>5💎</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>FREE</span>
                                                )}
                                            </button>

                                            {/* Skip Question Button */}
                                            <button
                                                onClick={useSkipQuestion}
                                                disabled={userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(200, 150, 30, 0.3))',
                                                    border: `2px solid ${(userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? '#666' : '#fbbf24'}`,
                                                    borderRadius: '12px',
                                                    color: (userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>⏭️</span>
                                                <span>Skip</span>
                                                <span style={{ fontSize: '11px', color: '#fbbf24' }}>5💎</span>
                                            </button>

                                            {/* Double Chance Button */}
                                            <button
                                                onClick={useDoubleChance}
                                                disabled={doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(120, 60, 180, 0.3))',
                                                    border: `2px solid ${(doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? '#666' : '#a855f7'}`,
                                                    borderRadius: '12px',
                                                    color: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>🎯</span>
                                                <span>2x Try</span>
                                                {doubleChanceActive ? (
                                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>ACTIVE</span>
                                                ) : doubleChanceUsedThisQuestion ? (
                                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>USED</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#a855f7' }}>5💎</span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Level Complete State */}
                        {gameState === 'levelComplete' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎉</div>
                                <h2 style={{ color: '#22c55e', fontSize: '28px', margin: '0 0 16px 0' }}>
                                    LEVEL {currentLevel} COMPLETE!
                                </h2>
                                <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
                                    Score: {correctCount}/{QUESTIONS_PER_LEVEL} ({Math.round((correctCount / QUESTIONS_PER_LEVEL) * 100)}%)
                                </div>
                                <div style={{
                                    display: 'inline-block',
                                    padding: '12px 24px',
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: '8px',
                                    color: '#00D4FF',
                                    marginBottom: '24px'
                                }}>
                                    💎 +{currentLevel * 2} Diamonds | Total: {totalDiamondsEarned}
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={continueToNextLevel}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            border: 'none',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Continue to Level {currentLevel + 1}
                                    </button>
                                    <button
                                        onClick={backToLobby}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Save & Exit
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Game Over State */}
                        {gameState === 'gameOver' && (
                            <div style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: 1000,
                                background: 'rgba(0, 0, 0, 0.88)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                animation: 'resultFadeIn 0.4s ease'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(15, 23, 42, 0.9))',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '16px',
                                    padding: '48px',
                                    textAlign: 'center',
                                    maxWidth: '480px',
                                    width: '100%'
                                }}>
                                    <div style={{ fontSize: '64px', marginBottom: '20px' }}>💀</div>
                                    <h2 style={{ color: '#ef4444', fontSize: '28px', margin: '0 0 16px 0' }}>
                                        LEVEL {currentLevel} FAILED
                                    </h2>
                                    <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                                        Score: {correctCount}/{currentQuestionIndex + 1} • Required: {config.minCorrect}/{QUESTIONS_PER_LEVEL}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>
                                        You needed {config.accuracyRequired}% accuracy to pass
                                    </div>
                                    {totalDiamondsEarned > 0 && (
                                        <div style={{
                                            display: 'inline-block',
                                            padding: '12px 24px',
                                            background: 'rgba(0, 212, 255, 0.1)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: '8px',
                                            color: '#00D4FF',
                                            marginBottom: '24px'
                                        }}>
                                            💎 Diamonds Earned: {totalDiamondsEarned}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => restartFromLevel(currentLevel)}
                                            style={{
                                                padding: '16px 32px',
                                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                                border: 'none',
                                                borderRadius: '12px',
                                                color: 'white',
                                                fontSize: '16px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Retry Level {currentLevel}
                                        </button>
                                        <button
                                            onClick={backToLobby}
                                            style={{
                                                padding: '16px 32px',
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '12px',
                                                color: 'white',
                                                fontSize: '16px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Back to Trivia
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Victory State */}
                        {gameState === 'victory' && (
                            <div style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: 1000,
                                background: 'rgba(0, 0, 0, 0.88)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                animation: 'resultFadeIn 0.4s ease'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(15, 23, 42, 0.9))',
                                    border: '2px solid rgba(234, 179, 8, 0.5)',
                                    borderRadius: '16px',
                                    padding: '48px',
                                    textAlign: 'center',
                                    maxWidth: '480px',
                                    width: '100%'
                                }}>
                                    <div style={{ fontSize: '72px', marginBottom: '20px' }}>🏆</div>
                                    <h2 style={{ color: '#eab308', fontSize: '32px', margin: '0 0 16px 0' }}>
                                        SURVIVAL MASTER!
                                    </h2>
                                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', marginBottom: '24px' }}>
                                        You completed all 10 levels!
                                    </div>
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '16px 32px',
                                        background: 'rgba(0, 212, 255, 0.1)',
                                        border: '2px solid rgba(0, 212, 255, 0.4)',
                                        borderRadius: '12px',
                                        color: '#00D4FF',
                                        fontSize: '20px',
                                        fontWeight: 'bold',
                                        marginBottom: '24px'
                                    }}>
                                        💎 Total Earned: {totalDiamondsEarned} Diamonds
                                    </div>
                                    <div>
                                        <button
                                            onClick={backToLobby}
                                            style={{
                                                padding: '16px 48px',
                                                background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                                                border: 'none',
                                                borderRadius: '12px',
                                                color: 'black',
                                                fontSize: '18px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Return to Trivia Hub
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
