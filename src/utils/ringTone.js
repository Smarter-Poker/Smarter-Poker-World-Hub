/**
 * PHONE RING TONE - Soft beep-beep sound for outgoing calls
 * Uses Web Audio API to create a gentle, pleasant ring tone
 */

export function createRingTone() {
    if (typeof window === 'undefined') return null;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    let audioContext = null;
    let isPlaying = false;
    let ringInterval = null;

    const start = () => {
        if (isPlaying) return;

        try {
            audioContext = new AudioContext();
            isPlaying = true;

            // Soft beep-beep pattern
            const playBeep = () => {
                if (!isPlaying || !audioContext) return;

                // First beep
                const osc1 = audioContext.createOscillator();
                const gain1 = audioContext.createGain();
                osc1.connect(gain1);
                gain1.connect(audioContext.destination);

                osc1.type = 'sine';
                osc1.frequency.value = 800; // Higher, softer pitch
                gain1.gain.value = 0.15; // Quiet volume

                osc1.start(audioContext.currentTime);
                gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                osc1.stop(audioContext.currentTime + 0.15);

                // Second beep (after short pause)
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();
                osc2.connect(gain2);
                gain2.connect(audioContext.destination);

                osc2.type = 'sine';
                osc2.frequency.value = 800;
                gain2.gain.setValueAtTime(0.15, audioContext.currentTime + 0.25);

                osc2.start(audioContext.currentTime + 0.25);
                gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                osc2.stop(audioContext.currentTime + 0.4);
            };

            playBeep();
            ringInterval = setInterval(playBeep, 2000); // Repeat every 2 seconds

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
        if (audioContext) {
            try { audioContext.close(); } catch (e) { }
            audioContext = null;
        }
    };

    return { start, stop };
}
