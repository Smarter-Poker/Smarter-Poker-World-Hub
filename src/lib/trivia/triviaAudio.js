/**
 * TRIVIA AUDIO ENGINE
 * All sounds synthesized via Web Audio API — zero MP3 files needed.
 * Mute state persisted to localStorage.
 */

let _ctx = null;
function getCtx() {
    if (typeof window === 'undefined') return null;
    if (!_ctx || _ctx.state === 'closed') {
        try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch { return null; }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    return _ctx;
}

// ══ Mute Toggle ══
// Single source of truth for "is trivia audio on". Pages that keep their own
// sound flag should delegate here (isMuted/setMuted) rather than maintaining
// a parallel switch, otherwise muting in one mode leaves another mode loud.
export const MUTE_KEY = 'trivia_audio_muted';
let _muted = false;
try { if (typeof window !== 'undefined') _muted = localStorage.getItem(MUTE_KEY) === 'true'; } catch (e) { console.warn('[App] Handled exception:', e); }

const _muteListeners = new Set();

function _emitMuteChange() {
    for (const fn of _muteListeners) {
        try { fn(_muted); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }
}

export function isMuted() { return _muted; }

/**
 * Set mute state explicitly (lets a settings checkbox bind directly).
 * @param {boolean} value
 * @returns {boolean} the new mute state
 */
export function setMuted(value) {
    const next = !!value;
    if (next === _muted) return _muted;
    _muted = next;
    try { localStorage.setItem(MUTE_KEY, String(_muted)); } catch (e) { console.warn('[App] Handled exception:', e); }
    _emitMuteChange();
    return _muted;
}

export function toggleMute() {
    return setMuted(!_muted);
}

/**
 * Subscribe to mute changes (including changes made in another tab).
 * @param {(muted: boolean) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onMuteChange(fn) {
    if (typeof fn !== 'function') return () => {};
    _muteListeners.add(fn);
    return () => _muteListeners.delete(fn);
}

// Keep mute state coherent across open tabs.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (!event || event.key !== MUTE_KEY) return;
        const next = event.newValue === 'true';
        if (next === _muted) return;
        _muted = next;
        _emitMuteChange();
    });
}

// ══ Core Synth Helpers ══
function playTone(freq, duration, type = 'sine', volume = 0.3) {
    if (_muted) return;
    const ctx = getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + duration);
}

// Noise buffer is generated once and replayed with an offset window.
// Previously every bustDrop/fireWhoosh allocated and filled a fresh
// sampleRate*duration Float32Array — real GC churn on the low-end mobile
// devices this UI is designed for.
const NOISE_BUFFER_SECONDS = 1;
let _noiseBuf = null;
let _noiseBufRate = 0;

function getNoiseBuffer(ctx) {
    if (_noiseBuf && _noiseBufRate === ctx.sampleRate) return _noiseBuf;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    _noiseBuf = buf;
    _noiseBufRate = ctx.sampleRate;
    return buf;
}

function playNoise(duration, volume = 0.15) {
    if (_muted) return;
    const ctx = getCtx(); if (!ctx) return;
    const buf = getNoiseBuffer(ctx);
    const safeDuration = Math.min(Math.max(duration || 0.1, 0.01), NOISE_BUFFER_SECONDS);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + safeDuration);
    src.connect(gain).connect(ctx.destination);
    // Random start offset keeps repeated hits from sounding identical.
    const offset = Math.random() * Math.max(0, NOISE_BUFFER_SECONDS - safeDuration);
    src.start(0, offset, safeDuration);
}

// ══ Game Sound Effects ══

/** Click — short percussive tap when selecting an answer */
export function chipClick() {
    playTone(800, 0.06, 'square', 0.15);
    playTone(1200, 0.04, 'sine', 0.1);
}

/** Correct — ascending 3-note major chime */
export function correctChime() {
    playTone(523, 0.15, 'sine', 0.25);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.25), 80);
    setTimeout(() => playTone(784, 0.25, 'sine', 0.3), 160);
}

/** Wrong — low descending buzz */
export function wrongBuzz() {
    playTone(200, 0.3, 'sawtooth', 0.2);
    setTimeout(() => playTone(150, 0.4, 'sawtooth', 0.15), 100);
}

/** Streak ding — pitch rises with combo level */
export function streakDing(comboLevel = 1) {
    const base = 600 + (comboLevel * 100);
    playTone(base, 0.1, 'sine', 0.3);
    setTimeout(() => playTone(base + 200, 0.15, 'sine', 0.3), 60);
    setTimeout(() => playTone(base + 400, 0.2, 'sine', 0.25), 120);
}

/** Fire mode activation whoosh */
export function fireWhoosh() {
    if (_muted) return;
    const ctx = getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
    playNoise(0.3, 0.1);
}

/** Cash out — slot machine ka-ching */
export function cashOutKaChing() {
    for (let i = 0; i < 6; i++) {
        setTimeout(() => playTone(2000 + i * 200, 0.08, 'sine', 0.2), i * 50);
    }
    setTimeout(() => playTone(3000, 0.4, 'sine', 0.3), 350);
}

/** Timer tick — subtle clock tick for urgency */
export function timerTick() {
    playTone(1000, 0.03, 'square', 0.12);
}

/** Bust / lose all — dramatic descending */
export function bustDrop() {
    playTone(400, 0.15, 'sawtooth', 0.3);
    setTimeout(() => playTone(300, 0.15, 'sawtooth', 0.25), 100);
    setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.2), 200);
    setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.15), 300);
    setTimeout(() => playNoise(0.3, 0.12), 350);
}

/** Countdown final beeps — 3...2...1... */
export function countdownBeep(secondsLeft) {
    const freq = secondsLeft <= 1 ? 1000 : 700;
    playTone(freq, 0.1, 'square', 0.25);
}

/** Victory fanfare — for perfect scores */
export function victoryFanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => {
        setTimeout(() => playTone(f, 0.2, 'sine', 0.25), i * 120);
    });
}

/** Card deal whoosh — new question slides in */
export function cardDealWhoosh() {
    if (_muted) return;
    const ctx = getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
}
