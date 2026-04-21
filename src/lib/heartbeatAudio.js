/**
 * HEARTBEAT AUDIO — Reusable single-AudioContext heartbeat effect
 * Prevents creating 40+ AudioContext instances per game round.
 * Usage:
 *   import { playHeartbeat, closeHeartbeatAudio } from './heartbeatAudio';
 *   playHeartbeat(volume);         // play one pulse
 *   closeHeartbeatAudio();         // cleanup on unmount
 */

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[heartbeatAudio] AudioContext unavailable:', e);
            return null;
        }
    }
    // Resume if suspended (e.g. autoplay policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/**
 * Play a single heartbeat pulse using the shared AudioContext.
 * @param {number} volume - Volume level (0-1), typically 0.1-0.3
 */
export function playHeartbeat(volume = 0.2) {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 80;
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        // Oscillator self-cleans after stop — no leak
    } catch (e) {
        // Ignore individual pulse failures
    }
}

/**
 * Close the shared AudioContext on page unmount.
 * Safe to call multiple times.
 */
export function closeHeartbeatAudio() {
    if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
    audioCtx = null;
}
