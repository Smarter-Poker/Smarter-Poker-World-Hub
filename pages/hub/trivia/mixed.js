/**
 * MIXED MODE — Route: /hub/trivia/mixed
 * Rotating category trivia with per-category stats tracking
 * Cycles through: History → Rules → Pro → History → ...
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Trophy, BookOpen, GraduationCap, Gem, CheckCircle, XCircle, ArrowRight, Target, Banknote, Calculator, Brain } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP
const DAILY_DIAMOND_CAP = 10;

const CATEGORIES = [
    { id: 'poker_history', name: 'History', icon: Trophy, color: '#FFD700', dbCategories: ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts'] },
    { id: 'rule_knowledge', name: 'Rules', icon: BookOpen, color: '#4a90d9', dbCategories: ['rule_knowledge'] },
    { id: 'gto_theory', name: 'Pro', icon: GraduationCap, color: '#9D4EDD', dbCategories: ['gto_theory'] },
    // NEW STRATEGY CATEGORIES
    { id: 'mtt_situations', name: 'MTT', icon: Target, color: '#f97316', dbCategories: ['mtt_situations'] },
    { id: 'cash_game_situations', name: 'Cash', icon: Banknote, color: '#22c55e', dbCategories: ['cash_game_situations'] },
    { id: 'icm_chip_ev', name: 'ICM', icon: Calculator, color: '#06b6d4', dbCategories: ['icm_chip_ev'] },
    { id: 'gto_scenarios', name: 'GTO', icon: Brain, color: '#a855f7', dbCategories: ['gto_scenarios'] }
];

const QUESTIONS_PER_SESSION = 21; // 3 per category, 7 categories

export default function MixedModePage() {
    useTrainingBus('trivia-mixed');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-1 - shared trivia answer-state plumbing
    const trivia = useTriviaQuestion(questions[currentQuestionIndex], {
        onAnswer: ({ index, isCorrect }) => {
            setIsTimerRunning(false);

            const currentQuestion = questions[currentQuestionIndex];
            const category = currentQuestion?.displayCategory || 'poker_history';

            setCategoryStats(prev => ({
                ...prev,
                [category]: {
                    answered: prev[category].answered + 1,
                    correct: prev[category].correct + (isCorrect ? 1 : 0)
                }
            }));

            if (isCorrect) {
                setTotalCorrect(prev => prev + 1);
                setDiamondsEarned(prev => prev + 1);
                answersRef.current.push(true);
                busEmit.decisionCorrect(totalCorrect + 1);
            } else {
                answersRef.current.push(false);
                busEmit.decisionIncorrect(totalCorrect);
                busEmit.screenShake('light');
            }

            setTimeout(() => {
                if (currentQuestionIndex + 1 >= questions.length) {
                    finishGame();
                } else {
                    setCurrentQuestionIndex(prev => prev + 1);
                    trivia.reset();
                    setTimeLeft(24);
                    setIsTimerRunning(true);
                }
            }, 1200);
        }
    });
    const { selectedAnswer, showResult } = trivia;

    // Per-category stats for current session
    const [categoryStats, setCategoryStats] = useState({
        poker_history: { answered: 0, correct: 0 },
        rule_knowledge: { answered: 0, correct: 0 },
        gto_theory: { answered: 0, correct: 0 },
        mtt_situations: { answered: 0, correct: 0 },
        cash_game_situations: { answered: 0, correct: 0 },
        icm_chip_ev: { answered: 0, correct: 0 },
        gto_scenarios: { answered: 0, correct: 0 }
    });

    // Cumulative mastery from database
    const [categoryMastery, setCategoryMastery] = useState({});

    const [totalCorrect, setTotalCorrect] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const answersRef = useRef([]); // Track per-question correctness

    // 24-second shot clock
    const [timeLeft, setTimeLeft] = useState(24);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerRef = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race

    useEffect(() => {
        if (authLoading) return;
        async function initialize() {
            const user = avatarUser || getAuthUser();
            if (!user) {
                router.push('/hub/trivia');
                return;
            }

            setUserId(user.id);

            // Check VIP status
            await DiamondEngine.init(user.id);
            const vipStatus = await DiamondEngine.isVIP();
            setIsVip(vipStatus);

            // Load user diamonds
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .maybeSingle();

            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
            }

            // Load category mastery
            const { data: mastery } = await supabase
                .from('trivia_category_mastery')
                .select('*')
                .eq('user_id', user.id)
                .limit(50) // category mastery

            if (mastery) {
                const masteryMap = {};
                mastery.forEach(m => {
                    masteryMap[m.category] = m;
                });
                setCategoryMastery(masteryMap);
            }

            // Load questions
            await loadMixedQuestions(user.id);
            setGameState('ready');
        }

        initialize();
    }, []);

    // Realtime: Refresh diamond balance when scores change
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-mixed:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, async () => {
                try {
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.warn('[Mixed] Realtime refresh failed:', e);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    // Visibility-based timer pause + auto-resume on tab-return.
    // Phase 57: previously paused on tab-switch but never resumed → user stuck
    // forever on the question with no countdown. Now auto-resumes if game is
    // still in 'playing' state and showResult hasn't fired.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && isTimerRunning) {
                setIsTimerRunning(false);
            } else if (!document.hidden && !isTimerRunning && gameState === 'playing' && !showResult) {
                setIsTimerRunning(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isTimerRunning, gameState, showResult]);

    // Shot clock effect
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
    }, [isTimerRunning, showResult]);

    async function loadMixedQuestions(uid) {
        try {
            // 60-day non-repeat: Get user's recently seen question IDs using shared utility
            const excludeIds = await getRecentlySeenIds(supabase, uid, 200, 'mixed');


            // Phase 55: random-offset fetch per category instead of "first 50"
            // — was always pulling the same 50 rows per category every game.
            const categoryResults = await Promise.all(
                CATEGORIES.map(cat =>
                    fetchRandomQuestionPool(supabase, { category: cat.dbCategories, pageSize: 50 })
                        .then(data => {
                            if (!data || data.length === 0) return [];
                            // Phase 51: prefer high-quality questions in mixed/daily mode
                            const available = filterAndShuffle(data, excludeIds, 5, { minQualityScore: 6, preferHighQuality: true });
                            available.forEach(q => { q.displayCategory = cat.id; });
                            return available;
                        })
                        .catch(e => { console.warn('[Mixed] cat fetch failed:', cat.id, e); return []; })
                )
            );
            const allQuestions = categoryResults.flat();

            // Interleave categories: H, R, P, H, R, P, H, R, P, H, R, P, H, R, P
            const interleaved = [];
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < CATEGORIES.length; j++) {
                    const catQuestions = allQuestions.filter(q => q.displayCategory === CATEGORIES[j].id);
                    if (catQuestions[i]) {
                        interleaved.push(catQuestions[i]);
                    }
                }
            }

            setQuestions(shuffleOptions(interleaved));
        } catch (e) {
            console.warn('Failed to load mixed questions:', e);
        }
    }

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // Check if already paid via TriviaLobby (defense-in-depth)
        const alreadyPaid = sessionStorage.getItem('trivia_paid') === 'true'
            && sessionStorage.getItem('trivia_mode') === 'mixed';
        if (alreadyPaid) {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        }

        // Per-game diamond gate (VIP bypass, skip if already paid)
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

                if (freshBalance < GAME_ENTRY_COST) {
                    setShowOutOfDiamonds(true);
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_mixed');
                if (!result.success) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Mixed] Diamond deduction failed:', e);
                setShowOutOfDiamonds(true);
                return;
            }
        }
        setCurrentQuestionIndex(0);
        trivia.reset();
        setTotalCorrect(0);
        setDiamondsEarned(0);
        answersRef.current = [];
        setCategoryStats({
            poker_history: { answered: 0, correct: 0 },
            rule_knowledge: { answered: 0, correct: 0 },
            gto_theory: { answered: 0, correct: 0 },
            mtt_situations: { answered: 0, correct: 0 },
            cash_game_situations: { answered: 0, correct: 0 },
            icm_chip_ev: { answered: 0, correct: 0 },
            gto_scenarios: { answered: 0, correct: 0 }
        });
        setTimeLeft(24);
        setIsTimerRunning(true);
        setGameState('playing');
        } finally {
            isStartingRef.current = false;
        }
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        trivia.selectAnswer(-1); // Wrong answer - delegates to shared hook
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=diamonds, 2=mastery, 3=history, 4=score

    async function finishGame() {
        setIsTimerRunning(false);
        setGameState('saving');

        if (!userId) {
            setGameState('results');
            return;
        }

        // Recompute from answersRef (always current) to avoid stale closure from setTimeout
        const actualCorrect = answersRef.current.filter(Boolean).length;
        const actualDiamonds = actualCorrect; // 1 diamond per correct answer

        // Sync state for UI display
        setTotalCorrect(actualCorrect);
        setDiamondsEarned(actualDiamonds);

        try {
            let actualAwarded = 0;
            // Phase 1: Award diamonds (only if not already awarded)
            if (savePhaseRef.current < 1) {
                // Clamp to daily cap
                const earnedToday = await getDailyDiamondsEarned(supabase, userId, 'mixed');
                const cappedDiamonds = clampToCap(earnedToday, actualDiamonds, DAILY_DIAMOND_CAP);
                if (cappedDiamonds > 0) {
                    const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: cappedDiamonds,
                        p_type: 'mixed_reward',
                        p_description: `Mixed mode — ${cappedDiamonds}💎`,
                        p_reference_id: `mixed_reward_${userId}_${Math.floor(Date.now()/60000)}`  // Phase 56: per-minute bucket
                    });
                    if (__rpcErr) throw __rpcErr;
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                    busEmit.diamondsEarned(cappedDiamonds, 'Mixed Mode');
                    busEmit.celebration('confetti');
                    actualAwarded = cappedDiamonds;
                }
                savePhaseRef.current = 1;
            }

            // Phase 2: Update category mastery (only if not already updated)
            if (savePhaseRef.current < 2) {
                const actualCategoryStats = {};
                answersRef.current.forEach((wasCorrect, idx) => {
                    const q = questions[idx];
                    if (!q) return;
                    const cat = q.displayCategory || 'poker_history';
                    if (!actualCategoryStats[cat]) actualCategoryStats[cat] = { answered: 0, correct: 0 };
                    actualCategoryStats[cat].answered += 1;
                    if (wasCorrect) actualCategoryStats[cat].correct += 1;
                });

                for (const [category, stats] of Object.entries(actualCategoryStats || {})) {
                    if (stats.answered === 0) continue;

                    // Phase 59: capture errors on the 3 mastery DB calls — were
                    // silently swallowed, so failures advanced savePhaseRef and
                    // claimed success. Mastery mistakes are non-critical (will
                    // self-heal on next game), so we warn rather than throw.
                    const { data: existing, error: selErr } = await supabase
                        .from('trivia_category_mastery')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('category', category)
                        .maybeSingle();
                    if (selErr) {
                        console.warn('[Mixed] mastery select failed (skip cat):', selErr.message);
                        continue;
                    }

                    if (existing) {
                        const newTotal = existing.total_answered + stats.answered;
                        const newCorrect = existing.correct_count + stats.correct;
                        const accuracy = newTotal > 0 ? newCorrect / newTotal : 0;
                        const newLevel = Math.min(10, Math.max(1, Math.floor(accuracy * 10) + 1));

                        const { error: updErr } = await supabase
                            .from('trivia_category_mastery')
                            .update({
                                total_answered: newTotal,
                                correct_count: newCorrect,
                                mastery_level: newLevel,
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId)
                            .eq('category', category);
                        if (updErr) console.warn('[Mixed] mastery update failed:', updErr.message);
                    } else {
                        const { error: insErr } = await supabase
                            .from('trivia_category_mastery')
                            .insert({
                                user_id: userId,
                                category,
                                total_answered: stats.answered,
                                correct_count: stats.correct,
                                mastery_level: 1
                            });
                        if (insErr) console.warn('[Mixed] mastery insert failed:', insErr.message);
                    }
                }
                savePhaseRef.current = 2;
            }

            // Phase 3: Record question history (only if not already recorded).
            // Phase 59: filter null question_id (FK violation guard) + capture
            // upsert errors that were silently swallowed.
            if (savePhaseRef.current < 3) {
                const answeredCount = answersRef.current.length;
                if (answeredCount > 0) {
                    const answeredQuestions = questions.slice(0, answeredCount);
                    const historyRecords = answeredQuestions
                        .filter(q => q && q.id != null)
                        .map((q, idx) => ({
                            user_id: userId,
                            question_id: q.id,
                            was_correct: answersRef.current[idx] || false,
                            seen_at: new Date().toISOString(),
                            mode: 'mixed'
                        }));

                    if (historyRecords.length > 0) {
                        const { error: historyErr } = await supabase
                            .from('trivia_user_question_history')
                            .upsert(historyRecords, {
                                onConflict: 'user_id,question_id',
                                ignoreDuplicates: false
                            });
                        if (historyErr) {
                            console.warn('[Mixed] History upsert failed (non-fatal):', historyErr.message);
                        }
                    }
                }
                savePhaseRef.current = 3;
            }

            // Phase 4: Save score (only if not already saved).
            // Capture insert error — supabase-js does NOT throw on DB errors.
            if (savePhaseRef.current < 4) {
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'mixed',
                    score: actualCorrect * 100,
                    correct_count: actualCorrect,
                    total_questions: questions.length,
                    diamonds_earned: actualAwarded,
                    // Phase 73: CST-anchored play_date so leaderboard.js (which
                    // queries by CST today) finds same-day rows.
                    play_date: getTodayCST()
                });
                if (scoreErr) throw scoreErr;
                savePhaseRef.current = 4;
            }

            // Success! Game saved — reset phase for next game
            setGameState('results');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Mixed] Failed to save results:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ actualCorrect, actualDiamonds });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        finishGame(); // savePhaseRef skips already-completed steps
    };

    const currentQuestion = questions[currentQuestionIndex];
    const currentCategory = CATEGORIES.find(c => c.id === currentQuestion?.displayCategory) || CATEGORIES[0];
    const CategoryIcon = currentCategory.icon;

    return (
        <TriviaErrorBoundary pageName="Mixed Mode">
            <SEOHead
                title="Mixed Trivia — All Categories"
                description="Challenge Yourself With Mixed Poker Trivia Covering All Categories And Difficulty Levels."
                canonical="/hub/trivia/mixed"
            />

            <div className="mixed-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                {/* Per-game cost popup (one-time) */}
                {userId && !isVip && (
                    <GameCostPopup userId={userId} featureKey="trivia_mixed" isVip={isVip} cost={10} />
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

                <div className="content">
                    {/* Combine loading and saving states to use the beautiful new Skeleton */}
                    {(gameState === 'loading' || gameState === 'saving') && (
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
                                    We couldn't save your score of {saveErrorPayload?.actualCorrect} correct answers because you lost connection. Please check your internet and try again so you don't lose {saveErrorPayload?.actualDiamonds}💎!
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

                    {gameState === 'ready' && (
                        <div
                            className="lobby-image-wrapper"
                            onClick={startGame}
                            style={{
                                cursor: 'pointer',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 212, 255, 0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <Image src="/images/trivia/lobby-mixed.jpg" alt="Mixed Mode - Start Challenge" width={686} height={1024} className="lobby-image" style={{ width: '100%', height: 'auto', display: 'block' }} />
                        </div>
                    )}

                    {gameState === 'playing' && currentQuestion && (
                        <div className="playing-screen">
                            {/* Category indicator + Timer */}
                            <div className="top-bar">
                                <div className="category-badge" style={{ borderColor: currentCategory.color }}>
                                    <CategoryIcon size={18} color={currentCategory.color} />
                                    <span style={{ color: currentCategory.color }}>{currentCategory.name}</span>
                                </div>
                                <div className={`timer ${timeLeft <= 8 ? 'warning' : ''} ${timeLeft <= 3 ? 'danger' : ''}`}>
                                    {timeLeft}s
                                </div>
                            </div>

                            {/* Progress */}
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                                />
                            </div>
                            <div className="progress-text">
                                Question {currentQuestionIndex + 1} of {questions.length}
                            </div>

                            {/* Question */}
                            <MetalFrame padding="24px" showBolts={false}>
                                <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                                <div className="options">
                                    {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-1 — shared option primitive */}
                                {currentQuestion.options.map((option, idx) => (
                                  <TriviaAnswerOption
                                    key={idx}
                                    index={idx}
                                    option={toTitleCase(option)}
                                    selectedAnswer={selectedAnswer}
                                    correctIndex={currentQuestion.correct_index}
                                    showResult={showResult}
                                    onSelect={trivia.selectAnswer}
                                  />
                                ))}
                                </div>

                                {showResult && currentQuestion.explanation && (
                                    <div className="explanation">
                                        <strong>💡</strong> {currentQuestion.explanation}
                                    </div>
                                )}
                            </MetalFrame>

                            {/* Per-category mini stats */}
                            <div className="category-stats">
                                {CATEGORIES.map(cat => {
                                    const stats = categoryStats[cat.id];
                                    return (
                                        <div key={cat.id} className="cat-stat" style={{ borderColor: cat.color }}>
                                            <span style={{ color: cat.color }}>{cat.name}</span>
                                            <span>{stats.correct}/{stats.answered}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {gameState === 'results' && (
                        <div className="results-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h1 className="results-title">MIXED MODE COMPLETE!</h1>

                                <div className="score-display">
                                    <div className="big-score">{totalCorrect}/{questions.length}</div>
                                    <div className="score-label">Correct</div>
                                </div>

                                <div className="diamonds-earned">
                                    <Gem size={24} color="#00D4FF" />
                                    <span>+{diamondsEarned} Diamonds</span>
                                </div>

                                <div className="category-breakdown">
                                    <h3>Category Breakdown</h3>
                                    {CATEGORIES.map(cat => {
                                        const stats = categoryStats[cat.id];
                                        const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
                                        return (
                                            <div key={cat.id} className="cat-result">
                                                <cat.icon size={20} color={cat.color} />
                                                <span className="cat-name" style={{ color: cat.color }}>{cat.name}</span>
                                                <span className="cat-score">{stats.correct}/{stats.answered}</span>
                                                <span className="cat-accuracy">{accuracy}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="result-actions">
                                    <HexButton onClick={startGame} variant="primary" size="md">
                                        <ArrowRight size={16} /> Play Again
                                    </HexButton>
                                    <HexButton onClick={async () => {
                                        const r = await shareResult({ mode: 'Mixed', score: totalCorrect, total: questions.length, diamonds: diamondsEarned });
                                        if (r === 'copied') alert('Result copied to clipboard!');
                                    }} variant="secondary" size="md">
                                        Share Result
                                    </HexButton>
                                    <HexButton onClick={() => router.push('/hub/trivia')} variant="secondary" size="md">
                                        Back to Trivia
                                    </HexButton>
                                </div>
                            </MetalFrame>
                        </div>
                    )}
                </div>
              <BottomNavBar />
            </div>

            <style>{`
                .mixed-page {
                    min-height: 100vh; padding-bottom: 70px;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                    max-width: 100%;
                    margin: 0 auto;
                }

                .loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00D4FF;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .mode-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    color: #fff;
                    margin: 12px 0 8px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }

                .mode-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .mode-info {
                    display: flex;
                    justify-content: center;
                    gap: 24px;
                    margin-bottom: 32px;
                }

                .info-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .info-item .label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                .info-item .value {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                }

                /* Playing screen */
                .top-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .category-badge {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid;
                    border-radius: 8px;
                    font-weight: 600;
                }

                .timer {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                    padding: 8px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 8px;
                }

                .timer.warning { color: #fbbf24; }
                .timer.danger { color: #ef4444; animation: pulse 0.5s infinite; }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .progress-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    margin-bottom: 8px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00D4FF, #8b5cf6);
                    border-radius: 3px;
                    transition: width 0.3s;
                }

                .progress-text {
                    text-align: center;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 16px;
                }

                .question-text {
                    font-size: 18px;
                    color: #fff;
                    margin: 0 0 20px;
                    line-height: 1.5;
                }

                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .option {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                    color: #fff;
                }

                /* hover removed per user request */

                .option.selected {
                    border-color: #00D4FF;
                }

                .option.correct {
                    background: rgba(34, 197, 94, 0.2);
                    border-color: #22c55e;
                }

                .option.wrong {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                }

                .option-letter {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .option-text {
                    flex: 1;
                }

                .result-icon {
                    margin-left: auto;
                }

                .option.correct .result-icon { color: #22c55e; }
                .option.wrong .result-icon { color: #ef4444; }

                .explanation {
                    margin-top: 16px;
                    padding: 12px 16px;
                    background: rgba(0, 212, 255, 0.1);
                    border-left: 3px solid #00D4FF;
                    border-radius: 0 8px 8px 0;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .category-stats {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-top: 16px;
                }

                .cat-stat {
                    padding: 8px 12px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid;
                    border-radius: 6px;
                    font-size: 13px;
                    display: flex;
                    gap: 8px;
                }

                /* Results */
                .results-screen {
                    position: fixed;
                    inset: 0;
                    z-index: 1000;
                    background: rgba(0, 0, 0, 0.88);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    text-align: center;
                    animation: resultFadeIn 0.4s ease;
                }

                @keyframes resultFadeIn {
                    from { opacity: 0; transform: scale(0.92); }
                    to { opacity: 1; transform: scale(1); }
                }

                .results-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    color: #00D4FF;
                    margin: 0 0 24px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }

                .score-display {
                    margin-bottom: 16px;
                }

                .big-score {
                    font-size: 48px;
                    font-weight: 700;
                    color: #fff;
                }

                .score-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .diamonds-earned {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: 24px;
                    font-weight: 600;
                    color: #00D4FF;
                    margin-bottom: 24px;
                }

                .category-breakdown {
                    background: rgba(30, 41, 59, 0.4);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .category-breakdown h3 {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 12px;
                    text-transform: uppercase;
                }

                .cat-result {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .cat-result:last-child { border-bottom: none; }

                .cat-name {
                    flex: 1;
                    text-align: left;
                    font-weight: 600;
                }

                .cat-score {
                    color: #fff;
                    font-weight: 600;
                }

                .cat-accuracy {
                    width: 50px;
                    text-align: right;
                    color: rgba(255, 255, 255, 0.5);
                }

                .result-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }

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
