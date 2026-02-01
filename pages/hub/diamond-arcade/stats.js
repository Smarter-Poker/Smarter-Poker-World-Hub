/**
 * Diamond Arcade - Player Stats
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArcadeStats() {
    const router = useRouter();

    const stats = {
        gamesPlayed: 547,
        totalScore: 15847,
        avgScore: 29,
        bestScore: 47,
        diamondsEarned: 8450,
        currentStreak: 12
    };

    return (
        <>
            <Head>
                <title>My Stats | Diamond Arcade</title>
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
                            📊 My Arcade Stats
                        </h1>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Games Played</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.gamesPlayed}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Score</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>{stats.totalScore.toLocaleString()}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Best Score</div>
                                <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.bestScore}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Diamonds Earned</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>💎 {stats.diamondsEarned.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
