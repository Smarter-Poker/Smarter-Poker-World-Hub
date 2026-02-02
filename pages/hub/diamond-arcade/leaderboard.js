/**
 * Diamond Arcade - Leaderboard
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArcadeLeaderboard() {
    const router = useRouter();

    const leaderboard = [
        { rank: 1, username: 'ArcadeChamp', score: 15847, games: 547, avgScore: 29 },
        { rank: 2, username: 'SpeedDemon', score: 14232, games: 489, avgScore: 29 },
        { rank: 3, username: 'QuickDraw', score: 12654, games: 423, avgScore: 30 },
    ];

    return (
        <>
            <Head>
                <title>Leaderboard | Diamond Arcade</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/diamond-arcade')}
                            style={{
                                background: 'rgba(251, 191, 36, 0.1)',
                                border: '1px solid rgba(251, 191, 36, 0.3)',
                                color: '#fbbf24',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Arcade
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            Trophy Arcade Leaderboard
                        </h1>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Total Score</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Games</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Avg Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map(player => (
                                        <tr key={player.rank} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                                                {player.rank === 1 && ''}
                                                {player.rank === 2 && ''}
                                                {player.rank === 3 && ''}
                                            </td>
                                            <td style={{ padding: '16px', color: '#fff' }}>{player.username}</td>
                                            <td style={{ padding: '16px', color: '#fbbf24', textAlign: 'right', fontWeight: 'bold' }}>
                                                {player.score.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '16px', color: '#9ca3af', textAlign: 'right' }}>{player.games}</td>
                                            <td style={{ padding: '16px', color: '#10b981', textAlign: 'right' }}>{player.avgScore}</td>
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
