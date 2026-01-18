/**
 * 🛡️ MOCK ASSET FACTORY - The Asset Safety Net
 * 
 * Ensures the game looks polished immediately without any "Broken Image" icons.
 * Integrates all fallback generators:
 * - SynthAudioEngine (Web Audio API sounds)
 * - CSSAvatar (Generative avatars)
 * - VectorCard (Pure CSS/SVG cards)
 */

import { synthAudio, type SynthSoundType } from './SynthAudioEngine';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AssetLoaderConfig {
    useFallbacks: boolean;
    audioEnabled: boolean;
    audioVolume: number;
    preloadAssets: boolean;
}

type AssetType = 'audio' | 'image' | 'avatar' | 'card' | 'icon';

interface AssetLoadResult {
    success: boolean;
    url: string | null;
    fallbackUsed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSET LOADER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class MockAssetFactory {
    private config: AssetLoaderConfig = {
        useFallbacks: true,
        audioEnabled: true,
        audioVolume: 0.5,
        preloadAssets: false
    };

    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private imageCache: Map<string, boolean> = new Map(); // true = loaded, false = failed
    private initialized: boolean = false;

    // ─────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────

    initialize(config?: Partial<AssetLoaderConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // Initialize synth audio
        synthAudio.initialize();
        synthAudio.setVolume(this.config.audioVolume);
        synthAudio.setEnabled(this.config.audioEnabled);

        this.initialized = true;
    }

    setAudioVolume(volume: number): void {
        this.config.audioVolume = volume;
        synthAudio.setVolume(volume);
    }

    setAudioEnabled(enabled: boolean): void {
        this.config.audioEnabled = enabled;
        synthAudio.setEnabled(enabled);
    }

    // ─────────────────────────────────────────────────────────────────────
    // AUDIO LOADING WITH FALLBACK
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Play a sound - tries to load MP3 first, falls back to synth if unavailable
     */
    playSound(soundName: string): void {
        if (!this.config.audioEnabled) return;

        // Map sound names to synth types
        const synthMapping: Record<string, SynthSoundType> = {
            'deck_shuffle_riffle': 'deal',
            'card_deal': 'deal',
            'card_flip': 'card_flip',
            'card_whip': 'deal',
            'card_whip_loud': 'deal',
            'chip_click': 'chips',
            'chip_single_click': 'chips',
            'chip_slide': 'chip_slide',
            'chips_toss': 'chips',
            'correct': 'success',
            'correct_ding': 'success',
            'error': 'error',
            'soft_error': 'error',
            'critical_error': 'error',
            'win': 'win',
            'level_complete': 'win',
            'lose': 'lose',
            'fold': 'error',
            'tick': 'tick',
            'countdown': 'countdown',
            'timer_warning': 'countdown',
            'hover': 'button_hover',
            'hover_tick': 'button_hover',
            'click': 'button_click',
            'button_click': 'button_click',
            'action_start': 'notification',
            'notification': 'notification',
            'deal_cards': 'deal'
        };

        const synthType = synthMapping[soundName];

        // Try to play cached audio
        if (this.audioCache.has(soundName)) {
            const audio = this.audioCache.get(soundName)!;
            audio.currentTime = 0;
            audio.volume = this.config.audioVolume;
            audio.play().catch(() => {
                // If playback fails, use synth
                if (synthType) synthAudio.play(synthType);
            });
            return;
        }

        // Try to load the audio file
        const possiblePaths = [
            `/audio/${soundName}.mp3`,
            `/sounds/${soundName}.mp3`,
            `/assets/audio/${soundName}.mp3`
        ];

        // Attempt to load from first path
        const audio = new Audio(possiblePaths[0]);
        audio.volume = this.config.audioVolume;

        audio.addEventListener('canplaythrough', () => {
            this.audioCache.set(soundName, audio);
            audio.play().catch(() => { });
        }, { once: true });

        audio.addEventListener('error', () => {
            // File not found - use synth fallback
            if (this.config.useFallbacks && synthType) {
                synthAudio.play(synthType);
            }
        }, { once: true });

        audio.load();

        // Play synth immediately for responsiveness
        // (audio file will be cached for next time)
        if (this.config.useFallbacks && synthType) {
            synthAudio.play(synthType);
        }
    }

    /**
     * Preload an audio file (non-blocking)
     */
    preloadAudio(soundName: string): void {
        if (this.audioCache.has(soundName)) return;

        const audio = new Audio(`/audio/${soundName}.mp3`);
        audio.addEventListener('canplaythrough', () => {
            this.audioCache.set(soundName, audio);
        }, { once: true });
        audio.load();
    }

    // ─────────────────────────────────────────────────────────────────────
    // IMAGE LOADING WITH FALLBACK DETECTION
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Check if an image URL is loadable
     */
    async checkImageExists(url: string): Promise<boolean> {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url)!;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.imageCache.set(url, true);
                resolve(true);
            };
            img.onerror = () => {
                this.imageCache.set(url, false);
                resolve(false);
            };
            img.src = url;
        });
    }

    /**
     * Get avatar URL with fallback detection
     */
    async getAvatarUrl(avatarId: string): Promise<AssetLoadResult> {
        const possiblePaths = [
            `/avatars/${avatarId}.png`,
            `/images/avatars/${avatarId}.png`,
            `/assets/avatars/${avatarId}.png`
        ];

        for (const path of possiblePaths) {
            if (await this.checkImageExists(path)) {
                return { success: true, url: path, fallbackUsed: false };
            }
        }

        // Return null - component should use CSSAvatar
        return { success: false, url: null, fallbackUsed: true };
    }

    /**
     * Get card sprite URL with fallback detection
     */
    async getCardSpriteUrl(): Promise<AssetLoadResult> {
        const possiblePaths = [
            '/cards/deck_sprite.png',
            '/images/cards/deck.png',
            '/assets/cards/sprite.png'
        ];

        for (const path of possiblePaths) {
            if (await this.checkImageExists(path)) {
                return { success: true, url: path, fallbackUsed: false };
            }
        }

        // Return null - component should use VectorCard
        return { success: false, url: null, fallbackUsed: true };
    }

    // ─────────────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Clear all cached assets
     */
    clearCache(): void {
        this.audioCache.clear();
        this.imageCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { audioCount: number; imageCount: number } {
        return {
            audioCount: this.audioCache.size,
            imageCount: this.imageCache.size
        };
    }

    /**
     * Check if factory is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const assetFactory = new MockAssetFactory();

// ═══════════════════════════════════════════════════════════════════════════
// REACT HOOK
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useCallback } from 'react';

interface UseAssetFactoryOptions {
    audioVolume?: number;
    audioEnabled?: boolean;
}

export function useAssetFactory(options: UseAssetFactoryOptions = {}) {
    useEffect(() => {
        assetFactory.initialize({
            audioVolume: options.audioVolume ?? 0.5,
            audioEnabled: options.audioEnabled ?? true
        });
    }, [options.audioVolume, options.audioEnabled]);

    const playSound = useCallback((soundName: string) => {
        assetFactory.playSound(soundName);
    }, []);

    const checkImage = useCallback((url: string) => {
        return assetFactory.checkImageExists(url);
    }, []);

    return {
        playSound,
        checkImage,
        setVolume: assetFactory.setAudioVolume.bind(assetFactory),
        setAudioEnabled: assetFactory.setAudioEnabled.bind(assetFactory)
    };
}

export default MockAssetFactory;
