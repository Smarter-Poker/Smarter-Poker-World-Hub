/**
 * Diamond Arcade - My Winnings
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArcadeWinnings() {
    const router = useRouter();

    const winnings = [
        { date: new Date().toISOString(), game: 'Hand Snap', rank: 1, diamonds: 5000 },
        { date: new Date(Date.now() - 86400000).toISOString(), game: 'Board Nuts', rank: 3, diamonds: 2000 },
    ];

    return (
        <>
            <Head>
                <title>My Winnings | Diamond Arcade</title>
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
                            Diamonds My Winnings
                        </h1>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {winnings.map((win, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            {win.game} - {win.rank === 1 ? '' : win.rank === 2 ? '' : ''} {win.rank}{win.rank === 1 ? 'st' : win.rank === 2 ? 'nd' : 'rd'} Place
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {new Date(win.date).toLocaleDateString()}
                                        </div>
                                    </div>

                                    <div style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 'bold' }}>
                                        +{win.diamonds.toLocaleString()} Diamonds
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
