/**
 * Diamond Arena - Leaderboard
 * Global rankings for Diamond Arena players
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArenaLeaderboard() {
    const bus = useTrainingBus('diamond-arena-leaderboard');
    const router = useRouter();
    const { filters, setFilter } = usePersistedFilters('diamond-arena-leaderboard', {
        period: 'all',
        gameType: 'all'
    });
    const period = filters.period;
    const gameType = filters.gameType;
    const setPeriod = (val) => setFilter('period', val);
    const setGameType = (val) => setFilter('gameType', val);

    /*
     * THERE IS NO LEADERBOARD TO SHOW, AND THERE WERE NEVER THESE PLAYERS.
     *
     * This page rendered three hard-coded names as a live ranking - PokerPro2024
     * with 147,832 diamonds, DiamondKing with 132,451, SharkMaster with 118,923,
     * each with a game count and a win rate. None of them exists. A player
     * reading that has no way to tell it from a real board, and the numbers are
     * denominated in a currency they actually own.
     *
     * The realtime subscription beside them watched `diamond_arena_scores`,
     * WHICH IS NOT A TABLE ON THIS DATABASE and never has been - so it could
     * only ever have refreshed a list of constants that cannot change. It is
     * removed rather than re-pointed: there is nothing yet for it to watch.
     *
     * The Diamond Arena's club row was created on 2026-09-08 and holds no
     * tables, no tournaments and no diamonds. Nobody has played a hand in it,
     * so the honest ranking is an empty one.
     *
     * TO FINISH THIS: rank real players by their arena results once tables open
     * (the arena club is `clubs.is_platform`, and its member wallets are
     * `club_members.chip_balance` denominated in diamonds). Read it server-side
     * through the same paths the club lobby uses. Do not re-add constants.
     */
    const leaderboard = [];

    return (
        <>
            <SEOHead
                title="Diamond Arena Leaderboard"
                description="Smarter.Poker - The Future Of The Game."
                canonical="/hub/diamond-arena/leaderboard"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>

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
                            {leaderboard.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                                    <p style={{ fontSize: '18px' }}>No Rankings Yet</p>
                                    <p style={{ fontSize: '14px', marginTop: '8px' }}>The Diamond Arena Has Not Opened</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
    </PageTransition>
        </>
    );
}
