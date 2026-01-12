/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND CELEBRATION SYSTEM — Animated reward notifications
   Shows epic celebrations when users earn diamonds with particle effects
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface CelebrationData {
    id: string;
    reward_id: string;
    diamonds: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon: string;
    multiplier: number;
    message: string;
}

interface Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    color: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// RARITY CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

const RARITY_CONFIG = {
    common: {
        color: '#00D4FF',
        glow: 'rgba(0, 212, 255, 0.4)',
        particles: 15,
        duration: 2500,
        sound: 'coin-small',
    },
    uncommon: {
        color: '#00ff88',
        glow: 'rgba(0, 255, 136, 0.4)',
        particles: 25,
        duration: 3000,
        sound: 'coin-medium',
    },
    rare: {
        color: '#8a2be2',
        glow: 'rgba(138, 43, 226, 0.4)',
        particles: 40,
        duration: 3500,
        sound: 'achievement',
    },
    epic: {
        color: '#ff6b9d',
        glow: 'rgba(255, 107, 157, 0.4)',
        particles: 60,
        duration: 4000,
        sound: 'epic-unlock',
    },
    legendary: {
        color: '#FFD700',
        glow: 'rgba(255, 215, 0, 0.6)',
        particles: 100,
        duration: 5000,
        sound: 'legendary-fanfare',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

function DiamondParticles({
    rarity,
    isActive
}: {
    rarity: keyof typeof RARITY_CONFIG;
    isActive: boolean;
}) {
    const [particles, setParticles] = useState<Particle[]>([]);
    const config = RARITY_CONFIG[rarity];

    useEffect(() => {
        if (!isActive) {
            setParticles([]);
            return;
        }

        // Generate initial particles
        const newParticles: Particle[] = Array.from({ length: config.particles }, (_, i) => ({
            id: i,
            x: 50 + (Math.random() - 0.5) * 20,
            y: 50,
            vx: (Math.random() - 0.5) * 8,
            vy: -Math.random() * 10 - 5,
            size: Math.random() * 8 + 4,
            opacity: 1,
            color: i % 3 === 0 ? config.color : i % 3 === 1 ? '#ffffff' : '#FFD700',
        }));
        setParticles(newParticles);

        // Animate particles
        const interval = setInterval(() => {
            setParticles(prev =>
                prev.map(p => ({
                    ...p,
                    x: p.x + p.vx * 0.1,
                    y: p.y + p.vy * 0.1,
                    vy: p.vy + 0.3, // gravity
                    opacity: Math.max(0, p.opacity - 0.015),
                })).filter(p => p.opacity > 0)
            );
        }, 16);

        return () => clearInterval(interval);
    }, [isActive, config.particles, config.color]);

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
        }}>
            {particles.map(p => (
                <div
                    key={p.id}
                    style={{
                        position: 'absolute',
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        borderRadius: '50%',
                        background: p.color,
                        opacity: p.opacity,
                        boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                        transform: 'translate(-50%, -50%)',
                    }}
                />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE CELEBRATION POPUP
// ═══════════════════════════════════════════════════════════════════════════

function CelebrationPopup({
    celebration,
    onDismiss,
}: {
    celebration: CelebrationData;
    onDismiss: () => void;
}) {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const config = RARITY_CONFIG[celebration.rarity] || RARITY_CONFIG.common;

    useEffect(() => {
        // Entrance animation
        requestAnimationFrame(() => setIsVisible(true));

        // Auto-dismiss after duration
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onDismiss, 500);
        }, config.duration);

        return () => clearTimeout(timer);
    }, [config.duration, onDismiss]);

    const handleClick = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 500);
    };

    return (
        <div
            onClick={handleClick}
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) scale(${isVisible && !isExiting ? 1 : 0.5})`,
                opacity: isVisible && !isExiting ? 1 : 0,
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                zIndex: 10000,
                cursor: 'pointer',
            }}
        >
            {/* Particle effects */}
            <DiamondParticles rarity={celebration.rarity} isActive={isVisible && !isExiting} />

            {/* Glowing ring */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 300,
                height: 300,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${config.glow} 0%, transparent 70%)`,
                animation: isVisible ? 'pulseGlow 1.5s ease-in-out infinite' : 'none',
            }} />

            {/* Main card */}
            <div style={{
                position: 'relative',
                background: 'linear-gradient(180deg, rgba(0, 20, 40, 0.98), rgba(0, 10, 30, 0.99))',
                border: `3px solid ${config.color}`,
                borderRadius: 24,
                padding: '40px 60px',
                textAlign: 'center',
                boxShadow: `
                    0 0 60px ${config.glow},
                    0 0 100px ${config.glow},
                    inset 0 0 30px ${config.glow}
                `,
            }}>
                {/* Rarity badge */}
                {(celebration.rarity === 'legendary' || celebration.rarity === 'epic') && (
                    <div style={{
                        position: 'absolute',
                        top: -15,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: `linear-gradient(135deg, ${config.color}, ${config.color}88)`,
                        color: celebration.rarity === 'legendary' ? '#0a1628' : '#ffffff',
                        fontSize: 12,
                        fontWeight: 800,
                        padding: '6px 20px',
                        borderRadius: 20,
                        textTransform: 'uppercase',
                        letterSpacing: 2,
                    }}>
                        {celebration.rarity}
                    </div>
                )}

                {/* Icon */}
                <div style={{
                    fontSize: 72,
                    marginBottom: 16,
                    filter: `drop-shadow(0 0 20px ${config.color})`,
                    animation: 'bounceIcon 1s ease-in-out infinite',
                }}>
                    {celebration.icon || '💎'}
                </div>

                {/* Message */}
                <div style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                    marginBottom: 8,
                    letterSpacing: 1,
                }}>
                    {celebration.message}
                </div>

                {/* Diamond amount */}
                <div style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 48,
                    fontWeight: 900,
                    background: `linear-gradient(135deg, ${config.color}, #ffffff)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: 8,
                    textShadow: `0 0 40px ${config.glow}`,
                }}>
                    +{celebration.diamonds.toLocaleString()} 💎
                </div>

                {/* Multiplier badge */}
                {celebration.multiplier > 1 && (
                    <div style={{
                        display: 'inline-block',
                        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
                        color: '#0a1628',
                        fontSize: 14,
                        fontWeight: 700,
                        padding: '6px 16px',
                        borderRadius: 12,
                        marginTop: 8,
                    }}>
                        🔥 {celebration.multiplier}x STREAK BONUS!
                    </div>
                )}

                {/* Tap to dismiss hint */}
                <div style={{
                    marginTop: 20,
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.4)',
                }}>
                    Tap to dismiss
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes pulseGlow {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
                    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                }
                @keyframes bounceIcon {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CELEBRATION MANAGER — Handles queue of celebrations
// ═══════════════════════════════════════════════════════════════════════════

export function CelebrationManager() {
    const [queue, setQueue] = useState<CelebrationData[]>([]);
    const [currentCelebration, setCurrentCelebration] = useState<CelebrationData | null>(null);

    // Listen for diamond reward events
    useEffect(() => {
        const handleReward = (e: CustomEvent) => {
            const data = e.detail as CelebrationData;
            if (data && data.diamonds > 0) {
                setQueue(prev => [...prev, {
                    ...data,
                    id: data.id || `${Date.now()}-${Math.random()}`,
                    rarity: data.rarity || 'common',
                    icon: data.icon || '💎',
                    multiplier: data.multiplier || 1,
                    message: data.message || '💎 DIAMONDS EARNED!',
                }]);
            }
        };

        window.addEventListener('diamond-reward', handleReward as EventListener);
        window.addEventListener('diamond-celebration', handleReward as EventListener);

        return () => {
            window.removeEventListener('diamond-reward', handleReward as EventListener);
            window.removeEventListener('diamond-celebration', handleReward as EventListener);
        };
    }, []);

    // Process queue
    useEffect(() => {
        if (!currentCelebration && queue.length > 0) {
            const [next, ...rest] = queue;
            setCurrentCelebration(next);
            setQueue(rest);
        }
    }, [queue, currentCelebration]);

    const handleDismiss = useCallback(() => {
        setCurrentCelebration(null);
    }, []);

    if (!currentCelebration) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleDismiss}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    animation: 'fadeIn 0.3s ease-out',
                }}
            />

            {/* Popup */}
            <CelebrationPopup
                celebration={currentCelebration}
                onDismiss={handleDismiss}
            />

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK FOR TRIGGERING CELEBRATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useCelebration() {
    const celebrate = useCallback((data: Partial<CelebrationData>) => {
        const event = new CustomEvent('diamond-celebration', { detail: data });
        window.dispatchEvent(event);
    }, []);

    return { celebrate };
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI CELEBRATION — Smaller toast-style notification for common rewards
// ═══════════════════════════════════════════════════════════════════════════

export function MiniCelebration({
    diamonds,
    icon = '💎',
    onComplete,
}: {
    diamonds: number;
    icon?: string;
    onComplete?: () => void;
}) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(() => onComplete?.(), 300);
        }, 2000);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div style={{
            position: 'fixed',
            top: 80,
            right: 20,
            transform: `translateX(${isVisible ? 0 : 100}%)`,
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.3s ease-out',
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.9), rgba(0, 136, 204, 0.9))',
            borderRadius: 12,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
            zIndex: 9000,
        }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 18,
                fontWeight: 700,
                color: '#ffffff',
            }}>
                +{diamonds} 💎
            </span>
        </div>
    );
}

export default CelebrationManager;
