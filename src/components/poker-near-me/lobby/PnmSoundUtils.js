/**
 * PNM Sound Utilities (Web Audio API)
 * Zero-latency, no external assets — pure oscillator synthesis
 * Extracted from poker-near-me-lobby.js for bundle splitting
 */

let _audioCtx = null;

/**
 * Lazily construct (and unlock) the shared AudioContext.
 *
 * [AUDIT] On Safari/iOS — and on Chrome before any user gesture is registered —
 * a freshly constructed AudioContext starts in state 'suspended'. Every
 * osc.start()/stop() then schedules against a clock that is not running, so
 * nothing is ever heard. All three play* helpers are invoked from click
 * handlers, which is exactly the moment a resume() is allowed to unlock audio,
 * so the resume happens here on every call.
 */
function getAudioCtx() {
  if (!_audioCtx && typeof AudioContext !== 'undefined') {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    // resume() returns a promise; failures (no user gesture yet) are non-fatal.
    try { _audioCtx.resume()?.catch?.(() => {}); } catch { /* ignore */ }
  }
  return _audioCtx;
}

/**
 * Release the shared AudioContext (e.g. on full teardown). Safe to call twice —
 * the next play* call lazily rebuilds it.
 */
export function closeAudioCtx() {
  if (!_audioCtx) return;
  try { _audioCtx.close()?.catch?.(() => {}); } catch { /* ignore */ }
  _audioCtx = null;
}

/** Short click feedback — descending 800→600 Hz sine */
export function playClickSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch { /* silent */ }
}

/** Panel open sound — ascending 400→900 Hz sine */
export function playPanelOpenSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* silent */ }
}

/** Panel close sound — descending 700→300 Hz sine */
export function playPanelCloseSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* silent */ }
}
