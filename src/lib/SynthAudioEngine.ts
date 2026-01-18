/**
 * 🔊 SYNTH AUDIO ENGINE - No MP3s Needed
 * 
 * Web Audio API synthesizer for all game sounds.
 * Generates sounds programmatically when audio files fail to load.
 * 
 * Sound Types:
 * - Deal: White noise burst (paper friction)
 * - Chips: Click (800Hz sine wave)
 * - Error: Low buzz (150Hz sawtooth)
 * - Win: Major arpeggio (chime)
 */

export type SynthSoundType =
    | 'deal'
    | 'card_flip'
    | 'chips'
    | 'chip_slide'
    | 'error'
    | 'success'
    | 'win'
    | 'lose'
    | 'tick'
    | 'countdown'
    | 'button_hover'
    | 'button_click'
    | 'notification';

interface SynthAudioConfig {
    masterVolume: number;
    enabled: boolean;
}

class SynthAudioEngine {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private config: SynthAudioConfig = {
        masterVolume: 0.5,
        enabled: true
    };

    // Initialize audio context (must be called after user interaction)
    initialize(): boolean {
        if (this.audioContext) return true;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.config.masterVolume;
            this.masterGain.connect(this.audioContext.destination);
            return true;
        } catch (e) {
            console.warn('SynthAudioEngine: Web Audio API not available');
            return false;
        }
    }

    setVolume(volume: number): void {
        this.config.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.config.masterVolume;
        }
    }

    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
    }

    // ═══════════════════════════════════════════════════════════════════
    // SOUND GENERATORS
    // ═══════════════════════════════════════════════════════════════════

    play(type: SynthSoundType): void {
        if (!this.config.enabled) return;
        if (!this.audioContext) this.initialize();
        if (!this.audioContext || !this.masterGain) return;

        // Resume context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        switch (type) {
            case 'deal':
            case 'card_flip':
                this.playWhiteNoiseBurst();
                break;
            case 'chips':
            case 'chip_slide':
                this.playChipClick();
                break;
            case 'error':
            case 'lose':
                this.playErrorBuzz();
                break;
            case 'success':
                this.playSuccessChime();
                break;
            case 'win':
                this.playWinArpeggio();
                break;
            case 'tick':
            case 'countdown':
                this.playTick();
                break;
            case 'button_hover':
                this.playButtonHover();
                break;
            case 'button_click':
                this.playButtonClick();
                break;
            case 'notification':
                this.playNotification();
                break;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // DEAL SOUND: White Noise Burst (Paper Friction)
    // ─────────────────────────────────────────────────────────────────
    private playWhiteNoiseBurst(): void {
        const ctx = this.audioContext!;
        const duration = 0.08;

        // Create white noise buffer
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Bandpass filter for paper-like sound
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3000;
        filter.Q.value = 0.5;

        // Envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialDecayTo?.(0.01, ctx.currentTime + duration) ||
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        noise.start();
        noise.stop(ctx.currentTime + duration);
    }

    // ─────────────────────────────────────────────────────────────────
    // CHIP CLICK: High-pitched Click (800Hz Sine)
    // ─────────────────────────────────────────────────────────────────
    private playChipClick(): void {
        const ctx = this.audioContext!;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    }

    // ─────────────────────────────────────────────────────────────────
    // ERROR BUZZ: Low Buzz (150Hz Sawtooth)
    // ─────────────────────────────────────────────────────────────────
    private playErrorBuzz(): void {
        const ctx = this.audioContext!;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 150;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

        // Low pass filter for less harshness
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }

    // ─────────────────────────────────────────────────────────────────
    // SUCCESS CHIME: Simple Two-Note Chime
    // ─────────────────────────────────────────────────────────────────
    private playSuccessChime(): void {
        const ctx = this.audioContext!;
        const notes = [523.25, 659.25]; // C5, E5 (major third)

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const startTime = ctx.currentTime + (i * 0.1);
            gain.gain.setValueAtTime(0.25, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // WIN ARPEGGIO: Major Chord Arpeggio
    // ─────────────────────────────────────────────────────────────────
    private playWinArpeggio(): void {
        const ctx = this.audioContext!;
        // C major arpeggio: C5, E5, G5, C6
        const notes = [523.25, 659.25, 783.99, 1046.50];

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const startTime = ctx.currentTime + (i * 0.08);
            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);

            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.start(startTime);
            osc.stop(startTime + 0.5);
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // TICK: Short Click
    // ─────────────────────────────────────────────────────────────────
    private playTick(): void {
        const ctx = this.audioContext!;

        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 1200;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start();
        osc.stop(ctx.currentTime + 0.02);
    }

    // ─────────────────────────────────────────────────────────────────
    // BUTTON SOUNDS
    // ─────────────────────────────────────────────────────────────────
    private playButtonHover(): void {
        const ctx = this.audioContext!;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 2000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start();
        osc.stop(ctx.currentTime + 0.03);
    }

    private playButtonClick(): void {
        const ctx = this.audioContext!;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    }

    private playNotification(): void {
        const ctx = this.audioContext!;
        const notes = [880, 1108.73]; // A5, C#6

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const startTime = ctx.currentTime + (i * 0.15);
            gain.gain.setValueAtTime(0.15, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

            osc.connect(gain);
            gain.connect(this.masterGain!);

            osc.start(startTime);
            osc.stop(startTime + 0.2);
        });
    }
}

// Singleton instance
export const synthAudio = new SynthAudioEngine();

export default SynthAudioEngine;
