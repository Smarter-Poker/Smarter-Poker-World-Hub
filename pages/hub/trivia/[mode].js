/**
 * TRIVIA GAME PAGE - Individual mode gameplay
 * Route: /hub/trivia/[mode]
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
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
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { checkNewUnlocks, computeTriviaStats } from '../../../src/config/triviaAchievements';

import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { getRecentlySeenIds, fetchRandomQuestionPool, filterAndShuffle } from '../../../src/lib/triviaQuestionLoader';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';

// Phase 55 — gameplay quality floor. Questions tagged below this by the audit
// pipeline (qs=2 auto-demoted via 3-strike user reports, qs=4 unclear English,
// qs=5 legacy un-audited) are excluded from rotation here too.
const MIN_QUALITY_SCORE = 6;

// Phase 1 Enhancement Imports
import PrizeWheel from '../../../src/components/trivia/PrizeWheel';
import { useCelebrations } from '../../../src/components/trivia/CelebrationEffects';
import { getStreakTier, calculateRewardWithMultiplier } from '../../../src/config/triviaStreakSystem';

// Phase 2 Enhancement Imports
import DoubleOrNothing from '../../../src/components/trivia/DoubleOrNothing';
import { Gem } from 'lucide-react';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

// Category source of truth is triviaEngine's CATEGORY_MAPPINGS — do not
// re-declare category arrays here (three parallel maps had silently drifted).
// AUDIT FIX (C2): the old comment claimed mtt/cash/icm/gto had dedicated
// static pages shadowing this dynamic route — those pages do not exist, so
// /hub/trivia/mtt|cash|icm|gto resolve HERE. Without entries in this map,
// `categories` came back undefined and the paid strategy modes served
// questions from EVERY category. They now mirror the engine's canonical
// arrays. (mixed/endless/time-attack/pvp/tournaments DO have static pages;
// survival is redirected to /hub/trivia/survival-game — see C1 fix below.)
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

// Lobby image mapping — modes with full-bleed lobby images
const LOBBY_IMAGES = {
    history: '/images/trivia/lobby-history.jpg',
    rules: '/images/trivia/lobby-rules.jpg',
    pro: '/images/trivia/lobby-pro.jpg',
    daily: '/images/trivia/lobby-daily.jpg',
    arcade: '/images/trivia/lobby-arcade.jpg',
};

// crypto.randomUUID throws on Safari < 15.4 and non-secure contexts —
// fall back to a timestamp+random id so reward RPCs never hard-fail.
function genUUID() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) { /* fall through */ }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// Modes this page runs through the server-authoritative grading flow
// (session-start / session-answer / session-submit) instead of the
// client-keyed correct_index flow. This set ships EMPTY because the
// server-graded arcade path has NOT yet been validated by a live
// play-through: the routes, the migration and the RPC are all
// production-verified, but no end-to-end browser round has ever been
// played, so the path stays dark until someone plays one run at
// /hub/trivia/arcade?serverGrading=1. Flip this to ['arcade'] once that
// passes. The explicit ?serverGrading=1 query escape hatch stays
// available for modes not yet flipped.
const SERVER_GRADED_PAGE_MODES = new Set(['arcade', 'daily', 'history', 'rules', 'pro']);

// Yesterday in America/Chicago as YYYY-MM-DD (streak-continuation check)
function getYesterdayCST() {
    const cst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() - 1);
    return `${cst.getFullYear()}-${String(cst.getMonth() + 1).padStart(2, '0')}-${String(cst.getDate()).padStart(2, '0')}`;
}

export default function TriviaModePage() {
    useTrainingBus('trivia-mode');
    const router = useRouter();
    const { mode } = router.query;
    const { user: avatarUser, loading: authLoading } = useAvatar();

    // Server-authoritative grading (dark until SERVER_GRADED_PAGE_MODES is
    // flipped). The hook owns the session lifecycle; this flag picks which
    // branch the page runs — it must never half-adopt (see the hook's docs).
    const serverRun = useServerGradedRun(mode);
    const serverGraded = serverRun.isEnabled && (SERVER_GRADED_PAGE_MODES.has(mode) || router.query.serverGrading === '1');

    // ── AUDIT FIX (C1) ───────────────────────────────────────────────
    // 'survival' exists in TRIVIA_MODES (diamondCost: 10) but this page has
    // no renderer for it (`gameState === 'playing' && mode !== 'survival'`),
    // so a direct hit on /hub/trivia/survival showed a paid lobby, charged
    // 10 diamonds on Start, then rendered a blank game — charge without
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
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [error, setError] = useState(null);
    const [isVIP, setIsVIP] = useState(false);
    const [communityAccuracy, setCommunityAccuracy] = useState(null);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    // Daily trivia enhancements
    const [dailyDiamondsClaimed, setDailyDiamondsClaimed] = useState(false);
    const [dailyLeaderboard, setDailyLeaderboard] = useState([]);
    const [lastPlayDate, setLastPlayDate] = useState(null);

    // Personal best (per-mode) for the ready screen / results delta
    const [personalBest, setPersonalBest] = useState(null);
    const [isStarting, setIsStarting] = useState(false);

    // Phase 1: Prize wheel and celebration states
    const [showPrizeWheel, setShowPrizeWheel] = useState(false);
    const [wheelSpun, setWheelSpun] = useState(false);
    const [isPerfectScore, setIsPerfectScore] = useState(false);
    const celebrations = useCelebrations();

    // Server-resolved prize-wheel outcome ({ prizeId, prizeAmount }) — the wheel
    // only animates to it, it never decides or credits anything itself.
    const [wheelPrize, setWheelPrize] = useState(null);
    const [wheelError, setWheelError] = useState(null);

    // Phase 2: Double or Nothing state
    const [showDoubleOrNothing, setShowDoubleOrNothing] = useState(false);
    const [doubleAttempted, setDoubleAttempted] = useState(false);
    const [doubleQuestion, setDoubleQuestion] = useState(null);
    // Question ids already served this sitting — never repeat one in the
    // Double-or-Nothing bonus round.
    const sessionSeenIdsRef = useRef(new Set());

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=score, 2=diamonds, 3=history, 4=mastery, 5=daily

    // ── IDEMPOTENCY ────────────────────────────────────────────────────
    // add_diamonds_to_balance dedups on p_reference_id, so the reference must
    // be (a) STABLE across a saving_error retry of the SAME run, and (b) UNIQUE
    // across runs. The old map was keyed only by actionType and was cleared
    // only inside handlePlayAgain, so any other path back to 'ready' (a
    // re-`initialize()` from an auth/router change, a Play-Again on a different
    // mode, etc.) replayed the previous run's reference and the RPC silently
    // swallowed the whole reward. Anchoring every key to a per-RUN id — minted
    // in startGame(), exactly like endless.js mints gameRewardRefId — gives us
    // both properties with one ref.
    const gameRunIdRef = useRef(null);
    const newGameRunId = () => { gameRunIdRef.current = genUUID(); };
    const getIdempotencyKey = (actionType) => {
        if (!gameRunIdRef.current) newGameRunId();
        return `trivia_${mode}_${actionType}_${gameRunIdRef.current}`;
    };
    const masteryCacheRef = useRef(null);
    // id of THIS run's trivia_scores row — the prize wheel's server-side token.
    const scoreIdRef = useRef(null);
    // Caches the daily-cap-clamped reward so a saving_error retry doesn't
    // re-query the cap (phase 1's own score row would double-count).
    const cappedRewardRef = useRef(null);
    // Caches "is this the first daily completion today" so a saving_error
    // retry keeps the same answer (setDailyDiamondsClaimed(true) during the
    // first attempt would otherwise flip it and drop the bonus mid-retry).
    const firstDailyTodayRef = useRef(null);

    // Using existing supabase instance from lib
    const modeConfig = mode ? TRIVIA_MODES[mode] : null;

    // Load questions and user data
    useEffect(() => {
        if (!mode || !modeConfig) return;
        // AUDIT FIX (C1): survival is redirected to its own page — never
        // initialize (or later charge) for it here.
        if (mode === 'survival') return;
        // Wait for auth to finish loading before initializing
        if (authLoading) return;
        // AUDIT FIX (M4): this effect re-runs when avatarUser?.id or
        // authLoading change (sign-in completing in another tab, session
        // refresh re-hydrating AvatarContext). initialize() unconditionally
        // setGameState('loading'), which destroyed an in-progress PAID game
        // — entry diamonds already deducted, no completion, no refund.
        // Never re-initialize over an active or still-saving run.
        if (['playing', 'saving', 'saving_error'].includes(gameStateRef.current)) return;

        async function initialize() {
            setGameState('loading');
            setError(null);

            try {
                // Try avatarUser first, then getAuthUser as fallback
                const currentUserId = avatarUser?.id || getAuthUser()?.id || null;

                if (currentUserId) {
                    setUserId(currentUserId);

                    // Check VIP status
                    await DiamondEngine.init(currentUserId);
                    const vipStatus = await DiamondEngine.isVIP();
                    setIsVIP(vipStatus);

                    // Get diamonds
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', currentUserId)
                        .maybeSingle();

                    if (profile) {
                        setUserDiamonds(profile.diamonds || 0);
                    }

                    // Get streak (load current, best AND last_play_date so the
                    // completion handler can tell "already advanced today" from
                    // "consecutive day" — prevents streak inflation on replays)
                    const { data: streakData } = await supabase
                        .from('trivia_streaks')
                        .select('current_streak, best_streak, last_play_date')
                        .eq('user_id', currentUserId)
                        .maybeSingle();

                    if (streakData) {
                        setUserStreak(streakData.current_streak || 0);
                        setBestStreak(streakData.best_streak || 0);
                        setLastPlayDate(streakData.last_play_date || null);
                    }

                    // Personal best for this mode (cheap retention win — data
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
                        if (bestRow && typeof bestRow.score === 'number') {
                            setPersonalBest(bestRow.score);
                        }
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                    // Check arcade diamonds. VIPs play free (see startGame), so
                    // they skip the gate. The old `sessionStorage.trivia_paid`
                    // escape hatch is gone — nothing writes that flag any more.
                    if (mode === 'arcade' && !vipStatus) {
                        const arcadeCost = modeConfig?.diamondCost || 0;
                        if (arcadeCost > 0) {
                            const diamonds = profile?.diamonds ?? (await getUserDiamonds(currentUserId));
                            if (diamonds < arcadeCost) {
                                setError(`Not enough diamonds. You need ${arcadeCost} diamonds to play Arcade mode.`);
                                setGameState('error');
                                return;
                            }
                        }
                    }

                    // Check if daily diamonds already claimed today
                    if (mode === 'daily') {
                        const today = getTodayCST();
                        const { data: existingPlay } = await supabase
                            .from('daily_trivia_plays')
                            .select('id')
                            .eq('user_id', currentUserId)
                            .eq('played_date', today)
                            .limit(1);
                        if (existingPlay && existingPlay.length > 0) {
                            setDailyDiamondsClaimed(true);
                        }
                        // Load daily leaderboard
                        await loadDailyLeaderboard();
                    }
                }

                // Load questions (works with or without user).
                // Pass the RESOLVED user id explicitly — the `userId` state is
                // still null inside this closure (stale-closure bug that used
                // to silently skip the 60-day no-repeat exclusion).
                // Server-graded runs get their questions from the session at
                // start time instead (startGame) — pre-loading here would burn
                // 60-day pool entries for questions never actually served.
                if (serverGraded) {
                    setQuestions([]);
                } else {
                    const loadedQuestions = await loadQuestions(mode, modeConfig.questionsCount, currentUserId);
                    if (loadedQuestions.length === 0) {
                        setError('No questions available. Please try again later.');
                        setGameState('error');
                        return;
                    }

                    setQuestions(sortByDifficulty(shuffleOptions(loadedQuestions)));
                }

                // Load leaderboard for arcade
                if (mode === 'arcade') {
                    await loadLeaderboard();
                }

                // Load community accuracy for ghost opponent
                try {
                    const { data: accuracyData } = await supabase
                        .from('trivia_scores')
                        .select('correct_count, total_questions')
                        .limit(100);
                    if (accuracyData && accuracyData.length >= 5) {
                        const totalCorrect = accuracyData.reduce((s, r) => s + (r.correct_count || 0), 0);
                        const totalQs = accuracyData.reduce((s, r) => s + (r.total_questions || 0), 0);
                        if (totalQs > 0) setCommunityAccuracy(totalCorrect / totalQs);
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                setGameState('ready');
            } catch (err) {
                console.warn('Error initializing trivia:', err);
                setError('Failed to load trivia. Please try again.');
                setGameState('error');
            }
        }

        initialize();
    }, [mode, modeConfig, avatarUser?.id, authLoading]);
    // Realtime subscription — live updates. Only the daily page renders the
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
        const { data } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle();
        return data?.diamonds || 0;
    }

    async function loadQuestions(mode, count, uid) {
        const today = getTodayCST();

        // Determine which categories this mode uses
        const categories = CATEGORY_MAP[mode];

        // ═══════════════════════════════════════════════════════════
        // STEP 0: Fetch user's 60-day question history to prevent repeats.
        // GLOBAL exclusion (no mode filter) — a question answered in one
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
        // STEP 2: Fallback — random-offset pool fetch + seeded daily shuffle
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
        // filter but KEEP the quality floor — never let qs<6 questions through.
        if (filteredPool.length < count && qualityPool.length >= count) {
            filteredPool = qualityPool;
        }
        // Tier-2 fallback: pool-health emergency — only then drop quality floor.
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

    async function loadDailyLeaderboard() {
        try {
            // Get top streakers (users with best daily trivia streaks).
            // NOTE: no `profiles(username)` embed here — trivia_streaks.user_id
            // references auth.users, not profiles, so PostgREST cannot resolve
            // the relationship and the whole select fails. Fetch usernames in a
            // second query keyed by id instead.
            const { data: streakData } = await supabase
                .from('trivia_streaks')
                .select('user_id, current_streak, best_streak')
                .order('current_streak', { ascending: false })
                .limit(10);

            if (streakData && streakData.length > 0) {
                // Also get accuracy stats from daily trivia scores
                const userIds = streakData.map(s => s.user_id);

                // Usernames (profiles.id is 1:1 with auth.users.id)
                const usernameMap = {};
                try {
                    const { data: profileRows } = await supabase
                        .from('profiles')
                        .select('id, username')
                        .in('id', userIds);
                    (profileRows || []).forEach(p => { usernameMap[p.id] = p.username; });
                } catch (e) { console.warn('[Daily Trivia] Username fetch failed:', e); }

                const { data: scoreData } = await supabase
                    .from('trivia_scores')
                    .select('user_id, correct_count, total_questions')
                    .eq('mode', 'daily')
                    .in('user_id', userIds);

                // Aggregate accuracy per user
                const accuracyMap = {};
                const gamesMap = {};
                (scoreData || []).forEach(s => {
                    if (!accuracyMap[s.user_id]) {
                        accuracyMap[s.user_id] = { correct: 0, total: 0 };
                        gamesMap[s.user_id] = 0;
                    }
                    accuracyMap[s.user_id].correct += s.correct_count || 0;
                    accuracyMap[s.user_id].total += s.total_questions || 0;
                    gamesMap[s.user_id]++;
                });

                const lb = streakData.map(s => ({
                    userId: s.user_id,
                    username: usernameMap[s.user_id] || 'Player',
                    streak: s.current_streak || 0,
                    bestStreak: s.best_streak || 0,
                    accuracy: accuracyMap[s.user_id]
                        ? Math.round((accuracyMap[s.user_id].correct / accuracyMap[s.user_id].total) * 100)
                        : 0,
                    gamesPlayed: gamesMap[s.user_id] || 0
                }));

                setDailyLeaderboard(lb);
            }
        } catch (err) {
            console.warn('[Daily Trivia] Error loading leaderboard:', err);
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
        isStartingRef.current = true;
        setIsStarting(true); // visible pressed/loading state on the lobby
        try {
        // Fresh reference id for every RUN, so run 2's reward can never be
        // deduped away as a replay of run 1's (see getIdempotencyKey).
        newGameRunId();
        savePhaseRef.current = 0;
        cappedRewardRef.current = null;
        masteryCacheRef.current = null;
        firstDailyTodayRef.current = null;
        scoreIdRef.current = null;
        setWheelPrize(null);
        setWheelError(null);

        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so the only thing it could still do was let
        // a stale flag from an old session buy a free entry. The correct
        // behaviour is to always charge here; TriviaLobby no longer pre-charges.

        // Check mode config for diamond cost — only modes with diamondCost > 0 charge
        const modeConfig = TRIVIA_MODES[mode];
        const modeCost = modeConfig?.diamondCost || 0;
        const isFreeMode = modeCost === 0;

        // AUDIT FIX (M3): the charge below is gated on `userId`, so a
        // signed-out visitor slipped past it and played PAID modes for free.
        // Mirror StrategyTrivia: paid entry requires a signed-in account.
        if (!isFreeMode && !userId && !isVIP) {
            setError('Please sign in to play this mode.');
            setGameState('error');
            return;
        }

        // Server-graded run: open the session BEFORE any charge so a failed
        // start never costs the player anything. The server deals (and
        // permutes) the questions — no sortByDifficulty / shuffleOptions here,
        // reshuffling would break the display-index mapping the grader uses.
        if (serverGraded) {
            try {
                const started = await serverRun.start({ count: modeConfig.questionsCount });
                setQuestions(started.questions);
            } catch (e) {
                console.warn('[mode] Server-graded session start failed:', e?.message || e);
                setError('Could not start the game. Please try again.');
                setGameState('error');
                return;
            }
        }

        // Per-game diamond deduction for paid modes
        if (!isFreeMode && userId && !isVIP) {
            // Fresh balance check from DB to avoid stale-state false negatives
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (profile) {
                    const freshBalance = profile.diamonds || 0;
                    setUserDiamonds(freshBalance);
                    if (freshBalance < modeCost) {
                        // Abandon the just-opened server session (it expires
                        // harmlessly) — nothing has been recorded or charged.
                        if (serverGraded) serverRun.reset();
                        setShowOutOfDiamonds(true);
                        return;
                    }
                }

                const result = await DiamondEngine.deduct(modeCost, `trivia_${mode}`);
                if (!result.success) {
                    if (serverGraded) serverRun.reset();
                    setShowOutOfDiamonds(true);
                    return;
                }
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
                // Refresh balance from DB after deduction
                const { data: postProfile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (postProfile) setUserDiamonds(postProfile.diamonds || 0);
            } catch (e) {
                console.warn('[mode] Diamond deduction failed:', e);
                if (serverGraded) serverRun.reset();
                setShowOutOfDiamonds(true);
                return;
            }
        }

        setGameState('playing');
        } finally {
            isStartingRef.current = false;
            setIsStarting(false);
        }
    };

    const handleComplete = async (gameResult) => {
        setGameState('saving');
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
        // pays the reward inside award_trivia_run — the client submits the
        // display-index answers and adopts the server's numbers wholesale.
        // On failure, fall into the saving_error retry state WITHOUT any
        // client-side crediting; a retry re-submits the same session.
        let serverResult = null;
        if (serverGraded) {
            try {
                const idAnswers = (gameResult.answers || [])
                    .map((a, i) => ({
                        questionId: questions[i]?.id,
                        displayIndex: (typeof a === 'number' && a >= 0) ? a : -1
                    }))
                    .filter(x => typeof x.questionId === 'string');
                serverResult = await serverRun.submit(idAnswers, { cashedOut: gameResult.cashedOut === true });
            } catch (e) {
                console.warn('[mode] Server-graded submit failed:', e?.message || e);
                setSaveErrorPayload(gameResult);
                setGameState('saving_error');
                return;
            }
        }
        const useServerPayout = serverGraded && serverResult != null;
        // Effective score numbers — the server's when it graded the run, the
        // client's (verdict-counted by TriviaGame) otherwise.
        const effCorrectCount = useServerPayout ? (Number(serverResult.correct) || 0) : correctCount;
        const effTotalQuestions = useServerPayout ? (Number(serverResult.total) || totalQuestions) : totalQuestions;
        const runScore = useServerPayout
            ? (Number(serverResult.score) || 0)
            : correctCount * 100 + (timeRemaining || 0) * 2;

        // Calculate rewards with streak multiplier.
        // Arcade is a STAKES mode unconditionally — the pot IS the reward. The
        // old `stakePot > 0` qualifier meant a busted run (pot 0) fell through
        // to calculateDiamonds and still paid the full 25 + 15 perfect bonus,
        // which made deliberately busting the pot strictly +EV.
        const isStakesMode = mode === 'arcade';
        const baseDiamonds = isStakesMode ? 0 : calculateDiamonds(mode, correctCount, totalQuestions, timeRemaining);
        const streakTier = getStreakTier(userStreak);
        // AUDIT FIX (H1, partial): the client-computed stake pot could reach
        // ~698💎 on a perfect 20-question run (STAKE_VALUES × up to 5x streak
        // multiplier) for a 10💎 entry, and the daily-cap clamp below used to
        // exempt arcade entirely — DAILY_DIAMOND_CAPS.arcade (40, documented
        // as "max single run 50") was never enforced on the only arcade
        // payout path. Clamp a single run to 50 here, and let the daily cap
        // apply to arcade too (next block). NOTE: this is harm reduction only
        // — the pot is still computed and credited client-side, so the REAL
        // fix is server-side grading/crediting (e.g. /api/trivia/submit).
        const ARCADE_MAX_RUN_PAYOUT = 50;
        const rawDiamonds = useServerPayout
            // award_trivia_run already recomputed the pot from the recorded
            // answer sequence, capped it and credited it — adopt its number
            // so the result screen agrees with the paid balance.
            ? Math.max(0, Math.floor(Number(serverResult.diamondsAwarded) || 0))
            : isStakesMode
                ? Math.min(ARCADE_MAX_RUN_PAYOUT, Math.max(0, Math.floor(Number(stakePot) || 0)))
                : calculateRewardWithMultiplier(baseDiamonds, userStreak);

        // Daily earnings cap — closes the diamond-farming loop (replay
        // memorized questions for unlimited diamonds). AUDIT FIX (H1): arcade
        // stake-pot payouts are no longer exempt; they clamp against
        // DAILY_DIAMOND_CAPS.arcade like every other reward.
        let diamondsEarned = rawDiamonds;
        let capReached = false;
        // Server payouts are already capped server-side — never re-clamp them.
        if (!useServerPayout && userId && rawDiamonds > 0 && (isStakesMode || (modeConfig?.diamondCost || 0) === 0)) {
            if (cappedRewardRef.current == null) {
                try {
                    const earnedToday = await getDailyDiamondsEarned(supabase, userId, mode);
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

        // Update streak for daily mode — the streak advances at most ONCE per
        // CST day (dailyDiamondsClaimed covers replays this session; the
        // last_play_date check covers replays after a reload).
        const today = getTodayCST();
        if (firstDailyTodayRef.current == null) {
            firstDailyTodayRef.current = mode === 'daily' && !dailyDiamondsClaimed && lastPlayDate !== today;
        }
        const firstDailyToday = firstDailyTodayRef.current;
        let newStreak = userStreak;
        if (mode === 'daily' && firstDailyToday) {
            if (correctCount === 0) {
                newStreak = 0;
            } else {
                // Consecutive day -> +1; first ever play or a gap -> restart at 1
                newStreak = lastPlayDate === getYesterdayCST() ? userStreak + 1 : 1;
            }
        }

        // Daily trivia: award 10 diamonds for finishing all 20 questions (once per day).
        // AUDIT FIX (M1): gate on the SERVED question count, not on
        // `totalQuestions` — TriviaGame excludes bought skips from
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
        } else if (firstDailyToday && questions.length >= (modeConfig?.questionsCount || 10)) {
            // Threshold was a hard-coded 20 from the old roster size; the daily
            // roster is now 10 questions, so ">= 20" could never pass.
            dailyBonusDiamonds = 10;
            setDailyDiamondsClaimed(true);
        }

        // Save results to database
        if (userId) {
            try {
                // Phase 1: Save score (only if not already saved).
                // Capture DB errors — supabase-js does NOT throw on insert errors,
                // so the function-level catch never saw NOT NULL / RLS / schema
                // violations. Without this, the user's score would silently fail
                // to persist while the UI showed success.
                if (savePhaseRef.current < 1) {
                    // The inserted row's id is the prize wheel's spin token —
                    // fn_trivia_prize_wheel_spin(p_score_id) verifies ownership,
                    // perfection and recency from it. Select it back here so the
                    // wheel never has to be trusted for what it paid out.
                    const scorePayload = {
                        user_id: userId,
                        username: avatarUser?.username || avatarUser?.display_name || null,
                        mode,
                        score: runScore,
                        correct_count: effCorrectCount,
                        total_questions: effTotalQuestions,
                        time_spent: timeSpent,
                        diamonds_earned: diamondsEarned,
                        play_date: today
                    };
                    const { data: scoreRow, error: scoreErr } = await supabase
                        .from('trivia_scores')
                        .insert(scorePayload)
                        .select('id')
                        .maybeSingle();

                    if (scoreErr) {
                        // 23505 = idx_trivia_scores_daily_once (one 'daily' row per
                        // player per CST day, added in migration
                        // 20260726120000_trivia_phase80_dedup_integrity.sql).
                        // A second daily run of the same day is a LEGITIMATE action
                        // — the diamond bonus is already gated separately by
                        // firstDailyTodayRef — so this must not blow up the save and
                        // strand the rest of the run's rewards. Fold into the
                        // existing row, keep-best, and reuse its id as the prize
                        // wheel token.
                        if (scoreErr.code !== '23505') throw scoreErr;

                        const { data: existingRow, error: existingErr } = await supabase
                            .from('trivia_scores')
                            .select('id, score')
                            .eq('user_id', userId)
                            .eq('mode', mode)
                            .eq('play_date', today)
                            .order('score', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (existingErr || !existingRow?.id) throw scoreErr;

                        if ((scorePayload.score || 0) > (existingRow.score || 0)) {
                            const { error: updErr } = await supabase
                                .from('trivia_scores')
                                .update(scorePayload)
                                .eq('id', existingRow.id);
                            if (updErr) console.warn('[Supabase] daily score keep-best update failed:', updErr.message);
                        }
                        scoreIdRef.current = existingRow.id;
                    } else if (scoreRow?.id) {
                        scoreIdRef.current = scoreRow.id;
                    }
                    savePhaseRef.current = 1;
                }

                // Phase 2: Award diamonds (only if not already awarded).
                // Server-graded runs were already paid server-side by
                // award_trivia_run — crediting here again would double-pay,
                // so only surface the toast and sync the balance.
                if (savePhaseRef.current < 2) {
                    if (useServerPayout) {
                        if ((Number(serverResult.diamondsAwarded) || 0) > 0) {
                            busEmit.diamondsEarned(Number(serverResult.diamondsAwarded) || 0, `Trivia ${mode}`);
                        }
                        if (serverResult.newBalance != null) {
                            if (isMountedRef.current) setUserDiamonds(Number(serverResult.newBalance) || userDiamonds);
                        } else {
                            // newBalance missing from the response — fall back
                            // to a fresh profiles read for the header display.
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('diamonds')
                                .eq('id', userId)
                                .maybeSingle();
                            if (profile && isMountedRef.current) setUserDiamonds(profile.diamonds || 0);
                        }
                    } else {
                        const totalDiamondsToAward = diamondsEarned + dailyBonusDiamonds;
                        if (totalDiamondsToAward > 0) {
                            const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                                p_user_id: userId,
                                p_amount: totalDiamondsToAward,
                                p_type: 'trivia_reward',
                                p_description: `Trivia ${mode} reward — ${totalDiamondsToAward}💎`,
                                p_reference_id: getIdempotencyKey('game_complete')
                            });
                            if (__rpcErr) throw __rpcErr;
                            // Refresh balance from DB
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('diamonds')
                                .eq('id', userId)
                                .maybeSingle();
                            if (profile && isMountedRef.current) setUserDiamonds(profile.diamonds || 0);

                            busEmit.diamondsEarned(totalDiamondsToAward, `Trivia ${mode}`);
                        }
                    }
                    savePhaseRef.current = 2;
                }

                // AUDIT FIX (M2): only questions the player actually REACHED
                // may be recorded. After a cash-out at question 6 (or an
                // arcade timer expiry) the old code recorded all 20 loaded
                // questions: ~14 never-displayed questions were burned from
                // the 60-day pool AND counted as WRONG in category mastery
                // (answers[idx] === undefined never equals correct_index).
                // Skip/timeout sentinels (negative answers) are scored
                // neutral by TriviaGame, so they persist as was_correct:null
                // and are excluded from mastery accuracy below.
                const servedQuestions = Array.isArray(answers)
                    ? (questions || []).slice(0, answers.length)
                    : (questions || []);
                const answeredIndex = (idx) => {
                    const a = Array.isArray(answers) ? answers[idx] : undefined;
                    return typeof a === 'number' && a >= 0 ? a : null; // null = skip/timeout/unanswered
                };
                // Server verdict lookup (questionId -> wasCorrect) for the
                // history and mastery phases: with server grading the client
                // has no correct_index to compare against.
                const serverVerdictMap = {};
                if (useServerPayout && Array.isArray(serverResult.perQuestion)) {
                    serverResult.perQuestion.forEach(pq => {
                        if (pq && typeof pq.questionId === 'string') {
                            serverVerdictMap[pq.questionId] = pq.wasCorrect === true;
                        }
                    });
                }

                // Phase 3: Record question history (only if not already recorded)
                if (savePhaseRef.current < 3) {
                    if (servedQuestions.length > 0) {
                        const historyRecords = servedQuestions.map((q, idx) => ({
                            user_id: userId,
                            question_id: q.id,
                            was_correct: answeredIndex(idx) != null
                                ? (useServerPayout
                                    ? (serverVerdictMap[q.id] ?? null)
                                    : answeredIndex(idx) === q.correct_index)
                                : null,
                            seen_at: new Date().toISOString(),
                            mode
                        }));

                        // Use upsert to handle potential duplicates
                        const { error: err_trivia_user_question_history_g7wxv } = await supabase.from('trivia_user_question_history').upsert(historyRecords, {
                                onConflict: 'user_id,question_id',
                                ignoreDuplicates: false
                            });
                        if (err_trivia_user_question_history_g7wxv) console.warn('[Supabase] Silent mutation failed in trivia_user_question_history:', err_trivia_user_question_history_g7wxv.message);
                    }
                    savePhaseRef.current = 3;
                }

                // Phase 4: Update category mastery (only if not already updated)
                if (savePhaseRef.current < 4) {
                    const categoryStats = {};
                    // AUDIT FIX (M2): iterate only SERVED questions, and skip
                    // neutral entries (bought skips / timeouts, sentinel < 0)
                    // entirely — they must not count as answered-wrong.
                    servedQuestions.forEach((q, idx) => {
                        const a = answeredIndex(idx);
                        if (a == null) return; // neutral: excluded from accuracy
                        // Server-graded: correctness comes from the verdict
                        // map; an entry the server never graded is excluded
                        // rather than guessed at.
                        if (useServerPayout && serverVerdictMap[q.id] === undefined) return;
                        const cat = q.category || 'general';
                        if (!categoryStats[cat]) {
                            categoryStats[cat] = { answered: 0, correct: 0 };
                        }
                        categoryStats[cat].answered++;
                        if (useServerPayout ? serverVerdictMap[q.id] : (a === q.correct_index)) {
                            categoryStats[cat].correct++;
                        }
                    });

                    const categoryKeys = Object.keys(categoryStats || {});
                    
                    let existingMap = masteryCacheRef.current;
                    if (!existingMap) {
                        // Batch-read existing mastery for all categories only once per completion
                        const { data: existingMastery } = await supabase
                            .from('trivia_category_mastery')
                            .select('category, total_answered, correct_count')
                            .eq('user_id', userId)
                            .in('category', categoryKeys);

                        existingMap = {};
                        (existingMastery || []).forEach(m => { existingMap[m.category] = m; });
                        masteryCacheRef.current = existingMap; // Cache it for idempotency on retries
                    }

                    // Build batch upsert records
                    const masteryRecords = categoryKeys.map(category => {
                        const stats = categoryStats[category];
                        const existing = existingMap[category];
                        const newTotal = (existing?.total_answered || 0) + stats.answered;
                        const newCorrect = (existing?.correct_count || 0) + stats.correct;
                        const accuracy = newTotal > 0 ? newCorrect / newTotal : 0;
                        const newLevel = Math.min(10, Math.max(1, Math.floor(accuracy * 10) + 1));
                        return {
                            user_id: userId,
                            category,
                            total_answered: newTotal,
                            correct_count: newCorrect,
                            mastery_level: newLevel,
                            updated_at: new Date().toISOString()
                        };
                    });

                    // AUDIT FIX (M2): with neutral-only runs categoryStats can
                    // now legitimately be empty — don't upsert an empty batch.
                    if (masteryRecords.length > 0) {
                        const { error: masteryError } = await supabase.from('trivia_category_mastery')
                            .upsert(masteryRecords, { onConflict: 'user_id,category', ignoreDuplicates: false });
                        if (masteryError) console.warn('[Trivia] Category mastery upsert failed:', masteryError);
                    }
                    savePhaseRef.current = 4;
                }

                // Phase 5: Record daily play (only ONCE per CST day — replays
                // must not insert extra rows or re-bump the streak)
                if (savePhaseRef.current < 5) {
                    if (mode === 'daily' && firstDailyToday) {
                        const { error: err_daily_trivia_plays_ccqx1 } = await supabase.from('daily_trivia_plays').insert({
                            user_id: userId,
                            played_date: today,
                            was_correct: correctCount > 0,
                            streak_at_time: newStreak
                        });
                        if (err_daily_trivia_plays_ccqx1) console.warn('[Supabase] Silent mutation failed in daily_trivia_plays:', err_daily_trivia_plays_ccqx1.message);

                        // Update streak via the hardened RPC (migration 120400).
                        // The old .upsert() omitted onConflict, so PostgREST
                        // targeted the `id` primary key the payload never
                        // supplied — every write was an INSERT that either
                        // violated the user_id unique constraint or created a
                        // duplicate streak row. The RPC also locks the row (no
                        // lost update between two tabs) and derives the streak
                        // from last_play_date server-side, so a tampered client
                        // cannot set current_streak to whatever it likes.
                        const { data: streakRes, error: streakErr } = await supabase.rpc('update_trivia_streak', {
                            p_user_id: userId,
                            p_score: correctCount * 100 + (timeRemaining || 0) * 2,
                            p_correct_count: correctCount,
                            p_xp_earned: 0
                        });
                        if (streakErr) {
                            console.warn('[Supabase] update_trivia_streak failed:', streakErr.message);
                        }
                        // Prefer the server's numbers — it, not us, owns the streak.
                        const serverStreak = streakRes && typeof streakRes === 'object' && streakRes.success !== false
                            ? Number(streakRes.current_streak)
                            : NaN;
                        const serverBest = streakRes && typeof streakRes === 'object'
                            ? Number(streakRes.best_streak)
                            : NaN;
                        const appliedStreak = Number.isFinite(serverStreak) ? serverStreak : newStreak;
                        newStreak = appliedStreak;
                        // Keep local streak state in sync
                        setUserStreak(appliedStreak);
                        setLastPlayDate(today);
                        const appliedBest = Number.isFinite(serverBest)
                            ? serverBest
                            : Math.max(appliedStreak, bestStreak);
                        if (appliedBest > bestStreak) setBestStreak(appliedBest);
                    }
                    savePhaseRef.current = 5;
                }
            } catch (err) {
                console.warn('[mode] Failed to save data:', err);
                setSaveErrorPayload(gameResult);
                setGameState('saving_error');
                return; // halt and show retry UI (savePhaseRef preserves progress)
            }
        }

        // Achievement evaluation — fires the (previously unreachable)
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
                // checkNewUnlocks evaluates every predicate defensively — one
                // requirement that references a field we cannot compute client
                // side must not take the whole scan down.
                const newlyUnlocked = checkNewUnlocks(stats, prevUnlocked);
                if (newlyUnlocked.length > 0) {
                    localStorage.setItem(storageKey, JSON.stringify([...prevUnlocked, ...newlyUnlocked.map(a => a.id)]));
                    celebrations.triggerAchievement(newlyUnlocked[0]);
                }
            } catch (e) { console.warn('[Trivia] Achievement check failed:', e); }
        }

        if (!isMountedRef.current) return;
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
            // Review mode data
            questions,
            answers: gameResult.answers || [],
        });

        setGameState('results');
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
    };

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        handleComplete(saveErrorPayload || result); // savePhaseRef skips already-completed steps
    };

    /**
     * Ask the SERVER for this run's prize before showing the wheel.
     *
     * fn_trivia_prize_wheel_spin (migration 120500) verifies the score row is
     * ours, perfect and recent, rolls the weighted prize, applies the streak
     * multiplier from trivia_streaks and credits diamonds (or inventory) in one
     * transaction — UNIQUE(score_id) makes a retry replay the same prize. The
     * wheel is then purely cosmetic: it spins to `prizeId` and reports back.
     */
    const openPrizeWheel = async () => {
        setWheelError(null);
        const scoreId = scoreIdRef.current;
        if (!userId || !scoreId) {
            // No verifiable token (guest play, or the score insert failed).
            // Refuse rather than fall back to a client-rolled, client-credited
            // prize — that path is exactly the mint the RPC exists to close.
            setWheelError('The prize wheel is unavailable for this run.');
            return;
        }
        try {
            const { data, error: spinErr } = await supabase.rpc('fn_trivia_prize_wheel_spin', {
                p_score_id: scoreId
            });
            if (spinErr) throw spinErr;
            if (!data || data.success === false) {
                setWheelError(
                    data?.error === 'spin_window_expired'
                        ? 'This spin has expired.'
                        : 'Could not start the prize wheel. Please try again.'
                );
                return;
            }
            setWheelPrize({
                prizeId: data.prize_id || null,
                prizeAmount: Number.isFinite(Number(data.prize_amount)) ? Number(data.prize_amount) : null
            });
            setShowPrizeWheel(true);
        } catch (e) {
            console.warn('[PrizeWheel] spin RPC failed:', e?.message || e);
            setWheelError('Could not start the prize wheel. Please try again.');
        }
    };

    /**
     * Pick an UNSEEN question for the Double-or-Nothing round.
     *
     * It used to draw from `questions` — the set the player had just answered —
     * so the bonus round was a free double on a question whose answer was on
     * screen thirty seconds earlier. Falls back to the played set only if the
     * pool fetch yields nothing (the modal also tolerates a null question).
     */
    const openDoubleOrNothing = async () => {
        let picked = null;
        try {
            const excludeIds = userId ? await getRecentlySeenIds(supabase, userId, 2000) : [];
            const sessionExcludeIds = new Set([
                ...sessionSeenIdsRef.current,
                ...questions.map(q => q?.id).filter(Boolean)
            ]);
            const pool = await fetchRandomQuestionPool(supabase, {
                // AUDIT FIX (C2/L3): CATEGORY_MAP now carries entries for
                // mtt/cash/icm/gto (arrays). fetchRandomQuestionPool accepts
                // string OR array — applyPoolFilters uses .in() for arrays,
                // exactly as loadQuestions already relies on for
                // history/rules/pro — so the bonus round now draws from the
                // mode's own categories instead of the whole pool.
                category: CATEGORY_MAP[mode],
                pageSize: 300,
                minQuality: MIN_QUALITY_SCORE,
                want: 1
            });
            const usable = filterAndShuffle(pool || [], excludeIds, 1, {
                sessionExcludeIds,
                minQualityScore: MIN_QUALITY_SCORE
            });
            // Permute the options too — the pool row arrives in its stored
            // order, which is the same order every other player sees.
            picked = usable[0] ? (shuffleOptions([usable[0]])[0] || usable[0]) : null;
        } catch (e) {
            console.warn('[DoubleOrNothing] unseen-question fetch failed:', e?.message || e);
        }
        if (!picked && questions.length > 0) {
            picked = questions[Math.floor(Math.random() * questions.length)] || null;
        }
        if (picked?.id) sessionSeenIdsRef.current.add(picked.id);
        if (!isMountedRef.current) return;
        setDoubleQuestion(picked);
        setShowDoubleOrNothing(true);
    };

    const handlePlayAgain = async () => {
        if (mode === 'arcade' && !isVIP && userDiamonds < (modeConfig?.diamondCost || 10)) {
            router.push('/hub/trivia');
            return;
        }
        setResult(null);
        // A new run gets a new reference id (startGame mints it too — this is
        // belt-and-braces for anything that reaches handleComplete without a
        // fresh startGame).
        newGameRunId();
        scoreIdRef.current = null;
        setWheelPrize(null);
        setWheelError(null);
        masteryCacheRef.current = null; // Reset mastery cache
        cappedRewardRef.current = null; // Reset daily-cap cache
        firstDailyTodayRef.current = null; // Reset first-daily-today cache
        // Phase 55 fix: previously NOT reset here. If a prior game's save errored
        // mid-phase and the user navigated past the retry UI without retrying,
        // savePhaseRef stayed at the partial value (e.g. 2). The next game's
        // handleComplete would skip phases <= that value — meaning the user's
        // new score insert (phase 1) would be silently skipped on every
        // subsequent game until full page reload.
        savePhaseRef.current = 0;
        setSaveErrorPayload(null);
        setShowDoubleOrNothing(false);
        setShowPrizeWheel(false);
        setDoubleAttempted(false);
        setWheelSpun(false);
        setIsPerfectScore(false);

        // Re-fetch a FRESH question set. The previous behavior replayed the
        // identical questions with known answers (diamond-farming hole); the
        // just-finished game's history rows (phase 3) are now excluded too.
        setGameState('loading');
        try {
            const fresh = await loadQuestions(mode, modeConfig.questionsCount, userId);
            if (fresh && fresh.length > 0) {
                setQuestions(sortByDifficulty(shuffleOptions(fresh)));
            }
        } catch (e) {
            console.warn('[mode] Play Again question refetch failed, reusing previous set:', e);
        }
        if (isMountedRef.current) setGameState('ready');
    };

    // AUDIT FIX (C1): survival is served by /hub/trivia/survival-game; the
    // redirect effect above is already in flight. Render nothing so the paid
    // lobby (and its Start charge) can never appear for this slug. This
    // return sits after all hooks, so hook order is stable across renders.
    if (isSurvivalSlug) return null;

    // While the router hydrates, show a skeleton instead of a blank flash
    if (!router.isReady) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TriviaSkeleton />
            </div>
        );
    }

    // Unknown slug (typo'd deep link, removed mode) — friendly 404 instead of
    // a permanent blank page
    if (!mode || !modeConfig) {
        return (
            <div style={{
                minHeight: '100vh', background: '#0a0e1a', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center',
                fontFamily: "'Inter', -apple-system, sans-serif", padding: 24
            }}>
                <h1 style={{ color: '#ffffff', fontSize: 28, margin: 0 }}>Mode Not Found</h1>
                <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 12px', fontSize: 15 }}>
                    That trivia mode doesn't exist. It may have been renamed or retired.
                </p>
                <button
                    onClick={() => router.replace('/hub/trivia')}
                    style={{
                        padding: '12px 28px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                        border: 'none', borderRadius: 10, color: '#ffffff', fontSize: 16,
                        fontWeight: 600, cursor: 'pointer'
                    }}
                >
                    Back To Trivia
                </button>
            </div>
        );
    }

    return (
        <TriviaErrorBoundary pageName={`Trivia — ${modeConfig?.name || mode}`}>
            <SEOHead
                title="Poker Trivia Game"
                description="Play Poker Trivia On Smarter.Poker. Test Your Knowledge Across Multiple Game Modes."
                canonical="/hub/trivia"
                noindex={true}
            />

            <div className="trivia-mode-page">
                <div className="bg-overlay" />

                <UniversalHeader pageDepth={2} />
                {modeConfig && modeConfig.diamondCost > 0 && (
                    <GameCostPopup userId={userId} featureKey={`trivia_${mode}`} isVip={isVIP} cost={modeConfig.diamondCost} />
                )}

                {/* Out of Diamonds Modal */}
                {showOutOfDiamonds && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Gem size={48} color="#00D4FF" /></div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Out Of Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>You Need {modeConfig?.diamondCost || 10} Diamonds To Play This Mode. Visit The Diamond Store To Get More!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 20, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 20, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="content" style={{ padding: '80px 0 40px' }}>
                    {gameState === 'loading' && (
                        <div className="loading" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TriviaSkeleton />
                        </div>
                    )}

                    {gameState === 'saving' && (
                        <div className="saving" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                    We couldn't save your trivia results because you lost connection. Please check your internet and try again so you don't lose your progress!
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

                    {gameState === 'error' && (
                        <div className="error-state">
                            <p>{error}</p>
                            <button onClick={() => router.push('/hub/trivia')}>
                                Back to Trivia
                            </button>
                        </div>
                    )}

                    {gameState === 'ready' && (
                        LOBBY_IMAGES[mode] ? (
                            /* Full-bleed image lobby.
                               AUDIT FIX (H3): was a click-only <div> — the sole
                               start control for every image-lobby mode was
                               unreachable by keyboard and invisible to screen
                               readers. A real <button> restores focus, Enter/
                               Space activation and a proper accessible name
                               (button-reset CSS keeps the old visual). */
                            <button
                                type="button"
                                className="lobby-image-wrapper"
                                onClick={startGame}
                                disabled={isStarting}
                                aria-label={`${modeConfig.name} — start challenge${modeConfig.diamondCost > 0 ? `, entry ${modeConfig.diamondCost} diamonds` : ''}`}
                                style={{ borderRadius: 0 }}
                            >
                                <img
                                    src={LOBBY_IMAGES[mode]}
                                    alt=""
                                    aria-hidden="true"
                                    className="lobby-image"
                                    style={{ borderRadius: 0, width: '100%' }}
                                    loading="lazy" />
                                {personalBest != null && (
                                    <div className="personal-best-badge">Your Best: {personalBest}</div>
                                )}
                                {isStarting && (
                                    <div className="starting-overlay">
                                        <div className="spinner" />
                                    </div>
                                )}
                            </button>
                        ) : (
                            /* Fallback text lobby */
                            <div className="ready-screen">
                                <div className="mode-info">
                                    <h1>{modeConfig.name}</h1>
                                    <p>{modeConfig.description}</p>

                                    <div className="mode-details">
                                        <div className="detail">
                                            <span className="label">Questions</span>
                                            <span className="value">{modeConfig.questionsCount}</span>
                                        </div>
                                        {modeConfig.timeLimit && (
                                            <div className="detail">
                                                <span className="label">Time Limit</span>
                                                <span className="value">{modeConfig.timeLimit}s</span>
                                            </div>
                                        )}
                                        {modeConfig.diamondCost > 0 && (
                                            <div className="detail">
                                                <span className="label">Entry Cost</span>
                                                <span className="value">{modeConfig.diamondCost} Diamonds</span>
                                            </div>
                                        )}
                                        {personalBest != null && (
                                            <div className="detail">
                                                <span className="label">Your Best</span>
                                                <span className="value">{personalBest}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button className="start-btn" onClick={startGame} disabled={isStarting}>
                                        {isStarting
                                            ? 'Starting...'
                                            : mode === 'arcade' ? `Play (${modeConfig.diamondCost} Diamonds)` : 'Start Quiz'}
                                    </button>
                                </div>

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
                            </div>
                        )
                    )}

                    {gameState === 'playing' && mode !== 'survival' && (
                        <TriviaGame
                            questions={questions}
                            mode={mode}
                            timeLimit={modeConfig.timeLimit}
                            onComplete={handleComplete}
                            userDiamonds={userDiamonds}
                            enableHints={mode !== 'arcade'}
                            enableStakes={mode === 'arcade'}
                            enableGhostOpponent={true}
                            ghostAccuracy={communityAccuracy}
                            // Per-answer server grading — null keeps the
                            // legacy client-keyed path byte-for-byte.
                            serverGrader={serverGraded ? (args) => serverRun.answer(args) : null}
                            // Reuse this page's out-of-diamonds modal when a hint
                            // is unaffordable — HintButtons otherwise only shows a
                            // transient inline notice with no route to the store.
                            onNeedDiamonds={() => setShowOutOfDiamonds(true)}
                            onDiamondsChange={async (delta) => {
                                if (!userId) return;
                                try {
                                    // Fresh reference id PER EVENT — this fires once per
                                    // hint purchase / stake delta, and the RPC dedups on
                                    // p_reference_id. A cached per-game key silently
                                    // dropped every delta after the first.
                                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                                        p_user_id: userId,
                                        p_amount: delta,
                                        p_type: delta > 0 ? 'trivia_reward' : 'trivia_cost',
                                        p_description: `Trivia ${mode} — ${Math.abs(delta)}💎 ${delta > 0 ? 'earned' : 'spent'}`,
                                        p_reference_id: `trivia_${mode}_stakes_delta_${genUUID()}`
                                    });
                                    if (__rpcErr) throw __rpcErr;
                                    const { data: profile } = await supabase
                                        .from('profiles')
                                        .select('diamonds')
                                        .eq('id', userId)
                                        .maybeSingle();
                                    if (profile) setUserDiamonds(profile.diamonds || 0);
                                    if (delta > 0) busEmit.diamondsEarned(delta, `Trivia ${mode}`);
                                } catch (e) {
                                    console.warn('[Trivia] onDiamondsChange RPC failed:', e);
                                }
                            }}
                        />
                    )}


                    {gameState === 'results' && result && (
                        <div className="results-section">
                            {result.beatPersonalBest && (
                                <div className="new-best-callout">New Personal Best!</div>
                            )}
                            {result.capReached && (
                                <div className="cap-callout">
                                    Daily earning cap reached for this mode — {result.diamondsEarned} of {result.rawDiamonds} diamonds awarded. Come back tomorrow for full rewards!
                                </div>
                            )}
                            {result.skippedCount > 0 && (
                                <div className="cap-callout">
                                    {result.skippedCount} question{result.skippedCount === 1 ? ' was' : 's were'} skipped and scored neutral — they are not counted in your accuracy.
                                </div>
                            )}
                            {wheelError && (
                                <div className="cap-callout">{wheelError}</div>
                            )}
                            <TriviaResult
                                {...result}
                                onPlayAgain={handlePlayAgain}
                                personalBest={personalBest}
                                showDailyBonusRow
                                onSpinWheel={openPrizeWheel}
                                showSpinButton={isPerfectScore && !showPrizeWheel && !wheelSpun}
                                onDoubleOrNothing={/* DISABLED: Double or Nothing pays through the
                                    browser-side add_diamonds_to_balance RPC, which was revoked
                                    2026-08-03 - a win could not be credited (and a loss could not
                                    be collected). Disabled until it settles through a server
                                    route. */
                                    false && result.diamondsEarned > 0 && !doubleAttempted ? openDoubleOrNothing : null}
                                showDoubleButton={false && result.diamondsEarned > 0 && !showDoubleOrNothing && !doubleAttempted}
                            />

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
                                        (showDailyBonusRow) — rendering it here too
                                        showed the same diamonds twice. */}
                                    {dailyLeaderboard.length > 0 && (
                                        <div className="daily-leaderboard">
                                            <h3>Daily Trivia Leaderboard</h3>
                                            <div className="daily-lb-header">
                                                <span className="lb-col rank">#</span>
                                                <span className="lb-col name">Player</span>
                                                <span className="lb-col streak">Streak</span>
                                                <span className="lb-col accuracy">Acc%</span>
                                                <span className="lb-col games">Games</span>
                                            </div>
                                            {dailyLeaderboard.map((entry, idx) => (
                                                <div
                                                    key={entry.userId}
                                                    className={`daily-lb-row ${entry.userId === userId ? 'you' : ''}`}
                                                >
                                                    <span className="lb-col rank">{idx + 1}</span>
                                                    <span className="lb-col name">{entry.username}</span>
                                                    <span className="lb-col streak">{entry.streak}d</span>
                                                    <span className="lb-col accuracy">{entry.accuracy}%</span>
                                                    <span className="lb-col games">{entry.gamesPlayed}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Double or Nothing Modal.
                        Wired to the component's REAL API (diamondsAtRisk /
                        onAccept / onAnswer / onDecline) — the previous
                        currentWinnings/onComplete props didn't exist, so the
                        modal showed 0 winnings, never paid out, and trapped
                        the player on the result screen.
                        DISABLED: Double or Nothing pays through the browser-side
                        add_diamonds_to_balance RPC, which was revoked 2026-08-03 -
                        a win could not be credited (and a loss could not be
                        collected). The false && guard keeps the wager unreachable
                        until it settles through a server route. */}
                    {false && showDoubleOrNothing && (
                        <DoubleOrNothing
                            question={doubleQuestion}
                            diamondsAtRisk={result?.diamondsEarned || 0}
                            onAccept={() => setDoubleAttempted(true)}
                            onAnswer={async (won) => {
                                const wager = result?.diamondsEarned || 0;
                                try {
                                    if (userId && won && wager > 0) {
                                        // Award the extra diamonds (2x total = +wager) via RPC
                                        const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                                            p_user_id: userId,
                                            p_amount: wager,
                                            p_type: 'trivia_double_win',
                                            p_description: `Double or Nothing win — ${wager}💎 bonus`,
                                            p_reference_id: getIdempotencyKey('double_win')
                                        });
                                        if (__rpcErr) throw __rpcErr;
                                        const { data: profile } = await supabase
                                            .from('profiles')
                                            .select('diamonds')
                                            .eq('id', userId)
                                            .maybeSingle();
                                        if (profile) setUserDiamonds(profile.diamonds || 0);
                                        busEmit.diamondsEarned(wager, 'Double or Nothing Win');
                                        busEmit.celebration('confetti');
                                    } else if (userId && !won && wager > 0) {
                                        // Deduct the original winnings (they lost) via RPC
                                        const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                                            p_user_id: userId,
                                            p_amount: -wager,
                                            p_type: 'trivia_double_loss',
                                            p_description: `Double or Nothing loss — ${wager}💎 deducted`,
                                            p_reference_id: getIdempotencyKey('double_loss')
                                        });
                                        if (__rpcErr) throw __rpcErr;
                                        const { data: profile } = await supabase
                                            .from('profiles')
                                            .select('diamonds')
                                            .eq('id', userId)
                                            .maybeSingle();
                                        if (profile) setUserDiamonds(profile.diamonds || 0);
                                        busEmit.diamondsSpent(wager, 'Double or Nothing Loss');
                                        busEmit.screenShake('medium');
                                    }
                                } catch (e) {
                                    console.warn('[DoubleOrNothing] RPC failed:', e);
                                }
                                // Reflect the outcome on the results card
                                if (isMountedRef.current) {
                                    setResult(prev => prev ? { ...prev, diamondsEarned: won ? wager * 2 : 0 } : prev);
                                }
                                // No auto-dismiss: DoubleOrNothing now renders a real
                                // Continue button on its result stage, and a 2600ms
                                // timer used to yank the reveal away mid-read.
                            }}
                            onDecline={() => setShowDoubleOrNothing(false)}
                        />
                    )}

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
                                        const { data: profile } = await supabase
                                            .from('profiles')
                                            .select('diamonds')
                                            .eq('id', userId)
                                            .maybeSingle();
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

                    {/* Celebration Effects — called as a function (not <Component/>)
                        so React doesn't see a new component type each render and
                        unmount/remount the confetti mid-celebration */}
                    {celebrations.CelebrationComponents()}
                </div>
              <BottomNavBar />
            </div>

            <style>{`
                .trivia-mode-page {
                    min-height: 100vh; padding-bottom: 70px;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                }

                
                
                
                
                

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                }

                .loading,
                .error-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: center;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #0ea5e9;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .error-state button {
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #ffffff;
                    cursor: pointer;
                }

                .ready-screen {
                    max-width: 100%;
                    margin: 0 auto;
                }

                .lobby-image-wrapper {
                    position: relative;
                    cursor: pointer;
                    overflow: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    max-width: 100%;
                    margin: 0 auto;
                    /* AUDIT FIX (H3): now a <button> — reset browser button
                       chrome back to the old full-bleed div look. */
                    display: block;
                    width: 100%;
                    padding: 0;
                    background: none;
                    border: none;
                    font: inherit;
                    color: inherit;
                    text-align: left;
                }

                .lobby-image-wrapper:disabled {
                    cursor: wait;
                }

                .lobby-image-wrapper:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 3px;
                }

                .lobby-image-wrapper:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 40px rgba(14, 165, 233, 0.3);
                }

                .lobby-image-wrapper:active {
                    transform: scale(0.98);
                }

                .lobby-image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .personal-best-badge {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    padding: 6px 14px;
                    background: rgba(10, 14, 26, 0.85);
                    border: 1px solid rgba(255, 215, 0, 0.5);
                    border-radius: 20px;
                    color: #FFD700;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    pointer-events: none;
                }

                .starting-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.55);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .new-best-callout {
                    padding: 12px 20px;
                    background: linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(249, 115, 22, 0.12));
                    border: 1px solid rgba(255, 215, 0, 0.45);
                    border-radius: 12px;
                    color: #FFD700;
                    font-size: 16px;
                    font-weight: 700;
                    text-align: center;
                    margin-bottom: 16px;
                    animation: bonusPulse 2s ease-in-out;
                }

                .cap-callout {
                    padding: 12px 16px;
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.35);
                    border-radius: 12px;
                    color: #fbbf24;
                    font-size: 13px;
                    text-align: center;
                    margin-bottom: 16px;
                }

                .mode-info {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-info h1 {
                    font-size: 32px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 12px 0;
                }

                .mode-info p {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 32px 0;
                }

                .mode-details {
                    display: flex;
                    justify-content: center;
                    gap: 32px;
                    margin-bottom: 32px;
                }

                .detail {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .detail .label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 4px;
                }

                .detail .value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                }

                .start-btn {
                    padding: 16px 48px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }

                .start-btn:disabled {
                    opacity: 0.6;
                    cursor: wait;
                    transform: none;
                    box-shadow: none;
                }

                .leaderboard-section {
                    margin-top: 24px;
                }

                .results-section {
                    max-width: 600px;
                    margin: 0 auto;
                }

                /* Daily Trivia Leaderboard */
                .daily-results-section {
                    margin-top: 24px;
                }

                .daily-bonus-callout {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.15));
                    border: 1px solid rgba(34, 197, 94, 0.4);
                    border-radius: 12px;
                    color: #22c55e;
                    font-size: 16px;
                    font-weight: 700;
                    margin-bottom: 20px;
                    animation: bonusPulse 2s ease-in-out;
                }

                .bonus-icon {
                    font-size: 24px;
                }

                @keyframes bonusPulse {
                    0% { transform: scale(0.95); opacity: 0; }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); opacity: 1; }
                }

                .daily-leaderboard {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 20px;
                }

                .daily-leaderboard h3 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin: 0 0 16px;
                }

                .daily-lb-header,
                .daily-lb-row {
                    display: flex;
                    align-items: center;
                    padding: 8px 0;
                }

                .daily-lb-header {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.4);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .daily-lb-row {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .daily-lb-row.you {
                    background: rgba(0, 212, 255, 0.1);
                    margin: 0 -12px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    color: #00D4FF;
                    font-weight: 600;
                }

                .lb-col.rank { width: 30px; font-weight: 700; color: #FFD700; }
                .lb-col.name { flex: 1; }
                .lb-col.streak { width: 55px; text-align: center; color: #f97316; }
                .lb-col.accuracy { width: 50px; text-align: center; color: #22c55e; }
                .lb-col.games { width: 50px; text-align: center; color: rgba(255,255,255,0.5); }

                /* ===== MOBILE OPTIMIZATION ===== */
                @media (max-width: 768px) {
                    .content {
                        padding: 60px 0 20px;
                    }

                    .lobby-image-wrapper {
                        max-height: calc(100dvh - 60px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .lobby-image {
                        max-height: calc(100dvh - 60px);
                        width: 100%;
                        object-fit: contain;
                    }
                }
            `}</style>
        </TriviaErrorBoundary>
    );
}
/* Cache bust: lobby-images-mobile-v3 */
