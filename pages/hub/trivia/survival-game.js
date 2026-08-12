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
 *
 * Server-authoritative run: each LEVEL is its own session.
 * /api/trivia/session-start deals (and permutes) the level's 20 questions,
 * session-answer grades each tap under the binding-first-answer rule, and
 * session-submit settles the level via the engine's survival formula
 * (per-correct with an escalating multiplier, 60/session cap) under the
 * daily cap - the client never receives an answer key.
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
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { DAILY_DIAMOND_CAPS, calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import { getAccessToken } from '../../../src/lib/authUtils';
import { Settings as SettingsIcon, Timer as TimerIcon, Zap as ZapIcon } from 'lucide-react';

const GAME_ENTRY_COST = 10; // restored with server-graded adoption - rewards pay via award_trivia_run now
// Daily cap comes from triviaEngine so the lobby and the payout agree.
// Display-only here: the ACTUAL clamp is applied by /api/trivia/session-submit
// when it settles each level.
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
    // What session-submit ACTUALLY credited for the most recently settled
    // level, after the server applied the per-session and daily caps. The
    // level-complete card used to render the old client formula (level * 2),
    // which the server does not pay.
    const [lastLevelAwarded, setLastLevelAwarded] = useState(null);
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

    // Server-authoritative run: one session PER LEVEL. session-start deals
    // the level's 20 questions, session-answer grades each tap, and
    // session-submit settles the level. No client-side crediting.
    const serverRun = useServerGradedRun('survival');
    // Current question's server verdict (wasCorrect / correctDisplayIndex);
    // null until session-answer resolves, cleared on advance. The reveal is
    // driven entirely from this - the client holds no answer key.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);
    // Answers recorded via session-answer THIS LEVEL, in tap order:
    // { questionId, displayIndex }. This is what session-submit grades from;
    // skipped questions are deliberately omitted (the server counts an
    // omitted question wrong, which matches survival's fixed 20-question
    // denominator - a skip can never count toward minCorrect).
    const sessionAnswersRef = useRef([]);
    // questionId -> per-tap verdict, for the post-level review panel. The old
    // panel read correct_index off the question; that key no longer exists
    // client-side, so the review is rebuilt from what the server revealed.
    const verdictsRef = useRef(new Map());

    const [userDiamonds, setUserDiamonds] = useState(0); // Current diamond balance

    // Lifeline usage tracking (max 3 per level, skip costs 5 diamonds).
    // NOTE: the 50/50 and Double Chance lifelines are gone with the move to
    // server grading - 50/50 needs the answer key the client no longer
    // receives, and Double Chance needs a second attempt the binding
    // first-answer rule cannot honour. Skip survives because it never answers:
    // it just advances past a question that is then omitted from the submit.
    const [lifelinesUsedThisLevel, setLifelinesUsedThisLevel] = useState(0);
    const LIFELINE_COST = 5;
    const MAX_LIFELINES_PER_LEVEL = 3;

    // Skip Question Lifeline state
    const [skipUsedThisQuestion, setSkipUsedThisQuestion] = useState(false);

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

    // NOTE: the speed-bonus diamonds are gone with the move to server
    // grading. The server pays the engine's survival formula and nothing
    // else, so a client-side "+3 for answering fast" was a promise the
    // settlement could never honour (endless.js dropped its streak/speed
    // math for the same reason).
    // Settings panel visibility is component state, never persisted. It used to
    // be stored inside the `settings` object, which is written to localStorage
    // 'trivia_settings' — so leaving with the panel open made it auto-open over
    // the board forever, here and in endless.js (shared storage key).
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    // Surfaced for both a failed lifeline purchase and a failed answer
    // submission (was lifelineError; the grading path needs it too).
    const [actionError, setActionError] = useState(null);

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
    // Mirrors of correctCount/incorrectCount for the async verdict path -
    // setState is asynchronous, so the advance/settle closures read these
    // instead of a possibly stale state value.
    const correctCountRef = useRef(0);
    const incorrectCountRef = useRef(0);
    const answerTimeoutRef = useRef(null); // Cleanup on unmount
    const isStartingRef = useRef(false); // Prevent double-click race
    // FIX(audit #8): synchronous in-flight lock for paid lifelines. The "used"
    // state flags are only set AFTER the awaited charge RPC resolves, so a
    // double-tap passed the guards twice and produced two unique-reference
    // deductions (undedupable by design) for a single lifeline.
    const lifelineBusyRef = useRef(false);

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

    // Handle timeout - recorded server-side as a skip (displayIndex -1),
    // which session-answer grades as wrong, so the verdict path counts the
    // miss and reveals the correct answer exactly like a wrong tap.
    function handleTimeOut() {
        timer.setIsTimerRunning(false);
        setScreenShake(false);
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        gradeAnswer(-1);
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

    async function startLevel(level) {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        setLevelLoadError(null);
        setCurrentLevel(level);

        // Reset the per-level save pipeline. A stale phase or settlement from
        // the previous level would make this level skip its own submit and
        // re-report the old numbers.
        savePhaseRef.current = 0;
        serverResultRef.current = null;
        sessionAnswersRef.current = [];
        verdictsRef.current = new Map();
        setSaveErrorPayload(null);

        // Open the level's server session BEFORE any charge, so a start
        // failure can never eat an entry fee. The served questions are used
        // VERBATIM - their options are already permuted into grading order,
        // so reshuffling them would break the display-index mapping the
        // grader uses. The 60-day non-repeat exclusion now lives server-side
        // in session-start (each settled level writes its questions into
        // trivia_user_question_history before the next level starts).
        setQuestions([]);
        setGameState('loading_level');
        let served;
        setIsLoading(true);
        try {
            served = await serverRun.start({
                count: QUESTIONS_PER_LEVEL,
                difficulty: LEVEL_CONFIG[level - 1].difficulty,
            });
        } catch (e) {
            console.warn('[Survival] Server session start failed:', e?.message || e);
            setLevelLoadError('We could not load this level. Please check your connection and try again.');
            setGameState('lobby');
            return;
        } finally {
            setIsLoading(false);
        }
        // A SHORT set is a load failure too: the level grades against
        // minCorrect out of QUESTIONS_PER_LEVEL, so entering with fewer
        // questions than the denominator is unwinnable by construction.
        // NEVER charge for it.
        if (!served || !Array.isArray(served.questions) || served.questions.length < QUESTIONS_PER_LEVEL) {
            serverRun.reset();
            setLevelLoadError('We could not load a full set of questions for this level. Please check your connection and try again.');
            setGameState('lobby');
            return;
        }

        // One-time entry gate (VIP bypass) - only charge on level 1 (start of
        // a new run). Charged only AFTER the session opened; every failure
        // path abandons the session via serverRun.reset() (it expires
        // server-side and pays nothing).
        if (level === 1 && !isVip && userId) {
            // Fresh balance check from DB to avoid stale-state false negatives
            try {
                let freshBalance = userDiamonds;
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
                    setGameState('lobby'); // leave the loading screen
                    setShowOutOfDiamonds(true);
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_survival_game');
                if (!result.success) {
                    serverRun.reset();
                    setGameState('lobby'); // leave the loading screen
                    setShowOutOfDiamonds(true);
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Survival] Diamond deduction failed:', e);
                serverRun.reset();
                setGameState('lobby');
                setShowOutOfDiamonds(true);
                return;
            }
        }
        setQuestions(served.questions);
        setCurrentQuestionIndex(0);
        setCorrectCount(0);
        setIncorrectCount(0);
        correctCountRef.current = 0;
        incorrectCountRef.current = 0;
        trivia.reset();
        setVerdict(null);
        answerLockRef.current = false;
        setLastLevelAwarded(null);
        setSkipUsedThisQuestion(false);
        setLifelinesUsedThisLevel(0); // Reset lifeline counter
        setScreenShake(false);
        setGameState('playing');
        timer.resetTimer();
        startTimeRef.current = Date.now();
        } finally {
            isStartingRef.current = false;
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
        if (!userId) return true;            // Guest play - nothing to charge
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
            console.warn('[Survival] Lifeline deduction failed:', e);
            setActionError('Could not purchase that lifeline. Please try again.');
            setTimeout(() => setActionError(null), 3000);
            return false;
        }
    }

    // Skip Question Function (costs 5 diamonds, free for VIP). The skipped
    // question is never answered: it is omitted from session-submit, which
    // grades it wrong against the fixed 20-question denominator - exactly
    // what a skip cost before (it never counted toward minCorrect).
    async function useSkipQuestion() {
        if (trivia.showResult || skipUsedThisQuestion || answerLockRef.current) return;
        if (lifelinesUsedThisLevel >= MAX_LIFELINES_PER_LEVEL) {
            // Lifeline limit reached — silently prevent
            return;
        }
        // FIX(audit #8): synchronous lock BEFORE the awaited charge — the state
        // guards above don't re-render fast enough to stop a double-tap, which
        // charged twice and skipped two questions.
        if (lifelineBusyRef.current) return;
        lifelineBusyRef.current = true;
        try {
            const paid = await chargeLifeline(LIFELINE_COST, 'survival_skip');
            if (!paid) return;
            setLifelinesUsedThisLevel(prev => prev + 1);

            setSkipUsedThisQuestion(true);
            timer.setIsTimerRunning(false);

            // Boundary from the actual loaded set, not the constant.
            if (currentQuestionIndex + 1 >= (questions.length || QUESTIONS_PER_LEVEL)) {
                // Skipping the LAST question settles the level - the player
                // must never sit on a dead board having paid for the skip.
                setGameState('saving_progress');
                saveLevelResult();
            } else {
                advanceToNextQuestion();
            }
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
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        answerLockRef.current = true;
        timer.setIsTimerRunning(false);
        if (displayIndex >= 0) trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            applyVerdict(q, displayIndex, v);
        } catch (e) {
            console.warn('[Survival] Answer grading failed:', e?.message || e);
            if (displayIndex < 0) {
                // Timeout that could not reach the server: no re-tap is
                // possible, so record it locally (session-submit still grades
                // it server-side) and count the miss without a reveal.
                sessionAnswersRef.current.push({ questionId: q.id, displayIndex: -1 });
                incorrectCountRef.current += 1;
                setIncorrectCount(incorrectCountRef.current);
                scheduleAdvanceOrSettle(400);
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

    // Side effects that used to key off the client-held correct_index now key
    // off the server verdict. Zero answer-key reads in the play path.
    function applyVerdict(q, displayIndex, v) {
        setVerdict(v);
        trivia.setShowResult(true);
        sessionAnswersRef.current.push({ questionId: q.id, displayIndex });
        // Kept for the post-level review panel (question text + revealed
        // correct option) - the submit's perQuestion drives history instead.
        verdictsRef.current.set(q.id, v);

        if (v?.wasCorrect === true) {
            correctCountRef.current += 1;
            setCorrectCount(correctCountRef.current);
            busEmit.decisionCorrect(correctCountRef.current);
            scheduleAdvanceOrSettle(1200);
        } else {
            incorrectCountRef.current += 1;
            setIncorrectCount(incorrectCountRef.current);
            busEmit.decisionIncorrect(correctCountRef.current);
            busEmit.screenShake('light');
            scheduleAdvanceOrSettle(1500);
        }
    }

    // After the reveal: advance within the level, or settle the level when it
    // is finished OR mathematically unwinnable. The unwinnable early-out is
    // the most common fail path; settling it (rather than jumping straight to
    // gameOver) pays the per-correct reward for what WAS answered and records
    // history/scores through the same pipeline as a finished level.
    function scheduleAdvanceOrSettle(delayMs) {
        const config = LEVEL_CONFIG[currentLevel - 1];
        // Boundary from the ACTUAL loaded set, falling back to the constant
        // only if state is somehow empty.
        const levelLength = questions.length || QUESTIONS_PER_LEVEL;
        const remainingQuestions = levelLength - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCountRef.current + remainingQuestions;

        if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = setTimeout(() => {
            if (currentQuestionIndex + 1 >= levelLength || maxPossibleCorrect < config.minCorrect) {
                setGameState('saving_progress');
                saveLevelResult();
            } else {
                advanceToNextQuestion();
            }
        }, delayMs);
    }

    function advanceToNextQuestion() {
        setCurrentQuestionIndex(prev => prev + 1);
        trivia.reset();
        setVerdict(null);
        setSkipUsedThisQuestion(false);
        answerLockRef.current = false;
        timer.resetTimer();
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=settled, 2=progress, 3=history, 4=score
    // Server settlement result for the level, kept in a ref so a saving_error
    // retry re-uses the already-paid result instead of re-submitting a closed
    // session.
    const serverResultRef = useRef(null);

    /**
     * Settle the level with the server and persist the results. Runs for
     * every way a level ends - pass, fail, unwinnable early-out, or a paid
     * skip on the last question. session-submit grades from the answers the
     * server stored at tap time, pays the engine's survival formula through
     * a locked RPC (per-correct with escalating multiplier, 60/session cap,
     * 80/day cap) and returns the authoritative correct count - the client
     * tally is only a provisional display until this resolves.
     */
    async function saveLevelResult() {
        const config = LEVEL_CONFIG[currentLevel - 1];
        try {
            // Phase 1: settle this level's session server-side (only if not
            // already settled). Skipped questions are omitted from the array:
            // the server counts them wrong, which matches the fixed
            // 20-question denominator the pass mark is measured against.
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
                } else if (userId) {
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                }

                const awardedNow = Number.isFinite(submitted?.diamondsAwarded) ? submitted.diamondsAwarded : 0;
                setLastLevelAwarded(awardedNow);
                // The running total advances by what the server ACTUALLY
                // credited - never by a client formula.
                setTotalDiamondsEarned(prev => prev + awardedNow);
                // Display-only cap detection: calculateDiamonds IS the
                // server's uncapped survival formula, so paying less than it
                // means the daily cap clipped this level. No client clamp is
                // applied anywhere - the server already did.
                const uncapped = calculateDiamonds('survival', Number.isFinite(submitted?.correct) ? submitted.correct : 0, QUESTIONS_PER_LEVEL);
                if (awardedNow < uncapped) setCapReachedThisRun(true);
                if (awardedNow > 0) {
                    busEmit.diamondsEarned(awardedNow, `Survival Level ${currentLevel}`);
                    busEmit.celebration('confetti');
                }
            }

            const settled = serverResultRef.current || {};
            const awarded = Number.isFinite(settled.diamondsAwarded) ? settled.diamondsAwarded : 0;
            // The submit's `correct` is authoritative: if the client tally
            // and the server count disagree, the server wins.
            const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : correctCountRef.current;
            const serverScore = Number.isFinite(settled.score) ? settled.score : serverCorrect * 100;
            const passed = serverCorrect >= config.minCorrect;
            correctCountRef.current = serverCorrect;
            setCorrectCount(serverCorrect);

            // questionId -> wasCorrect from the server's per-question
            // verdicts, for the history phase below.
            const verdictMap = {};
            (Array.isArray(settled.perQuestion) ? settled.perQuestion : []).forEach(pq => {
                if (pq && typeof pq.questionId === 'string') verdictMap[pq.questionId] = pq.wasCorrect === true;
            });

            // Phase 2: Upsert survival progress (pass only; only if not
            // already updated). Non-fatal: `survival_progress` is created by
            // no migration in this repo - throwing here would trap a player
            // who has ALREADY been paid in phase 1 inside a Retry loop that
            // could never succeed if the table is missing/mis-permissioned.
            if (savePhaseRef.current < 2) {
                if (passed && userId) {
                    const { error: progressErr } = await supabase
                        .from('survival_progress')
                        .upsert({
                            user_id: userId,
                            highest_level: Math.max(currentLevel, userProgress.highestLevel),
                            last_played: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                    if (progressErr) {
                        console.warn('[Survival] Progress upsert failed (non-fatal):', progressErr.message);
                    }
                    setUserProgress(prev => ({
                        ...prev,
                        highestLevel: Math.max(currentLevel, prev.highestLevel)
                    }));
                }
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded)
            // for the questions actually answered, with was_correct taken
            // from the server's per-question verdicts - the client has no
            // answer key to compare against. Runs for failed levels too, so
            // the 60-day non-repeat guarantee holds on the most-played path.
            if (savePhaseRef.current < 3) {
                if (userId) {
                    const historyRecords = sessionAnswersRef.current
                        .filter(a => a && a.questionId != null)
                        .map(a => ({
                            user_id: userId,
                            question_id: a.questionId,
                            was_correct: verdictMap[a.questionId] === true,
                            seen_at: new Date().toISOString(),
                            mode: 'survival'
                        }));
                    if (historyRecords.length > 0) {
                        // ignoreDuplicates:true => ON CONFLICT DO NOTHING.
                        // trivia_user_question_history has SELECT + INSERT RLS
                        // policies but NO UPDATE policy, so ignoreDuplicates:false
                        // failed the ENTIRE batch whenever any question had been
                        // seen before — silently dropping the whole level's history.
                        const { error: historyErr } = await supabase
                            .from('trivia_user_question_history')
                            .upsert(historyRecords, { onConflict: 'user_id,question_id', ignoreDuplicates: true });
                        if (historyErr) {
                            console.warn('[Survival] History upsert failed (non-fatal):', historyErr.message);
                        }
                    }
                }
                savePhaseRef.current = 3;
            }

            // Phase 4: Record to unified trivia_scores (for leaderboard) with
            // the SERVER numbers. Capture insert error — supabase-js does NOT
            // throw on DB errors.
            if (savePhaseRef.current < 4) {
                if (userId) {
                    // Phase 73: CST-anchored play_date so leaderboard.js (which
                    // queries by CST today) finds same-day rows.
                    const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                        user_id: userId,
                        username: avatarUser?.username || avatarUser?.display_name || null,
                        mode: 'survival',
                        score: serverScore,
                        correct_count: serverCorrect,
                        total_questions: QUESTIONS_PER_LEVEL,
                        diamonds_earned: awarded,
                        play_date: getTodayCST()
                    });
                    if (scoreErr) throw scoreErr;
                }
                savePhaseRef.current = 4;
            }

            // Success! Level saved — reset phase for the next level, and let
            // the SERVER's correct count decide pass/fail.
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
            if (passed) {
                setGameState(currentLevel >= 10 ? 'victory' : 'levelComplete');
            } else {
                setGameState('gameOver');
            }
        } catch (e) {
            console.warn('[Survival] Failed to save level result:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef
            // preserves progress; serverResultRef keeps an already-paid
            // settlement so a retry never re-submits a closed session).
            setSaveErrorPayload({ level: currentLevel });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving_progress');
        setSaveErrorPayload(null);
        saveLevelResult(); // savePhaseRef skips already-completed steps
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

    // Questions the player got wrong this level, with the right answer, for
    // the post-run review panel on the game-over screen. Built from the
    // per-tap server verdicts - the client holds no answer key, so a question
    // whose verdict never arrived (offline timeout) simply does not appear.
    const reviewMissed = questions
        .map((q) => ({ q, v: q && q.id != null ? verdictsRef.current.get(q.id) : undefined }))
        .filter(({ v }) => v && v.wasCorrect !== true)
        .map(({ q, v }, i) => ({
            id: q.id ?? `missed-${i}`,
            question: q.question,
            correctOption: (Array.isArray(q.options) && Number.isInteger(v.correctDisplayIndex) && v.correctDisplayIndex >= 0)
                ? q.options[v.correctDisplayIndex]
                : ''
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
                <GameCostPopup userId={userId} featureKey="trivia_survival_game" isVip={isVip} cost={GAME_ENTRY_COST} />
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
                                        We couldn't save your progress for Level {saveErrorPayload?.level} because you lost connection. Please check your internet and try again so this level's reward is not lost!
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
                                        {/* The reveal keys off the server verdict: the client
                                            never holds a correct_index of its own. */}
                                        {currentQuestion.options?.map((option, index) => {
                                            let bg = 'rgba(255,255,255,0.05)';
                                            let borderColor = 'rgba(255,255,255,0.1)';

                                            if (trivia.showResult && verdict) {
                                                if (index === verdict.correctDisplayIndex) {
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
                                                    onClick={() => gradeAnswer(index)}
                                                    disabled={trivia.selectedAnswer !== null || trivia.showResult}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '14px',
                                                        padding: '14px 18px',
                                                        background: bg,
                                                        border: `2px solid ${borderColor}`,
                                                        borderRadius: '10px',
                                                        color: 'rgba(255,255,255,0.9)',
                                                        fontSize: '15px',
                                                        textAlign: 'left',
                                                        cursor: (trivia.selectedAnswer !== null || trivia.showResult) ? 'default' : 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '13px'
                                                    }}>
                                                        {String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span style={{ flex: 1 }}>{toTitleCase(option)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Lifeline Buttons Row.
                                        Skip is the one lifeline that survives server grading: it
                                        never answers, so it needs no answer key and no second
                                        attempt. 50/50 and Double Chance are gone - see the note
                                        at the lifeline state declarations. */}
                                    {!trivia.showResult && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '10px',
                                            marginTop: '20px'
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
                                    💎 +{lastLevelAwarded ?? 0} Diamonds | Total: {totalDiamondsEarned}
                                    {/* The number above is what session-submit credited; the
                                        line below is the formula it pays, so the promise and
                                        the payout can never disagree. */}
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: 6 }}>
                                        Pays per correct answer with a streak multiplier (max 60 per level, {DAILY_DIAMOND_CAP}/day)
                                    </div>
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
                                        Uses data already in memory (questions + the per-tap
                                        server verdicts). */}
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
                                                    Daily earning cap reached - the server trimmed some level payouts.
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
