/**
 * PVP PAGE — Route: /hub/trivia/pvp
 * 1v1 trivia battles with diamond stakes
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PvPLobby from '../../../src/components/trivia/PvPLobby';
import PvPBattle from '../../../src/components/trivia/PvPBattle';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Swords, Trophy, Gem } from 'lucide-react';

export default function PvPPage() {
    const router = useRouter();
    const [gameState, setGameState] = useState('lobby'); // lobby, searching, battle, result
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [stakeAmount, setStakeAmount] = useState(0);
    const [questions, setQuestions] = useState([]);
    const [opponent, setOpponent] = useState(null);
    const [result, setResult] = useState(null);
    const [stats, setStats] = useState({ wins: 0, losses: 0 });

    useEffect(() => {
        loadUserData();
    }, []);

    async function loadUserData() {
        const user = getAuthUser();
        if (!user) {
            router.push('/hub/trivia');
            return;
        }

        setUserId(user.id);

        // Get diamond balance
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds, username')
            .eq('id', user.id)
            .single();

        if (profile) {
            setUserDiamonds(profile.diamonds || 0);
        }

        // Get PvP stats
        const { data: wins } = await supabase
            .from('trivia_pvp_matches')
            .select('id')
            .eq('winner_id', user.id);

        const { data: losses } = await supabase
            .from('trivia_pvp_matches')
            .select('id')
            .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
            .neq('winner_id', user.id)
            .not('winner_id', 'is', null);

        setStats({
            wins: wins?.length || 0,
            losses: losses?.length || 0
        });
    }

    async function handleFindMatch(stake) {
        setStakeAmount(stake);
        setGameState('searching');

        // Load questions for battle
        const { data: qs } = await supabase
            .from('trivia_questions')
            .select('*')
            .limit(10);

        if (qs) {
            setQuestions(qs.sort(() => Math.random() - 0.5).slice(0, 5));
        }

        // Simulate finding opponent (in real implementation, use matchmaking API)
        setTimeout(() => {
            setOpponent({
                id: 'bot-' + Math.random().toString(36).substr(2, 9),
                username: 'PokerPro_' + Math.floor(Math.random() * 1000),
                wins: Math.floor(Math.random() * 50),
                losses: Math.floor(Math.random() * 30)
            });

            setTimeout(() => {
                setGameState('battle');
            }, 2000);
        }, Math.random() * 3000 + 2000);
    }

    function handleCancelSearch() {
        setGameState('lobby');
        setOpponent(null);
    }

    async function handleBattleComplete(battleResult) {
        setResult(battleResult);
        setGameState('result');

        if (userId) {
            // Record match
            await supabase.from('trivia_pvp_matches').insert({
                player1_id: userId,
                player2_id: battleResult.opponent?.id || null,
                stake_amount: stakeAmount,
                winner_id: battleResult.won ? userId : null,
                status: 'complete'
            });

            // Update diamonds
            const diamondChange = battleResult.won ? battleResult.winnings : -stakeAmount;
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .single();

            if (profile) {
                await supabase
                    .from('profiles')
                    .update({ diamonds: Math.max(0, (profile.diamonds || 0) + diamondChange) })
                    .eq('id', userId);

                setUserDiamonds(Math.max(0, (profile.diamonds || 0) + diamondChange));
            }

            // Update stats
            if (battleResult.won) {
                setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
            } else {
                setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
        }
    }

    function handlePlayAgain() {
        setGameState('lobby');
        setResult(null);
        setOpponent(null);
    }

    return (
        <PageTransition>
            <Head>
                <title>1v1 Battle - Smarter.Poker Trivia</title>
                <meta name="description" content="Challenge players to 1v1 trivia battles!" />
            </Head>

            <div className="pvp-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {/* Stats Bar */}
                    <div className="stats-bar">
                        <div className="stat">
                            <Trophy size={16} />
                            <span>{stats.wins}W - {stats.losses}L</span>
                        </div>
                        <div className="stat diamonds">
                            <Gem size={16} />
                            <span>{userDiamonds}</span>
                        </div>
                    </div>

                    {gameState === 'lobby' && (
                        <PvPLobby
                            userDiamonds={userDiamonds}
                            onFindMatch={handleFindMatch}
                        />
                    )}

                    {gameState === 'searching' && (
                        <PvPLobby
                            userDiamonds={userDiamonds}
                            searching={true}
                            matchFound={!!opponent}
                            opponent={opponent}
                            onCancel={handleCancelSearch}
                        />
                    )}

                    {gameState === 'battle' && (
                        <PvPBattle
                            questions={questions}
                            opponent={opponent}
                            stakeAmount={stakeAmount}
                            onComplete={handleBattleComplete}
                        />
                    )}

                    {gameState === 'result' && result && (
                        <div className="result-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <div className={`result-header ${result.won ? 'win' : 'lose'}`}>
                                    <Swords size={48} />
                                    <h1>{result.won ? 'VICTORY!' : 'DEFEAT'}</h1>
                                </div>

                                <div className="result-summary">
                                    <p>Score: {result.playerScore} - {result.opponentScore}</p>
                                    <div className={`diamond-change ${result.won ? 'win' : 'lose'}`}>
                                        <Gem size={24} />
                                        <span>{result.won ? '+' : ''}{result.won ? result.winnings : -stakeAmount}</span>
                                    </div>
                                </div>

                                <div className="result-actions">
                                    <HexButton
                                        label="Battle Again"
                                        onClick={handlePlayAgain}
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
                .pvp-page {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0f1d32 100%);
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse at 30% 20%, rgba(239, 68, 68, 0.1), transparent 50%),
                        radial-gradient(ellipse at 70% 80%, rgba(249, 115, 22, 0.08), transparent 50%);
                    pointer-events: none;
                }

                .content {
                    position: relative;
                    padding: 100px 20px 40px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.diamonds {
                    color: #00d4ff;
                }

                .result-screen {
                    text-align: center;
                }

                .result-header {
                    margin-bottom: 24px;
                }

                .result-header.win { color: #22c55e; }
                .result-header.lose { color: #ef4444; }

                .result-header h1 {
                    font-size: 32px;
                    margin: 12px 0 0 0;
                }

                .result-summary {
                    margin-bottom: 24px;
                }

                .result-summary p {
                    font-size: 18px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 16px 0;
                }

                .diamond-change {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    font-size: 32px;
                    font-weight: 700;
                    padding: 16px;
                    border-radius: 12px;
                }

                .diamond-change.win {
                    background: rgba(34, 197, 94, 0.15);
                    color: #22c55e;
                }

                .diamond-change.lose {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                }

                .result-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
            `}</style>
        </PageTransition>
    );
}
