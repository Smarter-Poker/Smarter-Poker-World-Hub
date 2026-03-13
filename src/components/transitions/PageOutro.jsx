/**
 * PAGE OUTRO TRANSITION
 * PS5-Style 2-second exit animation
 * Shows "Smarter.Poker" with premium swoosh effect
 */
import { useEffect, useState } from 'react';

export function PageOutro({ isActive, onComplete }) {
    const [phase, setPhase] = useState(0); // 0: hidden, 1: logo in, 2: swoosh out

    useEffect(() => {
        if (!isActive) {
            setPhase(0);
            return;
        }

        // Phase 1: Logo appears (0-600ms)
        setPhase(1);

        // Phase 2: Swoosh out (600-1500ms)
        const swooshTimer = setTimeout(() => setPhase(2), 600);

        // Complete (1500ms)
        const completeTimer = setTimeout(() => {
            onComplete?.();
        }, 1500);

        return () => {
            clearTimeout(swooshTimer);
            clearTimeout(completeTimer);
        };
    }, [isActive, onComplete]);

    if (!isActive && phase === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#050510',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
        }}>
            {/* Animated gradient background */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: `
                    radial-gradient(ellipse at 50% 50%, rgba(0, 212, 255, 0.15) 0%, transparent 50%),
                    radial-gradient(ellipse at 30% 70%, rgba(255, 255, 255, 0.1) 0%, transparent 40%),
                    #050510
                `,
                animation: phase === 2 ? 'outroSwooshBg 0.8s ease-in-out forwards' : undefined,
            }} />

            {/* Horizontal light streaks */}
            <div style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                opacity: phase >= 1 ? 1 : 0,
            }}>
                {[...Array(5)].map((_, i) => (
                    <div key={i} style={{
                        position: 'absolute',
                        left: '-100%',
                        top: `${20 + i * 15}%`,
                        height: '2px',
                        width: '200%',
                        background: `linear-gradient(90deg, transparent, rgba(0, 212, 255, ${0.3 + i * 0.1}), transparent)`,
                        animation: `outroStreak 0.6s ease-out ${i * 0.05}s forwards`,
                        opacity: phase === 2 ? 0 : 1,
                        transition: 'opacity 0.3s',
                    }} />
                ))}
            </div>

            {/* Main Logo Container */}
            <div style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transform: phase === 0 ? 'scale(0.8) translateY(20px)' :
                    phase === 1 ? 'scale(1) translateY(0)' :
                        'scale(1.1) translate(-100vw, 50vh)',
                opacity: phase === 0 ? 0 : phase === 1 ? 1 : 0,
                transition: phase === 2
                    ? 'transform 0.5s cubic-bezier(0.7, 0, 0.84, 0), opacity 0.4s ease-in'
                    : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
            }}>
                {/* Brain Logo - Using circuit-brain with blend mode for transparency */}
                <img
                    src="/circuit-brain-bg.png"
                    alt="Smarter.Poker Brain"
                    style={{
                        width: 250,
                        height: 250,
                        marginBottom: 20,
                        objectFit: 'contain',
                        objectPosition: 'right center',
                        mixBlendMode: 'lighten',
                        filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.9)) drop-shadow(0 0 60px rgba(0, 212, 255, 0.6))',
                        animation: phase === 1 ? 'outroPulse 1s ease-in-out infinite' : undefined,
                    }}
                />

                {/* Logo Text */}
                <div style={{
                    fontFamily: "'Orbitron', -apple-system, sans-serif",
                    fontSize: 48,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    background: 'linear-gradient(135deg, #ffffff 0%, #00d4ff 50%, #ffffff 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: 'none',
                    filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.5))',
                    animation: phase === 1 ? 'outroShimmer 2s linear infinite' : undefined,
                }}>
                    SMARTER.POKER
                </div>

                {/* Underline accent */}
                <div style={{
                    width: phase >= 1 ? 300 : 0,
                    height: 3,
                    background: 'linear-gradient(90deg, transparent, #00d4ff, #ffffff, #00d4ff, transparent)',
                    marginTop: 12,
                    borderRadius: 2,
                    transition: 'width 0.5s ease-out 0.2s',
                    boxShadow: '0 0 15px rgba(0, 212, 255, 0.5)',
                }} />
            </div>

            {/* Swoosh particles */}
            {phase === 2 && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    {[...Array(20)].map((_, i) => (
                        <div key={i} style={{
                            position: 'absolute',
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            width: `${4 + Math.random() * 8}px`,
                            height: `${4 + Math.random() * 8}px`,
                            borderRadius: '50%',
                            background: i % 2 === 0 ? '#00d4ff' : '#ffffff',
                            boxShadow: `0 0 10px ${i % 2 === 0 ? '#00d4ff' : '#ffffff'}`,
                            animation: `outroParticle 0.6s ease-out ${Math.random() * 0.2}s forwards`,
                        }} />
                    ))}
                </div>
            )}

            {/* CSS Animations */}
            <style>{`
                @keyframes outroStreak {
                    0% { transform: translateX(-50%); opacity: 0; }
                    50% { opacity: 1; }
                    100% { transform: translateX(50%); opacity: 0; }
                }
                @keyframes outroPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes outroShimmer {
                    0% { background-position: 200% center; }
                    100% { background-position: -200% center; }
                }
                @keyframes outroSwooshBg {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100%); }
                }
                @keyframes outroParticle {
                    0% { transform: translate(0, 0) scale(1); opacity: 1; }
                    100% { transform: translate(-150vw, 80vh) scale(0); opacity: 0; }
                }
            `}</style>
        </div>
    );
}

// Hook for easy usage with navigation
export function usePageOutro() {
    const [isActive, setIsActive] = useState(false);
    const [pendingCallback, setPendingCallback] = useState(null);

    const triggerOutro = (callback) => {
        setIsActive(true);
        setPendingCallback(() => callback);
    };

    const handleComplete = () => {
        setIsActive(false);
        pendingCallback?.();
        setPendingCallback(null);
    };

    return {
        isActive,
        triggerOutro,
        OutroComponent: () => <PageOutro isActive={isActive} onComplete={handleComplete} />,
    };
}

export default PageOutro;
