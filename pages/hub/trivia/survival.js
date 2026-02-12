/**
 * SURVIVAL MODE PAGE — Route: /hub/trivia/survival
 * Endless trivia until you miss
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SurvivalGame from '../../../src/components/trivia/SurvivalGame';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Flame, Trophy, Gem, Target, Play } from 'lucide-react';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';

const DAILY_DIAMOND_CAP = 10;

export default function SurvivalModePage() {
    const router = useRouter();
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, complete
    const [questions, setQuestions] = useState([]);
    const [userId, setUserId] = useState(null);
    const [dailyDiamondsEarned, setDailyDiamondsEarned] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [personalBest, setPersonalBest] = useState(0);
    const [result, setResult] = useState(null);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);

    useEffect(() => {
        loadUserData();
        loadLeaderboard();
    }, []);

    async function loadUserData() {
        const user = getAuthUser();
        if (!user) return;

        setUserId(user.id);

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
            .gte('created_at', today);

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
            .single();

        if (best) {
            setPersonalBest(best.correct_count);
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
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('*')
            .order('id', { ascending: false })
            .limit(50);

        if (data) {
            // Shuffle questions
            const shuffled = data.sort(() => Math.random() - 0.5);
            setQuestions(shuffled);
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
            setQuestions(prev => [...prev, ...data.sort(() => Math.random() - 0.5)]);
        }
    }

    async function handleStart() {
        // Per-game diamond gate (VIP bypass)
        if (!isVip && userId) {
            const result = await DiamondEngine.deduct(10, 'trivia_survival');
            if (!result.success) {
                setShowOutOfDiamonds(true);
                return;
            }
        }
        const qs = await loadQuestions();
        if (qs.length > 0) {
            setGameState('playing');
        }
    }

    async function handleComplete(gameResult) {
        setResult(gameResult);
        setGameState('complete');

        // Save to database
        if (userId) {
            await supabase.from('trivia_survival_runs').insert({
                user_id: userId,
                correct_count: gameResult.correctCount,
                diamonds_earned: gameResult.diamondsEarned,
                time_survived: 0
            });

            // Award diamonds
            if (gameResult.diamondsEarned > 0) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .single();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ diamonds: (profile.diamonds || 0) + gameResult.diamondsEarned })
                        .eq('id', userId);
                }
            }

            // Check if new personal best
            if (gameResult.correctCount > personalBest) {
                setPersonalBest(gameResult.correctCount);
            }

            setDailyDiamondsEarned(prev => prev + gameResult.diamondsEarned);
        }

        loadLeaderboard();
    }

    return (
        <PageTransition>
            <Head>
                <title>Survival Mode - Smarter.Poker Trivia</title>
                <meta name="description" content="Answer until you miss! How long can you survive?" />
            </Head>

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
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>Each game costs 10💎. Get more diamonds or upgrade to VIP for unlimited access!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #0088FF)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Get Diamonds</button>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="content">
                    {gameState === 'lobby' && (
                        <div className="lobby">
                            {/* Full-bleed image lobby */}
                            <div className="lobby-image-wrapper" onClick={handleStart}>
                                <img
                                    src="/images/trivia/lobby-survival.jpg"
                                    alt="Survival Mode - Start Challenge"
                                    className="lobby-image"
                                />
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
                                        label="Back to Trivia"
                                        onClick={() => router.push('/hub/trivia')}
                                        variant="secondary"
                                    />
                                </div>
                            </MetalFrame>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .survival-page {
                    min-height: 100vh;
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
                    text-align: center;
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
            `}</style>
        </PageTransition>
    );
}
