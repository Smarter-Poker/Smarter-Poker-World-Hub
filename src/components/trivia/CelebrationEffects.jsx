/**
 * CELEBRATION EFFECTS — Visual feedback and animations for trivia
 * Confetti, sounds, and dramatic popups
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Trophy, Star, Crown, Target, Award } from 'lucide-react';

// Confetti configuration
const CONFETTI_COLORS = ['#00d4ff', '#ffd700', '#ff6b6b', '#22c55e', '#a78bfa', '#f472b6'];
const CONFETTI_COUNT = 100;

/**
 * Confetti explosion effect
 */
export function ConfettiExplosion({ duration = 3000, onComplete }) {
    const [particles, setParticles] = useState([]);

    useEffect(() => {
        const newParticles = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
            id: i,
            x: 50 + (Math.random() - 0.5) * 20,
            y: 50,
            vx: (Math.random() - 0.5) * 30,
            vy: -Math.random() * 25 - 10,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 20,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            size: Math.random() * 8 + 4,
            shape: Math.random() > 0.5 ? 'rect' : 'circle'
        }));

        setParticles(newParticles);

        const timer = setTimeout(() => {
            setParticles([]);
            onComplete?.();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onComplete]);

    return (
        <div className="confetti-container">
            {particles.map(p => (
                <div
                    key={p.id}
                    className={`confetti ${p.shape}`}
                    style={{
                        '--x': `${p.x}%`,
                        '--y': `${p.y}%`,
                        '--vx': p.vx,
                        '--vy': p.vy,
                        '--rotation': `${p.rotation}deg`,
                        '--rotation-speed': p.rotationSpeed,
                        '--color': p.color,
                        '--size': `${p.size}px`,
                        animationDuration: `${duration}ms`
                    }}
                />
            ))}
            <style jsx>{`
                .confetti-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    pointer-events: none;
                    z-index: 9999;
                    overflow: hidden;
                }
                
                .confetti {
                    position: absolute;
                    left: var(--x);
                    top: var(--y);
                    width: var(--size);
                    height: var(--size);
                    background: var(--color);
                    animation: confettiFall linear forwards;
                }
                
                .confetti.rect {
                    border-radius: 2px;
                }
                
                .confetti.circle {
                    border-radius: 50%;
                }
                
                @keyframes confettiFall {
                    0% {
                        transform: translate(0, 0) rotate(var(--rotation));
                        opacity: 1;
                    }
                    100% {
                        transform: translate(calc(var(--vx) * 10px), calc(100vh + var(--vy) * -30px)) 
                                   rotate(calc(var(--rotation) + var(--rotation-speed) * 360deg));
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}

/**
 * Achievement unlock popup
 */
export function AchievementToast({
    achievement,
    onClose,
    autoClose = 4000
}) {
    useEffect(() => {
        if (autoClose) {
            const timer = setTimeout(onClose, autoClose);
            return () => clearTimeout(timer);
        }
    }, [autoClose, onClose]);

    const getIcon = () => {
        switch (achievement.rarity) {
            case 'legendary': return Crown;
            case 'epic': return Star;
            case 'rare': return Award;
            default: return Trophy;
        }
    };

    const Icon = getIcon();

    return (
        <div className={`achievement-toast ${achievement.rarity || 'common'}`}>
            <div className="toast-glow" />
            <div className="toast-icon">
                <Icon size={28} />
            </div>
            <div className="toast-content">
                <div className="toast-label">ACHIEVEMENT UNLOCKED</div>
                <div className="toast-name">{achievement.name}</div>
                <div className="toast-description">{achievement.description}</div>
            </div>
            <button className="toast-close" onClick={onClose}>×</button>

            <style jsx>{`
                .achievement-toast {
                    position: fixed;
                    top: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 24px;
                    background: linear-gradient(135deg, rgba(26, 39, 68, 0.95) 0%, rgba(10, 22, 40, 0.98) 100%);
                    border: 2px solid;
                    border-radius: 12px;
                    z-index: 10000;
                    animation: toastSlideIn 0.5s ease-out, toastGlow 2s ease-in-out infinite;
                    min-width: 300px;
                    max-width: 400px;
                }
                
                .achievement-toast.common {
                    border-color: #60a5fa;
                    --glow-color: rgba(96, 165, 250, 0.4);
                }
                
                .achievement-toast.rare {
                    border-color: #a78bfa;
                    --glow-color: rgba(167, 139, 250, 0.4);
                }
                
                .achievement-toast.epic {
                    border-color: #fbbf24;
                    --glow-color: rgba(251, 191, 36, 0.4);
                }
                
                .achievement-toast.legendary {
                    border-color: #ffd700;
                    --glow-color: rgba(255, 215, 0, 0.5);
                    animation: toastSlideIn 0.5s ease-out, legendaryPulse 1.5s ease-in-out infinite;
                }
                
                @keyframes toastSlideIn {
                    from { 
                        transform: translateX(-50%) translateY(-100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }
                
                @keyframes toastGlow {
                    0%, 100% { box-shadow: 0 0 20px var(--glow-color); }
                    50% { box-shadow: 0 0 40px var(--glow-color); }
                }
                
                @keyframes legendaryPulse {
                    0%, 100% { 
                        box-shadow: 0 0 30px rgba(255, 215, 0, 0.5), 0 0 60px rgba(255, 215, 0, 0.3);
                        transform: translateX(-50%) scale(1);
                    }
                    50% { 
                        box-shadow: 0 0 50px rgba(255, 215, 0, 0.7), 0 0 100px rgba(255, 215, 0, 0.4);
                        transform: translateX(-50%) scale(1.02);
                    }
                }
                
                .toast-glow {
                    position: absolute;
                    inset: -2px;
                    border-radius: 14px;
                    background: linear-gradient(45deg, transparent 40%, var(--glow-color) 50%, transparent 60%);
                    background-size: 200% 200%;
                    animation: shimmer 2s linear infinite;
                    z-index: -1;
                }
                
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                
                .toast-icon {
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    color: currentColor;
                }
                
                .achievement-toast.common .toast-icon { color: #60a5fa; }
                .achievement-toast.rare .toast-icon { color: #a78bfa; }
                .achievement-toast.epic .toast-icon { color: #fbbf24; }
                .achievement-toast.legendary .toast-icon { color: #ffd700; }
                
                .toast-content {
                    flex: 1;
                }
                
                .toast-label {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 2px;
                }
                
                .toast-name {
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 2px;
                }
                
                .toast-description {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                }
                
                .toast-close {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0 8px;
                    transition: color 0.2s;
                }
                
                .toast-close:hover {
                    color: #fff;
                }
            `}</style>
        </div>
    );
}

/**
 * Correct answer flash effect
 */
export function CorrectAnswerFlash() {
    return (
        <div className="correct-flash">
            <div className="flash-overlay" />
            <div className="flash-icon">
                <Target size={64} />
            </div>
            <style jsx>{`
                .correct-flash {
                    position: fixed;
                    inset: 0;
                    pointer-events: none;
                    z-index: 9998;
                    animation: flashIn 0.5s ease-out forwards;
                }
                
                .flash-overlay {
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at center, rgba(34, 197, 94, 0.3) 0%, transparent 70%);
                    animation: pulseOut 0.5s ease-out forwards;
                }
                
                .flash-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: #22c55e;
                    animation: iconPop 0.5s ease-out forwards;
                }
                
                @keyframes flashIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes pulseOut {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
                
                @keyframes iconPop {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                }
            `}</style>
        </div>
    );
}

/**
 * Wrong answer shake effect
 */
export function WrongAnswerShake() {
    return (
        <div className="wrong-shake">
            <style jsx global>{`
                .wrong-shake ~ * {
                    animation: shake 0.4s ease-in-out;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-10px); }
                    40% { transform: translateX(10px); }
                    60% { transform: translateX(-5px); }
                    80% { transform: translateX(5px); }
                }
            `}</style>
        </div>
    );
}

/**
 * Perfect score celebration
 */
export function PerfectScoreCelebration({ onComplete }) {
    return (
        <div className="perfect-celebration">
            <ConfettiExplosion duration={4000} />
            <div className="perfect-content">
                <div className="perfect-stars">
                    <Star className="star s1" />
                    <Star className="star s2" />
                    <Star className="star s3" />
                </div>
                <h2 className="perfect-title">PERFECT!</h2>
                <p className="perfect-subtitle">Flawless Victory</p>
            </div>

            <style jsx>{`
                .perfect-celebration {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9997;
                    animation: fadeIn 0.3s ease-out;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .perfect-content {
                    text-align: center;
                    animation: contentPop 0.5s ease-out;
                }
                
                @keyframes contentPop {
                    0% { transform: scale(0.5); opacity: 0; }
                    70% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                .perfect-stars {
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 20px;
                }
                
                .perfect-stars :global(.star) {
                    width: 48px;
                    height: 48px;
                    color: #ffd700;
                    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8));
                }
                
                .perfect-stars :global(.s1) { animation: starPop 0.5s ease-out 0.1s backwards; }
                .perfect-stars :global(.s2) { animation: starPop 0.5s ease-out 0.2s backwards; }
                .perfect-stars :global(.s3) { animation: starPop 0.5s ease-out 0.3s backwards; }
                
                @keyframes starPop {
                    0% { transform: scale(0) rotate(-180deg); opacity: 0; }
                    100% { transform: scale(1) rotate(0); opacity: 1; }
                }
                
                .perfect-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 48px;
                    font-weight: 900;
                    color: #ffd700;
                    margin: 0 0 8px 0;
                    text-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.4);
                    animation: textGlow 1s ease-in-out infinite;
                }
                
                @keyframes textGlow {
                    0%, 100% { text-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.4); }
                    50% { text-shadow: 0 0 50px rgba(255, 215, 0, 1), 0 0 100px rgba(255, 215, 0, 0.6); }
                }
                
                .perfect-subtitle {
                    font-size: 18px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0;
                }
            `}</style>
        </div>
    );
}

/**
 * Hook to manage celebration effects
 */
export function useCelebrations() {
    const [showConfetti, setShowConfetti] = useState(false);
    const [showPerfect, setShowPerfect] = useState(false);
    const [showCorrect, setShowCorrect] = useState(false);
    const [showWrong, setShowWrong] = useState(false);
    const [achievement, setAchievement] = useState(null);

    const triggerConfetti = useCallback(() => {
        setShowConfetti(true);
    }, []);

    const triggerPerfect = useCallback(() => {
        setShowPerfect(true);
        setShowConfetti(true);
        setTimeout(() => setShowPerfect(false), 4000);
    }, []);

    const triggerCorrect = useCallback(() => {
        setShowCorrect(true);
        setTimeout(() => setShowCorrect(false), 500);
    }, []);

    const triggerWrong = useCallback(() => {
        setShowWrong(true);
        setTimeout(() => setShowWrong(false), 400);
    }, []);

    const triggerAchievement = useCallback((ach) => {
        setAchievement(ach);
    }, []);

    const CelebrationComponents = () => (
        <>
            {showConfetti && <ConfettiExplosion onComplete={() => setShowConfetti(false)} />}
            {showPerfect && <PerfectScoreCelebration />}
            {showCorrect && <CorrectAnswerFlash />}
            {showWrong && <WrongAnswerShake />}
            {achievement && (
                <AchievementToast
                    achievement={achievement}
                    onClose={() => setAchievement(null)}
                />
            )}
        </>
    );

    return {
        triggerConfetti,
        triggerPerfect,
        triggerCorrect,
        triggerWrong,
        triggerAchievement,
        CelebrationComponents
    };
}
