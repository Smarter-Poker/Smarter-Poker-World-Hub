/**
 * STRATEGY TRIVIA MODE - Shared component for MTT, Cash, ICM, GTO modes
 *
 * SERVER-AUTHORITATIVE RUNS: /api/trivia/session-start deals (and permutes)
 * the questions, session-answer grades each tap under the binding
 * first-answer rule, and session-submit caps and pays through a locked RPC.
 * The client never receives an answer key, never grades, and never credits
 * diamonds - the direct browser-side balance-credit RPC this component used
 * to settle through lost authenticated EXECUTE on 2026-08-03 (migration
 * 20260803140000), so every reward silently failed while the entry fee
 * still charged.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
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
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
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

// Strategy mode configuration - display only. The question draw itself is
// server-side: /api/trivia/session-start resolves each mode through
// CATEGORY_MAPPINGS in triviaEngine.ts (gto spans five categories there,
// including gto_scenarios, which the old client-side list here was missing).
// Keeping a second category list in this file would just let the two drift.
const STRATEGY_MODES = {
    mtt: {
        title: 'MTT Scenarios',
        subtitle: 'Multi-Table Tournament Situations',
        color: '#f97316',
        icon: 'target'
    },
    cash: {
        title: 'Cash Game',
        subtitle: 'Deep Stack Scenarios & Implied Odds',
        color: '#22c55e',
        icon: 'dollar'
    },
    icm: {
        title: 'ICM & Chip EV',
        subtitle: 'Tournament Equity Decisions',
        color: '#06b6d4',
        icon: 'chart'
    },
    gto: {
        title: 'GTO Master',
        subtitle: 'Solver-Based Strategy Scenarios',
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

// Helper functions for GTO analysis generation.
// The correct answer text now arrives from the server verdict
// (correctDisplayIndex) - the question object carries no answer key.
function generateGTOApproach(category, correctAnswerText) {
    const correctAnswer = correctAnswerText || '';

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
 * ═══════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
// Graphic Playing Card Renderer
// ════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    // HARDENED: Source VIP status from centralized useVIP hook
    // (server-verified via AvatarContext → /api/vip/check-status)
    // instead of independently calling DiamondEngine.isVIP()
    // ═══════════════════════════════════════════════════════════════
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

    // Server-authoritative run: session-start deals (and permutes) the
    // questions, session-answer grades each tap, session-submit caps and
    // pays. The client never receives an answer key.
    const serverRun = useServerGradedRun(mode);
    // Current question's server verdict (wasCorrect / correctDisplayIndex /
    // explanation); null until session-answer resolves, cleared on advance.
    // The whole reveal is driven from this.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);
    // Server settlement result, kept in a ref so a settlement retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    // NOTE: the 50/50 and Skip lifelines are gone with the move to server
    // grading. 50/50 needs the answer key the client no longer receives. Skip
    // survived on endless/survival because their payout is per-correct and an
    // omitted question costs nothing there - but these modes are graded on
    // accuracy over the FULL served roster, so a server-scored skip counts as
    // unanswered (wrong). Charging 5 diamonds for an action strictly worse
    // than guessing is not defensible, so Skip is removed rather than
    // recharged through DiamondEngine.

    // Phase 68: actually-awarded amount + error message, surfaced from
    // finishGame to the results screen so the displayed diamonds match
    // reality when settlement fails (was always showing the calculated
    // amount even when the balance never moved).
    const [resultActualAwarded, setResultActualAwarded] = useState(null);
    const [resultAwardError, setResultAwardError] = useState(null);
    // Final tally for the results screen: server-graded correct / total.
    const [resultSummary, setResultSummary] = useState(null);
    const [resultCapped, setResultCapped] = useState(false);
    // Entry-flow error (session-start failure, signed-out, etc.)
    const [entryError, setEntryError] = useState(null);
    const [isPreparing, setIsPreparing] = useState(false);

    // User data — userId from useVIP, fallback to getAuthUser
    const [localUserId, setLocalUserId] = useState(null);
    const userId = vipUserId || localUserId;
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const startTimeRef = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race
    // Per question index: { questionId, displayIndex } as recorded through
    // session-answer at tap time. This is what session-submit grades from;
    // questions that never reached session-answer are filled in as -1
    // (unanswered) at submit, which the server scores as wrong.
    const answersRef = useRef([]);

    const finishedRef = useRef(false);      // finishGame runs at most once per game
    const advanceLockRef = useRef(false);   // Next button double-click guard

    // Entry price for this mode (config first, see getEntryCost).
    const entryCost = getEntryCost(mode);

    const currentQuestion = questions[currentQuestionIndex];

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
     * Attach engine_metadata (Phase 49 JSONB: gtoFrequencies, evData) to the
     * server-dealt set so the analysis panel can show REAL solver numbers
     * where they exist. This is DISPLAY-ONLY enrichment: it selects id +
     * engine_metadata for the 20 ids actually served - never correct_index,
     * never explanation, so the play path still holds no answer key. Failure
     * is non-fatal: the panel just omits the EV/frequency sections.
     */
    async function withSolverMetadata(rows) {
        const ids = (rows || []).map(q => q?.id).filter(id => typeof id === 'string');
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
    // handleTimeout -> gradeAnswer(-1) records an answer, so a double
    // invocation could fire twice (gradeAnswer's answerLockRef also guards
    // this now). The shared hook keeps its updater pure, fires onTimeout
    // once, is anchored to a wall-clock deadline (no drift) and pauses when
    // the tab is hidden instead of burning the clock in the background.
    const { timeLeft, resetTimer, setIsTimerRunning } = useTriviaTimer({
        initialTime: SECONDS_PER_QUESTION,
        showResult,
        gameState,
        playingState: 'playing',
        pauseOnHide: true,
        onTimeout: () => { handleTimeout(); },
    });

    /**
     * Start (or restart) a game.
     *
     * ORDER MATTERS: the server session is opened BEFORE the entry charge, so
     * a start failure can never eat an entry fee, and every charge-failure
     * path abandons the session via serverRun.reset() (it expires server-side
     * and pays nothing). The server deals (and permutes) the questions - they
     * are used VERBATIM, because reshuffling them or their options would
     * break the display-index mapping the grader uses. Play Again gets a
     * fresh draw for free: session-start records the served ids into
     * trivia_user_question_history at serve time, so the next session's
     * 60-day exclusion already covers this run.
     */
    async function startGame() {
        if (isStartingRef.current) return;
        // Race: isVip is false until the async VIP check resolves.
        if (vipInitializing) return;
        isStartingRef.current = true;
        setEntryError(null);
        setIsPreparing(true);
        try {
            // Session-start needs an authenticated caller; fail with a clear
            // message instead of a generic start error.
            if (!userId) {
                setEntryError('Please sign in to play this mode.');
                return;
            }

            // 1. Open the server session first. No charge has happened yet.
            let served;
            try {
                served = await serverRun.start({ count: QUESTIONS_PER_GAME });
            } catch (e) {
                console.warn('[StrategyTrivia] Server session start failed:', e?.message || e);
                setEntryError('Could not start the game. Please try again in a moment. You have not been charged.');
                return;
            }
            if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
                // NEVER charge for an empty game.
                serverRun.reset();
                setEntryError('No questions are available right now. Please try again in a moment. You have not been charged.');
                return;
            }

            // 2. Display-only solver metadata for the analysis panel.
            const set = await withSolverMetadata(served.questions);

            // 3. Entry charge for non-VIP users - only now that a playable
            //    session exists. Every failure path below resets the session.
            if (!isVip && entryCost > 0) {
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
                    serverRun.reset();
                    setShowOutOfDiamonds(true);
                    return;
                }

                try {
                    await DiamondEngine.init(userId);
                    const result = await DiamondEngine.deduct(entryCost, 'game_cost', { mode, game: 'trivia' });
                    if (!result?.success) {
                        serverRun.reset();
                        setShowOutOfDiamonds(true);
                        return;
                    }
                    if (result.balance !== undefined) setUserDiamonds(result.balance);
                    busEmit.diamondsSpent(entryCost, `${config.title} Entry`);
                } catch (e) {
                    console.warn('[StrategyTrivia] Diamond deduction failed:', e);
                    serverRun.reset();
                    setEntryError('The entry charge could not be completed. You have not been charged.');
                    return;
                }
            }

            // 4. Start. Everything below is synchronous so a paid entry
            //    always lands in a playable game.
            setQuestions(set);

            finishedRef.current = false;
            advanceLockRef.current = false;
            answerLockRef.current = false;
            serverResultRef.current = null;
            answersRef.current = [];

            setResultActualAwarded(null);
            setResultAwardError(null);
            setResultSummary(null);
            setResultCapped(false);
            setGameState('playing');
            setCurrentQuestionIndex(0);
            setCorrectCount(0);
            setVerdict(null);
            setSelectedAnswer(null);
            setShowResult(false);
            startTimeRef.current = Date.now();
            resetTimer(SECONDS_PER_QUESTION);
        } finally {
            setIsPreparing(false);
            isStartingRef.current = false;
        }
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        gradeAnswer(-1); // records the timeout server-side and reveals the answer
    }

    /**
     * Per-answer server grading. Lock the tap immediately, record it with
     * /api/trivia/session-answer (the first answer per question is BINDING
     * server-side), then reveal from the verdict. A failed call unlocks so
     * the player can re-tap - the endpoint is idempotent per question, so a
     * retry cannot double-record. displayIndex -1 is the shot-clock timeout.
     */
    async function gradeAnswer(displayIndex) {
        if (answerLockRef.current || selectedAnswer !== null || showResult) return;
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        answerLockRef.current = true;
        setIsTimerRunning(false);
        if (displayIndex >= 0) setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            answersRef.current[currentQuestionIndex] = { questionId: q.id, displayIndex };
            setVerdict(v);
            setShowResult(true);
            // Side effects key off the server verdict, never a local compare.
            if (v?.wasCorrect === true) {
                setCorrectCount(prev => prev + 1);
                busEmit.decisionCorrect(correctCount + 1);
            } else {
                busEmit.decisionIncorrect(correctCount);
                busEmit.screenShake('light');
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Answer grading failed:', e?.message || e);
            if (displayIndex < 0) {
                // Timeout that could not reach the server: no re-tap is
                // possible, so record it locally (session-submit still grades
                // it server-side as unanswered) and advance without a reveal.
                answersRef.current[currentQuestionIndex] = { questionId: q.id, displayIndex: -1 };
                answerLockRef.current = false;
                nextQuestion();
                return;
            }
            // Unlock and let the player re-tap.
            setSelectedAnswer(null);
            answerLockRef.current = false;
        }
    }

    function nextQuestion() {
        // Double-clicking Next used to run setCurrentQuestionIndex(prev+1)
        // twice, skipping a question with no answer recorded and misaligning
        // answers[] against questions[] for the rest of the game.
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;

        if (currentQuestionIndex + 1 >= questions.length) {
            finishGame();
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setVerdict(null);
        setSelectedAnswer(null);
        setShowResult(false);
        answerLockRef.current = false;
        resetTimer(SECONDS_PER_QUESTION);
    }

    // Release the advance lock once the new question has rendered.
    useEffect(() => { advanceLockRef.current = false; }, [currentQuestionIndex]);

    /**
     * Settle the run server-side. /api/trivia/session-submit grades from the
     * answers stored at tap time (the array below only fills in questions
     * that never reached session-answer), applies the accuracy tiers, the
     * perfect bonus and the per-mode daily cap, and pays through a locked
     * RPC. No client-side crediting, ever.
     *
     * Retry-safe: the settled result lives in serverResultRef, so a retry
     * after a network drop re-uses the already-paid result instead of
     * re-submitting a closed session, and finishedRef reopens on failure so
     * the results screen's retry button can run settlement again.
     */
    async function finishGame() {
        if (finishedRef.current) return;
        finishedRef.current = true;

        setIsTimerRunning(false);
        const timeSpent = Math.max(0, Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000));

        let settled = serverResultRef.current;
        if (!settled) {
            const submitAnswers = questions.map((q, idx) => {
                const a = answersRef.current[idx];
                return {
                    questionId: q.id,
                    displayIndex: (a && Number.isInteger(a.displayIndex)) ? a.displayIndex : -1,
                };
            });
            try {
                settled = await serverRun.submit(submitAnswers);
                if (!settled) {
                    // The hook's in-flight guard swallowed a concurrent call;
                    // let that call finish the game instead of settling zeros.
                    finishedRef.current = false;
                    return;
                }
                serverResultRef.current = settled;
            } catch (e) {
                console.warn('[StrategyTrivia] CRITICAL: settlement failed - run not yet paid:', e?.message || e);
                // Reopen so the results screen's retry can run settlement
                // again. On a transient failure the session is still open
                // server-side (the hook only discards it on 409/410), so a
                // retry pays; correct/total shown meanwhile come from the
                // per-tap verdicts.
                finishedRef.current = false;
                setResultSummary({ correct: correctCount, total: questions.length });
                setResultActualAwarded(0);
                setResultAwardError(e?.message || 'Settlement failed');
                setResultCapped(false);
                setGameState('results');
                return;
            }
        }

        const awarded = Number.isFinite(settled?.diamondsAwarded) ? settled.diamondsAwarded : 0;
        const serverCorrect = Number.isFinite(settled?.correct) ? settled.correct : correctCount;
        const serverTotal = Number.isFinite(settled?.total) ? settled.total : questions.length;

        // Display-only cap awareness: the server pays the same accuracy tiers
        // as calculateDiamonds and clamps to the mode's daily cap, so an
        // award below the uncapped formula means the cap absorbed the rest.
        const rawExpected = calculateDiamonds(mode, serverCorrect, serverTotal, 0);
        setResultCapped(awarded < rawExpected);

        // Local balance from the server's post-award number, with a fresh
        // profiles read as the fallback.
        if (Number.isFinite(settled?.newBalance)) {
            setUserDiamonds(settled.newBalance);
        } else if (userId) {
            try {
                const { data: freshProfile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (freshProfile) setUserDiamonds(freshProfile.diamonds || 0);
            } catch (e) {
                console.warn('[StrategyTrivia] Balance refresh failed:', e?.message || e);
            }
        }

        if (awarded > 0) busEmit.diamondsEarned(awarded, `${config.title} Reward`);
        if (serverTotal > 0 && serverCorrect >= serverTotal) busEmit.celebration('confetti');

        // Save score to trivia_scores with the SERVER numbers. Capture insert
        // error - supabase-js does NOT throw on DB errors.
        if (userId) {
            try {
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    mode,
                    score: Number.isFinite(settled?.score) ? settled.score : serverCorrect * 100,
                    correct_count: serverCorrect,
                    total_questions: serverTotal,
                    time_spent: timeSpent,
                    diamonds_earned: awarded,
                    play_date: getTodayCST()
                });
                if (scoreErr) throw scoreErr;
            } catch (e) {
                console.warn('[StrategyTrivia] Error saving score:', e);
            }
        }

        // No client-side history write: session-start already recorded the
        // served roster into trivia_user_question_history at serve time, so
        // the 60-day non-repeat guarantee holds even for abandoned runs.

        setResultSummary({ correct: serverCorrect, total: serverTotal });
        setResultActualAwarded(awarded);
        setResultAwardError(null);
        setGameState('results');
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
                if (idx >= 0 && idx < (currentQuestion.options?.length || 0)) {
                    e.preventDefault();
                    gradeAnswer(idx);
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
    }, [gameState, showResult, selectedAnswer, currentQuestion, currentQuestionIndex, questions.length]);


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
                                {/* Questions are dealt by the server when the game
                                    starts, so the only wait worth showing is the
                                    session-start + charge round-trip itself. */}
                                {isPreparing && (
                                    <div className="lobby-loading-overlay">
                                        <div className="lobby-spinner" />
                                        <span>Dealing In...</span>
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
                                    {/* Reward copy mirrors what session-submit
                                        actually pays: the base reward needs 70%+
                                        accuracy, the bonus needs a perfect run,
                                        and the mode's daily cap bounds the total. */}
                                    <div className="info-row">
                                        <span>Reward (70%+ Accuracy)</span>
                                        <span>{TRIVIA_MODES[mode]?.diamondReward || 5} <Gem size={14} aria-hidden /></span>
                                    </div>
                                    <div className="info-row">
                                        <span>Perfect Score Bonus</span>
                                        <span>+{TRIVIA_MODES[mode]?.perfectBonus || 10} <Gem size={14} aria-hidden /></span>
                                    </div>
                                    <div className="info-row">
                                        <span>Daily Reward Cap</span>
                                        <span>{DAILY_DIAMOND_CAPS[mode] || 40} <Gem size={14} aria-hidden /></span>
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

                                    {/* Analysis panel — real solver metadata only.
                                        Everything here is driven by the SERVER
                                        verdict: the question object carries no
                                        correct_index and no explanation, so the
                                        reveal (badge, best line, coaching text)
                                        reads correctDisplayIndex / wasCorrect /
                                        explanation from session-answer. */}
                                    {showResult && verdict && (() => {
                                        const solver = readSolverMetadata(currentQuestion);
                                        const hasSolverData = solver.confidence != null;
                                        const wasCorrect = verdict.wasCorrect === true;
                                        const correctText = verdict.correctDisplayIndex >= 0
                                            ? (currentQuestion.options[verdict.correctDisplayIndex] || '')
                                            : '';

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
                                                    background: wasCorrect
                                                        ? 'rgba(34, 197, 94, 0.15)'
                                                        : 'rgba(239, 68, 68, 0.15)',
                                                    border: `1px solid ${wasCorrect ? '#22c55e' : '#ef4444'}`,
                                                    color: wasCorrect ? '#22c55e' : '#ef4444',
                                                    fontWeight: 700,
                                                    fontSize: '15px',
                                                }}>
                                                    {wasCorrect ? 'CORRECT' : 'INCORRECT'}
                                                </div>

                                                {hasSolverData ? (
                                                    <GTOScenarioDisplay
                                                        action={correctText.split(' ')[0]?.replace(/[^a-zA-Z-]/g, '').toUpperCase() || 'OPTIMAL'}
                                                        confidence={solver.confidence}
                                                        explanation={verdict.explanation}
                                                        gtoApproach={generateGTOApproach(currentQuestion.category, correctText)}
                                                        evAnalysis={solver.evAnalysis}
                                                        alternateLines={solver.alternateLines}
                                                        isCorrectAnswer={wasCorrect}
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
                                                                    correctText,
                                                                    s => formatPokerText(toTitleCase(s))
                                                                )}
                                                            </strong>
                                                        </div>
                                                        {verdict.explanation && (
                                                            <p className="coaching-notes__body">
                                                                {renderTextWithCards(
                                                                    verdict.explanation,
                                                                    s => formatPokerText(s)
                                                                )}
                                                            </p>
                                                        )}
                                                        <p className="coaching-notes__body">
                                                            {generateGTOApproach(currentQuestion.category, correctText)}
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
                                        {/* Options are rendered in the server's display
                                            order, verbatim - reshuffling them would break
                                            the display-index mapping the grader uses. The
                                            reveal highlights come from the verdict's
                                            correctDisplayIndex; before it resolves there
                                            is nothing to leak. */}
                                        {currentQuestion.options.map((option, index) => {
                                            const revealCorrectIndex = (showResult && verdict) ? verdict.correctDisplayIndex : null;
                                            let optionClass = 'option';
                                            if (revealCorrectIndex != null) {
                                                if (index === revealCorrectIndex) {
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
                                                    onClick={() => gradeAnswer(index)}
                                                    disabled={showResult || selectedAnswer !== null}
                                                    data-trivia-answer
                                                    aria-pressed={selectedAnswer === index}
                                                    aria-label={`Answer ${letter}: ${option}`}
                                                >
                                                    <span className="option-letter" aria-hidden>
                                                        {letter}
                                                    </span>
                                                    <span className="option-text">
                                                        {renderTextWithCards(option, s => formatPokerText(toTitleCase(s)))}
                                                    </span>
                                                    {revealCorrectIndex != null && index === revealCorrectIndex && (
                                                        <>
                                                            <CheckCircle size={20} className="icon correct" style={{ color: 'white' }} aria-hidden />
                                                            <span className="sr-only">Correct answer</span>
                                                        </>
                                                    )}
                                                    {revealCorrectIndex != null && index === selectedAnswer && index !== revealCorrectIndex && (
                                                        <>
                                                            <XCircle size={20} className="icon incorrect" style={{ color: 'white' }} aria-hidden />
                                                            <span className="sr-only">Your answer, incorrect</span>
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* The 50/50 and Skip lifeline buttons that lived
                                        here are gone with the move to server grading -
                                        see the note by the serverRun declaration. */}

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

                    {/* RESULTS STATE — every number here is the server's:
                        summary from session-submit's correct/total, awarded
                        from diamondsAwarded (already cap-clamped and paid). */}
                    {gameState === 'results' && (() => {
                        const summary = resultSummary || { correct: correctCount, total: questions.length };
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
                                        <div>
                                            The run could not be settled ({resultAwardError}). Your reward has not been paid yet.
                                        </div>
                                        {/* finishGame reopened finishedRef on the failure
                                            and kept the session, so retrying settles and
                                            pays the SAME run — it cannot double-pay. */}
                                        <button
                                            type="button"
                                            onClick={finishGame}
                                            style={{ marginTop: 10, padding: '10px 18px', minHeight: 44, background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.6)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Retry Settlement
                                        </button>
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
                .start-btn,
                .play-again,
                .back-btn {
                    min-height: 48px;
                }
                .option:focus-visible,
                .next-btn:focus-visible,
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
