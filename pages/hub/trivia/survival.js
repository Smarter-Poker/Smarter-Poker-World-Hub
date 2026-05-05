/**
 * SURVIVAL MODE PAGE — Route: /hub/trivia/survival
 * Endless trivia until you miss
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
import SurvivalGame from '../../../src/components/trivia/SurvivalGame';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { Gem, Target } from 'lucide-react';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
import { getRecentlySeenIds, filterAndShuffle } from '../../../src/lib/triviaQuestionLoader';
import { getDailyDiamondsEarned, clampToCap } from '../../../src/lib/trivia/diamondCap';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const GAME_ENTRY_COST = 10; // 💎 per game for non-VIP

const DAILY_DIAMOND_CAP = 10;

export default function SurvivalModePage() {
    useTrainingBus('trivia-survival');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, complete
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
        Promise.all([loadUserData(), loadLeaderboard()])
            .finally(() => setPageLoading(false));
    }, [avatarUser?.id, authLoading]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-surv:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_survival_runs', filter: `user_id=eq.${userId}` }, () => { loadUserData(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    async function loadUserData() {
        const user = avatarUser || getAuthUser();
        if (!user) return;

        setUserId(user.id);

        try {
            // Check VIP status
            await DiamondEngine.init(user.id);
            const vipStatus = await DiamondEngine.isVIP();
            setIsVip(vipStatus);

            // Get today's survival diamonds
            const today = new Date().toISOString().split('T')[0];
            const { data: runs } = await supabase
                .from('trivia_survival_runs')
                .select('diamonds_earned')
                .eq('user_id', user.id)
                .gte('created_at', today)
                .limit(50) // survival runs

            if (runs) {
                const total = runs.reduce((sum, r) => sum + (r.diamonds_earned || 0), 0);
                setDailyDiamondsEarned(total);
            }

            // Get personal best
            const { data: best } = await supabase
                .from('trivia_survival_runs')
                .select('correct_count')
                .eq('user_id', user.id)
                .order('correct_count', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (best) {
                setPersonalBest(best.correct_count);
            }
        } catch (e) {
            console.warn('[Survival] Failed to load user data:', e);
        }
    }

    async function loadLeaderboard() {
        const { data } = await supabase
            .from('trivia_survival_runs')
            .select(`
                correct_count,
                user_id,
                profiles!inner(username, avatar_url)
            `)
            .order('correct_count', { ascending: false })
            .limit(10);

        if (data) {
            setLeaderboard(data.map((entry, idx) => ({
                rank: idx + 1,
                username: entry.profiles?.username || 'Anonymous',
                avatar: entry.profiles?.avatar_url,
                score: entry.correct_count
            })));
        }
    }

    async function loadQuestions() {
        // 60-day non-repeat: exclude recently seen questions
        const excludeIds = userId ? await getRecentlySeenIds(supabase, userId, 200, 'survival') : [];

        const { data, error } = await supabase
            .from('trivia_questions')
            .select('*')
            .order('id', { ascending: false })
            .limit(100);

        if (data) {
            const filtered = filterAndShuffle(data, excludeIds, 50);
            setQuestions(shuffleOptions(filtered));
            return filtered;
        }

        return data || [];
    }

    async function loadMoreQuestions() {
        const { data } = await supabase
            .from('trivia_questions')
            .select('*')
            .order('id', { ascending: false })
            .limit(50)
            .range(questions.length, questions.length + 50);

        if (data) {
            setQuestions(prev => [...prev, ...shuffleOptions(data.sort(() => Math.random() - 0.5))]);
        }
    }

    async function handleStart() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // Check if already paid via TriviaLobby (defense-in-depth)
        const alreadyPaid = sessionStorage.getItem('trivia_paid') === 'true'
            && sessionStorage.getItem('trivia_mode') === 'survival';
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

                const result = await DiamondEngine.deduct(GAME_ENTRY_COST, 'trivia_survival');
                if (!result.success) {
                    setShowOutOfDiamonds(true);
                    return;
                }
                // DiamondEngine.deduct auto-emits busEmit.diamondsSpent
            } catch (e) {
                console.warn('[Survival] Diamond deduction failed:', e);
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

    async function handleComplete(gameResult) {
        setResult(gameResult);
        setGameState('complete');

        // Save to database
        if (userId) {
            try {
                // NOTE: trivia_survival_runs has columns
                // (id, user_id, level_reached, correct_count, incorrect_count, diamonds_earned, run_data, created_at).
                // The previous insert wrote `time_survived: 0` which is NOT a column on this
                // table — every insert silently failed. Now writes only real columns.
                await supabase.from('trivia_survival_runs').insert({
                    user_id: userId,
                    correct_count: gameResult.correctCount,
                    diamonds_earned: gameResult.diamondsEarned
                });

                // Award diamonds via audit-safe RPC (capped to daily limit)
                if (gameResult.diamondsEarned > 0) {
                    const earnedToday = await getDailyDiamondsEarned(supabase, userId, 'survival');
                    const cappedDiamonds = clampToCap(earnedToday, gameResult.diamondsEarned, DAILY_DIAMOND_CAP);
                    if (cappedDiamonds > 0) {
                        await supabase.rpc('add_diamonds_to_balance', {
                            p_user_id: userId,
                            p_amount: cappedDiamonds,
                            p_type: 'survival_reward',
                            p_description: `Survival mode — ${cappedDiamonds}💎 (${gameResult.correctCount} survived)`,
                            p_reference_id: null
                        });
                        busEmit.diamondsEarned(cappedDiamonds, 'Survival Mode');
                        busEmit.celebration('confetti');
                    }
                }

                // Record question history for 60-day non-repeat
                if (questions.length > 0) {
                    const correctQs = questions.slice(0, gameResult.correctCount);
                    const wrongQ = questions[gameResult.correctCount]; // the question they got wrong
                    const historyRecords = [
                        ...correctQs.map(q => ({
                            user_id: userId,
                            question_id: q.id,
                            was_correct: true,
                            seen_at: new Date().toISOString(),
                            mode: 'survival'
                        })),
                        ...(wrongQ ? [{
                            user_id: userId,
                            question_id: wrongQ.id,
                            was_correct: false,
                            seen_at: new Date().toISOString(),
                            mode: 'survival'
                        }] : [])
                    ];
                    await supabase.from('trivia_user_question_history')
                        .upsert(historyRecords, { onConflict: 'user_id,question_id', ignoreDuplicates: false });
                }
            } catch (e) {
                console.warn('[Survival] Save/reward failed:', e);
            }

            // Check if new personal best
            if (gameResult.correctCount > personalBest) {
                setPersonalBest(gameResult.correctCount);
            }

            setDailyDiamondsEarned(prev => prev + gameResult.diamondsEarned);
        }

        loadLeaderboard();
    }


    if (pageLoading) return <TriviaSkeleton />;

    return (
        <TriviaErrorBoundary pageName="Survival Mode">
        <PageTransition>
            <SEOHead
                title="Survival Trivia — One Life Challenge"
                description="One Wrong Answer And You Are Out. Test Your Poker Knowledge In Survival Mode."
                canonical="/hub/trivia/survival"
            />

            <div className="survival-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                {/* Per-game cost popup (one-time) */}
                {userId && !isVip && (
                    <GameCostPopup userId={userId} featureKey="trivia_survival" isVip={isVip} cost={10} />
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
                            {/* Full-bleed image lobby */}
                            <div className="lobby-image-wrapper" onClick={handleStart}>
                                <Image src="/images/trivia/lobby-survival.jpg" alt="Survival Mode - Start Challenge" width={686} height={1024} className="lobby-image" />
                            </div>

                            {leaderboard.length > 0 && (
                                <div className="leaderboard-section">
                                    <h2>Top Survivors</h2>
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
                        <SurvivalGame
                            questions={questions}
                            onComplete={handleComplete}
                            onLoadMoreQuestions={loadMoreQuestions}
                            dailyDiamondsEarned={dailyDiamondsEarned}
                        />
                    )}

                    {gameState === 'complete' && result && (
                        <div className="complete-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h1>RUN COMPLETE</h1>

                                <div className="result-stats">
                                    <div className="result-stat">
                                        <Target size={32} />
                                        <span className="result-value">{result.correctCount}</span>
                                        <span className="result-label">Questions Survived</span>
                                    </div>
                                    <div className="result-stat highlight">
                                        <Gem size={32} />
                                        <span className="result-value">+{result.diamondsEarned}</span>
                                        <span className="result-label">Diamonds Earned</span>
                                    </div>
                                </div>

                                {result.correctCount > personalBest - result.correctCount && (
                                    <div className="pb-banner">🎉 NEW PERSONAL BEST!</div>
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
            </div>

            <style>{`
                .survival-page {
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

                .lobby-image-wrapper {
                    cursor: pointer;
                    border-radius: 16px;
                    overflow: hidden;
                    transition: transform 0.2s, box-shadow 0.2s;
                    margin-bottom: 24px;
                }

                .lobby-image-wrapper:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 40px rgba(239, 68, 68, 0.4);
                }

                .lobby-image-wrapper:active {
                    transform: scale(0.98);
                }

                .lobby-image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .lobby-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-icon {
                    color: #f97316;
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
                    color: #fbbf24;
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
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .rewards-info h3 {
                    font-size: 14px;
                    color: #00d4ff;
                    margin: 0 0 8px 0;
                }

                .rewards-info ul {
                    margin: 0;
                    padding: 0 0 0 16px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .rewards-info li {
                    margin-bottom: 4px;
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

                .lb-row:last-child {
                    border-bottom: none;
                }

                .lb-row[data-rank="1"] { background: rgba(255, 215, 0, 0.1); }
                .lb-row[data-rank="2"] { background: rgba(192, 192, 192, 0.08); }
                .lb-row[data-rank="3"] { background: rgba(205, 127, 50, 0.08); }

                .lb-rank {
                    width: 40px;
                    font-weight: 700;
                    color: #fbbf24;
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

                .result-stat svg {
                    color: rgba(255, 255, 255, 0.5);
                }

                .result-stat.highlight svg {
                    color: #00d4ff;
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

                .pb-banner {
                    background: linear-gradient(90deg, #fbbf24, #f97316);
                    color: #000;
                    font-weight: 700;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 24px;
                }

                .complete-actions {
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
              <BottomNavBar />
    </PageTransition>
        </TriviaErrorBoundary>
    );
}
