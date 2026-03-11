/**
 * PokerSoundManager — Audio system for poker game events
 * ═══════════════════════════════════════════════════════
 * 
 * Uses Web Audio API with synthesized sounds (no external files needed).
 * Falls back silently if audio is not available.
 * 
 * Sounds:
 *   deal      — Card being dealt
 *   check     — Tap on table
 *   call      — Chips sliding
 *   bet       — Chip drop
 *   raise     — Chip stack
 *   fold      — Card toss
 *   allIn     — Dramatic chip push
 *   win       — Victory chime
 *   lose      — Subtle tone
 *   yourTurn  — Alert notification
 *   timer     — Timer tick (last 5 seconds)
 *   chat      — Message blip
 *   bbj       — Jackpot fanfare
 */

export class PokerSoundManager {
  constructor() {
    this._enabled = true;
    this._volume = 0.4;
    this._ctx = null;
    this._initialized = false;
  }

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  setEnabled(enabled) { this._enabled = !!enabled; }
  setVolume(vol) { this._volume = Math.max(0, Math.min(1, vol)); }
  get enabled() { return this._enabled; }
  get volume() { return this._volume; }
  set muted(val) { this._enabled = !val; }
  get muted() { return !this._enabled; }

  /**
   * Play a sound by name
   */
  play(sound) {
    if (!this._enabled) return;
    const ctx = this._getCtx();
    if (!ctx) return;

    try {
      switch (sound) {
        case 'deal':       return this._playDeal(ctx);
        case 'check':      return this._playCheck(ctx);
        case 'call':       return this._playCall(ctx);
        case 'bet':        return this._playBet(ctx);
        case 'raise':      return this._playRaise(ctx);
        case 'fold':       return this._playFold(ctx);
        case 'allIn':      return this._playAllIn(ctx);
        case 'win':        return this._playWin(ctx);
        case 'lose':       return this._playLose(ctx);
        case 'yourTurn':   return this._playYourTurn(ctx);
        case 'timer':      return this._playTimer(ctx);
        case 'chat':       return this._playChat(ctx);
        case 'bbj':        return this._playBBJ(ctx);
        case 'showdown':   return this._playShowdown(ctx);
        case 'newHand':    return this._playNewHand(ctx);
        case 'potWon':     return this._playPotWon(ctx);
        // GOD-MODE SOUNDS
        case 'mystery_drumroll': return this._playMysteryDrumroll(ctx);
        case 'mystery_reveal': return this._playMysteryReveal(ctx);
        case 'jackpot_coins': return this._playJackpotCoins(ctx);
        default: break;
      }
    } catch (e) {
      // Fail silently
    }
  }

  // ── Sound generators (pure Web Audio synthesis) ──────

  _playDeal(ctx) {
    // Quick snap sound
    const noise = this._noiseBuffer(ctx, 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(this._volume * 0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    noise.connect(filter).connect(g).connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime + 0.06);
  }

  _playCheck(ctx) {
    // Two quick taps
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 800;
      osc.type = 'sine';
      g.gain.setValueAtTime(this._volume * 0.2, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.05);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.05);
    }
  }

  _playCall(ctx) {
    // Sliding chips
    const noise = this._noiseBuffer(ctx, 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(this._volume * 0.15, ctx.currentTime + 0.05);
    g.gain.linearRampToValueAtTime(this._volume * 0.1, ctx.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000;
    filter.Q.value = 1;
    noise.connect(filter).connect(g).connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime + 0.2);
  }

  _playBet(ctx) {
    // Single chip drop
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
    osc.type = 'sine';
    g.gain.setValueAtTime(this._volume * 0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.12);
  }

  _playRaise(ctx) {
    // Ascending chip stack
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 800 + i * 200;
      osc.type = 'sine';
      g.gain.setValueAtTime(this._volume * 0.2, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.08);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.08);
    }
  }

  _playFold(ctx) {
    // Card toss - short whoosh
    const noise = this._noiseBuffer(ctx, 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(this._volume * 0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
    noise.connect(filter).connect(g).connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime + 0.15);
  }

  _playAllIn(ctx) {
    // Dramatic chip push - low rumble + high snap
    const t = ctx.currentTime;
    // Low rumble
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.frequency.value = 120;
    osc1.type = 'sawtooth';
    g1.gain.setValueAtTime(this._volume * 0.15, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc1.connect(g1).connect(ctx.destination);
    osc1.start(t); osc1.stop(t + 0.3);
    // High snap
    const noise = this._noiseBuffer(ctx, 0.15);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(this._volume * 0.3, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(g2).connect(ctx.destination);
    noise.start(t + 0.05); noise.stop(t + 0.2);
  }

  _playWin(ctx) {
    // Victory chime - ascending triad
    const t = ctx.currentTime;
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      g.gain.setValueAtTime(this._volume * 0.2, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.4);
    });
  }

  _playLose(ctx) {
    // Subtle descending tone
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
    osc.type = 'sine';
    g.gain.setValueAtTime(this._volume * 0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  }

  _playYourTurn(ctx) {
    // Alert - two-tone notification
    const t = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      g.gain.setValueAtTime(this._volume * 0.25, t + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.15);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.15);
    });
  }

  _playTimer(ctx) {
    // Tick
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 1000;
    osc.type = 'sine';
    g.gain.setValueAtTime(this._volume * 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.05);
  }

  _playChat(ctx) {
    // Quick blip
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 1400;
    osc.type = 'sine';
    g.gain.setValueAtTime(this._volume * 0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.05);
  }

  _playShowdown(ctx) {
    // Drum roll feel
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const n = this._noiseBuffer(ctx, 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(this._volume * (0.1 + i * 0.03), t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.04);
      n.connect(g).connect(ctx.destination);
      n.start(t + i * 0.07); n.stop(t + i * 0.07 + 0.04);
    }
  }

  _playBBJ(ctx) {
    // Jackpot fanfare — ascending arpeggio
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319, 1568]; // C5 → G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      g.gain.setValueAtTime(this._volume * 0.25, t + i * 0.1);
      g.gain.linearRampToValueAtTime(this._volume * 0.15, t + i * 0.1 + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.6);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.6);
    });
  }

  _playNewHand(ctx) {
    // Rising sweep — a distinct "hand starting" sound
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    osc.type = 'sine';
    g.gain.setValueAtTime(this._volume * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.2);
    // Subtle click after sweep
    const click = this._noiseBuffer(ctx, 0.03);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(this._volume * 0.15, t + 0.12);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass'; cf.frequency.value = 3000;
    click.connect(cf).connect(cg).connect(ctx.destination);
    click.start(t + 0.12); click.stop(t + 0.15);
  }

  _playPotWon(ctx) {
    // Cash register jingle — ascending metallic chimes
    const t = ctx.currentTime;
    const notes = [880, 1109, 1319, 1760]; // A5, C#6, E6, A6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle';
      g.gain.setValueAtTime(this._volume * 0.18, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.35);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.35);
    });
    // Coin noise texture
    const noise = this._noiseBuffer(ctx, 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(this._volume * 0.05, t + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 6000; nf.Q.value = 3;
    noise.connect(nf).connect(ng).connect(ctx.destination);
    noise.start(t + 0.1); noise.stop(t + 0.5);
  }

  // ── GOD MODE: Mystery Bounty Sounds ──────────────────

  _playMysteryDrumroll(ctx) {
    // Suspenseful low rumble escalating over 1.2s
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 1.2);
    osc.type = 'sawtooth';
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(this._volume * 0.3, t + 0.8);
    g.gain.linearRampToValueAtTime(this._volume * 0.4, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.5);

    // Add noise texture
    const noise = this._noiseBuffer(ctx, 1.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.linearRampToValueAtTime(800, t + 1.2);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, t);
    nGain.gain.linearRampToValueAtTime(this._volume * 0.2, t + 1.2);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(t); noise.stop(t + 1.5);
  }

  _playMysteryReveal(ctx) {
    // Powerful swoosh / bright chord
    const t = ctx.currentTime;
    // Ascending major chord
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle';
      g.gain.setValueAtTime(0.001, t + (i * 0.05));
      g.gain.linearRampToValueAtTime(this._volume * 0.25, t + (i * 0.05) + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + (i * 0.05));
      osc.stop(t + 1.0);
    });
  }

  _playJackpotCoins(ctx) {
    // Massive coin shower — multiple high-pitched cascading chimes
    const t = ctx.currentTime;
    for (let i = 0; i < 25; i++) {
        const delay = Math.random() * 1.5; // Shower over 1.5 seconds
        const freq = 2000 + Math.random() * 4000; // High metallic frequencies
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.8, t + delay + 0.2); // slight bend
        g.gain.setValueAtTime(this._volume * (0.05 + Math.random() * 0.05), t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + (0.1 + Math.random() * 0.2));
        osc.connect(g).connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.3);
    }
  }

  // ── Utility ──────────────────────────────────────────

  _noiseBuffer(ctx, duration) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  dispose() {
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
  }
}

export default PokerSoundManager;
