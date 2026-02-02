/**
 * Trivia - Settings
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaSettings() {
    const router = useRouter();

    return (
        <>
            <Head>
                <title>Settings | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
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

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                             Trivia Settings
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Customize your trivia experience
                        </p>

                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Sound Effects</div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Play sounds for correct/incorrect answers</div>
                                    </div>
                                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                </label>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Show Hints</div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Display hints for difficult questions</div>
                                    </div>
                                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                </label>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '12px' }}>Difficulty Level</div>
                                <select style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}>
                                    <option>Easy</option>
                                    <option>Medium</option>
                                    <option>Hard</option>
                                    <option>Expert</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: '#8b5cf6',
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
                            Save Settings
                        </button>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
