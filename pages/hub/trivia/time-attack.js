/**
 * TIME ATTACK PAGE — Route: /hub/trivia/time-attack
 * 30 seconds to answer as many as possible
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
// NOTE: ReportQuestionButton was imported here but never rendered — the
// per-question UI for this mode lives in <TimeAttackGame>, which this page does
// not own. The dead import is removed rather than left in the bundle; wiring the
// report button belongs inside src/components/trivia/TimeAttackGame.jsx.

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TimeAttackGame from '../../../src/components/trivia/TimeAttackGame';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Timer, Trophy, Gem, Zap, Play } from 'lucide-react';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { getTodayCST, getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';

const GAME_ENTRY_COST = 0; // was 10 - free until this page adopts server grading; its reward RPC has been dead since 2026-08-03 (see triviaEngine.ts INTERIM FREE ENTRY)

// Phase 80: the cap lives in triviaEngine so the page, <TimeAttackGame>'s results
// display and the shared clampToCap helper all agree. The old local value of 5 was
// below a single 10-diamond entry (mathematically unwinnable) AND disagreed with the
// engine value the component reads, which made the results screen over-report earnings.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS['time-attack'])
    ? DAILY_DIAMOND_CAPS['time-attack']
    : 40;

export default function TimeAttackPage() {
    useTrainingBus('trivia-time-attack');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [gameState, setGameState] = useState('lobby');
    const isStartingRef = useRef(false); // Prevent double-click race
    const [questions, setQuestions] = useState([]);
    const [userId, setUserId] = useState(null);
    const [dailyDiamondsEarned, setDailyDiamondsEarned] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [personalBest, setPersonalBest] = useState(0);
    const [result, setResult] = useState(null);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [startError, setStartError] = useState(null);

    useEffect(() => {
        if (authLoading) return;
        // Phase 56: was missing .catch — if either promise rejected, unhandled
        // rejection propagated up. Now caught + logged with finally still firing.
        Promise.all([loadUserData(), loadLeaderboard()])
            .catch(e => console.warn('[TimeAttack] init load failed:', e))
            .finally(() => setPageLoading(false));
    }, [avatarUser?.id, authLoading]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-ta:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, () => { loadUserData(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    async function loadUserData() {
        const user = avatarUser || getAuthUser();
        if (!user) return;

        setUserId(user.id);

        // Check VIP status
        await DiamondEngine.init(user.id);
        const vipStatus = await DiamondEngine.isVIP();
        setIsVip(vipStatus);

        // Get today's time attack diamonds.
        // Phase 73: was UTC date — same 6-hour drift as diamondCap.
        // Use CST start-of-day so the displayed daily total is accurate
        // for users in the CST timezone window.
        const todayStartCST = getTodayStartCST();
        const { data: scores } = await supabase
            .from('trivia_scores')
            .select('diamonds_earned')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .gte('created_at', todayStartCST)
            .limit(50) // time attack scores

        if (scores) {
            const total = scores.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
            setDailyDiamondsEarned(total);
        }

        // Get personal best
        const { data: best } = await supabase
            .from('trivia_scores')
            .select('correct_count')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .order('correct_count', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (best) {
            setPersonalBest(best.correct_count);
        }
    }

    async function loadLeaderboard() {
        const { data } = await supabase
            .from('trivia_scores')
            .select(`
                correct_count,
                user_id,
                profiles!inner(username)
            `)
            .eq('mode', 'time-attack')
            .order('correct_count', { ascending: false })
            .limit(10);

        if (data) {
            // Dedupe by user, keep best
            const userBest = new Map();
            data.forEach(entry => {
                const existing = userBest.get(entry.user_id);
                if (!existing || entry.correct_count > existing.correct_count) {
                    userBest.set(entry.user_id, entry);
                }
            });

            setLeaderboard(Array.from(userBest.values())
                .sort((a, b) => b.correct_count - a.correct_count)
                .slice(0, 10)
                .map((entry, idx) => ({
                    rank: idx + 1,
                    username: entry.profiles?.username || 'Anonymous',
                    score: entry.correct_count
                })));
        }
    }

    async function loadQuestions() {
        // 60-day non-repeat: Get user's recently seen question IDs using shared utility
        const excludeIds = await getRecentlySeenIds(supabase, userId, 200, 'time-attack');

        // Phase 55: random offset fetch instead of "first 200"
        const data = await fetchRandomQuestionPool(supabase, { pageSize: 200 });
        if (data && data.length > 0) {
            // Filter and shuffle questions using shared utility
            // minFallback=30: if fewer than 30 unseen questions remain, use full pool
            const shuffled = filterAndShuffle(data, excludeIds, 30, { minQualityScore: 6 }); // Phase 51: drop low-quality
            // also shuffle options
            const finalized = shuffleOptions(shuffled);
            setQuestions(finalized);
            return finalized;
        }
        return [];
    }

    async function handleStart() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // Reset the per-game save pipeline. This is the REAL "Play Again" path
        // (the complete screen's button calls handleStart), and it used to be
        // missing: getIdempotencyKey('game_complete') therefore returned the same
        // reference_id for every game in the session, so add_diamonds_to_balance
        // de-duplicated the award and players were credited only for their FIRST
        // time-attack game per page load — while trivia_scores kept recording
        // diamonds_earned > 0, inflating the daily cap and the stats page.
        idempotencyRefs.current = {};
        savePhaseRef.current = 0;
        cappedAwardRef.current = null;
        setSaveErrorPayload(null);
        setResult(null);

        // FIX(audit #3): the `sessionStorage.trivia_paid` short-circuit is gone.
        // Nothing writes that flag any more (TriviaLobby no longer pre-charges),
        // so all it could still do was let anyone set the flag in devtools —
        // `sessionStorage.setItem('trivia_paid','true')` — and play every game
        // free. This was the one page that still honored it; endless, mixed and
        // survival removed it long ago. Always charge.
        // Clear any stale legacy flag so an old build's receipt can't linger.
        try {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        } catch (e) { /* storage unavailable — nothing to clear */ }

        // FIX(audit #5): load the question set BEFORE taking the entry fee.
        // Previously the 10-diamond deduction ran first, so a failed question
        // load charged the player for a game that never started — and clicking
        // Start again charged them again. Mirrors endless.js, which verifies a
        // non-empty pool before charging.
        const qs = await loadQuestions();
        if (qs.length === 0) {
            setStartError('We could not load any questions right now. Please check your connection and try again.');
            return;
        }

        // Per-game diamond gate (VIP bypass)
        if (!isVip && userId) {
            // Fresh balance check from DB to avoid stale-state false negatives
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (profile && (profile.diamonds || 0) < GAME_ENTRY_COST) {
                    setShowOutOfDiamonds(true);
                    return;
                }

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_timeattack');
                if (!result.success) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[TimeAttack] Diamond deduction failed:', e);
                setShowOutOfDiamonds(true);
                return;
            }
        }
        // FIX(audit #5): questions were verified above, before the charge — the
        // player can no longer pay for a game that fails to load.
        setStartError(null);
        setGameState('playing');
        } finally {
            isStartingRef.current = false;
        }
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // Tracks which save steps completed: 0=none, 1=score, 2=diamonds, 3=history

    const idempotencyRefs = useRef({});
    // Daily-cap-clamped award for the current game (null = not yet computed).
    const cappedAwardRef = useRef(null);
    // FIX(audit #20): guarded token generator (copied from survival-game.js).
    // Bare crypto.randomUUID() throws on insecure contexts / older WebViews,
    // which killed the save pipeline before phase 1 and stranded the player in
    // a saving_error retry loop that could never succeed.
    const randomToken = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch (e) { /* fall through */ }
        return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    };
    const getIdempotencyKey = (actionType) => {
        if (!idempotencyRefs.current[actionType]) {
            idempotencyRefs.current[actionType] = `time_attack_${actionType}_${randomToken()}`;
        }
        return idempotencyRefs.current[actionType];
    };

    // NOTE: a handlePlayAgain() that set gameState 'ready' used to live here. It
    // was dead code — nothing called it and no render branch existed for 'ready',
    // so its idempotency reset never ran. That reset now lives in handleStart.

    async function handleComplete(gameResult) {
        setResult(gameResult);
        setGameState('saving');

        if (userId) {
            // Phase 73: play_date is anchored to CST so leaderboard.js
            // (which queries play_date with CST today) finds rows from
            // games played in the same CST day. Was UTC date — score
            // rows from 6pm-midnight CST were attributed to next day.
            const today = getTodayCST();

            try {
                // Compute the capped award BEFORE the score row is written.
                // Order matters: getDailyDiamondsEarned sums trivia_scores rows,
                // so clamping after the insert would count this very run against
                // itself (and, on a Retry Save, could clamp the award to 0).
                // Memoised in a ref so retries reuse the same figure.
                if (cappedAwardRef.current === null) {
                    const earnedToday = await getDailyDiamondsEarned(supabase, userId, 'time-attack');
                    cappedAwardRef.current = clampToCap(earnedToday, gameResult.diamondsEarned || 0, DAILY_DIAMOND_CAP);
                }
                const cappedAward = cappedAwardRef.current;

                // Phase 1: Save score (only if not already saved).
                // Capture insert error — supabase-js does NOT throw on DB errors.
                if (savePhaseRef.current < 1) {
                    const { error: scoreErr } = await supabase.from('trivia_scores').insert({
                        user_id: userId,
                        username: avatarUser?.username || avatarUser?.display_name || null,
                        mode: 'time-attack',
                        score: gameResult.correctCount * 100,
                        correct_count: gameResult.correctCount,
                        total_questions: gameResult.correctCount + gameResult.wrongCount,
                        diamonds_earned: cappedAward,
                        play_date: today
                    });
                    if (scoreErr) throw scoreErr;
                    savePhaseRef.current = 1;
                }

                // Phase 2: Award diamonds (only if not already awarded).
                // Re-check the daily cap against the SERVER here rather than
                // trusting the component's page-load state — otherwise two tabs
                // (or a stale tab left open across the cap reset) could each
                // award up to the full cap. Matches endless.js phase 1.
                let actualAwarded = 0;
                if (savePhaseRef.current < 2) {
                    const capped = cappedAward;
                    if (capped > 0) {
                        const { data: rpcData, error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                            p_user_id: userId,
                            p_amount: capped,
                            p_type: 'time_attack_reward',
                            p_description: `Time Attack — ${capped} diamonds (${gameResult.correctCount} correct)`,
                            p_reference_id: getIdempotencyKey('game_complete')
                        });
                        if (__rpcErr) throw __rpcErr;
                        // The RPC returns { success:false } without an error on
                        // dedup / insufficient funds — don't claim a credit that
                        // never landed.
                        if (rpcData && typeof rpcData === 'object' && rpcData.success === false) {
                            throw new Error(rpcData.error || 'Diamond award was rejected');
                        }
                        busEmit.diamondsEarned(capped, 'Time Attack');
                        actualAwarded = capped;
                    }
                    savePhaseRef.current = 2;
                    // Show what was actually credited, not what the component
                    // hoped to credit.
                    setResult(prev => (prev ? { ...prev, diamondsEarned: actualAwarded } : prev));
                }

                if (gameResult.correctCount > personalBest) {
                    setPersonalBest(gameResult.correctCount);
                }
                setDailyDiamondsEarned(prev => prev + actualAwarded);

                // Phase 3: Record question history (only if not already recorded)
                if (savePhaseRef.current < 3) {
                    const answeredCount = gameResult.correctCount + (gameResult.wrongCount || 0);
                    const answeredQuestions = questions.slice(0, answeredCount);
                    if (answeredQuestions.length > 0) {
                        // Phase 59: filter out rows with no question_id (would
                        // FK-violate on trivia_user_question_history.question_id
                        // → trivia_questions.id) and capture upsert errors that
                        // were previously silently swallowed.
                        const historyRecords = answeredQuestions
                            .filter(q => q && q.id != null)
                            .map((q, idx) => ({
                                user_id: userId,
                                question_id: q.id,
                                was_correct: gameResult.answerResults ? (gameResult.answerResults[idx] || false) : idx < gameResult.correctCount,
                                seen_at: new Date().toISOString(),
                                mode: 'time-attack'
                            }));

                        if (historyRecords.length > 0) {
                            // ignoreDuplicates:true => ON CONFLICT DO NOTHING.
                            // trivia_user_question_history has SELECT + INSERT RLS
                            // policies but NO UPDATE policy, so the previous
                            // ignoreDuplicates:false (an UPDATE on conflict) failed
                            // the ENTIRE batch whenever any question had been seen
                            // before — silently dropping the run's history and
                            // eroding the 60-day non-repeat guarantee.
                            const { error: historyErr } = await supabase
                                .from('trivia_user_question_history')
                                .upsert(historyRecords, {
                                    onConflict: 'user_id,question_id',
                                    ignoreDuplicates: true
                                });
                            if (historyErr) {
                                // Non-fatal: score + diamonds already saved at
                                // this point, history is best-effort.
                                console.warn('[TimeAttack] History upsert failed (non-fatal):', historyErr.message);
                            }
                        }
                    }
                    savePhaseRef.current = 3;
                }

                // Done saving — reset phase tracker for next game
                setGameState('complete');
                setSaveErrorPayload(null);
                savePhaseRef.current = 0;

            } catch (e) {
                console.warn('[TimeAttack] Failed to save data:', e);
                setSaveErrorPayload(gameResult);
                setGameState('saving_error');
                return; // halt and show retry UI (savePhaseRef preserves progress)
            }
        } else {
            setGameState('complete');
            setSaveErrorPayload(null);
        }

        loadLeaderboard();
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        handleComplete(result); // savePhaseRef skips already-completed steps
    };


    if (pageLoading) return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center pt-24 pb-12">
            <TriviaSkeleton />
        </div>
    );

    return (
        <TriviaErrorBoundary pageName="Time Attack">
            <SEOHead
                title="Time Attack Trivia — Beat The Clock"
                description="Race Against The Clock In Time Attack Poker Trivia. Answer As Many Questions As Possible Before Time Runs Out."
                canonical="/hub/trivia/time-attack"
            />

            <div className="time-attack-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                {/* Per-game cost popup (one-time) */}
                {userId && !isVip && (
                    <GameCostPopup userId={userId} featureKey="trivia_timeattack" isVip={isVip} cost={10} />
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
                    {gameState === 'lobby' && (
                        <div className="lobby">
                            {startError && (
                                <div role="alert" style={{
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    margin: '0 16px 16px',
                                    color: '#fecaca',
                                    fontSize: '14px',
                                    textAlign: 'center'
                                }}>
                                    {startError}
                                </div>
                            )}
                            <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                                <div className="lobby-header">
                                    <Timer size={48} className="mode-icon" />
                                    <h1>TIME ATTACK</h1>
                                    <p>30 Seconds. How Many Can You Answer?</p>
                                </div>

                                <div className="stats-row">
                                    <div className="stat-box">
                                        <Trophy size={24} />
                                        <span className="stat-value">{personalBest}</span>
                                        <span className="stat-label">Personal Best</span>
                                    </div>
                                    <div className="stat-box">
                                        <Gem size={24} />
                                        <span className="stat-value">{dailyDiamondsEarned}/{DAILY_DIAMOND_CAP}</span>
                                        <span className="stat-label">Today's Diamonds</span>
                                    </div>
                                </div>

                                <div className="rewards-info">
                                    <h3>Rewards</h3>
                                    <ul>
                                        <li>+1💎 For Every 3 Correct Answers</li>
                                        <li>Max {DAILY_DIAMOND_CAP} diamonds per day</li>
                                        <li>Speed Is Everything!</li>
                                    </ul>
                                </div>

                                <HexButton
                                    label="Start Time Attack"
                                    icon={Play}
                                    onClick={handleStart}
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                />
                            </MetalFrame>

                            {leaderboard.length > 0 && (
                                <div className="leaderboard-section">
                                    <h2>⚡ Fastest Minds</h2>
                                    <div className="leaderboard">
                                        {leaderboard.map((entry) => (
                                            <div key={entry.rank} className="lb-row" data-rank={entry.rank}>
                                                <span className="lb-rank">#{entry.rank}</span>
                                                <span className="lb-name">{entry.username}</span>
                                                <span className="lb-score">{entry.score}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {gameState === 'playing' && (
                        <TimeAttackGame
                            questions={questions}
                            onComplete={handleComplete}
                            dailyDiamondsEarned={dailyDiamondsEarned}
                        />
                    )}

                    {/* Saving state */}
                    {gameState === 'saving' && (
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
                                    We couldn't save your time attack run because you lost connection. Please check your internet and try again so you don't lose {saveErrorPayload?.diamondsEarned}💎!
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

                    {gameState === 'complete' && result && (
                        <div className="complete-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h1>TIME'S UP!</h1>

                                <div className="result-stats">
                                    <div className="result-stat">
                                        <Zap size={32} />
                                        <span className="result-value">{result.correctCount}</span>
                                        <span className="result-label">Correct</span>
                                    </div>
                                    <div className="result-stat highlight">
                                        <Gem size={32} />
                                        <span className="result-value">+{result.diamondsEarned}</span>
                                        <span className="result-label">Diamonds</span>
                                    </div>
                                </div>

                                {result.fastAnswers > 0 && (
                                    <div className="fast-badge">
                                        ⚡ {result.fastAnswers} lightning-fast answers!
                                    </div>
                                )}

                                <div className="complete-actions">
                                    <HexButton
                                        label="Play Again"
                                        onClick={handleStart}
                                        variant="primary"
                                    />
                                    <HexButton
                                        label="Back To Trivia"
                                        onClick={() => router.push('/hub/trivia')}
                                        variant="secondary"
                                    />
                                </div>
                            </MetalFrame>
                        </div>
                    )}
                </div>
              <BottomNavBar />
            </div>

            <style>{`
                .time-attack-page {
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

                .lobby-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-icon {
                    color: #22c55e;
                    margin-bottom: 12px;
                }

                .lobby-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 8px 0;
                }

                .lobby-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .stats-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 24px;
                }

                .stat-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                    gap: 8px;
                }

                .stat-box svg {
                    color: #22c55e;
                }

                .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }

                .stat-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .rewards-info {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .rewards-info h3 {
                    font-size: 14px;
                    color: #22c55e;
                    margin: 0 0 8px 0;
                }

                .rewards-info ul {
                    margin: 0;
                    padding: 0 0 0 16px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .leaderboard-section {
                    margin-top: 24px;
                }

                .leaderboard-section h2 {
                    font-size: 18px;
                    color: #fff;
                    margin: 0 0 12px 0;
                }

                .leaderboard {
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    overflow: hidden;
                }

                .lb-row {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .lb-row:last-child { border-bottom: none; }
                .lb-row[data-rank="1"] { background: rgba(255, 215, 0, 0.1); }
                .lb-row[data-rank="2"] { background: rgba(192, 192, 192, 0.08); }
                .lb-row[data-rank="3"] { background: rgba(205, 127, 50, 0.08); }

                .lb-rank {
                    width: 40px;
                    font-weight: 700;
                    color: #22c55e;
                }

                .lb-name {
                    flex: 1;
                    color: #fff;
                }

                .lb-score {
                    font-weight: 700;
                    color: #00d4ff;
                }

                .complete-screen {
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

                .complete-screen h1 {
                    font-size: 28px;
                    color: #fff;
                    margin: 0 0 24px 0;
                }

                .result-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .result-stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                }

                .result-stat.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .result-value {
                    font-size: 32px;
                    font-weight: 700;
                    color: #fff;
                }

                .result-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .fast-badge {
                    background: linear-gradient(90deg, #fbbf24, #f97316);
                    color: #000;
                    font-weight: 600;
                    padding: 10px;
                    border-radius: 8px;
                    margin-bottom: 24px;
                    font-size: 14px;
                }

                .complete-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
            `}</style>
        </TriviaErrorBoundary>
    );
}
