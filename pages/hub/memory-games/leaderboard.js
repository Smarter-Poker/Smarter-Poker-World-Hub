/**
 * Memory Games - Leaderboard
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function MemoryGamesLeaderboard() {
    const router = useRouter();

    const leaderboard = [
        { rank: 1, username: 'MemoryMaster', score: 18947, games: 647, avgTime: '1:23' },
        { rank: 2, username: 'QuickRecall', score: 17232, games: 589, avgTime: '1:28' },
        { rank: 3, username: 'BrainChamp', score: 15654, games: 523, avgTime: '1:35' },
    ];

    return (
        <>
            <Head>
                <title>Leaderboard | Memory Games</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/memory-games')}
                            style={{
                                background: 'rgba(236, 72, 153, 0.1)',
                                border: '1px solid rgba(236, 72, 153, 0.3)',
                                color: '#ec4899',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Memory Games
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            🏆 Memory Games Leaderboard
                        </h1>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Score</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Games</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Avg Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map(player => (
                                        <tr key={player.rank} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                                                {player.rank === 1 && '🥇'}
                                                {player.rank === 2 && '🥈'}
                                                {player.rank === 3 && '🥉'}
                                            </td>
                                            <td style={{ padding: '16px', color: '#fff' }}>{player.username}</td>
                                            <td style={{ padding: '16px', color: '#ec4899', textAlign: 'right', fontWeight: 'bold' }}>
                                                {player.score.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '16px', color: '#9ca3af', textAlign: 'right' }}>{player.games}</td>
                                            <td style={{ padding: '16px', color: '#10b981', textAlign: 'right' }}>{player.avgTime}</td>
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
