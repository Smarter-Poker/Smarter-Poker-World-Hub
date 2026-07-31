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
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import { getAccessToken } from '../../../src/lib/authUtils';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { Settings as SettingsIcon, Timer as TimerIcon, Zap as ZapIcon } from 'lucide-react';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP
// Daily cap comes from triviaEngine so the lobby price and the payout ceiling
// can never disagree. The local literal was 10 — the same as a single entry
// fee, which made the mode net-negative by construction.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.endless) ? DAILY_DIAMOND_CAPS.endless : 40;

/**
 * Unique-per-purchase idempotency reference.
 *
 * The previous scheme was `${prefix}_${userId}_${Math.floor(Date.now()/60000)}`
 * — a per-minute bucket. Two purchases (or two game-overs) inside the same
 * 60s window produced the SAME reference_id, so add_diamonds_to_balance
 * de-duplicated the second one: repeat lifeline buys were free, and the second
 * reward of the minute was silently never credited. Every money event now gets
 * its own reference. Retry stability is provided by the caller holding the
 * generated value in a ref (see gameRewardRefId).
 */
function newReferenceId(prefix, userId) {
    let unique;
    try {
        unique = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    } catch (e) {
        unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return `${prefix}_${userId}_${unique}`;
}

export default function EndlessModePage() {
    useTrainingBus('trivia-endless');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    const [gameState, setGameState] = useState('ready'); // ready, playing, gameover
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-4 — selectedAnswer/showResult managed by shared hook
    const currentQuestion = questions[currentIndex];
    const trivia = useTriviaQuestion(currentQuestion);
    // TRAIN-WIRE-TRIVIA-TIMER-4 — shared shot-clock hook (autoResumeOnVisible=false: explicit Resume UI)
    const timer = useTriviaTimer({
        initialTime: 24,
        showResult: trivia.showResult,
        gameState,
        onTimeout: handleTimeOut,
        autoResumeOnVisible: false,
    });
    const [streak, setStreak] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    // What the daily cap ACTUALLY credited. The results screen used to render
    // the raw running total, so a capped player was told they earned diamonds
    // that never reached their balance.
    const [awardedDiamonds, setAwardedDiamonds] = useState(null);
    const [multiplier, setMultiplier] = useState(1);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [highScore, setHighScore] = useState(0);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    // Captured at startGame so the "NEW HIGH SCORE" banner only celebrates a
    // genuine record. Previously the banner compared against `highScore`, which
    // saveGameResult had already overwritten, and used `>=` so merely tying the
    // previous best (or scoring 0 vs a 0 best) triggered a fake celebration.
    const [preGameHighScore, setPreGameHighScore] = useState(0);
    // Settings panel visibility. Deliberately NOT part of the persisted
    // `settings` object — it used to be stored inside it, so localStorage
    // 'trivia_settings' carried showPanel:true and the panel auto-opened over
    // the board on every future session (and in survival-game, which shares
    // the same storage key).
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [loadError, setLoadError] = useState(null);

    // 50/50 Lifeline State
    const [fiftyFiftyUsedFree, setFiftyFiftyUsedFree] = useState(false); // One free per game
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [userDiamonds, setUserDiamonds] = useState(0);

    // Lifeline usage tracking (max 3 per game, all cost 5💎)
    const [lifelinesUsedThisGame, setLifelinesUsedThisGame] = useState(0);
    const LIFELINE_COST = 5;
    const MAX_LIFELINES_PER_GAME = 3;
    // A lifeline is unavailable when the per-game cap is spent, or (non-VIP only)
    // the player can't afford it. VIP members get lifelines free, so the balance
    // check must not disable their buttons.
    const lifelineLocked = lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME
        || (!isVip && userDiamonds < LIFELINE_COST);

    // Skip Question Lifeline state
    const [skipUsedThisQuestion, setSkipUsedThisQuestion] = useState(false);
    // Surfaced when a lifeline purchase fails (was previously a console.warn only,
    // so the button just looked dead).
    const [lifelineError, setLifelineError] = useState(null);

    // Double Chance Lifeline state
    const [doubleChanceActive, setDoubleChanceActive] = useState(false);
    const [doubleChanceUsedThisQuestion, setDoubleChanceUsedThisQuestion] = useState(false);
    const [firstAttemptWrong, setFirstAttemptWrong] = useState(null);

    // 24-Second Shot Clock State
    const [screenShake, setScreenShake] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Visibility-based pause
    const heartbeatIntervalRef = useRef(null);

    // Refs to avoid stale closures in setTimeout-triggered saveGameResult
    const streakRef = useRef(0);
    const diamondsEarnedRef = useRef(0);
    const currentIndexRef = useRef(0);
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race
    // Mirror of `questions` so startGame can verify a non-empty pool
    // synchronously after awaiting a load (setState has not flushed yet).
    const questionsRef = useRef([]);
    useEffect(() => { questionsRef.current = questions; }, [questions]);
    // Every question id served in THIS sitting — passed to filterAndShuffle as
    // a hard exclusion so a top-up batch can never repeat an earlier question.
    const sessionServedIdsRef = useRef(new Set());

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
    // Multiplier tier-up celebration (every 5 correct answers)
    const [milestoneMultiplier, setMilestoneMultiplier] = useState(0);

    const startTimeRef = useRef(null);
    const [gameDurationSec, setGameDurationSec] = useState(0);
    // Per-game reward idempotency reference (stable across Retry Save attempts,
    // unique per game). Replaces the per-minute bucket that silently swallowed
    // the second game-over inside the same minute.
    const gameRewardRefId = useRef(null);

    // Calculate multiplier based on streak (increases every 5 questions)
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // ── SOUND: one switch, globally ────────────────────────────────────
    // triviaAudio owns the mute flag for the whole trivia system. This page
    // used to keep an independent `settings.audio` boolean, so muting here left
    // TriviaGame loud (and vice versa) — three separate mute switches in total.
    // settings.audio is now a read-only mirror of !triviaAudio.isMuted().
    useEffect(() => {
        const sync = (m) => setSettings(prev => (prev.audio === !m ? prev : { ...prev, audio: !m }));
        sync(triviaAudio.isMuted());
        return triviaAudio.onMuteChange(sync);
    }, []);

    // Initialize
    useEffect(() => {
        if (authLoading) return;
        async function init() {
            const user = avatarUser || getAuthUser();
            if (user) {
                setUserId(user.id);
                try { setAccessToken(getAccessToken()); } catch (e) { /* anonymous report still allowed */ }
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
                    if (data) { setHighScore(data.high_score || 0); setPreGameHighScore(data.high_score || 0); }
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
            // Load settings from the shared 'trivia_settings' store that
            // /hub/trivia/settings now writes to (one settings system).
            // showPanel is stripped: it is component state, never persisted.
            try {
                const savedSettings = localStorage.getItem('trivia_settings');
                if (savedSettings) {
                    const parsed = JSON.parse(savedSettings) || {};
                    delete parsed.showPanel;
                    // `audio` is owned by triviaAudio (see the mirror effect
                    // below), not by this blob — otherwise a stale copy here
                    // silently un-mutes a player who muted somewhere else.
                    delete parsed.audio;
                    setSettings(prev => ({ ...prev, ...parsed }));
                }
            } catch (e) { console.warn("[endless.js]", e); }

            // Pass user.id explicitly: `userId` state has not propagated yet at
            // this point, so the previous call resolved getRecentlySeenIds with
            // a null user and the first ~50 questions of every session bypassed
            // the 60-day non-repeat filter entirely.
            await loadMoreQuestions(user?.id || null);
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

    // Save settings to localStorage when changed. Merges into whatever the
    // settings page stored so this page never clobbers keys it doesn't own
    // (difficulty / timerEnabled / hintsEnabled live in the same object).
    useEffect(() => {
        try {
            let existing = {};
            try { existing = JSON.parse(localStorage.getItem('trivia_settings') || '{}') || {}; } catch (e) { existing = {}; }
            const { showPanel: _drop, ...persistable } = settings;
            localStorage.setItem('trivia_settings', JSON.stringify({ ...existing, ...persistable }));
        } catch (e) { console.warn("[endless.js]", e); }
    }, [settings]);

    // Unmount-only cleanup for the question-advance timeout.
    //
    // This used to live in the per-tick side-effect cleanup below. Because that
    // effect re-runs on every timer tick / showResult flip, answering a question
    // scheduled the advance timeout and the effect's PREVIOUS cleanup then
    // cancelled it microseconds later — the board froze on the revealed answer
    // and never advanced, never saved and never reached game over. Keeping the
    // clear here means it only fires when the page actually unmounts.
    useEffect(() => {
        return () => {
            if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        };
    }, []);

    // Visibility-based pause: sets overlay UI (timer stopped by useTriviaTimer; resume is explicit here)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && timer.isTimerRunning) setIsPaused(true);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [timer.isTimerRunning]);

    // Load more questions when running low
    useEffect(() => {
        if (questions.length > 0 && currentIndex >= questions.length - 5) {
            loadMoreQuestions();
        }
    }, [currentIndex, questions.length]);

    async function loadMoreQuestions(uidOverride) {
        try {
            // `uidOverride` lets init() pass user.id before the userId state has
            // propagated — otherwise the 60-day exclusion silently no-ops.
            const uid = uidOverride || userId;
            // 60-day non-repeat: Get user's recently seen question IDs using shared utility
            const excludeIds = await getRecentlySeenIds(supabase, uid, 200, 'endless');

            // Respect the player's preferred difficulty from the shared settings
            // store (written by /hub/trivia/settings). 'any' / unset = full pool.
            let preferredDifficulty;
            try {
                const saved = JSON.parse(localStorage.getItem('trivia_settings') || '{}') || {};
                if (['easy', 'medium', 'hard'].includes(saved.difficulty)) preferredDifficulty = saved.difficulty;
            } catch (e) { preferredDifficulty = undefined; }

            // Phase 55: random offset fetch — was always pulling the same 200
            // newest rows, so users in long sessions cycled through the same window
            // while 8400+ other questions never appeared.
            let data = await fetchRandomQuestionPool(supabase, { pageSize: 200, difficulty: preferredDifficulty });
            // If the preferred difficulty has no usable pool, fall back to all
            // difficulties rather than leaving the player with a blank board.
            if ((!data || data.length === 0) && preferredDifficulty) {
                data = await fetchRandomQuestionPool(supabase, { pageSize: 200 });
            }
            if (data && data.length > 0) {
                // Filter out recently seen questions and shuffle using shared utility (unbiased)
                // Phase 51: prefer high-quality questions for casual endless play
                // sessionExcludeIds is a HARD exclusion: a question already
                // served in this sitting must never come back, not even through
                // filterAndShuffle's seen/quality degradation fallbacks. Without
                // it a long endless run re-served questions from earlier in the
                // SAME game as soon as the unseen pool ran thin.
                const available = filterAndShuffle(data, excludeIds, 20, {
                    minQualityScore: 6,
                    preferHighQuality: true,
                    sessionExcludeIds: sessionServedIdsRef.current
                });
                const toAdd = shuffleOptions(available.slice(0, 50));
                for (const q of toAdd) { if (q?.id) sessionServedIdsRef.current.add(q.id); }

                setQuestions(prev => {
                    const next = [...prev, ...toAdd];
                    // Keep the ref hot immediately — startGame needs to verify a
                    // non-empty pool before charging, without waiting for a render.
                    questionsRef.current = next;
                    return next;
                });
                return toAdd;
            }
        } catch (e) {
            console.warn('Failed to load questions:', e);
        }
        return [];
    }

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // Verify a non-empty pool BEFORE taking the entry fee. Previously the
        // ready-screen image was clickable while isLoading was true, so a player
        // could pay 10💎, land on a blank board (questions.length === 0) and get
        // run down by the shot clock into an instant 0-streak game over.
        // NOTE: read the array loadMoreQuestions RETURNS, not the `questions`
        // state — setQuestions has not re-rendered yet at this point.
        let pool = (questions && questions.length > 0) ? questions : questionsRef.current;
        if (!pool || pool.length === 0) {
            setIsLoading(true);
            const added = await loadMoreQuestions();
            setIsLoading(false);
            pool = (added && added.length > 0) ? added : questionsRef.current;
        }
        if (!pool || pool.length === 0) {
            setLoadError('We could not load any questions right now. Please check your connection and try again.');
            return;
        }
        setLoadError(null);

        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so the only thing it could still do was let
        // a stale flag from an earlier session buy a free entry. Always charge.

        // Per-game diamond gate (VIP bypass)
        if (!isVip && userId) {
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
        setGameDurationSec(0);
        setPreGameHighScore(highScore);
        streakRef.current = 0;
        diamondsEarnedRef.current = 0;
        setAwardedDiamonds(null);
        currentIndexRef.current = 0;
        // Fresh per-game reward reference + save-phase tracker so game 2 in the
        // same minute is credited independently of game 1.
        gameRewardRefId.current = newReferenceId('endless_reward', userId || 'anon');
        savePhaseRef.current = 0;
        // Reset all lifeline states for new game
        setFiftyFiftyUsedFree(false);
        setEliminatedOptions([]);
        setSkipUsedThisQuestion(false);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
        setLifelinesUsedThisGame(0);
        // Start shot clock
        timer.resetTimer();
        setScreenShake(false);
        startTimeRef.current = Date.now();
        } finally {
            isStartingRef.current = false;
        }
    }

    // Side-effects of timer tick: haptics, screenShake, heartbeat audio.
    // useTriviaTimer owns the countdown; this effect only reacts to timer.timeLeft changes.
    useEffect(() => {
        if (!timer.isTimerRunning || trivia.showResult) {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            setScreenShake(false);
            return;
        }

        const intensityMultiplier = settings.intensity === 'high' ? 1 : settings.intensity === 'medium' ? 0.6 : 0.3;
        const t = timer.timeLeft;

        // Haptic feedback (if enabled)
        if (settings.haptics && 'vibrate' in navigator) {
            const baseVibration = t <= 3 ? 100 : t <= 8 ? 50 : 20;
            navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
        }

        // Screen shake (if enabled)
        if (settings.screenShake && t <= 3 && t > 0) setScreenShake(true);
        else setScreenShake(false);

        // Heartbeat audio (if enabled)
        if (settings.audio && t <= 8 && t > 0) {
            const volume = 0.3 * intensityMultiplier;
            const speed = Math.max(200, 600 - ((8 - t) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(() => playHeartbeat(volume), speed);
            playHeartbeat(volume);
        } else {
            if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
            closeHeartbeatAudio();
        }

        return () => {
            // NOTE: do NOT clear answerTimeoutRef here. This effect re-runs on
            // every tick, and its cleanup would cancel the just-scheduled
            // question-advance timeout, soft-locking the game. Unmount cleanup
            // for that timeout lives in its own effect above.
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            closeHeartbeatAudio();
        };
    }, [timer.isTimerRunning, trivia.showResult, timer.timeLeft, settings]);

    // Handle timeout - game over.
    // Mirrors selectAnswer's wrong-answer path: show the 'saving' skeleton and
    // let saveGameResult decide the final state. Previously this jumped straight
    // to 'gameover' and could then flash into 'saving_error' behind the panel.
    function handleTimeOut() {
        timer.setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        trivia.setShowResult(true);
        answerTimeoutRef.current = setTimeout(() => {
            finalizeDuration();
            setGameState('saving');
            saveGameResult();
        }, 1500);
    }

    function finalizeDuration() {
        if (startTimeRef.current) {
            setGameDurationSec(Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000)));
        }
    }

    /**
     * Charge a lifeline. Returns true when the player may use it.
     * VIP members are never charged (matching HintButtons.jsx / StrategyTrivia)
     * and every purchase gets a unique reference_id so repeat buys are not
     * de-duplicated away by the DB.
     */
    async function chargeLifeline(cost, prefix, label) {
        if (isVip) return true;              // VIP lifelines are free
        if (!userId) return true;            // Guest play — nothing to charge
        if (userDiamonds < cost) {
            setShowOutOfDiamonds(true);
            return false;
        }
        try {
            const { data, error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: -cost,
                p_type: 'endless_lifeline',
                p_description: `Endless ${label} — ${cost} diamonds`,
                p_reference_id: newReferenceId(prefix, userId)
            });
            if (rpcErr) throw rpcErr;
            // The RPC can return { success:false } WITHOUT an error (insufficient
            // balance / dedup). Treat that as a failure instead of granting a
            // lifeline the player never paid for.
            if (data && typeof data === 'object' && data.success === false) {
                setShowOutOfDiamonds(true);
                return false;
            }
            const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
            busEmit.diamondsSpent(cost, label);
            return true;
        } catch (e) {
            console.warn('[Endless] Lifeline deduction failed:', e);
            setLifelineError('Could not purchase that lifeline. Please try again.');
            setTimeout(() => setLifelineError(null), 3000);
            return false;
        }
    }

    // 50/50 Lifeline Function
    async function useFiftyFifty() {
        if (eliminatedOptions.length > 0 || trivia.showResult) return; // Already used on this question

        const currentQ = questions[currentIndex];
        if (!currentQ) return;

        const needsToPay = fiftyFiftyUsedFree && !isVip;

        if (needsToPay) {
            // Paid 50/50 counts against the per-game lifeline cap, like Skip and
            // Double Chance. It previously bypassed the cap entirely.
            if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) return;
            const paid = await chargeLifeline(LIFELINE_COST, 'endless_fifty', '50/50 Lifeline');
            if (!paid) return;
            setLifelinesUsedThisGame(prev => prev + 1);
        } else {
            setFiftyFiftyUsedFree(true);
        }

        // Find wrong answer indices
        const wrongIndices = currentQ.options
            .map((_, idx) => idx)
            .filter(idx => idx !== currentQ.correct_index);

        // Phase 59: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
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
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }

        const paid = await chargeLifeline(LIFELINE_COST, 'endless_skip', 'Skip Question');
        if (!paid) return;
        setLifelinesUsedThisGame(prev => prev + 1);

        setSkipUsedThisQuestion(true);
        timer.setIsTimerRunning(false);

        // Move to next question without penalty (keep streak)
        setCurrentIndex(prev => prev + 1);
        trivia.reset();
        setEliminatedOptions([]);
        setSkipUsedThisQuestion(false);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
        timer.resetTimer();
    }

    async function useDoubleChance() {
        if (trivia.showResult || doubleChanceUsedThisQuestion || doubleChanceActive) return;
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }

        const paid = await chargeLifeline(LIFELINE_COST, 'endless_double', 'Double Chance');
        if (!paid) return;
        setLifelinesUsedThisGame(prev => prev + 1);

        setDoubleChanceActive(true);
        setDoubleChanceUsedThisQuestion(true);
    }

    function selectAnswer(index) {
        if (trivia.selectedAnswer !== null) return;

        // Stop timer
        timer.setIsTimerRunning(false);
        const answerTime = 24 - timer.timeLeft; // How many seconds it took to answer

        // If Double Chance active and this is first attempt
        if (doubleChanceActive && firstAttemptWrong === null) {
            const currentQuestion = questions[currentIndex];
            const correct = index === currentQuestion?.correct_index;

            if (!correct) {
                // First wrong attempt - allow second try, reset timer.
                // Also strike the wrong option out so the player cannot burn
                // their second chance by double-tapping the same answer.
                setFirstAttemptWrong(index);
                setEliminatedOptions(prev => (prev.includes(index) ? prev : [...prev, index]));
                timer.resetTimer();
                return;
            }
        }

        const currentQuestion = questions[currentIndex];
        const correct = index === currentQuestion?.correct_index;

        trivia.setSelectedAnswer(index);
        trivia.setShowResult(true);

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

            // Multiplier tier-up celebration — the multiplier used to tick up
            // silently in the corner. Every 5 correct answers unlocks a new tier.
            const nextStreak = streak + 1;
            if (nextStreak > 0 && nextStreak % 5 === 0) {
                setMilestoneMultiplier(Math.floor(nextStreak / 5) + 1);
                busEmit.celebration('confetti');
                setTimeout(() => setMilestoneMultiplier(0), 1800);
            }

            answerTimeoutRef.current = setTimeout(() => {
                setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
                trivia.reset();
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
                timer.resetTimer();
            }, 1000);
        } else {
            busEmit.decisionIncorrect(streak);
            busEmit.screenShake('medium');
            answerTimeoutRef.current = setTimeout(() => {
                finalizeDuration();
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
                setAwardedDiamonds(cappedDiamonds);
                if (cappedDiamonds > 0) {
                    // Per-GAME reference (generated at startGame, held in a ref)
                    // so Retry Save is idempotent but two games in the same
                    // minute are credited independently. The old per-minute
                    // bucket silently dropped the second game's reward while
                    // trivia_scores still recorded diamonds_earned.
                    if (!gameRewardRefId.current) {
                        gameRewardRefId.current = newReferenceId('endless_reward', userId);
                    }
                    const { data: rpcData, error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: cappedDiamonds,
                        p_type: 'endless_reward',
                        p_description: `Endless mode — ${cappedDiamonds} diamonds (${finalStreak} streak)`,
                        p_reference_id: gameRewardRefId.current
                    });
                    if (__rpcErr) throw __rpcErr;
                    if (rpcData && typeof rpcData === 'object' && rpcData.success === false) {
                        throw new Error(rpcData.error || 'Diamond award was rejected');
                    }
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsEarned(cappedDiamonds, 'Endless Mode');
                    actualAwarded = cappedDiamonds;
                }
                savePhaseRef.current = 1;
            }

            // Phase 2: Update high score (only if not already updated).
            //
            // Downgraded from throw to warn: `endless_high_scores` is created by
            // no migration in this repo (the load path at init() even comments
            // "table may not exist"). Throwing here meant that if the table is
            // missing or mis-permissioned in production, EVERY game that beat the
            // high score dead-ended in a Retry loop that could never succeed —
            // after diamonds had already been awarded in phase 1. A cosmetic
            // high-score row is not worth trapping the player.
            if (savePhaseRef.current < 2) {
                if (finalStreak > highScore) {
                    const { error: hsErr } = await supabase
                        .from('endless_high_scores')
                        .upsert({
                            user_id: userId,
                            mode: 'random',
                            high_score: finalStreak,
                            achieved_at: new Date().toISOString()
                        }, { onConflict: 'user_id,mode' });
                    if (hsErr) {
                        console.warn('[Endless] High-score upsert failed (non-fatal):', hsErr.message);
                    }
                    setHighScore(finalStreak);
                }
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded).
            // Phase 59: filter null question_id (FK violation guard) +
            // capture upsert errors that were silently swallowed.
            if (savePhaseRef.current < 3) {
                const correctQuestions = questions.slice(0, finalIndex);
                const wrongQuestion = questions[finalIndex];
                const historyRecords = [
                    ...correctQuestions
                        .filter(q => q && q.id != null)
                        .map(q => ({
                            user_id: userId,
                            question_id: q.id,
                            was_correct: true,
                            seen_at: new Date().toISOString(),
                            mode: 'endless'
                        })),
                    ...(wrongQuestion && wrongQuestion.id != null ? [{
                        user_id: userId,
                        question_id: wrongQuestion.id,
                        was_correct: false,
                        seen_at: new Date().toISOString(),
                        mode: 'endless'
                    }] : [])
                ];
                if (historyRecords.length > 0) {
                    // ignoreDuplicates:true => INSERT ... ON CONFLICT DO NOTHING.
                    // trivia_user_question_history has SELECT + INSERT RLS
                    // policies but NO UPDATE policy, so the previous
                    // ignoreDuplicates:false (which UPDATEs on conflict) was
                    // rejected by RLS and failed the ENTIRE batch whenever any
                    // question in the run had been seen before — silently
                    // dropping the whole run's history and eroding the 60-day
                    // non-repeat guarantee.
                    const { error: historyErr } = await supabase
                        .from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: true
                        });
                    if (historyErr) {
                        // Non-fatal: Phase 4 still records the score.
                        console.warn('[Endless] History upsert failed (non-fatal):', historyErr.message);
                    }
                }
                savePhaseRef.current = 3;
            }

            // Phase 4: Record to unified trivia_scores (for leaderboard).
            // Capture insert error — supabase-js does NOT throw on DB errors.
            if (savePhaseRef.current < 4) {
                // Phase 73: CST-anchored play_date so leaderboard.js (which
                // queries by CST today) finds same-day rows.
                const today = getTodayCST();
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

            // Success! Game saved — reset phase for next game.
            // gameRewardRefId is deliberately NOT cleared here; startGame mints
            // a fresh one for the next run.
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
        // Phase 59: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
        setQuestions(prev => {
            const remaining = prev.slice(currentIndex);
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
            return shuffleOptions(remaining);
        });
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        trivia.reset();
        startGame();
    }


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

                        {/* Question-pool load failure (ready screen) */}
                        {gameState === 'ready' && loadError && (
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
                                {loadError}
                            </div>
                        )}

                        {/* Ready State */}
                        {gameState === 'ready' && (
                            <div
                                className="lobby-image-wrapper"
                                onClick={isLoading ? undefined : startGame}
                                aria-disabled={isLoading}
                                style={{
                                    opacity: isLoading ? 0.6 : 1,
                                    pointerEvents: isLoading ? 'none' : 'auto',
                                    cursor: isLoading ? 'wait' : 'pointer',
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

                                {/* Multiplier Tier-Up Celebration */}
                                {milestoneMultiplier > 0 && (
                                    <div style={{
                                        position: 'fixed',
                                        top: '42%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        zIndex: 100,
                                        animation: 'bonusPop 1.8s ease-out forwards',
                                        pointerEvents: 'none'
                                    }}>
                                        <div style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                            borderRadius: '16px',
                                            boxShadow: '0 8px 32px rgba(139, 92, 246, 0.5)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}>
                                            <ZapIcon size={22} color="#fff" />
                                            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                                                {milestoneMultiplier}x MULTIPLIER!
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Lifeline purchase failure */}
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
                                                'rgba(139, 92, 246, 0.15)',
                                        border: `2px solid ${timer.timeLeft <= 3 ? '#ef4444' :
                                            timer.timeLeft <= 8 ? '#fbbf24' : '#8b5cf6'}`,
                                        borderRadius: '50px'
                                    }}>
                                        <TimerIcon size={18} color={timer.timeLeft <= 3 ? '#ef4444' : timer.timeLeft <= 8 ? '#fbbf24' : '#8b5cf6'} />
                                        <span style={{
                                            fontSize: '28px',
                                            fontWeight: 'bold',
                                            fontFamily: 'monospace',
                                            color: timer.timeLeft <= 3 ? '#ef4444' :
                                                timer.timeLeft <= 8 ? '#fbbf24' : '#8b5cf6',
                                            minWidth: '40px',
                                            textAlign: 'center'
                                        }}>
                                            {timer.timeLeft}
                                        </span>
                                        {lifelinesUsedThisGame > 0 && (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                fontSize: '11px',
                                                color: 'rgba(255,255,255,0.6)',
                                                marginLeft: '8px'
                                            }}>
                                                <ZapIcon size={11} />
                                                {lifelinesUsedThisGame}/{MAX_LIFELINES_PER_GAME}
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
                                        {/* currentIndex, not streak: skips advance the index without
                                            advancing the streak, so "#streak + 1" under-counted. */}
                                        <span>Question #{currentIndex + 1}</span>
                                        <span style={{ color: '#8b5cf6' }}>{currentQuestion.category || 'Mixed'}</span>
                                    </div>

                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 24px 0' }}>
                                        {toTitleCase(currentQuestion.question)}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-4 — shared option primitive (inline variant) */}
                                        {currentQuestion.options?.map((option, index) => (
                                            <TriviaAnswerOption
                                                variant="inline"
                                                key={index}
                                                index={index}
                                                option={toTitleCase(option)}
                                                selectedAnswer={trivia.selectedAnswer}
                                                correctIndex={currentQuestion.correct_index}
                                                showResult={trivia.showResult}
                                                eliminated={eliminatedOptions.includes(index)}
                                                disabled={trivia.selectedAnswer !== null || eliminatedOptions.includes(index)}
                                                onSelect={selectAnswer}
                                            />
                                        ))}
                                    </div>

                                    {/* Lifeline Buttons Row.
                                        VIP members are never charged (parity with HintButtons.jsx /
                                        StrategyTrivia), so the balance check must not lock them out.
                                        `lifelineLocked` is the single source of truth for all three. */}
                                    {!trivia.showResult && (
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
                                        +{multiplier} diamonds for correct answer
                                    </div>

                                    {/* Report-a-bad-question — feeds the 3-strike quality_score
                                        demotion pipeline. This component was imported but never
                                        rendered anywhere, so the whole reporting feature was dead
                                        in every special mode. Shown once the answer is revealed
                                        so it can't be used to stall the shot clock. */}
                                    {trivia.showResult && currentQuestion?.id != null && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                                            <ReportQuestionButton
                                                questionId={currentQuestion.id}
                                                userToken={accessToken}
                                            />
                                        </div>
                                    )}
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
                                                {awardedDiamonds != null ? awardedDiamonds : diamondsEarned}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                                {'\u{1F48E}'} Earned
                                            </div>
                                            {awardedDiamonds != null && awardedDiamonds < diamondsEarned && (
                                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: 6 }}>
                                                    Daily cap reached — {awardedDiamonds} of {diamondsEarned} credited
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Strictly greater than the high score captured BEFORE this
                                        game — `streak >= highScore` fired on a mere tie, and
                                        highScore had already been updated by saveGameResult. */}
                                    {streak > preGameHighScore && streak > 0 && (
                                        <div style={{
                                            padding: '12px 24px',
                                            background: 'rgba(234, 179, 8, 0.1)',
                                            border: '1px solid rgba(234, 179, 8, 0.3)',
                                            borderRadius: '8px',
                                            color: '#eab308',
                                            marginBottom: '24px'
                                        }}>
                                            NEW HIGH SCORE!
                                        </div>
                                    )}

                                    {gameDurationSec > 0 && (
                                        <div style={{
                                            color: 'rgba(255,255,255,0.5)',
                                            fontSize: '13px',
                                            marginBottom: '20px'
                                        }}>
                                            Run Time: {Math.floor(gameDurationSec / 60)}m {gameDurationSec % 60}s
                                            {' • '}Best: {Math.max(highScore, streak)}
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
