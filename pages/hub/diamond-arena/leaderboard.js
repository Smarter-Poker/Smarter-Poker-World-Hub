/**
 * Diamond Arena - Leaderboard
 * Global rankings for Diamond Arena players
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArenaLeaderboard() {
    const router = useRouter();
    const [period, setPeriod] = useState('all'); // all, month, week
    const [gameType, setGameType] = useState('all'); // all, cash, tournament

    const leaderboard = [
        { rank: 1, username: 'PokerPro2024', diamonds: 147832, games: 1247, winRate: 68 },
        { rank: 2, username: 'DiamondKing', diamonds: 132451, games: 1089, winRate: 65 },
        { rank: 3, username: 'SharkMaster', diamonds: 118923, games: 956, winRate: 62 },
    ];

    return (
        <>
            <Head>
                <title>Leaderboard | Diamond Arena</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/diamond-arena')}
                            style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#3b82f6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Arena
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            Trophy Leaderboard
                        </h1>

                        {/* Filters */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '30px' }}>
                            {['all', 'month', 'week'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    style={{
                                        background: period === p ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${period === p ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                        color: period === p ? '#fff' : '#9ca3af',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {p === 'all' ? 'All Time' : `This ${p}`}
                                </button>
                            ))}
                        </div>

                        {/* Leaderboard Table */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                        <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Diamonds</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Games</th>
                                        <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Win Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map(player => (
                                        <tr key={player.rank} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                                                {player.rank === 1 && ''}
                                                {player.rank === 2 && ''}
                                                {player.rank === 3 && ''}
                                                {player.rank > 3 && `#${player.rank}`}
                                            </td>
                                            <td style={{ padding: '16px', color: '#fff' }}>{player.username}</td>
                                            <td style={{ padding: '16px', color: '#fbbf24', textAlign: 'right', fontWeight: 'bold' }}>
                                                Diamonds {player.diamonds.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '16px', color: '#9ca3af', textAlign: 'right' }}>{player.games}</td>
                                            <td style={{ padding: '16px', color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>
                                                {player.winRate}%
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
