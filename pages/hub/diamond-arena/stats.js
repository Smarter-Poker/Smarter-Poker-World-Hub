/**
 * Diamond Arena - Player Stats
 * Detailed statistics for the current player
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArenaStats() {
    const bus = useTrainingBus('diamond-arena-stats');
    const router = useRouter();

    /*
     * EVERY NUMBER ON THIS PAGE WAS INVENTED, AND IT READ AS THE VIEWER'S OWN.
     *
     * 1,247 games, 847 cash, 400 tournaments, 147,832 diamonds won, a 68 percent
     * win rate, a 12-game best streak. The same 147,832 also appeared as the top
     * leaderboard entry, which is how a set of constants gets copied between
     * pages and starts to look corroborated.
     *
     * Nobody has played a hand in the Diamond Arena - its club row was created
     * on 2026-09-08 and holds no tables, no tournaments and no diamonds - so
     * every one of these is zero for every account, and zero is what it says.
     *
     * TO FINISH THIS: aggregate the viewer's real arena sessions server-side
     * once tables open, scoped to the platform club (`clubs.is_platform`) and to
     * the authenticated user. Do not re-add constants.
     */
    const stats = {
        totalGames: 0,
        cashGames: 0,
        tournaments: 0,
        totalWinnings: 0,
        winRate: 0,
        avgSessionLength: '0h 00m',
        bestStreak: 0,
        currentStreak: 0
    };

    return (
        <>
            <SEOHead
                title="Diamond Arena Stats"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            My Stats
                        </h1>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Games</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.totalGames}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Winnings</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>Diamonds {stats.totalWinnings.toLocaleString()}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Win Rate</div>
                                <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.winRate}%</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Current Streak</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}> {stats.currentStreak}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Cash Games</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.cashGames}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Tournaments</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.tournaments}</div>
                            </div>
                        </div>
                    </div>
                </div>
    </PageTransition>
        </>
    );
}
