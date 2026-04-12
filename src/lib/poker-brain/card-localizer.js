/**
 * Poker Brain — Card Region Localizer (v3, fully self-calibrating)
 * ==================================================================
 * Finds WHERE the hero hole cards and the community board cards are
 * in each frame, without any pre-calibrated layout.json data.
 *
 * Design goals (v3 rewrite)
 * --------------------------
 *   • Zero calibration — works out of the box on any PokerBros frame
 *   • Adaptive — mask thresholds are derived from the frame histogram,
 *     not hardcoded, so it survives different themes / dark modes
 *   • Self-discovering — if the hero fan isn't in the expected quadrant
 *     we search the whole bottom half instead of failing
 *   • Fan-aware — uses dark-gap detection between fanned cards to slice
 *     hero regions at actual card boundaries instead of uniform cuts
 *   • Holdem-aware — 2 non-fanned cards side-by-side get a different
 *     (component-based) path than PLO fans
 *   • Multi-variant — auto-adapts to 2 / 4 / 5 / 6 hole cards
 *   • Confidence-scored — returns a 0..1 score for each region so the
 *     HUD can know when the localizer is uncertain and fall back
 *   • Cheap — ~1-3ms per frame on downscaled 320px frames
 *
 * Ground-truth measurements (from 5 real PokerBros 1080x2400 frames)
 * ------------------------------------------------------------------
 *   NLH  (J♥5♦)      hero: y 0.850..0.940, x 0.68..0.91  (2 cards)
 *   PLO4 (J♣9♦8♣4♣)  hero: y 0.855..0.948, x 0.59..0.97  (4 cards)
 *   PLO5 SB          hero: y 0.810..0.905, x 0.59..0.98  (5 cards)
 *   PLO6             hero: y 0.810..0.890, x 0.60..0.98  (6 cards)
 *   PLO5 BB          hero: y 0.860..0.948, x 0.58..0.98  (5 cards)
 *
 * The "New"/"SB"/"BB" player-badge bubbles above the hero avatar
 * intrude as far right as x frac 0.58 (Holdem), so HERO_X_MIN_FRAC is
 * set to 0.59 to guarantee we never capture badge pixels in the hero
 * bbox regardless of variant.
 *
 * These observations drove the constants below; the algorithm itself is
 * robust to ~10% variation in each direction.
 *
 * Pipeline
 * --------
 *   1. Downscale to ~320px wide for speed
 *   2. Build adaptive cardness mask from histogram (bright + low-sat)
 *   3. HERO PASS:
 *        a. Try bottom-right quadrant bbox
 *        b. If empty, try bottom half (discovery mode)
 *        c. Refine bbox with dark-column gap detection for fan slicing
 *        d. If expected=2 (holdem), use connected-component slicing
 *        e. Confidence from fill ratio + aspect sanity
 *   4. BOARD PASS:
 *        a. Center-top strip bbox
 *        b. Count cards from width / height × aspect ratio
 *        c. Uniform slice (non-fanned) or gap-based slice
 *        d. Confidence from contiguity of cardy columns
 *   5. Scale regions back to source pixels
 *
 * Output contract (compatible with layout.json regions):
 *   {
 *     holeRegions:  [{x,y,w,h}],
 *     boardRegions: [{x,y,w,h}],
 *     holeConfidence:  0..1,
 *     boardConfidence: 0..1,
 *     heroStrip, boardStrip,   // downscaled-space debug info
 *     timingMs: number,
 *     debug: object,
 *   }
 */

// ═══════════════════════════════════════════════════════════════════════
// Tunables
// ═══════════════════════════════════════════════════════════════════════

const DOWNSCALE_MAX_W = 320;

// Fallback fixed thresholds if histogram derivation fails
const LUM_THRESHOLD_FALLBACK = 195;
const SAT_THRESHOLD = 0.38;

// Hero primary quadrant (PokerBros bottom-right) — tuned to all 5 reference
// frames. x_min=0.59 keeps the "New"/"SB"/"BB" avatar badges out of the bbox.
// y_max=0.955 stays above the Fold/Check/Raise button strip.
const HERO_X_MIN_FRAC = 0.59;
const HERO_X_MAX_FRAC = 1.00;
const HERO_Y_MIN_FRAC = 0.78;
const HERO_Y_MAX_FRAC = 0.955;

// Discovery quadrant (fall back if primary finds nothing — e.g. different
// poker client or unusual aspect ratio). Searches the whole bottom 25%.
const HERO_DISCOVERY_X_MIN = 0.20;
const HERO_DISCOVERY_X_MAX = 1.00;
const HERO_DISCOVERY_Y_MIN = 0.74;
const HERO_DISCOVERY_Y_MAX = 0.97;

// Board strip (middle of felt, ABOVE the "PLOn Hi" / "CLASSIC PLOn" label
// which sits around y frac 0.50-0.57 and could be mistaken for cards if the
// mask is permissive). Cap y_max at 0.48 to stay safely above it.
const BOARD_X_MIN_FRAC = 0.12;
const BOARD_X_MAX_FRAC = 0.88;
const BOARD_Y_MIN_FRAC = 0.26;
const BOARD_Y_MAX_FRAC = 0.48;

// Bbox shape validation (downscaled space)
const MIN_CARDY_PIXELS = 60;
const MIN_STRIP_W_FRAC = 0.055;
const MIN_STRIP_H_FRAC = 0.022;
const MAX_STRIP_H_FRAC = 0.20;

// PokerBros card aspect (h / w) — used to estimate board card count
const TYPICAL_CARD_H_OVER_W = 1.46;

// Holdem mode: require exactly 2 connected components for hero, else
// fall back to strip slice
const HOLDEM_MIN_COMPONENT_AREA = 20;

// ═══════════════════════════════════════════════════════════════════════
// Stage 1 — downscale + adaptive mask
// ═══════════════════════════════════════════════════════════════════════

// Module-level cached canvas for getDownscaledImage — avoids ~1 canvas alloc/sec
let _clCanvas = null;
let _clCtx = null;

/**
 * Downscale a source (video/canvas/image) into a working canvas. If a
 * `tableBounds` rectangle is provided (in source pixel coords), crop to
 * just that region before downscaling — so all subsequent fractional
 * computations are relative to the table, not the full capture frame.
 *
 * Returns the downscaled imageData + the offsets needed to map back to
 * source pixel coordinates (including the crop origin).
 */
function getDownscaledImage(source, tableBounds) {
  const frameW = source.videoWidth || source.width || source.naturalWidth;
  const frameH = source.videoHeight || source.height || source.naturalHeight;
  if (!frameW || !frameH) return null;

  // Crop ROI (if provided) clamped to the source frame
  let roiX = 0;
  let roiY = 0;
  let roiW = frameW;
  let roiH = frameH;
  if (tableBounds && tableBounds.w > 0 && tableBounds.h > 0) {
    roiX = Math.max(0, Math.min(frameW - 1, Math.round(tableBounds.x)));
    roiY = Math.max(0, Math.min(frameH - 1, Math.round(tableBounds.y)));
    roiW = Math.max(1, Math.min(frameW - roiX, Math.round(tableBounds.w)));
    roiH = Math.max(1, Math.min(frameH - roiY, Math.round(tableBounds.h)));
  }

  const scale = Math.min(1, DOWNSCALE_MAX_W / roiW);
  const dw = Math.max(1, Math.round(roiW * scale));
  const dh = Math.max(1, Math.round(roiH * scale));

  if (!_clCanvas) {
    _clCanvas = document.createElement('canvas');
    _clCtx = _clCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (_clCanvas.width !== dw || _clCanvas.height !== dh) {
    _clCanvas.width = dw;
    _clCanvas.height = dh;
    _clCtx = _clCanvas.getContext('2d', { willReadFrequently: true });
  }
  // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) crops + scales in 1 op
  _clCtx.drawImage(source, roiX, roiY, roiW, roiH, 0, 0, dw, dh);
  const imageData = _clCtx.getImageData(0, 0, dw, dh);

  return {
    imageData,
    scaleBackX: roiW / dw,
    scaleBackY: roiH / dh,
    roiX,
    roiY,
    srcW: frameW,
    srcH: frameH,
    roiW,
    roiH,
  };
}

/**
 * Derive an adaptive luminance threshold from the frame histogram. Card
 * faces are the BRIGHTEST large continuous region on a PokerBros frame;
 * we pick a threshold at the ~92nd percentile of the luminance
 * distribution so the mask always catches them regardless of whether
 * the theme is light or dark.
 *
 * Clamped to [160, 225] to avoid catastrophic failure on unusual frames.
 */
function adaptiveLumThreshold(imageData) {
  const { data } = imageData;
  const hist = new Uint32Array(256);
  let total = 0;
  // Sample every 4th pixel for speed (quality of percentile unaffected)
  for (let i = 0; i < data.length; i += 16) {
    const lum = Math.floor(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114,
    );
    hist[Math.min(255, Math.max(0, lum))]++;
    total++;
  }
  const target = Math.floor(total * 0.92);
  let cum = 0;
  for (let b = 0; b < 256; b++) {
    cum += hist[b];
    if (cum >= target) {
      return Math.min(225, Math.max(160, b));
    }
  }
  return LUM_THRESHOLD_FALLBACK;
}

/**
 * Build a "cardness" mask: 1 if pixel is bright + low-saturation
 * (consistent with a white card face), 0 otherwise.
 */
function computeCardMask(imageData, lumThreshold) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum < lumThreshold) continue;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    if (sat > SAT_THRESHOLD) continue;
    mask[p] = 1;
  }
  return mask;
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 2 — bbox extraction inside a fractional region-of-interest
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find the tightest bounding box around all cardy pixels within a
 * fractional ROI. Returns null if fewer than minPixels cardy pixels
 * are present OR the bbox fails size sanity checks.
 */
function cardyBBoxInRegion(mask, dW, dH, xMin, xMax, yMin, yMax, minPixels) {
  const x0 = Math.max(0, Math.floor(dW * xMin));
  const x1 = Math.min(dW, Math.ceil(dW * xMax));
  const y0 = Math.max(0, Math.floor(dH * yMin));
  const y1 = Math.min(dH, Math.ceil(dH * yMax));
  if (x1 <= x0 || y1 <= y0) return null;

  let minX = x1;
  let maxX = x0 - 1;
  let minY = y1;
  let maxY = y0 - 1;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    const row = y * dW;
    for (let x = x0; x < x1; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count < minPixels || maxX < minX || maxY < minY) return null;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  if (w < Math.floor(dW * MIN_STRIP_W_FRAC)) return null;
  if (h < Math.floor(dH * MIN_STRIP_H_FRAC)) return null;
  if (h > Math.floor(dH * MAX_STRIP_H_FRAC)) return null;

  return { x: minX, y: minY, w, h, count };
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 3 — gap-aware slicing (finds actual card boundaries inside fan)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute per-column cardy density inside a bbox. Returns a Float32Array
 * of length strip.w where entry[i] = fraction of rows at column (strip.x+i)
 * that are cardy.
 */
function columnDensity(mask, dW, strip) {
  const out = new Float32Array(strip.w);
  for (let dx = 0; dx < strip.w; dx++) {
    let count = 0;
    const x = strip.x + dx;
    for (let y = strip.y; y < strip.y + strip.h; y++) {
      if (mask[y * dW + x]) count++;
    }
    out[dx] = count / strip.h;
  }
  return out;
}

/**
 * Smooth a 1D signal with a simple 3-tap box filter. Reduces noise in
 * the column density before gap detection.
 */
function smooth1D(sig) {
  const n = sig.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? sig[i - 1] : sig[i];
    const b = sig[i];
    const c = i < n - 1 ? sig[i + 1] : sig[i];
    out[i] = (a + b + c) / 3;
  }
  return out;
}

/**
 * Given a column-density signal inside a fan strip, find the N-1 local
 * minima that correspond to the thin dark gaps BETWEEN fanned cards.
 * Returns sorted x-offsets relative to the strip start.
 *
 * Strategy: divide the strip into N rough segments, then in each interior
 * boundary window pick the column with the LOWEST density. This gives
 * robust slicing even when gaps aren't perfectly uniform (e.g. last card
 * has wider visible area).
 */
function findCardGapCuts(density, nCards) {
  if (nCards <= 1) return [];
  const n = density.length;
  const segW = n / nCards;
  const cuts = [];
  for (let i = 1; i < nCards; i++) {
    // Search window: ±25% of segment width around the ideal cut point
    const center = Math.round(segW * i);
    const half = Math.max(2, Math.floor(segW * 0.25));
    const lo = Math.max(1, center - half);
    const hi = Math.min(n - 1, center + half);
    let bestX = center;
    let bestVal = Infinity;
    for (let x = lo; x <= hi; x++) {
      if (density[x] < bestVal) {
        bestVal = density[x];
        bestX = x;
      }
    }
    cuts.push(bestX);
  }
  return cuts;
}

/**
 * Subdivide a fan strip into N slices using gap detection. Each slice is
 * a { x, y, w, h } rectangle in downscaled coordinates. Falls back to
 * uniform slicing if the strip is too narrow for gap analysis.
 */
function sliceFanStrip(mask, dW, strip, nCards) {
  if (!strip || nCards <= 0) return [];
  if (nCards === 1) {
    return [{ x: strip.x, y: strip.y, w: strip.w, h: strip.h }];
  }

  // Gap-aware slicing for fanned cards
  if (strip.w >= nCards * 4) {
    const density = smooth1D(columnDensity(mask, dW, strip));
    const cuts = findCardGapCuts(density, nCards);
    const slices = [];
    let prev = 0;
    for (let i = 0; i < cuts.length; i++) {
      slices.push({
        x: strip.x + prev,
        y: strip.y,
        w: Math.max(1, cuts[i] - prev + 1),
        h: strip.h,
      });
      prev = cuts[i];
    }
    slices.push({
      x: strip.x + prev,
      y: strip.y,
      w: Math.max(1, strip.w - prev),
      h: strip.h,
    });
    return slices;
  }

  // Uniform fallback
  const sliceW = strip.w / nCards;
  const out = [];
  for (let i = 0; i < nCards; i++) {
    out.push({
      x: Math.round(strip.x + i * sliceW),
      y: strip.y,
      w: Math.max(1, Math.round(sliceW) + 1),
      h: strip.h,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 4 — holdem mode (2 non-fanned cards via connected components)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find connected components in a bbox. Returns an array of
 * { x, y, w, h, area } for each 4-connected cardy blob. Used by holdem
 * mode where the 2 hero cards are separated by a visible dark gap.
 */
function findComponentsInBBox(mask, dW, bbox) {
  const { x: bx, y: by, w: bw, h: bh } = bbox;
  const labels = new Int32Array(bw * bh);
  let nextLabel = 1;
  const components = [];

  const neighbors = (px, py) => {
    const out = [];
    if (px > 0) out.push([px - 1, py]);
    if (py > 0) out.push([px, py - 1]);
    return out;
  };

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const idx = y * bw + x;
      if (!mask[(by + y) * dW + (bx + x)] || labels[idx] !== 0) continue;

      // BFS flood-fill from (x,y)
      const stack = [[x, y]];
      labels[idx] = nextLabel;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      while (stack.length) {
        const [px, py] = stack.pop();
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        // 4-neighbors (forward + back)
        const cands = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1],
        ];
        for (const [nx, ny] of cands) {
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const nIdx = ny * bw + nx;
          if (labels[nIdx] !== 0) continue;
          if (!mask[(by + ny) * dW + (bx + nx)]) continue;
          labels[nIdx] = nextLabel;
          stack.push([nx, ny]);
        }
      }
      if (area >= HOLDEM_MIN_COMPONENT_AREA) {
        components.push({
          x: bx + minX,
          y: by + minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
          area,
        });
      }
      nextLabel++;
    }
  }

  return components;
}

/**
 * Holdem hero detection: 2 distinct components of similar size and
 * similar y, side-by-side. Returns the 2 component rects sorted L→R,
 * or null if the pattern isn't found.
 */
function findHoldemHeroPair(mask, dW, bbox) {
  const comps = findComponentsInBBox(mask, dW, bbox);
  if (comps.length < 2) return null;
  // Sort by area desc
  comps.sort((a, b) => b.area - a.area);
  const top = comps.slice(0, 6);
  // Find a pair with similar y-center + similar height + different x
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i];
      const b = top[j];
      const ayc = a.y + a.h / 2;
      const byc = b.y + b.h / 2;
      const dy = Math.abs(ayc - byc);
      const hRatio = Math.min(a.h, b.h) / Math.max(a.h, b.h);
      const wRatio = Math.min(a.w, b.w) / Math.max(a.w, b.w);
      if (dy <= Math.max(3, a.h * 0.25) && hRatio >= 0.6 && wRatio >= 0.5) {
        return [a, b].sort((p, q) => p.x - q.x);
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 5 — board card count estimation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Estimate the hero hole-card count from a hero-strip bbox. Returns one
 * of {2, 4, 5, 6} or 0 if the strip is too weak to classify. Used by
 * the HUD to auto-detect NLHE vs PLO vs PLO5 vs PLO6 without the user
 * having to pick the variant manually.
 *
 * Heuristic: hero cards are displayed with a consistent per-card width
 * (PokerBros fans the cards with ~45-55% overlap, so the strip width
 * grows roughly linearly with card count). The strip aspect ratio
 * (w/h) is the stablest signal we can extract without running the
 * matcher.
 *
 *   2 stacked / side-by-side cards  → AR ~ 1.20 - 1.70
 *   4 cards fanned                  → AR ~ 2.00 - 2.80
 *   5 cards fanned                  → AR ~ 2.60 - 3.30
 *   6 cards fanned                  → AR ~ 3.10 - 4.00
 *
 * Bands overlap slightly — we snap to the nearest anchor.
 */
function estimateHeroHoleCount(strip) {
  if (!strip) return 0;
  const ar = strip.w / strip.h;
  if (!Number.isFinite(ar) || ar < 1.0 || ar > 5.0) return 0;
  const anchors = [
    { n: 2, ar: 1.45 },
    { n: 4, ar: 2.40 },
    { n: 5, ar: 2.95 },
    { n: 6, ar: 3.55 },
  ];
  let best = 0;
  let bestD = Infinity;
  for (const a of anchors) {
    const d = Math.abs(ar - a.ar);
    if (d < bestD) { bestD = d; best = a.n; }
  }
  return best;
}

function estimateBoardCardCount(strip) {
  if (!strip) return 0;
  // Aspect ratio sanity: board of N cards has w/h ~ N / 1.46 (≈2.05 / 2.74 /
  // 3.42 for 3 / 4 / 5 cards). Text runs are much wider (>5:1) or much
  // narrower (<1:1). Reject outliers as non-board.
  const ar = strip.w / strip.h;
  if (ar < 1.4 || ar > 4.8) return 0;
  const estCardW = strip.h / TYPICAL_CARD_H_OVER_W;
  if (estCardW <= 0) return 0;
  const n = Math.round(strip.w / estCardW);
  if (n >= 5) return 5;
  if (n === 4) return 4;
  if (n === 3) return 3;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 6 — confidence scoring
// ═══════════════════════════════════════════════════════════════════════

/**
 * Confidence = min(1, fill / expectedFill) × aspectPenalty where
 * expectedFill assumes each card occupies ~60% of its slice bbox with
 * white pixels and aspectPenalty drops when the strip is wildly
 * non-card-shaped.
 */
function scoreStripConfidence(strip, nCards) {
  if (!strip || nCards <= 0) return 0;
  const area = strip.w * strip.h;
  if (area <= 0) return 0;
  const fill = strip.count / area;
  const expectedFill = 0.35; // empirically, fanned cards fill ~35%
  const fillScore = Math.min(1, fill / expectedFill);
  // Aspect penalty — strips that are too tall are suspicious
  const ar = strip.w / strip.h;
  const expectedAR = Math.max(0.7, nCards * 0.3); // rough guide
  const arScore = 1 - Math.min(1, Math.abs(ar - expectedAR) / expectedAR);
  return Math.max(0, Math.min(1, 0.6 * fillScore + 0.4 * arScore));
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Localize hero + board card regions from a live video/canvas frame,
 * fully autonomous (zero calibration).
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} source
 * @param {object} options
 * @param {number} [options.expectedHoleCount=2]  2/4/5/6 for NLHE/PLO/PLO5/PLO6
 * @returns {{
 *   holeRegions: Array<{x,y,w,h}>,
 *   boardRegions: Array<{x,y,w,h}>,
 *   holeConfidence: number,
 *   boardConfidence: number,
 *   timingMs: number,
 *   debug: object,
 * }}
 */
export function localizeCards(source, options = {}) {
  const t0 = performance.now();
  const dn = getDownscaledImage(source, options.tableBounds);
  if (!dn) {
    return {
      holeRegions: [],
      boardRegions: [],
      holeConfidence: 0,
      boardConfidence: 0,
      timingMs: 0,
      debug: { reason: 'no-source' },
    };
  }
  const { imageData, scaleBackX, scaleBackY, roiX, roiY, srcH } = dn;
  const { width: dW, height: dH } = imageData;

  // ---- Adaptive mask -------------------------------------------------
  const lumThreshold = adaptiveLumThreshold(imageData);
  const mask = computeCardMask(imageData, lumThreshold);

  const expectedHole = Number.isFinite(options.expectedHoleCount) && options.expectedHoleCount > 0
    ? Math.max(1, Math.min(8, options.expectedHoleCount))
    : 2;

  // ═══════════════════════════════════════════════════════════════════
  // HERO PASS
  // ═══════════════════════════════════════════════════════════════════

  // Primary: bottom-right quadrant
  let heroStrip = cardyBBoxInRegion(
    mask, dW, dH,
    HERO_X_MIN_FRAC, HERO_X_MAX_FRAC,
    HERO_Y_MIN_FRAC, HERO_Y_MAX_FRAC,
    MIN_CARDY_PIXELS,
  );
  let heroSource = 'primary';

  // Discovery: if primary missed, sweep the entire bottom half
  if (!heroStrip) {
    heroStrip = cardyBBoxInRegion(
      mask, dW, dH,
      HERO_DISCOVERY_X_MIN, HERO_DISCOVERY_X_MAX,
      HERO_DISCOVERY_Y_MIN, HERO_DISCOVERY_Y_MAX,
      MIN_CARDY_PIXELS,
    );
    heroSource = heroStrip ? 'discovery' : 'none';
  }

  let heroSlices = [];
  let holeConfidence = 0;

  if (heroStrip) {
    // Holdem: 2 non-fanned cards → try connected components first
    if (expectedHole === 2) {
      const pair = findHoldemHeroPair(mask, dW, heroStrip);
      if (pair) {
        heroSlices = pair.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
        holeConfidence = 0.95;
      }
    }
    // PLO (or holdem fallback): fan-aware slicing
    if (heroSlices.length === 0) {
      heroSlices = sliceFanStrip(mask, dW, heroStrip, expectedHole);
      holeConfidence = scoreStripConfidence(heroStrip, expectedHole);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOARD PASS
  // ═══════════════════════════════════════════════════════════════════

  const boardStrip = cardyBBoxInRegion(
    mask, dW, dH,
    BOARD_X_MIN_FRAC, BOARD_X_MAX_FRAC,
    BOARD_Y_MIN_FRAC, BOARD_Y_MAX_FRAC,
    MIN_CARDY_PIXELS * 2, // board needs more area than hero to be real
  );
  const nBoard = estimateBoardCardCount(boardStrip);
  const boardSlices = nBoard > 0 ? sliceFanStrip(mask, dW, boardStrip, nBoard) : [];
  const boardConfidence = nBoard > 0 ? scoreStripConfidence(boardStrip, nBoard) : 0;

  // ═══════════════════════════════════════════════════════════════════
  // Scale back to source pixels
  // ═══════════════════════════════════════════════════════════════════

  // Slice coords are relative to the downscaled ROI; scale back to ROI
  // pixel size then add the ROI origin so the final rect is in FULL
  // source-frame pixel coordinates.
  const scaleUp = (r) => ({
    x: roiX + Math.round(r.x * scaleBackX),
    y: roiY + Math.round(r.y * scaleBackY),
    w: Math.round(r.w * scaleBackX),
    h: Math.round(r.h * scaleBackY),
  });

  const holeRegions = heroSlices.map(scaleUp);
  const boardRegions = boardSlices.map(scaleUp);

  const t1 = performance.now();

  // Variant-independent hole card count estimate from the strip geometry.
  // The HUD uses this to auto-switch variant (NLHE vs PLO/PLO5/PLO6).
  const estimatedHoleCount = estimateHeroHoleCount(heroStrip);

  return {
    holeRegions,
    boardRegions,
    holeConfidence,
    boardConfidence,
    tablePixelHeight: srcH,
    estimatedHoleCount,
    timingMs: t1 - t0,
    debug: {
      lumThreshold,
      downscaledW: dW,
      downscaledH: dH,
      heroSource,
      heroStrip,
      boardStrip,
      nBoard,
      expectedHole,
      estimatedHoleCount,
    },
  };
}

export { estimateHeroHoleCount };
export default localizeCards;
