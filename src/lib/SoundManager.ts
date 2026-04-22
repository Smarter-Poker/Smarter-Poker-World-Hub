/**
 * 🔊 SOUND MANAGER - Bulletproof Audio Engine
 * 
 * Safe audio playback that gracefully handles:
 * - Missing audio files (404 errors)
 * - Browser autoplay policies
 * - AudioContext suspension
 * - Desktop browsers without haptics
 * 
 * Key Principle: The game MUST remain playable even if ALL audio fails.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SOUND MANIFEST - Maps events to file paths
// ═══════════════════════════════════════════════════════════════════════════
export const SOUND_MANIFEST = {
    // Card actions
    CARD_DEAL: '/sounds/card_deal.mp3',
    CARD_FLIP: '/sounds/card_flip.mp3',

    // Chip actions
    CHIP_SLIDE: '/sounds/chip_slide.mp3',
    CHIP_STACK: '/sounds/chip_stack.mp3',
    POT_WIN: '/sounds/pot_win.mp3',

    // Player actions
    FOLD: '/sounds/fold.mp3',
    CHECK: '/sounds/check.mp3',
    CALL: '/sounds/call.mp3',
    RAISE: '/sounds/raise.mp3',
    ALL_IN: '/sounds/all_in.mp3',

    // Alerts
    TURN_ALERT: '/sounds/turn_ping.mp3',
    TIMER_TICK: '/sounds/tick.mp3',
    TIMER_WARNING: '/sounds/timer_warning.mp3',

    // Results
    SUCCESS: '/sounds/success_chime.mp3',
    ERROR: '/sounds/error_thud.mp3',
    LEVEL_UP: '/sounds/level_up.mp3',

    // UI
    BUTTON_CLICK: '/sounds/button_click.mp3',
    MODAL_OPEN: '/sounds/modal_open.mp3',
} as const;

export type SoundEvent = keyof typeof SOUND_MANIFEST;

// ═══════════════════════════════════════════════════════════════════════════
// SOUND MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════
export class SoundManager {
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private isUnlocked: boolean = false;
    private isMuted: boolean = false;
    private isInitialized: boolean = false;
    private failedSounds: Set<string> = new Set();

    constructor() {
        // Don't auto-initialize - wait for user interaction
    }

    /**
     * 🔓 UNLOCK AUDIO CONTEXT
     * Must be called from a user gesture (click/tap) to enable audio
     */
    async unlock(): Promise<void> {
        if (this.isUnlocked) return;

        try {
            // Create and play a silent audio to unlock AudioContext
            const silentAudio = new Audio();
            silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAQ==';
            silentAudio.volume = 0.01;

            await silentAudio.play();
            silentAudio.pause();

            this.isUnlocked = true;
            console.log('🔊 Audio unlocked successfully');

            // Now preload all sounds
            this.preloadAll();
        } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
    }

    /**
     * 📦 PRELOAD ALL SOUNDS
     * Attempts to load all sounds, but failures don't stop execution
     */
    private async preloadAll(): Promise<void> {
        if (this.isInitialized) return;

        const loadPromises = Object.entries(SOUND_MANIFEST || {}).map(async ([event, path]) => {
            try {
                const audio = new Audio();
                audio.preload = 'auto';

                // Create a promise that resolves when loaded or rejects on error
                await new Promise<void>((resolve, reject) => {
                    audio.oncanplaythrough = () => resolve();
                    audio.onerror = () => reject(new Error(`Failed to load: ${path}`));
                    audio.src = path;

                    // Timeout after 5 seconds
                    setTimeout(() => reject(new Error(`Timeout loading: ${path}`)), 5000);
                });

                this.audioCache.set(event, audio);
            } catch (error) {
                console.warn('[App] Handled exception:', error?.message || error);
                this.failedSounds.add(event);
            }
        });

        // Wait for all loads to complete (or fail gracefully)
        await Promise.allSettled(loadPromises);

        this.isInitialized = true;
        console.log(`🔊 Preloaded ${this.audioCache.size}/${Object.keys(SOUND_MANIFEST || {}).length} sounds`);
    }

    /**
     * ▶️ PLAY SOUND - Safe playback with pitch randomization
     */
    play(event: SoundEvent, options?: { pitch?: number; volume?: number }): void {
        // Early exit if muted or not unlocked
        if (this.isMuted || !this.isUnlocked) return;

        // Skip if this sound failed to load
        if (this.failedSounds.has(event)) return;

        try {
            const cachedAudio = this.audioCache.get(event);

            if (!cachedAudio) {
                // Sound not in cache - try to play directly (fallback)
                const path = SOUND_MANIFEST[event];
                if (!path) return;

                const audio = new Audio(path);
                audio.volume = options?.volume ?? 0.5;

                // Apply pitch (playbackRate)
                if (options?.pitch) {
                    audio.playbackRate = options.pitch;
                }

                audio.play().catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
                return;
            }

            // Clone the audio to allow overlapping plays
            const audio = cachedAudio.cloneNode() as HTMLAudioElement;
            audio.volume = options?.volume ?? 0.5;

            // Apply pitch randomization
            if (options?.pitch) {
                audio.playbackRate = options.pitch;
            }

            audio.play().catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
        } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
    }

    /**
     * 🃏 PLAY CARD DEAL with random pitch variation
     */
    playCardDeal(): void {
        const pitch = 0.9 + Math.random() * 0.2; // 0.9 - 1.1
        this.play('CARD_DEAL', { pitch, volume: 0.4 });
    }

    /**
     * 💰 PLAY CHIP SOUND with slight variation
     */
    playChipSlide(): void {
        const pitch = 0.95 + Math.random() * 0.1; // 0.95 - 1.05
        this.play('CHIP_SLIDE', { pitch, volume: 0.5 });
    }

    /**
     * 🔔 PLAY TURN ALERT (Hero's turn)
     */
    playTurnAlert(): void {
        this.play('TURN_ALERT', { volume: 0.3 });
    }

    /**
     * ✅ PLAY SUCCESS CHIME
     */
    playSuccess(): void {
        this.play('SUCCESS', { volume: 0.6 });
    }

    /**
     * ❌ PLAY ERROR THUD
     */
    playError(): void {
        this.play('ERROR', { volume: 0.5 });
    }

    /**
     * ⏱️ PLAY TIMER TICK
     */
    playTick(): void {
        this.play('TIMER_TICK', { volume: 0.2 });
    }

    /**
     * 🔇 SET MUTE STATE
     */
    setMuted(muted: boolean): void {
        this.isMuted = muted;
    }

    /**
     * 🔇 GET MUTE STATE
     */
    getMuted(): boolean {
        return this.isMuted;
    }

    /**
     * 🔄 TOGGLE MUTE
     */
    toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HAPTICS MANAGER - Safe vibration handling
// ═══════════════════════════════════════════════════════════════════════════
export class HapticsManager {
    private isSupported: boolean;

    constructor() {
        // Check if vibration is supported (mobile devices)
        this.isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    }

    /**
     * 📳 VIBRATE - Safe wrapper that checks support
     */
    private vibrate(pattern: number | number[]): void {
        if (!this.isSupported) return;

        try {
            navigator.vibrate(pattern);
        } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
    }

    /**
     * 👆 LIGHT TAP - For button presses
     */
    tap(): void {
        this.vibrate(5);
    }

    /**
     * 🎯 MEDIUM VIBRATION - For important events
     */
    medium(): void {
        this.vibrate(15);
    }

    /**
     * 💥 STRONG VIBRATION - For wins/major events
     */
    strong(): void {
        this.vibrate(30);
    }

    /**
     * ❌ ERROR PATTERN - Triple pulse for errors
     */
    error(): void {
        this.vibrate([50, 50, 50]);
    }

    /**
     * ✅ SUCCESS PATTERN - Rising pulse for success
     */
    success(): void {
        this.vibrate([20, 30, 40]);
    }

    /**
     * ⏱️ TICK - For timer countdown
     */
    tick(): void {
        this.vibrate(3);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCES
// ═══════════════════════════════════════════════════════════════════════════
let soundManagerInstance: SoundManager | null = null;
let hapticsManagerInstance: HapticsManager | null = null;

export function getSoundManager(): SoundManager {
    if (!soundManagerInstance) {
        soundManagerInstance = new SoundManager();
    }
    return soundManagerInstance;
}

export function getHapticsManager(): HapticsManager {
    if (!hapticsManagerInstance) {
        hapticsManagerInstance = new HapticsManager();
    }
    return hapticsManagerInstance;
}
