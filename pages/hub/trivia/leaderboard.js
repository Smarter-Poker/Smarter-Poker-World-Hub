/**
 * Trivia - Leaderboard
 * Global rankings for trivia players
 */

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaLeaderboard() {
    const router = useRouter();
    const [period, setPeriod] = useState('all');

    const leaderboard = [
        { rank: 1, username: 'TriviaKing', score: 9847, streak: 47, accuracy: 94 },
        { rank: 2, username: 'QuizMaster', score: 8923, streak: 32, accuracy: 91 },
        { rank: 3, username: 'BrainPower', score: 7654, streak: 28, accuracy: 89 },
    ];

    return (
        <>
            <Head>
                <title>Leaderboard | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: '#8b5cf6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Trivia
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            🏆 Trivia Leaderboard
                        </h1>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Score</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Streak</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Accuracy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map(player => (
                                        <tr key={player.rank} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                                                {player.rank === 1 && '🥇'}
                                                {player.rank === 2 && '🥈'}
                                                {player.rank === 3 && '🥉'}
                                                {player.rank > 3 && `#${player.rank}`}
                                            </td>
                                            <td style={{ padding: '16px', color: '#fff' }}>{player.username}</td>
                                            <td style={{ padding: '16px', color: '#8b5cf6', textAlign: 'right', fontWeight: 'bold' }}>
                                                {player.score.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '16px', color: '#f59e0b', textAlign: 'right' }}>
                                                🔥 {player.streak}
                                            </td>
                                            <td style={{ padding: '16px', color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>
                                                {player.accuracy}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
