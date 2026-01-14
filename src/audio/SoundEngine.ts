/**
 * ═══════════════════════════════════════════════════════════════════════
 * SOUND ENGINE - Premium Audio System for Smarter.Poker
 * 
 * A comprehensive sound system for managing all app audio:
 * - Cinematic intro/outro
 * - UI sounds (clicks, hovers, selections)
 * - Notifications and rewards
 * - Video backgrounds
 * 
 * HOW TO ADD AUDIO:
 * 1. Download audio from Epidemic Sound
 * 2. Save to /public/audio/ folder
 * 3. Tell the agent: "Use [filename] for [slot name]"
 *    Example: "Use epic-reveal.mp3 for cinematicIntro"
 * 
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// AUDIO SLOT DEFINITIONS - Tell the agent which file goes in each slot
// ═══════════════════════════════════════════════════════════════════════

export interface AudioSlot {
    file: string | null;      // Filename in /public/audio/ (e.g., 'epic-hit.mp3')
    volume: number;           // 0.0 to 1.0
    description: string;      // What this sound is for
    preload: boolean;         // Whether to preload on app start
}

export const AUDIO_SLOTS: Record<string, AudioSlot> = {
    // ─────────────────────────────────────────────────────────────────
    // 🎬 CINEMATIC - Big moments, intro/outro, reveals
    // ─────────────────────────────────────────────────────────────────
    cinematicIntro: {
        file: 'main-intro.mp3',  // Main Intro from Epidemic Sound
        volume: 0.85,
        description: 'Epic intro sequence (2-4 seconds, logo reveal type)',
        preload: true
    },
    cinematicOutro: {
        file: null,
        volume: 0.7,
        description: 'Outro/goodbye sound when logging out',
        preload: false
    },
    videoBackground: {
        file: null,
        volume: 0.4,
        description: 'Ambient background music for video sections',
        preload: false
    },
    hubReturn: {
        file: null,  // <-- Add audio file later (e.g., 'whoosh-burst.mp3')
        volume: 0.7,
        description: 'Quick burst sound when returning to hub (1-2 seconds)',
        preload: false
    },

    // ─────────────────────────────────────────────────────────────────
    // 🖱️ UI INTERACTIONS - Clicks, hovers, navigation
    // ─────────────────────────────────────────────────────────────────
    buttonClick: {
        file: null,  // <- e.g., 'ui-click.mp3'
        volume: 0.5,
        description: 'Standard button click',
        preload: true
    },
    buttonHover: {
        file: null,
        volume: 0.2,
        description: 'Subtle hover sound',
        preload: true
    },
    cardSelect: {
        file: null,  // <- e.g., 'card-select.mp3'
        volume: 0.6,
        description: 'Selecting a card from the carousel',
        preload: true
    },
    cardHover: {
        file: null,
        volume: 0.25,
        description: 'Hovering over a card',
        preload: true
    },
    menuOpen: {
        file: null,
        volume: 0.5,
        description: 'Opening a menu or modal',
        preload: true
    },
    menuClose: {
        file: null,
        volume: 0.4,
        description: 'Closing a menu or modal',
        preload: true
    },
    navigate: {
        file: null,
        volume: 0.4,
        description: 'Page/section navigation transition',
        preload: true
    },

    // ─────────────────────────────────────────────────────────────────
    // 🔔 NOTIFICATIONS - Messages, alerts, updates
    // ─────────────────────────────────────────────────────────────────
    notification: {
        file: null,  // <- e.g., 'notification-pop.mp3'
        volume: 0.6,
        description: 'General notification sound',
        preload: true
    },
    messageReceived: {
        file: null,
        volume: 0.55,
        description: 'New message in messenger',
        preload: true
    },
    messageSent: {
        file: null,
        volume: 0.4,
        description: 'Message sent confirmation',
        preload: true
    },
    friendRequest: {
        file: null,
        volume: 0.6,
        description: 'Friend request received',
        preload: true
    },

    // ─────────────────────────────────────────────────────────────────
    // 💎 REWARDS - Achievements, diamonds, level ups
    // ─────────────────────────────────────────────────────────────────
    diamondEarned: {
        file: null,  // <- e.g., 'diamond-bling.mp3'
        volume: 0.7,
        description: 'Earning diamonds',
        preload: true
    },
    xpGain: {
        file: null,
        volume: 0.5,
        description: 'XP increment sound',
        preload: true
    },
    levelUp: {
        file: null,  // <- e.g., 'level-up-fanfare.mp3'
        volume: 0.85,
        description: 'Level up celebration',
        preload: false
    },
    achievementUnlocked: {
        file: null,
        volume: 0.75,
        description: 'Achievement unlocked',
        preload: false
    },
    dailyReward: {
        file: null,
        volume: 0.7,
        description: 'Daily reward claimed',
        preload: false
    },

    // ─────────────────────────────────────────────────────────────────
    // 🎮 GAMES - Training games, trivia, etc.
    // ─────────────────────────────────────────────────────────────────
    correctAnswer: {
        file: null,  // <- e.g., 'correct-ding.mp3'
        volume: 0.6,
        description: 'Correct answer in games',
        preload: true
    },
    wrongAnswer: {
        file: null,
        volume: 0.5,
        description: 'Wrong answer feedback',
        preload: true
    },
    gameStart: {
        file: null,
        volume: 0.6,
        description: 'Game starting',
        preload: false
    },
    gameWin: {
        file: null,
        volume: 0.8,
        description: 'Winning a game',
        preload: false
    },
    gameLose: {
        file: null,
        volume: 0.5,
        description: 'Losing a game',
        preload: false
    },
    timerTick: {
        file: null,
        volume: 0.25,
        description: 'Timer countdown tick',
        preload: true
    },
    timerWarning: {
        file: null,
        volume: 0.6,
        description: 'Low time warning',
        preload: true
    },

    // ─────────────────────────────────────────────────────────────────
    // ♠️ POKER SPECIFIC
    // ─────────────────────────────────────────────────────────────────
    chipStack: {
        file: null,
        volume: 0.5,
        description: 'Chips stacking/moving',
        preload: false
    },
    cardDeal: {
        file: null,
        volume: 0.4,
        description: 'Card dealing sound',
        preload: false
    },
    allIn: {
        file: null,
        volume: 0.7,
        description: 'All-in dramatic moment',
        preload: false
    }
};


// ═══════════════════════════════════════════════════════════════════════
// SOUND ENGINE CLASS - Manages audio playback
// ═══════════════════════════════════════════════════════════════════════

class SoundEngineClass {
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private masterVolume: number = 1.0;
    private muted: boolean = false;
    private initialized: boolean = false;

    /**
     * Initialize the sound engine - call once on app start
     * Preloads commonly used sounds for instant playback
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        console.log('[SoundEngine] Initializing...');

        // Preload all sounds marked for preloading
        const preloadPromises: Promise<void>[] = [];

        for (const [key, slot] of Object.entries(AUDIO_SLOTS)) {
            if (slot.file && slot.preload) {
                preloadPromises.push(this.preload(key));
            }
        }

        await Promise.all(preloadPromises);
        this.initialized = true;
        console.log('[SoundEngine] Ready ✓');
    }

    /**
     * Preload a sound for instant playback
     */
    private async preload(key: string): Promise<void> {
        const slot = AUDIO_SLOTS[key];
        if (!slot?.file) return;

        return new Promise((resolve) => {
            const audio = new Audio(`/audio/${slot.file}`);
            audio.preload = 'auto';
            audio.volume = slot.volume * this.masterVolume;

            audio.addEventListener('canplaythrough', () => {
                this.audioCache.set(key, audio);
                console.log(`[SoundEngine] Preloaded: ${key}`);
                resolve();
            }, { once: true });

            audio.addEventListener('error', () => {
                console.warn(`[SoundEngine] Failed to preload: ${key}`);
                resolve(); // Don't block on failed loads
            }, { once: true });
        });
    }

    /**
     * Play a sound by its slot name
     * Returns the Audio element for control (pause, etc.)
     */
    play(key: string, options?: { volume?: number; loop?: boolean }): HTMLAudioElement | null {
        if (this.muted) return null;

        const slot = AUDIO_SLOTS[key];
        if (!slot?.file) {
            console.log(`[SoundEngine] No file for: ${key}`);
            return null;
        }

        // Use cached audio if available
        let audio = this.audioCache.get(key);

        if (!audio) {
            // Create new audio element if not cached
            audio = new Audio(`/audio/${slot.file}`);
        } else {
            // Clone for overlapping plays
            audio = audio.cloneNode(true) as HTMLAudioElement;
        }

        const volume = (options?.volume ?? slot.volume) * this.masterVolume;
        audio.volume = Math.min(1, Math.max(0, volume));
        audio.loop = options?.loop ?? false;

        audio.play().catch(err => {
            console.warn(`[SoundEngine] Play failed for ${key}:`, err.message);
        });

        return audio;
    }

    /**
     * Play a sound once and forget about it
     */
    playOnce(key: string, volume?: number): void {
        this.play(key, { volume, loop: false });
    }

    /**
     * Set master volume (0.0 to 1.0)
     */
    setMasterVolume(volume: number): void {
        this.masterVolume = Math.min(1, Math.max(0, volume));
    }

    /**
     * Mute/unmute all sounds
     */
    setMuted(muted: boolean): void {
        this.muted = muted;
    }

    /**
     * Toggle mute state
     */
    toggleMute(): boolean {
        this.muted = !this.muted;
        return this.muted;
    }

    /**
     * Check if a sound slot has a file configured
     */
    hasSound(key: string): boolean {
        return !!AUDIO_SLOTS[key]?.file;
    }

    /**
     * Get all available sound slots (for debugging/admin)
     */
    getSlots(): Record<string, AudioSlot> {
        return AUDIO_SLOTS;
    }
}

// Singleton instance
export const SoundEngine = new SoundEngineClass();

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS - Quick access to common sounds
// ═══════════════════════════════════════════════════════════════════════

export const playClick = () => SoundEngine.playOnce('buttonClick');
export const playCardSelect = () => SoundEngine.playOnce('cardSelect');
export const playNotification = () => SoundEngine.playOnce('notification');
export const playDiamond = () => SoundEngine.playOnce('diamondEarned');
export const playCorrect = () => SoundEngine.playOnce('correctAnswer');
export const playWrong = () => SoundEngine.playOnce('wrongAnswer');
export const playIntro = () => SoundEngine.play('cinematicIntro');
