/**
 * ENDLESS MODE - All Categories Random
 * Route: /hub/trivia/endless
 *
 * Endless questions from ALL categories combined randomly.
 * Answer until you miss three (wrong answers and timeouts both count).
 *
 * Server-authoritative run: /api/trivia/session-start deals (and permutes)
 * one 100-question roster for the whole run, session-answer grades each tap
 * under the binding-first-answer rule, and session-submit caps and pays per
 * correct answer - the client never receives an answer key.
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
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import { getAccessToken } from '../../../src/lib/authUtils';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { Settings as SettingsIcon, Timer as TimerIcon, Zap as ZapIcon } from 'lucide-react';

const GAME_ENTRY_COST = 10; // restored with server-graded adoption - rewards pay via award_trivia_run now

// Roster size requested from /api/trivia/session-start. Endless ends on the
// third miss, which realistically lands well under 100 answers; unanswered
// served questions cost nothing (payout is per-correct and the submit omits
// them). If a player actually clears all 100, the run ends there - a fresh
// game is a fresh session.
const QUESTIONS_PER_SESSION = 100;

// The run ends on the third miss. Wrong answers and shot-clock timeouts both
// count; skips do not (they are never answered).
const MAX_MISSES = 3;

// Daily cap comes from triviaEngine so the lobby price and the payout ceiling
// can never disagree. Display-only here: the ACTUAL clamp is applied by
// /api/trivia/session-submit when it settles the run.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.endless) ? DAILY_DIAMOND_CAPS.endless : 40;

export default function EndlessModePage() {
    useTrainingBus('trivia-endless');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();

    const [gameState, setGameState] = useState('ready'); // ready, playing, saving, saving_error, gameover
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
    // Misses this run (wrong answers + timeouts). The third one ends the game.
    const [misses, setMisses] = useState(0);
    // What session-submit ACTUALLY credited after the server applied the daily
    // cap. The results screen used to render the raw client running total, so
    // a capped player was told they earned diamonds that never reached their
    // balance.
    const [awardedDiamonds, setAwardedDiamonds] = useState(null);
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

    // Server-authoritative run: session-start deals, session-answer grades
    // each tap, session-submit caps and pays. No client-side crediting.
    const serverRun = useServerGradedRun('endless');
    // Current question's server verdict (wasCorrect / correctDisplayIndex);
    // null until session-answer resolves, cleared on advance. The reveal is
    // driven entirely from this - the client holds no answer key.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);
    // Answers actually recorded via session-answer this game, in tap order:
    // { questionId, displayIndex }. This is what session-submit grades from;
    // skipped questions are deliberately omitted (the server counts them
    // wrong, which is free here because payout is per-correct).
    const sessionAnswersRef = useRef([]);

    const [userDiamonds, setUserDiamonds] = useState(0);

    // Lifeline usage tracking (max 3 per game, skip costs 5💎).
    // NOTE: the 50/50 and Double Chance lifelines are gone with the move to
    // server grading - 50/50 needs the answer key the client no longer
    // receives, and Double Chance needs a second attempt the binding
    // first-answer rule cannot honour. Skip survives because it never answers:
    // it just advances past a question that is then omitted from the submit.
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
    // Surfaced when a lifeline purchase or an answer submission fails (was
    // previously a console.warn only, so the button just looked dead).
    const [actionError, setActionError] = useState(null);

    // 24-Second Shot Clock State
    const [screenShake, setScreenShake] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Visibility-based pause
    const heartbeatIntervalRef = useRef(null);

    // Refs to avoid stale closures in setTimeout-triggered saveGameResult
    const streakRef = useRef(0);
    const diamondsEarnedRef = useRef(0);
    const missesRef = useRef(0);
    const currentIndexRef = useRef(0);
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race
    // FIX(audit #8): synchronous in-flight lock for paid lifelines. The "used"
    // state flags are set only AFTER the awaited charge, so a double-tap
    // passed the guards twice and produced two deductions for a single
    // lifeline.
    const lifelineBusyRef = useRef(false);

    // Game Settings (persist to localStorage)
    const [settings, setSettings] = useState({
        haptics: true,      // Vibration feedback
        audio: true,        // Heartbeat sounds
        screenShake: true,  // Screen shake effect
        intensity: 'high'   // 'low', 'medium', 'high'
    });

    const startTimeRef = useRef(null);
    const [gameDurationSec, setGameDurationSec] = useState(0);

    // ── SOUND: one switch, globally ──────────────────────────────────
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

            // Questions are dealt by the server when a game starts - nothing
            // to preload here.
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

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        setLoadError(null);

        // Reset the per-game save pipeline. This is also the "Play Again"
        // path - a stale phase or settlement from the previous game would
        // make this game skip its own submit and re-report the old numbers.
        savePhaseRef.current = 0;
        serverResultRef.current = null;
        sessionAnswersRef.current = [];
        setSaveErrorPayload(null);

        // Open the server session BEFORE any charge, so a start failure can
        // never eat an entry fee. The served questions are used VERBATIM -
        // their options are already permuted into grading order, so
        // reshuffling them would break the display-index mapping the grader
        // uses. One session serves the whole run; there are no mid-run
        // refills any more.
        let served;
        setIsLoading(true);
        try {
            served = await serverRun.start({ count: QUESTIONS_PER_SESSION });
        } catch (e) {
            console.warn('[Endless] Server session start failed:', e?.message || e);
            setLoadError('We could not load any questions right now. Please check your connection and try again.');
            return;
        } finally {
            setIsLoading(false);
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // NEVER charge for an empty game.
            serverRun.reset();
            setLoadError('We could not load any questions right now. Please check your connection and try again.');
            return;
        }

        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so the only thing it could still do was let
        // a stale flag from an earlier session buy a free entry. Always charge.

        // Per-game diamond gate (VIP bypass). Charged only AFTER the session
        // opened; every failure path abandons the session via serverRun.reset()
        // (it expires server-side and pays nothing).
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
                    serverRun.reset();
                    setShowOutOfDiamonds(true);
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_endless');
                if (!result.success) {
                    serverRun.reset();
                    setShowOutOfDiamonds(true);
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Endless] Diamond deduction failed:', e);
                serverRun.reset();
                setShowOutOfDiamonds(true);
                return;
            }
        }
        setQuestions(served.questions);
        setGameState('playing');
        setStreak(0);
        setDiamondsEarned(0);
        setMisses(0);
        setCurrentIndex(0);
        setGameDurationSec(0);
        setPreGameHighScore(highScore);
        streakRef.current = 0;
        diamondsEarnedRef.current = 0;
        missesRef.current = 0;
        setAwardedDiamonds(null);
        currentIndexRef.current = 0;
        setVerdict(null);
        answerLockRef.current = false;
        trivia.reset();
        // Reset all lifeline states for new game
        setSkipUsedThisQuestion(false);
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

    // Handle timeout - one miss, not instant game over. The timeout is
    // recorded server-side as a skip (displayIndex -1), which session-answer
    // grades as wrong, so the verdict path counts the miss and reveals the
    // correct answer exactly like a wrong tap.
    function handleTimeOut() {
        timer.setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        gradeAnswer(-1);
    }

    function finalizeDuration() {
        if (startTimeRef.current) {
            setGameDurationSec(Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000)));
        }
    }

    /**
     * Charge a lifeline. Returns true when the player may use it.
     * VIP members are never charged (matching HintButtons.jsx / StrategyTrivia).
     * Charges route through DiamondEngine.deduct - the direct balance RPC
     * this page used to call lost authenticated EXECUTE on 2026-08-03, so
     * every purchase silently failed.
     */
    async function chargeLifeline(cost, source) {
        if (isVip) return true;              // VIP lifelines are free
        if (!userId) return true;            // Guest play — nothing to charge
        if (userDiamonds < cost) {
            setShowOutOfDiamonds(true);
            return false;
        }
        try {
            const charge = await DiamondEngine.deduct(cost, source);
            if (!charge.success) {
                setShowOutOfDiamonds(true);
                return false;
            }
            if (charge.balance !== undefined) setUserDiamonds(charge.balance);
            // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            return true;
        } catch (e) {
            console.warn('[Endless] Lifeline deduction failed:', e);
            setActionError('Could not purchase that lifeline. Please try again.');
            setTimeout(() => setActionError(null), 3000);
            return false;
        }
    }

    // Skip Question Function (costs 5 diamonds, free for VIP). The skipped
    // question is never answered: it is omitted from session-submit, so it is
    // not a miss and does not break the streak - it just burns a lifeline.
    async function useSkipQuestion() {
        if (trivia.showResult || skipUsedThisQuestion || answerLockRef.current) return;
        if (lifelinesUsedThisGame >= MAX_LIFELINES_PER_GAME) {
            // Lifeline limit reached — silently prevent
            return;
        }
        // FIX(audit #8): synchronous lock BEFORE the awaited charge — the state
        // guards above don't re-render fast enough to stop a double-tap, which
        // charged twice and skipped two questions.
        if (lifelineBusyRef.current) return;
        lifelineBusyRef.current = true;
        try {
            const paid = await chargeLifeline(LIFELINE_COST, 'endless_skip');
            if (!paid) return;
            setLifelinesUsedThisGame(prev => prev + 1);

            setSkipUsedThisQuestion(true);
            timer.setIsTimerRunning(false);

            // Move to next question without penalty (keep streak). If the
            // roster somehow runs out, end the run instead of advancing into
            // an empty board.
            if (currentIndexRef.current + 1 >= questions.length) {
                endRun();
                return;
            }
            setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
            trivia.reset();
            setVerdict(null);
            setSkipUsedThisQuestion(false);
            timer.resetTimer();
        } finally {
            lifelineBusyRef.current = false;
        }
    }

    // Per-answer server grading. Lock the tap immediately, record it with
    // /api/trivia/session-answer (the first answer per question is BINDING
    // server-side), then reveal from the verdict. A failed call unlocks so the
    // player can re-tap - the endpoint is idempotent per question, so a retry
    // cannot double-record. displayIndex -1 is the shot-clock timeout.
    async function gradeAnswer(displayIndex) {
        if (answerLockRef.current || trivia.showResult) return;
        const q = questions[currentIndex];
        if (!q || typeof q.id !== 'string') return;
        answerLockRef.current = true;
        timer.setIsTimerRunning(false);
        if (displayIndex >= 0) trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            applyVerdict(q, displayIndex, v);
        } catch (e) {
            console.warn('[Endless] Answer grading failed:', e?.message || e);
            if (displayIndex < 0) {
                // Timeout that could not reach the server: no re-tap is
                // possible, so record it locally (session-submit still grades
                // it server-side) and count the miss without a reveal.
                sessionAnswersRef.current.push({ questionId: q.id, displayIndex: -1 });
                const missCount = missesRef.current + 1;
                missesRef.current = missCount;
                setMisses(missCount);
                if (missCount >= MAX_MISSES) {
                    endRun();
                } else {
                    scheduleAdvance(400);
                }
            } else {
                // Unlock and let the player re-tap; give the shot clock back.
                trivia.setSelectedAnswer(null);
                answerLockRef.current = false;
                setActionError('Could not submit that answer. Please tap it again.');
                setTimeout(() => setActionError(null), 3000);
                timer.setIsTimerRunning(true);
            }
        }
    }

    // Side effects that used to key off the client-computed correct_index now
    // key off the server verdict. Zero answer-key reads in the play path.
    function applyVerdict(q, displayIndex, v) {
        setVerdict(v);
        trivia.setShowResult(true);
        sessionAnswersRef.current.push({ questionId: q.id, displayIndex });

        if (v?.wasCorrect === true) {
            // Server payout is count-based for endless: 1 diamond per correct
            // answer (capped daily at settle time). The old streak-multiplier
            // and speed-bonus diamond math promised amounts the server never
            // pays, so the running total now mirrors the real formula.
            setDiamondsEarned(prev => { const next = prev + 1; diamondsEarnedRef.current = next; return next; });
            setStreak(prev => { const next = prev + 1; streakRef.current = next; return next; });
            busEmit.decisionCorrect(streakRef.current);
            scheduleAdvance(1000);
        } else {
            const missCount = missesRef.current + 1;
            missesRef.current = missCount;
            setMisses(missCount);
            busEmit.decisionIncorrect(streakRef.current);
            busEmit.screenShake('medium');
            if (missCount >= MAX_MISSES) {
                // Third miss: hold the reveal, then settle the run.
                if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
                answerTimeoutRef.current = setTimeout(endRun, 1500);
            } else {
                scheduleAdvance(1500);
            }
        }
    }

    // Advance to the next question after the reveal, or end the run when the
    // 100-question roster is exhausted (a fresh game is a fresh session).
    function scheduleAdvance(delayMs) {
        if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = setTimeout(() => {
            if (currentIndexRef.current + 1 >= questions.length) {
                endRun();
                return;
            }
            setCurrentIndex(prev => { const next = prev + 1; currentIndexRef.current = next; return next; });
            setVerdict(null);
            trivia.reset();
            setSkipUsedThisQuestion(false);
            answerLockRef.current = false;
            timer.resetTimer();
        }, delayMs);
    }

    function endRun() {
        finalizeDuration();
        setGameState('saving');
        saveGameResult();
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=settled, 2=highscore, 3=history, 4=score
    // Server settlement result, kept in a ref so a saving_error retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    async function saveGameResult() {
        if (!userId) {
            setGameState('gameover');
            return;
        }

        try {
            // Phase 1: settle the run server-side (only if not already
            // settled). The server grades from the answers it stored at tap
            // time, applies the daily cap and pays per correct answer through
            // a locked RPC - no client-side crediting, ever. Skipped questions
            // are omitted from the array: the server counts them wrong, which
            // is harmless because payout is per-correct.
            if (savePhaseRef.current < 1) {
                const submitted = await serverRun.submit(
                    sessionAnswersRef.current.map(a => ({
                        questionId: a.questionId,
                        displayIndex: a.displayIndex
                    }))
                );
                serverResultRef.current = submitted;
                savePhaseRef.current = 1;

                // Local balance from the server's post-award number, with a
                // fresh profiles read as the fallback.
                if (Number.isFinite(submitted?.newBalance)) {
                    setUserDiamonds(submitted.newBalance);
                } else {
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                }
                if ((submitted?.diamondsAwarded || 0) > 0) {
                    busEmit.diamondsEarned(submitted.diamondsAwarded, 'Endless Mode');
                }
            }
            const settled = serverResultRef.current || {};
            const awarded = Number.isFinite(settled.diamondsAwarded) ? settled.diamondsAwarded : 0;
            const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : streakRef.current;
            const serverScore = Number.isFinite(settled.score) ? settled.score : serverCorrect * 100;

            // Show what the server actually graded and credited, not what the
            // client hoped for.
            setAwardedDiamonds(awarded);
            setStreak(serverCorrect);
            streakRef.current = serverCorrect;
            setDiamondsEarned(serverCorrect);
            diamondsEarnedRef.current = serverCorrect;

            // questionId -> wasCorrect from the server's per-question
            // verdicts, for the history phase below.
            const verdictMap = {};
            (Array.isArray(settled.perQuestion) ? settled.perQuestion : []).forEach(pq => {
                if (pq && typeof pq.questionId === 'string') verdictMap[pq.questionId] = pq.wasCorrect === true;
            });

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
                if (serverCorrect > highScore) {
                    const { error: hsErr } = await supabase
                        .from('endless_high_scores')
                        .upsert({
                            user_id: userId,
                            mode: 'random',
                            high_score: serverCorrect,
                            achieved_at: new Date().toISOString()
                        }, { onConflict: 'user_id,mode' });
                    if (hsErr) {
                        console.warn('[Endless] High-score upsert failed (non-fatal):', hsErr.message);
                    }
                    setHighScore(serverCorrect);
                }
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded),
            // for the questions actually answered, with was_correct taken from
            // the server's per-question verdicts - the client has no answer
            // key to compare against.
            if (savePhaseRef.current < 3) {
                const historyRecords = sessionAnswersRef.current
                    .filter(a => a && a.questionId != null)
                    .map(a => ({
                        user_id: userId,
                        question_id: a.questionId,
                        was_correct: verdictMap[a.questionId] === true,
                        seen_at: new Date().toISOString(),
                        mode: 'endless'
                    }));
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

            // Phase 4: Record to unified trivia_scores (for leaderboard) with
            // the SERVER numbers. Capture insert error — supabase-js does NOT
            // throw on DB errors.
            if (savePhaseRef.current < 4) {
                // Phase 73: CST-anchored play_date so leaderboard.js (which
                // queries by CST today) finds same-day rows.
                const today = getTodayCST();
                // The server's `total` is the FULL served roster (padded far
                // beyond a realistic run), so "X of Y" stats use the count
                // actually answered (timeouts included, skips not).
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'endless',
                    score: serverScore,
                    correct_count: serverCorrect,
                    total_questions: Math.max(serverCorrect, sessionAnswersRef.current.length),
                    diamonds_earned: awarded,
                    play_date: today
                });
                if (scoreErr) throw scoreErr;
                savePhaseRef.current = 4;
            }

            // Success! Game saved — reset phase for next game.
            setGameState('gameover');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Endless] Failed to save game result:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ finalDiamonds: diamondsEarnedRef.current, finalStreak: streakRef.current });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        saveGameResult(); // savePhaseRef skips already-completed steps
    };

    // Play Again - the server deals a FRESH roster for every session (the
    // just-played questions are now in trivia_user_question_history), and
    // startGame() opens the new session BEFORE charging another entry fee.
    function playAgain() {
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
                    cost={GAME_ENTRY_COST}
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
                                    <span style={{ color: '#ef4444' }}>Misses: {misses}/{MAX_MISSES}</span>
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

                                {/* Lifeline purchase / answer submission failure */}
                                {actionError && (
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
                                        {actionError}
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
                                        {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-4 — shared option primitive (inline variant).
                                            The reveal keys off the server verdict: the client never
                                            holds a correct_index of its own. */}
                                        {currentQuestion.options?.map((option, index) => (
                                            <TriviaAnswerOption
                                                variant="inline"
                                                key={index}
                                                index={index}
                                                option={toTitleCase(option)}
                                                selectedAnswer={trivia.selectedAnswer}
                                                correctIndex={verdict ? verdict.correctDisplayIndex : null}
                                                showResult={trivia.showResult}
                                                disabled={trivia.selectedAnswer !== null || trivia.showResult}
                                                onSelect={gradeAnswer}
                                            />
                                        ))}
                                    </div>

                                    {/* Lifeline Buttons Row.
                                        Skip is the one lifeline that survives server grading: it
                                        never answers, so it needs no answer key and no second
                                        attempt. VIP members are never charged (parity with
                                        HintButtons.jsx / StrategyTrivia). */}
                                    {!trivia.showResult && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '10px',
                                            marginTop: '16px'
                                        }}>
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
                                        +1 diamond per correct answer (max {DAILY_DIAMOND_CAP}/day)
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
                                                const r = await shareResult({ mode: 'Endless', score: streak, diamonds: awardedDiamonds != null ? awardedDiamonds : diamondsEarned });
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
