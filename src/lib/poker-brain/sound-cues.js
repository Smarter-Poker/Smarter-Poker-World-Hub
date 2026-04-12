/**
 * Poker Brain -- Sound Cues
 * =========================
 * Generates short notification sounds using the Web Audio API.
 * No external audio files needed — pure oscillator synthesis.
 *
 * Cue types:
 *   - handStart:    Quick ascending tone (new cards dealt)
 *   - streetChange:  Short double-beep (flop/turn/river)
 *   - actionReady:  Confident ping (decision is ready)
 *   - allIn:        Dramatic descending tone (all-in detected)
 *   - warning:      Low buzz (detection issue, stale OCR)
 *   - fold:         Soft down-tick
 *   - raise:        Sharp up-tick
 *
 * Usage:
 *   import { playCue, setVolume, setMuted } from './sound-cues';
 *   playCue('handStart');
 *   setVolume(0.5);  // 0-1
 *   setMuted(true);
 */

let audioCtx = null;
let masterGain = null;
let volume = 0.3;
let muted = false;

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(audioCtx.destination);
    } catch (_) {
      return null;
    }
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(frequency, duration, type = 'sine', rampDown = true) {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;

  if (rampDown) {
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playSequence(notes) {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  let offset = 0;
  for (const note of notes) {
    const { freq, dur, type = 'sine', delay = 0 } = note;
    offset += delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + dur);
    offset += dur;
  }
}

// ---- Cue Definitions ----

const CUE_DEFS = {
  handStart: () => {
    // Quick ascending two-note chirp
    playSequence([
      { freq: 660, dur: 0.08, type: 'sine' },
      { freq: 880, dur: 0.12, type: 'sine', delay: 0.02 },
    ]);
  },

  streetChange: () => {
    // Double beep
    playSequence([
      { freq: 523, dur: 0.06, type: 'square' },
      { freq: 523, dur: 0.06, type: 'square', delay: 0.06 },
    ]);
  },

  actionReady: () => {
    // Confident ascending ping
    playSequence([
      { freq: 784, dur: 0.06, type: 'sine' },
      { freq: 1047, dur: 0.15, type: 'sine', delay: 0.01 },
    ]);
  },

  allIn: () => {
    // Dramatic three-note descending
    playSequence([
      { freq: 880, dur: 0.1, type: 'sawtooth' },
      { freq: 660, dur: 0.1, type: 'sawtooth', delay: 0.02 },
      { freq: 440, dur: 0.2, type: 'sawtooth', delay: 0.02 },
    ]);
  },

  warning: () => {
    // Low buzz
    playTone(220, 0.3, 'square');
  },

  fold: () => {
    // Soft descending tick
    playSequence([
      { freq: 440, dur: 0.06, type: 'sine' },
      { freq: 330, dur: 0.08, type: 'sine', delay: 0.01 },
    ]);
  },

  raise: () => {
    // Sharp ascending tick
    playSequence([
      { freq: 660, dur: 0.05, type: 'triangle' },
      { freq: 990, dur: 0.08, type: 'triangle', delay: 0.01 },
    ]);
  },
};

// ---- Public API ----

/**
 * Play a named sound cue.
 * @param {'handStart'|'streetChange'|'actionReady'|'allIn'|'warning'|'fold'|'raise'} name
 */
export function playCue(name) {
  const fn = CUE_DEFS[name];
  if (fn) {
    try { fn(); } catch (_) { /* swallow audio errors */ }
  }
}

/**
 * Set master volume (0-1).
 */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (masterGain) {
    masterGain.gain.value = volume;
  }
}

/**
 * Get current volume.
 */
export function getVolume() {
  return volume;
}

/**
 * Toggle or set muted state.
 */
export function setMuted(m) {
  muted = !!m;
}

/**
 * Get muted state.
 */
export function isMuted() {
  return muted;
}

/**
 * Dispose audio context (cleanup).
 */
export function disposeSoundCues() {
  if (audioCtx) {
    try { audioCtx.close(); } catch (_) {}
    audioCtx = null;
    masterGain = null;
  }
}

export default { playCue, setVolume, getVolume, setMuted, isMuted, disposeSoundCues };
