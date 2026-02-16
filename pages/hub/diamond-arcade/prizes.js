/**
 * Diamond Arcade - Prize Pool
 */

import SEOHead from '../../../src/components/seo/SEOHead';
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
            <SEOHead
                title="Arcade Prizes — Rewards Catalog"
                description="Browse available prizes and rewards in the Diamond Arcade."
                canonical="/hub/diamond-arcade/prizes"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>

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
