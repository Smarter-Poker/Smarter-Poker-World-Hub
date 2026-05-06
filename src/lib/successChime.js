/**
 * successChime — shared "you just succeeded" audio cue.
 *
 * iOS Safari requires that AudioContext is created or resumed inside a
 * user gesture; if you create it later (e.g. inside a setInterval callback
 * or after an async fetch), the context stays in 'suspended' state and
 * nothing plays.
 *
 * armSuccessChime()  — call inside the user-gesture handler that begins
 *                      an action that will later succeed (e.g. when the
 *                      user taps "Go Live"). Eagerly creates a global
 *                      AudioContext, plays a silent zero-gain oscillator
 *                      to "unlock" it, and resumes it if suspended.
 *                      Idempotent — safe to call multiple times.
 *
 * playSuccessChime() — call when the success actually happens (after the
 *                      async work returns). Reuses the unlocked context.
 *                      Fails silently when arm wasn't called or audio
 *                      isn't available — never blocks the UI.
 *
 * The tone is a rising C5→E5→G5 major triad — short, bright, ~500 ms.
 * Used by EndStreamModal (post-publish), and now by GoLiveModal when the
 * broadcast transitions from countdown → live.
 */

let globalAudioCtx = null;

export function armSuccessChime() {
    if (typeof window === 'undefined') return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!globalAudioCtx) {
            globalAudioCtx = new AC();
            // Silent zero-gain blip so iOS treats the context as "user-started"
            const osc = globalAudioCtx.createOscillator();
            const gain = globalAudioCtx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(globalAudioCtx.destination);
            osc.start();
            osc.stop(globalAudioCtx.currentTime + 0.01);
        }
        if (globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume().catch(() => {});
        }
    } catch (_) { /* never let audio break the app */ }
}

export function playSuccessChime() {
    if (typeof window === 'undefined') return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = globalAudioCtx || new AC();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, ctx.currentTime);       // C5
        osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime + 0.15);
        osc1.stop(ctx.currentTime + 0.5);
        osc2.stop(ctx.currentTime + 0.5);
        setTimeout(() => { if (ctx !== globalAudioCtx) { try { ctx.close(); } catch (_) {} } }, 600);
    } catch (_) { /* silent fallback */ }
}
