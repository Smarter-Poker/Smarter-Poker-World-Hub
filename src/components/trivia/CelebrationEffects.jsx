/**
 * CELEBRATION EFFECTS - Visual feedback for trivia
 * Confetti, the perfect-score moment and the achievement unlock.
 *
 * #ClubArenaConsole: celebrations print as lit ink. The modal moments
 * (achievement unlocked, perfect score) open on the painted TriviaConsoleDialog
 * chassis; nothing here draws a card, gradient, rounded toast, icon glyph or
 * hover state. Every trigger, timing and dismissal is unchanged.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import { toTitleCase } from '../../lib/trivia/titleCase';

// Confetti uses the master's own inks only (#ClubArenaConsole 3.4).
const CONFETTI_COLORS = ['#ffd700', '#45adff', '#c8ffd2', '#e4e7ec', '#f4f7fb', '#1877f2'];
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
 * Confetti explosion effect. Transform/opacity only; skipped entirely for
 * reduced motion. Styles live in trivia-console-play.css.
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
        }));

        setParticles(newParticles);

        const timer = setTimeout(() => {
            setParticles([]);
            onCompleteRef.current?.();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration]);

    return (
        <div className="trivia-confetti" aria-hidden="true">
            {particles.map(p => (
                <div
                    key={p.id}
                    className="trivia-confetti__piece"
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
        </div>
    );
}

const RARITY_INK = Object.freeze({ legendary: 'gold', epic: 'gold', rare: 'blue', common: 'silver' });

/**
 * Achievement unlock, printed on the painted console dialog. Auto-closes
 * after `autoClose` ms exactly as the old toast did; Close, Escape and the
 * backdrop dismiss it early.
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

    const rarity = String(achievement?.rarity || 'common').toLowerCase();
    const ink = RARITY_INK[rarity] || 'silver';

    return (
        <TriviaConsoleDialog
            open
            onClose={onClose}
            eyebrow="Achievement Unlocked"
            title={toTitleCase(String(achievement?.name || 'Achievement'))}
            pill={toTitleCase(rarity)}
            secondaryAction={{ label: 'Close', onClick: onClose }}
        >
            <div className="trivia-achievement" data-rarity={rarity}>
                {achievement?.description ? (
                    <p className={`trivia-console-copy tc-ink--${ink}`}>
                        {toTitleCase(String(achievement.description))}
                    </p>
                ) : null}
            </div>
        </TriviaConsoleDialog>
    );
}

/**
 * Correct answer flash: one lit word, gone in half a second.
 */
export function CorrectAnswerFlash() {
    return (
        <div className="trivia-correct-flash" aria-hidden="true">
            <span className="tc-ink--green">Correct</span>
        </div>
    );
}

/**
 * Wrong answer shake effect.
 *
 * The original implementation styled `.wrong-shake ~ *` - the subsequent-
 * sibling combinator. This component renders LAST inside the celebration
 * fragment, so it has no following siblings and nothing ever shook. It now
 * toggles a class on a real ancestor (document.body by default) for the
 * duration of the animation, which is how the rest of the app does screen
 * shake. The keyframes live in trivia-console-play.css.
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

    return null;
}

/**
 * Perfect score celebration: confetti plus the moment itself, printed in gold
 * ink on the painted console dialog. The hook closes it after 4 seconds.
 */
export function PerfectScoreCelebration({ onClose }) {
    return (
        <>
            <ConfettiExplosion duration={4000} />
            <TriviaConsoleDialog
                open
                onClose={onClose}
                eyebrow="Every Answer Correct"
                title="Perfect"
                pill="Flawless"
                secondaryAction={onClose ? { label: 'Continue', onClick: onClose } : undefined}
            >
                <p className="trivia-perfect__line tc-ink--gold">Flawless Victory</p>
            </TriviaConsoleDialog>
        </>
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
    onAchievementClose,
    onPerfectClose
}) {
    return (
        <>
            {showConfetti && <ConfettiExplosion onComplete={onConfettiDone} />}
            {showPerfect && <PerfectScoreCelebration onClose={onPerfectClose} />}
            {showCorrect && <CorrectAnswerFlash />}
            {showWrong && <WrongAnswerShake />}
            {/* One console dialog at a time: an achievement earned on a
                perfect run opens once the perfect moment has closed. */}
            {achievement && !showPerfect && (
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
 *   celebrationElements   - render directly: {celebrations.celebrationElements}
 *   CelebrationComponents - stable-identity component, safe either as
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
    const handlePerfectClose = useCallback(() => setShowPerfect(false), []);

    const celebrationElements = useMemo(() => (
        <Celebrations
            showConfetti={showConfetti}
            showPerfect={showPerfect}
            showCorrect={showCorrect}
            showWrong={showWrong}
            achievement={achievement}
            onConfettiDone={handleConfettiDone}
            onAchievementClose={handleAchievementClose}
            onPerfectClose={handlePerfectClose}
        />
    ), [showConfetti, showPerfect, showCorrect, showWrong, achievement, handleConfettiDone, handleAchievementClose, handlePerfectClose]);

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
