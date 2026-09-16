/**
 * CELEBRATION EFFECTS — Visual feedback and animations for trivia
 * Confetti, sounds, and dramatic popups
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Trophy, Star, Crown, Target, Award } from 'lucide-react';

// Confetti configuration
const CONFETTI_COLORS = ['#00d4ff', '#ffd700', '#ff6b6b', '#22c55e', '#a78bfa', '#f472b6'];
const CONFETTI_COUNT = 100;
const CONFETTI_COUNT_MOBILE = 60;

export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
}

function isSmallScreen() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(max-width: 480px)').matches; }
    catch { return false; }
}

/**
 * Confetti explosion effect
 */
export function ConfettiExplosion({ duration = 3000, onComplete }) {
    const [particles, setParticles] = useState([]);

    // onComplete is almost always an inline arrow from the caller, so a new
    // identity every parent render. Keeping it in a ref stops the effect from
    // re-running (and regenerating all ~100 particles) on unrelated renders.
    const onCompleteRef = useRef(onComplete);
    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

    useEffect(() => {
        // Motion-sensitive users get the result immediately, no particles.
        if (prefersReducedMotion()) {
            const skip = setTimeout(() => onCompleteRef.current?.(), 0);
            return () => clearTimeout(skip);
        }

        const count = isSmallScreen() ? CONFETTI_COUNT_MOBILE : CONFETTI_COUNT;
        const newParticles = Array.from({ length: count }, (_, i) => ({
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
            onCompleteRef.current?.();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration]);

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
            <style>{`
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
                    /* transform/opacity only, promoted to its own layer */
                    will-change: transform, opacity;
                    animation: confettiFall linear forwards;
                }

                @media (prefers-reduced-motion: reduce) {
                    .confetti { display: none; }
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

            <style>{`
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
            <style>{`
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
 * Wrong answer shake effect.
 *
 * The original implementation styled `.wrong-shake ~ *` — the subsequent-
 * sibling combinator. This component renders LAST inside the celebration
 * fragment, so it has no following siblings and nothing ever shook. It now
 * toggles a class on a real ancestor (document.body by default) for the
 * duration of the animation, which is how the rest of the app does screen
 * shake.
 */
const SHAKE_CLASS = 'trivia-screen-shake';
const SHAKE_MS = 400;

export function WrongAnswerShake({ target = null, duration = SHAKE_MS }) {
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        if (prefersReducedMotion()) return undefined;

        const el = target || document.body;
        if (!el || !el.classList) return undefined;

        // Restart the animation if it is already running.
        el.classList.remove(SHAKE_CLASS);
        // Reading offsetWidth forces a reflow so the re-added class animates.
        void el.offsetWidth;
        el.classList.add(SHAKE_CLASS);

        const timer = setTimeout(() => el.classList.remove(SHAKE_CLASS), duration);
        return () => {
            clearTimeout(timer);
            el.classList.remove(SHAKE_CLASS);
        };
    }, [target, duration]);

    return (
        <style>{`
            .${SHAKE_CLASS} {
                animation: triviaScreenShake ${duration}ms ease-in-out;
            }

            @keyframes triviaScreenShake {
                0%, 100% { transform: translate3d(0, 0, 0); }
                20% { transform: translate3d(-10px, 0, 0); }
                40% { transform: translate3d(10px, 0, 0); }
                60% { transform: translate3d(-5px, 0, 0); }
                80% { transform: translate3d(5px, 0, 0); }
            }

            @media (prefers-reduced-motion: reduce) {
                .${SHAKE_CLASS} { animation: none; }
            }
        `}</style>
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

            <style>{`
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
                
                /* :global() is styled-jsx / CSS-Modules syntax and is INVALID
                   in a plain <style> element — browsers dropped these rules,
                   so the three stars rendered unsized, uncoloured and
                   unanimated. The classNames are already on the elements. */
                .perfect-stars .star {
                    width: 48px;
                    height: 48px;
                    color: #ffd700;
                    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8));
                }

                .perfect-stars .s1 { animation: starPop 0.5s ease-out 0.1s backwards; }
                .perfect-stars .s2 { animation: starPop 0.5s ease-out 0.2s backwards; }
                .perfect-stars .s3 { animation: starPop 0.5s ease-out 0.3s backwards; }
                
                @keyframes starPop {
                    0% { transform: scale(0) rotate(-180deg); opacity: 0; }
                    100% { transform: scale(1) rotate(0); opacity: 1; }
                }
                
                .perfect-title {
                    font-family: 'Rajdhani', sans-serif;
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

                @media (prefers-reduced-motion: reduce) {
                    .perfect-celebration,
                    .perfect-content,
                    .perfect-stars .star,
                    .perfect-stars .s1,
                    .perfect-stars .s2,
                    .perfect-stars .s3,
                    .perfect-title {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    );
}

/**
 * Stable top-level render surface for the celebration layer.
 *
 * This MUST live outside useCelebrations. When it was defined inside the hook,
 * a brand new component type was created on every render of the consuming
 * page, so React unmounted and remounted the entire celebration subtree each
 * time: confetti regenerated all its particles and restarted its timer, the
 * achievement toast restarted its slide-in and auto-close, etc.
 */
const Celebrations = React.memo(function Celebrations({
    showConfetti,
    showPerfect,
    showCorrect,
    showWrong,
    achievement,
    onConfettiDone,
    onAchievementClose
}) {
    return (
        <>
            {showConfetti && <ConfettiExplosion onComplete={onConfettiDone} />}
            {showPerfect && <PerfectScoreCelebration />}
            {showCorrect && <CorrectAnswerFlash />}
            {showWrong && <WrongAnswerShake />}
            {achievement && (
                <AchievementToast
                    achievement={achievement}
                    onClose={onAchievementClose}
                />
            )}
        </>
    );
});

/**
 * Hook to manage celebration effects.
 *
 * Returns both:
 *   celebrationElements   — render directly: {celebrations.celebrationElements}
 *   CelebrationComponents — stable-identity component, safe either as
 *                           {celebrations.CelebrationComponents()} or
 *                           <celebrations.CelebrationComponents />
 */
export function useCelebrations() {
    const [showConfetti, setShowConfetti] = useState(false);
    const [showPerfect, setShowPerfect] = useState(false);
    const [showCorrect, setShowCorrect] = useState(false);
    const [showWrong, setShowWrong] = useState(false);
    const [achievement, setAchievement] = useState(null);

    // Trigger timeouts were previously fire-and-forget, so a trigger fired
    // shortly before navigation set state on an unmounted component.
    const timeoutsRef = useRef(new Set());
    const isMountedRef = useRef(true);
    const safeSetTimeout = useCallback((fn, delay) => {
        const id = setTimeout(() => {
            timeoutsRef.current.delete(id);
            if (isMountedRef.current) fn();
        }, delay);
        timeoutsRef.current.add(id);
        return id;
    }, []);
    useEffect(() => () => {
        isMountedRef.current = false;
        for (const id of timeoutsRef.current) clearTimeout(id);
        timeoutsRef.current.clear();
    }, []);

    const triggerConfetti = useCallback(() => {
        setShowConfetti(true);
    }, []);

    const triggerPerfect = useCallback(() => {
        // Motion-sensitive users skip the full-screen overlay entirely.
        if (!prefersReducedMotion()) {
            setShowPerfect(true);
            safeSetTimeout(() => setShowPerfect(false), 4000);
        }
        setShowConfetti(true);
    }, [safeSetTimeout]);

    const triggerCorrect = useCallback(() => {
        setShowCorrect(true);
        safeSetTimeout(() => setShowCorrect(false), 500);
    }, [safeSetTimeout]);

    const triggerWrong = useCallback(() => {
        setShowWrong(true);
        safeSetTimeout(() => setShowWrong(false), 400);
    }, [safeSetTimeout]);

    const triggerAchievement = useCallback((ach) => {
        setAchievement(ach);
    }, []);

    const handleConfettiDone = useCallback(() => setShowConfetti(false), []);
    const handleAchievementClose = useCallback(() => setAchievement(null), []);

    const celebrationElements = useMemo(() => (
        <Celebrations
            showConfetti={showConfetti}
            showPerfect={showPerfect}
            showCorrect={showCorrect}
            showWrong={showWrong}
            achievement={achievement}
            onConfettiDone={handleConfettiDone}
            onAchievementClose={handleAchievementClose}
        />
    ), [showConfetti, showPerfect, showCorrect, showWrong, achievement, handleConfettiDone, handleAchievementClose]);

    // Stable function identity for the whole lifetime of the hook. It reads
    // the latest element from a ref, so calling it OR rendering it as a
    // component both work without ever changing the component type.
    const elementsRef = useRef(celebrationElements);
    elementsRef.current = celebrationElements;
    const CelebrationComponents = useRef(function CelebrationComponents() {
        return elementsRef.current;
    }).current;

    return {
        triggerConfetti,
        triggerPerfect,
        triggerCorrect,
        triggerWrong,
        triggerAchievement,
        celebrationElements,
        CelebrationComponents
    };
}
