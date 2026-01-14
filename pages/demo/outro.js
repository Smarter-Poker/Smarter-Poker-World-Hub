/**
 * OUTRO DEMO PAGE
 * Test the PS5-style page transition
 */
import { useState } from 'react';
import { PageOutro } from '../../src/components/transitions/PageOutro';
import { useRouter } from 'next/router';

export default function OutroDemo() {
    const [showOutro, setShowOutro] = useState(false);
    const router = useRouter();

    const handleNavigate = (url) => {
        setShowOutro(true);
        // Wait for animation to complete, then navigate
        setTimeout(() => {
            router.push(url);
        }, 2000);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 30,
            fontFamily: "'Orbitron', -apple-system, sans-serif",
            color: 'white',
        }}>
            <PageOutro
                isActive={showOutro}
                onComplete={() => setShowOutro(false)}
            />

            <h1 style={{
                fontSize: 36,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #00d4ff, #8a2be2)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
            }}>
                Page Outro Demo
            </h1>

            <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>
                Click a button to see the PS5-style exit transition
            </p>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                    onClick={() => handleNavigate('/hub')}
                    style={{
                        padding: '15px 40px',
                        fontSize: 16,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
                        border: 'none',
                        borderRadius: 12,
                        color: 'white',
                        cursor: 'pointer',
                        boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.transform = 'scale(1.05)';
                        e.target.style.boxShadow = '0 0 30px rgba(0, 212, 255, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'scale(1)';
                        e.target.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.4)';
                    }}
                >
                    Go to Hub →
                </button>

                <button
                    onClick={() => handleNavigate('/hub/training')}
                    style={{
                        padding: '15px 40px',
                        fontSize: 16,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        background: 'linear-gradient(135deg, #8a2be2, #6b1cb0)',
                        border: 'none',
                        borderRadius: 12,
                        color: 'white',
                        cursor: 'pointer',
                        boxShadow: '0 0 20px rgba(138, 43, 226, 0.4)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.transform = 'scale(1.05)';
                        e.target.style.boxShadow = '0 0 30px rgba(138, 43, 226, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'scale(1)';
                        e.target.style.boxShadow = '0 0 20px rgba(138, 43, 226, 0.4)';
                    }}
                >
                    Go to Training →
                </button>

                <button
                    onClick={() => setShowOutro(true)}
                    style={{
                        padding: '15px 40px',
                        fontSize: 16,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        background: 'linear-gradient(135deg, #333, #222)',
                        border: '2px solid #00d4ff',
                        borderRadius: 12,
                        color: '#00d4ff',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                    Preview Only
                </button>
            </div>
        </div>
    );
}
