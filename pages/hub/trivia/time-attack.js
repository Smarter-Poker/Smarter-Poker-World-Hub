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
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';

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
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP

const DAILY_DIAMOND_CAP = 5;

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

        // Get today's time attack diamonds
        const today = new Date().toISOString().split('T')[0];
        const { data: scores } = await supabase
            .from('trivia_scores')
            .select('diamonds_earned')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .gte('created_at', today)
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
        // Check if already paid via TriviaLobby (defense-in-depth)
        const alreadyPaid = sessionStorage.getItem('trivia_paid') === 'true'
            && sessionStorage.getItem('trivia_mode') === 'time-attack';
        if (alreadyPaid) {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        }

        // Per-game diamond gate (VIP bypass, skip if already paid)
        if (!alreadyPaid && !isVip && userId) {
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
        const qs = await loadQuestions();
        if (qs.length > 0) {
            setGameState('playing');
        }
        } finally {
            isStartingRef.current = false;
        }
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // Tracks which save steps completed: 0=none, 1=score, 2=diamonds, 3=history

    const idempotencyRefs = useRef({});
    const getIdempotencyKey = (actionType) => {
        if (!idempotencyRefs.current[actionType]) {
            idempotencyRefs.current[actionType] = `time_attack_${actionType}_${crypto.randomUUID()}`;
        }
        return idempotencyRefs.current[actionType];
    };

    async function handlePlayAgain() {
        setResult(null);
        idempotencyRefs.current = {}; // Reset idempotency keys for new game
        setGameState('ready');
    }

    async function handleComplete(gameResult) {
        setResult(gameResult);
        setGameState('saving');

        if (userId) {
            const today = new Date().toISOString().split('T')[0];

            try {
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
                        diamonds_earned: gameResult.diamondsEarned,
                        play_date: today
                    });
                    if (scoreErr) throw scoreErr;
                    savePhaseRef.current = 1;
                }

                // Phase 2: Award diamonds (only if not already awarded)
                if (savePhaseRef.current < 2) {
                    if (gameResult.diamondsEarned > 0) {
                        const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                            p_user_id: userId,
                            p_amount: gameResult.diamondsEarned,
                            p_type: 'time_attack_reward',
                            p_description: `Time Attack — ${gameResult.diamondsEarned}💎 (${gameResult.correctCount} correct)`,
                            p_reference_id: getIdempotencyKey('game_complete')
                        });
                        if (__rpcErr) throw __rpcErr;
                        busEmit.diamondsEarned(gameResult.diamondsEarned, 'Time Attack');
                    }
                    savePhaseRef.current = 2;
                }

                if (gameResult.correctCount > personalBest) {
                    setPersonalBest(gameResult.correctCount);
                }
                setDailyDiamondsEarned(prev => prev + gameResult.diamondsEarned);

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
                            const { error: historyErr } = await supabase
                                .from('trivia_user_question_history')
                                .upsert(historyRecords, {
                                    onConflict: 'user_id,question_id',
                                    ignoreDuplicates: false
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
                                        <li>Max {DAILY_DIAMOND_CAP}💎 per day</li>
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
