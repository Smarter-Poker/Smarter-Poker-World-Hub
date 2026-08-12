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
import { getAuthUser, getSessionToken } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Trophy, BookOpen, GraduationCap, Gem, Lightbulb, ArrowRight, Target, Banknote, Calculator, Brain } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { shareResult } from '../../../src/lib/trivia/shareResult';
import { getDailyDiamondsEarned } from '../../../src/lib/trivia/diamondCap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';

const GAME_ENTRY_COST = 10; // restored with server-graded adoption - rewards pay via award_trivia_run now
// Cap comes from triviaEngine so the lobby and the payout can never disagree.
// The local literal was 10 — below a single 10-diamond entry fee, which made
// the mode net-negative by construction.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS.mixed) ? DAILY_DIAMOND_CAPS.mixed : 40;

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

// Server-dealt sessions draw across the mode's categories - the old exact
// 3-per-category client-side deal is necessarily gone.
const QUESTIONS_PER_SESSION = 21;

// The server labels questions with db-level category names; map each one back
// to the page's seven display groups so the per-category stat panels keep
// working.
function displayCategoryFor(dbCategory) {
    const cat = CATEGORIES.find(c => c.dbCategories.includes(dbCategory));
    return cat ? cat.id : 'poker_history';
}

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
    // Server-authoritative run: /api/trivia/session-start deals (and permutes)
    // the questions, session-answer grades each tap, session-submit caps and
    // pays - the client never receives an answer key.
    const serverRun = useServerGradedRun('mixed');
    // Current question's server verdict (wasCorrect / correctDisplayIndex /
    // explanation); null until session-answer resolves, cleared on advance.
    const [verdict, setVerdict] = useState(null);
    // Locks taps from the moment of the tap until the question advances, so a
    // slow session-answer round-trip cannot accept a second answer.
    const answerLockRef = useRef(false);

    // TRAIN-WIRE-TRIVIA-HOOK-1 - shared trivia answer-state plumbing.
    // Taps route through gradeAnswer() below instead of trivia.selectAnswer:
    // the hook's local grading needs a client-side answer key this page no
    // longer receives, so the reveal is driven through the hook's setters
    // once the server verdict arrives.
    const trivia = useTriviaQuestion(questions[currentQuestionIndex]);
    const { selectedAnswer, showResult } = trivia;

    // TRAIN-WIRE-TRIVIA-TIMER-1 - shared shot-clock hook
    const timer = useTriviaTimer({ initialTime: 24, showResult: trivia.showResult, gameState, onTimeout: handleTimeout });

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
    const [capReached, setCapReached] = useState(false);
    const [earnedTodayCap, setEarnedTodayCap] = useState(0); // diamonds earned today (for cap display)
    const [loadError, setLoadError] = useState(null);
    const [accessToken, setAccessToken] = useState(null); // for ReportQuestionButton
    const answersRef = useRef([]); // per index: { questionId, displayIndex, wasCorrect } from the server verdict

    const isStartingRef = useRef(false); // Prevent double-click race
    const didInitRef = useRef(false); // Guard against double-init across dep re-fires

    useEffect(() => {
        // Wait for AvatarContext to resolve — with an empty dep array this
        // effect used to run once while authLoading was still true and never
        // again, leaving the page stuck on the skeleton forever after a hard
        // load. Deps below re-fire it when auth resolves.
        if (authLoading) return;
        if (didInitRef.current) return;
        async function initialize() {
            const user = avatarUser || getAuthUser();
            if (!user) {
                router.push('/hub/trivia');
                return;
            }
            didInitRef.current = true;

            setUserId(user.id);

            // Session token for the report-question API.
            // getSessionToken() (from authUtils) reads from localStorage and
            // avoids the async auth-lock held by the Supabase session API.
            setAccessToken(getSessionToken() || null);

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

            // Diamonds already earned today in mixed mode (cap awareness UI)
            try {
                const earnedToday = await getDailyDiamondsEarned(supabase, user.id, 'mixed');
                setEarnedTodayCap(earnedToday);
            } catch (e) { console.warn('[Mixed] Cap fetch failed:', e); }

            // Questions are dealt by the server when a game starts - nothing
            // to preload here.
            setGameState('ready');
        }

        initialize();
    }, [authLoading, avatarUser?.id]);

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

    // Per-answer server grading. Lock the tap immediately, record it with
    // /api/trivia/session-answer (the first answer per question is BINDING
    // server-side), then reveal from the verdict. A failed call unlocks so the
    // player can re-tap - the endpoint is idempotent per question, so a retry
    // cannot double-record.
    async function gradeAnswer(displayIndex) {
        if (answerLockRef.current || trivia.showResult) return;
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        answerLockRef.current = true;
        trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            applyVerdict(q, displayIndex, v);
        } catch (e) {
            console.warn('[Mixed] Answer grading failed:', e?.message || e);
            if (displayIndex < 0) {
                // Timeout skip that could not reach the server: no re-tap is
                // possible, so record it locally (session-submit still grades
                // it server-side) and advance without a reveal.
                recordAnswer(q, -1, false);
                advanceOrFinish();
            } else {
                // Unlock and let the player re-tap.
                trivia.setSelectedAnswer(null);
                answerLockRef.current = false;
            }
        }
    }

    // Side effects that used to key off the client-computed isCorrect now key
    // off the server verdict.
    function applyVerdict(q, displayIndex, v) {
        timer.setIsTimerRunning(false);
        setVerdict(v);
        trivia.setShowResult(true);
        recordAnswer(q, displayIndex, v?.wasCorrect === true);
        advanceOrFinish();
    }

    function recordAnswer(q, displayIndex, wasCorrect) {
        const category = q.displayCategory || 'poker_history';
        setCategoryStats(prev => ({
            ...prev,
            [category]: {
                answered: (prev[category]?.answered || 0) + 1,
                correct: (prev[category]?.correct || 0) + (wasCorrect ? 1 : 0)
            }
        }));
        answersRef.current[currentQuestionIndex] = { questionId: q.id, displayIndex, wasCorrect };
        if (wasCorrect) {
            setTotalCorrect(prev => prev + 1);
            setDiamondsEarned(prev => prev + 1);
            busEmit.decisionCorrect(totalCorrect + 1);
        } else {
            busEmit.decisionIncorrect(totalCorrect);
            busEmit.screenShake('light');
        }
    }

    function advanceOrFinish() {
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishGame();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setVerdict(null);
                trivia.reset();
                answerLockRef.current = false;
                timer.resetTimer();
            }
        }, 1200);
    }

    async function startGame() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        setLoadError(null);
        setGameState('loading');

        // Open the server session BEFORE any charge, so a start failure can
        // never eat an entry fee. The server deals (and permutes) the
        // questions - they are used VERBATIM, because reshuffling them or
        // their options would break the display-index mapping the grader
        // uses. The draw spans the mode's categories server-side.
        let served;
        try {
            served = await serverRun.start({ count: QUESTIONS_PER_SESSION });
        } catch (e) {
            console.warn('[Mixed] Server session start failed:', e?.message || e);
            setLoadError('Could not start the game. Please try again in a moment.');
            setGameState('error');
            return;
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // NEVER charge for an empty game.
            serverRun.reset();
            setLoadError('No questions are available right now. Please try again in a moment.');
            setGameState('error');
            return;
        }
        // Tag each question with its display group so the per-category stat
        // panels keep working against the server's db-level category names.
        served.questions.forEach(q => { q.displayCategory = displayCategoryFor(q.category); });

        // NOTE: the `sessionStorage.trivia_paid` short-circuit is gone. Nothing
        // writes that flag any more, so all it could still do was let a stale
        // flag from an earlier session buy a free entry. Always charge.

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
                    setGameState('ready');
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_mixed');
                if (!result.success) {
                    serverRun.reset();
                    setShowOutOfDiamonds(true);
                    setGameState('ready');
                    return;
                }
                if (result.balance !== undefined) setUserDiamonds(result.balance);
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Mixed] Diamond deduction failed:', e);
                serverRun.reset();
                setShowOutOfDiamonds(true);
                setGameState('ready');
                return;
            }
        }
        setQuestions(served.questions);
        setCurrentQuestionIndex(0);
        trivia.reset();
        setVerdict(null);
        answerLockRef.current = false;
        setTotalCorrect(0);
        setDiamondsEarned(0);
        setCapReached(false);
        serverResultRef.current = null;
        savePhaseRef.current = 0;
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
        timer.resetTimer();
        setGameState('playing');
        } finally {
            isStartingRef.current = false;
        }
    }

    function handleTimeout() {
        timer.setIsTimerRunning(false);
        gradeAnswer(-1); // records a skip server-side and reveals the answer
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // 0=none, 1=settled, 2=mastery, 3=history, 4=score
    // Server settlement result, kept in a ref so a saving_error retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    async function finishGame() {
        timer.setIsTimerRunning(false);
        setGameState('saving');

        if (!userId) {
            setGameState('results');
            return;
        }

        // Provisional client-side count, used ONLY for the saving_error copy -
        // every number that persists below comes from the server settlement.
        const provisionalCorrect = answersRef.current.filter(a => a && a.wasCorrect).length;

        try {
            // Phase 1: settle the run server-side (only if not already settled).
            // The server grades from the answers it stored at tap time - the
            // array below only fills in questions that never reached
            // session-answer - then applies the daily cap and pays through a
            // locked RPC. No client-side crediting, ever.
            if (savePhaseRef.current < 1) {
                const submitAnswers = questions.map((q, idx) => {
                    const a = answersRef.current[idx];
                    return {
                        questionId: q.id,
                        displayIndex: (a && Number.isInteger(a.displayIndex)) ? a.displayIndex : -1
                    };
                });
                const result = await serverRun.submit(submitAnswers);
                serverResultRef.current = result;
                savePhaseRef.current = 1;

                // Local balance from the server's post-award number, with a
                // fresh profiles read as the fallback.
                if (Number.isFinite(result?.newBalance)) {
                    setUserDiamonds(result.newBalance);
                } else {
                    const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                }
                if ((result?.diamondsAwarded || 0) > 0) {
                    busEmit.diamondsEarned(result.diamondsAwarded, 'Mixed Mode');
                    busEmit.celebration('confetti');
                }
            }
            const settled = serverResultRef.current || {};
            const awarded = Number.isFinite(settled.diamondsAwarded) ? settled.diamondsAwarded : 0;
            const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : provisionalCorrect;
            const serverTotal = Number.isFinite(settled.total) ? settled.total : questions.length;
            const serverScore = Number.isFinite(settled.score) ? settled.score : serverCorrect * 100;

            // questionId -> wasCorrect from the server's per-question verdicts,
            // for the mastery and history phases below.
            const verdictMap = {};
            (Array.isArray(settled.perQuestion) ? settled.perQuestion : []).forEach(pq => {
                if (pq && typeof pq.questionId === 'string') verdictMap[pq.questionId] = pq.wasCorrect === true;
            });

            // Phase 2: Update category mastery (only if not already updated).
            // Correctness comes from the server's verdicts - the client has no
            // answer key to compare against.
            if (savePhaseRef.current < 2) {
                const actualCategoryStats = {};
                questions.forEach(q => {
                    if (!q || q.id == null) return;
                    const cat = q.displayCategory || 'poker_history';
                    if (!actualCategoryStats[cat]) actualCategoryStats[cat] = { answered: 0, correct: 0 };
                    actualCategoryStats[cat].answered += 1;
                    if (verdictMap[q.id]) actualCategoryStats[cat].correct += 1;
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
                const servedQuestions = questions.filter(q => q && q.id != null);
                if (servedQuestions.length > 0) {
                    // was_correct comes from the server's per-question verdicts
                    const historyRecords = servedQuestions.map(q => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: verdictMap[q.id] === true,
                        seen_at: new Date().toISOString(),
                        mode: 'mixed'
                    }));

                    if (historyRecords.length > 0) {
                        // FIX(audit #9): ignoreDuplicates:true => INSERT ... ON
                        // CONFLICT DO NOTHING. trivia_user_question_history has
                        // SELECT + INSERT RLS policies but NO UPDATE policy, so
                        // ignoreDuplicates:false (which UPDATEs on conflict) was
                        // rejected by RLS and failed the ENTIRE batch whenever
                        // any question in the session had been seen before —
                        // silently dropping the whole run's history, eroding the
                        // 60-day non-repeat guarantee, and letting playAgain()
                        // re-serve the identical just-played set. Survival,
                        // endless and time-attack already carry this fix; mixed
                        // was the one page left behind.
                        const { error: historyErr } = await supabase
                            .from('trivia_user_question_history')
                            .upsert(historyRecords, {
                                onConflict: 'user_id,question_id',
                                ignoreDuplicates: true
                            });
                        if (historyErr) {
                            console.warn('[Mixed] History upsert failed (non-fatal):', historyErr.message);
                        }
                    }
                }
                savePhaseRef.current = 3;
            }

            // Phase 4: Save score with the SERVER numbers (only if not already
            // saved). Capture insert error — supabase-js does NOT throw on DB
            // errors.
            if (savePhaseRef.current < 4) {
                const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    username: avatarUser?.username || avatarUser?.display_name || null,
                    mode: 'mixed',
                    score: serverScore,
                    correct_count: serverCorrect,
                    total_questions: serverTotal,
                    diamonds_earned: awarded,
                    // Phase 73: CST-anchored play_date so leaderboard.js (which
                    // queries by CST today) finds same-day rows.
                    play_date: getTodayCST()
                });
                if (scoreErr) throw scoreErr;
                savePhaseRef.current = 4;
            }

            // Success! The results screen shows the server-settled numbers -
            // the award was already cap-clamped and paid server-side, so an
            // award below the correct count means the daily cap absorbed the
            // difference.
            setTotalCorrect(serverCorrect);
            setDiamondsEarned(awarded);
            setCapReached(awarded < serverCorrect);
            setEarnedTodayCap(prev => Math.min(DAILY_DIAMOND_CAP, prev + awarded));

            // Game saved — reset phase for next game
            setGameState('results');
            setSaveErrorPayload(null);
            savePhaseRef.current = 0;
        } catch (e) {
            console.warn('[Mixed] Failed to save results:', e);
            // Save failed (network drop) -> Provide Retry UI (savePhaseRef preserves progress)
            setSaveErrorPayload({ actualCorrect: provisionalCorrect, actualDiamonds: provisionalCorrect });
            setGameState('saving_error');
        }
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        finishGame(); // savePhaseRef skips already-completed steps
    };

    // Play Again - the server deals a FRESH set for every session (the
    // just-played questions are now in trivia_user_question_history), and
    // startGame() opens the new session BEFORE charging another entry fee.
    async function playAgain() {
        await startGame();
    }

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
                    <GameCostPopup userId={userId} featureKey="trivia_mixed" isVip={isVip} cost={GAME_ENTRY_COST} />
                )}

                {/* Out of diamonds modal */}
                {showOutOfDiamonds && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                        <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 16, padding: 32, textAlign: 'center', maxWidth: 360 }}>
                            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Gem size={48} color="#00D4FF" /></div>
                            <h3 style={{ color: '#fff', marginBottom: 8 }}>Not Enough Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>Each Game Costs {GAME_ENTRY_COST} Diamonds. Get More Diamonds Or Upgrade To VIP For Unlimited Access!</p>
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
                                    We couldn't save your score of {saveErrorPayload?.actualCorrect} correct answers because you lost connection. Please check your internet and try again so you don't lose {saveErrorPayload?.actualDiamonds} Diamonds!
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
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', color: 'rgba(255,255,255,0.7)', padding: 24 }}>
                            <p style={{ margin: 0 }}>{loadError || 'Something went wrong loading the game.'}</p>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button
                                    onClick={() => {
                                        // Retries the whole start; the entry fee
                                        // is only charged after a session opens.
                                        startGame();
                                    }}
                                    style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #00D4FF, #0088FF)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Try Again
                                </button>
                                <button
                                    onClick={() => router.push('/hub/trivia')}
                                    style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
                                >
                                    Back To Trivia
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
                                <div className="cap-chip" title="Daily bonus diamonds earned">
                                    <Gem size={14} color="#00D4FF" />
                                    <span>{Math.min(DAILY_DIAMOND_CAP, earnedTodayCap + diamondsEarned)}/{DAILY_DIAMOND_CAP} Today</span>
                                </div>
                                <div className={`timer ${timer.timeLeft <= 8 ? 'warning' : ''} ${timer.timeLeft <= 3 ? 'danger' : ''}`}>
                                    {timer.timeLeft}s
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
                                    correctIndex={verdict ? verdict.correctDisplayIndex : null}
                                    showResult={showResult}
                                    onSelect={gradeAnswer}
                                  />
                                ))}
                                </div>

                                {showResult && verdict?.explanation && (
                                    <div className="explanation">
                                        <Lightbulb size={16} color="#00D4FF" style={{ flexShrink: 0, verticalAlign: 'text-bottom', marginRight: 6 }} />
                                        {verdict.explanation}
                                    </div>
                                )}
                                {showResult && (
                                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                                        <ReportQuestionButton key={currentQuestion.id} questionId={currentQuestion.id} userToken={accessToken} />
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

                                {capReached && (
                                    <div className="cap-note">
                                        Daily diamond cap reached ({DAILY_DIAMOND_CAP}/day) — correct answers still count toward your category mastery!
                                    </div>
                                )}

                                <div className="category-breakdown">
                                    <h3>Category Breakdown</h3>
                                    {CATEGORIES.map(cat => {
                                        const stats = categoryStats[cat.id];
                                        const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
                                        const masteryLevel = categoryMastery[cat.id]?.mastery_level;
                                        return (
                                            <div key={cat.id} className="cat-result">
                                                <cat.icon size={20} color={cat.color} />
                                                <span className="cat-name" style={{ color: cat.color }}>{cat.name}</span>
                                                {masteryLevel != null && (
                                                    <span className="cat-mastery" title="Cumulative mastery level">Lv {masteryLevel}</span>
                                                )}
                                                <span className="cat-score">{stats.correct}/{stats.answered}</span>
                                                <span className="cat-accuracy">{accuracy}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="result-actions">
                                    <HexButton onClick={playAgain} variant="primary" size="md">
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

                .cap-chip {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 12px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(0, 212, 255, 0.25);
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.8);
                }

                .cap-note {
                    padding: 10px 14px;
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.35);
                    border-radius: 10px;
                    color: #fbbf24;
                    font-size: 12px;
                    margin-bottom: 20px;
                }

                .cat-mastery {
                    padding: 2px 8px;
                    background: rgba(0, 212, 255, 0.12);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #00D4FF;
                }

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
