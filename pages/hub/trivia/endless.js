/**
 * ENDLESS MODE - All Categories Random
 * Route: /hub/trivia/endless
 * 
 * Endless questions from ALL categories combined randomly.
 * Answer until you get one wrong. Diamonds stack with streak multipliers.
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
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { playHeartbeat, closeHeartbeatAudio } from '../../../src/lib/heartbeatAudio';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP
const DAILY_DIAMOND_CAP = 10;

export default function EndlessModePage() {
    useTrainingBus('trivia-endless');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    const [gameState, setGameState] = useState('ready'); // ready, playing, gameover
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [streak, setStreak] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [multiplier, setMultiplier] = useState(1);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [highScore, setHighScore] = useState(0);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    // 50/50 Lifeline State
    const [fiftyFiftyUsedFree, setFiftyFiftyUsedFree] = useState(false); // One free per game
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [userDiamonds, setUserDiamonds] = useState(0);

    // Lifeline usage tracking (max 3 per game, all cost 5💎)
    const [lifelinesUsedThisGame, setLifelinesUsedThisGame] = useState(0);
    const LIFELINE_COST = 5;
    const MAX_LIFELINES_PER_GAME = 3;

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

    // Refs to avoid stale closures in setTimeout-triggered saveGameResult
    const streakRef = useRef(0);
    const diamondsEarnedRef = useRef(0);
    const currentIndexRef = useRef(0);
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race

    // Game Settings (persist to localStorage)
    const [settings, setSettings] = useState({
        haptics: true,      // Vibration feedback
        audio: true,        // Heartbeat sounds
        screenShake: true,  // Screen shake effect
        intensity: 'high'   // 'low', 'medium', 'high'
    });

    // Speed Bonus State
    const [speedBonus, setSpeedBonus] = useState(0);
    const [showSpeedBonus, setShowSpeedBonus] = useState(false);

    const startTimeRef = useRef(null);

    // Calculate multiplier based on streak (increases every 5 questions)
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // Initialize
    useEffect(() => {
        if (authLoading) return;
        async function init() {
            const user = avatarUser || getAuthUser();
            if (user) {
                setUserId(user.id);
                // Check VIP status
                await DiamondEngine.init(user.id);
                const vipStatus = await DiamondEngine.isVIP();
                setIsVip(vipStatus);
                // Load high score (ignore errors - table may not exist)
                try {
                    const { data } = await supabase
                        .from('endless_high_scores')
                        .select('high_score')
                        .eq('user_id', user.id)
                        .eq('mode', 'random')
                        .maybeSingle();
                    if (data) setHighScore(data.high_score || 0);
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                // Load user diamonds
                try {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', user.id)
                        .maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.warn('Failed to load diamonds:', e);
                }
            }
            // Load settings from localStorage
            try {
                const savedSettings = localStorage.getItem('trivia_settings');
                if (savedSettings) setSettings(JSON.parse(savedSettings));
            } catch (e) { console.warn("[endless.js]", e); }

            await loadMoreQuestions();
            setIsLoading(false);
        }
        init();
    }, [avatarUser?.id, authLoading]);

    // Realtime: Refresh data when scores/diamonds change
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-endless:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'endless_high_scores', filter: `user_id=eq.${userId}` }, async () => {
                try {
                    const { data } = await supabase.from('endless_high_scores').select('high_score').eq('user_id', userId).eq('mode', 'random').maybeSingle();
                    if (data) setHighScore(data.high_score || 0);
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.warn('[Endless] Realtime refresh failed:', e);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    // Save settings to localStorage when changed
    useEffect(() => {
        try {
            localStorage.setItem('trivia_settings', JSON.stringify(settings));
        } catch (e) { console.warn("[endless.js]", e); }
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

    // Load more questions when running low
    useEffect(() => {
        if (questions.length > 0 && currentIndex >= questions.length - 5) {
            loadMoreQuestions();
        }
    }, [currentIndex, questions.length]);

    async function loadMoreQuestions() {
        try {
            // 60-day non-repeat: Get user's recently seen question IDs using shared utility
            const excludeIds = await getRecentlySeenIds(supabase, userId, 200, 'endless');

            // Phase 55: random offset fetch — was always pulling the same 200
            // newest rows, so users in long sessions cycled through the same window
            // while 8400+ other questions never appeared.
            const data = await fetchRandomQuestionPool(supabase, { pageSize: 200 });
            if (data && data.length > 0) {
                // Filter out recently seen questions and shuffle using shared utility (unbiased)
                // Phase 51: prefer high-quality questions for casual endless play
                const available = filterAndShuffle(data, excludeIds, 20, { minQualityScore: 6, preferHighQuality: true });
                const toAdd = available.slice(0, 50);
                
                setQuestions(prev => [...prev, ...shuffleOptions(toAdd)]);
            }
        } catch (e) {
            console.warn('Failed to load questions:', e);
        }
    }

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // Check if already paid via TriviaLobby (defense-in-depth)
        const alreadyPaid = sessionStorage.getItem('trivia_paid') === 'true'
            && sessionStorage.getItem('trivia_mode') === 'endless';
        if (alreadyPaid) {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        }

        // Per-game diamond gate (VIP bypass, skip if already paid)
        if (!alreadyPaid && !isVip && userId) {
            // Fresh balance check from DB to avoid stale-state false negatives
            let freshBalance = userDiamonds;
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (profile) {
                    freshBalance = profile.diamonds || 0;
                    setUserDiamonds(freshBalance);
                }

                if (freshBalance < GAME_ENTRY_COST) {
                    setShowOutOfDiamonds(true);
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_endless');
                if (!result.success) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Endless] Diamond deduction failed:', e);
                setShowOutOfDiamonds(true);
                return;
            }
        }
        setGameState('playing');
        setStreak(0);
        setDiamondsEarned(0);
        setMultiplier(1);
        setCurrentIndex(0);
        streakRef.current = 0;
        diamondsEarnedRef.current = 0;
        currentIndexRef.current = 0;
        // Reset all lifeline states for new game
        setFiftyFiftyUsedFree(false);
        setEliminatedOptions([]);
        setSkipUsedThisQuestion(false);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
        setLifelinesUsedThisGame(0);
        // Start shot clock
        setTimeLeft(24);
        setIsTimerRunning(true);
        setScreenShake(false);
        startTimeRef.current = Date.now();
        } finally {
            isStartingRef.current = false;
        }
    }

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

                // Haptic feedback (if enabled)
                if (settings.haptics && 'vibrate' in navigator) {
                    const baseVibration = newTime <= 3 ? 100 : newTime <= 8 ? 50 : 20;
                    navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
                }

                // Screen shake (if enabled)
                if (settings.screenShake && newTime <= 3 && newTime > 0) setScreenShake(true);
                else setScreenShake(false);

                if (newTime <= 0) {
                    clearInterval(timerRef.current);
                    clearInterval(heartbeatIntervalRef.current);
                    handleTimeOut();
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        // Heartbeat audio (if enabled)
        if (settings.audio && timeLeft <= 8 && timeLeft > 0) {
            const volume = 0.3 * intensityMultiplier;
            const speed = Math.max(200, 600 - ((8 - timeLeft) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(() => playHeartbeat(volume), speed);
            playHeartbeat(volume);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
            closeHeartbeatAudio();
        };
    }, [isTimerRunning, showResult, timeLeft, settings]);

    // Handle timeout - game over
    function handleTimeOut() {
        setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        setShowResult(true);
        answerTimeoutRef.current = setTimeout(() => {
            setGameState('gameover');
            saveGameResult();
        }, 1500);
    }

    // 50/50 Lifeline Function
    async function useFiftyFifty() {
        if (eliminatedOptions.length > 0 || showResult) return; // Already used on this question

        const currentQ = questions[currentIndex];
        if (!currentQ) return;

        const needsToPay = fiftyFiftyUsedFree;

        if (needsToPay) {
            if (userDiamonds < 5) {
                setShowOutOfDiamonds(true);
                return;
            }
            // Deduct diamonds via RPC
            if (userId) {
                try {
                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: -5,
                        p_type: 'endless_lifeline',
                        p_description: 'Endless 50/50 lifeline — 5💎',
                        p_reference_id: `endless_fifty_${userId}_${currentQuestionIndex}_${crypto.randomUUID()}`
                    });
                    if (__rpcErr) throw __rpcErr;
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsSpent(5, '50/50 Lifeline');
                } catch (e) {
                    console.warn('Failed to deduct diamonds:', e);
                    return;
                }
            }
        } else {
            setFiftyFiftyUsedFree(true);
        }

        // Find wrong answer indices
        const wrongIndices = currentQ.options
            .map((_, idx) => idx)
            .filter(idx => idx !== currentQ.correct_index);

        // Randomly select 2 to eliminate
        const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
        const toEliminate = shuffled.slice(0, 2);
        setEliminatedOptions(toEliminate);
    }

    // Skip Question Function (costs 5💎)
    async function useSkipQuestion() {
        if (showResult || skipUsedThisQuestion) return;
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }
        if (userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        if (userId) {
            try {
                const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'endless_lifeline',
                    p_description: `Endless skip question — ${LIFELINE_COST}💎`,
                    p_reference_id: `endless_skip_${userId}_${currentQuestionIndex}_${crypto.randomUUID()}`
                });
                if (__rpcErr) throw __rpcErr;
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, 'Skip Question');
                setLifelinesUsedThisGame(prev => prev + 1);
            } catch (e) {
                console.warn('Failed to deduct diamonds:', e);
                return;
            }
        }

        setSkipUsedThisQuestion(true);
        setIsTimerRunning(false);

        // Move to next question without penalty (keep streak)
        setCurrentIndex(prev => prev + 1);
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

    async function useDoubleChance() {
        if (showResult || doubleChanceUsedThisQuestion || doubleChanceActive) return;
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }
        if (userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        if (userId) {
            try {
                const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'endless_lifeline',
                    p_description: `Endless double chance — ${LIFELINE_COST}💎`,
                    p_reference_id: `endless_double_${userId}_${currentQuestionIndex}_${crypto.randomUUID()}`
                });
                if (__rpcErr) throw __rpcErr;
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, 'Double Chance');
                setLifelinesUsedThisGame(prev => prev + 1);
            } catch (e) {
                console.warn('Failed to deduct diamonds:', e);
                return;
            }
        }

        setDoubleChanceActive(true);
        setDoubleChanceUsedThisQuestion(true);
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null) return;

        // Stop timer
        setIsTimerRunning(false);
        const answerTime = 24 - timeLeft; // How many seconds it took to answer

        // If Double Chance active and this is first attempt
        if (doubleChanceActive && firstAttemptWrong === null) {
            const currentQuestion = questions[currentIndex];
            const correct = index === currentQuestion?.correct_index;

            if (!correct) {
                // First wrong attempt - allow second try, reset timer
                setFirstAttemptWrong(index);
                setTimeLeft(24);
                setIsTimerRunning(true);
                return;
            }
        }

        const currentQuestion = questions[currentIndex];
        const correct = index === currentQuestion?.correct_index;

        setSelectedAnswer(index);
        setShowResult(true);

        if (correct) {
            let earned = multiplier;

            // Speed bonus for fast answers (under 10 seconds)
            if (answerTime < 10) {
                const bonus = answerTime <= 3 ? 3 : answerTime <= 5 ? 2 : 1;
                setSpeedBonus(bonus);
                setShowSpeedBonus(true);
                earned += bonus;
                setTimeout(() => setShowSpeedBonus(false), 1500);
            }

            setDiamondsEarned(prev => { const next = prev + earned; diamondsEarnedRef.current = next; return next; });
            setStreak(prev => { const next = prev + 1; streakRef.current = next; return next; });
            busEmit.decisionCorrect(streak + 1);

            answerTimeoutRef.current = setTimeout(() => {
                setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
                setSelectedAnswer(null);
                setShowResult(false);
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                setTimeLeft(24);
                setIsTimerRunning(true);
            }, 1000);
        } else {
            busEmit.decisionIncorrect(streak);
            busEmit.screenShake('medium');
            answerTimeoutRef.current = setTimeout(() => {
                setGameState('saving'); // Show skeleton while saving
                saveGameResult();
            }, 1500);
        }
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=diamonds, 2=highscore, 3=history

    async function saveGameResult() {
        if (!userId) return;

        // Use refs to avoid stale state from setTimeout closure
        const finalDiamonds = diamondsEarnedRef.current;
        const finalStreak = streakRef.current;
        const finalIndex = currentIndexRef.current;

        try {
            let actualAwarded = 0;
            // Phase 1: Award diamonds (only if not already awarded)
            if (savePhaseRef.current < 1) {
                // Clamp to daily cap
                const earnedToday = await getDailyDiamondsEarned(supabase, userId, 'endless');
                const cappedDiamonds = clampToCap(earnedToday, finalDiamonds, DAILY_DIAMOND_CAP);
                if (cappedDiamonds > 0) {
                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: cappedDiamonds,
                        p_type: 'endless_reward',
                        p_description: `Endless mode — ${cappedDiamonds}💎 (${finalStreak} streak)`,
                        p_reference_id: `endless_reward_${userId}_${Date.now()}_${crypto.randomUUID()}`
                    });
                    if (__rpcErr) throw __rpcErr;
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsEarned(cappedDiamonds, 'Endless Mode');
                    actualAwarded = cappedDiamonds;
                }
                savePhaseRef.current = 1;
            }

            // Phase 2: Update high score (only if not already updated)
            if (savePhaseRef.current < 2) {
                if (finalStreak > highScore) {
                    await supabase
                        .from('endless_high_scores')
                        .upsert({
                            user_id: userId,
                            mode: 'random',
                            high_score: finalStreak,
                            achieved_at: new Date().toISOString()
                        }, { onConflict: 'user_id,mode' });
                    setHighScore(finalStreak);
                }
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded)
            if (savePhaseRef.current < 3) {
                const correctQuestions = questions.slice(0, finalIndex);
                const wrongQuestion = questions[finalIndex];
                const historyRecords = [
                    ...correctQuestions.map(q => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: true,
                        seen_at: new Date().toISOString(),
                        mode: 'endless'
                    })),
                    ...(wrongQuestion ? [{
                        user_id: userId,
                        question_id: wrongQuestion.id,
                        was_correct: false,
                        seen_at: new Date().toISOString(),
                        mode: 'endless'
                    }] : [])
                ];
                if (historyRecords.length > 0) {
                    await supabase.from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: false
                        });
                }
                savePhaseRef.current = 3;
            }

            // Phase 4: Record to unified trivia_scores (for leaderboard).
            // Capture insert error — supabase-js does NOT throw on DB errors.
            if (savePhaseRef.current < 4) {
                const today = new Date().toISOString().split('T')[0];
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'endless',
                    score: finalStreak * 100,
                    correct_count: finalStreak,
                    total_questions: finalStreak + 1,
                    diamonds_earned: actualAwarded,
                    play_date: today
                });
                if (scoreErr) throw scoreErr;
                savePhaseRef.current = 4;
            }

            // Success! Game saved — reset phase for next game
            setGameState('gameover');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Endless] Failed to save game result:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ finalDiamonds, finalStreak, finalIndex });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        saveGameResult(); // savePhaseRef skips already-completed steps
    };

    function playAgain() {
        setQuestions(prev => shuffleOptions(prev.slice(currentIndex).sort(() => Math.random() - 0.5)));
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        setSelectedAnswer(null);
        setShowResult(false);
        startGame();
    }

    const currentQuestion = questions[currentIndex];

    return (
        <TriviaErrorBoundary pageName="Endless Mode">
            <SEOHead
                title="Endless Trivia — Keep The Streak Alive"
                description="How Many Poker Trivia Questions Can You Answer In A Row? Play Endless Mode To Test Your Limits."
                canonical="/hub/trivia/endless"
            />

            <UniversalHeader pageDepth={2} />

            {/* Per-game cost popup (one-time) */}
            {userId && !isVip && (
                <GameCostPopup
                    userId={userId}
                    featureKey="trivia_endless"
                    isVip={isVip}
                    cost={10}
                />
            )}

            {/* Out of diamonds modal */}
            {showOutOfDiamonds && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 16, padding: 32, textAlign: 'center', maxWidth: 360 }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
                        <h3 style={{ color: '#fff', marginBottom: 8 }}>Not Enough Diamonds</h3>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>Each Game Costs 10💎. Get More Diamonds Or Upgrade To VIP For Unlimited Access!</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #0088FF)', border: 'none', borderRadius: 20, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Get Diamonds</button>
                            <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <PageTransition>
                <div style={{
                    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
                                    <span style={{ color: '#2374e1', fontWeight: 'bold', fontSize: '18px' }}>ENDLESS MODE</span>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                                    <span style={{ color: '#e69500' }}>Streak: {streak}</span>
                                    <span style={{ color: '#2374e1' }}>Diamonds: {diamondsEarned}</span>
                                    <span style={{ color: '#31a24c' }}>{multiplier}x</span>
                                </div>
                            </div>
                        )}

                        {/* Ready State */}
                        {gameState === 'ready' && (
                            <div
                                className="lobby-image-wrapper"
                                onClick={startGame}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    maxHeight: 'calc(100dvh - 60px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(35, 116, 225, 0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <Image src="/images/trivia/lobby-endless.jpg" alt="Endless Mode - Start Challenge" width={686} height={1024} className="lobby-image" style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 'calc(100dvh - 60px)', objectFit: 'contain' }} />
                            </div>
                        )}

                        {/* Saving State (TriviaSkeleton) */}
                        {gameState === 'saving' && (
                            <TriviaSkeleton />
                        )}

                        {/* Saving Error State (Retry UI) */}
                        {gameState === 'saving_error' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh'
                            }}>
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.9)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '16px',
                                    padding: '40px',
                                    textAlign: 'center',
                                    maxWidth: '480px'
                                }}>
                                    <h2 style={{ color: '#ef4444', marginBottom: '16px', fontSize: '24px' }}>Network Disconnected</h2>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
                                        We couldn't save your score of {saveErrorPayload?.finalStreak} and {saveErrorPayload?.finalDiamonds}💎 because you lost connection. Please check your internet and try again so you don't lose your rewards!
                                    </p>
                                    <button
                                        onClick={handleRetrySave}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #2374e1, #1b5bb8)',
                                            border: 'none',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Retry Save
                                    </button>
                                </div>
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
                                                'rgba(139, 92, 246, 0.15)',
                                        border: `2px solid ${timeLeft <= 3 ? '#ef4444' :
                                            timeLeft <= 8 ? '#fbbf24' : '#8b5cf6'}`,
                                        borderRadius: '50px'
                                    }}>
                                        <span style={{ fontSize: '18px' }}>⏱️</span>
                                        <span style={{
                                            fontSize: '28px',
                                            fontWeight: 'bold',
                                            fontFamily: 'monospace',
                                            color: timeLeft <= 3 ? '#ef4444' :
                                                timeLeft <= 8 ? '#fbbf24' : '#8b5cf6',
                                            minWidth: '40px',
                                            textAlign: 'center'
                                        }}>
                                            {timeLeft}
                                        </span>
                                        {lifelinesUsedThisGame > 0 && (
                                            <span style={{
                                                fontSize: '11px',
                                                color: 'rgba(255,255,255,0.6)',
                                                marginLeft: '8px'
                                            }}>
                                                ⚡{lifelinesUsedThisGame}/{MAX_LIFELINES_PER_GAME}
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

                                {/* Multiplier Progress */}
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
                                            width: `${((streak % 5) / 5) * 100}%`,
                                            background: '#8b5cf6',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                                        {5 - (streak % 5)} to {multiplier + 1}x
                                    </span>
                                </div>

                                {/* Question Card */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    padding: '32px'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        color: 'rgba(255,255,255,0.5)',
                                        marginBottom: '16px',
                                        textTransform: 'uppercase'
                                    }}>
                                        <span>Question #{streak + 1}</span>
                                        <span style={{ color: '#8b5cf6' }}>{currentQuestion.category || 'Mixed'}</span>
                                    </div>

                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 24px 0' }}>
                                        {toTitleCase(currentQuestion.question)}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {currentQuestion.options?.map((option, index) => {
                                            const isEliminated = eliminatedOptions.includes(index);
                                            let bg = 'rgba(255,255,255,0.05)';
                                            let borderColor = 'rgba(255,255,255,0.1)';

                                            if (showResult) {
                                                if (index === currentQuestion.correct_index) {
                                                    bg = 'rgba(34, 197, 94, 0.15)';
                                                    borderColor = '#22c55e';
                                                } else if (index === selectedAnswer) {
                                                    bg = 'rgba(239, 68, 68, 0.15)';
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
                                                        background: isEliminated ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '13px',
                                                        color: isEliminated ? '#ef4444' : 'inherit'
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
                                            marginTop: '16px'
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
                                                disabled={userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(200, 150, 30, 0.3))',
                                                    border: `2px solid ${(userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? '#666' : '#fbbf24'}`,
                                                    borderRadius: '12px',
                                                    color: (userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? 'default' : 'pointer',
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
                                                disabled={doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(120, 60, 180, 0.3))',
                                                    border: `2px solid ${(doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? '#666' : '#a855f7'}`,
                                                    borderRadius: '12px',
                                                    color: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < LIFELINE_COST || lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) ? 'default' : 'pointer',
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

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        marginTop: '24px',
                                        padding: '12px',
                                        background: 'rgba(139, 92, 246, 0.1)',
                                        border: '1px solid rgba(139, 92, 246, 0.2)',
                                        borderRadius: '8px',
                                        color: '#8b5cf6',
                                        fontSize: '13px'
                                    }}>
                                        💎 +{multiplier} diamonds for correct answer
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Game Over State */}
                        {gameState === 'gameover' && (
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
                                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    padding: '48px',
                                    textAlign: 'center',
                                    maxWidth: '480px',
                                    width: '100%'
                                }}>
                                    <div style={{ fontSize: '64px', marginBottom: '20px' }}>💀</div>
                                    <h2 style={{ color: '#ef4444', fontSize: '32px', marginBottom: '24px' }}>
                                        GAME OVER
                                    </h2>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '20px',
                                        marginBottom: '24px'
                                    }}>
                                        <div style={{
                                            background: 'rgba(251, 191, 36, 0.1)',
                                            border: '1px solid rgba(251, 191, 36, 0.3)',
                                            borderRadius: '12px',
                                            padding: '20px'
                                        }}>
                                            <div style={{ fontSize: '36px', color: '#fbbf24', fontWeight: 'bold' }}>
                                                {streak}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                                Streak
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(0, 212, 255, 0.1)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: '12px',
                                            padding: '20px'
                                        }}>
                                            <div style={{ fontSize: '36px', color: '#00D4FF', fontWeight: 'bold' }}>
                                                {diamondsEarned}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                                💎 Earned
                                            </div>
                                        </div>
                                    </div>

                                    {streak >= highScore && streak > 0 && (
                                        <div style={{
                                            padding: '12px 24px',
                                            background: 'rgba(234, 179, 8, 0.1)',
                                            border: '1px solid rgba(234, 179, 8, 0.3)',
                                            borderRadius: '8px',
                                            color: '#eab308',
                                            marginBottom: '24px'
                                        }}>
                                            🎉 NEW HIGH SCORE!
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={playAgain}
                                            style={{
                                                padding: '16px 32px',
                                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                                border: 'none',
                                                borderRadius: '12px',
                                                color: 'white',
                                                fontSize: '16px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Play Again
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const r = await shareResult({ mode: 'Endless', score: streak, diamonds: diamondsEarned });
                                                if (r === 'copied') alert('Result copied to clipboard!');
                                            }}
                                            style={{
                                                padding: '16px 32px',
                                                background: 'linear-gradient(135deg, #2374e1, #1b5bb8)',
                                                border: 'none',
                                                borderRadius: '12px',
                                                color: 'white',
                                                fontSize: '16px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Share Result
                                        </button>
                                        <button
                                            onClick={() => router.push('/hub/trivia')}
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
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition >
        </TriviaErrorBoundary>
    );
}
