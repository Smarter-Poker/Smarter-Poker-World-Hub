/**
 * 🎉 ENHANCED CONFETTI SYSTEM
 * Advanced celebration effects with multiple presets
 * Lazy-loaded to reduce initial bundle size (~15KB saved)
 */

// Lazy-load canvas-confetti on first use
let _confetti = null;
async function getConfetti() {
    if (!_confetti) {
        try {
            const m = await import('canvas-confetti');
            _confetti = m.default || m;
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); };
        }
    }
    return _confetti;
}

// Safe fire wrapper — cosmetic failures are silent
async function fire(opts) {
    try {
        const c = await getConfetti();
        c(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

// Confetti presets
export const confettiPresets = {
    // Basic celebration
    basic: () => {
        fire({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
        });
    },

    // Achievement unlocked
    achievement: async () => {
        const c = await getConfetti();
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

            try {
                c({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
                });
                c({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
                });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }, 250);
    },

    // Mastery celebration (85%+)
    mastery: async () => {
        const c = await getConfetti();
        const count = 200;
        const defaults = {
            origin: { y: 0.7 },
            zIndex: 9999,
        };

        function fireBurst(particleRatio, opts) {
            try {
                c({
                    ...defaults,
                    ...opts,
                    particleCount: Math.floor(count * particleRatio),
                });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }

        fireBurst(0.25, {
            spread: 26,
            startVelocity: 55,
        });

        fireBurst(0.2, {
            spread: 60,
        });

        fireBurst(0.35, {
            spread: 100,
            decay: 0.91,
            scalar: 0.8,
        });

        fireBurst(0.1, {
            spread: 120,
            startVelocity: 25,
            decay: 0.92,
            scalar: 1.2,
        });

        fireBurst(0.1, {
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

        fire({
            particleCount: 50 + (streakCount * 5),
            spread: 60 + (streakCount * 2),
            origin: { y: 0.6 },
            colors,
            ticks: 200,
        });
    },

    // Level up
    levelUp: async () => {
        const c = await getConfetti();
        const duration = 2000;
        const animationEnd = Date.now() + duration;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            try {
                c({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#00d4ff', '#0088cc'],
                });
                c({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#00ff88', '#00cc66'],
                });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }, 50);
    },

    // Fireworks
    fireworks: async () => {
        const c = await getConfetti();
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

            try {
                c({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.1, 0.9), y: randomInRange(0.1, 0.5) },
                    colors: ['#00d4ff', '#00ff88', '#ffd700', '#ff6b35', '#ff1744'],
                });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }, 250);
    },

    // Custom celebration
    custom: (options = {}) => {
        fire({
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
