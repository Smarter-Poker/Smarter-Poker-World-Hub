/**
 * STRATEGY TRIVIA MODE - Shared component for MTT, Cash, ICM, GTO modes
 * Features built-in hints/lifelines with diamond purchase support
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
import { calculateDiamonds, TRIVIA_MODES, getCategoryName } from '../../../src/lib/trivia/triviaEngine';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { Clock, CheckCircle, XCircle, ArrowRight, Trophy, Gem, Target, DollarSign, BarChart3, Brain } from 'lucide-react';
import GTOScenarioDisplay from './GTOScenarioDisplay';

/** Format poker text: enforce BB/SB spacing and capitalization rules */
function formatPokerText(text) {
    if (!text) return text;
    return text
        // Add space before BB when preceded by a number (e.g., "31BB" → "31BB")
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

const GAME_DIAMOND_COST = 10;

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

function generateEVAnalysis(question) {
    const difficulty = question?.difficulty || 'medium';
    const evValues = { easy: 0.85, medium: 1.25, hard: 1.75 };

    return {
        value: evValues[difficulty] || 1.25,
        description: `This action yields an expected value of +${evValues[difficulty] || 1.25} big blinds, significantly higher than alternate lines. Optimal play captures maximum value while maintaining range balance.`
    };
}

function generateAlternateLines(question) {
    if (!question?.options) return [];

    const correctIdx = question.correct_index;
    const altLines = [];

    question.options.forEach((option, idx) => {
        if (idx !== correctIdx && altLines.length < 2) {
            const action = option.split(' ')[0]?.toUpperCase() || option.toUpperCase();
            const frequency = idx === 0 ? 15 : idx === 1 ? 10 : 5;

            altLines.push({
                action,
                frequency,
                description: action === 'FOLD'
                    ? 'Against extremely tight opponents to avoid negative EV spots'
                    : action === 'CALL'
                        ? 'Balanced with drawing hands to collaborate with bluffing frequencies'
                        : 'Mixed strategy implementation for range protection'
            });
        }
    });

    return altLines;
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

function renderTextWithCards(text) {
    if (!text) return null;
    // Match standard card formats like Ah, Ks, 10d, 4c
    const cardRegex = /\b([2-9]|10|[JQKA])([shdc])\b/gi;
    const parts = text.split(cardRegex);

    const result = [];
    let i = 0;
    while (i < parts.length) {
        result.push(parts[i]);
        i++;
        if (i < parts.length) {
            const rank = parts[i];
            const suit = parts[i + 1];
            result.push(<PlayingCard key={i} card={`${rank}${suit}`} size="inline" />);
            i += 2;
        }
    }
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

    // User data — userId from useVIP, fallback to getAuthUser
    const [localUserId, setLocalUserId] = useState(null);
    const userId = vipUserId || localUserId;
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Timer
    const [timeLeft, setTimeLeft] = useState(60);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race
    const answersRef = useRef([]); // Ref mirror — avoids stale closure in skip→finishGame

    const currentQuestion = questions[currentQuestionIndex];

    // Keep answersRef in sync with answers state
    useEffect(() => { answersRef.current = answers; }, [answers]);

    // Preloaded questions state (load in background while user views lobby image)
    const [preloadedQuestions, setPreloadedQuestions] = useState(null);

    // Initialize + preload questions. Re-runs on auth resolution so the user
    // is properly wired up even if AvatarContext was still loading on first render.
    useEffect(() => {
        if (avatarLoading) return;
        const user = avatarUser || getAuthUser();
        if (user) {
            setLocalUserId(user.id);
            loadUserDiamonds(user.id);
            DiamondEngine.init(user.id);
        }
        setIsLoading(false);
        // Preload questions in background
        preloadQuestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [avatarUser?.id, avatarLoading]);

    async function preloadQuestions() {
        try {
            const categories = config.categories;
            // Phase 58: was missing quality_score filter — low-quality
            // questions could leak into MTT/Cash/ICM/GTO. Apply qs>=6
            // floor consistent with survival/endless/etc.
            const { data, error } = await supabase
                .from('trivia_questions')
                .select('*')
                .in('category', categories)
                .gte('quality_score', 6);

            if (!error && data && data.length > 0) {
                let available = data;
                // Phase 58: was fetching the user's COMPLETE history with no
                // time window — long-time users would exhaust the unseen pool
                // forever. Now bounds to last 60 days, matching loadQuestions.
                if (userId) {
                    const sixtyDaysAgo = new Date();
                    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
                    const { data: history } = await supabase
                        .from('trivia_user_question_history')
                        .select('question_id')
                        .eq('user_id', userId)
                        .gte('seen_at', sixtyDaysAgo.toISOString());
                    if (history && history.length > 0) {
                        const seenIds = new Set(history.map(h => h.question_id));
                        const unseen = data.filter(q => !seenIds.has(q.id));
                        if (unseen.length >= 10) available = unseen;
                    }
                }
                // Phase 58: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
                const _shufArr = [...available];
                for (let i = _shufArr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [_shufArr[i], _shufArr[j]] = [_shufArr[j], _shufArr[i]];
                }
                setPreloadedQuestions(_shufArr.slice(0, 20));
            } else {
                setPreloadedQuestions(getFallbackQuestions(mode));
            }
        } catch (err) {
            console.warn('[StrategyTrivia] Preload failed:', err);
            setPreloadedQuestions(getFallbackQuestions(mode));
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

    // Timer effect
    useEffect(() => {
        if (!isTimerRunning || showResult) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTimerRunning, showResult, currentQuestionIndex]);

    async function loadQuestions() {
        setIsLoading(true);

        try {
            // 60-day non-repeat: Get user's recently seen question IDs
            let excludeIds = [];
            if (userId) {
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

                const { data: recentHistory } = await supabase
                    .from('trivia_user_question_history')
                    .select('question_id')
                    .eq('user_id', userId)
                    .gte('seen_at', sixtyDaysAgo.toISOString());

                if (recentHistory) {
                    excludeIds = recentHistory.map(h => h.question_id);
                }
            }

            // First try daily-tagged questions for today
            const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
                .toISOString().split('T')[0];

            // Phase 58: apply qs>=6 quality floor on both daily + pool paths.
            let dailyQuery = supabase
                .from('trivia_questions')
                .select('*')
                .in('category', config.categories)
                .eq('daily_date', today)
                .gte('quality_score', 6);

            const { data: dailyData } = await dailyQuery;

            if (dailyData && dailyData.length >= 20) {
                // Filter out recently seen, take 20
                let available = excludeIds.length > 0
                    ? dailyData.filter(q => !excludeIds.includes(q.id))
                    : dailyData;

                if (available.length >= 20) {
                    setQuestions(available.slice(0, 20));
                } else {
                    // Supplement with daily questions even if seen
                    setQuestions(dailyData.slice(0, 20));
                }
            } else {
                // Fallback: fetch from full pool (still quality-floored).
                let query = supabase
                    .from('trivia_questions')
                    .select('*')
                    .in('category', config.categories)
                    .gte('quality_score', 6);

                const { data } = await query;

                if (data && data.length > 0) {
                    // Filter out recently seen questions (60-day exclusion)
                    let available = excludeIds.length > 0
                        ? data.filter(q => !excludeIds.includes(q.id))
                        : data;

                    // If not enough unseen questions, fall back to all
                    if (available.length < 20) {
                        available = data;
                    }

                    // Phase 58: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
                    const _arr = [...available];
                    for (let i = _arr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [_arr[i], _arr[j]] = [_arr[j], _arr[i]];
                    }
                    setQuestions(_arr.slice(0, 20));
                } else {
                    setQuestions(getFallbackQuestions(mode));
                }
            }
        } catch (e) {
            console.warn('[StrategyTrivia] Error loading questions:', e);
            setQuestions(getFallbackQuestions(mode));
        }

        setIsLoading(false);
    }

    function getFallbackQuestions(mode) {
        // Fallback questions until database is seeded
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
                }
            ]
        };

        return fallbacks[mode] || fallbacks.gto;
    }

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // ═══════════════════════════════════════════════════════════════
        // HOTFIX: Check if this game was already paid for via TriviaLobby
        // payment modal. If so, skip the deduction and clear the flag.
        // ═══════════════════════════════════════════════════════════════
        const alreadyPaid = sessionStorage.getItem('trivia_paid') === 'true'
            && sessionStorage.getItem('trivia_mode') === mode;
        if (alreadyPaid) {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        }

        // Per-game diamond cost for non-VIP users (skip if already paid)
        if (!alreadyPaid && !isVip && userId) {
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
                console.warn('[StrategyTrivia] Balance check failed:', e);
            }

            if (freshBalance < GAME_DIAMOND_COST) {
                setShowOutOfDiamonds(true);
                return;
            }

            try {
                await DiamondEngine.init(userId);
                const result = await DiamondEngine.deduct(GAME_DIAMOND_COST, 'game_cost', { mode, game: 'trivia' });
                if (!result.success) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                busEmit.diamondsSpent(GAME_DIAMOND_COST, `${config.title} Entry`);
            } catch (e) {
                console.warn('[StrategyTrivia] Diamond deduction failed:', e);
                setShowOutOfDiamonds(true);
                return;
            }
        }

        // Use preloaded questions if available, otherwise load fresh
        if (preloadedQuestions && preloadedQuestions.length > 0) {
            setQuestions(preloadedQuestions);
        } else {
            loadQuestions();
        }
        setGameState('playing');
        setCurrentQuestionIndex(0);
        setCorrectCount(0);
        setAnswers([]);
        setSelectedAnswer(null);
        setShowResult(false);
        setFiftyFiftyUsed(false);
        setEliminatedOptions([]);
        setSkipUsed(false);
        setLifelinesUsedCount(0);
        setTimeLeft(60);
        setIsTimerRunning(true);
        startTimeRef.current = Date.now();
        } finally {
            isStartingRef.current = false;
        }
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        selectAnswer(-1); // Wrong answer due to timeout
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
        setAnswers(prev => [...prev, index]);
    }

    function nextQuestion() {
        if (currentQuestionIndex + 1 >= questions.length) {
            finishGame();
        } else {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowResult(false);
            setEliminatedOptions([]);
            setTimeLeft(60);
            setIsTimerRunning(true);
        }
    }

    async function finishGame() {
        setIsTimerRunning(false);
        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        // Recompute correctCount from answersRef (always current) to avoid stale closure
        // when called from skip lifeline's 300ms setTimeout
        const actualCorrectCount = answersRef.current.filter((a, i) =>
            a === questions[i]?.correct_index || a === -2 // -2 = skipped (counts as correct)
        ).length;
        const diamondsEarned = calculateDiamonds(mode, actualCorrectCount, questions.length, 0);

        if (userId) {
            // Save score and award diamonds
            if (diamondsEarned > 0) {
                try {
                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: diamondsEarned,
                        p_type: 'trivia_reward',
                        p_description: `${config.title} reward — ${diamondsEarned}diamonds`,
                        p_reference_id: `strategy_reward_${mode}_${userId}_${Math.floor(Date.now()/60000)}`  // Phase 56: stable per-(mode, user, minute) so retries dedup at DB
                    });
                    if (__rpcErr) throw __rpcErr;
                    const { data: freshProfile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (freshProfile) setUserDiamonds(freshProfile.diamonds || 0);
                    busEmit.diamondsEarned(diamondsEarned, `${config.title} Reward`);
                    if (actualCorrectCount >= questions.length) busEmit.celebration('confetti');
                } catch (e) {
                    console.warn('[StrategyTrivia] Error awarding diamonds:', e);
                }
            }

            // Save score to trivia_scores. Capture insert error — supabase-js
            // does NOT throw on DB errors, so the surrounding try/catch only
            // saw network errors. Without this, NOT NULL violations / RLS
            // denials silently dropped scores while UI showed success.
            try {
                const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    mode,
                    score: actualCorrectCount * 100,
                    correct_count: actualCorrectCount,
                    total_questions: questions.length,
                    time_spent: timeSpent,
                    diamonds_earned: diamondsEarned,
                    play_date: today
                });
                if (scoreErr) throw scoreErr;
            } catch (e) {
                console.warn('[StrategyTrivia] Error saving score:', e);
            }

            // Record question history for 60-day non-repeat tracking
            if (questions && questions.length > 0) {
                try {
                    const historyRecords = questions.map((q, idx) => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: answersRef.current[idx] === q.correct_index,
                        seen_at: new Date().toISOString(),
                        mode
                    }));

                    await supabase.from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: false
                        });
                } catch (e) {
                    console.warn('[StrategyTrivia] Error recording history:', e);
                }
            }
        }

        setGameState('results');
    }

    // Lifeline: 50/50
    async function useFiftyFifty() {
        if (fiftyFiftyUsed || lifelinesUsedCount >= MAX_LIFELINES) return;
        if (!isVip && userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        // Deduct diamonds via audit-safe RPC for non-VIP users
        if (!isVip) {
            try {
                const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'strategy_lifeline',
                    p_description: `${config.title} 50/50 lifeline — ${LIFELINE_COST}diamonds`,
                    p_reference_id: `strategy_fifty_${mode}_${userId}_${currentQuestionIndex}`  // Phase 56: stable per question — DB dedups double-clicks
                });
                if (__rpcErr) throw __rpcErr;
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, '50/50 Lifeline');
            } catch (e) {
                console.warn('[StrategyTrivia] 50/50 deduct failed:', e);
                return;
            }
        }

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
    }

    // Lifeline: Skip Question
    async function useSkip() {
        if (skipUsed || lifelinesUsedCount >= MAX_LIFELINES) return;
        if (!isVip && userDiamonds < LIFELINE_COST) {
            setShowOutOfDiamonds(true);
            return;
        }

        // Deduct diamonds via audit-safe RPC for non-VIP users
        if (!isVip) {
            try {
                const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: -LIFELINE_COST,
                    p_type: 'strategy_lifeline',
                    p_description: `${config.title} skip question — ${LIFELINE_COST}diamonds`,
                    p_reference_id: `strategy_skip_${mode}_${userId}_${currentQuestionIndex}`  // Phase 56: stable per question — DB dedups double-clicks
                });
                if (__rpcErr) throw __rpcErr;
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
                busEmit.diamondsSpent(LIFELINE_COST, 'Skip Question');
            } catch (e) {
                console.warn('[StrategyTrivia] Skip deduct failed:', e);
                return;
            }
        }

        // Mark as skipped (correct to not penalize)
        setCorrectCount(prev => prev + 1);
        setAnswers(prev => [...prev, -2]); // -2 = skipped
        setSkipUsed(true);
        setLifelinesUsedCount(prev => prev + 1);

        // Move to next
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishGame();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setEliminatedOptions([]);
                setTimeLeft(60);
                setIsTimerRunning(true);
            }
        }, 300);
    }

    if (isLoading) {
        return (
            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: 'white' }}>Loading...</div>
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
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>diamonds</div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Not Enough Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', fontSize: 14 }}>You need {GAME_DIAMOND_COST}diamonds to play. Visit the Diamond Store to get more!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* One-time diamond cost popup for non-VIP users */}
                <GameCostPopup
                    userId={userId}
                    pageKey={`trivia_${mode}`}
                    isVip={isVip}
                    cost={GAME_DIAMOND_COST}
                />

                <div className="content">
                    {/* LOBBY STATE */}
                    {gameState === 'lobby' && (
                        LOBBY_IMAGES[mode] ? (
                            /* Full-bleed image lobby */
                            <div className="lobby-image-wrapper" onClick={startGame}>
                                <img
                                    src={LOBBY_IMAGES[mode]}
                                    alt={`${config.title} - Start Challenge`}
                                    className="lobby-image"
                                />
                                {!preloadedQuestions && (
                                    <div className="lobby-loading-overlay">
                                        <div className="lobby-spinner" />
                                        <span>Loading Questions...</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Fallback text lobby for modes without images */
                            <div className="lobby">
                                <div className="mode-icon">{config.icon === 'target' ? <Target size={48} /> : config.icon === 'dollar' ? <DollarSign size={48} /> : config.icon === 'chart' ? <BarChart3 size={48} /> : <Brain size={48} />}</div>
                                <h1 style={{ color: config.color }}>{config.title}</h1>
                                <p className="subtitle">{config.subtitle}</p>

                                <div className="info-card">
                                    <div className="info-row">
                                        <span>Questions</span>
                                        <span>20</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Time Per Question</span>
                                        <span>60 Seconds</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Perfect Score Bonus</span>
                                        <span>+{TRIVIA_MODES[mode]?.perfectBonus || 10} <Gem size={14} /></span>
                                    </div>
                                </div>

                                <button className="start-btn" onClick={startGame} style={{ background: config.color }}>
                                    Start Challenge
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
                                    <div className="progress">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </div>
                                    <div className="timer-ring-container">
                                        <svg className="timer-ring" width="48" height="48" viewBox="0 0 48 48">
                                            <circle className="timer-ring-bg" cx="24" cy="24" r="20" />
                                            <circle
                                                className="timer-ring-progress"
                                                cx="24" cy="24" r="20"
                                                style={{
                                                    strokeDasharray: `${2 * Math.PI * 20}`,
                                                    strokeDashoffset: `${2 * Math.PI * 20 * (1 - timeLeft / 60)}`,
                                                    stroke: timeLeft <= 10 ? '#ef4444' : timeLeft <= 25 ? '#ffc107' : '#00ff88',
                                                }}
                                            />
                                        </svg>
                                        <span className="timer-text" style={{ color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 25 ? '#ffc107' : '#00ff88' }}>
                                            {timeLeft}
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
                                        {renderTextWithCards(formatPokerText(toTitleCase(currentQuestion.question)))}
                                    </h2>

                                    {/* GTO Scenario Display — Inline rendering */}
                                    {showResult && (() => {
                                        const altLines = generateAlternateLines(currentQuestion);
                                        const altSum = altLines.reduce((sum, l) => sum + l.frequency, 0);
                                        const computedConfidence = 100 - altSum;

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
                                                    {selectedAnswer === currentQuestion.correct_index ? '✓ CORRECT' : '✗ INCORRECT'}
                                                </div>

                                                <GTOScenarioDisplay
                                                    action={currentQuestion.options[currentQuestion.correct_index]?.split(' ')[0]?.replace(/[^a-zA-Z-]/g, '').toUpperCase() || 'OPTIMAL'}
                                                    confidence={computedConfidence}
                                                    explanation={currentQuestion.explanation}
                                                    gtoApproach={generateGTOApproach(currentQuestion)}
                                                    evAnalysis={generateEVAnalysis(currentQuestion)}
                                                    alternateLines={altLines}
                                                    isCorrectAnswer={selectedAnswer === currentQuestion.correct_index}
                                                    showDetails={true}
                                                />
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

                                            return (
                                                <button
                                                    key={index}
                                                    className={optionClass}
                                                    onClick={() => selectAnswer(index)}
                                                    disabled={showResult || isEliminated}
                                                >
                                                    <span className="option-letter">
                                                        {isEliminated ? '✗' : String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span className="option-text">
                                                        {isEliminated ? '---' : renderTextWithCards(formatPokerText(toTitleCase(option)))}
                                                    </span>
                                                    {showResult && index === currentQuestion.correct_index && (
                                                        <CheckCircle size={20} className="icon correct" style={{ color: 'white' }} />
                                                    )}
                                                    {showResult && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                                        <XCircle size={20} className="icon incorrect" style={{ color: 'white' }} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Lifelines */}
                                    {!showResult && (
                                        <div className="lifelines" style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '20px auto 0', maxWidth: '400px', width: '100%' }}>
                                            <button
                                                className="lifeline-btn"
                                                onClick={useFiftyFifty}
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
                                                className="lifeline-btn"
                                                onClick={useSkip}
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
                    {gameState === 'results' && (
                        <div className="results">
                            <div className="result-icon">
                                {correctCount >= 8 ? <Trophy size={48} color="#fbbf24" /> : correctCount >= 5 ? <CheckCircle size={48} color="#22c55e" /> : <Clock size={48} color="#3b82f6" />}
                            </div>
                            <h1>Challenge Complete!</h1>

                            <div className="score-card">
                                <div className="score-main">
                                    <span className="score-num">{correctCount}</span>
                                    <span className="score-total">/ {questions.length}</span>
                                </div>
                                <div className="score-label">Correct Answers</div>
                            </div>

                            <div className="reward-card">
                                <Gem size={24} />
                                <span className="diamonds-earned">
                                    +{calculateDiamonds(mode, correctCount, questions.length, 0)} Diamonds
                                </span>
                            </div>

                            <div className="action-buttons">
                                <button className="play-again" onClick={startGame} style={{ background: config.color }}>
                                    Play Again
                                </button>
                                <button className="back-btn" onClick={() => router.push('/hub/trivia')}>
                                    Back to Lobby
                                </button>
                            </div>
                        </div>
                    )}
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

                /* LOBBY — Full-bleed image */
                .lobby-image-wrapper {
                    position: relative;
                    cursor: pointer;
                    overflow: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    max-width: 100%;
                    margin: 0 auto;
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
            `}</style>
        </PageTransition >
    );
}
