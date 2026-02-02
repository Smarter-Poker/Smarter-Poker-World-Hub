/**
 * TIME ATTACK PAGE — Route: /hub/trivia/time-attack
 * 30 seconds to answer as many as possible
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TimeAttackGame from '../../../src/components/trivia/TimeAttackGame';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Timer, Trophy, Gem, Zap, Play } from 'lucide-react';

const DAILY_DIAMOND_CAP = 5;

export default function TimeAttackPage() {
    const router = useRouter();
    const [gameState, setGameState] = useState('lobby');
    const [questions, setQuestions] = useState([]);
    const [userId, setUserId] = useState(null);
    const [dailyDiamondsEarned, setDailyDiamondsEarned] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [personalBest, setPersonalBest] = useState(0);
    const [result, setResult] = useState(null);

    useEffect(() => {
        loadUserData();
        loadLeaderboard();
    }, []);

    async function loadUserData() {
        const user = getAuthUser();
        if (!user) return;

        setUserId(user.id);

        // Get today's time attack diamonds
        const today = new Date().toISOString().split('T')[0];
        const { data: scores } = await supabase
            .from('trivia_scores')
            .select('diamonds_earned')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .gte('created_at', today);

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
            .single();

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
        const { data } = await supabase
            .from('trivia_questions')
            .select('*')
            .limit(100);

        if (data) {
            const shuffled = data.sort(() => Math.random() - 0.5);
            setQuestions(shuffled);
            return shuffled;
        }
        return [];
    }

    async function handleStart() {
        const qs = await loadQuestions();
        if (qs.length > 0) {
            setGameState('playing');
        }
    }

    async function handleComplete(gameResult) {
        setResult(gameResult);
        setGameState('complete');

        if (userId) {
            const today = new Date().toISOString().split('T')[0];

            // Save score
            await supabase.from('trivia_scores').insert({
                user_id: userId,
                mode: 'time-attack',
                score: gameResult.correctCount * 100,
                correct_count: gameResult.correctCount,
                total_questions: gameResult.correctCount + gameResult.wrongCount,
                diamonds_earned: gameResult.diamondsEarned,
                play_date: today
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
                <title>Time Attack - Smarter.Poker Trivia</title>
                <meta name="description" content="30 seconds to answer as many as you can!" />
            </Head>

            <div className="time-attack-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {gameState === 'lobby' && (
                        <div className="lobby">
                            <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                                <div className="lobby-header">
                                    <Timer size={48} className="mode-icon" />
                                    <h1>TIME ATTACK</h1>
                                    <p>30 seconds. How many can you answer?</p>
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
                                        <li>+1💎 for every 3 correct answers</li>
                                        <li>Max {DAILY_DIAMOND_CAP}💎 per day</li>
                                        <li>Speed is everything!</li>
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
                .time-attack-page {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0f1d32 100%);
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse at 30% 20%, rgba(14, 165, 233, 0.1), transparent 50%),
                        radial-gradient(ellipse at 70% 80%, rgba(34, 197, 94, 0.08), transparent 50%);
                    pointer-events: none;
                }

                .content {
                    position: relative;
                    padding: 100px 20px 40px;
                    max-width: 600px;
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
        </PageTransition>
    );
}
