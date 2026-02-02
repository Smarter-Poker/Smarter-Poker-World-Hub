/**
 * Trivia - Achievements
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaAchievements() {
    const router = useRouter();

    const achievements = [
        { id: 1, name: 'First Steps', description: 'Answer your first question', unlocked: true, icon: '' },
        { id: 2, name: 'Streak Master', description: 'Get a 50 question streak', unlocked: false, icon: '' },
        { id: 3, name: 'Perfect Score', description: '100% accuracy in a session', unlocked: true, icon: '💯' },
    ];

    return (
        <>
            <Head>
                <title>Achievements | Trivia</title>
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
                             Achievements
                        </h1>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {achievements.map(achievement => (
                                <div
                                    key={achievement.id}
                                    style={{
                                        background: achievement.unlocked ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${achievement.unlocked ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        gap: '16px',
                                        alignItems: 'center',
                                        opacity: achievement.unlocked ? 1 : 0.5
                                    }}
                                >
                                    <div style={{ fontSize: '48px' }}>{achievement.icon}</div>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                            {achievement.name}
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {achievement.description}
                                        </div>
                                    </div>
                                    {achievement.unlocked && (
                                        <div style={{ marginLeft: 'auto', color: '#10b981', fontWeight: 'bold' }}>
                                             Unlocked
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
