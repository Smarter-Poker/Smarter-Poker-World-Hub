/**
 * 🎉 ENHANCED CONFETTI SYSTEM
 * Advanced celebration effects with multiple presets
 */

import confetti from 'canvas-confetti';

// Confetti presets
export const confettiPresets = {
    // Basic celebration
    basic: () => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
        });
    },

    // Achievement unlocked
    achievement: () => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
        }, 250);
    },

    // Mastery celebration (85%+)
    mastery: () => {
        const count = 200;
        const defaults = {
            origin: { y: 0.7 },
            zIndex: 9999,
        };

        function fire(particleRatio, opts) {
            confetti({
                ...defaults,
                ...opts,
                particleCount: Math.floor(count * particleRatio),
            });
        }

        fire(0.25, {
            spread: 26,
            startVelocity: 55,
        });

        fire(0.2, {
            spread: 60,
        });

        fire(0.35, {
            spread: 100,
            decay: 0.91,
            scalar: 0.8,
        });

        fire(0.1, {
            spread: 120,
            startVelocity: 25,
            decay: 0.92,
            scalar: 1.2,
        });

        fire(0.1, {
            spread: 120,
            startVelocity: 45,
        });
    },

    // Streak celebration
    streak: (streakCount) => {
        const colors = streakCount >= 10
            ? ['#ff1744', '#ff6b35', '#ffd700']
            : streakCount >= 7
                ? ['#ff6b35', '#ffd700']
                : ['#00ff88', '#00d4ff'];

        confetti({
            particleCount: 50 + (streakCount * 5),
            spread: 60 + (streakCount * 2),
            origin: { y: 0.6 },
            colors,
            ticks: 200,
        });
    },

    // Level up
    levelUp: () => {
        const duration = 2000;
        const animationEnd = Date.now() + duration;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#00d4ff', '#0088cc'],
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#00ff88', '#00cc66'],
            });
        }, 50);
    },

    // Fireworks
    fireworks: () => {
        const duration = 5000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.9), y: randomInRange(0.1, 0.5) },
                colors: ['#00d4ff', '#00ff88', '#ffd700', '#ff6b35', '#ff1744'],
            });
        }, 250);
    },

    // Custom celebration
    custom: (options = {}) => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            ...options,
        });
    },
};

// Convenience exports
export const celebrate = confettiPresets.basic;
export const achievementCelebration = confettiPresets.achievement;
export const masteryCelebration = confettiPresets.mastery;
export const streakCelebration = confettiPresets.streak;
export const levelUpCelebration = confettiPresets.levelUp;
export const fireworksCelebration = confettiPresets.fireworks;

export default confettiPresets;
