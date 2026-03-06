/**
 * TRIVIA AUDIO ENGINE
 * All sounds synthesized via Web Audio API — zero MP3 files needed.
 * Mute state persisted to localStorage.
 */

let _ctx = null;
function getCtx() {
    if (!_ctx || _ctx.state === 'closed') {
        try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch { return null; }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => { });
    return _ctx;
}

// ══ Mute Toggle ══
const MUTE_KEY = 'trivia_audio_muted';
let _muted = false;
try { _muted = localStorage.getItem(MUTE_KEY) === 'true'; } catch { }

export function isMuted() { return _muted; }
export function toggleMute() {
    _muted = !_muted;
    try { localStorage.setItem(MUTE_KEY, String(_muted)); } catch { }
    return _muted;
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

function playNoise(duration, volume = 0.15) {
    if (_muted) return;
    const ctx = getCtx(); if (!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(gain).connect(ctx.destination);
    src.start();
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
