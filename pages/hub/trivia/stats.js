/**
 * Trivia - Player Stats
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaStats() {
    const router = useRouter();

    const stats = {
        totalQuestions: 2847,
        correctAnswers: 2654,
        accuracy: 93,
        currentStreak: 47,
        bestStreak: 89,
        diamondsEarned: 12450
    };

    return (
        <>
            <Head>
                <title>My Stats | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: '#8b5cf6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Trivia
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                             My Trivia Stats
                        </h1>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Questions</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.totalQuestions.toLocaleString()}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Accuracy</div>
                                <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.accuracy}%</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Current Streak</div>
                                <div style={{ color: '#f59e0b', fontSize: '32px', fontWeight: 'bold' }}> {stats.currentStreak}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Diamonds Earned</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>Diamonds {stats.diamondsEarned.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
