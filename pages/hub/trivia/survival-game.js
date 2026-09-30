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
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_SURVIVAL } from '../../../src/config/triviaIntroArt.mjs';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { playHeartbeat, closeHeartbeatAudio } from '../../../src/lib/heartbeatAudio';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { DAILY_DIAMOND_CAPS, calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import { getAccessToken } from '../../../src/lib/authUtils';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { readOwnProfile } from '../../../src/lib/ownProfile';

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
    const survivalParentSessionRef = useRef(null);
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
                    const { data } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
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
            const { data } = await readOwnProfile(supabase, 'diamonds', { expectId: uid });
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
        if (level === 1) survivalParentSessionRef.current = null;

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
                parentSessionId: survivalParentSessionRef.current,
            });
        } catch (e) {
            console.warn('[Survival] Server session start failed:', e?.message || e);
            // A 402 is the balance gate, not a connection problem: show the
            // Not Enough Diamonds state alone instead of both messages.
            if (e?.status === 402) {
                setShowOutOfDiamonds(true);
                setGameState('lobby');
                return;
            }
            setLevelLoadError('We Could Not Load This Level. Please Check Your Connection And Try Again.');
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
            setLevelLoadError('We Could Not Load A Full Set Of Questions For This Level. Please Check Your Connection And Try Again.');
            setGameState('lobby');
            return;
        }

        if (Number.isFinite(served.newBalance)) setUserDiamonds(served.newBalance);
        if (served.entryState === 'charged' && served.entryCost > 0) {
            busEmit.diamondsSpent(served.entryCost, 'Survival entry');
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
            const charge = await DiamondEngine.deduct(cost, source, {
                description: 'Survival Trivia skip lifeline',
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
            console.warn('[Survival] Lifeline deduction failed:', e);
            setActionError('Could Not Purchase That Lifeline. Please Try Again.');
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
            const paid = await chargeLifeline(LIFELINE_COST, 'trivia_lifeline');
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
                setActionError('Could Not Submit That Answer. Please Tap It Again.');
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
                survivalParentSessionRef.current = submitted.sessionId;
                savePhaseRef.current = 1;

                // Local balance from the server's post-award number, with a
                // fresh profiles read as the fallback.
                if (Number.isFinite(submitted?.newBalance)) {
                    setUserDiamonds(submitted.newBalance);
                } else if (userId) {
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
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
            // The submit's `correct` is authoritative: if the client tally
            // and the server count disagree, the server wins.
            const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : correctCountRef.current;
            const passed = serverCorrect >= config.minCorrect;
            correctCountRef.current = serverCorrect;
            setCorrectCount(serverCorrect);

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

            // Settlement atomically finalized history, mastery and skip
            // telemetry from the binding server answers.
            savePhaseRef.current = Math.max(savePhaseRef.current, 3);

            // Phase 4: session-submit persisted the verified score atomically.
            if (savePhaseRef.current < 4) {
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

    // The pill is a short painted slot (about eight characters at 375px);
    // longer state, balance and timer copy is printed on the glass below.
    const balanceLabel = isVip ? 'VIP' : 'Ready';
    const nextAvailableLevel = Math.min(userProgress.highestLevel + 1, LEVEL_CONFIG.length);
    const stateLabel = showOutOfDiamonds
        ? 'Balance'
        : isPaused
            ? 'Paused'
            : {
                lobby: balanceLabel,
                loading_level: 'Dealing',
                playing: `Level ${formatTriviaDisplayNumber(currentLevel)}`,
                saving_progress: 'Saving',
                saving_error: 'Retry',
                levelComplete: 'Cleared',
                gameOver: 'Failed',
                victory: 'Victory',
            }[gameState] || balanceLabel;

    const resumeGame = () => {
        setIsPaused(false);
        timer.setIsTimerRunning(true);
    };

    const primaryAction = showOutOfDiamonds
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : isPaused
            ? { label: 'Resume Game', onClick: resumeGame }
            : gameState === 'lobby'
                ? {
                    label: userProgress.highestLevel > 0
                        ? `Continue From Level ${formatTriviaDisplayNumber(nextAvailableLevel)}`
                        : 'Start Level 1',
                    onClick: () => startLevel(nextAvailableLevel),
                    disabled: isLoading,
                    'aria-disabled': isLoading,
                }
                : gameState === 'saving_error'
                    ? { label: 'Retry Save', onClick: handleRetrySave }
                    : gameState === 'levelComplete'
                        ? {
                            // Short enough for the painted plate face at 375px.
                            label: `Play Level ${formatTriviaDisplayNumber(currentLevel + 1)}`,
                            onClick: continueToNextLevel,
                        }
                        : gameState === 'gameOver'
                            ? {
                                label: `Retry Level ${formatTriviaDisplayNumber(currentLevel)}`,
                                onClick: () => restartFromLevel(currentLevel),
                            }
                            : gameState === 'victory'
                                ? { label: 'Return To Trivia Hub', onClick: backToLobby }
                                : null;

    const secondaryAction = showOutOfDiamonds
        ? { label: 'Close', onClick: () => setShowOutOfDiamonds(false) }
        : gameState === 'levelComplete'
            ? { label: 'Save And Exit', onClick: backToLobby }
            : gameState === 'gameOver'
                ? { label: 'Back To Trivia', onClick: backToLobby }
                : null;

    return (
        <TriviaErrorBoundary pageName="Survival Mode">
            <>
                {/* INDEXED LIKE EVERY OTHER TRIVIA MODE (AEO phase 3,
                    2026-09-18). This carried noindex while endless, mixed, time
                    attack, head to head, tournaments and the leaderboard were all
                    indexed, so "poker trivia survival mode" had nothing to land
                    on. The noindex was honest when the page was a bare game
                    screen with nineteen words; it now carries the same
                    server-rendered description as its six siblings. The
                    deprecated shim at /hub/trivia/survival keeps its noindex and
                    stays out of the sitemap, which is correct for a redirect. */}
                <SEOHead
                    title="Survival Poker Trivia: One Life"
                    description="Survival Poker Trivia On Smarter.Poker: One Run, One Life, And A Wrong Answer Ends It. Knowing You Do Not Know Is Worth As Much As Knowing. Free To Play, And Nothing In It Is A Wager."
                    canonical="/hub/trivia/survival-game"
                />

                <div
                    className="trivia-challenge-page trivia-challenge-page--survival"
                    data-trivia-family="challenge"
                    data-trivia-surface="survival-game"
                    data-game-state={gameState}
                    data-screen-shake={screenShake ? 'active' : 'idle'}
                >
                    <UniversalHeader pageDepth={2} />

                    {userId && !isVip && (
                        <GameCostPopup
                            userId={userId}
                            featureKey="trivia_survival_game"
                            isVip={isVip}
                            cost={GAME_ENTRY_COST}
                        />
                    )}

                    <PageTransition>
                        <main className="trivia-challenge-shell" aria-labelledby="survival-trivia-title">
                            <TriviaConsole
                                className="trivia-challenge-console"
                                eyebrow="Ten Level Challenge"
                                title="Survival Trivia"
                                titleId="survival-trivia-title"
                                subtitle="Clear Every Level"
                                pill={stateLabel}
                                aria-labelledby="survival-trivia-title"
                                primaryAction={primaryAction}
                                secondaryAction={secondaryAction}
                            >
                                {showOutOfDiamonds && (
                                    <section
                                        className="trivia-challenge-alert"
                                        role="alert"
                                        aria-labelledby="survival-diamonds-title"
                                    >
                                        <h2 id="survival-diamonds-title">Not Enough Diamonds</h2>
                                        <p>
                                            A New Run Costs {formatTriviaDisplayNumber(GAME_ENTRY_COST)} Diamonds.
                                            Get More Diamonds Or Upgrade To VIP For Unlimited Access.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'lobby' && (
                                    <section className="trivia-challenge-intro" aria-labelledby="survival-ready-title">
                                        <ResponsiveModeArt art={TRIVIA_INTRO_ART_SURVIVAL} priority />
                                        <h2 id="survival-ready-title">Choose Your Starting Level</h2>
                                        <p>
                                            Clear {formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)} Questions Per Level
                                            As The Required Accuracy Climbs From 85% To 100%.
                                        </p>

                                        {levelLoadError && (
                                            <p className="trivia-challenge-alert" role="alert">{levelLoadError}</p>
                                        )}

                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Levels</dt>
                                                <dd>{formatTriviaDisplayNumber(LEVEL_CONFIG.length)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Questions Per Level</dt>
                                                <dd>{formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Best Level</dt>
                                                <dd>{formatTriviaDisplayNumber(userProgress.highestLevel)}</dd>
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

                                        <div className="trivia-challenge-levels" aria-label="Survival Level Selection">
                                            {LEVEL_CONFIG.map(level => {
                                                const isUnlocked = level.level <= userProgress.highestLevel + 1;
                                                const isCompleted = level.level <= userProgress.highestLevel;
                                                return (
                                                    <button
                                                        key={level.level}
                                                        type="button"
                                                        className="trivia-challenge-level"
                                                        onClick={() => startLevel(level.level)}
                                                        disabled={!isUnlocked || isLoading}
                                                        aria-label={`Level ${level.level}, ${level.accuracyRequired}% Required, ${isCompleted ? 'Complete' : isUnlocked ? 'Available' : 'Locked'}`}
                                                    >
                                                        <span>Level {formatTriviaDisplayNumber(level.level)}</span>
                                                        <span>{formatTriviaDisplayNumber(level.accuracyRequired)}% Required</span>
                                                        <span>{isCompleted ? 'Complete' : isUnlocked ? 'Available' : 'Locked'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <p className="trivia-challenge-note">
                                            Retries Are Free. The Entry Cost Applies Only When Starting A New Run.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'loading_level' && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Dealing Level {formatTriviaDisplayNumber(currentLevel)}</p>
                                    </div>
                                )}

                                {gameState === 'saving_progress' && (
                                    <div className="trivia-challenge-state" role="status" aria-live="polite">
                                        <p>Securing Your Survival Progress</p>
                                    </div>
                                )}

                                {gameState === 'saving_error' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                        <h2>Network Disconnected</h2>
                                        <p>
                                            We Could Not Save Progress For Level {formatTriviaDisplayNumber(saveErrorPayload?.level)}.
                                            Check Your Connection And Retry To Protect This Level And Its Reward.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && isPaused && (
                                    <section className="trivia-challenge-state trivia-challenge-state--paused" role="status">
                                        <h2>Game Paused</h2>
                                        <p>
                                            You Left The Screen With {formatTriviaDisplayNumber(timer.timeLeft)} Seconds Remaining.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'playing' && currentQuestion && !isPaused && (
                                    <section
                                        className={`trivia-challenge-stage${screenShake ? ' trivia-challenge-stage--shaking' : ''}`}
                                        aria-labelledby="survival-question-title"
                                    >
                                        {actionError && (
                                            <p className="trivia-challenge-alert" role="alert">{actionError}</p>
                                        )}

                                        <dl className="trivia-challenge-stats trivia-challenge-stats--compact">
                                            <div className="trivia-challenge-stat">
                                                <dt>Level</dt>
                                                <dd>{formatTriviaDisplayNumber(currentLevel)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Correct</dt>
                                                <dd>{formatTriviaDisplayNumber(correctCount)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Wrong</dt>
                                                <dd>{formatTriviaDisplayNumber(incorrectCount)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds</dt>
                                                <dd>{formatTriviaDisplayNumber(totalDiamondsEarned)}</dd>
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
                                                aria-controls="survival-game-settings"
                                            >
                                                {showSettingsPanel ? 'Close Settings' : 'Game Settings'}
                                            </button>
                                            {lifelinesUsedThisLevel > 0 && (
                                                <span className="trivia-challenge-note">
                                                    Lifelines {formatTriviaDisplayNumber(lifelinesUsedThisLevel)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(MAX_LIFELINES_PER_LEVEL)}
                                                </span>
                                            )}
                                        </div>

                                        {showSettingsPanel && (
                                            <section
                                                id="survival-game-settings"
                                                className="trivia-challenge-settings"
                                                aria-labelledby="survival-settings-title"
                                            >
                                                <h3 id="survival-settings-title">Game Settings</h3>
                                                <div className="trivia-challenge-setting">
                                                    <span id="survival-audio-label">Sound Effects</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="survival-audio-label"
                                                        aria-checked={settings.audio}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => triviaAudio.setMuted(settings.audio)}
                                                    >
                                                        {settings.audio ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="survival-haptics-label">Haptic Vibration</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="survival-haptics-label"
                                                        aria-checked={settings.haptics}
                                                        className="trivia-challenge-switch"
                                                        onClick={() => setSettings(prev => ({ ...prev, haptics: !prev.haptics }))}
                                                    >
                                                        {settings.haptics ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                                <div className="trivia-challenge-setting">
                                                    <span id="survival-shake-label">Screen Shake</span>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-labelledby="survival-shake-label"
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

                                        <progress
                                            className="trivia-challenge-progress"
                                            value={currentQuestionIndex + 1}
                                            max={QUESTIONS_PER_LEVEL}
                                            aria-label={`Question ${currentQuestionIndex + 1} Of ${QUESTIONS_PER_LEVEL}`}
                                        />
                                        <p className="trivia-challenge-progress-label">
                                            Level {formatTriviaDisplayNumber(currentLevel)}
                                            {' | Question '}
                                            {formatTriviaDisplayNumber(currentQuestionIndex + 1)}
                                            {' Of '}
                                            {formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)}
                                        </p>

                                        <dl className="trivia-challenge-stats trivia-challenge-stats--threshold">
                                            <div className="trivia-challenge-stat">
                                                <dt>Required</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(config.minCorrect)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)}
                                                    {' | '}
                                                    {formatTriviaDisplayNumber(config.accuracyRequired)}%
                                                </dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Current</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(correctCount)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(currentQuestionIndex + (trivia.showResult ? 1 : 0))}
                                                </dd>
                                            </div>
                                        </dl>

                                        <h2 id="survival-question-title" className="trivia-challenge-question">
                                            {toTitleCase(currentQuestion.question)}
                                        </h2>

                                        <div className="trivia-challenge-options">
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

                                        {trivia.showResult && verdict?.explanation && (
                                            <section className="trivia-challenge-explanation" aria-labelledby="survival-explanation-title">
                                                <h3 id="survival-explanation-title">Why This Is Correct</h3>
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

                                {gameState === 'levelComplete' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="survival-level-complete-title">
                                        <h2 id="survival-level-complete-title">
                                            Level {formatTriviaDisplayNumber(currentLevel)} Complete
                                        </h2>
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Correct Answers</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(correctCount)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)}
                                                </dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Accuracy</dt>
                                                <dd>{formatTriviaDisplayNumber(Math.round((correctCount / QUESTIONS_PER_LEVEL) * 100))}%</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Level Reward</dt>
                                                <dd>{formatTriviaDisplayNumber(lastLevelAwarded ?? 0)} Diamonds</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Run Total</dt>
                                                <dd>{formatTriviaDisplayNumber(totalDiamondsEarned)} Diamonds</dd>
                                            </div>
                                        </dl>
                                        <p className="trivia-challenge-note">
                                            Rewards Scale With Correct Answers And Streaks.
                                            Each Level Pays Up To 60 Diamonds With An {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)} Diamond Daily Cap.
                                        </p>
                                    </section>
                                )}

                                {gameState === 'gameOver' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="survival-game-over-title">
                                        <h2 id="survival-game-over-title">
                                            Level {formatTriviaDisplayNumber(currentLevel)} Failed
                                        </h2>
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Correct Answers</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(correctCount)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(currentQuestionIndex + 1)}
                                                </dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Required</dt>
                                                <dd>
                                                    {formatTriviaDisplayNumber(config.minCorrect)}
                                                    {' Of '}
                                                    {formatTriviaDisplayNumber(QUESTIONS_PER_LEVEL)}
                                                </dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Accuracy Target</dt>
                                                <dd>{formatTriviaDisplayNumber(config.accuracyRequired)}%</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds Earned</dt>
                                                <dd>{formatTriviaDisplayNumber(totalDiamondsEarned)}</dd>
                                            </div>
                                        </dl>
                                        <p className="trivia-challenge-note">
                                            Retries Are Free. You Only Pay To Start A New Run.
                                        </p>
                                        {capReachedThisRun && (
                                            <p className="trivia-challenge-note">
                                                Daily Earning Cap Reached. The Server Trimmed Some Level Payouts.
                                            </p>
                                        )}

                                        {reviewMissed.length > 0 && (
                                            <section className="trivia-challenge-review" aria-labelledby="survival-review-title">
                                                <h3 id="survival-review-title">Missed Questions</h3>
                                                <button
                                                    type="button"
                                                    className="trivia-challenge-action"
                                                    onClick={() => setShowReview(prev => !prev)}
                                                    aria-expanded={showReview}
                                                    aria-controls="survival-review-list"
                                                >
                                                    {showReview ? 'Hide Review' : `Review ${formatTriviaDisplayNumber(reviewMissed.length)} Missed ${reviewMissed.length === 1 ? 'Question' : 'Questions'}`}
                                                </button>
                                                {showReview && (
                                                    <ol id="survival-review-list" className="trivia-challenge-list">
                                                        {reviewMissed.map(item => (
                                                            <li key={item.id}>
                                                                <p>{toTitleCase(item.question)}</p>
                                                                <p>Correct Answer: {toTitleCase(item.correctOption || '')}</p>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                )}
                                            </section>
                                        )}

                                        <button
                                            type="button"
                                            className="trivia-challenge-action"
                                            onClick={async () => {
                                                const result = await shareResult({
                                                    mode: 'Survival',
                                                    score: correctCount,
                                                    total: QUESTIONS_PER_LEVEL,
                                                    diamonds: totalDiamondsEarned,
                                                });
                                                if (result === 'copied') alert('Result Copied To Clipboard.');
                                            }}
                                        >
                                            Share Result
                                        </button>
                                    </section>
                                )}

                                {gameState === 'victory' && (
                                    <section className="trivia-challenge-state trivia-challenge-state--results" aria-labelledby="survival-victory-title">
                                        <h2 id="survival-victory-title">Survival Master</h2>
                                        <p>You Completed All {formatTriviaDisplayNumber(LEVEL_CONFIG.length)} Levels.</p>
                                        <dl className="trivia-challenge-stats">
                                            <div className="trivia-challenge-stat">
                                                <dt>Diamonds Earned</dt>
                                                <dd>{formatTriviaDisplayNumber(totalDiamondsEarned)}</dd>
                                            </div>
                                            <div className="trivia-challenge-stat">
                                                <dt>Final Accuracy Target</dt>
                                                <dd>100%</dd>
                                            </div>
                                        </dl>
                                    </section>
                                )}
                            </TriviaConsole>
                        </main>
                    </PageTransition>
                </div>
            </>
            {/* The only body copy a crawler gets here: the game itself
                arrives after a data load. */}
            <HubPageSummary page="trivia-survival" as="h1" />
        </TriviaErrorBoundary>
    );
}
