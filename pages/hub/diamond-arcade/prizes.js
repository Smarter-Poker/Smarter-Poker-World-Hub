/**
 * Diamond Arcade - Prize Pool
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArcadePrizes() {
    const router = useRouter();

    const prizes = [
        { rank: '1st', diamonds: 5000, description: 'Daily champion' },
        { rank: '2nd', diamonds: 3000, description: 'Runner-up' },
        { rank: '3rd', diamonds: 2000, description: 'Third place' },
        { rank: 'Top 10', diamonds: 500, description: 'Participation reward' },
    ];

    return (
        <>
            <Head>
                <title>Prize Pool | Diamond Arcade</title>
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
                             Prize Pool
                        </h1>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {prizes.map((prize, idx) => (
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
                                            {prize.rank}
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {prize.description}
                                        </div>
                                    </div>

                                    <div style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 'bold' }}>
                                        Diamonds {prize.diamonds.toLocaleString()}
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
