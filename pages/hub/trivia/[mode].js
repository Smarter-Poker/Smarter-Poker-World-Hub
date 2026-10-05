/**
 * TRIVIA GAME PAGE - Individual mode gameplay
 * Route: /hub/trivia/[mode]
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { authedFetch, getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaGame from '../../../src/components/trivia/TriviaGame';
import TriviaResult from '../../../src/components/trivia/TriviaResult';
import LeaderboardDisplay from '../../../src/components/trivia/LeaderboardDisplay';
import { TRIVIA_MODES, calculateDiamonds, CATEGORY_MAPPINGS, DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { checkNewUnlocks, computeTriviaStats } from '../../../src/config/triviaAchievements';

import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_ARCADE, TRIVIA_INTRO_ART_DAILY, TRIVIA_INTRO_ART_HISTORY, TRIVIA_INTRO_ART_PRO, TRIVIA_INTRO_ART_RULES } from '../../../src/config/triviaIntroArt.mjs';
import TriviaConsoleDialog from '../../../src/components/trivia/console/TriviaConsoleDialog';
import DailyTriviaBroadcast, { DailyLeaderboard, DailySettlementReceipt } from '../../../src/components/trivia/daily/DailyTriviaBroadcast';
import { projectDailyResume } from '../../../src/components/trivia/daily/dailyTriviaModel.mjs';
import { getRecentlySeenIds, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { createSoloJourneyTracker } from '../../../src/lib/trivia/soloJourneyAnalytics.mjs';
import {
    createAccountOperationScope,
    isStaleAccountOperation,
} from '../../../src/lib/trivia/accountOperationScope.mjs';

// Phase 55 - gameplay quality floor. Questions tagged below this by the audit
// pipeline (qs=2 auto-demoted via 3-strike user reports, qs=4 unclear English,
// qs=5 legacy un-audited) are excluded from rotation here too.
const MIN_QUALITY_SCORE = 6;

// Phase 1 Enhancement Imports
import PrizeWheel from '../../../src/components/trivia/PrizeWheel';
import { useCelebrations } from '../../../src/components/trivia/CelebrationEffects';
import { getStreakTier, calculateRewardWithMultiplier } from '../../../src/config/triviaStreakSystem';

// Phase 2 Enhancement Imports
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { readOwnProfile } from '../../../src/lib/ownProfile';

// Category source of truth is triviaEngine's CATEGORY_MAPPINGS - do not
// re-declare category arrays here (three parallel maps had silently drifted).
// AUDIT FIX (C2): the old comment claimed mtt/cash/icm/gto had dedicated
// static pages shadowing this dynamic route - those pages do not exist, so
// /hub/trivia/mtt|cash|icm|gto resolve HERE. Without entries in this map,
// `categories` came back undefined and the paid strategy modes served
// questions from EVERY category. They now mirror the engine's canonical
// arrays. (mixed/endless/time-attack/pvp/tournaments DO have static pages;
// survival is redirected to /hub/trivia/survival-game - see C1 fix below.)
const CATEGORY_MAP = {
    daily: null,
    arcade: null,
    history: [...CATEGORY_MAPPINGS.history],
    rules: [...CATEGORY_MAPPINGS.rules],
    pro: [...CATEGORY_MAPPINGS.pro],
    mtt: [...CATEGORY_MAPPINGS.mtt],
    cash: [...CATEGORY_MAPPINGS.cash],
    icm: [...CATEGORY_MAPPINGS.icm],
    gto: [...CATEGORY_MAPPINGS.gto],
};

// Each mode's own destination art (intro-v1, src/config/triviaIntroArt.mjs),
// distinct from its lobby thumbnail. The art is a text-free picture; every
// figure, rule and the Start action are printed live around it.
const MODE_ART = Object.freeze({
    daily: TRIVIA_INTRO_ART_DAILY,
    history: TRIVIA_INTRO_ART_HISTORY,
    rules: TRIVIA_INTRO_ART_RULES,
    pro: TRIVIA_INTRO_ART_PRO,
    arcade: TRIVIA_INTRO_ART_ARCADE,
});
function getModeArt(mode) {
    return Object.prototype.hasOwnProperty.call(MODE_ART, mode) ? MODE_ART[mode] : null;
}

// Every mode rendered by this dynamic page must use the server-authoritative
// session flow. Keeping a mode out of this set is not a safe fallback: answer
// columns are no longer browser-readable and verified score persistence
// deliberately rejects locally graded results. Standalone routes (mixed,
// endless, survival, time-attack, PvP and tournaments) own their separate
// server-authoritative adapters.
const SERVER_GRADED_PAGE_MODES = new Set([
    'arcade', 'daily', 'history', 'rules', 'pro',
    'mtt', 'cash', 'icm', 'gto'
]);

export default function TriviaModePage() {
    useTrainingBus('trivia-mode');
    const router = useRouter();
    const { mode } = router.query;
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const soloJourneyTrackerRef = useRef(null);
    if (!soloJourneyTrackerRef.current) soloJourneyTrackerRef.current = createSoloJourneyTracker();
    const soloRunLifecycleRef = useRef({ active: false, settled: false, mode: null, state: 'playing' });
    const startRetryRef = useRef(false);
    const resumeRetryRef = useRef(false);

    useEffect(() => () => {
        const lifecycle = soloRunLifecycleRef.current;
        if (lifecycle.active && !lifecycle.settled) {
            soloJourneyTrackerRef.current.track(lifecycle.mode, 'abandon', {
                surface: 'daily',
                abandon_state: lifecycle.state === 'settling' ? 'settling' : 'playing',
            });
        }
    }, []);

    // ── AUDIT FIX (C1) ───────────────────────────────────────────────
    // 'survival' exists in TRIVIA_MODES (diamondCost: 10) but this page has
    // no renderer for it (`gameState === 'playing' && mode !== 'survival'`),
    // so a direct hit on /hub/trivia/survival showed a paid lobby, charged
    // 10 diamonds on Start, then rendered a blank game - charge without
    // serving. Redirect to the real game BEFORE anything can charge; the
    // component renders null for this slug (see guard before router.isReady).
    const isSurvivalSlug = mode === 'survival';
    useEffect(() => {
        if (isSurvivalSlug) router.replace('/hub/trivia/survival-game');
    }, [isSurvivalSlug, router]);

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    // ── AUDIT FIX (M4) ───────────────────────────────────────────────
    // Ref mirror of gameState so the initialize effect (whose deps include
    // avatarUser?.id / authLoading) can tell whether a game is in progress
    // WITHOUT adding gameState to its dep list. Declared before that effect
    // so the sync runs first in each commit.
    const gameStateRef = useRef('loading');
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    const [questions, setQuestions] = useState([]);
    const [result, setResult] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardFilter, setLeaderboardFilter] = useState('today');
    const [userStreak, setUserStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [userId, setUserId] = useState(null);
    const accountIdentityRef = useRef(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const resolvedAccountId = authLoading
        ? userId
        : (avatarUser?.id || getAuthUser()?.id || null);
    if (!authLoading) accountOperationScopeRef.current.transition(resolvedAccountId);
    // Recovery must use the same resolved account authority as the page. Some
    // sessions hydrate through getAuthUser() before AvatarContext does; binding
    // recovery only to avatarUser would make those authenticated starts
    // non-durable.
    const serverRun = useServerGradedRun(mode, { accountId: resolvedAccountId });

    useEffect(() => {
        if (gameState === 'results' && result?.receipt?.sessionId) {
            serverRun.acknowledgeSettlement();
        }
    }, [gameState, result?.receipt?.sessionId, serverRun.acknowledgeSettlement]);
    const serverGraded = serverRun.isEnabled && SERVER_GRADED_PAGE_MODES.has(mode);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [error, setError] = useState(null);
    const [isVIP, setIsVIP] = useState(false);
    const [communityAccuracy, setCommunityAccuracy] = useState(null);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    // Daily trivia enhancements
    const [dailyDiamondsClaimed, setDailyDiamondsClaimed] = useState(false);
    const [dailyLeaderboard, setDailyLeaderboard] = useState([]);
    const [lastPlayDate, setLastPlayDate] = useState(null);
    const [dailyStatus, setDailyStatus] = useState('loading');
    const [dailyStatusError, setDailyStatusError] = useState(null);
    const [dailyLeaderboardState, setDailyLeaderboardState] = useState('loading');
    const [dailyLeaderboardError, setDailyLeaderboardError] = useState(null);
    const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
    const [dailyResumeSeed, setDailyResumeSeed] = useState({
        questionIndex: 0,
        answers: [],
        verdicts: {},
        correctCount: 0,
        streak: 0,
    });
    const dailyStatusRequestRef = useRef(0);
    const dailyLeaderboardRequestRef = useRef(0);
    const startOperationRef = useRef(null);

    // Personal best (per-mode) for the ready screen / results delta
    const [personalBest, setPersonalBest] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    // The lobby's scene art is optional: until (or unless) it loads, the lobby
    // prints its live rows alone rather than a broken picture.

    // Phase 1: Prize wheel and celebration states
    const [showPrizeWheel, setShowPrizeWheel] = useState(false);
    const [wheelSpun, setWheelSpun] = useState(false);
    const [isPerfectScore, setIsPerfectScore] = useState(false);
    const celebrations = useCelebrations();

    // Server-resolved prize-wheel outcome ({ prizeId, prizeAmount }) - the wheel
    // only animates to it, it never decides or credits anything itself.
    const [wheelPrize, setWheelPrize] = useState(null);
    const [wheelError, setWheelError] = useState(null);

    // Double-or-Nothing state removed with the wager (it could not settle).
    // sessionSeenIdsRef went with it - the bonus draw was its only reader.

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=verified score, 2=payout synced, 5=server projections finalized

    // The per-run idempotency key chain (gameRunIdRef / newGameRunId /
    // getIdempotencyKey) is gone: it existed only to build p_reference_id
    // values for browser-side diamond credits, and this page no longer makes
    // any. Server payouts carry their own idempotent references
    // (award_trivia_run uses trivia_session_<id>).
    // id of THIS run's trivia_scores row - the prize wheel's server-side token.
    const scoreIdRef = useRef(null);
    // Caches the daily-cap-clamped reward so a saving_error retry doesn't
    // re-query the cap (phase 1's own score row would double-count).
    const cappedRewardRef = useRef(null);
    // Caches "is this the first daily completion today" so a saving_error
    // retry keeps the same answer (setDailyDiamondsClaimed(true) during the
    // first attempt would otherwise flip it and drop the bonus mid-retry).
    const firstDailyTodayRef = useRef(null);

    useEffect(() => {
        const markOnline = () => setIsOnline(true);
        const markOffline = () => setIsOnline(false);
        window.addEventListener('online', markOnline);
        window.addEventListener('offline', markOffline);
        return () => {
            window.removeEventListener('online', markOnline);
            window.removeEventListener('offline', markOffline);
        };
    }, []);

    // Using existing supabase instance from lib
    const modeConfig = mode ? TRIVIA_MODES[mode] : null;

    // Load questions and user data
    useEffect(() => {
        if (!mode || !modeConfig) return;
        // AUDIT FIX (C1): survival is redirected to its own page - never
        // initialize (or later charge) for it here.
        if (mode === 'survival') return;
        // Wait for auth to finish loading before initializing
        if (authLoading) return;
        const accountChanged = accountIdentityRef.current !== resolvedAccountId;
        accountIdentityRef.current = resolvedAccountId;
        const operationScope = accountOperationScopeRef.current.transition(resolvedAccountId);
        let cancelled = false;
        const isCurrent = () => !cancelled
            && accountOperationScopeRef.current.isCurrent(operationScope);

        // An auth boundary owns the run boundary. Preserve the old account's
        // durable recovery pointer, but never keep its in-memory session or
        // balance on screen under a different identity.
        if (accountChanged) {
            startOperationRef.current = null;
            isStartingRef.current = false;
            setIsStarting(false);
            dailyStatusRequestRef.current += 1;
            savePhaseRef.current = 0;
            cappedRewardRef.current = null;
            firstDailyTodayRef.current = null;
            scoreIdRef.current = null;
            setUserId(resolvedAccountId);
            setUserDiamonds(0);
            setIsVIP(false);
            setUserStreak(0);
            setBestStreak(0);
            setLastPlayDate(null);
            setPersonalBest(null);
            setDailyDiamondsClaimed(false);
            setQuestions([]);
            setResult(null);
            setSaveErrorPayload(null);
            setWheelPrize(null);
        }
        if (accountChanged && ['playing', 'saving', 'saving_error'].includes(gameStateRef.current)) {
            setError(resolvedAccountId
                ? 'Your Account Changed. Start Or Resume A Run For This Account.'
                : 'Sign In Again To Continue Trivia.');
            setGameState('error');
            return () => { cancelled = true; };
        }

        // AUDIT FIX (M4): this effect re-runs when avatarUser?.id or
        // authLoading change (sign-in completing in another tab, session
        // refresh re-hydrating AvatarContext). initialize() unconditionally
        // setGameState('loading'), which destroyed an in-progress PAID game
        // - entry diamonds already deducted, no completion, no refund.
        // Never re-initialize over an active or still-saving run.
        if (['playing', 'saving', 'saving_error'].includes(gameStateRef.current)) {
            return () => { cancelled = true; };
        }

        async function initialize() {
            setGameState('loading');
            setError(null);

            try {
                // Try avatarUser first, then getAuthUser as fallback
                const currentUserId = resolvedAccountId;

                if (currentUserId) {
                    setUserId(currentUserId);
                    setUserDiamonds(0);
                    setIsVIP(false);
                    setUserStreak(0);
                    setBestStreak(0);
                    setLastPlayDate(null);
                    setPersonalBest(null);

                    // Check VIP status
                    await DiamondEngine.init(currentUserId);
                    const vipStatus = await DiamondEngine.isVIP();
                    if (!isCurrent()) return;
                    setIsVIP(vipStatus);

                    // Get diamonds
                    const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: currentUserId });
                    if (!isCurrent()) return;

                    if (profile) {
                        setUserDiamonds(profile.diamonds || 0);
                    }

                    if (mode === 'daily') {
                        // Daily attempt/streak state is one authoritative read
                        // with explicit loading/error states. It is re-read
                        // after settlement so streak-shield outcomes are never
                        // invented by client calendar arithmetic.
                        await loadDailyAccountState(currentUserId);
                        if (!isCurrent()) return;
                    } else {
                        const { data: streakData } = await supabase
                            .from('trivia_streaks')
                            .select('current_streak, best_streak, last_play_date')
                            .eq('user_id', currentUserId)
                            .maybeSingle();
                        if (!isCurrent()) return;

                        if (streakData) {
                            setUserStreak(streakData.current_streak || 0);
                            setBestStreak(streakData.best_streak || 0);
                            setLastPlayDate(streakData.last_play_date || null);
                        }
                    }

                    // Personal best for this mode (cheap retention win - data
                    // is already collected in trivia_scores)
                    try {
                        const { data: bestRow } = await supabase
                            .from('trivia_scores')
                            .select('score')
                            .eq('user_id', currentUserId)
                            .eq('mode', mode)
                            .order('score', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (!isCurrent()) return;
                        if (bestRow && typeof bestRow.score === 'number') {
                            setPersonalBest(bestRow.score);
                        }
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                    // Check arcade diamonds. VIPs play free (see startGame), so
                    // they skip the gate. The old `sessionStorage.trivia_paid`
                    // escape hatch is gone - nothing writes that flag any more.
                    if (mode === 'arcade' && !vipStatus) {
                        const arcadeCost = modeConfig?.diamondCost || 0;
                        if (arcadeCost > 0) {
                            const diamonds = profile?.diamonds ?? (await getUserDiamonds(currentUserId));
                            if (!isCurrent()) return;
                            if (diamonds < arcadeCost) {
                                setError(`Not Enough Diamonds. You Need ${arcadeCost} Diamonds To Play ${toTitleCase(modeConfig?.name || 'This Mode')}.`);
                                setGameState('error');
                                return;
                            }
                        }
                    }

                } else {
                    // Never leave a previous account's recovery scope, wallet,
                    // streak or best score active after sign-out. Public modes
                    // may still load their anonymous question/lobby state.
                    setUserId(null);
                    setUserDiamonds(0);
                    setIsVIP(false);
                    setUserStreak(0);
                    setBestStreak(0);
                    setLastPlayDate(null);
                    setPersonalBest(null);
                    if (mode === 'daily') {
                        // Authentication is required for the server-owned
                        // Daily run; public standings still load below.
                        dailyStatusRequestRef.current += 1;
                        setDailyDiamondsClaimed(false);
                        setDailyStatus('ready');
                        setDailyStatusError(null);
                    }
                }

                if (mode === 'daily') {
                    await loadDailyLeaderboard();
                    if (!isCurrent()) return;
                }

                // Load questions (works with or without user).
                // Pass the RESOLVED user id explicitly - the `userId` state is
                // still null inside this closure (stale-closure bug that used
                // to silently skip the 60-day no-repeat exclusion).
                // Server-graded runs get their questions from the session at
                // start time instead (startGame) - pre-loading here would burn
                // 60-day pool entries for questions never actually served.
                if (serverGraded) {
                    setQuestions([]);
                } else {
                    const loadedQuestions = await loadQuestions(mode, modeConfig.questionsCount, currentUserId);
                    if (!isCurrent()) return;
                    if (loadedQuestions.length === 0) {
                        setError('No Questions Available. Please Try Again Later.');
                        setGameState('error');
                        return;
                    }

                    setQuestions(sortByDifficulty(shuffleOptions(loadedQuestions)));
                }

                // Load leaderboard for arcade
                if (mode === 'arcade') {
                    await loadLeaderboard();
                    if (!isCurrent()) return;
                }

                // Load community accuracy for ghost opponent
                try {
                    const { data: accuracyData } = await supabase
                        .from('trivia_scores')
                        .select('correct_count, total_questions')
                        .limit(100);
                    if (!isCurrent()) return;
                    if (accuracyData && accuracyData.length >= 5) {
                        const totalCorrect = accuracyData.reduce((s, r) => s + (r.correct_count || 0), 0);
                        const totalQs = accuracyData.reduce((s, r) => s + (r.total_questions || 0), 0);
                        if (totalQs > 0) setCommunityAccuracy(totalCorrect / totalQs);
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                if (isCurrent()) setGameState('ready');
            } catch (err) {
                console.warn('Error initializing trivia:', err);
                if (!isCurrent()) return;
                setError('Failed To Load Trivia. Please Try Again.');
                setGameState('error');
            }
        }

        initialize();
        return () => { cancelled = true; };
    }, [mode, modeConfig, avatarUser?.id, authLoading]);
    // Realtime subscription - live updates. Only the daily page renders the
    // daily leaderboard, so don't run the 2-query pipeline for other modes.
    useEffect(() => {
        if (!userId || mode !== 'daily') return;
        const _ch = supabase
            .channel(`trivia-mode:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_trivia_plays', filter: `user_id=eq.${userId}` }, () => { loadDailyLeaderboard(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId, mode]);

    async function getUserDiamonds(userId) {
        if (!userId) return 0;
        const { data } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
        return data?.diamonds || 0;
    }

    async function loadQuestions(mode, count, uid) {
        const today = getTodayCST();

        // Determine which categories this mode uses
        const categories = CATEGORY_MAP[mode];

        // ═══════════════════════════════════════════════════════════
        // STEP 0: Fetch user's 60-day question history to prevent repeats.
        // GLOBAL exclusion (no mode filter) - a question answered in one
        // mode must not reappear in another within 60 days. Limit raised to
        // 2000 rows so an active player's full 60-day history is covered.
        // ═══════════════════════════════════════════════════════════
        let excludedSet = new Set();
        if (uid) {
            const excludeArray = await getRecentlySeenIds(supabase, uid, 2000);
            excludeArray.forEach(id => excludedSet.add(id));
        }

        // ═══════════════════════════════════════════════════════════
        // STEP 1: Try to load today's daily-tagged questions
        // All users get the same 20 questions per category per day
        // Phase 55: also enforce quality_score >= MIN_QUALITY_SCORE so reported-bad
        //           and unclear questions never land on the daily roster.
        // ═══════════════════════════════════════════════════════════
        let dailyQuery = supabase
            .from('trivia_questions')
            .select('*')
            .eq('daily_date', today)
            .gte('quality_score', MIN_QUALITY_SCORE);

        // Filter by categories if mode is category-specific
        if (categories && categories.length > 0) {
            dailyQuery = dailyQuery.in('category', categories);
        }

        const { data: dailyQuestions } = await dailyQuery;

        if (dailyQuestions) {
            // Filter out questions the user has seen in the last 60 days
            const filteredDaily = dailyQuestions.filter(q => !excludedSet.has(q.id));
            if (filteredDaily.length >= count) {
                // Shuffle daily questions so order isn't predictable by category
                return shuffleArray(filteredDaily).slice(0, count);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // STEP 2: Fallback - random-offset pool fetch + seeded daily shuffle
        // Phase 55: was using .limit(1500) without offset which always pulled
        //           the same first-1500 by Postgres-internal order. With 8675+
        //           questions in the pool, ~7000 were never reachable. Now uses
        //           fetchRandomQuestionPool() to pull a different page each run.
        // ═══════════════════════════════════════════════════════════
        const poolQuestions = await fetchRandomQuestionPool(supabase, {
            category: categories,
            pageSize: 1500,
        });

        if (!poolQuestions || poolQuestions.length === 0) {
            return getFallbackQuestions(count);
        }

        // Apply quality floor + 60-day seen exclusion
        const qualityPool = poolQuestions.filter(
            q => typeof q.quality_score !== 'number' || q.quality_score >= MIN_QUALITY_SCORE,
        );
        let filteredPool = qualityPool.filter(q => !excludedSet.has(q.id));

        // Tier-1 fallback: if seen-exclusion empties the pool, drop the seen
        // filter but KEEP the quality floor - never let qs<6 questions through.
        if (filteredPool.length < count && qualityPool.length >= count) {
            filteredPool = qualityPool;
        }
        // Tier-2 fallback: pool-health emergency - only then drop quality floor.
        if (filteredPool.length < count && poolQuestions.length >= count) {
            filteredPool = poolQuestions;
        }

        // Use date-seeded shuffle for daily-consistent question selection
        return seededShuffle(filteredPool, today).slice(0, count);
    }

    // Simple Fisher-Yates shuffle
    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Date-seeded shuffle for consistent daily questions
    function seededShuffle(array, dateString) {
        const arr = [...array];
        // Create a simple hash from the date string
        let seed = 0;
        for (let i = 0; i < dateString.length; i++) {
            seed = ((seed << 5) - seed) + dateString.charCodeAt(i);
            seed = seed & seed; // Convert to 32-bit integer
        }

        // Seeded random function
        const seededRandom = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        // Fisher-Yates shuffle with seeded random
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Sort questions by difficulty: easy → medium → hard (random order within each tier)
    function sortByDifficulty(questions) {
        const order = { easy: 0, medium: 1, hard: 2 };
        return [...questions].sort((a, b) => {
            const da = order[a.difficulty] ?? 1; // default to medium if missing
            const db = order[b.difficulty] ?? 1;
            return da - db;
        });
    }

    /**
     * Arcade leaderboard.
     *
     * `filter` is 'today' | 'week'. LeaderboardDisplay only renders its range
     * tabs when an onFilterChange handler is supplied, so without this the tabs
     * were dead UI. 'week' widens the play_date predicate to a gte() over the
     * last 7 CST days instead of an exact-day eq().
     */
    async function loadLeaderboard(filter = 'today') {
        const range = filter === 'week' ? 'week' : 'today';
        const today = getTodayCST();

        let query = supabase
            .from('trivia_scores')
            .select('*')
            .eq('mode', 'arcade');

        if (range === 'week') {
            const start = new Date(`${today}T00:00:00`);
            start.setDate(start.getDate() - 6); // today + the 6 days before it
            const weekStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
            query = query.gte('play_date', weekStart);
        } else {
            query = query.eq('play_date', today);
        }

        const { data, error: lbErr } = await query.order('score', { ascending: false }).limit(10);
        if (lbErr) {
            console.warn('[Trivia] Leaderboard load failed:', lbErr.message);
            return;
        }
        setLeaderboardFilter(range);
        setLeaderboard(data || []);
    }

    async function loadDailyAccountState(accountId) {
        if (!accountId) return null;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== accountId) return null;
        const request = ++dailyStatusRequestRef.current;
        setDailyStatus('loading');
        setDailyStatusError(null);
        try {
            const today = getTodayCST();
            const [streakResponse, playResponse] = await Promise.all([
                supabase
                    .from('trivia_streaks')
                    .select('current_streak, best_streak, last_play_date')
                    .eq('user_id', accountId)
                    .maybeSingle(),
                supabase
                    .from('daily_trivia_plays')
                    .select('id')
                    .eq('user_id', accountId)
                    .eq('played_date', today)
                    .limit(1),
            ]);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return null;
            if (streakResponse.error) throw streakResponse.error;
            if (playResponse.error) throw playResponse.error;
            const projection = {
                currentStreak: Math.max(0, Number(streakResponse.data?.current_streak) || 0),
                bestStreak: Math.max(0, Number(streakResponse.data?.best_streak) || 0),
                lastPlayDate: streakResponse.data?.last_play_date || null,
                completed: (playResponse.data || []).length > 0,
            };
            if (request !== dailyStatusRequestRef.current) return null;
            setUserStreak(projection.currentStreak);
            setBestStreak(projection.bestStreak);
            setLastPlayDate(projection.lastPlayDate);
            setDailyDiamondsClaimed(projection.completed);
            setDailyStatus('ready');
            return projection;
        } catch (err) {
            console.warn('[Daily Trivia] Attempt status load failed:', err?.message || err);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return null;
            if (request !== dailyStatusRequestRef.current) return null;
            setDailyStatusError('Your Daily attempt status could not be verified.');
            setDailyStatus('error');
            return null;
        }
    }

    async function loadDailyLeaderboard() {
        const request = ++dailyLeaderboardRequestRef.current;
        setDailyLeaderboardState('loading');
        setDailyLeaderboardError(null);
        try {
            // trivia_streaks.user_id references auth.users, not profiles, so
            // usernames are fetched in a second explicit read.
            const { data: streakData, error: streakError } = await supabase
                .from('trivia_streaks')
                .select('user_id, current_streak, best_streak')
                .order('current_streak', { ascending: false })
                .limit(10);
            if (streakError) throw streakError;

            const rows = streakData || [];
            if (rows.length === 0) {
                if (request === dailyLeaderboardRequestRef.current) {
                    setDailyLeaderboard([]);
                    setDailyLeaderboardState('ready');
                }
                return [];
            }

            const userIds = rows.map(s => s.user_id);
            const [profilesResponse, scoresResponse] = await Promise.all([
                supabase.from('profiles').select('id, username').in('id', userIds),
                supabase
                    .from('trivia_scores')
                    .select('user_id, correct_count, total_questions')
                    .eq('mode', 'daily')
                    .in('user_id', userIds),
            ]);
            if (profilesResponse.error) throw profilesResponse.error;
            if (scoresResponse.error) throw scoresResponse.error;

            const usernameMap = {};
            (profilesResponse.data || []).forEach(p => { usernameMap[p.id] = p.username; });
            const accuracyMap = {};
            const gamesMap = {};
            (scoresResponse.data || []).forEach(score => {
                if (!accuracyMap[score.user_id]) {
                    accuracyMap[score.user_id] = { correct: 0, total: 0 };
                    gamesMap[score.user_id] = 0;
                }
                accuracyMap[score.user_id].correct += Number(score.correct_count) || 0;
                accuracyMap[score.user_id].total += Number(score.total_questions) || 0;
                gamesMap[score.user_id] += 1;
            });

            const next = rows.map(streakRow => {
                const aggregate = accuracyMap[streakRow.user_id];
                return {
                    userId: streakRow.user_id,
                    username: usernameMap[streakRow.user_id] || 'Player',
                    streak: streakRow.current_streak || 0,
                    bestStreak: streakRow.best_streak || 0,
                    accuracy: aggregate?.total > 0 ? Math.round((aggregate.correct / aggregate.total) * 100) : 0,
                    gamesPlayed: gamesMap[streakRow.user_id] || 0,
                };
            });
            if (request !== dailyLeaderboardRequestRef.current) return null;
            setDailyLeaderboard(next);
            setDailyLeaderboardState('ready');
            return next;
        } catch (err) {
            console.warn('[Daily Trivia] Leaderboard load failed:', err?.message || err);
            if (request !== dailyLeaderboardRequestRef.current) return null;
            setDailyLeaderboard([]);
            setDailyLeaderboardError('Verified standings are temporarily unavailable.');
            setDailyLeaderboardState('error');
            return null;
        }
    }

    function getFallbackQuestions(count) {
        const fallbacks = [
            {
                id: 'fb1',
                category: 'poker_history',
                difficulty: 'medium',
                question: 'In what year was the first World Series of Poker Main Event held?',
                options: ['1968', '1970', '1972', '1975'],
                correct_index: 1,
                explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas.'
            },
            {
                id: 'fb2',
                category: 'player_profiles',
                difficulty: 'easy',
                question: 'Which player holds the record for most WSOP bracelets?',
                options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
                correct_index: 2,
                explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets.'
            },
            {
                id: 'fb3',
                category: 'rule_knowledge',
                difficulty: 'easy',
                question: 'In Texas Hold\'em, how many community cards are dealt in total?',
                options: ['3', '4', '5', '7'],
                correct_index: 2,
                explanation: 'Five community cards are dealt: 3 on the flop, 1 on the turn, and 1 on the river.'
            },
            {
                id: 'fb4',
                category: 'gto_theory',
                difficulty: 'hard',
                question: 'What does MDF stand for in GTO poker strategy?',
                options: ['Maximum Defense Frequency', 'Minimum Defense Frequency', 'Mean Defensive Fold', 'Marginal Defense Factor'],
                correct_index: 1,
                explanation: 'MDF (Minimum Defense Frequency) tells you how often to call to prevent opponent from profitably bluffing.'
            },
            {
                id: 'fb5',
                category: 'famous_hands',
                difficulty: 'medium',
                question: 'What is the "Dead Man\'s Hand" in poker?',
                options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'],
                correct_index: 1,
                explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights.'
            }
        ];

        return shuffleArray(fallbacks).slice(0, count);
    }

    const isMountedRef = useRef(true);
    useEffect(() => () => { isMountedRef.current = false; }, []);

    const isStartingRef = useRef(false); // Prevent double-click race
    const startGame = async () => {
        if (isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== resolvedAccountId
            || operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        if (startRetryRef.current) {
            soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'daily', retry_kind: 'start' });
            startRetryRef.current = false;
        }
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        setIsStarting(true); // visible pressed/loading state on the lobby
        try {
        savePhaseRef.current = 0;
        cappedRewardRef.current = null;
        firstDailyTodayRef.current = null;
        scoreIdRef.current = null;
        setWheelPrize(null);
        setWheelError(null);

        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so the only thing it could still do was let
        // a stale flag from an old session buy a free entry. The correct
        // behaviour is to always charge here; TriviaLobby no longer pre-charges.

        // Check mode config for diamond cost - only modes with diamondCost > 0 charge
        const modeConfig = TRIVIA_MODES[mode];
        const modeCost = modeConfig?.diamondCost || 0;
        const isFreeMode = modeCost === 0;

        if (mode === 'daily' && !userId) {
            router.push('/auth/login?redirect=/hub/trivia/daily');
            return;
        }
        if (serverGraded && !userId) {
            // Durable start/settlement custody is account-scoped for every
            // solo server-graded mode, including the free History, Rules and
            // Pro rooms. Do not let those modes fall into a generic storage
            // error after the player presses Start.
            setError('Please Sign In To Play This Mode.');
            setGameState('error');
            return;
        }
        if (mode === 'daily' && (!isOnline || dailyStatus !== 'ready')) {
            setDailyStatusError(!isOnline
                ? 'Reconnect before starting a server-verified Daily run.'
                : 'Your Daily attempt status must be verified before starting.');
            setDailyStatus('error');
            return;
        }

        // AUDIT FIX (M3): the charge below is gated on `userId`, so a
        // signed-out visitor slipped past it and played PAID modes for free.
        // Mirror StrategyTrivia: paid entry requires a signed-in account.
        if (!isFreeMode && !userId && !isVIP) {
            setError('Please Sign In To Play This Mode.');
            setGameState('error');
            return;
        }

        // Server-graded run: open the session BEFORE any charge so a failed
        // start never costs the player anything. The server deals (and
        // permutes) the questions - no sortByDifficulty / shuffleOptions here,
        // reshuffling would break the display-index mapping the grader uses.
        if (serverGraded) {
            try {
                const started = await serverRun.start({ count: modeConfig.questionsCount });
                if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                const startedQuestions = Array.isArray(started?.questions) ? started.questions : [];
                soloJourneyTrackerRef.current.beginRun(started?.sessionId);
                soloRunLifecycleRef.current = { active: true, settled: false, mode, state: 'playing' };
                setQuestions(startedQuestions);
                const resumeProjection = mode === 'daily'
                    ? projectDailyResume(startedQuestions)
                    : { questionIndex: 0, answers: [], verdicts: {}, correctCount: 0, streak: 0, complete: false };
                if (mode === 'daily') setDailyResumeSeed(resumeProjection);
                if (Number.isFinite(started.newBalance)) setUserDiamonds(started.newBalance);
                if (started.entryState === 'charged' && started.entryCost > 0) {
                    busEmit.diamondsSpent(started.entryCost, `Trivia ${mode} entry`);
                }
                if (mode === 'daily' && started.resumed && resumeProjection.complete) {
                    await handleComplete({
                        answers: resumeProjection.answers,
                        correctCount: resumeProjection.correctCount,
                        totalQuestions: startedQuestions.length,
                        skippedCount: resumeProjection.answers.filter(answer => answer < 0).length,
                        timeSpent: 0,
                        timeRemaining: 0,
                    }, startedQuestions);
                    return;
                }
            } catch (e) {
                console.warn('[mode] Server-graded session start failed:', e?.message || e);
                if (!accountOperationScopeRef.current.isCurrent(operationScope)
                    || isStaleAccountOperation(e)) return;
                startRetryRef.current = true;
                if (e?.status === 402) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                setError(e?.status === 401
                    ? 'Please Sign In To Start This Server-Verified Run.'
                    : 'Could Not Start The Game. Please Try Again.');
                setGameState('error');
                return;
            }
        }

        setGameState('playing');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsStarting(false);
            }
        }
    };

    async function handleComplete(gameResult, questionSet = questions, recoveredSettlement = null) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const isCurrentAccountOperation = () => accountOperationScopeRef.current.isCurrent(operationScope);
        setGameState('saving');
        if (soloRunLifecycleRef.current.active) soloRunLifecycleRef.current.state = 'settling';
        const {
            correctCount, totalQuestions, timeSpent, timeRemaining, answers,
            stakePot = 0, cashedOut = false,
            // TriviaGame now scores a BOUGHT SKIP as neutral: it is excluded
            // from totalQuestions and reported separately here.
            skippedCount = 0,
            opponentScore = null, opponentName = null,
            streak: gameStreak = 0,
        } = gameResult;

        // Server-graded runs: the server regrades the recorded sequence and
        // pays the reward inside award_trivia_run - the client submits the
        // display-index answers and adopts the server's numbers wholesale.
        // On failure, fall into the saving_error retry state WITHOUT any
        // client-side crediting; a retry re-submits the same session.
        let serverResult = recoveredSettlement;
        let projectionWarning = null;
        if (serverGraded && !serverResult) {
            try {
                const idAnswers = (gameResult.answers || [])
                    .map((a, i) => ({
                        questionId: questionSet[i]?.id,
                        displayIndex: (typeof a === 'number' && a >= 0) ? a : -1
                    }))
                    .filter(x => typeof x.questionId === 'string');
                serverResult = await serverRun.submit(idAnswers, { cashedOut: gameResult.cashedOut === true });
                if (!isCurrentAccountOperation()) return;
            } catch (e) {
                console.warn('[mode] Server-graded submit failed:', e?.message || e);
                if (!isCurrentAccountOperation() || isStaleAccountOperation(e)) return;
                soloJourneyTrackerRef.current.track(mode, 'settlement', {
                    surface: 'daily',
                    settlement_outcome: 'failed',
                });
                setSaveErrorPayload(gameResult);
                setGameState('saving_error');
                return;
            }
        }
        const useServerPayout = serverGraded && serverResult != null;
        // Effective score numbers - the server's when it graded the run, the
        // client's (verdict-counted by TriviaGame) otherwise.
        const authoritativeTotal = serverResult?.total == null ? null : Number(serverResult.total);
        const effCorrectCount = useServerPayout ? (Number(serverResult.correct) || 0) : correctCount;
        // Zero is a valid authoritative denominator when every served
        // question was voided. Never replace it with the client roster size.
        const effTotalQuestions = useServerPayout && Number.isFinite(authoritativeTotal)
            ? Math.max(0, Math.floor(authoritativeTotal))
            : totalQuestions;
        const runScore = useServerPayout
            ? (Number(serverResult.score) || 0)
            : correctCount * 100 + (timeRemaining || 0) * 2;

        // Calculate rewards with streak multiplier.
        // Arcade is a STAKES mode unconditionally - the pot IS the reward. The
        // old `stakePot > 0` qualifier meant a busted run (pot 0) fell through
        // to calculateDiamonds and still paid the full 25 + 15 perfect bonus,
        // which made deliberately busting the pot strictly +EV.
        const isStakesMode = mode === 'arcade';
        const baseDiamonds = isStakesMode ? 0 : calculateDiamonds(mode, correctCount, totalQuestions, timeRemaining);
        const streakTier = getStreakTier(userStreak);
        // AUDIT FIX (H1, partial): the client-computed stake pot could reach
        // ~698 diamonds on a perfect 20-question run (STAKE_VALUES × up to 5x streak
        // multiplier) for a 10 diamonds entry, and the daily-cap clamp below used to
        // exempt arcade entirely - DAILY_DIAMOND_CAPS.arcade (40, documented
        // as "max single run 50") was never enforced on the only arcade
        // payout path. Clamp a single run to 50 here, and let the daily cap
        // apply to arcade too (next block). NOTE: this is harm reduction only
        // - the pot is still computed and credited client-side, so the REAL
        // fix is server-side grading/crediting (e.g. /api/trivia/submit).
        const ARCADE_MAX_RUN_PAYOUT = 50;
        const rawDiamonds = useServerPayout
            // award_trivia_run already recomputed the pot from the recorded
            // answer sequence, capped it and credited it - adopt its number
            // so the result screen agrees with the paid balance.
            ? Math.max(0, Math.floor(Number(serverResult.diamondsAwarded) || 0))
            : isStakesMode
                ? Math.min(ARCADE_MAX_RUN_PAYOUT, Math.max(0, Math.floor(Number(stakePot) || 0)))
                : calculateRewardWithMultiplier(baseDiamonds, userStreak);

        // Daily earnings cap - closes the diamond-farming loop (replay
        // memorized questions for unlimited diamonds). AUDIT FIX (H1): arcade
        // stake-pot payouts are no longer exempt; they clamp against
        // DAILY_DIAMOND_CAPS.arcade like every other reward.
        let diamondsEarned = rawDiamonds;
        let capReached = false;
        // Server payouts are already capped server-side - never re-clamp them.
        if (!useServerPayout && userId && rawDiamonds > 0 && (isStakesMode || (modeConfig?.diamondCost || 0) === 0)) {
            if (cappedRewardRef.current == null) {
                try {
                    const earnedToday = await getDailyDiamondsEarned(supabase, userId, mode);
                    if (!isCurrentAccountOperation()) return;
                    // DAILY_DIAMOND_CAPS in triviaEngine is the single source of
                    // truth (it was re-balanced per mode in Phase 80). The local
                    // "two perfect runs" heuristic disagreed with it, so the
                    // lobby and the payout advertised different ceilings.
                    const engineCap = DAILY_DIAMOND_CAPS[mode];
                    const modeDailyCap = Number.isFinite(engineCap)
                        ? engineCap
                        : Math.max(20, ((modeConfig?.diamondReward || 0) + (modeConfig?.perfectBonus || 0)) * 2);
                    cappedRewardRef.current = clampToCap(earnedToday, rawDiamonds, modeDailyCap);
                } catch (e) {
                    console.warn('[mode] Daily cap check failed, awarding uncapped:', e);
                    if (!isCurrentAccountOperation()) return;
                    cappedRewardRef.current = rawDiamonds;
                }
            }
            diamondsEarned = cappedRewardRef.current;
            capReached = diamondsEarned < rawDiamonds;
        }

        // Check for perfect score (100% correct)
        const isPerfect = effCorrectCount === effTotalQuestions && effTotalQuestions > 0;
        setIsPerfectScore(isPerfect);

        // Trigger celebration effects
        if (isPerfect) {
            celebrations.triggerPerfect();
        } else if (effCorrectCount > 0) {
            celebrations.triggerConfetti();
        }

        // Daily streaks can consume a server-owned streak shield, so calendar
        // arithmetic in the browser cannot determine the settled value. Keep
        // the last verified value until the authoritative projection reloads.
        const today = getTodayCST();
        if (firstDailyTodayRef.current == null) {
            firstDailyTodayRef.current = mode === 'daily' && !dailyDiamondsClaimed && lastPlayDate !== today;
        }
        const firstDailyToday = firstDailyTodayRef.current;
        let newStreak = userStreak;

        // Daily trivia: award 10 diamonds for finishing all 10 questions (once per day).
        // AUDIT FIX (M1): gate on the SERVED question count, not on
        // `totalQuestions` - TriviaGame excludes bought skips from
        // totalQuestions (19 after one skip), so paying for a Skip hint used
        // to silently forfeit the completion bonus for the whole day (the
        // daily_trivia_plays row was still written, making it unrecoverable).
        let dailyBonusDiamonds = 0;
        if (useServerPayout) {
            // Server-graded runs: the server pays the completion bonus itself and
            // reports the amount (/api/trivia/session-submit dailyBonusAwarded).
            // The browser-side add_diamonds_to_balance credit has been dead since
            // 2026-08-03, so the client must never compute (or try to credit) its
            // own figure for a server-graded run - it only displays what was paid.
            dailyBonusDiamonds = Number(serverResult?.dailyBonusAwarded) || 0;
            if (dailyBonusDiamonds > 0) {
                setDailyDiamondsClaimed(true);
            }
        } else if (firstDailyToday && questionSet.length >= (modeConfig?.questionsCount || 10)) {
            // Threshold was a hard-coded 20 from the old roster size; the daily
            // roster is now 10 questions, so ">= 20" could never pass.
            dailyBonusDiamonds = 10;
            setDailyDiamondsClaimed(true);
        }

        // Save results to database
        if (userId) {
            try {
                // Phase 1: session-submit persisted the verified score in the
                // same transaction as the session close and payout. The
                // returned id is the only valid prize-wheel token; browsers no
                // longer have INSERT permission on trivia_scores.
                if (savePhaseRef.current < 1) {
                    if (!useServerPayout) {
                        throw new Error('verified_score_missing');
                    }
                    // A settlement response is terminal even if an optional
                    // projection id is absent. Never retry the paid settlement
                    // because a downstream receipt/prize token was incomplete.
                    scoreIdRef.current = serverResult?.receipt?.scoreId || serverResult?.scoreId || null;
                    if (!scoreIdRef.current) projectionWarning = 'The score record reference is not available for this receipt.';
                    savePhaseRef.current = 1;
                }

                // Phase 2: Award diamonds (only if not already awarded).
                // Server-graded runs were already paid server-side by
                // award_trivia_run - crediting here again would double-pay,
                // so only surface the toast and sync the balance.
                if (savePhaseRef.current < 2) {
                    if (useServerPayout) {
                        if ((Number(serverResult.diamondsAwarded) || 0) > 0) {
                            busEmit.diamondsEarned(Number(serverResult.diamondsAwarded) || 0, `Trivia ${mode}`);
                        }
                        const settledBalance = serverResult.newBalance == null
                            ? null
                            : Number(serverResult.newBalance);
                        if (Number.isFinite(settledBalance)) {
                            if (isMountedRef.current && isCurrentAccountOperation()) {
                                // Zero is a valid authoritative post-settlement
                                // balance; never replace it with the stale
                                // pre-settlement client value.
                                setUserDiamonds(settledBalance);
                            }
                        } else {
                            // newBalance missing from the response - fall back
                            // to a fresh profiles read for the header display.
                            try {
                                const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                                if (!isCurrentAccountOperation()) return;
                                if (profile && isMountedRef.current) setUserDiamonds(profile.diamonds || 0);
                            } catch (refreshError) {
                                console.warn('[mode] Settled balance refresh failed:', refreshError?.message || refreshError);
                                if (!isCurrentAccountOperation()) return;
                                projectionWarning = 'The run settled, but the displayed balance could not be refreshed.';
                            }
                        }
                    }
                    // There is deliberately NO else branch. Every mode this
                    // page serves is in SERVER_GRADED_PAGE_MODES, so the
                    // server has already paid via award_trivia_run. The old
                    // fallback credited from the browser, which has been
                    // impossible since the credit RPC lost authenticated
                    // EXECUTE on 2026-08-03 - and leaving it here meant one
                    // gate edit could resurrect a client-side mint path.
                    // A mode that is ever removed from the gate must get a
                    // server payout route, not a client credit.
                    savePhaseRef.current = 2;
                }

                // Question history, category mastery, skip telemetry and the
                // one-per-day play row are finalized inside the same database
                // transaction that stores settlement_result. Browsers retain
                // read-only access to those projections and never replay or
                // manufacture analytics writes.
                savePhaseRef.current = 5;
            } catch (err) {
                console.warn('[mode] Failed to save data:', err);
                if (!isCurrentAccountOperation()) return;
                // session-submit is the only retryable settlement boundary.
                // Once it returns success, a projection/read failure must not
                // attempt to submit the closed session again.
                if (!serverResult?.sessionId) {
                    setSaveErrorPayload(gameResult);
                    setGameState('saving_error');
                    return;
                }
                projectionWarning = 'The run settled, but some account details could not be refreshed.';
            }
        }

        if (mode === 'daily' && userId) {
            const authoritativeDaily = await loadDailyAccountState(userId);
            if (!isCurrentAccountOperation()) return;
            if (authoritativeDaily) {
                newStreak = authoritativeDaily.currentStreak;
            } else {
                projectionWarning = projectionWarning || 'The run settled, but the updated streak could not be loaded.';
            }
        }

        // Achievement evaluation - fires the (previously unreachable)
        // AchievementToast for newly unlocked achievements. Non-fatal.
        if (userId && typeof window !== 'undefined') {
            try {
                const { data: aggRows } = await supabase
                    .from('trivia_scores')
                    // computeTriviaStats also reads time_spent / play_date /
                    // created_at (speed, marathon, night-owl achievements).
                    .select('mode, score, correct_count, total_questions, diamonds_earned, time_spent, play_date, created_at')
                    .eq('user_id', userId)
                    .limit(1000);
                if (!isCurrentAccountOperation()) return;
                // ONE aggregator, shared with /hub/trivia/achievements. The
                // hand-rolled object here omitted categoryCorrect, the speed
                // fields and maxGamesInDay, so this toast and the achievements
                // page disagreed about what the same player had unlocked.
                const stats = computeTriviaStats(aggRows || [], {
                    best_streak: Math.max(bestStreak, newStreak),
                    current_streak: newStreak
                });
                const storageKey = `trivia_achievements_unlocked_${userId}`;
                let prevUnlocked = [];
                try { prevUnlocked = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (e) { prevUnlocked = []; }
                // checkNewUnlocks evaluates every predicate defensively - one
                // requirement that references a field we cannot compute client
                // side must not take the whole scan down.
                const newlyUnlocked = checkNewUnlocks(stats, prevUnlocked);
                if (newlyUnlocked.length > 0) {
                    localStorage.setItem(storageKey, JSON.stringify([...prevUnlocked, ...newlyUnlocked.map(a => a.id)]));
                    celebrations.triggerAchievement(newlyUnlocked[0]);
                }
            } catch (e) { console.warn('[Trivia] Achievement check failed:', e); }
        }

        if (!isMountedRef.current || !isCurrentAccountOperation()) return;
        const finalScore = runScore;
        const beatPersonalBest = personalBest != null && finalScore > personalBest;
        if (personalBest == null || finalScore > personalBest) setPersonalBest(finalScore);
        setResult({
            mode,
            correctCount: effCorrectCount,
            isPerfect,
            streakMultiplier: streakTier.multiplier,
            totalQuestions: effTotalQuestions,
            timeSpent,
            timeRemaining: timeRemaining || 0,
            diamondsEarned,
            rawDiamonds,
            capReached,
            beatPersonalBest,
            dailyBonusDiamonds,
            sessionId: useServerPayout ? (serverResult?.receipt?.sessionId || serverResult?.sessionId || null) : null,
            scoreId: useServerPayout ? (serverResult?.receipt?.scoreId || serverResult?.scoreId || null) : null,
            settlementReplayed: useServerPayout && serverResult?.replayed === true,
            voidedCount: useServerPayout ? Math.max(0, Number(serverResult?.voided) || 0) : 0,
            // Keep the server receipt byte-for-byte as the settlement evidence.
            // References, transaction ids, balance-after values, request id,
            // submission time and result hash must never be reconstructed from
            // browser-visible ids.
            receipt: useServerPayout && serverResult?.receipt && typeof serverResult.receipt === 'object'
                ? serverResult.receipt
                : null,
            projectionWarning,
            // Bought skips are scored neutral by TriviaGame: excluded from
            // totalQuestions, counted here so the result screen can say so.
            skippedCount,
            // Arcade is always a stakes mode now, and no other mode pays a time
            // bonus, so the award never contains one. Say so explicitly rather
            // than letting TriviaResult infer a bonus from timeRemaining that
            // the player did not actually receive.
            timeBonusAwarded: 0,
            streak: newStreak,
            // New addictive game mechanics data. For server-graded runs the
            // authoritative pot is what the server actually paid, not the
            // client's running total.
            stakePot: isStakesMode ? (useServerPayout ? diamondsEarned : stakePot) : 0,
            cashedOut,
            opponentScore,
            opponentName,
            // Review mode data. Server-graded questions never carry
            // correct_index; once the server has graded the run, its
            // perQuestion verdicts are the answer key for the review.
            questions: useServerPayout && Array.isArray(serverResult?.perQuestion)
                ? questionSet.map(q => {
                    const verdict = serverResult.perQuestion.find(v => v?.questionId === q?.id);
                    return Number.isInteger(verdict?.correctDisplayIndex)
                        ? { ...q, correct_index: verdict.correctDisplayIndex }
                        : q;
                })
                : questionSet,
            answers: gameResult.answers || [],
        });

        setGameState('results');
        if (useServerPayout) {
            soloJourneyTrackerRef.current.track(mode, 'settlement', {
                surface: 'daily',
                settlement_outcome: serverResult?.replayed === true ? 'replayed' : 'verified',
            });
            if (capReached) {
                soloJourneyTrackerRef.current.track(mode, 'cap', { surface: 'daily', cap_state: 'applied' });
            }
            soloJourneyTrackerRef.current.track(mode, 'completion', { surface: 'daily' });
            soloRunLifecycleRef.current = { active: false, settled: true, mode, state: 'settling' };
        }
        setSaveErrorPayload(null);
        savePhaseRef.current = 0; // Reset for next game

        // Reload daily leaderboard after completion
        if (mode === 'daily') {
            await loadDailyLeaderboard();
        }

        // Reload leaderboard for arcade
        if (mode === 'arcade') {
            await loadLeaderboard();
        }
    }

    // Retry function for network drops - resumes from where it left off
    const handleRetrySave = () => {
        soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'daily', retry_kind: 'settlement' });
        setGameState('saving');
        setSaveErrorPayload(null);
        handleComplete(saveErrorPayload || result); // savePhaseRef skips already-completed steps
    };

    const resumeDailyRun = async () => {
        if (mode !== 'daily' || isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        if (resumeRetryRef.current) {
            soloJourneyTrackerRef.current.track(mode, 'retry', { surface: 'daily', retry_kind: 'resume' });
            resumeRetryRef.current = false;
        }
        if (!userId) {
            router.push('/auth/login?redirect=/hub/trivia/daily');
            return;
        }
        if (!isOnline) {
            setError('Reconnect Before Resuming Your Daily Run.');
            setGameState('error');
            return;
        }
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        setIsStarting(true);
        setError(null);
        // Also supports a malformed client projection that the server still
        // considers valid: unmount the stale game, re-read the same durable
        // session and mount from its authoritative projection.
        setGameState('loading');
        try {
            const resumed = await serverRun.resume({ count: modeConfig.questionsCount });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            soloJourneyTrackerRef.current.beginRun(resumed?.sessionId);
            soloRunLifecycleRef.current = { active: true, settled: false, mode, state: 'playing' };
            if (resumed?.resumedSettlement && resumed.settlement) {
                await handleComplete({
                    answers: [],
                    correctCount: Number(resumed.settlement.correct) || 0,
                    totalQuestions: Number(resumed.settlement.total) || 0,
                    skippedCount: 0,
                    timeSpent: 0,
                    timeRemaining: 0,
                }, [], resumed.settlement);
                return;
            }
            const resumedQuestions = Array.isArray(resumed?.questions) ? resumed.questions : [];
            if (resumedQuestions.length === 0) throw new Error('resume_questions_missing');
            setQuestions(resumedQuestions);
            const resumeProjection = projectDailyResume(resumedQuestions);
            setDailyResumeSeed(resumeProjection);
            if (resumeProjection.complete) {
                await handleComplete({
                    answers: resumeProjection.answers,
                    correctCount: resumeProjection.correctCount,
                    totalQuestions: resumedQuestions.length,
                    skippedCount: resumeProjection.answers.filter(answer => answer < 0).length,
                    timeSpent: 0,
                    timeRemaining: 0,
                }, resumedQuestions);
                return;
            }
            setGameState('playing');
        } catch (resumeError) {
            console.warn('[Daily Trivia] Resume failed:', resumeError?.message || resumeError);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(resumeError)) return;
            resumeRetryRef.current = true;
            setError('Could Not Resume The Daily Run. Verify Your Connection And Try Again.');
            setGameState('error');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
                if (accountOperationScopeRef.current.isCurrent(operationScope)) setIsStarting(false);
            }
        }
    };

    const retryDailyLoad = async () => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        setError(null);
        setGameState('ready');
        if (userId) await loadDailyAccountState(userId);
        if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
        await loadDailyLeaderboard();
    };

    /**
     * Ask the SERVER for this run's prize before showing the wheel.
     *
     * fn_trivia_prize_wheel_spin (migration 120500) verifies the score row is
     * ours, perfect and recent, rolls the weighted prize, applies the streak
     * multiplier from trivia_streaks and credits diamonds (or inventory) in one
     * transaction - UNIQUE(score_id) makes a retry replay the same prize. The
     * wheel is then purely cosmetic: it spins to `prizeId` and reports back.
     */
    const openPrizeWheel = async () => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        setWheelError(null);
        const scoreId = scoreIdRef.current;
        if (!userId || !scoreId) {
            // No verifiable token (guest play, or the score insert failed).
            // Refuse rather than fall back to a client-rolled, client-credited
            // prize - that path is exactly the mint the RPC exists to close.
            setWheelError('The Prize Wheel Is Unavailable For This Run.');
            return;
        }
        try {
            const response = await authedFetch('/api/trivia/prize-wheel-spin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ scoreId })
            });
            const data = await response.json().catch(() => null);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            if (!response.ok) {
                const spinErr = new Error(data?.error || `wheel_request_failed_${response.status}`);
                spinErr.code = data?.error;
                throw spinErr;
            }
            if (!data || data.success === false) {
                setWheelError(
                    data?.error === 'spin_window_expired'
                        ? 'This Spin Has Expired.'
                        : 'Could Not Start The Prize Wheel. Please Try Again.'
                );
                return;
            }
            setWheelPrize({
                prizeId: data.prize_id || null,
                prizeAmount: Number.isFinite(Number(data.prize_amount)) ? Number(data.prize_amount) : null
            });
            setShowPrizeWheel(true);
        } catch (e) {
            console.warn('[PrizeWheel] spin request failed:', e?.message || e);
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            setWheelError(e?.code === 'spin_window_expired'
                ? 'This Spin Has Expired.'
                : 'Could Not Start The Prize Wheel. Please Try Again.');
        }
    };

    // openDoubleOrNothing (the unseen-question draw for the bonus round) was
    // removed with the wager. It only fed a modal that could not settle.

    const handlePlayAgain = async () => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        if (mode === 'arcade' && !isVIP && userDiamonds < (modeConfig?.diamondCost || 10)) {
            router.push('/hub/trivia');
            return;
        }
        setResult(null);
        scoreIdRef.current = null;
        setWheelPrize(null);
        setWheelError(null);
        cappedRewardRef.current = null; // Reset daily-cap cache
        firstDailyTodayRef.current = null; // Reset first-daily-today cache
        // Phase 55 fix: previously NOT reset here. If a prior game's save errored
        // mid-phase and the user navigated past the retry UI without retrying,
        // savePhaseRef stayed at the partial value (e.g. 2). The next game's
        // handleComplete would skip phases <= that value - meaning the user's
        // new score insert (phase 1) would be silently skipped on every
        // subsequent game until full page reload.
        savePhaseRef.current = 0;
        setSaveErrorPayload(null);
        setShowPrizeWheel(false);
        setWheelSpun(false);
        setIsPerfectScore(false);
        setDailyResumeSeed({ questionIndex: 0, answers: [], verdicts: {}, correctCount: 0, streak: 0 });

        // Re-fetch a FRESH question set. The previous behavior replayed the
        // identical questions with known answers (diamond-farming hole); the
        // just-finished game's history rows (phase 3) are now excluded too.
        setGameState('loading');
        if (!serverGraded) {
            try {
                const fresh = await loadQuestions(mode, modeConfig.questionsCount, userId);
                if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
                if (fresh && fresh.length > 0) {
                    setQuestions(sortByDifficulty(shuffleOptions(fresh)));
                }
            } catch (e) {
                console.warn('[mode] Play Again question refetch failed, reusing previous set:', e);
                if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
            }
        }
        if (isMountedRef.current && accountOperationScopeRef.current.isCurrent(operationScope)) setGameState('ready');
    };

    // AUDIT FIX (C1): survival is served by /hub/trivia/survival-game; the
    // redirect effect above is already in flight. Render nothing so the paid
    // lobby (and its Start charge) can never appear for this slug. This
    // return sits after all hooks, so hook order is stable across renders.
    if (isSurvivalSlug) return null;

    // While the router hydrates, show a skeleton instead of a blank flash
    if (!router.isReady) {
        return (
            <div className="trivia-console-standalone">
                <TriviaConsole title="Poker Trivia" eyebrow="Preparing Table" pill="Loading" titleAs="h1">
                    <TriviaSkeleton />
                </TriviaConsole>
            </div>
        );
    }

    // Unknown slug (typo'd deep link, removed mode) - friendly 404 instead of
    // a permanent blank page
    if (!mode || !modeConfig) {
        return (
            <div className="trivia-console-standalone">
                <TriviaConsole
                    title="Mode Not Found"
                    eyebrow="Trivia Directory"
                    subtitle="The Requested Table Is Unavailable"
                    pill="Closed"
                    titleAs="h1"
                    primaryAction={{ label: 'Back To Trivia', onClick: () => router.replace('/hub/trivia') }}
                >
                    <p className="trivia-console-copy">
                        That Trivia Mode Doesn't Exist. It May Have Been Renamed Or Retired.
                    </p>
                </TriviaConsole>
            </div>
        );
    }

    const modeName = toTitleCase(modeConfig.name || String(mode));
    const modeArt = getModeArt(mode);
    // The engine's description reads '20 Questions \u2022 Iconic moments, ...'.
    // The head's subtitle zone takes the short tag; a long one prints on the
    // glass instead of being fitted down to an unreadable size.
    const descriptionParts = String(modeConfig.description || '').split('\u2022').map(part => part.trim()).filter(Boolean);
    const modeTag = toTitleCase(descriptionParts.length > 1 ? descriptionParts.slice(1).join(', ') : (descriptionParts[0] || ''));
    const modeTagFitsHead = modeTag.length > 0 && modeTag.length <= 28;
    const isPaidMode = (modeConfig.diamondCost || 0) > 0;
    const dailyCap = DAILY_DIAMOND_CAPS?.[mode];
    const needsDiamonds = typeof error === 'string' && /Diamonds/.test(error);
    const backToTrivia = { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') };
    const showPlayAgain = gameState === 'results' && result && (mode === 'arcade' || mode !== 'daily');
    const startLabel = isStarting
        ? 'Starting'
        : mode === 'arcade'
            ? `Play ${modeConfig.diamondCost} Diamonds`
            : mode === 'daily'
                ? 'Start Daily'
                : 'Start Quiz';

    // Footer law: two painted plates only when the surface genuinely has two
    // actions, otherwise one lit word on the glass (the primitive decides).
    let consolePrimary;
    let consoleSecondary;
    if (gameState === 'ready') {
        consoleSecondary = backToTrivia;
        if (mode === 'daily' && !userId) {
            consolePrimary = { label: 'Sign In To Play', onClick: () => router.push('/auth/login?redirect=/hub/trivia/daily') };
        } else if (mode === 'daily' && serverRun.hasRecoverableSession) {
            consolePrimary = { label: isStarting ? 'Resuming' : 'Resume Run', onClick: resumeDailyRun, disabled: isStarting || !isOnline };
        } else if (mode === 'daily' && dailyStatus === 'error') {
            consolePrimary = { label: 'Retry Attempt Status', onClick: retryDailyLoad };
        } else {
            consolePrimary = {
                label: startLabel,
                onClick: startGame,
                disabled: isStarting || (mode === 'daily' && (!isOnline || dailyStatus !== 'ready')),
            };
        }
    } else if (gameState === 'results' && result) {
        consoleSecondary = showPlayAgain ? backToTrivia : undefined;
        consolePrimary = showPlayAgain
            ? { label: mode === 'arcade' ? `Play Again ${modeConfig.diamondCost || 10} Diamonds` : 'Play Again', onClick: handlePlayAgain }
            : backToTrivia;
    } else if (gameState === 'saving_error') {
        consolePrimary = { label: 'Retry Save', onClick: handleRetrySave };
    } else if (gameState === 'error') {
        consoleSecondary = backToTrivia;
        consolePrimary = needsDiamonds
            ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store'), tone: 'gold' }
            : mode === 'daily'
                ? { label: 'Try Again', onClick: retryDailyLoad }
                : { label: 'Try Again', onClick: () => window.location.reload() };
    }

    return (
        <TriviaErrorBoundary pageName={`Trivia - ${modeConfig?.name || mode}`}>
            <SEOHead
                title="Poker Trivia Game"
                description="Play Poker Trivia On Smarter.Poker. Test Your Knowledge Across Multiple Game Modes."
                canonical={mode === 'daily' ? '/hub/trivia/daily' : `/hub/trivia/${mode}`}
                noindex={true}
            />

            <div className={`trivia-mode-page ${mode === 'daily' ? 'trivia-daily-casino' : ''}`} data-mode={mode}>
                <UniversalHeader pageDepth={2} />
                {modeConfig && modeConfig.diamondCost > 0 && (
                    <GameCostPopup userId={userId} featureKey={`trivia_${mode}`} isVip={isVIP} cost={modeConfig.diamondCost} />
                )}

                <TriviaConsoleDialog
                    open={showOutOfDiamonds}
                    onClose={() => setShowOutOfDiamonds(false)}
                    eyebrow="Vault Access Required"
                    title="Out Of Diamonds"
                    subtitle="Add Diamonds To Enter This Table"
                    pill="Balance"
                    secondaryAction={{ label: 'Close', onClick: () => setShowOutOfDiamonds(false) }}
                    primaryAction={{ label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }}
                >
                    <p className="trivia-console-copy">
                        You Need {modeConfig?.diamondCost || 10} Diamonds To Play This Mode. Visit The Diamond Store To Get More.
                    </p>
                </TriviaConsoleDialog>

                <main className="content">
                    <TriviaConsole
                        eyebrow="Smarter Poker Trivia"
                        title={modeName}
                        subtitle={modeTagFitsHead ? modeTag : undefined}
                        pill={gameState === 'ready' && mode === 'daily' && serverRun.hasRecoverableSession ? 'Resume' : gameState === 'ready' ? 'Ready' : gameState === 'playing' ? 'Live' : gameState === 'results' ? 'Results' : gameState === 'saving' ? 'Saving' : gameState === 'saving_error' || gameState === 'error' ? 'Attention' : 'Loading'}
                        pillInk={gameState === 'saving_error' || gameState === 'error' ? 'red' : gameState === 'playing' ? 'green' : 'blue'}
                        titleAs="h1"
                        secondaryAction={consoleSecondary}
                        primaryAction={consolePrimary}
                    >
                    {gameState === 'loading' && (
                        <div className="loading">
                            <TriviaSkeleton />
                        </div>
                    )}

                    {gameState === 'saving' && (
                        <div className="saving">
                            <TriviaSkeleton label="Saving Your Results" />
                        </div>
                    )}

                    {/* Saving Error State (Retry UI) */}
                    {gameState === 'saving_error' && (
                        <div className="trivia-console-state" role="alert">
                            <h2>Network Disconnected</h2>
                            <p>
                                We Couldn't Save Your Trivia Results Because You Lost Connection. Please Check Your Internet And Try Again So You Don't Lose Your Progress!
                            </p>
                        </div>
                    )}

                    {gameState === 'error' && (
                        <div className="error-state trivia-console-state" role="alert">
                            {needsDiamonds
                                ? <h2 className="tc-ink--gold">Diamonds Needed</h2>
                                : <h2 className="tc-ink--red">Something Went Wrong</h2>}
                            <p>{error}</p>
                        </div>
                    )}

                    {gameState === 'ready' && (
                        <div className="ready-screen">
                            {mode === 'daily' ? (
                                <DailyTriviaBroadcast
                                    art={modeArt}
                                    signedIn={Boolean(userId)}
                                    online={isOnline}
                                    status={dailyStatus}
                                    statusError={dailyStatusError}
                                    completed={dailyDiamondsClaimed}
                                    recoverable={serverRun.hasRecoverableSession}
                                    tagline={modeTag}
                                    questionsCount={modeConfig.questionsCount}
                                    dailyCap={Number.isFinite(dailyCap) ? dailyCap : 10}
                                    userDiamonds={userDiamonds}
                                    userStreak={userStreak}
                                    bestStreak={bestStreak}
                                    personalBest={personalBest}
                                    leaderboardState={dailyLeaderboardState}
                                    leaderboard={dailyLeaderboard}
                                    leaderboardError={dailyLeaderboardError}
                                    currentUserId={userId}
                                    onRetryStatus={() => loadDailyAccountState(userId)}
                                    onRetryLeaderboard={loadDailyLeaderboard}
                                />
                            ) : (
                                <>
                                    {/* Other modes retain their existing art
                                        entrance. Daily's scene is deliberately
                                        passive; its semantic action lives in
                                        the console footer. */}
                                    {modeArt && (
                                        <button
                                            type="button"
                                            className="mode-art-button"
                                            onClick={startGame}
                                            disabled={isStarting}
                                            aria-label={`Start ${modeName}${isPaidMode ? `, Entry ${modeConfig.diamondCost} Diamonds` : ''}`}
                                        >
                                            <ResponsiveModeArt art={modeArt} priority />
                                        </button>
                                    )}

                                    {!modeTagFitsHead && modeTag ? (
                                        <p className="trivia-console-copy mode-tagline">{modeTag}</p>
                                    ) : null}

                                    <ul className="tc-rows mode-details">
                                        <li className="tc-row">
                                            <span className="tc-row__label">Questions</span>
                                            <span className="tc-row__value">{modeConfig.questionsCount}</span>
                                        </li>
                                        <li className="tc-row">
                                            <span className="tc-row__label">Clock</span>
                                            <span className="tc-row__value">
                                                {modeConfig.timeLimit
                                                    ? (modeConfig.timeLimit % 60 === 0 ? `${modeConfig.timeLimit / 60} Minutes` : `${modeConfig.timeLimit} Seconds`)
                                                    : 'Untimed'}
                                            </span>
                                        </li>
                                        <li className="tc-row">
                                            <span className="tc-row__label">Entry Cost</span>
                                            <span className={`tc-row__value ${isPaidMode ? 'tc-ink--gold' : 'tc-ink--green'}`}>
                                                {isPaidMode ? (isVIP ? 'Free For VIP' : `${modeConfig.diamondCost} Diamonds`) : 'Free'}
                                            </span>
                                        </li>
                                        {Number.isFinite(dailyCap) && (
                                            <li className="tc-row">
                                                <span className="tc-row__label">Daily Earning Cap</span>
                                                <span className="tc-row__value">{formatTriviaDisplayNumber(dailyCap)} Diamonds</span>
                                            </li>
                                        )}
                                        {userId && (
                                            <li className="tc-row">
                                                <span className="tc-row__label">Your Diamonds</span>
                                                <span className="tc-row__value tc-ink--gold">{formatTriviaDisplayNumber(userDiamonds)}</span>
                                            </li>
                                        )}
                                        {personalBest != null && (
                                            <li className="tc-row">
                                                <span className="tc-row__label">Your Best</span>
                                                <span className="tc-row__value">{formatTriviaDisplayNumber(personalBest)}</span>
                                            </li>
                                        )}
                                    </ul>

                                    <p className="trivia-console-copy mode-disclosure">
                                        {isPaidMode
                                            ? `Entry Is ${modeConfig.diamondCost} Diamonds, Charged Only When The Game Starts. VIP Members Play Free.`
                                            : 'Free To Play. Answers Are Graded By The Server As You Go.'}
                                    </p>
                                    {isStarting && (
                                        <p className="trivia-console-copy tc-ink--blue" role="status">Dealing In</p>
                                    )}

                                    {mode === 'arcade' && (
                                        <div className="leaderboard-section">
                                            <LeaderboardDisplay
                                                entries={leaderboard}
                                                currentUserId={userId}
                                                filter={leaderboardFilter}
                                                onFilterChange={(f) => loadLeaderboard(f)}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {gameState === 'playing' && mode !== 'survival' && (
                        <TriviaGame
                            questions={questions}
                            mode={mode}
                            initialQuestionIndex={mode === 'daily' ? dailyResumeSeed.questionIndex : 0}
                            initialAnswers={mode === 'daily' ? dailyResumeSeed.answers : null}
                            initialVerdicts={mode === 'daily' ? dailyResumeSeed.verdicts : null}
                            initialCorrectCount={mode === 'daily' ? dailyResumeSeed.correctCount : 0}
                            initialStreak={mode === 'daily' ? dailyResumeSeed.streak : 0}
                            timeLimit={modeConfig.timeLimit}
                            onComplete={handleComplete}
                            userDiamonds={userDiamonds}
                            enableHints={mode !== 'arcade'}
                            enableStakes={mode === 'arcade'}
                            enableGhostOpponent={mode !== 'daily' || dailyResumeSeed.questionIndex === 0}
                            ghostAccuracy={communityAccuracy}
                            // Per-answer server grading - null keeps the
                            // legacy client-keyed path byte-for-byte.
                            serverGrader={serverGraded ? (args) => serverRun.answer(args) : null}
                            // Reuse this page's out-of-diamonds modal when a hint
                            // is unaffordable - HintButtons otherwise only shows a
                            // transient inline notice with no route to the store.
                            onNeedDiamonds={() => setShowOutOfDiamonds(true)}
                            // Report Question needs a signed-in bearer token.
                            enableReport={Boolean(userId)}
                            reportToken={userId ? getAccessToken() : null}
                            reportSessionId={serverGraded ? serverRun.sessionId : null}
                            onQuestionReported={(report) => soloJourneyTrackerRef.current.track(mode, 'report', {
                                surface: 'daily',
                                report_outcome: report?.deduped === true ? 'deduped' : 'recorded',
                            })}
                            onRetry={(retryKind) => soloJourneyTrackerRef.current.track(mode, 'retry', {
                                surface: 'daily',
                                retry_kind: retryKind,
                            })}
                            onInvalidQuestionRefresh={mode === 'daily' ? resumeDailyRun : null}
                            // onDiamondsChange is deliberately NOT passed. It
                            // existed to settle hint purchases and stake
                            // deltas by crediting/debiting from the browser,
                            // which stopped being possible when the credit RPC
                            // lost authenticated EXECUTE on 2026-08-03. It is
                            // also unreachable: hints are force-disabled under
                            // serverGrader, and stake deltas are recomputed
                            // server-side from the recorded answer sequence.
                            // If hints ever return, they must settle through a
                            // server route (see /api/diamonds/spend), never here.
                        />
                    )}


                    {gameState === 'results' && result && (
                        <div className="results-section">
                            {result.beatPersonalBest && (
                                <p className="trivia-console-copy tc-ink--gold new-best-callout">New Personal Best!</p>
                            )}
                            {result.capReached && (
                                <p className="trivia-console-copy tc-ink--muted cap-callout">
                                    Daily Earning Cap Reached For This Mode. {formatTriviaDisplayNumber(result.diamondsEarned)} Of {formatTriviaDisplayNumber(result.rawDiamonds)} Diamonds Awarded. Come Back Tomorrow For Full Rewards!
                                </p>
                            )}
                            {result.skippedCount > 0 && (
                                <p className="trivia-console-copy tc-ink--muted cap-callout">
                                    {result.skippedCount === 1
                                        ? '1 Question Was Skipped And Scored Neutral. It Is Not Counted In Your Accuracy.'
                                        : `${result.skippedCount} Questions Were Skipped And Scored Neutral. They Are Not Counted In Your Accuracy.`}
                                </p>
                            )}
                            {result.projectionWarning && (
                                <p className="trivia-console-copy tc-ink--gold cap-callout" role="status">
                                    {result.projectionWarning}
                                </p>
                            )}
                            {wheelError && (
                                <p className="trivia-console-copy tc-ink--red cap-callout" role="alert">{wheelError}</p>
                            )}
                            <TriviaResult
                                {...result}
                                onPlayAgain={handlePlayAgain}
                                personalBest={personalBest}
                                showDailyBonusRow={mode === 'daily'}
                                onSpinWheel={openPrizeWheel}
                                showSpinButton={isPerfectScore && !showPrizeWheel && !wheelSpun}
                                // Back To Trivia and Play Again print on the
                                // console's own painted plates (footer law).
                                actionsInFooter
                                // onDoubleOrNothing / showDoubleButton are gone
                                // with the wager itself - see the removal note
                                // further down. They were held off with a
                                // `false &&` guard, which is one keystroke from
                                // re-offering a bet that cannot pay.
                            />

                            {mode === 'daily' ? <DailySettlementReceipt result={result} /> : null}

                            {mode === 'arcade' && (
                                <div className="leaderboard-section">
                                    <LeaderboardDisplay
                                            entries={leaderboard}
                                            currentUserId={userId}
                                            filter={leaderboardFilter}
                                            onFilterChange={(f) => loadLeaderboard(f)}
                                        />
                                </div>
                            )}

                            {/* Daily Trivia Bonus + Leaderboard */}
                            {mode === 'daily' && (
                                <div className="daily-results-section">
                                    {/* The daily-completion bonus is now a row in
                                        TriviaResult's reward breakdown
                                        (showDailyBonusRow) - rendering it here too
                                        showed the same diamonds twice. */}
                                    <DailyLeaderboard
                                        state={dailyLeaderboardState}
                                        entries={dailyLeaderboard}
                                        currentUserId={userId}
                                        error={dailyLeaderboardError}
                                        onRetry={loadDailyLeaderboard}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Double or Nothing is REMOVED, not merely hidden.
                        The wager settled by crediting a win (and debiting a
                        loss) straight from the browser, which stopped being
                        possible when the credit RPC lost authenticated EXECUTE
                        on 2026-08-03: a win could not be paid and a loss could
                        not be collected. It was first guarded off with a
                        `false &&`, but dead payout code one keystroke away from
                        live is exactly how a client-side mint gets resurrected,
                        so the JSX and both RPC calls are gone.
                        To bring the feature back: settle it server-side (grade
                        the double-or-nothing question through
                        /api/trivia/session-answer and pay from a route that
                        owns the amount, the way award_trivia_run does for a
                        run), then build a console dialog wired to that route.
                        The old DoubleOrNothing component had no importer left
                        and was removed with the console redesign. */}

                    {/* Prize Wheel - only shows on 100% perfect score */}
                    {showPrizeWheel && (
                        <PrizeWheel
                            streakMultiplier={getStreakTier(userStreak).multiplier}
                            prizeId={wheelPrize?.prizeId || null}
                            prizeAmount={wheelPrize?.prizeAmount ?? null}
                            onComplete={async () => {
                                // NO add_diamonds_to_balance here.
                                // fn_trivia_prize_wheel_spin already rolled the
                                // prize, applied the streak multiplier and
                                // credited it inside one transaction (see
                                // openPrizeWheel). Crediting again from the
                                // client would pay the prize twice AND let a
                                // tampered client name its own amount.
                                try {
                                    if (userId) {
                                        const { data: profile } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                                        if (profile && isMountedRef.current) setUserDiamonds(profile.diamonds || 0);
                                    }
                                } catch (e) {
                                    console.warn('[PrizeWheel] balance refresh failed:', e?.message || e);
                                }
                                if (!isMountedRef.current) return;
                                setWheelSpun(true); // one spin per game
                                setShowPrizeWheel(false);
                            }}
                            onClose={() => setShowPrizeWheel(false)}
                        />
                    )}

                    {/* Celebration Effects - called as a function (not <Component/>)
                        so React doesn't see a new component type each render and
                        unmount/remount the confetti mid-celebration */}
                    {celebrations.CelebrationComponents()}
                    </TriviaConsole>
                </main>
            </div>
        </TriviaErrorBoundary>
    );
}
