/**
 * STRATEGY TRIVIA MODE - Shared component for MTT, Cash, ICM, GTO modes
 * Features built-in hints/lifelines with diamond purchase support
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import {
    calculateDiamonds,
    DAILY_DIAMOND_CAPS,
    TRIVIA_MODES,
    getModeConfig,
    getCategoryName,
} from '../../../src/lib/trivia/triviaEngine';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    loadQuestionsForUser,
    fetchRandomQuestionPool,
    filterAndShuffle,
    getSeenHistory,
    recordQuestionsSeen,
} from '../../../src/lib/triviaQuestionLoader';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { Clock, CheckCircle, XCircle, ArrowRight, Trophy, Gem, Target, DollarSign, BarChart3, Brain, AlertTriangle } from 'lucide-react';
import GTOScenarioDisplay from './GTOScenarioDisplay';
import TriviaSkeleton from './TriviaSkeleton';

/** Format poker text: enforce BB/SB spacing and capitalization rules */
function formatPokerText(text) {
    if (!text) return text;
    return text
        // Normalize "31 BB" / "31bb" -> "31BB" (compact form, no space).
        // The old comment claimed it ADDED a space and gave "31BB -> 31BB"
        // as the example, which contradicted the replacement below.
        .replace(/(\d+)\s*(BB|bb|Bb|bB)/g, '$1BB')
        // Capitalize poker position abbreviations
        .replace(/\b(btn|Btn)\b/gi, 'BTN')
        .replace(/\b(sb|Sb|sB)\b/g, 'SB')
        .replace(/\b(utg|Utg)\b/gi, 'UTG')
        .replace(/\b(hj|Hj)\b/gi, 'HJ')
        .replace(/\b(co|Co)\b/g, 'CO')
        .replace(/\b(mp|Mp)\b/g, 'MP')
        .replace(/\bip\b/gi, 'IP')
        .replace(/\boop\b/gi, 'OOP')
        // Hyphenated blind terms
        .replace(/\bbig[- ]blind\b/gi, 'Big-Blind')
        .replace(/\bsmall[- ]blind\b/gi, 'Small-Blind');
}
import GameCostPopup from '../gates/GameCostPopup';
import DiamondEngine from '../../services/DiamondEngine';
import useVIP from '../../hooks/useVIP';

/**
 * Entry price for the strategy modes.
 *
 * TRIVIA_MODES is the single source of truth for entry cost. It now declares
 * diamondCost: 10 for mtt/cash/icm/gto, so the local
 * STRATEGY_ENTRY_COST_FALLBACK that used to live here is gone — the lobby's
 * advertised price, the direct-URL price and the actual charge all read the
 * same field and cannot drift apart.
 */
function getEntryCost(mode) {
    const configured = getModeConfig(mode)?.diamondCost;
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

const QUESTIONS_PER_GAME = 20;
const SECONDS_PER_QUESTION = 60;
const MIN_QUALITY_SCORE = 6;
const LIFELINE_SKIP = -2;   // sentinel stored in answers[] for a bought skip
const TIMEOUT_ANSWER = -1;  // sentinel stored in answers[] for a timeout

/** Best-effort unique token; crypto.randomUUID is missing on older Safari. */
function makeNonce() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRealQuestion = q => !!q && typeof q.id === 'string' && UUID_RE.test(q.id);

/**
 * Score an answers array. A bought Skip is NEUTRAL — excluded from both the
 * numerator and the denominator. It used to be counted as CORRECT, which made
 * a 5-diamond lifeline a guaranteed right answer (purchasable perfect scores
 * and inflated leaderboard rows).
 */
function scoreAnswers(answers, questions) {
    let correct = 0;
    let skipped = 0;
    (answers || []).forEach((a, i) => {
        if (a === LIFELINE_SKIP) { skipped += 1; return; }
        if (a === questions[i]?.correct_index) correct += 1;
    });
    return { correct, skipped, total: Math.max(1, (questions?.length || 0) - skipped) };
}

// Strategy mode configuration
const STRATEGY_MODES = {
    mtt: {
        title: 'MTT Scenarios',
        subtitle: 'Multi-Table Tournament Situations',
        categories: ['mtt_situations'],
        color: '#f97316',
        icon: 'target'
    },
    cash: {
        title: 'Cash Game',
        subtitle: 'Deep Stack Scenarios & Implied Odds',
        categories: ['cash_game_situations'],
        color: '#22c55e',
        icon: 'dollar'
    },
    icm: {
        title: 'ICM & Chip EV',
        subtitle: 'Tournament Equity Decisions',
        categories: ['icm_chip_ev'],
        color: '#06b6d4',
        icon: 'chart'
    },
    gto: {
        title: 'GTO Master',
        subtitle: 'Solver-Based Strategy Scenarios',
        categories: ['gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev'],
        color: '#a855f7',
        icon: 'brain'
    }
};

// Lobby image mapping — modes with full-bleed lobby images
const LOBBY_IMAGES = {
    mtt: '/images/trivia/lobby-mtt.jpg',
    cash: '/images/trivia/lobby-cash.jpg',
    icm: '/images/trivia/lobby-icm.jpg',
    gto: '/images/trivia/lobby-gto.jpg',
};

// Helper functions for GTO analysis generation
function generateGTOApproach(question) {
    const category = question?.category || '';
    const correctAnswer = question?.options?.[question?.correct_index] || '';

    const approaches = {
        'gto_theory': `Solver-based strategy involves a balanced range construction. ${correctAnswer.includes('bet') || correctAnswer.includes('raise') ? 'By taking aggressive action here, we build the pot while protecting our equity.' : 'This line optimizes our expected value against a balanced opponent strategy.'}`,
        'mtt_situations': `In tournament play, ICM pressure and stack dynamics dictate optimal frequencies. ${correctAnswer.includes('fold') ? 'Folding here preserves tournament equity by avoiding marginal situations.' : 'This aggressive line maximizes fold equity while maintaining tournament life.'}`,
        'cash_game_situations': `Deep stack play requires careful consideration of implied odds and equity realization. ${correctAnswer.includes('call') ? 'Calling preserves stack-to-pot ratio advantages for future streets.' : 'This sizing exploits our range advantage on this texture.'}`,
        'icm_chip_ev': `ICM calculations show significant risk premium in this spot. The chip EV vs $EV differential requires adjusting our standard frequencies to account for pay jump implications.`
    };

    return approaches[category] || 'This action maximizes expected value given the game tree and opponent tendencies.';
}

/**
 * REAL solver metadata only.
 * ═══════════════════════════════════════════════════════════════════════════
 * This used to be generateEVAnalysis()/generateAlternateLines(): a fixed EV of
 * +0.85/+1.25/+1.75 BB keyed on difficulty alone, and 15%/10%/5% frequencies
 * assigned by option POSITION, presented to the player as solver output. Any
 * competent player spots identical "solver" numbers on every question, and the
 * product's whole claim is credibility.
 *
 * Now the panel renders numbers only when the question row actually carries
 * them in trivia_questions.engine_metadata (Phase 49 column: gtoFrequencies,
 * evData). When it does not, the EV/alternate-lines sections are omitted and
 * only the question's own explanation is shown.
 *
 * @returns {{confidence:number|null, evAnalysis:object|null, alternateLines:object[]}}
 */
function readSolverMetadata(question) {
    const empty = { confidence: null, evAnalysis: null, alternateLines: [] };
    const meta = question?.engine_metadata;
    if (!meta || typeof meta !== 'object') return empty;

    const out = { ...empty };

    // EV — accept evData.ev / evData.value / evBB, in big blinds.
    const ev = meta.evData ?? meta.ev ?? null;
    const evValue = typeof ev === 'number'
        ? ev
        : (Number.isFinite(ev?.ev) ? ev.ev : (Number.isFinite(ev?.value) ? ev.value : null));
    if (Number.isFinite(evValue)) {
        out.evAnalysis = {
            value: Math.round(evValue * 100) / 100,
            description: typeof ev?.description === 'string'
                ? ev.description
                : 'Expected value of the solver-preferred line for this spot, in big blinds.',
        };
    }

    // Frequencies — { FOLD: 12, CALL: 33, ... } or [{action, frequency}]
    const freqs = meta.gtoFrequencies ?? meta.frequencies ?? null;
    let rows = [];
    if (Array.isArray(freqs)) {
        rows = freqs
            .filter(f => f && typeof f.action === 'string' && Number.isFinite(f.frequency))
            .map(f => ({ action: String(f.action).toUpperCase(), frequency: Math.round(f.frequency), description: f.description || '' }));
    } else if (freqs && typeof freqs === 'object') {
        rows = Object.entries(freqs)
            .filter(([, v]) => Number.isFinite(v))
            .map(([k, v]) => ({ action: String(k).toUpperCase(), frequency: Math.round(v), description: '' }));
    }
    if (rows.length > 0) {
        rows.sort((a, b) => b.frequency - a.frequency);
        out.confidence = Math.max(0, Math.min(100, rows[0].frequency));
        out.alternateLines = rows.slice(1, 3).map(r => ({
            ...r,
            description: r.description || 'Mixed-strategy branch reported by the solver for this node.',
        }));
    }

    return out;
}

// ════════════════════════════════════════════════════
// Graphic Playing Card Renderer
// ════════════════════════════════════════════════════
function PlayingCard({ card, size = 'inline' }) {
    if (!card) return null;

    const suit = card[card.length - 1]?.toLowerCase();
    const rank = card.slice(0, -1)?.toUpperCase();
    const SUIT_CONFIG = {
        s: { symbol: '♠', color: '#1a1a1a' },
        h: { symbol: '♥', color: '#ef4444' },
        d: { symbol: '♦', color: '#3b82f6' },
        c: { symbol: '♣', color: '#22c55e' }
    };
    const config = SUIT_CONFIG[suit] || SUIT_CONFIG.s;

    const sizes = {
        inline: { width: 16, height: 24, fontSize: 11 },
        small: { width: 36, height: 50, fontSize: 12 },
        medium: { width: 52, height: 72, fontSize: 16 },
        large: { width: 68, height: 94, fontSize: 20 },
    };
    const s = sizes[size] || sizes.inline;

    return (
        <span style={{
            width: s.width,
            height: s.height,
            background: 'linear-gradient(135deg, #fff, #f5f5f5)',
            borderRadius: 3,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            fontWeight: 'bold',
            fontSize: s.fontSize,
            color: config.color,
            margin: '0 2px',
            verticalAlign: 'text-bottom',
        }}>
            <span style={{ lineHeight: 1 }}>{rank}</span>
            <span style={{ fontSize: s.fontSize * 1.1, lineHeight: 1 }}>{config.symbol}</span>
        </span>
    );
}

/**
 * Render poker card notation (Ah, Ks, 10d, 4c) as graphic cards.
 *
 * Two bugs fixed here:
 *  1. The regex carried the /i flag, so ordinary English matched: "as", "ah",
 *     "ad", "ac" all became playing cards. Canonical notation is an UPPERCASE
 *     rank plus a LOWERCASE suit, so the flag is gone.
 *  2. The pipeline title-cased FIRST, which manufactured "As" out of every
 *     mid-sentence "as" and then matched it. Matching now runs on the raw
 *     string and the caller's text transform (toTitleCase) is applied to the
 *     non-card fragments only.
 *
 * A lone letter-ranked token ("As", "Ad") is still ambiguous with English, so
 * letter ranks only render as a card when they sit next to another card token
 * ("AhKs", "Ah Ks 7d"). Digit ranks ("7d", "10c") are unambiguous and always
 * render. Worst case a real card renders as plain text — never the reverse.
 *
 * @param {string} text
 * @param {(s: string) => string} [transform] applied to non-card fragments
 */
function renderTextWithCards(text, transform) {
    if (!text) return null;
    const apply = typeof transform === 'function' ? transform : (s => s);
    const cardRegex = /\b(10|[2-9]|[TJQKA])([shdc])\b/g;

    const matches = [];
    let m;
    while ((m = cardRegex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, rank: m[1], suit: m[2] });
    }
    if (matches.length === 0) return apply(text);

    // A letter-ranked token counts only when it neighbours another candidate
    // (allowing at most one space between, e.g. "Ah Ks 7d").
    const isDigitRank = r => /^(10|[2-9])$/.test(r);
    const keep = matches.map((cur, i) => {
        if (isDigitRank(cur.rank)) return true;
        const prev = matches[i - 1];
        const next = matches[i + 1];
        const adjacent = (a, b) => a && b && (b.start - a.end) <= 1;
        return adjacent(prev, cur) || adjacent(cur, next);
    });

    const result = [];
    let cursor = 0;
    matches.forEach((match, i) => {
        if (!keep[i]) return;
        if (match.start > cursor) result.push(apply(text.slice(cursor, match.start)));
        result.push(
            <PlayingCard key={`c${match.start}`} card={`${match.rank}${match.suit}`} size="inline" />
        );
        cursor = match.end;
    });
    if (cursor < text.length) result.push(apply(text.slice(cursor)));
    return result;
}

export default function StrategyTrivia({ mode }) {
    const router = useRouter();
    const config = STRATEGY_MODES[mode] || STRATEGY_MODES.mtt;

    // ═══════════════════════════════════════════════════════════════════
    // HARDENED: Source VIP status from centralized useVIP hook
    // (server-verified via AvatarContext → /api/vip/check-status)
    // instead of independently calling DiamondEngine.isVIP()
    // ═══════════════════════════════════════════════════════════════════
    const { isVip, userId: vipUserId, initializing: vipInitializing } = useVIP();
    // Reactive auth — was empty-deps useEffect with getAuthUser(). If auth
    // wasn't hydrated when the component first mounted (common during cold
    // SSR-hydration), localUserId stayed null forever and the user got an
    // anon flow even after login. Drives the init useEffect.
    const { user: avatarUser, loading: avatarLoading } = useAvatar();

    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, results
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [answers, setAnswers] = useState([]);

    // Lifelines
    const [fiftyFiftyUsed, setFiftyFiftyUsed] = useState(false);
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [skipUsed, setSkipUsed] = useState(false);
    const [lifelinesUsedCount, setLifelinesUsedCount] = useState(0);
    const MAX_LIFELINES = 3;
    const LIFELINE_COST = 5;

    // Phase 68: actually-awarded amount + error message, surfaced from
    // finishGame to the results screen so the displayed diamonds match
    // reality when the diamond RPC fails (was always showing the
    // calculated amount even when the balance never moved).
    const [resultActualAwarded, setResultActualAwarded] = useState(null);
    const [resultAwardError, setResultAwardError] = useState(null);
    // Final tally for the results screen: correct / skipped / effective total.
    const [resultSummary, setResultSummary] = useState(null);
    const [resultCapped, setResultCapped] = useState(false);
    // Entry-flow error (question load failure, signed-out, etc.)
    const [entryError, setEntryError] = useState(null);
    const [isPreparing, setIsPreparing] = useState(false);

    // User data — userId from useVIP, fallback to getAuthUser
    const [localUserId, setLocalUserId] = useState(null);
    const userId = vipUserId || localUserId;
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const startTimeRef = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race
    const answersRef = useRef([]); // Ref mirror — avoids stale closure in skip→finishGame

    // Per-game idempotency nonce. Reference ids used to be
    // `strategy_fifty_${mode}_${user}_${questionIndex}` — identical on every
    // replay, so the DB idempotency table swallowed the charge while the
    // lifeline was still granted (free lifelines forever after game 1), and
    // the reward id was per-MINUTE, so two short games in one minute paid once.
    const gameNonceRef = useRef(null);
    const finishedRef = useRef(false);      // finishGame runs at most once per game
    const advanceLockRef = useRef(false);   // Next button double-click guard
    const fiftyInFlightRef = useRef(false);
    const skipInFlightRef = useRef(false);

    // Ids already served in THIS sitting — never re-serve them on Play Again.
    const sessionServedIdsRef = useRef(new Set());

    // Entry price for this mode (config first, see getEntryCost).
    const entryCost = getEntryCost(mode);

    // Phase 68: track pending setTimeouts so unmount cancels them. Without
    // this, the 300ms skip-advance setTimeout would fire on an unmounted
    // component when the user navigated away mid-skip.
    const _pendingTimeoutsRef = useRef(new Set());
    const _isMountedRef = useRef(true);
    const safeSetTimeout = (fn, delay) => {
        const id = setTimeout(() => {
            _pendingTimeoutsRef.current.delete(id);
            if (_isMountedRef.current) fn();
        }, delay);
        _pendingTimeoutsRef.current.add(id);
        return id;
    };
    useEffect(() => () => {
        _isMountedRef.current = false;
        for (const id of _pendingTimeoutsRef.current) clearTimeout(id);
        _pendingTimeoutsRef.current.clear();
    }, []);

    const currentQuestion = questions[currentQuestionIndex];

    // Keep answersRef in sync with answers state
    useEffect(() => { answersRef.current = answers; }, [answers]);

    // Preloaded question set (loaded in the background while the user looks at
    // the lobby image). ALWAYS consumed exactly once: startGame clears it and
    // immediately preloads the NEXT set, so Play Again serves fresh questions.
    const [preloadedQuestions, setPreloadedQuestions] = useState(null);
    const [preloadFailed, setPreloadFailed] = useState(false);
    const preloadInFlightRef = useRef(false);

    // Initialize. Re-runs on auth resolution so the user is properly wired up
    // even if AvatarContext was still loading on first render.
    useEffect(() => {
        if (avatarLoading) return;
        const user = avatarUser || getAuthUser();
        if (user) {
            setLocalUserId(user.id);
            loadUserDiamonds(user.id);
            DiamondEngine.init(user.id);
        }
        setIsLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [avatarUser?.id, avatarLoading]);

    /**
     * Fetch ONE fresh set of questions.
     *
     * Replaces two hand-rolled loaders that both did `select('*')` with no
     * limit (capped at PostgREST's 1000-row default, so anything past the
     * first 1000 rows in a category was unreachable) and applied the 60-day
     * exclusion inconsistently. Everything now goes through the shared loader:
     * global 60-day exclusion, quality floor, multi-page random sampling and
     * oldest-seen-first degradation, plus a hard exclusion of ids already
     * served in this sitting.
     */
    const fetchQuestionSet = useCallback(async () => {
        const categories = config.categories;
        const sessionExcludeIds = sessionServedIdsRef.current;

        try {
            // 1. Today's daily roster for these categories, if it is deep enough.
            const today = getTodayCST();
            const { data: dailyData, error: dailyErr } = await supabase
                .from('trivia_questions')
                .select('id, category, difficulty, question, options, correct_index, explanation, quality_score')
                .in('category', categories)
                .eq('daily_date', today)
                .gte('quality_score', MIN_QUALITY_SCORE)
                .limit(500);

            if (!dailyErr && dailyData && dailyData.length >= QUESTIONS_PER_GAME) {
                const { ids: seenIds } = await getSeenHistory(supabase, userId, {});
                // Shuffled by the loader — the old code sliced the DB's return
                // order, so every player got the same first 20 in the same order.
                const ordered = filterAndShuffle(dailyData, seenIds, QUESTIONS_PER_GAME, {
                    minQualityScore: MIN_QUALITY_SCORE,
                    sessionExcludeIds,
                });
                if (ordered.length >= QUESTIONS_PER_GAME) {
                    return await withSolverMetadata(ordered.slice(0, QUESTIONS_PER_GAME));
                }
            }

            // 2. Full pool through the shared no-repeat pipeline.
            const { questions: loaded } = await loadQuestionsForUser(supabase, {
                userId,
                category: categories,
                count: QUESTIONS_PER_GAME,
                minQuality: MIN_QUALITY_SCORE,
                sessionExcludeIds,
            });
            // The loader's server-side RPC fast path cannot see this session's
            // served ids, so enforce them here too.
            const fresh = (loaded || []).filter(q => q && !sessionExcludeIds.has(q.id));
            if (fresh.length >= QUESTIONS_PER_GAME) {
                return await withSolverMetadata(fresh.slice(0, QUESTIONS_PER_GAME));
            }

            // 3. Last resort before the offline bank: sample the pool directly
            //    with the session exclusion applied.
            const { ids: seenIds } = await getSeenHistory(supabase, userId, {});
            const pool = await fetchRandomQuestionPool(supabase, {
                category: categories,
                minQuality: MIN_QUALITY_SCORE,
                pageSize: Math.max(200, QUESTIONS_PER_GAME * 10),
                excludeIds: seenIds,
                want: QUESTIONS_PER_GAME,
                attempts: 3,
            });
            const ordered = filterAndShuffle(pool, seenIds, QUESTIONS_PER_GAME, {
                minQualityScore: MIN_QUALITY_SCORE,
                sessionExcludeIds,
            });
            if (ordered.length > 0) {
                return await withSolverMetadata(ordered.slice(0, QUESTIONS_PER_GAME));
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Question load failed:', e?.message || e);
        }

        return getFallbackQuestions(mode);
    }, [mode, userId, config.categories]);

    /**
     * Attach engine_metadata (Phase 49 JSONB: gtoFrequencies, evData) to a
     * chosen set so the analysis panel can show REAL solver numbers where they
     * exist. The shared loader selects gameplay columns only, so this is a
     * single follow-up query for the 20 ids actually served. Failure is
     * non-fatal: the panel just omits the EV/frequency sections.
     */
    async function withSolverMetadata(rows) {
        const ids = (rows || []).filter(isRealQuestion).map(q => q.id);
        if (ids.length === 0) return rows;
        try {
            const { data, error } = await supabase
                .from('trivia_questions')
                .select('id, engine_metadata')
                .in('id', ids);
            if (error || !data) return rows;
            const byId = new Map(data.map(r => [r.id, r.engine_metadata]));
            return rows.map(q => (byId.has(q.id) ? { ...q, engine_metadata: byId.get(q.id) } : q));
        } catch (e) {
            console.warn('[StrategyTrivia] metadata fetch skipped:', e?.message || e);
            return rows;
        }
    }

    /** Load the next set into preloadedQuestions (idempotent, background-safe). */
    const preloadQuestions = useCallback(async () => {
        if (preloadInFlightRef.current) return;
        preloadInFlightRef.current = true;
        try {
            let set = await fetchQuestionSet();
            // A preload started before the current game began cannot know which
            // ids that game consumed. If the result overlaps, fetch once more
            // (the session exclusion is now up to date) rather than handing the
            // player a Play Again set containing questions they just answered.
            const overlaps = (set || []).some(q => isRealQuestion(q) && sessionServedIdsRef.current.has(q.id));
            if (overlaps) set = await fetchQuestionSet();
            if (!_isMountedRef.current) return;
            setPreloadedQuestions(set && set.length > 0 ? set : null);
            setPreloadFailed(!set || set.length === 0);
        } finally {
            preloadInFlightRef.current = false;
        }
    }, [fetchQuestionSet]);

    // Preload once auth has resolved. userId is in the dep list because the
    // 60-day exclusion is per-user: the old effect read userId from the same
    // render in which setLocalUserId was called, so on the common path the
    // preloaded set was built with NO seen-history filter at all.
    useEffect(() => {
        if (avatarLoading || vipInitializing) return;
        if (gameState !== 'lobby') return;
        if (preloadedQuestions) return;
        preloadQuestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [avatarLoading, vipInitializing, userId, gameState]);

    async function loadUserDiamonds(uid) {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', uid)
                .maybeSingle();
            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Failed to load diamonds:', e);
        }
    }

    // ══ TIMER ══
    // Was a setInterval whose updater called handleTimeout() — a side effect
    // inside a setState updater. React 18 may invoke updaters twice, and
    // handleTimeout -> selectAnswer(-1) appends to answers[], so a double
    // invocation pushed TWO entries and permanently misaligned answers[]
    // against questions[] (every later answer scored against the wrong
    // question). The shared hook keeps its updater pure, fires onTimeout once,
    // is anchored to a wall-clock deadline (no drift) and pauses when the tab
    // is hidden instead of burning the clock in the background.
    const { timeLeft, resetTimer, setIsTimerRunning } = useTriviaTimer({
        initialTime: SECONDS_PER_QUESTION,
        showResult,
        gameState,
        playingState: 'playing',
        pauseOnHide: true,
        onTimeout: () => { handleTimeout(); },
    });

    /**
     * Offline bank used only when the database is unreachable.
     *
     * These carry non-UUID ids on purpose: history rows are filtered to
     * UUID-shaped ids (the FK to trivia_questions would reject them), and
     * isFallbackSet() below makes a fallback run NON-REWARDING. Before that,
     * a 2-question outage bank meant a 20-second "perfect" game paid the full
     * mode reward plus the perfect bonus.
     */
    function getFallbackQuestions(mode) {
        const fallbacks = {
            mtt: [
                {
                    id: 'mtt-fb-1',
                    category: 'mtt_situations',
                    difficulty: 'medium',
                    question: 'You have 15BB on the bubble with AKo in the CO. UTG (40BB) opens 2.5x. Best action?',
                    options: ['Fold', 'Call', 'Shove', '3-Bet to 7BB'],
                    correct_index: 2,
                    explanation: 'With 15BB and AKo, shoving exploits fold equity and ICM pressure on the opener.'
                },
                {
                    id: 'mtt-fb-2',
                    category: 'mtt_situations',
                    difficulty: 'hard',
                    question: 'Final table, 5 players left. You have 25BB, chip leader has 60BB. What adjustment should you make?',
                    options: ['Play tighter overall', 'Attack short stacks only', 'Play your normal game', 'Attack the chip leader'],
                    correct_index: 0,
                    explanation: 'With pay jumps imminent, playing tighter preserves equity against short stacks who will bust.'
                },
                {
                    id: 'mtt-fb-3',
                    category: 'mtt_situations',
                    difficulty: 'easy',
                    question: 'You open to 2.2x from the BTN with 40BB and the BB defends. Why is a small continuation bet good on a dry board?',
                    options: ['It denies equity cheaply', 'It builds the pot for value only', 'It disguises your monsters', 'It is never good'],
                    correct_index: 0,
                    explanation: 'A small c-bet on a dry board denies the BB equity at a low price and keeps your whole range in.'
                },
                {
                    id: 'mtt-fb-4',
                    category: 'mtt_situations',
                    difficulty: 'medium',
                    question: 'With 8BB in the SB and folded to you, which hand class should you shove widest?',
                    options: ['Suited connectors', 'Any two broadway cards', 'Small pairs only', 'Only premium hands'],
                    correct_index: 1,
                    explanation: 'At 8BB the BB calls wide, so card strength beats playability: broadways dominate the calling range.'
                },
                {
                    id: 'mtt-fb-5',
                    category: 'mtt_situations',
                    difficulty: 'medium',
                    question: 'A late-registration player sits with 100BB while the average is 30BB. How does that change your opens?',
                    options: ['Open larger against them', 'Avoid marginal spots out of position to them', 'Ignore stack sizes', 'Always 3-bet them'],
                    correct_index: 1,
                    explanation: 'Deeper effective stacks amplify positional disadvantage, so tighten the hands you play out of position.'
                },
                {
                    id: 'mtt-fb-6',
                    category: 'mtt_situations',
                    difficulty: 'hard',
                    question: 'You are second in chips at a 9-handed final table with a huge pay jump one elimination away. The big stack opens your BB. You hold 88 with 30BB. Best default?',
                    options: ['Shove', 'Call', '3-bet small', 'Fold'],
                    correct_index: 1,
                    explanation: 'Calling keeps the pot controlled and avoids a stack-off with the only player who can bust you before the pay jump.'
                }
            ],
            cash: [
                {
                    id: 'cash-fb-1',
                    category: 'cash_game_situations',
                    difficulty: 'medium',
                    question: 'You have 100BB with 77 in MP. UTG opens 3x. What factor most influences your decision?',
                    options: ['Stack depth', 'Position', 'Table image', 'All equally important'],
                    correct_index: 0,
                    explanation: 'Set-mining profitability is directly tied to stack depth - you need implied odds.'
                },
                {
                    id: 'cash-fb-2',
                    category: 'cash_game_situations',
                    difficulty: 'hard',
                    question: 'Deep 250BB effective. You 3-bet with AQs, villain 4-bets. Pot is 45BB. Best action?',
                    options: ['Fold', 'Call', '5-Bet shove', '5-Bet small'],
                    correct_index: 1,
                    explanation: 'With 250BB stacks, AQs plays well deep and 5-betting turns your hand into a bluff.'
                },
                {
                    id: 'cash-fb-3',
                    category: 'cash_game_situations',
                    difficulty: 'easy',
                    question: 'What does a low stack-to-pot ratio on the flop generally favour?',
                    options: ['Drawing hands', 'Made hands that can commit', 'Bluff-heavy strategies', 'Checking every street'],
                    correct_index: 1,
                    explanation: 'A low SPR removes future streets of leverage, so top-pair-type made hands can get stacks in profitably.'
                },
                {
                    id: 'cash-fb-4',
                    category: 'cash_game_situations',
                    difficulty: 'medium',
                    question: 'You hold 9h8h on a Jh 7h 2c flop in a single-raised pot in position. Why is a raise attractive versus a bet?',
                    options: ['You have no equity', 'It builds a pot with a strong draw and fold equity', 'It protects a made hand', 'It is a value raise only'],
                    correct_index: 1,
                    explanation: 'A flush draw plus a gutshot has enough equity to raise for value against a range that folds often enough.'
                },
                {
                    id: 'cash-fb-5',
                    category: 'cash_game_situations',
                    difficulty: 'medium',
                    question: 'A recreational player limps and calls raises constantly. What is the single biggest adjustment?',
                    options: ['Bluff more on every street', 'Isolate wider in position and value bet thinner', 'Play only premium hands', 'Always 3-bet the limp'],
                    correct_index: 1,
                    explanation: 'Value comes from playing more pots in position against the weak range and betting thinner for value.'
                },
                {
                    id: 'cash-fb-6',
                    category: 'cash_game_situations',
                    difficulty: 'hard',
                    question: 'You bet the flop and turn on a wet board and the river bricks. Villain has called twice. What most often justifies a third barrel?',
                    options: ['Your hand has showdown value', 'Blockers to the hands that call', 'The pot is large', 'You want to see a showdown'],
                    correct_index: 1,
                    explanation: 'Third barrels need blockers to villains continuing range; card removal is what turns a marginal bluff profitable.'
                }
            ],
            icm: [
                {
                    id: 'icm-fb-1',
                    category: 'icm_chip_ev',
                    difficulty: 'hard',
                    question: 'Bubble situation: you have 20BB, shortest stack has 5BB. Chip EV says shove, but what about ICM?',
                    options: ['ICM always agrees with chip EV', 'ICM says fold more often', 'ICM says shove more often', 'ICM is irrelevant here'],
                    correct_index: 1,
                    explanation: 'ICM pressure makes you fold more than chip EV suggests - short stack elimination increases equity.'
                },
                {
                    id: 'icm-fb-2',
                    category: 'icm_chip_ev',
                    difficulty: 'medium',
                    question: 'What is the "risk premium" in ICM?',
                    options: ['Extra chips you need to justify a call', 'The rake taken by the house', 'Your equity in the prize pool', 'The value of position'],
                    correct_index: 0,
                    explanation: 'Risk premium is the additional equity you need to call vs. chip EV due to ICM.'
                },
                {
                    id: 'icm-fb-3',
                    category: 'icm_chip_ev',
                    difficulty: 'easy',
                    question: 'In a satellite where every remaining seat pays the same, what happens to marginal calls?',
                    options: ['They become much worse', 'They become much better', 'Nothing changes', 'They only matter for the chip leader'],
                    correct_index: 0,
                    explanation: 'Flat payouts make survival almost everything: a marginal call risks a seat to win chips worth nearly nothing.'
                },
                {
                    id: 'icm-fb-4',
                    category: 'icm_chip_ev',
                    difficulty: 'medium',
                    question: 'Which stack applies the most ICM pressure at a final table?',
                    options: ['The shortest stack', 'The big stack, against medium stacks', 'The medium stack, against the big stack', 'Every stack equally'],
                    correct_index: 1,
                    explanation: 'The big stack risks least and can bust medium stacks who have the most to lose, so its aggression is cheapest.'
                },
                {
                    id: 'icm-fb-5',
                    category: 'icm_chip_ev',
                    difficulty: 'hard',
                    question: 'Two short stacks are all-in at another table on the money bubble. How should that affect your marginal spot?',
                    options: ['Play more aggressively', 'Wait: your equity rises for free', 'Nothing changes', 'Always call to accumulate'],
                    correct_index: 1,
                    explanation: 'Someone else busting raises your equity at zero risk, so marginal gambles become even less attractive.'
                },
                {
                    id: 'icm-fb-6',
                    category: 'icm_chip_ev',
                    difficulty: 'medium',
                    question: 'Why is doubling your stack worth less than double in a tournament?',
                    options: ['Because of rake', 'Because prize pool equity is concave in chips', 'Because blinds rise', 'It is worth exactly double'],
                    correct_index: 1,
                    explanation: 'Prize equity grows more slowly than chips: the second half of a doubled stack is worth less than the first.'
                }
            ],
            gto: [
                {
                    id: 'gto-fb-1',
                    category: 'gto_theory',
                    difficulty: 'hard',
                    question: 'In GTO, why do we use mixed strategies (sometimes check, sometimes bet)?',
                    options: ['To confuse opponents', 'To balance our range', 'Because we are unsure', 'To save chips'],
                    correct_index: 1,
                    explanation: 'Mixed strategies balance our range so opponents cannot exploit us with any counter-strategy.'
                },
                {
                    id: 'gto-fb-2',
                    category: 'gto_theory',
                    difficulty: 'medium',
                    question: 'What is the Minimum Defense Frequency (MDF) vs a pot-sized bet?',
                    options: ['33%', '50%', '67%', '75%'],
                    correct_index: 1,
                    explanation: 'MDF vs pot-sized bet is 1/(1+1) = 50%. You must defend at least 50% to prevent opponent profiting.'
                },
                {
                    id: 'gto-fb-3',
                    category: 'gto_theory',
                    difficulty: 'easy',
                    question: 'A half-pot bluff needs to work how often to break even immediately?',
                    options: ['25%', '33%', '50%', '67%'],
                    correct_index: 1,
                    explanation: 'Risk 0.5 to win 1.0: the bluff must succeed 0.5 / 1.5 = 33% of the time to break even.'
                },
                {
                    id: 'gto-fb-4',
                    category: 'gto_theory',
                    difficulty: 'medium',
                    question: 'What does having a range advantage on a board usually allow?',
                    options: ['Betting small at a high frequency', 'Always checking', 'Only betting big', 'Folding more'],
                    correct_index: 0,
                    explanation: 'When your range is stronger across the board, small bets at high frequency pressure the whole opposing range cheaply.'
                },
                {
                    id: 'gto-fb-5',
                    category: 'gto_theory',
                    difficulty: 'hard',
                    question: 'What is a blocker, in solver terms?',
                    options: ['A card that stops the action', 'A card in your hand that removes combinations from their range', 'A bet size that stops bluffs', 'A position advantage'],
                    correct_index: 1,
                    explanation: 'Blockers remove combinations from the opponent range, shifting how often they can continue and which bluffs are best.'
                },
                {
                    id: 'gto-fb-6',
                    category: 'gto_theory',
                    difficulty: 'medium',
                    question: 'Why does a polarized range prefer large bet sizes?',
                    options: ['To look strong', 'Because value hands and bluffs both gain from maximum pressure', 'To save money', 'Because it is faster'],
                    correct_index: 1,
                    explanation: 'A polarized range wants maximum fold equity for the bluffs and maximum value from the strong hands - both favour big sizing.'
                }
            ]
        };

        return fallbacks[mode] || fallbacks.gto;
    }

    /** Any non-UUID id means this run came from the offline bank. */
    function isFallbackSet(list) {
        return (list || []).some(q => !isRealQuestion(q));
    }

    /**
     * Start (or restart) a game.
     *
     * Billing changes vs the previous version:
     *  - The forgeable sessionStorage 'trivia_paid' flag is GONE. Anyone could
     *    set it in devtools and play for free; the lobby also set it after
     *    charging, which meant lobby entry and direct-URL entry cost different
     *    amounts for the same mode. The destination page (this component) is
     *    now the only charger, and the DB deduction RPC — server-verified and
     *    idempotency-keyed — is the entitlement.
     *  - Entry is blocked until the VIP check resolves, so a VIP who taps fast
     *    is no longer charged as a non-VIP.
     *  - Questions are resolved BEFORE the charge, so a failed load can never
     *    take diamonds without giving a game.
     */
    async function startGame() {
        if (isStartingRef.current) return;
        // Race: isVip is false until the async VIP check resolves.
        if (vipInitializing) return;
        isStartingRef.current = true;
        setEntryError(null);
        setIsPreparing(true);
        try {
            // 1. Resolve a question set first (preloaded set is consumed once).
            let set = preloadedQuestions;
            if (!set || set.length === 0) {
                set = await fetchQuestionSet();
            }
            if (!set || set.length === 0) {
                setPreloadFailed(true);
                setEntryError('Questions could not be loaded right now. Please try again in a moment.');
                return;
            }

            // 2. Server-authoritative entry charge for non-VIP users.
            if (!isVip && entryCost > 0) {
                if (!userId) {
                    setEntryError('Please sign in to play this mode.');
                    return;
                }
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
                    console.warn('[StrategyTrivia] Balance check failed:', e);
                }

                if (freshBalance < entryCost) {
                    setShowOutOfDiamonds(true);
                    return;
                }

                try {
                    await DiamondEngine.init(userId);
                    const result = await DiamondEngine.deduct(entryCost, 'game_cost', { mode, game: 'trivia' });
                    if (!result?.success) {
                        setShowOutOfDiamonds(true);
                        return;
                    }
                    if (result.balance !== undefined) setUserDiamonds(result.balance);
                    busEmit.diamondsSpent(entryCost, `${config.title} Entry`);
                } catch (e) {
                    console.warn('[StrategyTrivia] Diamond deduction failed:', e);
                    setEntryError('The entry charge could not be completed. You have not been charged.');
                    return;
                }
            }

            // 3. Consume the set and start. Everything below is synchronous so
            //    a paid entry always lands in a playable game.
            sessionServedIdsRef.current = new Set([
                ...sessionServedIdsRef.current,
                ...set.filter(isRealQuestion).map(q => q.id),
            ]);
            setPreloadedQuestions(null);
            setQuestions(set);

            gameNonceRef.current = makeNonce();
            finishedRef.current = false;
            advanceLockRef.current = false;
            fiftyInFlightRef.current = false;
            skipInFlightRef.current = false;

            setResultActualAwarded(null);
            setResultAwardError(null);
            setResultSummary(null);
            setResultCapped(false);
            setGameState('playing');
            setCurrentQuestionIndex(0);
            setCorrectCount(0);
            setAnswers([]);
            answersRef.current = [];
            setSelectedAnswer(null);
            setShowResult(false);
            setFiftyFiftyUsed(false);
            setEliminatedOptions([]);
            setSkipUsed(false);
            setLifelinesUsedCount(0);
            startTimeRef.current = Date.now();
            resetTimer(SECONDS_PER_QUESTION);

            // 4. Warm the NEXT set in the background. This is what makes Play
            //    Again serve fresh questions: the old code kept one preloaded
            //    array forever, so every replay was the SAME 20 questions in
            //    the SAME order — memorize once, then farm the perfect bonus.
            preloadQuestions();
        } finally {
            setIsPreparing(false);
            isStartingRef.current = false;
        }
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        selectAnswer(TIMEOUT_ANSWER);
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null || showResult) return;

        setIsTimerRunning(false);
        setSelectedAnswer(index);
        setShowResult(true);

        const isCorrect = index === currentQuestion?.correct_index;
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            busEmit.decisionCorrect(correctCount + 1);
        } else {
            busEmit.decisionIncorrect(correctCount);
            busEmit.screenShake('light');
        }
        // Mirror into the ref immediately: finishGame and the skip lifeline
        // both read answersRef, and a double-click must not be able to append
        // twice through a stale render.
        const next = [...answersRef.current, index];
        answersRef.current = next;
        setAnswers(next);
    }

    function nextQuestion() {
        // Double-clicking Next used to run setCurrentQuestionIndex(prev+1)
        // twice, skipping a question with no answer appended and misaligning
        // answers[] against questions[] for the rest of the game.
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;

        if (currentQuestionIndex + 1 >= questions.length) {
            finishGame();
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedAnswer(null);
        setShowResult(false);
        setEliminatedOptions([]);
        resetTimer(SECONDS_PER_QUESTION);
    }

    // Release the advance lock once the new question has rendered.
    useEffect(() => { advanceLockRef.current = false; }, [currentQuestionIndex]);

    async function finishGame() {
        // Double-clicking 'See Results' used to run two concurrent finishGame
        // calls: two trivia_scores inserts (duplicate leaderboard rows) and two
        // reward RPCs.
        if (finishedRef.current) return;
        finishedRef.current = true;

        setIsTimerRunning(false);
        const timeSpent = Math.max(0, Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000));

        // Skips are neutral: excluded from numerator AND denominator.
        const { correct: actualCorrectCount, skipped, total: effectiveTotal } =
            scoreAnswers(answersRef.current, questions);
        setResultSummary({ correct: actualCorrectCount, skipped, total: effectiveTotal });

        // A run served from the offline fallback bank pays nothing: it is a
        // 6-question emergency set, not a 20-question game.
        const fallbackRun = isFallbackSet(questions);
        const rawEarned = fallbackRun
            ? 0
            : calculateDiamonds(mode, actualCorrectCount, effectiveTotal, 0);

        let diamondsEarned = rawEarned;
        let actualAwarded = 0;
        let awardError = null;

        if (userId) {
            // Daily cap — without it, Play Again is an unbounded faucet for
            // anyone who memorizes a category.
            //
            // The cap comes from the shared DAILY_DIAMOND_CAPS table, which now
            // carries paid-mode-aware values (mtt/cash/icm 40, gto 60) instead
            // of the old blanket 10/day. That 10 was below a single perfect GTO
            // run (8 + 15 = 23), so a PAID mode could never return its own
            // 10-diamond entry — the mode was net-negative by construction.
            // The local "two perfect runs" override that used to compensate for
            // that is gone; the table is authoritative. Only the defensive
            // fallback for a mode missing from the table remains.
            if (rawEarned > 0) {
                try {
                    const earnedToday = await getDailyDiamondsEarned(supabase, userId, mode);
                    const modeCfg = getModeConfig(mode) || {};
                    const fallbackCap = Math.max(20, ((modeCfg.diamondReward || 0) + (modeCfg.perfectBonus || 0)) * 2);
                    const dailyCap = DAILY_DIAMOND_CAPS[mode] || fallbackCap;
                    diamondsEarned = clampToCap(earnedToday, rawEarned, dailyCap);
                } catch (e) {
                    console.warn('[StrategyTrivia] Daily cap check failed, awarding uncapped:', e?.message || e);
                    diamondsEarned = rawEarned;
                }
                setResultCapped(diamondsEarned < rawEarned);
            }

            if (diamondsEarned > 0) {
                try {
                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: diamondsEarned,
                        p_type: 'trivia_reward',
                        p_description: `${config.title} reward — ${diamondsEarned} diamonds`,
                        // Per-GAME nonce. Was per (mode, user, MINUTE): two short
                        // games inside one minute paid once, and a retry across a
                        // minute boundary paid twice.
                        p_reference_id: `strategy_reward_${mode}_${userId}_${gameNonceRef.current}`
                    });
                    if (__rpcErr) throw __rpcErr;
                    const { data: freshProfile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (freshProfile) setUserDiamonds(freshProfile.diamonds || 0);
                    busEmit.diamondsEarned(diamondsEarned, `${config.title} Reward`);
                    if (actualCorrectCount >= effectiveTotal) busEmit.celebration('confetti');
                    actualAwarded = diamondsEarned;
                } catch (e) {
                    // Phase 68: was silently swallowing the rpcErr — user saw
                    // diamonds toast and trivia_scores had diamonds_earned set
                    // but balance never moved. Log loudly + record 0 awarded
                    // so the score table doesn't lie.
                    console.warn('[StrategyTrivia] CRITICAL: Diamond reward RPC failed — user owed', diamondsEarned, 'diamonds:', e?.message || e);
                    awardError = e?.message || 'Diamond award failed';
                }
            }

            // Save score to trivia_scores. Capture insert error — supabase-js
            // does NOT throw on DB errors, so the surrounding try/catch only
            // saw network errors. Without this, NOT NULL violations / RLS
            // denials silently dropped scores while UI showed success.
            if (!fallbackRun) {
                try {
                    const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                        user_id: userId,
                        mode,
                        score: actualCorrectCount * 100,
                        correct_count: actualCorrectCount,
                        total_questions: effectiveTotal,
                        time_spent: timeSpent,
                        // Phase 68: was diamondsEarned (the intended amount). Now
                        // actualAwarded — 0 if the RPC failed — so trivia_scores
                        // matches what the user really received.
                        diamonds_earned: actualAwarded,
                        play_date: getTodayCST()
                    });
                    if (scoreErr) throw scoreErr;
                } catch (e) {
                    console.warn('[StrategyTrivia] Error saving score:', e);
                }
            }

            // Record question history for the 60-day non-repeat guarantee.
            // Only UUID-shaped ids: fallback ids like 'mtt-fb-1' violate the FK
            // to trivia_questions.id and PostgREST upserts are all-or-nothing,
            // so one fallback row used to drop the entire batch.
            const realQuestions = (questions || []).filter(isRealQuestion);
            if (realQuestions.length > 0) {
                try {
                    await recordQuestionsSeen(supabase, userId, realQuestions, mode);
                } catch (e) {
                    console.warn('[StrategyTrivia] Error recording history:', e);
                }
            }
        }

        // Phase 68: surface actualAwarded + awardError to results screen
        // so it shows reality, not the calculated-but-failed amount.
        setResultActualAwarded(actualAwarded);
        setResultAwardError(awardError);
        setGameState('results');
    }

    /**
     * Charge a lifeline. Returns true when the player may use it.
     * The reference id carries the per-game nonce AND the question index, so
     * retries inside one game dedup while a replay is charged again.
     */
    async function chargeLifeline(kind, label) {
        if (isVip) return true;
        if (!userId) return false;
        try {
            const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: -LIFELINE_COST,
                p_type: 'strategy_lifeline',
                p_description: `${config.title} ${label} — ${LIFELINE_COST} diamonds`,
                p_reference_id: `strategy_${kind}_${mode}_${userId}_${gameNonceRef.current}_${currentQuestionIndex}`
            });
            if (__rpcErr) throw __rpcErr;
            const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
            busEmit.diamondsSpent(LIFELINE_COST, label);
            return true;
        } catch (e) {
            console.warn(`[StrategyTrivia] ${label} deduct failed:`, e);
            return false;
        }
    }

    // Lifeline: 50/50
    async function useFiftyFifty() {
        if (fiftyInFlightRef.current) return;
        if (fiftyFiftyUsed || lifelinesUsedCount >= MAX_LIFELINES) return;
        if (showResult || selectedAnswer !== null || !currentQuestion) return;
        if (!isVip && userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }
        fiftyInFlightRef.current = true;
        try {
            const paid = await chargeLifeline('fifty', '50/50 Lifeline');
            if (!paid) return;

            // Eliminate 2 wrong answers.
            // Phase 58: was using sort(()=>Math.random()-0.5) which is mathematically
            // biased; some permutations are 2x more likely. Fisher-Yates is uniform.
            const correctIdx = currentQuestion.correct_index;
            const wrongIndices = currentQuestion.options
                .map((_, i) => i)
                .filter(i => i !== correctIdx);
            for (let i = wrongIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
            }
            const toEliminate = wrongIndices.slice(0, 2);

            setEliminatedOptions(toEliminate);
            setFiftyFiftyUsed(true);
            setLifelinesUsedCount(prev => prev + 1);
        } finally {
            fiftyInFlightRef.current = false;
        }
    }

    // Lifeline: Skip Question
    async function useSkip() {
        if (skipInFlightRef.current) return;
        if (skipUsed || lifelinesUsedCount >= MAX_LIFELINES) return;
        if (showResult || selectedAnswer !== null || !currentQuestion) return;
        if (!isVip && userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }
        skipInFlightRef.current = true;
        try {
            const paid = await chargeLifeline('skip', 'Skip Question');
            if (!paid) return;

            // Mark as skipped. NOT as correct: a paid skip used to increment
            // correctCount and be scored as a right answer, so 5 diamonds
            // bought a guaranteed correct answer, purchasable perfect bonuses
            // and an inflated leaderboard score. It is neutral now — excluded
            // from both the numerator and the denominator.
            const next = [...answersRef.current, LIFELINE_SKIP];
            answersRef.current = next;
            setAnswers(next);
            setSkipUsed(true);
            setLifelinesUsedCount(prev => prev + 1);
            setIsTimerRunning(false);
            // Lock answering for the 300ms hand-off. Without this the player
            // could still click an option and append a SECOND entry for this
            // question, shifting answers[] against questions[] for good.
            setSelectedAnswer(LIFELINE_SKIP);

            // Move to next.
            // Phase 68: safeSetTimeout instead of setTimeout — was firing
            // setState / finishGame on an unmounted component when the user
            // navigated away during the 300ms window after pressing Skip.
            safeSetTimeout(() => {
                if (currentQuestionIndex + 1 >= questions.length) {
                    finishGame();
                } else {
                    setCurrentQuestionIndex(prev => prev + 1);
                    setSelectedAnswer(null);
                    setShowResult(false);
                    setEliminatedOptions([]);
                    resetTimer(SECONDS_PER_QUESTION);
                }
            }, 300);
        } finally {
            skipInFlightRef.current = false;
        }
    }

    // ══ KEYBOARD CONTROLS ══ 1-4 / A-D answer, Enter advances.
    useEffect(() => {
        if (gameState !== 'playing') return undefined;
        const onKeyDown = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const target = e.target;
            const tag = (target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

            if (!showResult && selectedAnswer === null && currentQuestion) {
                let idx = -1;
                if (/^[1-9]$/.test(e.key)) idx = parseInt(e.key, 10) - 1;
                else if (/^[a-jA-J]$/.test(e.key)) idx = e.key.toLowerCase().charCodeAt(0) - 97;
                if (idx >= 0 && idx < (currentQuestion.options?.length || 0) && !eliminatedOptions.includes(idx)) {
                    e.preventDefault();
                    selectAnswer(idx);
                    return;
                }
            }
            if (showResult && (e.key === 'Enter' || e.key === ' ') && tag !== 'button' && tag !== 'a') {
                e.preventDefault();
                nextQuestion();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, showResult, selectedAnswer, currentQuestion, eliminatedOptions, currentQuestionIndex, questions.length]);


    if (isLoading) {
        // Was a bare 'Loading...' string on an empty page for the flagship
        // strategy modes; the shared skeleton is what every other trivia
        // entry point shows.
        return (
            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TriviaSkeleton label={`Loading ${config.title}`} />
                </div>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <Head>
                <title>{config.title} - Smarter.Poker Trivia</title>
            </Head>

            <div className="strategy-trivia">
                <UniversalHeader pageDepth={2} />

                {/* Out of Diamonds Modal */}
                {showOutOfDiamonds && (
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Not enough diamonds"
                    >
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                            {/* Was the literal word 'diamonds' rendered at 48px as
                                the modal's hero icon — left over from an emoji strip. */}
                            <div style={{ marginBottom: 16, color: '#00D4FF' }}><Gem size={48} aria-hidden /></div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Not Enough Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', fontSize: 14 }}>You need {entryCost} diamonds to play. Visit the Diamond Store to get more!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button type="button" onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '12px 20px', minHeight: 44, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button type="button" onClick={() => router.push('/hub/diamond-store')} style={{ padding: '12px 20px', minHeight: 44, background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* One-time diamond cost popup for non-VIP users.
                    featureKey, not pageKey: every other call site in the repo
                    passes featureKey, so this popup's per-feature acknowledged
                    tracking was reading undefined on all four strategy modes. */}
                <GameCostPopup
                    userId={userId}
                    featureKey={`trivia_${mode}`}
                    isVip={isVip}
                    cost={entryCost}
                />

                <div className="content">
                    {entryError && (
                        <div className="entry-error" role="alert">
                            <AlertTriangle size={16} aria-hidden />
                            <span>{entryError}</span>
                        </div>
                    )}

                    {/* LOBBY STATE */}
                    {gameState === 'lobby' && (
                        LOBBY_IMAGES[mode] ? (
                            /* Full-bleed image lobby. A real <button>, not a
                               click-only div: this is the primary entry point
                               for the mode and was unreachable by keyboard. */
                            <button
                                type="button"
                                className="lobby-image-wrapper"
                                onClick={startGame}
                                disabled={isPreparing || vipInitializing}
                                aria-label={`${config.title} — start challenge. ${QUESTIONS_PER_GAME} questions${isVip ? ', free for VIP' : `, entry ${entryCost} diamonds`}.`}
                            >
                                <img
                                    src={LOBBY_IMAGES[mode]}
                                    alt={`${config.title} - Start Challenge`}
                                    className="lobby-image"
                                />
                                {(isPreparing || (!preloadedQuestions && !preloadFailed)) && (
                                    <div className="lobby-loading-overlay">
                                        <div className="lobby-spinner" />
                                        <span>{isPreparing ? 'Dealing In...' : 'Loading Questions...'}</span>
                                    </div>
                                )}
                                <div className="lobby-cost-strip">
                                    <span>{QUESTIONS_PER_GAME} Questions</span>
                                    <span className="lobby-cost-chip">
                                        {isVip ? 'VIP: Free Entry' : <>Entry {entryCost} <Gem size={12} aria-hidden /></>}
                                    </span>
                                </div>
                            </button>
                        ) : (
                            /* Fallback text lobby for modes without images */
                            <div className="lobby">
                                <div className="mode-icon">{config.icon === 'target' ? <Target size={48} /> : config.icon === 'dollar' ? <DollarSign size={48} /> : config.icon === 'chart' ? <BarChart3 size={48} /> : <Brain size={48} />}</div>
                                <h1 style={{ color: config.color }}>{config.title}</h1>
                                <p className="subtitle">{config.subtitle}</p>

                                <div className="info-card">
                                    <div className="info-row">
                                        <span>Questions</span>
                                        <span>{QUESTIONS_PER_GAME}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Time Per Question</span>
                                        <span>{SECONDS_PER_QUESTION} Seconds</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Entry</span>
                                        <span>{isVip ? 'Free (VIP)' : <>{entryCost} <Gem size={14} aria-hidden /></>}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Perfect Score Bonus</span>
                                        <span>+{TRIVIA_MODES[mode]?.perfectBonus || 10} <Gem size={14} aria-hidden /></span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="start-btn"
                                    onClick={startGame}
                                    disabled={isPreparing || vipInitializing}
                                    style={{ background: config.color }}
                                >
                                    {isPreparing ? 'Dealing In...' : 'Start Challenge'}
                                </button>
                            </div>
                        )
                    )}

                    {/* PLAYING STATE */}
                    {gameState === 'playing' && currentQuestion && (
                        <div className="game-area">
                            <div className="game-frame">
                                {/* Header */}
                                <div className="game-header">
                                    <div className="progress" role="status" aria-live="polite">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </div>
                                    <div className="timer-ring-container">
                                        <svg className="timer-ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden>
                                            <circle className="timer-ring-bg" cx="24" cy="24" r="20" />
                                            <circle
                                                className="timer-ring-progress"
                                                cx="24" cy="24" r="20"
                                                style={{
                                                    strokeDasharray: `${2 * Math.PI * 20}`,
                                                    strokeDashoffset: `${2 * Math.PI * 20 * (1 - timeLeft / SECONDS_PER_QUESTION)}`,
                                                    stroke: timeLeft <= 10 ? '#ef4444' : timeLeft <= 25 ? '#ffc107' : '#00ff88',
                                                }}
                                            />
                                        </svg>
                                        <span className="timer-text" style={{ color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 25 ? '#ffc107' : '#00ff88' }}>
                                            {timeLeft}
                                        </span>
                                        {/* Announce at the 30/10/5s marks only — a
                                            per-second live region is unusable. */}
                                        <span className="sr-only" role="timer" aria-live="assertive">
                                            {timeLeft === 30 || timeLeft === 10 || timeLeft === 5
                                                ? `${timeLeft} seconds remaining`
                                                : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Question Content - Scrollable */}
                                <div className="question-content-area" style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                                    <div>
                                        <div className="category-badge" style={{ borderColor: config.color }}>
                                            {getCategoryName(currentQuestion.category)}
                                        </div>
                                    </div>

                                    <h2 className="question-text">
                                        {/* Card detection runs on the RAW text and the
                                            title-caser is applied to the remaining
                                            fragments — title-casing first turned every
                                            mid-sentence "as" into the ace of spades. */}
                                        {renderTextWithCards(
                                            currentQuestion.question,
                                            s => formatPokerText(toTitleCase(s))
                                        )}
                                    </h2>

                                    {/* Analysis panel — real solver metadata only */}
                                    {showResult && (() => {
                                        const solver = readSolverMetadata(currentQuestion);
                                        const hasSolverData = solver.confidence != null;

                                        return (
                                            <div style={{ marginTop: '16px', marginBottom: '8px', width: '100%' }}>
                                                {/* Result badge */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    marginBottom: '12px',
                                                    padding: '10px 16px',
                                                    borderRadius: '8px',
                                                    background: selectedAnswer === currentQuestion.correct_index
                                                        ? 'rgba(34, 197, 94, 0.15)'
                                                        : 'rgba(239, 68, 68, 0.15)',
                                                    border: `1px solid ${selectedAnswer === currentQuestion.correct_index ? '#22c55e' : '#ef4444'}`,
                                                    color: selectedAnswer === currentQuestion.correct_index ? '#22c55e' : '#ef4444',
                                                    fontWeight: 700,
                                                    fontSize: '15px',
                                                }}>
                                                    {selectedAnswer === currentQuestion.correct_index ? 'CORRECT' : 'INCORRECT'}
                                                </div>

                                                {hasSolverData ? (
                                                    <GTOScenarioDisplay
                                                        action={currentQuestion.options[currentQuestion.correct_index]?.split(' ')[0]?.replace(/[^a-zA-Z-]/g, '').toUpperCase() || 'OPTIMAL'}
                                                        confidence={solver.confidence}
                                                        explanation={currentQuestion.explanation}
                                                        gtoApproach={generateGTOApproach(currentQuestion)}
                                                        evAnalysis={solver.evAnalysis}
                                                        alternateLines={solver.alternateLines}
                                                        isCorrectAnswer={selectedAnswer === currentQuestion.correct_index}
                                                        showDetails={true}
                                                        // Enables the opt-in "Generate visual card"
                                                        // button. Without a questionId the panel
                                                        // hides it by design, which kept the whole
                                                        // visual-analysis feature dark. The category
                                                        // lets the panel hide the button up front for
                                                        // questions /api/trivia/render-gto-panel
                                                        // would reject anyway. Auth falls back to the
                                                        // live supabase session inside the panel.
                                                        questionId={currentQuestion.id}
                                                        category={currentQuestion.category}
                                                    />
                                                ) : (
                                                    /* No solver metadata on this question: show the
                                                       question's own coaching notes rather than an
                                                       invented EV number and confidence circle. */
                                                    <div className="coaching-notes">
                                                        <div className="coaching-notes__head">Coaching Notes</div>
                                                        <div className="coaching-notes__answer">
                                                            Best line:{' '}
                                                            <strong>
                                                                {renderTextWithCards(
                                                                    currentQuestion.options[currentQuestion.correct_index] || '',
                                                                    s => formatPokerText(toTitleCase(s))
                                                                )}
                                                            </strong>
                                                        </div>
                                                        {currentQuestion.explanation && (
                                                            <p className="coaching-notes__body">
                                                                {renderTextWithCards(
                                                                    currentQuestion.explanation,
                                                                    s => formatPokerText(s)
                                                                )}
                                                            </p>
                                                        )}
                                                        <p className="coaching-notes__body">
                                                            {generateGTOApproach(currentQuestion)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Fixed Bottom Actions */}
                                <div className="bottom-actions-area" style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px', borderTop: showResult ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                                    <div className="options">
                                        {currentQuestion.options.map((option, index) => {
                                            const isEliminated = eliminatedOptions.includes(index);
                                            let optionClass = 'option';
                                            if (isEliminated) optionClass += ' eliminated';
                                            if (showResult) {
                                                if (index === currentQuestion.correct_index) {
                                                    optionClass += ' correct';
                                                } else if (index === selectedAnswer) {
                                                    optionClass += ' incorrect';
                                                }
                                            }

                                            const letter = String.fromCharCode(65 + index);
                                            return (
                                                <button
                                                    key={index}
                                                    type="button"
                                                    className={optionClass}
                                                    onClick={() => selectAnswer(index)}
                                                    disabled={showResult || isEliminated}
                                                    data-trivia-answer
                                                    aria-pressed={selectedAnswer === index}
                                                    aria-label={isEliminated
                                                        ? `Answer ${letter}: ${option} — eliminated by 50/50`
                                                        : `Answer ${letter}: ${option}`}
                                                >
                                                    <span className="option-letter" aria-hidden>
                                                        {isEliminated ? '✗' : letter}
                                                    </span>
                                                    <span className="option-text" aria-hidden={isEliminated || undefined}>
                                                        {isEliminated
                                                            ? '---'
                                                            : renderTextWithCards(option, s => formatPokerText(toTitleCase(s)))}
                                                    </span>
                                                    {showResult && index === currentQuestion.correct_index && (
                                                        <>
                                                            <CheckCircle size={20} className="icon correct" style={{ color: 'white' }} aria-hidden />
                                                            <span className="sr-only">Correct answer</span>
                                                        </>
                                                    )}
                                                    {showResult && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                                        <>
                                                            <XCircle size={20} className="icon incorrect" style={{ color: 'white' }} aria-hidden />
                                                            <span className="sr-only">Your answer, incorrect</span>
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Lifelines */}
                                    {!showResult && (
                                        <div className="lifelines" style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '20px auto 0', maxWidth: '400px', width: '100%' }}>
                                            <button
                                                type="button"
                                                className="lifeline-btn"
                                                onClick={useFiftyFifty}
                                                aria-label={`Use the 50/50 lifeline to remove two wrong answers${isVip ? ' (free for VIP)' : ` for ${LIFELINE_COST} diamonds`}`}
                                                disabled={fiftyFiftyUsed || lifelinesUsedCount >= MAX_LIFELINES}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 0,
                                                    cursor: (fiftyFiftyUsed || lifelinesUsedCount >= MAX_LIFELINES) ? 'not-allowed' : 'pointer',
                                                    opacity: (fiftyFiftyUsed || lifelinesUsedCount >= MAX_LIFELINES) ? 0.35 : 1,
                                                    transition: 'opacity 0.3s, transform 0.2s',
                                                    flex: 1,
                                                }}
                                            >
                                                <img
                                                    src="/images/trivia/lifeline-5050.jpg"
                                                    alt="50/50 Lifeline"
                                                    style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                className="lifeline-btn"
                                                onClick={useSkip}
                                                aria-label={`Use the skip lifeline${isVip ? ' (free for VIP)' : ` for ${LIFELINE_COST} diamonds`}. A skipped question does not count for or against your score.`}
                                                disabled={skipUsed || lifelinesUsedCount >= MAX_LIFELINES}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 0,
                                                    cursor: (skipUsed || lifelinesUsedCount >= MAX_LIFELINES) ? 'not-allowed' : 'pointer',
                                                    opacity: (skipUsed || lifelinesUsedCount >= MAX_LIFELINES) ? 0.35 : 1,
                                                    transition: 'opacity 0.3s, transform 0.2s',
                                                    flex: 1,
                                                }}
                                            >
                                                <img
                                                    src="/images/trivia/lifeline-skip.jpg"
                                                    alt="Skip Lifeline"
                                                    style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
                                                />
                                            </button>
                                        </div>
                                    )}

                                    {/* Next Button */}
                                    {showResult && (
                                        <button
                                            type="button"
                                            className="next-btn"
                                            onClick={nextQuestion}
                                            style={{
                                                marginTop: '16px',
                                                width: '100%',
                                            }}
                                        >
                                            {currentQuestionIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
                                            <ArrowRight size={18} />
                                        </button>
                                    )}
                                </div>

                            </div>
                        </div>
                    )}

                    {/* RESULTS STATE */}
                    {gameState === 'results' && (() => {
                        const summary = resultSummary || { correct: correctCount, skipped: 0, total: questions.length };
                        const pct = summary.total > 0 ? summary.correct / summary.total : 0;
                        const awarded = resultActualAwarded != null ? resultActualAwarded : 0;
                        return (
                            <div className="results">
                                <div className="result-icon">
                                    {pct >= 0.8 ? <Trophy size={48} color="#fbbf24" /> : pct >= 0.5 ? <CheckCircle size={48} color="#22c55e" /> : <Clock size={48} color="#3b82f6" />}
                                </div>
                                <h1>Challenge Complete!</h1>

                                <div className="score-card">
                                    <div className="score-main">
                                        <span className="score-num">{summary.correct}</span>
                                        <span className="score-total">/ {summary.total}</span>
                                    </div>
                                    <div className="score-label">
                                        Correct Answers
                                        {summary.skipped > 0 && (
                                            <span className="score-skipped">
                                                {' '}({summary.skipped} skipped, not scored)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="reward-card">
                                    <Gem size={24} aria-hidden />
                                    <span className="diamonds-earned">
                                        {/* Phase 68: shows what was ACTUALLY credited, never
                                            the calculated-but-failed amount. */}
                                        +{awarded} Diamonds
                                    </span>
                                </div>

                                {resultCapped && (
                                    <div className="results-note">
                                        Daily reward cap reached for {config.title} — play for the score, come back tomorrow for more diamonds.
                                    </div>
                                )}
                                {isFallbackSet(questions) && (
                                    <div className="results-note">
                                        This was an offline practice set (our question service was unreachable), so it does not pay diamonds.
                                    </div>
                                )}

                                {resultAwardError && (
                                    <div style={{
                                        padding: '10px 14px',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        borderRadius: 8,
                                        color: '#fca5a5',
                                        fontSize: 13,
                                        textAlign: 'center',
                                        maxWidth: 400,
                                        margin: '12px auto 0',
                                    }} role="alert">
                                        Diamond reward failed to apply ({resultAwardError}). Your balance may not reflect the reward — please contact support if this persists.
                                    </div>
                                )}

                                <div className="action-buttons">
                                    <button
                                        type="button"
                                        className="play-again"
                                        onClick={startGame}
                                        disabled={isPreparing || vipInitializing}
                                        style={{ background: config.color }}
                                    >
                                        {isPreparing
                                            ? 'Dealing In...'
                                            : (isVip ? 'Play Again (New Questions)' : `Play Again (${entryCost} Diamonds)`)}
                                    </button>
                                    <button type="button" className="back-btn" onClick={() => router.push('/hub/trivia')}>
                                        Back to Lobby
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            <style>{`
                .strategy-trivia {
                    height: 100vh;
                    height: 100dvh;
                    overflow: hidden;
                    background: linear-gradient(135deg, #0a0e1a 0%, #0d1525 40%, #0a1628 70%, #060b14 100%);
                    font-family: 'Inter', -apple-system, sans-serif;
                    display: flex;
                    flex-direction: column;
                }

                .content {
                    padding: 12px;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    max-width: 800px;
                    width: 100%;
                    margin: 0 auto;
                    overflow: hidden;
                }

                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                    border: 0;
                }

                .entry-error {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 auto 12px;
                    padding: 10px 14px;
                    max-width: 520px;
                    background: rgba(239, 68, 68, 0.12);
                    border: 1px solid rgba(239, 68, 68, 0.4);
                    border-radius: 8px;
                    color: #fca5a5;
                    font-size: 13px;
                }

                /* LOBBY — Full-bleed image (a <button>, so the browser
                   defaults have to be reset back to the old div look) */
                .lobby-image-wrapper {
                    position: relative;
                    display: block;
                    width: 100%;
                    padding: 0;
                    background: none;
                    border: none;
                    font: inherit;
                    color: inherit;
                    text-align: left;
                    cursor: pointer;
                    overflow: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    max-width: 100%;
                    margin: 0 auto;
                }

                .lobby-image-wrapper:disabled {
                    cursor: wait;
                }

                .lobby-image-wrapper:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 3px;
                }

                .lobby-cost-strip {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    padding: 10px 14px;
                    background: linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0));
                    color: rgba(255,255,255,0.9);
                    font-size: 12px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    pointer-events: none;
                }

                .lobby-cost-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 999px;
                    background: rgba(0, 212, 255, 0.15);
                    border: 1px solid rgba(0, 212, 255, 0.35);
                    color: #7ce7ff;
                    font-weight: 700;
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

                .lobby-loading-overlay {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 16px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                }

                .lobby-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-top-color: #0ea5e9;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* LOBBY — Text fallback */
                .lobby {
                    text-align: center;
                    padding: 40px 0;
                }

                .mode-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }

                .lobby h1 {
                    font-size: 32px;
                    font-weight: 700;
                    margin: 0 0 8px 0;
                }

                .subtitle {
                    color: rgba(255,255,255,0.6);
                    font-size: 16px;
                    margin: 0 0 32px 0;
                }

                .info-card {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 32px;
                }

                .info-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    color: rgba(255,255,255,0.8);
                }

                .info-row:last-child {
                    border-bottom: none;
                }

                .start-btn {
                    padding: 16px 48px;
                    border: none;
                    border-radius: 12px;
                    color: white;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }

                /* GAME AREA — FULL SCREEN FRAME */
                .game-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .game-frame {
                    flex: 1;
                    background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(10, 17, 35, 0.98));
                    border: 1px solid rgba(0, 212, 255, 0.15);
                    border-radius: 20px;
                    padding: 16px;
                    box-shadow:
                        0 0 30px rgba(0, 212, 255, 0.05),
                        inset 0 1px 0 rgba(255, 255, 255, 0.05);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .game-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.06), rgba(0, 150, 200, 0.03));
                    border: 1px solid rgba(0, 212, 255, 0.1);
                    border-radius: 14px;
                    backdrop-filter: blur(8px);
                    flex-shrink: 0;
                }

                .progress {
                    color: rgba(255, 255, 255, 0.85);
                    font-weight: 600;
                    font-size: 14px;
                    letter-spacing: 0.5px;
                }

                .timer-ring-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 48px;
                    height: 48px;
                }

                .timer-ring {
                    transform: rotate(-90deg);
                    position: absolute;
                }

                .timer-ring-bg {
                    fill: none;
                    stroke: rgba(255, 255, 255, 0.08);
                    stroke-width: 3;
                }

                .timer-ring-progress {
                    fill: none;
                    stroke-width: 3;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 1s linear, stroke 0.5s ease;
                }

                .timer-text {
                    font-size: 14px;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    position: relative;
                    z-index: 1;
                }

                .diamonds {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #00D4FF;
                    font-weight: 600;
                }

                /* Scrollbar styling for question content area */
                .question-content-area::-webkit-scrollbar {
                    width: 6px;
                }
                .question-content-area::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                }
                .question-content-area::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                .question-content-area::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .category-badge {
                    display: inline-block;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.7);
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    padding: 5px 14px;
                    border: 1px solid;
                    border-radius: 20px;
                    margin-bottom: 16px;
                    font-weight: 500;
                }

                .question-text {
                    font-size: 19px;
                    font-weight: 600;
                    color: white;
                    line-height: 1.55;
                    margin: 0 0 24px 0;
                    letter-spacing: 0.2px;
                }

                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .option {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 18px;
                    background: rgba(255,255,255,0.05);
                    border: 2px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    color: rgba(255,255,255,0.9);
                    font-size: 15px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .option:hover:not(:disabled) {
                    background: rgba(255,255,255,0.1);
                    border-color: rgba(255,255,255,0.3);
                }

                .option:disabled {
                    cursor: default;
                }

                .option.correct {
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(21, 128, 61, 0.9));
                    border-color: #4ade80;
                    color: white;
                    box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
                }

                .option.incorrect {
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(185, 28, 28, 0.9));
                    border-color: #f87171;
                    color: white;
                    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
                }

                .option.eliminated {
                    opacity: 0.4;
                    text-decoration: line-through;
                    cursor: not-allowed;
                }

                .option-letter {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 13px;
                }

                .option-text {
                    flex: 1;
                }

                .icon.correct { color: #4ade80; }
                .icon.incorrect { color: #f87171; }

                .next-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(145deg, rgba(20, 30, 48, 0.95), rgba(36, 59, 85, 0.9));
                    border: 1px solid rgba(6, 182, 212, 0.3);
                    border-radius: 12px;
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow:
                        0 0 20px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.05);
                }

                .next-btn:hover {
                    transform: translateY(-2px);
                    border-color: rgba(6, 182, 212, 0.5);
                    box-shadow:
                        0 4px 20px rgba(6, 182, 212, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.08);
                }

                /* RESULTS */
                .results {
                    text-align: center;
                    padding: 40px 0;
                }

                .result-icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                }

                .results h1 {
                    color: white;
                    font-size: 28px;
                    margin: 0 0 32px 0;
                }

                .score-card {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 16px;
                    padding: 32px;
                    margin-bottom: 24px;
                }

                .score-main {
                    display: flex;
                    align-items: baseline;
                    justify-content: center;
                    gap: 8px;
                }

                .score-num {
                    font-size: 64px;
                    font-weight: 700;
                    color: #22c55e;
                }

                .score-total {
                    font-size: 32px;
                    color: rgba(255,255,255,0.5);
                }

                .score-label {
                    color: rgba(255,255,255,0.6);
                    margin-top: 8px;
                }

                .score-skipped {
                    color: #fbbf24;
                }

                .results-note {
                    max-width: 420px;
                    margin: 0 auto 16px;
                    padding: 10px 14px;
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 8px;
                    color: #fbbf24;
                    font-size: 13px;
                    line-height: 1.5;
                }

                /* Coaching notes — shown instead of the solver panel when the
                   question carries no real EV/frequency metadata. */
                .coaching-notes {
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-left: 3px solid rgba(0, 212, 255, 0.5);
                    border-radius: 10px;
                }
                .coaching-notes__head {
                    font-size: 11px;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 10px;
                }
                .coaching-notes__answer {
                    color: #fff;
                    font-size: 15px;
                    margin-bottom: 10px;
                }
                .coaching-notes__body {
                    margin: 0 0 8px;
                    color: rgba(255, 255, 255, 0.72);
                    font-size: 14px;
                    line-height: 1.6;
                }

                .reward-card {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 150, 200, 0.1));
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 32px;
                    color: #00D4FF;
                }

                .diamonds-earned {
                    font-size: 24px;
                    font-weight: 700;
                }

                .action-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .play-again {
                    padding: 16px;
                    border: none;
                    border-radius: 12px;
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .back-btn {
                    padding: 16px;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 12px;
                    color: rgba(255,255,255,0.7);
                    font-size: 16px;
                    cursor: pointer;
                }

                .play-again:disabled,
                .start-btn:disabled {
                    opacity: 0.6;
                    cursor: wait;
                }

                /* Keyboard focus + tap targets */
                .option,
                .next-btn,
                .lifeline-btn,
                .start-btn,
                .play-again,
                .back-btn {
                    min-height: 48px;
                }
                .option:focus-visible,
                .next-btn:focus-visible,
                .lifeline-btn:focus-visible,
                .start-btn:focus-visible,
                .play-again:focus-visible,
                .back-btn:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 2px;
                }

                @media (prefers-reduced-motion: reduce) {
                    .lobby-spinner { animation-duration: 3s; }
                    .lobby-image-wrapper:hover,
                    .next-btn:hover,
                    .start-btn:hover {
                        transform: none;
                    }
                    .timer-ring-progress { transition: none; }
                }

                @media (max-width: 480px) {
                    .game-frame { padding: 12px; border-radius: 14px; }
                    .game-header { padding: 10px 14px; margin-bottom: 14px; }
                    .question-text { font-size: 17px; margin-bottom: 18px; }
                    .option { padding: 12px 14px; font-size: 14px; gap: 10px; }
                    .lobby-cost-strip { font-size: 11px; padding: 8px 10px; }
                }
            `}</style>
        </PageTransition >
    );
}
