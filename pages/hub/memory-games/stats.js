/**
 * Memory Games - Player Stats
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function MemoryGamesStats() {
    const router = useRouter();

    const stats = {
        gamesPlayed: 647,
        totalScore: 18947,
        bestScore: 95,
        avgTime: '1:23',
        perfectGames: 12,
        diamondsEarned: 9450
    };

    return (
        <>
            <Head>
                <title>My Stats | Memory Games</title>
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
                            My Memory Stats
                        </h1>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Games Played</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.gamesPlayed}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Best Score</div>
                                <div style={{ color: '#ec4899', fontSize: '32px', fontWeight: 'bold' }}>{stats.bestScore}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Avg Time</div>
                                <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.avgTime}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Perfect Games</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>{stats.perfectGames}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
