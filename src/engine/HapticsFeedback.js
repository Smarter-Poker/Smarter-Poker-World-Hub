/**
 * 🎮 HAPTICS & SOUND ENGINE — Video Game Feedback System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Mobile haptic vibrations (navigator.vibrate)
 * - Sound effects for actions (correct, incorrect, tick, streak)
 * - Screen shake effects
 * - Pulse animations
 * - Pressure feedback as timer runs low
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Haptic patterns (in milliseconds)
export const HAPTIC_PATTERNS = {
    TAP: [10],                     // Quick tap
    SUCCESS: [50, 50, 100],        // Celebration pattern
    FAILURE: [100, 50, 100, 50, 100], // Error shake
    STREAK: [30, 30, 30, 30, 50, 100], // Building excitement
    TICK: [5],                     // Timer tick
    WARNING: [20, 20, 20],         // Low time warning
    DEAL: [15, 30, 15],            // Card dealing
    CHIP: [10, 20],                // Chip movement
    PRESSURE: [50, 100, 50, 100, 50, 100, 150], // Intense pressure
};

// Sound frequencies for Web Audio API
const SOUND_CONFIG = {
    CORRECT: { freq: 880, duration: 150, type: 'sine', gain: 0.3 },
    INCORRECT: { freq: 200, duration: 300, type: 'sawtooth', gain: 0.2 },
    TICK: { freq: 1200, duration: 30, type: 'sine', gain: 0.1 },
    TICK_LOW: { freq: 600, duration: 50, type: 'square', gain: 0.15 },
    STREAK: { freq: 1400, duration: 100, type: 'sine', gain: 0.25 },
    DEAL: { freq: 400, duration: 80, type: 'sine', gain: 0.15 },
    CHIP: { freq: 800, duration: 60, type: 'sine', gain: 0.1 },
    LEVEL_UP: { freq: 660, duration: 200, type: 'sine', gain: 0.3, sweep: 880 },
    PRESSURE: { freq: 150, duration: 400, type: 'sawtooth', gain: 0.2 },
};

// Audio context singleton
let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
};

/**
 * Trigger haptic feedback (mobile devices)
 */
export const triggerHaptic = (pattern) => {
    if ('vibrate' in navigator) {
        const hapticPattern = HAPTIC_PATTERNS[pattern] || HAPTIC_PATTERNS.TAP;
        navigator.vibrate(hapticPattern);
    }
};

/**
 * Play a sound effect using Web Audio API
 */
export const playSound = (soundName) => {
    try {
        const ctx = getAudioContext();
        const config = SOUND_CONFIG[soundName];
        if (!config) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = config.type;
        oscillator.frequency.setValueAtTime(config.freq, ctx.currentTime);

        // Frequency sweep for level up sound
        if (config.sweep) {
            oscillator.frequency.linearRampToValueAtTime(
                config.sweep,
                ctx.currentTime + config.duration / 1000
            );
        }

        gainNode.gain.setValueAtTime(config.gain, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + config.duration / 1000
        );

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + config.duration / 1000);
    } catch (e) {
        // Audio not supported or blocked
        console.log('Audio unavailable');
    }
};

/**
 * Combined feedback - haptic + sound
 */
export const feedback = {
    tap: () => {
        triggerHaptic('TAP');
    },

    correct: () => {
        triggerHaptic('SUCCESS');
        playSound('CORRECT');
    },

    incorrect: () => {
        triggerHaptic('FAILURE');
        playSound('INCORRECT');
    },

    streak: (count) => {
        triggerHaptic('STREAK');
        playSound('STREAK');
        // Extra vibration for big streaks
        if (count >= 5) {
            setTimeout(() => triggerHaptic('SUCCESS'), 100);
        }
    },

    tick: (timeRemaining, maxTime) => {
        const percent = timeRemaining / maxTime;
        if (percent < 0.2) {
            triggerHaptic('WARNING');
            playSound('TICK_LOW');
        } else if (percent < 0.4) {
            triggerHaptic('TICK');
            playSound('TICK');
        }
    },

    deal: () => {
        triggerHaptic('DEAL');
        playSound('DEAL');
    },

    chip: () => {
        triggerHaptic('CHIP');
        playSound('CHIP');
    },

    pressure: () => {
        triggerHaptic('PRESSURE');
        playSound('PRESSURE');
    },

    levelUp: () => {
        triggerHaptic('SUCCESS');
        playSound('LEVEL_UP');
        setTimeout(() => {
            triggerHaptic('STREAK');
            playSound('CORRECT');
        }, 200);
    },
};

/**
 * Screen effects controller
 */
export const screenEffects = {
    shake: (element, intensity = 'medium') => {
        const intensityMap = {
            light: 'shake-light',
            medium: 'shake-medium',
            heavy: 'shake-heavy',
        };
        const className = intensityMap[intensity] || 'shake-medium';
        element?.classList.add(className);
        setTimeout(() => element?.classList.remove(className), 500);
    },

    flash: (element, color = 'green') => {
        const colorMap = {
            green: 'flash-green',
            red: 'flash-red',
            gold: 'flash-gold',
        };
        const className = colorMap[color] || 'flash-green';
        element?.classList.add(className);
        setTimeout(() => element?.classList.remove(className), 300);
    },

    pulse: (element) => {
        element?.classList.add('pulse-effect');
        setTimeout(() => element?.classList.remove('pulse-effect'), 600);
    },
};

/**
 * CSS keyframes for effects (inject into page)
 */
export const EFFECT_STYLES = `
    @keyframes shakeLight {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
    }
    
    @keyframes shakeMedium {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-4px) rotate(-0.5deg); }
        40% { transform: translateX(4px) rotate(0.5deg); }
        60% { transform: translateX(-4px) rotate(-0.5deg); }
        80% { transform: translateX(4px) rotate(0.5deg); }
    }
    
    @keyframes shakeHeavy {
        0%, 100% { transform: translateX(0); }
        10% { transform: translateX(-8px) rotate(-1deg); }
        30% { transform: translateX(8px) rotate(1deg); }
        50% { transform: translateX(-8px) rotate(-1deg); }
        70% { transform: translateX(8px) rotate(1deg); }
        90% { transform: translateX(-4px) rotate(-0.5deg); }
    }
    
    @keyframes flashGreen {
        0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.8); }
        50% { box-shadow: 0 0 40px 20px rgba(76, 175, 80, 0.4); }
        100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
    }
    
    @keyframes flashRed {
        0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.8); }
        50% { box-shadow: 0 0 40px 20px rgba(229, 57, 53, 0.4); }
        100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
    }
    
    @keyframes flashGold {
        0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.8); }
        50% { box-shadow: 0 0 60px 30px rgba(255, 215, 0, 0.5); }
        100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
    }
    
    @keyframes pulseEffect {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
    
    @keyframes pressurePulse {
        0%, 100% { border-color: rgba(229, 57, 53, 0.5); }
        50% { border-color: rgba(229, 57, 53, 1); }
    }
    
    .shake-light { animation: shakeLight 0.5s ease-in-out; }
    .shake-medium { animation: shakeMedium 0.5s ease-in-out; }
    .shake-heavy { animation: shakeHeavy 0.5s ease-in-out; }
    .flash-green { animation: flashGreen 0.3s ease-out; }
    .flash-red { animation: flashRed 0.3s ease-out; }
    .flash-gold { animation: flashGold 0.4s ease-out; }
    .pulse-effect { animation: pulseEffect 0.6s ease-in-out; }
    .pressure-border { animation: pressurePulse 0.5s infinite; }
`;

export default feedback;
