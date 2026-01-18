import { Howl } from 'howler';

/**
 * Sound Manager - Centralized audio control for the landing page
 * Uses Howler.js for cross-browser audio support
 */
class SoundManager {
    constructor() {
        this.sounds = {
            buttonClick: new Howl({
                src: ['/sounds/button-click.mp3'],
                volume: 0.3,
                preload: true
            }),
            buttonHover: new Howl({
                src: ['/sounds/button-hover.mp3'],
                volume: 0.2,
                preload: true
            }),
            ctaClick: new Howl({
                src: ['/sounds/cta-success.mp3'],
                volume: 0.5,
                preload: true
            }),
            cardHover: new Howl({
                src: ['/sounds/card-hover.mp3'],
                volume: 0.15,
                preload: true
            }),
            pageLoad: new Howl({
                src: ['/sounds/ambient-casino.mp3'],
                volume: 0.1,
                loop: true,
                preload: true
            }),
        };

        this.enabled = true;
    }

    play(soundName) {
        if (this.enabled && this.sounds[soundName]) {
            this.sounds[soundName].play();
        }
    }

    stop(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName].stop();
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            // Stop all sounds
            Object.values(this.sounds).forEach(sound => sound.stop());
        }
    }
}

export const soundManager = new SoundManager();
