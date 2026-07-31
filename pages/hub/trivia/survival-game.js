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
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { playHeartbeat, closeHeartbeatAudio } from '../../../src/lib/heartbeatAudio';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import { getAccessToken } from '../../../src/lib/authUtils';
import { Settings as SettingsIcon, Timer as TimerIcon, Zap as ZapIcon } from 'lucide-react';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP
// Daily cap comes from triviaEngine so the lobby and the payout agree. The
// local literal was 10 — the same as one entry fee, making a full run
// net-negative by construction.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.survival) ? DAILY_DIAMOND_CAPS.survival : 80;

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
    useTrainingBus('trivia-survival-game');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, levelComplete, gameOver, victory
    const [currentLevel, setCurrentLevel] = useState(1);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [incorrectCount, setIncorrectCount] = useState(0);
    const [totalDiamondsEarned, setTotalDiamondsEarned] = useState(0);
    // True once the daily cap has clipped an award during this run.
    const [capReachedThisRun, setCapReachedThisRun] = useState(false);

    // TRAIN-WIRE-TRIVIA-HOOK-5 — selectedAnswer/showResult managed by shared hook
    const currentQuestion = questions[currentQuestionIndex];
    const trivia = useTriviaQuestion(currentQuestion);

    // TRAIN-WIRE-TRIVIA-TIMER-5 — shared shot-clock hook (autoResumeOnVisible=false: explicit Resume UI)
    const timer = useTriviaTimer({
        initialTime: 24,
        showResult: trivia.showResult,
        gameState,
        onTimeout: handleTimeOut,
        autoResumeOnVisible: false,
    });

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
    const [screenShake, setScreenShake] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Visibility-based pause
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
    const [showSpeedBonus, setShowSpeedBonus] = useState(false); // Show bonus animation
    // Accumulated speed-bonus diamonds for the CURRENT level. These were shown
    // in the HUD/level-complete totals but never actually awarded — saveProgress
    // only credited currentLevel*2. Now they are folded into the award (still
    // clamped by the daily cap), so the displayed number is the credited number.
    const levelSpeedBonusRef = useRef(0);
    // Settings panel visibility is component state, never persisted. It used to
    // be stored inside the `settings` object, which is written to localStorage
    // 'trivia_settings' — so leaving with the panel open made it auto-open over
    // the board forever, here and in endless.js (shared storage key).
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [lifelineError, setLifelineError] = useState(null);

    // User state
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [userProgress, setUserProgress] = useState({ highestLevel: 0 });
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [levelLoadError, setLevelLoadError] = useState(null);
    const [showReview, setShowReview] = useState(false);

    // VIP members get lifelines free, so the balance check must not lock their
    // buttons (previously it did — VIPs were both charged and gated).
    // NOTE: must stay BELOW the `isVip` useState above. It was originally
    // declared next to LIFELINE_COST (~line 106), which read `isVip` from its
    // temporal dead zone and threw "Cannot access 'isVip' before
    // initialization" on every single render of this page.
    const lifelineLocked = lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL
        || (!isVip && userDiamonds < LIFELINE_COST);

    const startTimeRef = useRef(null);
    const answersRef = useRef([]); // Track per-question correctness
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race
    // Every question id served in THIS run — a hard exclusion so level 4 can
    // never re-serve a question the player already saw on level 1.
    const sessionServedIdsRef = useRef(new Set());

    // ── SOUND: one switch, globally ────────────────────────────────────
    // triviaAudio owns the mute flag for the whole trivia system; this page's
    // `settings.audio` is now a read-only mirror of !triviaAudio.isMuted().
    // It used to be an independent third switch, so muting here left
    // TriviaGame and endless.js loud.
    useEffect(() => {
        const sync = (m) => setSettings(prev => (prev.audio === !m ? prev : { ...prev, audio: !m }));
        sync(triviaAudio.isMuted());
        return triviaAudio.onMuteChange(sync);
    }, []);

    // Initialize
    useEffect(() => {
        if (authLoading) return;
        const user = avatarUser || getAuthUser();
        if (user) {
            setUserId(user.id);
            try { setAccessToken(getAccessToken()); } catch (e) { /* anonymous report still allowed */ }
            loadUserProgress(user.id);
            loadUserDiamonds(user.id);
            // Check VIP status
            (async () => {
                await DiamondEngine.init(user.id);
                const v = await DiamondEngine.isVIP();
                setIsVip(v);
            })();
        }
        // Load settings from the shared 'trivia_settings' store that
        // /hub/trivia/settings now writes to (one settings system).
        try {
            const savedSettings = localStorage.getItem('trivia_settings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings) || {};
                delete parsed.showPanel;
                // `audio` is owned by triviaAudio (mirror effect above) — a
                // stale copy in this blob would silently un-mute the player.
                delete parsed.audio;
                setSettings(prev => ({ ...prev, ...parsed }));
            }
        } catch (e) { console.warn("[survival-game.js]", e); }
    }, [avatarUser?.id, authLoading]);

    // Realtime: Sync diamond balance when it changes externally
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-survival:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async () => {
                try {
                    const { data } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (data) setUserDiamonds(data.diamonds || 0);
                } catch (e) {
                    console.warn('[Survival] Realtime diamond refresh failed:', e);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    // Save settings to localStorage when changed. Merged so this page never
    // clobbers keys owned by the settings page (difficulty / timerEnabled / ...).
    useEffect(() => {
        try {
            let existing = {};
            try { existing = JSON.parse(localStorage.getItem('trivia_settings') || '{}') || {}; } catch (e) { existing = {}; }
            const { showPanel: _drop, ...persistable } = settings;
            localStorage.setItem('trivia_settings', JSON.stringify({ ...existing, ...persistable }));
        } catch (e) { console.warn("[survival-game.js]", e); }
    }, [settings]);

    // Unmount-only cleanup for the question-advance timeout.
    //
    // This used to live in the per-tick side-effect cleanup below. That effect
    // re-runs on every timer tick / showResult flip, so its PREVIOUS cleanup
    // cancelled the 1200ms/1500ms advance timeout that selectAnswer/handleTimeOut
    // had just scheduled — the level froze on the revealed answer and never
    // advanced or evaluated. Clearing it only on unmount fixes the soft-lock.
    useEffect(() => {
        return () => {
            if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        };
    }, []);

    // Visibility-based timer pause (when user leaves app/tab)
    // Hook stops the countdown; page only sets isPaused so resume overlay appears.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && timer.isTimerRunning) setIsPaused(true);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [timer.isTimerRunning]);

    // Side-effects only — reacts to timer.timeLeft ticks for haptics, screenShake, heartbeat audio.
    // useTriviaTimer owns the countdown; this effect only drives feedback.
    useEffect(() => {
        if (!timer.isTimerRunning || trivia.showResult) {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            setScreenShake(false);
            return;
        }

        const t = timer.timeLeft;
        const intensityMultiplier = settings.intensity === 'high' ? 1 : settings.intensity === 'medium' ? 0.6 : 0.3;

        // Haptic feedback every second (if enabled)
        if (settings.haptics && 'vibrate' in navigator) {
            const baseVibration = t <= 3 ? 100 : t <= 8 ? 50 : 20;
            navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
        }

        // Screen shake at 3 seconds (if enabled)
        if (settings.screenShake && t <= 3 && t > 0) setScreenShake(true);
        else setScreenShake(false);

        // Heartbeat audio at 8 seconds - speeds up (if enabled)
        if (settings.audio && t <= 8 && t > 0) {
            const volume = 0.3 * intensityMultiplier;
            const speed = Math.max(200, 600 - ((8 - t) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(() => playHeartbeat(volume), speed);
            playHeartbeat(volume);
        } else {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            closeHeartbeatAudio();
        }

        return () => {
            // NOTE: do NOT clear answerTimeoutRef here — this effect re-runs on
            // every tick and would cancel the just-scheduled advance timeout.
            // Unmount cleanup for it lives in its own effect above.
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        };
    }, [timer.isTimerRunning, trivia.showResult, timer.timeLeft, settings]);

    // Handle timeout - count as wrong answer
    function handleTimeOut() {
        timer.setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);

        setIncorrectCount(prev => prev + 1);
        answersRef.current.push(false); // Track timed-out answer as incorrect
        trivia.setShowResult(true);

        const config = LEVEL_CONFIG[currentLevel - 1];
        const remainingQuestions = QUESTIONS_PER_LEVEL - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCount + remainingQuestions;

        answerTimeoutRef.current = setTimeout(() => {
            if (currentQuestionIndex + 1 >= QUESTIONS_PER_LEVEL) {
                evaluateLevelResult(correctCount);
            } else if (maxPossibleCorrect < config.minCorrect) {
                setGameState('gameOver');
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                trivia.reset();
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                timer.resetTimer();
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
            console.warn('[Survival] Diamond balance load failed:', e);
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
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    /** Loads (and sets) the question set for a level. Returns the array so
     *  startLevel can verify a non-empty set before charging into 'playing'. */
    async function loadQuestionsForLevel(level) {
        setIsLoading(true);
        const config = LEVEL_CONFIG[level - 1];
        let loaded = [];

        try {
            // 60-day non-repeat: Get user's recently seen question IDs using shared utility
            const excludeIds = await getRecentlySeenIds(supabase, userId, 200, 'survival');

            // Phase 55: random offset fetch instead of "first 200" — keeps the
            // difficulty gating from before but pulls a random page each time.
            let difficulty;
            if (config.difficulty === 'easy') difficulty = 'easy';
            else if (config.difficulty === 'medium') difficulty = ['medium', 'easy'];
            else if (config.difficulty === 'hard') difficulty = 'hard';
            const data = await fetchRandomQuestionPool(supabase, { difficulty, pageSize: 200 });
            if (data && data.length > 0) {
                // Filter out recently seen questions and shuffle using shared utility (unbiased)
                // sessionExcludeIds is a HARD exclusion: a question served
                // earlier in THIS run must not come back on a later level, not
                // even via filterAndShuffle's seen/quality degradation tiers.
                const available = filterAndShuffle(data, excludeIds, QUESTIONS_PER_LEVEL, {
                    minQualityScore: 6, // Phase 51: drop low-quality
                    sessionExcludeIds: sessionServedIdsRef.current
                });
                
                if (available.length >= QUESTIONS_PER_LEVEL) {
                    // Take exactly what we need
                    loaded = shuffleOptions(available.slice(0, QUESTIONS_PER_LEVEL));
                    setQuestions(loaded);
                } else {
                    // Ultimate fallback: get any questions.
                    // Phase 58: was bypassing the quality floor (filterAndShuffle
                    // called without { minQualityScore: 6 }) — meant low-quality
                    // questions could leak into survival when the user's pool
                    // was exhausted. Apply the same quality bar as the primary
                    // path so survival never serves qs<6 to a paying player.
                    const { data: fallbackData } = await supabase
                        .from('trivia_questions')
                        .select('*')
                        .gte('quality_score', 6)
                        .limit(QUESTIONS_PER_LEVEL);

                    if (fallbackData) {
                        const fallbackAvailable = filterAndShuffle(fallbackData, [], 0, {
                            minQualityScore: 6,
                            sessionExcludeIds: sessionServedIdsRef.current
                        });
                        loaded = shuffleOptions(fallbackAvailable.slice(0, QUESTIONS_PER_LEVEL));
                        setQuestions(loaded);
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load questions:', e);
        }
        for (const q of loaded) { if (q?.id) sessionServedIdsRef.current.add(q.id); }
        setIsLoading(false);
        return loaded;
    }

    async function startLevel(level) {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so all it could still do is let a stale
        // flag from an old session buy a free run. Always charge on level 1.

        // Per-game diamond gate (VIP bypass) — only charge on level 1 (start of a new run)
        if (level === 1 && !isVip && userId) {
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
            } catch (e) {
                console.warn('[Survival] Balance check failed:', e);
            }

            if (freshBalance < GAME_ENTRY_COST) {
                setShowOutOfDiamonds(true);
                return;
            }

            const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_survival_game');
            if (!result.success) {
                setShowOutOfDiamonds(true);
                return;
            }
            if (result.balance !== undefined) setUserDiamonds(result.balance);
            // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
        }
        setCurrentLevel(level);
        setCurrentQuestionIndex(0);
        setCorrectCount(0);
        setIncorrectCount(0);
        trivia.reset();
        answersRef.current = []; // Reset per-question tracking for new level
        idempotencyRefs.current = {}; // Reset idempotency keys for new level
        savePhaseRef.current = 0;     // Fresh save pipeline for this level
        levelSpeedBonusRef.current = 0;
        setFiftyFiftyUsedFree(false);
        setEliminatedOptions([]);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
        setSkipUsedThisQuestion(false);
        setLifelinesUsedThisLevel(0); // Reset lifeline counter
        setScreenShake(false);

        // Load the level's questions BEFORE entering 'playing' and starting the
        // shot clock. Previously loadQuestionsForLevel was fired without await
        // while the timer already ran, so (a) players lost seconds off Q1 during
        // the fetch and (b) when continuing to the next level the PREVIOUS
        // level's questions rendered until the new set swapped in mid-question,
        // invalidating an in-flight answer.
        setQuestions([]);
        setGameState('loading_level');
        const loaded = await loadQuestionsForLevel(level);
        if (!loaded || loaded.length === 0) {
            setLevelLoadError('We could not load questions for this level. Please check your connection and try again.');
            setGameState('lobby');
            return;
        }
        setLevelLoadError(null);
        setGameState('playing');
        timer.resetTimer();
        startTimeRef.current = Date.now();
        } finally {
            isStartingRef.current = false;
        }
    }

    /**
     * Charge a lifeline. Returns true when the player may use it.
     *
     * Two fixes over the previous inline blocks:
     *  - VIP members are never charged (parity with HintButtons.jsx).
     *  - Every purchase gets its own reference_id. The old key was derived from
     *    (level, questionIndex), so buying the same lifeline twice on the same
     *    question across two attempts of a level was de-duplicated by the DB and
     *    handed out free.
     */
    async function chargeLifeline(cost, kind, label) {
        if (isVip) return true;
        if (!userId) return true;
        if (userDiamonds < cost) {
            setShowOutOfDiamonds(true);
            return false;
        }
        try {
            const { data, error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: -cost,
                p_type: 'survival_lifeline',
                p_description: `Survival ${label} — ${cost} diamonds`,
                p_reference_id: newPurchaseRef(kind)
            });
            if (rpcErr) throw rpcErr;
            // The RPC returns { success:false } WITHOUT an error on insufficient
            // balance or reference dedup — treat that as a failed purchase.
            if (data && typeof data === 'object' && data.success === false) {
                setShowOutOfDiamonds(true);
                return false;
            }
            const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
            busEmit.diamondsSpent(cost, label);
            return true;
        } catch (e) {
            console.warn('[Survival] Lifeline deduction failed:', e);
            setLifelineError('Could not purchase that lifeline. Please try again.');
            setTimeout(() => setLifelineError(null), 3000);
            return false;
        }
    }

    // 50/50 Lifeline - removes 2 wrong answers
    async function useFiftyFifty() {
        if (eliminatedOptions.length > 0 || trivia.showResult) return; // Already used on this question or answered

        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return;

        // VIP members never pay for lifelines (parity with HintButtons.jsx).
        const needsToPay = fiftyFiftyUsedFree && !isVip;

        if (needsToPay) {
            // Paid 50/50 now counts against the per-level lifeline cap, like
            // Skip and Double Chance. It previously bypassed the cap entirely.
            if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) return;
            const paid = await chargeLifeline(LIFELINE_COST, 'fifty_fifty', '50/50 Lifeline');
            if (!paid) return;
            setLifelinesUsedThisLevel(prev => prev + 1);
        } else {
            // Mark free use as consumed
            setFiftyFiftyUsedFree(true);
        }

        // Find wrong answer indices (not the correct one)
        const wrongIndices = currentQuestion.options
            .map((_, idx) => idx)
            .filter(idx => idx !== currentQuestion.correct_index);

        // Randomly select 2 to eliminate.
        // Phase 58: was using sort(() => Math.random() - 0.5) which is
        // mathematically biased (some permutations 2x more likely than
        // others — visible to dedicated players over many runs). Use
        // Fisher-Yates for a truly uniform shuffle.
        for (let i = wrongIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
        }
        const toEliminate = wrongIndices.slice(0, 2);
        setEliminatedOptions(toEliminate);
    }

    // Skip Question Function (costs 5 diamonds, free for VIP)
    async function useSkipQuestion() {
        if (trivia.showResult || skipUsedThisQuestion) return;
        if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) {
            // Lifeline limit reached — silently prevent
            return;
        }

        const paid = await chargeLifeline(LIFELINE_COST, 'skip', 'Skip Question');
        if (!paid) return;
        setLifelinesUsedThisLevel(prev => prev + 1);

        setSkipUsedThisQuestion(true);
        timer.setIsTimerRunning(false);

        // Push a null placeholder so answersRef stays index-aligned with
        // `questions`. Without it, every question after a skip was credited /
        // blamed against the WRONG question id in trivia_user_question_history
        // (saveProgress slices questions by answersRef.length). Nulls are
        // filtered out of the history batch.
        answersRef.current.push(null);

        if (currentQuestionIndex < QUESTIONS_PER_LEVEL - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            trivia.reset();
            setEliminatedOptions([]);
            setSkipUsedThisQuestion(false);
            setDoubleChanceActive(false);
            setDoubleChanceUsedThisQuestion(false);
            setFirstAttemptWrong(null);
            timer.resetTimer();
        } else {
            // Skipping the LAST question used to charge the player, stop the
            // clock and then do nothing at all — they sat on a dead board
            // having paid for it. Evaluate the level instead.
            evaluateLevelResult(correctCount);
        }
    }

    async function useDoubleChance() {
        if (trivia.showResult || doubleChanceUsedThisQuestion || doubleChanceActive) return;
        if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) {
            // Lifeline limit reached — silently prevent
            return;
        }

        const paid = await chargeLifeline(LIFELINE_COST, 'double', 'Double Chance');
        if (!paid) return;
        setLifelinesUsedThisLevel(prev => prev + 1);

        setDoubleChanceActive(true);
        setDoubleChanceUsedThisQuestion(true);
    }

    function selectAnswer(index) {

        if (trivia.selectedAnswer !== null || trivia.showResult) return;

        // Stop timer immediately on answer
        timer.setIsTimerRunning(false);
        const answerTime = 24 - timer.timeLeft; // How many seconds it took to answer

        // If Double Chance active and this is first attempt
        if (doubleChanceActive && firstAttemptWrong === null) {
            const currentQuestion = questions[currentQuestionIndex];
            const isCorrect = index === currentQuestion?.correct_index;

            if (!isCorrect) {
                // First wrong attempt - allow second try, reset timer. Strike
                // the wrong option out so a double-tap can't burn the paid
                // second chance on the same answer.
                setFirstAttemptWrong(index);
                setEliminatedOptions(prev => (prev.includes(index) ? prev : [...prev, index]));
                timer.resetTimer();
                return;
            }
        }

        const currentQuestion = questions[currentQuestionIndex];
        const isCorrect = index === currentQuestion?.correct_index;

        trivia.setSelectedAnswer(index);
        trivia.setShowResult(true);

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            answersRef.current.push(true);
            busEmit.decisionCorrect(correctCount + 1);

            // Speed bonus for fast answers (under 10 seconds):
            // 3 for <=3s, 2 for <=5s, 1 for <10s.
            if (answerTime < 10) {
                const bonus = answerTime <= 3 ? 3 : answerTime <= 5 ? 2 : 1;
                setSpeedBonus(bonus);
                setShowSpeedBonus(true);
                setTotalDiamondsEarned(prev => prev + bonus);
                // Track separately so evaluateLevelResult can actually AWARD it.
                levelSpeedBonusRef.current += bonus;
                setTimeout(() => setShowSpeedBonus(false), 1500);
            }
        } else {
            setIncorrectCount(prev => prev + 1);
            answersRef.current.push(false);
            busEmit.decisionIncorrect(correctCount);
            busEmit.screenShake('light');
        }

        const config = LEVEL_CONFIG[currentLevel - 1];
        const remainingQuestions = QUESTIONS_PER_LEVEL - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCount + (isCorrect ? 1 : 0) + remainingQuestions;

        answerTimeoutRef.current = setTimeout(() => {
            if (currentQuestionIndex + 1 >= QUESTIONS_PER_LEVEL) {
                const finalCorrect = correctCount + (isCorrect ? 1 : 0);
                evaluateLevelResult(finalCorrect);
            } else if (maxPossibleCorrect < config.minCorrect) {
                setGameState('gameOver');
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                trivia.reset();
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                // Reset and restart timer
                timer.resetTimer();
            }
        }, 1200);
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=diamonds, 2=progress, 3=history

    const idempotencyRefs = useRef({});
    const randomToken = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch (e) { /* fall through */ }
        return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    };
    /** Stable-per-action key: reused across Retry Save so retries are idempotent. */
    const getIdempotencyKey = (actionType) => {
        if (!idempotencyRefs.current[actionType]) {
            idempotencyRefs.current[actionType] = `survival_${actionType}_${randomToken()}`;
        }
        return idempotencyRefs.current[actionType];
    };
    /** Fresh-per-call key: one-shot purchases that must never be de-duplicated. */
    const newPurchaseRef = (kind) => `survival_${kind}_${userId || 'anon'}_${randomToken()}`;

    function evaluateLevelResult(finalCorrect) {
        const config = LEVEL_CONFIG[currentLevel - 1];
        const passed = finalCorrect >= config.minCorrect;

        if (passed) {
            // Award diamonds for this level ONLY (not cumulative).
            // Speed bonuses accumulated during the level are now INCLUDED — they
            // were displayed as earned in the HUD and level-complete totals but
            // never actually credited (saveProgress only sent currentLevel*2).
            const levelDiamonds = currentLevel * 2 + levelSpeedBonusRef.current;
            // The running total is now advanced by saveProgress with the amount
            // the daily cap ACTUALLY credited. The optimistic `currentLevel * 2`
            // here was wrong twice over: it dropped the speed bonus that IS
            // awarded, and it ignored the cap, so a capped player was shown
            // diamonds that never reached their balance.

            setGameState('saving_progress'); // Show skeleton
            if (currentLevel >= 10) {
                // Victory!
                saveProgress(10, levelDiamonds, 'victory');
            } else {
                saveProgress(currentLevel, levelDiamonds, 'levelComplete');
            }
        } else {
            // A failed level used to save NOTHING — no trivia_scores row and no
            // question history — so every question from a failed run went
            // straight back into the player's pool, breaking the 60-day
            // non-repeat guarantee for the most-played path in the mode.
            // Record the partial run (no diamonds awarded for a failure).
            setGameState('saving_progress');
            saveFailedRun();
        }
    }

    /**
     * Persist a FAILED level: question history + a trivia_scores row, no reward.
     * Never blocks the player — any failure here just warns and shows gameOver.
     */
    async function saveFailedRun() {
        try {
            if (userId) {
                await recordQuestionHistory();
                const levelCorrect = answersRef.current.filter(a => a === true).length;
                const answered = answersRef.current.length;
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'survival',
                    score: levelCorrect * 100,
                    correct_count: levelCorrect,
                    total_questions: answered > 0 ? answered : QUESTIONS_PER_LEVEL,
                    diamonds_earned: 0,
                    play_date: getTodayCST()
                });
                if (scoreErr) console.warn('[Survival] Failed-run score insert failed (non-fatal):', scoreErr.message);
            }
        } catch (e) {
            console.warn('[Survival] Failed-run save error (non-fatal):', e);
        }
        setGameState('gameOver');
    }

    /**
     * Upsert this level's question history.
     * `answersRef` may contain nulls (skipped questions) — those are dropped so
     * a skip never mis-attributes correctness, while the index alignment with
     * `questions` is preserved.
     */
    async function recordQuestionHistory() {
        if (!userId || !questions || questions.length === 0) return;
        if (answersRef.current.length === 0) return;
        const answeredQuestions = questions.slice(0, answersRef.current.length);
        const historyRecords = answeredQuestions
            .map((q, idx) => ({ q, outcome: answersRef.current[idx] }))
            .filter(({ q, outcome }) => q && q.id != null && outcome != null)
            .map(({ q, outcome }) => ({
                user_id: userId,
                question_id: q.id,
                was_correct: outcome === true,
                seen_at: new Date().toISOString(),
                mode: 'survival'
            }));
        if (historyRecords.length === 0) return;
        // ignoreDuplicates:true => ON CONFLICT DO NOTHING. trivia_user_question_history
        // has SELECT + INSERT RLS policies but NO UPDATE policy, so the previous
        // ignoreDuplicates:false failed the ENTIRE batch whenever any question had
        // been seen before — silently dropping the whole run's history.
        const { error: historyErr } = await supabase
            .from('trivia_user_question_history')
            .upsert(historyRecords, { onConflict: 'user_id,question_id', ignoreDuplicates: true });
        if (historyErr) {
            console.warn('[Survival] History upsert failed (non-fatal):', historyErr.message);
        }
    }

    async function saveProgress(level, diamonds, targetGameState) {
        if (!userId) return;

        try {
            let actualAwarded = 0;
            // Phase 1: Award diamonds (only if not already awarded)
            if (savePhaseRef.current < 1) {
                // Clamp to daily cap
                const earnedToday = await getDailyDiamondsEarned(supabase, userId, 'survival');
                const cappedDiamonds = clampToCap(earnedToday, diamonds, DAILY_DIAMOND_CAP);
                if (cappedDiamonds > 0) {
                    const { data: rpcData, error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: cappedDiamonds,
                        p_type: 'survival_reward',
                        p_description: `Survival Level ${level} — ${cappedDiamonds}💎`,
                        p_reference_id: getIdempotencyKey(`level_${level}_reward`)
                    });
                    // Phase 58: was warning-only — caused silent money loss when
                    // RPC failed (user saw "+10💎" toast but balance unchanged
                    // and trivia_scores recorded false diamonds_earned). Throw so
                    // the catch block surfaces a Retry UI; idempotency key is
                    // stable across retries so the second attempt is safe.
                    if (rpcErr) throw rpcErr;
                    // The RPC can return { success:false } without an error.
                    if (rpcData && typeof rpcData === 'object' && rpcData.success === false) {
                        throw new Error(rpcData.error || 'Diamond award was rejected');
                    }
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsEarned(cappedDiamonds, `Survival Level ${level}`);
                    busEmit.celebration('confetti');
                    actualAwarded = cappedDiamonds;
                }
                // Render the CLAMPED value, never the raw per-level formula.
                setTotalDiamondsEarned(prev => prev + cappedDiamonds);
                if (cappedDiamonds < diamonds) setCapReachedThisRun(true);
                savePhaseRef.current = 1;
            }

            // Phase 2: Upsert survival progress (only if not already updated)
            if (savePhaseRef.current < 2) {
                // Phase 58: capture upsert error — was silently swallowed,
                // so a failed progress write still advanced savePhaseRef and
                // claimed success in the UI. Throw to trigger Retry flow.
                const { error: progressErr } = await supabase
                    .from('survival_progress')
                    .upsert({
                        user_id: userId,
                        highest_level: Math.max(level, userProgress.highestLevel),
                        last_played: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                // Non-fatal: `survival_progress` is created by no migration in
                // this repo. Throwing here trapped players who had ALREADY been
                // awarded diamonds in phase 1 inside a Retry loop that could
                // never succeed if the table is missing/mis-permissioned.
                if (progressErr) {
                    console.warn('[Survival] Progress upsert failed (non-fatal):', progressErr.message);
                }

                setUserProgress(prev => ({
                    ...prev,
                    highestLevel: Math.max(level, prev.highestLevel)
                }));
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded).
            // Shared with the failed-run path so both record identically.
            if (savePhaseRef.current < 3) {
                await recordQuestionHistory();
                savePhaseRef.current = 3;
            }

            // Phase 4: Record to unified trivia_scores (for leaderboard).
            // Capture insert error — supabase-js does NOT throw on DB errors.
            if (savePhaseRef.current < 4) {
                // Phase 73: CST-anchored play_date so leaderboard.js (which
                // queries by CST today) finds same-day rows. Was UTC date —
                // 6pm-midnight CST scores were attributed to next day.
                const today = getTodayCST();
                const levelCorrect = answersRef.current.filter(a => a === true).length;
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'survival',
                    score: levelCorrect * 100,
                    correct_count: levelCorrect,
                    total_questions: QUESTIONS_PER_LEVEL,
                    diamonds_earned: actualAwarded,
                    play_date: today
                });
                if (scoreErr) throw scoreErr;
                savePhaseRef.current = 4;
            }

            // Success! Game saved — reset phase for next level/game
            setGameState(targetGameState);
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Survival] Failed to save progress:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ level, diamonds, targetGameState });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving_progress');
        setSaveErrorPayload(null);
        saveProgress(saveErrorPayload.level, saveErrorPayload.diamonds, saveErrorPayload.targetGameState); // savePhaseRef skips already-completed steps
    };

    function continueToNextLevel() {
        startLevel(currentLevel + 1);
    }

    function restartFromLevel(level) {
        setTotalDiamondsEarned(0);
        setCapReachedThisRun(false);
        startLevel(level);
    }

    function backToLobby() {
        router.push('/hub/trivia');
    }

    const config = LEVEL_CONFIG[currentLevel - 1];
    const progressPercent = ((currentQuestionIndex + 1) / QUESTIONS_PER_LEVEL) * 100;

    // Questions the player got wrong this level, with the right answer, for the
    // post-run review panel on the game-over screen.
    const reviewMissed = questions
        .slice(0, answersRef.current.length)
        .map((q, idx) => ({ q, outcome: answersRef.current[idx] }))
        .filter(({ q, outcome }) => q && outcome === false)
        .map(({ q }, i) => ({
            id: q.id ?? `missed-${i}`,
            question: q.question,
            correctOption: Array.isArray(q.options) ? q.options[q.correct_index] : ''
        }));

    return (
        <TriviaErrorBoundary pageName="Survival Mode">
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
                                {levelLoadError && (
                                    <div role="alert" style={{
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        borderRadius: '12px',
                                        padding: '14px 16px',
                                        marginBottom: '16px',
                                        color: '#fecaca',
                                        fontSize: '14px',
                                        textAlign: 'center'
                                    }}>
                                        {levelLoadError}
                                    </div>
                                )}
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

                        {/* Saving State (TriviaSkeleton) */}
                        {gameState === 'saving_progress' && (
                            <TriviaSkeleton />
                        )}

                        {/* Loading the level's question set (shot clock not started yet) */}
                        {gameState === 'loading_level' && (
                            <div>
                                <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: '16px' }}>
                                    Dealing Level {currentLevel}...
                                </div>
                                <TriviaSkeleton />
                            </div>
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
                                        We couldn't save your progress for Level {saveErrorPayload?.level} because you lost connection. Please check your internet and try again so you don't lose {saveErrorPayload?.diamonds}💎!
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
                                            You left the screen. Time remaining: {timer.timeLeft}s
                                        </p>
                                        <button
                                            onClick={() => { setIsPaused(false); timer.setIsTimerRunning(true); }}
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

                                {/* Lifeline purchase failure (was a console.warn only) */}
                                {lifelineError && (
                                    <div role="alert" style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        marginBottom: '12px',
                                        color: '#fecaca',
                                        fontSize: '13px',
                                        textAlign: 'center'
                                    }}>
                                        {lifelineError}
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
                                        onClick={() => setShowSettingsPanel(prev => !prev)}
                                        aria-label="Game Settings"
                                        aria-expanded={showSettingsPanel}
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
                                            color: '#fff'
                                        }}
                                    >
                                        <SettingsIcon size={16} />
                                    </button>

                                    {/* Timer Display.
                                        Honours the "Timer" preference from /hub/trivia/settings
                                        (shared 'trivia_settings' store). The shot clock itself
                                        always runs — hiding it is a display choice, not a way to
                                        remove the time pressure that the mode is built on. */}
                                    <div style={{
                                        visibility: settings.timerEnabled === false ? 'hidden' : 'visible',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '12px 24px',
                                        background: timer.timeLeft <= 3 ? 'rgba(239, 68, 68, 0.3)' :
                                            timer.timeLeft <= 8 ? 'rgba(251, 191, 36, 0.2)' :
                                                'rgba(0, 212, 255, 0.15)',
                                        border: `2px solid ${timer.timeLeft <= 3 ? '#ef4444' :
                                            timer.timeLeft <= 8 ? '#fbbf24' : '#00D4FF'}`,
                                        borderRadius: '50px'
                                    }}>
                                        <TimerIcon size={18} color={timer.timeLeft <= 3 ? '#ef4444' : timer.timeLeft <= 8 ? '#fbbf24' : '#00D4FF'} />
                                        <span style={{
                                            fontSize: '28px',
                                            fontWeight: 'bold',
                                            fontFamily: 'monospace',
                                            color: timer.timeLeft <= 3 ? '#ef4444' :
                                                timer.timeLeft <= 8 ? '#fbbf24' : '#00D4FF',
                                            minWidth: '40px',
                                            textAlign: 'center'
                                        }}>
                                            {timer.timeLeft}
                                        </span>
                                        {lifelinesUsedThisLevel > 0 && (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                fontSize: '11px',
                                                color: 'rgba(255,255,255,0.6)',
                                                marginLeft: '8px'
                                            }}>
                                                <ZapIcon size={11} />
                                                {lifelinesUsedThisLevel}/{MAX_LIFELINES_PER_LEVEL}
                                            </span>
                                        )}
                                    </div>

                                    {/* Spacer for symmetry */}
                                    <div style={{ width: '36px' }} />
                                </div>

                                {/* Settings Panel */}
                                {showSettingsPanel && (
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
                                                onClick={() => triviaAudio.setMuted(settings.audio)}
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
                                        Current: {correctCount}/{currentQuestionIndex + (trivia.showResult ? 1 : 0)}
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

                                            if (isEliminated && !trivia.showResult) {
                                                // Eliminated by 50/50
                                                bg = 'rgba(100, 100, 100, 0.1)';
                                                borderColor = 'rgba(100, 100, 100, 0.2)';
                                            } else if (trivia.showResult) {
                                                if (index === currentQuestion.correct_index) {
                                                    bg = 'rgba(34, 197, 94, 0.2)';
                                                    borderColor = '#22c55e';
                                                } else if (index === trivia.selectedAnswer) {
                                                    bg = 'rgba(239, 68, 68, 0.2)';
                                                    borderColor = '#ef4444';
                                                }
                                            }

                                            return (
                                                <button
                                                    key={index}
                                                    onClick={() => selectAnswer(index)}
                                                    disabled={trivia.selectedAnswer !== null || isEliminated}
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
                                                        cursor: (trivia.selectedAnswer !== null || isEliminated) ? 'default' : 'pointer',
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
                                    {!trivia.showResult && (
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
                                                ) : (fiftyFiftyUsedFree && !isVip) ? (
                                                    <span style={{ fontSize: '11px', color: '#00D4FF' }}>{LIFELINE_COST} DIAMONDS</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>FREE</span>
                                                )}
                                            </button>

                                            {/* Skip Question Button */}
                                            <button
                                                onClick={useSkipQuestion}
                                                disabled={lifelineLocked}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (lifelineLocked)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(200, 150, 30, 0.3))',
                                                    border: `2px solid ${(lifelineLocked) ? '#666' : '#fbbf24'}`,
                                                    borderRadius: '12px',
                                                    color: (lifelineLocked) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (lifelineLocked) ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>⏭️</span>
                                                <span>Skip</span>
                                                <span style={{ fontSize: '11px', color: isVip ? '#22c55e' : '#fbbf24' }}>{isVip ? 'FREE' : `${LIFELINE_COST} DIAMONDS`}</span>
                                            </button>

                                            {/* Double Chance Button */}
                                            <button
                                                onClick={useDoubleChance}
                                                disabled={doubleChanceUsedThisQuestion || doubleChanceActive || lifelineLocked}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (doubleChanceUsedThisQuestion || doubleChanceActive || lifelineLocked)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(120, 60, 180, 0.3))',
                                                    border: `2px solid ${(doubleChanceUsedThisQuestion || doubleChanceActive || lifelineLocked) ? '#666' : '#a855f7'}`,
                                                    borderRadius: '12px',
                                                    color: (doubleChanceUsedThisQuestion || doubleChanceActive || lifelineLocked) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (doubleChanceUsedThisQuestion || doubleChanceActive || lifelineLocked) ? 'default' : 'pointer',
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
                                                    <span style={{ fontSize: '11px', color: isVip ? '#22c55e' : '#a855f7' }}>{isVip ? 'FREE' : `${LIFELINE_COST} DIAMONDS`}</span>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Report-a-bad-question — the component was imported here but
                                        never rendered, leaving the 3-strike quality demotion
                                        pipeline unwired in survival. Shown once the answer is
                                        revealed so it cannot be used to stall the shot clock. */}
                                    {trivia.showResult && currentQuestion?.id != null && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                                            <ReportQuestionButton
                                                questionId={currentQuestion.id}
                                                userToken={accessToken}
                                            />
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
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '8px' }}>
                                        You needed {config.accuracyRequired}% accuracy to pass
                                    </div>
                                    {/* Economy clarity: the 10-diamond entry fee is charged on
                                        level 1 only, so retrying a failed level costs nothing. */}
                                    <div style={{ color: '#22c55e', fontSize: '13px', marginBottom: '20px' }}>
                                        Retries Are Free — You Only Pay To Start A New Run
                                    </div>

                                    {/* Post-run review: learn from the ones you missed.
                                        Uses data already in memory (questions + answersRef). */}
                                    {reviewMissed.length > 0 && (
                                        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                                            <button
                                                onClick={() => setShowReview(prev => !prev)}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 14px',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    border: '1px solid rgba(255,255,255,0.15)',
                                                    borderRadius: '10px',
                                                    color: '#e4e6eb',
                                                    fontSize: '14px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {showReview ? 'Hide' : 'Review'} {reviewMissed.length} Missed {reviewMissed.length === 1 ? 'Question' : 'Questions'}
                                            </button>
                                            {showReview && (
                                                <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '10px' }}>
                                                    {reviewMissed.map((item) => (
                                                        <div key={item.id} style={{
                                                            background: 'rgba(0,0,0,0.35)',
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                            borderRadius: '8px',
                                                            padding: '10px 12px',
                                                            marginBottom: '8px'
                                                        }}>
                                                            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginBottom: '6px' }}>
                                                                {toTitleCase(item.question)}
                                                            </div>
                                                            <div style={{ color: '#22c55e', fontSize: '12px' }}>
                                                                Correct: {toTitleCase(item.correctOption || '')}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                            {capReachedThisRun && (
                                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: 6 }}>
                                                    Daily earning cap reached — later levels paid less than shown in the HUD.
                                                </div>
                                            )}
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
                                        <button
                                            onClick={async () => {
                                                const r = await shareResult({ mode: 'Survival', score: correctCount, total: QUESTIONS_PER_LEVEL, diamonds: totalDiamondsEarned });
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
                  <BottomNavBar />
    </PageTransition>
        </TriviaErrorBoundary>
    );
}
