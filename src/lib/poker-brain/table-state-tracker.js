/**
 * Poker Brain — Table State Tracker
 * ===================================
 * Temporal stabilization layer for the auto-detection pipeline.
 *
 * Raw frame-by-frame detection is inherently noisy:
 *   - table bounds can jitter ±10px frame-to-frame as anti-alias pixels flip
 *   - stack-cluster player count can briefly drop to N-1 when a chat bubble
 *     covers a stack, then snap back
 *   - position can flicker between BTN and SB between animation frames
 *
 * This module smooths every field with a fit-for-purpose filter:
 *
 *   tableBounds   → exponential moving average (geometric stability)
 *   playerCount   → rolling-window mode (integer stability)
 *   gameVariant   → rolling-window mode (categorical stability)
 *   position      → sticky/agreement filter (commit only after N agreements)
 *   dealerPoint   → EMA (with outlier rejection)
 *   heroClusterId → sticky (stay locked once we're confident)
 *
 * Usage:
 *   const tracker = new TableStateTracker();
 *   // per frame:
 *   const stable = tracker.update({ tableBounds, playerCount, position,
 *                                   dealerPoint, gameVariant });
 *   // read stable.tableBounds, stable.playerCount, stable.position, ...
 *
 * The tracker also tracks "confidence" for each field (0..1) so the HUD
 * can fade in / out indicators when the detector is uncertain.
 */

// ─────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────

const BOUNDS_EMA_ALPHA = 0.35;   // new observation weight (higher = snappier)
const BOUNDS_MAX_JUMP_FRAC = 0.25; // reject obs that move center > 25% of w/h

const PLAYER_WINDOW = 8;         // frames of history for mode voting
const PLAYER_MIN_OBSERVED = 3;   // need ≥3 samples to commit a new value

const VARIANT_WINDOW = 6;
const VARIANT_MIN_OBSERVED = 3;

const POSITION_AGREEMENT = 3;    // frames in a row with same value to commit

const DEALER_EMA_ALPHA = 0.5;
const DEALER_MAX_JUMP_FRAC = 0.3; // frame-to-frame jump cap (fraction of bounds)

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

function mode(arr) {
  if (!arr || arr.length === 0) return null;
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) { bestCount = c; best = v; }
  }
  return { value: best, count: bestCount, total: arr.length };
}

function ema(prev, next, alpha) {
  if (prev == null) return next;
  if (next == null) return prev;
  return prev * (1 - alpha) + next * alpha;
}

function rectsOverlapEnough(a, b, minIoU = 0.5) {
  if (!a || !b) return false;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return false;
  const inter = (x2 - x1) * (y2 - y1);
  const aArea = a.w * a.h;
  const bArea = b.w * b.h;
  const union = aArea + bArea - inter;
  return union > 0 && inter / union >= minIoU;
}

// ─────────────────────────────────────────────────────────────────────
// Tracker
// ─────────────────────────────────────────────────────────────────────

export class TableStateTracker {
  constructor() {
    // Smoothed values
    this.bounds = null;           // { x, y, w, h }
    this.boundsConfidence = 0;
    this.boundsLastSeenAt = 0;

    this.playerHistory = [];      // ring buffer of ints
    this.playerCount = 0;
    this.playerConfidence = 0;

    this.variantHistory = [];
    this.variant = null;
    this.variantConfidence = 0;

    this.pendingPosition = null;
    this.pendingPositionStreak = 0;
    this.position = null;
    this.positionConfidence = 0;

    this.dealerPoint = null;      // { x, y }
    this.dealerConfidence = 0;

    this.frame = 0;
  }

  /**
   * Feed a new observation into the tracker and get the stabilized
   * values back. Any observation field may be null/undefined — the
   * tracker will retain its last stable value for that field.
   *
   * @param {object} obs
   * @param {object} [obs.tableBounds]  { x, y, w, h, confidence? }
   * @param {number} [obs.playerCount]
   * @param {string} [obs.position]     canonical label
   * @param {object} [obs.dealerPoint]  { x, y }
   * @param {string} [obs.variant]      'nlhe'/'plo'/'plo5'/'plo6'
   * @returns {object} stabilized state
   */
  update(obs = {}) {
    this.frame++;

    // ---- tableBounds: EMA with outlier rejection ---------------------
    if (obs.tableBounds && obs.tableBounds.w > 0 && obs.tableBounds.h > 0) {
      const cand = obs.tableBounds;
      if (this.bounds) {
        const pcx = this.bounds.x + this.bounds.w / 2;
        const pcy = this.bounds.y + this.bounds.h / 2;
        const ncx = cand.x + cand.w / 2;
        const ncy = cand.y + cand.h / 2;
        const dx = Math.abs(ncx - pcx);
        const dy = Math.abs(ncy - pcy);
        const tolX = this.bounds.w * BOUNDS_MAX_JUMP_FRAC;
        const tolY = this.bounds.h * BOUNDS_MAX_JUMP_FRAC;
        if (dx > tolX || dy > tolY) {
          // Large jump: accept if confidence is high, else ignore.
          if ((cand.confidence ?? 0) >= 0.7) {
            this.bounds = { x: cand.x, y: cand.y, w: cand.w, h: cand.h };
          }
        } else {
          this.bounds = {
            x: ema(this.bounds.x, cand.x, BOUNDS_EMA_ALPHA),
            y: ema(this.bounds.y, cand.y, BOUNDS_EMA_ALPHA),
            w: ema(this.bounds.w, cand.w, BOUNDS_EMA_ALPHA),
            h: ema(this.bounds.h, cand.h, BOUNDS_EMA_ALPHA),
          };
        }
      } else {
        this.bounds = { x: cand.x, y: cand.y, w: cand.w, h: cand.h };
      }
      this.boundsConfidence = Math.max(
        this.boundsConfidence * 0.9,
        cand.confidence ?? 0.5,
      );
      this.boundsLastSeenAt = this.frame;
    } else {
      // Decay confidence if we haven't seen the table recently
      const stale = this.frame - this.boundsLastSeenAt;
      if (stale > 8) this.boundsConfidence *= 0.85;
    }

    // ---- playerCount: rolling-window mode ----------------------------
    if (Number.isFinite(obs.playerCount) && obs.playerCount >= 2) {
      this.playerHistory.push(obs.playerCount);
      if (this.playerHistory.length > PLAYER_WINDOW) this.playerHistory.shift();
    }
    if (this.playerHistory.length >= PLAYER_MIN_OBSERVED) {
      const m = mode(this.playerHistory);
      if (m && m.count >= PLAYER_MIN_OBSERVED) {
        this.playerCount = m.value;
        this.playerConfidence = m.count / m.total;
      }
    }

    // ---- variant: rolling-window mode --------------------------------
    if (obs.variant) {
      this.variantHistory.push(obs.variant);
      if (this.variantHistory.length > VARIANT_WINDOW) this.variantHistory.shift();
    }
    if (this.variantHistory.length >= VARIANT_MIN_OBSERVED) {
      const m = mode(this.variantHistory);
      if (m && m.count >= VARIANT_MIN_OBSERVED) {
        this.variant = m.value;
        this.variantConfidence = m.count / m.total;
      }
    }

    // ---- position: sticky / agreement filter -------------------------
    if (obs.position && obs.position !== 'unknown') {
      if (obs.position === this.pendingPosition) {
        this.pendingPositionStreak++;
      } else {
        this.pendingPosition = obs.position;
        this.pendingPositionStreak = 1;
      }
      if (this.pendingPositionStreak >= POSITION_AGREEMENT) {
        this.position = this.pendingPosition;
        this.positionConfidence = Math.min(1, this.pendingPositionStreak / (POSITION_AGREEMENT * 2));
      }
    }

    // ---- dealerPoint: EMA with jump rejection ------------------------
    if (obs.dealerPoint &&
        Number.isFinite(obs.dealerPoint.x) &&
        Number.isFinite(obs.dealerPoint.y)) {
      if (this.dealerPoint && this.bounds) {
        const tolX = this.bounds.w * DEALER_MAX_JUMP_FRAC;
        const tolY = this.bounds.h * DEALER_MAX_JUMP_FRAC;
        const dx = Math.abs(obs.dealerPoint.x - this.dealerPoint.x);
        const dy = Math.abs(obs.dealerPoint.y - this.dealerPoint.y);
        if (dx <= tolX && dy <= tolY) {
          this.dealerPoint = {
            x: ema(this.dealerPoint.x, obs.dealerPoint.x, DEALER_EMA_ALPHA),
            y: ema(this.dealerPoint.y, obs.dealerPoint.y, DEALER_EMA_ALPHA),
          };
        } else {
          // Large jump — accept if confidence > 0.6 (dealer button moved)
          if ((obs.dealerConfidence ?? 0.6) >= 0.6) {
            this.dealerPoint = { ...obs.dealerPoint };
          }
        }
      } else {
        this.dealerPoint = { ...obs.dealerPoint };
      }
      this.dealerConfidence = Math.min(
        1,
        (this.dealerConfidence * 0.8) + 0.2,
      );
    } else {
      this.dealerConfidence *= 0.9;
    }

    return this.snapshot();
  }

  /** Current stable state — safe to re-read any time. */
  snapshot() {
    return {
      bounds: this.bounds ? {
        x: Math.round(this.bounds.x),
        y: Math.round(this.bounds.y),
        w: Math.round(this.bounds.w),
        h: Math.round(this.bounds.h),
      } : null,
      boundsConfidence: this.boundsConfidence,
      playerCount: this.playerCount,
      playerConfidence: this.playerConfidence,
      variant: this.variant,
      variantConfidence: this.variantConfidence,
      position: this.position,
      positionConfidence: this.positionConfidence,
      dealerPoint: this.dealerPoint ? {
        x: Math.round(this.dealerPoint.x),
        y: Math.round(this.dealerPoint.y),
      } : null,
      dealerConfidence: this.dealerConfidence,
      frame: this.frame,
    };
  }

  /** Hard reset — useful when the user switches tables or streams. */
  reset() {
    this.bounds = null;
    this.boundsConfidence = 0;
    this.boundsLastSeenAt = 0;
    this.playerHistory = [];
    this.playerCount = 0;
    this.playerConfidence = 0;
    this.variantHistory = [];
    this.variant = null;
    this.variantConfidence = 0;
    this.pendingPosition = null;
    this.pendingPositionStreak = 0;
    this.position = null;
    this.positionConfidence = 0;
    this.dealerPoint = null;
    this.dealerConfidence = 0;
    this.frame = 0;
  }
}

export default TableStateTracker;
