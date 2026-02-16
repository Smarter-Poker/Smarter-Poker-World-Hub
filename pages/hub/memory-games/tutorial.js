/**
 * Memory Games - Tutorial
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function MemoryGamesTutorial() {
    const router = useRouter();

    const steps = [
        { title: 'How to Play', description: 'Match pairs of cards by remembering their positions' },
        { title: 'Scoring', description: 'Faster matches and fewer mistakes earn more points' },
        { title: 'Power-ups', description: 'Earn power-ups by completing challenges' },
    ];

    return (
        <>
            <SEOHead
                title="Memory Games Tutorial — How to Play"
                description="Learn how to play the Smarter.Poker memory games with this step-by-step tutorial."
                canonical="/hub/memory-games/tutorial"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>


                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            Tutorial
                        </h1>

                        <div style={{ display: 'grid', gap: '20px' }}>
                            {steps.map((step, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '24px'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                                        <div style={{
                                            background: '#ec4899',
                                            color: '#fff',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold'
                                        }}>
                                            {idx + 1}
                                        </div>
                                        <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>
                                            {step.title}
                                        </h3>
                                    </div>
                                    <p style={{ color: '#9ca3af', marginLeft: '48px' }}>
                                        {step.description}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => router.push('/hub/memory-games')}
                            style={{
                                background: '#ec4899',
                                border: 'none',
                                color: '#fff',
                                padding: '16px 32px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                marginTop: '30px',
                                width: '100%'
                            }}
                        >
                            Start Playing
                        </button>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
