/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAINING SOUNDS — Audio feedback for GTO Training Arena
 * ═══════════════════════════════════════════════════════════════════════════
 */

class TrainingSounds {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        this.volume = 0.5;

        // Initialize audio context on user interaction
        if (typeof window !== 'undefined') {
            this.audioContext = null;
            this.initialized = false;
        }
    }

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init() {
        if (this.initialized || typeof window === 'undefined') return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            console.log('[TrainingSounds] Audio context initialized');
        } catch (error) {
            console.error('[TrainingSounds] Failed to initialize audio:', error);
        }
    }

    /**
     * Play a sound effect
     */
    play(soundName) {
        if (!this.enabled || !this.initialized) return;

        const soundConfig = this.getSoundConfig(soundName);
        if (!soundConfig) {
            console.warn(`[TrainingSounds] Unknown sound: ${soundName}`);
            return;
        }

        this.playTone(soundConfig);
    }

    /**
     * Get sound configuration
     */
    getSoundConfig(soundName) {
        const configs = {
            // Correct answer - triumphant chord
            correct: {
                frequencies: [523.25, 659.25, 783.99], // C5, E5, G5 (C major chord)
                duration: 0.3,
                type: 'sine'
            },

            // Incorrect answer - descending tone
            incorrect: {
                frequencies: [440, 392, 349.23], // A4, G4, F4
                duration: 0.4,
                type: 'sine'
            },

            // Level up - ascending arpeggio
            levelUp: {
                frequencies: [261.63, 329.63, 392, 523.25], // C4, E4, G4, C5
                duration: 0.2,
                type: 'triangle'
            },

            // Mastery achieved - victory fanfare
            mastery: {
                frequencies: [523.25, 659.25, 783.99, 1046.50], // C5, E5, G5, C6
                duration: 0.25,
                type: 'sine'
            },

            // Question loaded - subtle click
            questionLoad: {
                frequencies: [880], // A5
                duration: 0.05,
                type: 'square'
            },

            // Timer warning - urgent beep
            timerWarning: {
                frequencies: [1046.50, 1046.50], // C6 repeated
                duration: 0.15,
                type: 'square'
            },

            // Streak bonus - sparkle
            streak: {
                frequencies: [1318.51, 1567.98, 2093], // E6, G6, C7
                duration: 0.15,
                type: 'sine'
            }
        };

        return configs[soundName];
    }

    /**
     * Play a tone or sequence of tones
     */
    playTone(config) {
        if (!this.audioContext) return;

        const { frequencies, duration, type } = config;
        const now = this.audioContext.currentTime;

        frequencies.forEach((freq, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = type;
            oscillator.frequency.value = freq;

            // Envelope
            gainNode.gain.setValueAtTime(0, now + (index * duration));
            gainNode.gain.linearRampToValueAtTime(this.volume, now + (index * duration) + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + ((index + 1) * duration));

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.start(now + (index * duration));
            oscillator.stop(now + ((index + 1) * duration));
        });
    }

    /**
     * Enable/disable sounds
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled && !this.initialized) {
            this.init();
        }
    }

    /**
     * Set volume (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
}

// Export singleton instance
export const trainingSounds = new TrainingSounds();

// Auto-initialize on first user interaction
if (typeof window !== 'undefined') {
    const initOnInteraction = () => {
        trainingSounds.init();
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('keydown', initOnInteraction);
    };

    document.addEventListener('click', initOnInteraction);
    document.addEventListener('keydown', initOnInteraction);
}
