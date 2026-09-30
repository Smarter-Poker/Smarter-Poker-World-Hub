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
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_ENDLESS } from '../../../src/config/triviaIntroArt.mjs';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { playHeartbeat, closeHeartbeatAudio } from '../../../src/lib/heartbeatAudio';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import { getAccessToken } from '../../../src/lib/authUtils';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';

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

    // Lifeline usage tracking (max 3 per game, skip costs 5 diamonds).
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
            // A 402 is the balance gate, not a connection problem: show the
            // Not Enough Diamonds state alone instead of both messages.
            if (e?.status === 402) {
                setShowOutOfDiamonds(true);
                return;
            }
            setLoadError('We Could Not Load Any Questions Right Now. Please Check Your Connection And Try Again.');
            return;
        } finally {
            setIsLoading(false);
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // NEVER charge for an empty game.
            serverRun.reset();
            setLoadError('We Could Not Load Any Questions Right Now. Please Check Your Connection And Try Again.');
            return;
        }

        if (Number.isFinite(served.newBalance)) setUserDiamonds(served.newBalance);
        if (served.entryState === 'charged' && served.entryCost > 0) {
            busEmit.diamondsSpent(served.entryCost, 'Endless entry');
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
            const charge = await DiamondEngine.deduct(cost, source, {
                description: 'Endless Trivia skip lifeline',
                referenceId: `trivia_lifeline:${serverRun.sessionId}:${currentQuestion?.id}:skip`,
            });
            if (!charge.success) {
                setShowOutOfDiamonds(true);
                return false;
            }
            if (charge.balance !== undefined) setUserDiamonds(charge.balance);
            // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            return true;
        } catch (e) {
            console.warn('[Endless] Lifeline deduction failed:', e);
            setActionError('Could Not Purchase That Lifeline. Please Try Again.');
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
            const paid = await chargeLifeline(LIFELINE_COST, 'trivia_lifeline');
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
                setActionError('Could Not Submit That Answer. Please Tap It Again.');
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

            // Show what the server actually graded and credited, not what the
            // client hoped for.
            setAwardedDiamonds(awarded);
            setStreak(serverCorrect);
            streakRef.current = serverCorrect;
            setDiamondsEarned(serverCorrect);
            diamondsEarnedRef.current = serverCorrect;

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

            // Settlement atomically finalized history, mastery and skip
            // telemetry from the binding server answers.
            savePhaseRef.current = Math.max(savePhaseRef.current, 3);

            // Phase 4: session-submit persisted the verified score atomically.
            if (savePhaseRef.current < 4) {
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


    const creditedDiamonds = awardedDiamonds != null ? awardedDiamonds : diamondsEarned;
    // The pill is a short painted slot (about eight characters at 375px);
    // longer state, balance and timer copy is printed on the glass below.
    const balanceLabel = isVip ? 'VIP' : 'Ready';
    const stateLabel = showOutOfDiamonds
        ? 'Balance'
        : isPaused
            ? 'Paused'
            : isLoading
                ? 'Loading'
                : {
                    ready: balanceLabel,
                    playing: `${formatTriviaDisplayNumber(timer.timeLeft)} Sec`,
                    saving: 'Saving',
                    saving_error: 'Retry',
                    gameover: 'Final',
                }[gameState] || balanceLabel;

    const primaryAction = showOutOfDiamonds
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : gameState === 'ready'
            ? {
                label: loadError ? 'Try Again' : 'Start Endless Trivia',
                onClick: startGame,
                disabled: isLoading,
                'aria-disabled': isLoading,
            }
            : gameState === 'saving_error'
                ? { label: 'Retry Save', onClick: handleRetrySave }
                : gameState === 'gameover'
                    ? { label: 'Play Again', onClick: playAgain }
                    : null;

    const secondaryAction = showOutOfDiamonds
        ? { label: 'Close', onClick: () => setShowOutOfDiamonds(false) }
        : gameState === 'gameover'
            ? { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }
            : null;

    return (
        <TriviaErrorBoundary pageName="Endless Mode">
            <>
                <SEOHead
                    title="Endless Trivia - Keep The Streak Alive"
                    description="Endless Poker Trivia On Smarter.Poker: Questions Keep Coming Until You Stop, And A Wrong Answer Costs You Nothing But The Explanation That Follows It. Free To Play, And Nothing In It Is A Wager."
                    canonical="/hub/trivia/endless"
                />

                <div
                    className="trivia-challenge-page trivia-challenge-page--endless"
                    data-trivia-family="challenge"
                    data-trivia-surface="endless"
                    data-game-state={gameState}
                    data-screen-shake={screenShake ? 'active' : 'idle'}
                >
                    <UniversalHeader pageDepth={2} />

                    {userId && !isVip && (
                        <GameCostPopup
                            userId={userId}
                            featureKey="trivia_endless"
                            isVip={isVip}
                            cost={GAME_ENTRY_COST}
                        />
                    )}

                    <PageTransition>
                        <main className="trivia-challenge-shell" aria-labelledby="endless-trivia-title">
                            <TriviaConsole
                                className="trivia-challenge-console"
                                eyebrow="Three Miss Challenge"
                                title="Endless Trivia"
                                titleId="endless-trivia-title"
                                subtitle="Keep The Streak Alive"
                                pill={stateLabel}
                                aria-labelledby="endless-trivia-title"
                                primaryAction={primaryAction}
                                secondaryAction={secondaryAction}
                            >
                                {showOutOfDiamonds && (
                                    <section
                                        className="trivia-challenge-alert"
                                        role="alert"
                                        aria-labelledby="endless-diamonds-title"
                                    >
                                        <h2 id="endless-diamonds-title">Not Enough Diamonds</h2>
                                        <p>
                                            Each Game Costs {formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds.
                                            Get More Diamonds Or Upgrade To VIP For Unlimited Access.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'ready' && isLoading && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Preparing Endless Trivia</p>
                                    </div>
                                )}

                                {gameState === 'ready' && !isLoading && (
                                    <section className="trivia-challenge-intro" aria-labelledby="endless-ready-title">
                                        <ResponsiveModeArt art={TRIVIA_INTRO_ART_ENDLESS} priority />
                                        <h2 id="endless-ready-title">Answer Until The Third Miss</h2>
                                        <p>
                                            Build The Longest Streak You Can Across A Server-Dealt
                                            Roster Of Every Poker Trivia Category.
                                        </p>
                                        {loadError && (
                                            <p className="trivia-challenge-alert" role="alert">{loadError}</p>
                                        )}
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Questions Available</dt>
                                                <dd>{formatTriviaDisplayNumber(QUESTIONS_PER_SESSION)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Misses Allowed</dt>
                                                <dd>{formatTriviaDisplayNumber(MAX_MISSES)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Entry</dt>
                                                <dd>{isVip ? 'VIP Included' : `${formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds`}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Daily Reward Cap</dt>
                                                <dd>{formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)}</dd>
                                            </div>
                                        </dl>
                                        {userId && !isVip && (
                                            <ul className="tc-rows" aria-label="Your Balance">
                                                <li className="tc-row">
                                                    <span className="tc-row__label">Your Balance</span>
                                                    <span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(userDiamonds)} Diamonds</span>
                                                </li>
                                            </ul>
                                        )}
                                        <p className="trivia-challenge-note">
                                            Each Correct Answer Earns One Diamond. Skips Do Not Count As Misses.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'saving' && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Securing Your Endless Run</p>
                                    </div>
                                )}

                                {gameState === 'saving_error' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                        <h2>Network Disconnected</h2>
                                        <p>
                                            We Could Not Save Your Score Of {formatTriviaDisplayNumber(saveErrorPayload?.finalStreak)}
                                            {' Correct Answers And '}
                                            {formatTriviaDisplayNumber(saveErrorPayload?.finalDiamonds)} Diamonds.
                                            Check Your Connection And Retry To Protect Your Rewards.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && isPaused && (
                                    <section className="trivia-challenge-state trivia-challenge-state--paused" role="status">
                                        <h2>Game Paused</h2>
                                        <p>
                                            You Left The Screen With {formatTriviaDisplayNumber(timer.timeLeft)} Seconds Remaining.
                                        </p>
                                        <button
                                            type="button"
                                            className="trivia-challenge-action"
                                            onClick={() => {
                                                setIsPaused(false);
                                                timer.setIsTimerRunning(true);
                                            }}
                                        >
                                            Resume Game
                                        </button>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && !isPaused && (
                                    <section
                                        className={`trivia-challenge-stage${screenShake ? ' trivia-challenge-stage--shaking' : ''}`}
                                        aria-labelledby="endless-question-title"
                                    >
                                        {actionError && (
                                            <p className="trivia-challenge-alert" role="alert">{actionError}</p>
                                        )}

                                        <dl className="trivia-challenge-stats trivia-challenge-stats--compact">
                                            <div className="trivia-challenge-stat">
                                                <dt>Streak</dt>
                                                <dd>{formatTriviaDisplayNumber(streak)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds</dt>
                                                <dd>{formatTriviaDisplayNumber(diamondsEarned)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Misses</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(misses)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(MAX_MISSES)}
                                                </dd>
                                            </div>
                                            {settings.timerEnabled !== false && (
                                                <div className="trivia-challenge-stat">
                                                    <dt>Time</dt>
                                                    <dd aria-live="off">{formatTriviaDisplayNumber(timer.timeLeft)} Seconds</dd>
                                                </div>
                                            )}
                                        </dl>

                                        <div className="trivia-challenge-toolbar">
                                            <button
                                                type="button"
                                                className="trivia-challenge-action"
                                                onClick={() => setShowSettingsPanel(prev => !prev)}
                                                aria-expanded={showSettingsPanel}
                                                aria-controls="endless-game-settings"
                                            >
                                                {showSettingsPanel ? 'Close Settings' : 'Game Settings'}
                                            </button>
                                            {lifelinesUsedThisGame > 0 && (
                                                <span className="trivia-challenge-note">
                                                    Lifelines {formatTriviaDisplayNumber(lifelinesUsedThisGame)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(MAX_LIFELINES_PER_GAME)}
                                                </span>
                                            )}
                                        </div>

                                        {showSettingsPanel && (
                                            <section
                                                id="endless-game-settings"
                                                className="trivia-challenge-settings"
                                                aria-labelledby="endless-settings-title"
                                            >
                                                <h3 id="endless-settings-title">Game Settings</h3>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-audio-label">Sound Effects</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-audio-label"
                                                        aria-checked={settings.audio}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => triviaAudio.setMuted(settings.audio)}
                                                    >
                                                        {settings.audio ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-haptics-label">Haptic Vibration</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-haptics-label"
                                                        aria-checked={settings.haptics}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => setSettings(prev => ({ ...prev, haptics: !prev.haptics }))}
                                                    >
                                                        {settings.haptics ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="endless-shake-label">Screen Shake</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="endless-shake-label"
                                                        aria-checked={settings.screenShake}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => setSettings(prev => ({ ...prev, screenShake: !prev.screenShake }))}
                                                    >
                                                        {settings.screenShake ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <fieldset className="trivia-challenge-setting-group">
                                                    <legend>Intensity</legend>
                                                    <div className="trivia-challenge-actions">
                                                        {['low', 'medium', 'high'].map(level => (
                                                            <button
                                                                key={level}
                                                                type="button"
                                                                className="trivia-challenge-action"
                                                                aria-pressed={settings.intensity === level}
                                                                onClick={() => setSettings(prev => ({ ...prev, intensity: level }))}
                                                            >
                                                                {toTitleCase(level)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </fieldset>
                                            </section>
                                        )}

                                        <p className="trivia-challenge-progress-label">
                                            Question {formatTriviaDisplayNumber(currentIndex + 1)}
                                            {' | '}
                                            {toTitleCase(String(currentQuestion.category || 'Mixed').replaceAll('_', ' '))}
                                        </p>
                                        <h2 id="endless-question-title" className="trivia-challenge-question">
                                            {toTitleCase(currentQuestion.question)}
                                        </h2>

                                        <div className="trivia-challenge-options">
                                            {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-4: shared option primitive (inline variant) */}
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

                                        {!trivia.showResult && (
                                            <button
                                                type="button"
                                                className="trivia-challenge-action trivia-challenge-action--lifeline"
                                                onClick={useSkipQuestion}
                                                disabled={lifelineLocked}
                                            >
                                                Skip Question | {isVip ? 'VIP Included' : `${formatTriviaDisplayNumber(LIFELINE_COST)} Diamonds`}
                                            </button>
                                        )}

                                        <p className="trivia-challenge-note">
                                            One Diamond Per Correct Answer | {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)} Daily Maximum
                                        </p>

                                        {trivia.showResult && verdict?.explanation && (
                                            <section className="trivia-challenge-explanation" aria-labelledby="endless-explanation-title">
                                                <h3 id="endless-explanation-title">Why This Is Correct</h3>
                                                <p>{verdict.explanation}</p>
                                            </section>
                                        )}

                                        {trivia.showResult && currentQuestion?.id != null && (
                                            <div className="trivia-challenge-report">
                                                <ReportQuestionButton
                                                    questionId={currentQuestion.id}
                                                    userToken={accessToken}
                                                />
                                            </div>
                                        )}
                                    </section>
                                )}

                                {gameState === 'gameover' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="endless-results-title">
                                        <h2 id="endless-results-title">Endless Run Complete</h2>
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Correct Answers</dt>
                                                <dd>{formatTriviaDisplayNumber(streak)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds Earned</dt>
                                                <dd>{formatTriviaDisplayNumber(creditedDiamonds)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Best Streak</dt>
                                                <dd>{formatTriviaDisplayNumber(Math.max(highScore, streak))}</dd>
                                            </div>
                                            {gameDurationSec > 0 && (
                                                <div className="trivia-challenge-stat">
                                                    <dt>Run Time</dt>
                                                    <dd>
                                                        {formatTriviaDisplayNumber(Math.floor(gameDurationSec / 60))} Minutes
                                                        {' '}
                                                        {formatTriviaDisplayNumber(gameDurationSec % 60)} Seconds
                                                    </dd>
                                                </div>
                                            )}
                                        </dl>

                                        {awardedDiamonds != null && awardedDiamonds < diamondsEarned && (
                                            <p className="trivia-challenge-note">
                                                Daily Cap Reached. {formatTriviaDisplayNumber(awardedDiamonds)}
                                                {' Of '}
                                                {formatTriviaDisplayNumber(diamondsEarned)} Diamonds Credited.
                                            </p>
                                        )}

                                        {streak > preGameHighScore && streak > 0 && (
                                            <p className="trivia-challenge-note" role="status">New High Score</p>
                                        )}

                                        <button
                                            type="button"
                                            className="trivia-challenge-action"
                                            onClick={async () => {
                                                const result = await shareResult({
                                                    mode: 'Endless',
                                                    score: streak,
                                                    diamonds: creditedDiamonds,
                                                });
                                                if (result === 'copied') alert('Result Copied To Clipboard.');
                                            }}
                                        >
                                            Share Result
                                        </button>
                                    </section>
                                )}
                            </TriviaConsole>
                        </main>
                    </PageTransition>
                </div>
            </>
          {/* Server rendered: measured on production this page returned
              only chrome to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="trivia-endless" as="h1" />
        </TriviaErrorBoundary>
    );
}
