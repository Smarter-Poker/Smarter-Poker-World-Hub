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
    if (!this._directCanvas) {
      // Cached canvas for the hardwired direct-crop path (matchRegion
      // with skipOffsets). Eliminates ~44 canvas allocs/sec at 4Hz with
      // up to 11 card regions.
      this._directCanvas = document.createElement('canvas');
      this._directCanvas.width = TEMPLATE_W;
      this._directCanvas.height = TEMPLATE_H;
      this._directCtx = this._directCanvas.getContext('2d', { willReadFrequently: true });
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
    // When `skipOffsets` is true (hardwired mode), we use a DIRECT crop
    // path that matches the template loading exactly: crop the source
    // region and scale directly to TEMPLATE_W x TEMPLATE_H (64x88).
    // This eliminates the padding-induced scaling mismatch that causes
    // hash distances of 15-23 even when the template images are correct.
    //
    // Camera mode still uses the padded + offset-sweep approach to absorb
    // jitter from camera angle/focus/distance variation.
    const effectiveThreshold = Number.isFinite(options.threshold) ? options.threshold : MATCH_THRESHOLD;
    const doOffsetSweep = !options.skipOffsets;

    // ==== HARDWIRED DIRECT-CROP PATH ====
    // In hardwired mode, crop the exact region and scale to 64x88,
    // identical to how template PNGs are loaded and hashed. This gives
    // dHash distances of 0-3 for correct matches.
    if (!doOffsetSweep) {
      // Direct crop: source region → TEMPLATE_W x TEMPLATE_H canvas
      // This matches the template loading path exactly (line 259-263):
      //   ctx.drawImage(img, 0, 0, TEMPLATE_W, TEMPLATE_H);
      // Uses the cached _directCanvas to avoid ~44 canvas allocs/sec.
      const tmpCanvas = this._directCanvas;
      const tmpCtx = this._directCtx;
      tmpCtx.clearRect(0, 0, TEMPLATE_W, TEMPLATE_H);

      const srcX = Math.max(0, Math.round(region.x));
      const srcY = Math.max(0, Math.round(region.y));
      const srcW = Math.min(Math.round(region.w), sourceW - srcX);
      const srcH = Math.min(Math.round(region.h), sourceH - srcY);

      if (srcW <= 0 || srcH <= 0) {
        return {
          rank: null, suit: null, confidence: 0, distance: DHASH_BITS, key: null,
          threshold: effectiveThreshold,
          candidates: undefined,
        };
      }

      // Draw source region directly to 64x88 — same scaling as template load
      tmpCtx.drawImage(
        source,
        srcX, srcY, srcW, srcH,
        0, 0, TEMPLATE_W, TEMPLATE_H,
      );

      const imageData = tmpCtx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
      const dHash = computeDHash(imageData);
      const aHash = computeAHash(imageData);
      const subHashes = [{ dHash, aHash }];

      // Fall through to the matching loop below
      return this._matchAgainstTemplates(subHashes, effectiveThreshold, options);
    }

    // ==== CAMERA PADDED-CROP PATH (offset sweep) ====
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

    // Draw padded crop to scratch, scaled to scratchW x scratchH.
    this._cropCtx.drawImage(
      source,
      srcX, srcY, srcW, srcH,
      0, 0, scratchW, scratchH,
    );

    // Precompute hashes for each offset. We grab a TEMPLATE_W x TEMPLATE_H
    // region starting at (SCRATCH_PAD_PX+dx, SCRATCH_PAD_PX+dy) for each
    // offset in CROP_OFFSETS.
    const scratchData = this._cropCtx.getImageData(0, 0, scratchW, scratchH);
    const offsets = CROP_OFFSETS;
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

    // Camera path: use shared matching logic
    return this._matchAgainstTemplates(subHashes, effectiveThreshold, options);
  }

  /**
   * Shared matching logic: compare precomputed hashes against all templates.
   * Used by both the hardwired direct-crop path and the camera padded-crop path.
   */
  _matchAgainstTemplates(subHashes, effectiveThreshold, options = {}) {
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
      } else if (bestDistance <= effectiveThreshold + 3 && gap >= 8) {
        // Adaptive threshold: if raw distance is slightly above threshold but
        // there's a very clear gap (>=8) to second-best, accept it. Tightened
        // from +6/gap>=6 to +3/gap>=8 to reduce phantom detections.
        accepted = true;
      }
    }

    if (!accepted) {
      return {
        rank: null, suit: null, confidence: 0, distance: bestDistance,
        key: null,
        bestGuess: bestKey, // Always expose the best guess for diagnostics
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

    // --- UNIFIED REGION CAPTURE ---
    // One crop for all hole cards, one crop for all board cards.
    // Subdivide each unified crop into equal horizontal slots, then match
    // each slot against templates. This is more reliable than individual
    // per-card crops because:
    //   1. Single drawImage call per group = consistent scaling
    //   2. Cards are positioned relative to each other within the crop
    //   3. No risk of individual coordinates drifting apart

    /**
     * Match cards from a unified region by subdividing into equal slots.
     * @param {object} unifiedRegion - { x, y, w, h, count }
     * @param {string} kind - 'hole' | 'board' for probe logging
     * @returns {Array} matched cards
     */
    const matchUnifiedRegion = (unifiedRegion, kind) => {
      const cards = [];
      if (!unifiedRegion || !unifiedRegion.count) return cards;

      const count = unifiedRegion.count;
      const scaled = scaleRegion(unifiedRegion);

      // Subdivide the unified region into equal horizontal slots
      const slotW = Math.round(scaled.w / count);

      for (let i = 0; i < count; i++) {
        const slotRegion = {
          x: scaled.x + i * slotW,
          y: scaled.y,
          w: slotW,
          h: scaled.h,
        };

        const result = this.matchRegion(this._offscreenCanvas, slotRegion, videoW, videoH, matchOpts);

        if (probeLog) {
          // Show the slot region in reference space for diagnostics
          const refSlotW = Math.round(unifiedRegion.w / count);
          probeLog.push({
            kind, slot: i,
            region: {
              x: unifiedRegion.x + i * refSlotW,
              y: unifiedRegion.y,
              w: refSlotW,
              h: unifiedRegion.h,
            },
            scaledRegion: slotRegion,
            bestKey: result.key || result.bestGuess, distance: result.distance,
            confidence: result.confidence, threshold: result.threshold,
            matched: !!(result.rank && result.suit),
            candidates: result.candidates,
          });
        }

        if (result.rank && result.suit) cards.push(result);
      }
      return cards;
    };

    // --- Hole cards: INDIVIDUAL per-card regions first (correct fanning) ---
    // Priority: individual per-card regions (holeCardsByVariant) FIRST.
    // These have per-card y-offsets that follow the PokerBros fan display.
    // Unified region subdivision (holeCardRegion) is FALLBACK only — its
    // equal-width horizontal slots ignore fanning and produce badly
    // distorted aspect ratios (e.g. PLO6: 37x95 → 1.73x stretch to 64x88).
    let holeCards = [];

    if (layoutHole.length > 0) {
      // INDIVIDUAL per-card path: each card has its own x/y/w/h
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
            bestKey: result.key || result.bestGuess, distance: result.distance,
            confidence: result.confidence, threshold: result.threshold,
            matched: !!(result.rank && result.suit),
            candidates: result.candidates,
          });
        }
        if (result.rank && result.suit) holeCards.push(result);
      }
    } else {
      // FALLBACK: unified region subdivision (if no individual regions)
      const holeRegionMap = layout.holeCardRegion || {};
      const unifiedHole = variantKey && holeRegionMap[variantKey]
        ? holeRegionMap[variantKey]
        : holeRegionMap.nlhe || null;
      if (unifiedHole && unifiedHole.count) {
        holeCards = matchUnifiedRegion(unifiedHole, 'hole');
      }
    }

    // --- Board cards: INDIVIDUAL per-card regions first ---
    // Same priority: individual boardCards[] regions first, unified fallback.
    let boardCards = [];
    const boardRegions = Array.isArray(layout.boardCards) ? layout.boardCards : [];

    if (boardRegions.length > 0) {
      // INDIVIDUAL per-card path
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
            bestKey: result.key || result.bestGuess, distance: result.distance,
            confidence: result.confidence, threshold: result.threshold,
            matched: !!(result.rank && result.suit),
            candidates: result.candidates,
          });
        }
        if (result.rank && result.suit) boardCards.push(result);
      }
    } else {
      // FALLBACK: unified region subdivision
      const unifiedBoard = layout.boardCardRegion || null;
      if (unifiedBoard && unifiedBoard.count) {
        boardCards = matchUnifiedRegion(unifiedBoard, 'board');
      }
    }

    // ── DEDUP BLOCKER (matcher level) ──────────────────────────────────
    // A standard 52-card deck has exactly ONE of each card. If two regions
    // match the same key, keep the one with the lowest distance. This is
    // enforced here (matcher level) AND in hardwired-detect.js (caller
    // level) for belt-and-suspenders safety. Also cross-dedup between
    // hole and board — a card cannot appear in both.
    const _dedup = (cards) => {
      const seen = new Map();
      const keep = new Array(cards.length).fill(true);
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || !c.key || c.key === 'back' || c.key === 'empty') continue;
        if (seen.has(c.key)) {
          const prev = seen.get(c.key);
          if ((c.distance ?? 99) < (prev.distance ?? 99)) {
            keep[prev.index] = false;
            seen.set(c.key, { index: i, distance: c.distance });
          } else {
            keep[i] = false;
          }
        } else {
          seen.set(c.key, { index: i, distance: c.distance });
        }
      }
      return cards.filter((_, i) => keep[i]);
    };
    holeCards = _dedup(holeCards);
    boardCards = _dedup(boardCards);
    // Cross-dedup: remove any card from board that also appears in hole (keep lower dist)
    const holeKeySet = new Map(holeCards.filter(c => c?.key).map(c => [c.key, c.distance ?? 99]));
    boardCards = boardCards.filter(c => {
      if (!c?.key) return true;
      if (holeKeySet.has(c.key)) return (c.distance ?? 99) < holeKeySet.get(c.key);
      return true;
    });
    const boardKeySet = new Set(boardCards.filter(c => c?.key).map(c => c.key));
    holeCards = holeCards.filter(c => !c?.key || !boardKeySet.has(c.key));

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

  /**
   * Auto-calibration sweep: scan the video frame to find where cards are.
   * Sweeps a crop window across a region of the frame, hashing each position
   * and comparing against all templates. Returns the positions with the
   * lowest distances (i.e. where cards actually are).
   *
   * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
   * @param {object} [options]
   * @param {string} [options.zone] - 'hole' | 'board' | 'full'
   * @param {number} [options.stepX] - pixel step size for X sweep (default 5)
   * @param {number} [options.stepY] - pixel step size for Y sweep (default 5)
   * @param {number} [options.cropW] - crop width (default 55)
   * @param {number} [options.cropH] - crop height (default 75)
   * @param {number} [options.topN] - number of best positions to return (default 20)
   * @returns {Array<{x, y, w, h, bestKey, distance, dDist, aDist}>}
   */
  autoCalibrateSweep(videoElement, options = {}) {
    if (!this.loaded || this.templateHashes.size === 0) return [];

    this._ensureCanvases();

    const videoW = videoElement.videoWidth || videoElement.width;
    const videoH = videoElement.videoHeight || videoElement.height;
    if (!videoW || !videoH) return [];

    // Draw video to offscreen canvas
    this._offscreenCanvas.width = videoW;
    this._offscreenCanvas.height = videoH;
    this._offscreenCtx.drawImage(videoElement, 0, 0, videoW, videoH);

    const zone = options.zone || 'hole';
    const stepX = options.stepX || 5;
    const stepY = options.stepY || 5;
    const cropW = options.cropW || 55;
    const cropH = options.cropH || 75;
    const topN = options.topN || 20;

    // Define scan region based on zone
    let scanX0, scanY0, scanX1, scanY1;
    if (zone === 'hole') {
      // Hole cards: scan bottom 40% of frame, middle 80% width
      scanX0 = Math.round(videoW * 0.15);
      scanY0 = Math.round(videoH * 0.60);
      scanX1 = Math.round(videoW * 0.85) - cropW;
      scanY1 = Math.round(videoH * 0.90) - cropH;
    } else if (zone === 'board') {
      // Board cards: scan middle 30% vertically, middle 80% width
      scanX0 = Math.round(videoW * 0.10);
      scanY0 = Math.round(videoH * 0.30);
      scanX1 = Math.round(videoW * 0.90) - cropW;
      scanY1 = Math.round(videoH * 0.55) - cropH;
    } else {
      // Full scan
      scanX0 = 0;
      scanY0 = 0;
      scanX1 = videoW - cropW;
      scanY1 = videoH - cropH;
    }

    // Temporary canvas for cropping
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = TEMPLATE_W;
    tmpCanvas.height = TEMPLATE_H;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

    // Results: keep top-N best matches (lowest distance for a real card)
    const results = [];

    const startTime = performance.now();

    for (let sy = scanY0; sy <= scanY1; sy += stepY) {
      for (let sx = scanX0; sx <= scanX1; sx += stepX) {
        tmpCtx.clearRect(0, 0, TEMPLATE_W, TEMPLATE_H);
        tmpCtx.drawImage(
          this._offscreenCanvas,
          sx, sy, cropW, cropH,
          0, 0, TEMPLATE_W, TEMPLATE_H,
        );

        const imageData = tmpCtx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
        const dHash = computeDHash(imageData);
        const aHash = computeAHash(imageData);

        // Find best template match
        let bestKey = null;
        let bestDist = DHASH_BITS;
        let bestDDist = DHASH_BITS;
        let bestADist = DHASH_BITS;

        for (const [key, tpl] of this.templateHashes) {
          // Skip empty/back for calibration — we want real cards
          if (key === 'empty' || key === 'back') continue;

          const dScore = hammingDistance(dHash, tpl.dHash);
          const aScore = hammingDistance(aHash, tpl.aHash);
          const minScore = Math.min(dScore, aScore);

          if (minScore < bestDist) {
            bestDist = minScore;
            bestKey = key;
            bestDDist = dScore;
            bestADist = aScore;
          }
        }

        // Only keep if distance is reasonable (< 20)
        if (bestDist < 20) {
          // Insert sorted by distance
          let inserted = false;
          for (let i = 0; i < results.length; i++) {
            if (bestDist < results[i].distance) {
              results.splice(i, 0, {
                x: sx, y: sy, w: cropW, h: cropH,
                bestKey, distance: bestDist,
                dDist: bestDDist, aDist: bestADist,
              });
              inserted = true;
              break;
            }
          }
          if (!inserted && results.length < topN) {
            results.push({
              x: sx, y: sy, w: cropW, h: cropH,
              bestKey, distance: bestDist,
              dDist: bestDDist, aDist: bestADist,
            });
          }
          if (results.length > topN) results.length = topN;
        }
      }
    }

    const elapsed = performance.now() - startTime;
    // eslint-disable-next-line no-console
    console.log(`[AutoCalibrate] zone=${zone} scanned ${Math.ceil((scanX1-scanX0)/stepX) * Math.ceil((scanY1-scanY0)/stepY)} positions in ${elapsed.toFixed(0)}ms`);
    // eslint-disable-next-line no-console
    console.table(results.slice(0, 10).map(r => ({
      pos: `${r.x},${r.y}`,
      size: `${r.w}x${r.h}`,
      card: r.bestKey,
      dist: r.distance,
      dHash: r.dDist,
      aHash: r.aDist,
    })));

    return results;
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
