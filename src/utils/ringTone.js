/**
 * PHONE RING TONE - Simple ring sound generator
 * Uses Web Audio API to create a phone ring tone
 */

export function createRingTone() {
    if (typeof window === 'undefined') return null;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    let audioContext = null;
    let oscillator = null;
    let gainNode = null;
    let isPlaying = false;
    let ringInterval = null;

    const start = () => {
        if (isPlaying) return;

        try {
            audioContext = new AudioContext();
            gainNode = audioContext.createGain();
            gainNode.connect(audioContext.destination);
            gainNode.gain.value = 0;

            isPlaying = true;

            // Ring pattern: 2 seconds on, 4 seconds off (US phone ring)
            const playRing = () => {
                if (!isPlaying) return;

                oscillator = audioContext.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.value = 440; // A4 note
                oscillator.connect(gainNode);
                oscillator.start();

                // Ring for 0.4 seconds, stop for 0.2, ring for 0.4 (double ring)
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.4);
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.6);
                gainNode.gain.setValueAtTime(0, audioContext.currentTime + 1.0);

                oscillator.stop(audioContext.currentTime + 1.1);
            };

            playRing();
            ringInterval = setInterval(playRing, 3000); // Repeat every 3 seconds

        } catch (e) {
            console.error('Ring tone error:', e);
        }
    };

    const stop = () => {
        isPlaying = false;
        if (ringInterval) {
            clearInterval(ringInterval);
            ringInterval = null;
        }
        if (oscillator) {
            try { oscillator.stop(); } catch (e) { }
        }
        if (audioContext) {
            try { audioContext.close(); } catch (e) { }
        }
    };

    return { start, stop };
}
