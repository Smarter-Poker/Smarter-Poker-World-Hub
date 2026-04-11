/**
 * Poker Brain — Template Matcher (dHash Perceptual Hashing)
 * ==========================================================
 * Client-side card detection via difference hash (dHash).
 *
 * How it works:
 *   1. At startup, load all 52 card template images + back + empty.
 *   2. Precompute a 64-bit dHash for each template.
 *   3. For each frame from screen capture:
 *      a. Crop each of the 7 card regions from the captured frame
 *      b. Downscale to template size (64x88)
 *      c. Compute the dHash of the cropped region
 *      d. Compare against all precomputed template hashes (Hamming distance)
 *      e. Return the best match with confidence
 *
 * dHash algorithm:
 *   - Resize to 9x9 grayscale
 *   - For each row, compare adjacent pixels: left > right = 1, else 0
 *   - Produces 8 bits per row x 8 rows = 64-bit hash
 *   - Hamming distance = popcount(hash1 XOR hash2)
 *
 * Performance: < 30ms for all 7 regions on M3.
 * Accuracy target: >= 99% on board cards, >= 97% on hole cards.
 *
 * No external dependencies. Pure JS + Canvas API.
 */

// All 52 standard cards
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

// Template dimensions matching extract-templates.py output
const TEMPLATE_W = 64;
const TEMPLATE_H = 88;

// dHash parameters
const DHASH_SIZE = 9; // resize to 9x9, produces 8x8=64-bit hash
const DHASH_BITS = 64;

// Match thresholds
// Raised back to 12 after a real-world regression: the previous value of 5
// was tuned against a synthetic reference deck and rejected virtually every
// live PokerBros card (cards were matching at distances 7-11 due to sub-
// pixel rasterization differences between the emulator's GL surface and
// the extracted template PNGs). The net effect of threshold=5 was a
// completely dead HUD — zero cards detected, state machine stuck in
// WAITING forever. 12 lets real matches through while still rejecting
// genuine noise (a wrong-rank confusable typically scores 18+).
const MATCH_THRESHOLD = 12;
const EMPTY_THRESHOLD = 8;   // Empty/back detection threshold
const UNKNOWN_LABEL = null;  // Return null for unknown cards

// Crop robustness: recompute the dHash at small pixel offsets and keep
// the minimum Hamming distance. This absorbs 1–2 pixel crop jitter from
// the localizer (the single biggest source of confidence drops on
// otherwise perfectly readable cards) without any template changes.
const CROP_OFFSETS = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
];
// Internal scratch size used for offset re-sampling — larger than the
// template so we can slide a TEMPLATE_W x TEMPLATE_H window around it.
const SCRATCH_PAD_PX = 4;

/**
 * Compute the 64-bit Average Hash (aHash) of an ImageData.
 * Returns two 32-bit integers [hi, lo].
 */
function computeAHash(imageData) {
  const { data, width, height } = imageData;
  const gray8x8 = new Float64Array(8 * 8);

  let totalSum = 0;
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const srcX0 = Math.floor((dx / 8) * width);
      const srcY0 = Math.floor((dy / 8) * height);
      const srcX1 = Math.floor(((dx + 1) / 8) * width);
      const srcY1 = Math.floor(((dy + 1) / 8) * height);

      let sum = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * width + sx) * 4;
          sum += data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          count++;
        }
      }
      const val = count > 0 ? sum / count : 0;
      gray8x8[dy * 8 + dx] = val;
      totalSum += val;
    }
  }

  const avg = totalSum / 64;
  const hashBits = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    hashBits[i] = gray8x8[i] > avg ? 1 : 0;
  }

  let hi = 0; let lo = 0;
  for (let i = 0; i < 32; i++) { if (hashBits[i]) hi |= (1 << (31 - i)); }
  for (let i = 32; i < 64; i++) { if (hashBits[i]) lo |= (1 << (63 - i)); }

  return [hi, lo];
}

/**
 * Compute the 64-bit difference hash (dHash) of an ImageData.
 * Returns two 32-bit integers [hi, lo] since JS doesn't have native 64-bit ints.
 */
function computeDHash(imageData) {
  const { data, width, height } = imageData;

  // Step 1: Convert to grayscale and resize to 9x9
  const gray9x9 = new Float64Array(DHASH_SIZE * DHASH_SIZE);

  for (let dy = 0; dy < DHASH_SIZE; dy++) {
    for (let dx = 0; dx < DHASH_SIZE; dx++) {
      // Map destination pixel to source region
      const srcX0 = Math.floor((dx / DHASH_SIZE) * width);
      const srcY0 = Math.floor((dy / DHASH_SIZE) * height);
      const srcX1 = Math.floor(((dx + 1) / DHASH_SIZE) * width);
      const srcY1 = Math.floor(((dy + 1) / DHASH_SIZE) * height);

      // Average the source pixels in this block
      let sum = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * width + sx) * 4;
          // Luminance formula
          sum += data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          count++;
        }
      }

      gray9x9[dy * DHASH_SIZE + dx] = count > 0 ? sum / count : 0;
    }
  }

  // Step 2: Compute difference hash (compare adjacent horizontal pixels)
  // 8 rows x 8 comparisons = 64 bits
  const hashBits = new Uint8Array(DHASH_BITS);
  let bitIndex = 0;

  for (let y = 0; y < DHASH_SIZE - 1; y++) {
    for (let x = 0; x < DHASH_SIZE - 1; x++) {
      const left = gray9x9[y * DHASH_SIZE + x];
      const right = gray9x9[y * DHASH_SIZE + x + 1];
      hashBits[bitIndex] = left > right ? 1 : 0;
      bitIndex++;
    }
  }

  // Pack into two 32-bit integers
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 32; i++) {
    if (hashBits[i]) hi |= (1 << (31 - i));
  }
  for (let i = 32; i < 64; i++) {
    if (hashBits[i]) lo |= (1 << (63 - i));
  }

  return [hi, lo];
}

/**
 * Compute Hamming distance between two 64-bit hashes (each as [hi, lo]).
 */
function hammingDistance(hash1, hash2) {
  let dist = 0;
  // XOR each 32-bit half and count set bits
  let xorHi = (hash1[0] ^ hash2[0]) >>> 0;
  let xorLo = (hash1[1] ^ hash2[1]) >>> 0;

  // Popcount via Brian Kernighan's algorithm
  while (xorHi) {
    xorHi &= (xorHi - 1);
    dist++;
  }
  while (xorLo) {
    xorLo &= (xorLo - 1);
    dist++;
  }

  return dist;
}

/**
 * PokerBrainMatcher — main class for template matching.
 */
class PokerBrainMatcher {
  constructor() {
    this.templateHashes = new Map(); // card key -> { dHash: [hi, lo], aHash: [hi, lo] }
    this.loaded = false;
    this.loading = false;
    this._offscreenCanvas = null;
    this._offscreenCtx = null;
    this._cropCanvas = null;
    this._cropCtx = null;
    // Diagnostic: emit a one-time console breakdown of the best match
    // per region on the first N invocations after a stream starts. This
    // is NOT gated on debug mode — it runs automatically so that when
    // the HUD appears dead we can immediately see whether the matcher
    // is getting cards and just rejecting them (threshold problem) or
    // sees nothing (region/capture problem).
    this._diagFramesRemaining = 0;
  }

  /**
   * Arm the diagnostic dump for the next N matchAllRegions() calls.
   */
  armDiagnostics(frames = 3) {
    this._diagFramesRemaining = frames;
  }

  /**
   * Load all template images and precompute their dHashes.
   * @param {string} templateBasePath — URL path prefix for template images
   *   e.g., '/hub/poker-brain/templates'
   */
  async loadTemplates(templateBasePath = '/hub/poker-brain/templates') {
    if (this.loaded || this.loading) return;
    this.loading = true;

    const allKeys = [];

    // 52 standard cards
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        allKeys.push(`${rank}${suit}`);
      }
    }

    // Special templates
    allKeys.push('back', 'empty');

    // Create a small canvas for computing hashes
    const canvas = document.createElement('canvas');
    canvas.width = TEMPLATE_W;
    canvas.height = TEMPLATE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Load all templates in parallel
    const loadPromises = allKeys.map(async (key) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error(`Failed to load template: ${key}`));
          img.src = `${templateBasePath}/${key}.png`;
        });

        // Draw to canvas and compute hash
        ctx.clearRect(0, 0, TEMPLATE_W, TEMPLATE_H);
        ctx.drawImage(img, 0, 0, TEMPLATE_W, TEMPLATE_H);
        const imageData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
        const dHash = computeDHash(imageData);
        const aHash = computeAHash(imageData);

        this.templateHashes.set(key, { dHash, aHash });
      } catch (err) {
        // Template not available yet — skip silently
        // This is expected during development when not all 52 templates exist
        console.warn(`[Matcher] Skipping template: ${key} (${err.message})`);
      }
    });

    await Promise.all(loadPromises);
    this.loaded = true;
    this.loading = false;

    console.log(`[Matcher] Loaded ${this.templateHashes.size} template hashes`);
  }

  /**
   * Initialize the offscreen canvases used for cropping and hashing.
   * Call this once before matchAllRegions().
   */
  _ensureCanvases() {
    if (!this._offscreenCanvas) {
      this._offscreenCanvas = document.createElement('canvas');
      this._offscreenCtx = this._offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this._cropCanvas) {
      // Scratch canvas is oversized so we can grab offset windows of
      // TEMPLATE_W × TEMPLATE_H without re-cropping from source for
      // each offset pass. The hash function reads from a TEMPLATE_W ×
      // TEMPLATE_H sub-region starting at (SCRATCH_PAD_PX + dx,
      // SCRATCH_PAD_PX + dy).
      this._cropCanvas = document.createElement('canvas');
      this._cropCanvas.width = TEMPLATE_W + 2 * SCRATCH_PAD_PX;
      this._cropCanvas.height = TEMPLATE_H + 2 * SCRATCH_PAD_PX;
      this._cropCtx = this._cropCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Match a single card region from a video frame.
   * @param {HTMLVideoElement|HTMLCanvasElement} source — the captured frame
   * @param {{x:number, y:number, w:number, h:number}} region — pixel coords
   * @param {number} sourceW — actual source width
   * @param {number} sourceH — actual source height
   * @returns {{ rank: string|null, suit: string|null, confidence: number, distance: number, key: string|null }}
   */
  matchRegion(source, region, sourceW, sourceH, options = {}) {
    this._ensureCanvases();

    // ---- Cropping with padding + offset sweep -------------------------
    // When `skipOffsets` is true (hardwired mode), we skip the 5-offset
    // crop sweep entirely — pixel-perfect screen captures have zero
    // jitter so the sweep is wasted compute. We also allow a custom
    // `threshold` to tighten matching for hardwired mode.
    const effectiveThreshold = Number.isFinite(options.threshold) ? options.threshold : MATCH_THRESHOLD;
    const doOffsetSweep = !options.skipOffsets;

    const scratchW = this._cropCanvas.width;
    const scratchH = this._cropCanvas.height;
    this._cropCtx.clearRect(0, 0, scratchW, scratchH);

    // Expand the source rectangle by a small padding in source-pixel
    // units so the scratch canvas covers a bit more than the template
    // — this is the "sliding window" area. PADDING_FRAC of 0.08 is
    // about one card-edge of overlap, enough to absorb localizer
    // bbox slack without bleeding into the neighboring card.
    const PADDING_FRAC = 0.08;
    const padX = Math.max(1, Math.round(region.w * PADDING_FRAC));
    const padY = Math.max(1, Math.round(region.h * PADDING_FRAC));
    const srcX = Math.max(0, region.x - padX);
    const srcY = Math.max(0, region.y - padY);
    const srcW = Math.min(sourceW - srcX, region.w + 2 * padX);
    const srcH = Math.min(sourceH - srcY, region.h + 2 * padY);

    if (srcW <= 0 || srcH <= 0) {
      return {
        rank: null, suit: null, confidence: 0, distance: DHASH_BITS, key: null,
        threshold: effectiveThreshold,
        candidates: undefined,
      };
    }

    // Draw padded crop to scratch, scaled to scratchW × scratchH.
    this._cropCtx.drawImage(
      source,
      srcX, srcY, srcW, srcH,
      0, 0, scratchW, scratchH,
    );

    // Precompute hashes for each offset. We grab a TEMPLATE_W×TEMPLATE_H
    // region starting at (SCRATCH_PAD_PX+dx, SCRATCH_PAD_PX+dy) for each
    // offset in CROP_OFFSETS. Doing this with getImageData on the full
    // scratch once avoids a canvas re-draw per offset.
    // Precompute both hashes for each offset (or just center if skipping).
    const scratchData = this._cropCtx.getImageData(0, 0, scratchW, scratchH);
    const offsets = doOffsetSweep ? CROP_OFFSETS : [[0, 0]];
    const subHashes = offsets.map(([dx, dy]) => {
      const ox = SCRATCH_PAD_PX + dx;
      const oy = SCRATCH_PAD_PX + dy;
      const sub = new Uint8ClampedArray(TEMPLATE_W * TEMPLATE_H * 4);
      const srcStride = scratchW * 4;
      const dstStride = TEMPLATE_W * 4;
      for (let y = 0; y < TEMPLATE_H; y++) {
        const srcOff = ((oy + y) * scratchW + ox) * 4;
        const dstOff = y * dstStride;
        sub.set(scratchData.data.subarray(srcOff, srcOff + dstStride), dstOff);
      }
      const data = { data: sub, width: TEMPLATE_W, height: TEMPLATE_H };
      return { dHash: computeDHash(data), aHash: computeAHash(data) };
    });

    const topN = Number.isFinite(options.topN) && options.topN > 0 ? options.topN : 0;

    let bestKey = null;
    let bestDistance = Infinity;
    let secondBestDistance = Infinity;

    const candidates = topN > 0 ? [] : null;
    const pushCandidate = (key, dist) => {
      let i = 0;
      while (i < candidates.length && candidates[i].distance <= dist) i++;
      candidates.splice(i, 0, { key, distance: dist });
      if (candidates.length > topN) candidates.length = topN;
    };

    for (const [key, templateHash] of this.templateHashes) {
      let dist = DHASH_BITS;
      for (let s = 0; s < subHashes.length; s++) {
        const dScore = hammingDistance(subHashes[s].dHash, templateHash.dHash);
        const aScore = hammingDistance(subHashes[s].aHash, templateHash.aHash);
        // Take the min of dHash and aHash distances
        const currentDist = Math.min(dScore, aScore);
        if (currentDist < dist) dist = currentDist;
      }
      
      if (dist < bestDistance) {
        // Update second best if it's a different generic rank/suit
        if (bestKey && bestKey[0] !== key[0]) {
            secondBestDistance = bestDistance;
        }
        bestDistance = dist;
        bestKey = key;
      } else if (dist < secondBestDistance && (!bestKey || bestKey[0] !== key[0])) {
        secondBestDistance = dist;
      }

      if (candidates) pushCandidate(key, dist);
    }

    const buildCandidates = () => {
      if (!candidates) return undefined;
      return candidates.map((c) => ({
        key: c.key,
        distance: c.distance,
        confidence: 1 - (c.distance / DHASH_BITS),
      }));
    };

    // Determine match quality with Adaptive Threshold Gap Acceptance
    let accepted = false;
    const gap = secondBestDistance - bestDistance;

    if (bestKey !== null) {
      if (bestDistance <= effectiveThreshold) {
        accepted = true;
      } else if (bestDistance <= effectiveThreshold + 6 && gap >= 6) {
        // Adaptive threshold: Even if raw distance is worse than the effective
        // threshold, if there's a huge gap (>= 6) from the second best choice,
        // it's highly likely this is a correct match experiencing sub-pixel
        // rendering distortion. The adaptive ceiling scales with the effective
        // threshold so hardwired mode (threshold=8) only accepts up to 14,
        // not the camera-mode ceiling of 18.
        accepted = true;
      }
    }

    if (!accepted) {
      return {
        rank: null, suit: null, confidence: 0, distance: bestDistance, key: null,
        threshold: effectiveThreshold,
        candidates: buildCandidates(),
      };
    }

    // Handle special keys
    if (bestKey === 'back' || bestKey === 'empty') {
      return {
        rank: null, suit: null,
        confidence: 1 - (bestDistance / DHASH_BITS),
        distance: bestDistance, key: bestKey,
        threshold: effectiveThreshold,
        candidates: buildCandidates(),
      };
    }

    // Parse rank and suit from key (e.g., 'Kh' -> rank='K', suit='h')
    const rank = bestKey[0];
    const suit = bestKey[1];
    const confidence = 1 - (bestDistance / DHASH_BITS);

    return {
      rank, suit, confidence, distance: bestDistance, key: bestKey,
      threshold: effectiveThreshold,
      candidates: buildCandidates(),
    };
  }

  /**
   * Match all card regions (N hole + 5 board) from a video element.
   * @param {HTMLVideoElement} videoElement — screen capture video
   * @param {object} layout — the layout.json object
   * @param {object} [options]
   * @param {string} [options.variant] — game variant key ('nlhe', 'plo',
   *   'plo_hilo', 'plo5', 'plo6'). When provided AND the layout has a
   *   `holeCardsByVariant` map, the matcher uses variant-specific regions
   *   instead of the legacy `holeCards` array. This is critical because
   *   PokerBros re-positions the entire card fan per variant — the absolute
   *   pixel coordinates change, not just the count.
   * @param {number} [options.maxHoleCards] — (legacy) cap the number of hero
   *   hole-card regions polled when per-variant regions are not available.
   * @returns {{ holeCards: Array, boardCards: Array, timingMs: number, polledHoleCount: number, probeLog: Array|undefined }}
   */
  matchAllRegions(videoElement, layout, options = {}) {
    if (!this.loaded || this.templateHashes.size === 0) {
      return { holeCards: [], boardCards: [], timingMs: 0, polledHoleCount: 0 };
    }

    const startTime = performance.now();
    this._ensureCanvases();

    // Get actual video dimensions
    const videoW = videoElement.videoWidth || videoElement.width;
    const videoH = videoElement.videoHeight || videoElement.height;

    if (!videoW || !videoH) {
      return { holeCards: [], boardCards: [], timingMs: 0, polledHoleCount: 0 };
    }

    // Draw video to offscreen canvas at native resolution
    this._offscreenCanvas.width = videoW;
    this._offscreenCanvas.height = videoH;
    this._offscreenCtx.drawImage(videoElement, 0, 0, videoW, videoH);

    // Scale layout coordinates from reference resolution to actual video resolution
    const refW = layout.referenceSize.w;
    const refH = layout.referenceSize.h;
    const scaleX = videoW / refW;
    const scaleY = videoH / refH;

    const scaleRegion = (r) => ({
      x: Math.round(r.x * scaleX),
      y: Math.round(r.y * scaleY),
      w: Math.round(r.w * scaleX),
      h: Math.round(r.h * scaleY),
    });

    // ---- Resolve which hole-card regions to poll ----
    // Priority: per-variant regions > legacy slice > empty
    let layoutHole = [];
    const variantKey = options.variant ? String(options.variant).toLowerCase() : null;
    const byVariant = layout.holeCardsByVariant;

    if (variantKey && byVariant && Array.isArray(byVariant[variantKey])) {
      // Use the exact region set defined for this variant.
      // No slicing needed — the array length IS the card count.
      layoutHole = byVariant[variantKey];
    } else {
      // Legacy fallback: slice the flat holeCards array
      const fallback = Array.isArray(layout.holeCards) ? layout.holeCards : [];
      const maxHole = Number.isFinite(options.maxHoleCards) && options.maxHoleCards > 0
        ? Math.min(options.maxHoleCards, fallback.length)
        : fallback.length;
      layoutHole = fallback.slice(0, maxHole);
    }

    const debugMode = !!options.debug;
    const topN = debugMode ? (Number.isFinite(options.topN) ? options.topN : 3) : 0;
    // Forward hardwired-mode options (threshold, skipOffsets) to matchRegion
    const matchOpts = {
      ...(topN > 0 ? { topN } : {}),
      ...(options.threshold != null ? { threshold: options.threshold } : {}),
      ...(options.skipOffsets ? { skipOffsets: true } : {}),
    };

    // Unified debug log (hole + board). Legacy `probeLog` name kept for
    // backwards compatibility with the wiring test.
    const probeLog = (options.probeMode || debugMode) ? [] : undefined;

    // --- Direct per-card matching from the full video canvas ---
    // Each card region is matched individually against the offscreen canvas.
    // This is the proven, reliable path. Unified region capture was removed
    // because OffscreenCanvas sub-crops silently produced zero detections.
    const holeCards = [];
    for (let i = 0; i < layoutHole.length; i++) {
      const region = layoutHole[i];
      if (!region) continue;
      const scaled = scaleRegion(region);
      const result = this.matchRegion(this._offscreenCanvas, scaled, videoW, videoH, matchOpts);
      if (probeLog) {
        probeLog.push({
          kind: 'hole', slot: i,
          region: { x: region.x, y: region.y, w: region.w, h: region.h },
          scaledRegion: scaled,
          bestKey: result.key, distance: result.distance,
          confidence: result.confidence, threshold: result.threshold,
          matched: !!(result.rank && result.suit),
          candidates: result.candidates,
        });
      }
      if (result.rank && result.suit) holeCards.push(result);
    }

    const boardRegions = Array.isArray(layout.boardCards) ? layout.boardCards : [];
    const boardCards = [];
    for (let i = 0; i < boardRegions.length; i++) {
      const region = boardRegions[i];
      if (!region) continue;
      const scaled = scaleRegion(region);
      const result = this.matchRegion(this._offscreenCanvas, scaled, videoW, videoH, matchOpts);
      if (probeLog) {
        probeLog.push({
          kind: 'board', slot: i,
          region: { x: region.x, y: region.y, w: region.w, h: region.h },
          scaledRegion: scaled,
          bestKey: result.key, distance: result.distance,
          confidence: result.confidence, threshold: result.threshold,
          matched: !!(result.rank && result.suit),
          candidates: result.candidates,
        });
      }
      if (result.rank && result.suit) boardCards.push(result);
    }

    const timingMs = performance.now() - startTime;

    // ---- One-shot diagnostic dump ----
    // When armed, print the best match (and distance) for every polled
    // region. Runs for a few frames after a stream starts, so when the
    // user reports "nothing is detected" we can see immediately whether
    // the matcher is reading cards and rejecting them (threshold issue)
    // or seeing empty/back (region/capture issue).
    if (this._diagFramesRemaining > 0) {
      this._diagFramesRemaining -= 1;
      try {
        const rows = [];
        for (let i = 0; i < layoutHole.length; i++) {
          const region = layoutHole[i];
          if (!region) continue;
          const scaled = scaleRegion(region);
          const r = this.matchRegion(this._offscreenCanvas, scaled, videoW, videoH, { topN: 3 });
          rows.push({
            slot: `hole${i}`,
            best: r.key,
            dist: r.distance,
            conf: r.confidence.toFixed(2),
            top3: (r.candidates || []).slice(0, 3).map((c) => `${c.key}:${c.distance}`).join(' '),
            region: `${scaled.x},${scaled.y} ${scaled.w}x${scaled.h}`,
          });
        }
        for (let i = 0; i < layout.boardCards.length; i++) {
          const region = layout.boardCards[i];
          const scaled = scaleRegion(region);
          const r = this.matchRegion(this._offscreenCanvas, scaled, videoW, videoH, { topN: 3 });
          rows.push({
            slot: `board${i}`,
            best: r.key,
            dist: r.distance,
            conf: r.confidence.toFixed(2),
            top3: (r.candidates || []).slice(0, 3).map((c) => `${c.key}:${c.distance}`).join(' '),
            region: `${scaled.x},${scaled.y} ${scaled.w}x${scaled.h}`,
          });
        }
        // eslint-disable-next-line no-console
        console.log(
          `[Matcher diag] video=${videoW}x${videoH} ref=${refW}x${refH} scale=${scaleX.toFixed(2)}x${scaleY.toFixed(2)} threshold=${MATCH_THRESHOLD}`
        );
        // eslint-disable-next-line no-console
        console.table(rows);
      } catch (diagErr) {
        // eslint-disable-next-line no-console
        console.warn('[Matcher diag] dump failed', diagErr);
      }
    }

    const out = { holeCards, boardCards, timingMs, polledHoleCount: layoutHole.length };
    if (probeLog) out.probeLog = probeLog;
    return out;
  }

  /**
   * Check if templates are loaded and ready.
   */
  isReady() {
    return this.loaded && this.templateHashes.size > 0;
  }

  /**
   * Get the count of loaded templates.
   */
  getTemplateCount() {
    return this.templateHashes.size;
  }
}

// Singleton instance for reuse
let _instance = null;

/**
 * Get the singleton PokerBrainMatcher instance.
 */
export function getMatcher() {
  if (!_instance) {
    _instance = new PokerBrainMatcher();
  }
  return _instance;
}

// Export class and utilities for testing
export { PokerBrainMatcher, computeDHash, hammingDistance };
export default PokerBrainMatcher;
