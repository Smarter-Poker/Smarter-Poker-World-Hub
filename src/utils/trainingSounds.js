import { Howl } from 'howler';

/**
 * Training Sound Manager
 * Centralized audio control for training hub interactions
 */
class TrainingSoundManager {
    constructor() {
        this.sounds = {
            gameClick: new Howl({
                src: ['/sounds/game-click.mp3'],
                volume: 0.4,
                preload: true
            }),
            filterSwitch: new Howl({
                src: ['/sounds/filter-switch.mp3'],
                volume: 0.3,
                preload: true
            }),
            mastery: new Howl({
                src: ['/sounds/mastery-fanfare.mp3'],
                volume: 0.6,
                preload: true
            }),
            levelUp: new Howl({
                src: ['/sounds/level-up.mp3'],
                volume: 0.5,
                preload: true
            }),
            cardHover: new Howl({
                src: ['/sounds/card-hover.mp3'],
                volume: 0.2,
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

export const trainingSounds = new TrainingSoundManager();
