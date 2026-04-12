/**
 * Poker Brain -- Hardwired Detection Mode
 * ========================================
 * Optimized detection path for screen-share capture where the video feed
 * is a pixel-perfect mirror of the PokerBros app. In this mode:
 *
 *   1. Card positions are FIXED -- layout.json coordinates are absolute truth
 *   2. No crop-offset sweep needed -- zero camera jitter to absorb
 *   3. No card localizer needed -- positions never move
 *   4. dHash distances are typically 0-3 (pixel-perfect template match)
 *   5. Match threshold can be tightened to 6 for near-zero false positives
 *
 * This eliminates the camera variable entirely: no angle, no lighting,
 * no distance variation, no focus issues. 100% coverage, 100% of the time.
 *
 * Usage:
 *   import { hardwiredDetect, isHardwiredEligible } from './hardwired-detect';
 *
 *   // Check if current capture supports hardwired mode
 *   if (isHardwiredEligible(captureMode)) { ... }
 *
 *   // Run optimized detection
 *   const result = hardwiredDetect(videoElement, layout, matcher, { variant: 'plo' });
 */

import { verifyCardSuit } from './suit-color.js';

// Hardwired mode threshold. With auto-calibration finding exact card positions,
// real matches should be distance 0-8. Threshold 12 lets real matches through.
const HARDWIRED_MATCH_THRESHOLD = 12;

// ── AUTO-CALIBRATION ───────────────────────────────────────────────
// Instead of trusting static layout coordinates, we SEARCH for the
// actual card positions by sweeping a neighborhood around each nominal
// position and using the dHash matcher to find the best template match.
// This runs once (first frame with cards), caches the offset, and
// applies it to all subsequent frames. ~100ms one-time cost.

let _calibrationCache = null;
let _calibrationAttempts = 0;
const MAX_CALIBRATION_ATTEMPTS = 30; // try for first 30 frames (~7.5s at 4Hz)

/**
 * Auto-calibrate by searching around nominal positions for best template matches.
 * Returns a global Y-offset (and X-offset) that corrects ALL card positions.
 * Uses the actual dHash matcher, so it finds REAL cards, not just bright pixels.
 */
function autoCalibrate(videoElement, layout, matcher, scaleX, scaleY, offsetX, offsetY) {
  const videoW = videoElement.videoWidth || videoElement.width;
  const videoH = videoElement.videoHeight || videoElement.height;
  if (!videoW || !videoH) return null;

  // Draw full frame to canvas once
  const canvas = document.createElement('canvas');
  canvas.width = videoW;
  canvas.height = videoH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, videoW, videoH);

  // Try to calibrate using board cards (most reliable - 5 cards in a row)
  const boardCards = layout.boardCards || [];
  // Also try hole cards
  const holeCards = layout.holeCardsByVariant?.nlhe || layout.holeCards || [];

  const allRegions = [
    ...boardCards.map((r, i) => ({ ...r, kind: 'board', idx: i })),
    ...holeCards.map((r, i) => ({ ...r, kind: 'hole', idx: i })),
  ];

  // For each region, search Y from -100 to +50 and X from -40 to +40
  const SEARCH_Y_MIN = -100, SEARCH_Y_MAX = 50, STEP_Y = 5;
  const SEARCH_X_MIN = -40, SEARCH_X_MAX = 40, STEP_X = 5;

  // Collect best offsets from each region that finds a good match
  const goodOffsets = [];

  for (const region of allRegions) {
    const scaledW = Math.round(region.w * scaleX);
    const scaledH = Math.round(region.h * scaleY);
    const nomX = Math.round(region.x * scaleX + (offsetX || 0));
    const nomY = Math.round(region.y * scaleY + (offsetY || 0));

    let bestDist = 99;
    let bestDy = 0;
    let bestDx = 0;
    let bestKey = null;

    // Phase 1: Y-sweep (fix X at nominal)
    for (let dy = SEARCH_Y_MIN; dy <= SEARCH_Y_MAX; dy += STEP_Y) {
      const testY = nomY + dy;
      if (testY < 0 || testY + scaledH > videoH) continue;

      const testRegion = { x: nomX, y: testY, w: scaledW, h: scaledH };
      const result = matcher.matchRegion(canvas, testRegion, videoW, videoH, { skipOffsets: true, threshold: 15 });

      if (result.distance < bestDist) {
        bestDist = result.distance;
        bestDy = dy;
        bestKey = result.key;
      }
    }

    // Phase 2: X-sweep at best Y (refine X)
    if (bestDist < 15) {
      const fixedDy = bestDy;
      for (let dx = SEARCH_X_MIN; dx <= SEARCH_X_MAX; dx += STEP_X) {
        if (dx === 0) continue; // already tested
        const testX = nomX + dx;
        const testY = nomY + fixedDy;
        if (testX < 0 || testX + scaledW > videoW) continue;

        const testRegion = { x: testX, y: testY, w: scaledW, h: scaledH };
        const result = matcher.matchRegion(canvas, testRegion, videoW, videoH, { skipOffsets: true, threshold: 15 });

        if (result.distance < bestDist) {
          bestDist = result.distance;
          bestDx = dx;
          bestKey = result.key;
        }
      }
    }

    // Only trust matches with distance < 10 (strong match)
    if (bestDist < 10 && bestKey && bestKey !== 'back' && bestKey !== 'empty') {
      goodOffsets.push({
        kind: region.kind,
        idx: region.idx,
        dy: bestDy,
        dx: bestDx,
        distance: bestDist,
        key: bestKey,
      });
    }
  }

  if (goodOffsets.length === 0) return null;

  // Compute median offset (robust to outliers)
  const dyValues = goodOffsets.map(o => o.dy).sort((a, b) => a - b);
  const dxValues = goodOffsets.map(o => o.dx).sort((a, b) => a - b);
  const medianDy = dyValues[Math.floor(dyValues.length / 2)];
  const medianDx = dxValues[Math.floor(dxValues.length / 2)];

  // Convert pixel offsets back to reference-space offsets
  const refDy = Math.round(medianDy / scaleY);
  const refDx = Math.round(medianDx / scaleX);

  console.log(`[AutoCalibrate] Found ${goodOffsets.length} cards. Offset: dx=${refDx} dy=${refDy} (pixel: dx=${medianDx} dy=${medianDy})`);
  for (const o of goodOffsets) {
    console.log(`  ${o.kind}[${o.idx}] → ${o.key} d=${o.distance} dy=${o.dy} dx=${o.dx}`);
  }

  return {
    refDx,
    refDy,
    pixelDx: medianDx,
    pixelDy: medianDy,
    cardsFound: goodOffsets.length,
    details: goodOffsets,
  };
}

/**
 * Reset calibration cache (e.g., when layout or video source changes).
 */
export function resetCalibration() {
  _calibrationCache = null;
  _calibrationAttempts = 0;
}

/**
 * Get the current calibration offset (for overlay rendering).
 * Returns { pixelDx, pixelDy, refDx, refDy, cardsFound } or null if not calibrated.
 */
export function getCalibrationOffset() {
  return _calibrationCache;
}

// In hardwired mode we skip the crop-offset sweep entirely. Instead we do a
// single direct crop at the exact layout coordinates. This cuts per-region
// matching time by ~5x (no need to compute 5 offset hashes per region).

/**
 * Check if the current capture mode supports hardwired detection.
 * Hardwired mode works with screen share and any direct pixel capture.
 * Camera mode still needs the flexible detection path.
 *
 * @param {string} captureMode - 'screen' | 'camera' | 'window'
 * @returns {boolean}
 */
export function isHardwiredEligible(captureMode) {
  if (!captureMode) return false;
  const mode = String(captureMode).toLowerCase();
  // Screen share, window capture, and display capture all give pixel-perfect frames
  return mode === 'screen' || mode === 'window' || mode === 'display';
}

/**
 * Scale a region from layout reference space to actual video dimensions.
 * Supports offset for aspect-ratio-corrected scaling.
 */
function scaleRegion(region, scaleX, scaleY, offsetX, offsetY) {
  return {
    x: Math.round(region.x * scaleX + (offsetX || 0)),
    y: Math.round(region.y * scaleY + (offsetY || 0)),
    w: Math.round(region.w * scaleX),
    h: Math.round(region.h * scaleY),
  };
}

/**
 * Check if a video region is "empty" (uniform color, no card present).
 * PokerBros table felt is a dark, low-contrast surface. Card images are
 * high-contrast with distinct rank/suit markings. If the pixel variance
 * in a cropped region is below a threshold, there's no card there.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
 * @param {object} region - scaled region { x, y, w, h }
 * @returns {boolean} true if the region appears empty (no card)
 */
function isRegionEmpty(videoElement, region) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      videoElement,
      Math.max(0, region.x), Math.max(0, region.y), region.w, region.h,
      0, 0, region.w, region.h,
    );
    const data = ctx.getImageData(0, 0, region.w, region.h).data;
    // Compute mean and variance of grayscale values
    let sum = 0;
    let sumSq = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      sum += gray;
      sumSq += gray * gray;
    }
    const mean = sum / pixelCount;
    const variance = (sumSq / pixelCount) - (mean * mean);
    // Cards have high variance (white background + colored rank/suit).
    // Empty felt has variance < 200. Cards typically > 800.
    // Use 400 as threshold. With auto-calibration finding exact positions,
    // we can use a less aggressive threshold since boxes land on actual cards.
    return variance < 400;
  } catch (_) {
    return false;
  }
}

/**
 * Run hardwired detection on a single video frame.
 *
 * This is a streamlined version of detectCards() that:
 *   - Uses layout coordinates directly (no localizer)
 *   - Skips crop-offset sweeps (no jitter to absorb)
 *   - Uses a tighter match threshold
 *   - Provides explicit hardwired confidence metadata
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
 * @param {object} layout - layout.json with referenceSize, holeCardsByVariant, boardCards
 * @param {object} matcher - PokerBrainMatcher instance (loaded)
 * @param {object} [options]
 * @param {string} [options.variant] - 'nlhe' | 'plo' | 'plo5' | 'plo6' | 'plo_hilo'
 * @param {number} [options.maxHoleCards] - legacy cap
 * @param {boolean} [options.debug] - include probe log
 * @returns {object} detection result with hardwired metadata
 */
export function hardwiredDetect(videoElement, layout, matcher, options = {}) {
  if (!matcher || !matcher.isReady || !matcher.isReady() || !matcher.getTemplateCount()) {
    return {
      holeCards: [],
      boardCards: [],
      timingMs: 0,
      polledHoleCount: 0,
      hardwired: true,
      hardwiredThreshold: HARDWIRED_MATCH_THRESHOLD,
    };
  }

  const startTime = performance.now();

  const videoW = videoElement.videoWidth || videoElement.width;
  const videoH = videoElement.videoHeight || videoElement.height;
  if (!videoW || !videoH) {
    return {
      holeCards: [],
      boardCards: [],
      timingMs: 0,
      polledHoleCount: 0,
      hardwired: true,
      hardwiredThreshold: HARDWIRED_MATCH_THRESHOLD,
    };
  }

  // Scale from layout reference to actual video dimensions.
  const refW = layout.referenceSize?.w || 468;
  const refH = layout.referenceSize?.h || 932;
  const refAR = refW / refH;
  const videoAR = videoW / videoH;
  const arDiff = Math.abs(videoAR - refAR) / refAR;

  let scaleX, scaleY, offsetX = 0, offsetY = 0;

  if (arDiff <= 0.03) {
    scaleX = videoW / refW;
    scaleY = videoH / refH;
  } else {
    const uniformScale = Math.min(videoW / refW, videoH / refH);
    scaleX = uniformScale;
    scaleY = uniformScale;
    offsetX = Math.round((videoW - refW * uniformScale) / 2);
    offsetY = Math.round((videoH - refH * uniformScale) / 2);
  }

  // ── AUTO-CALIBRATION: find actual card positions on first frames ──
  if (!_calibrationCache && _calibrationAttempts < MAX_CALIBRATION_ATTEMPTS) {
    _calibrationAttempts++;
    try {
      const calibResult = autoCalibrate(videoElement, layout, matcher, scaleX, scaleY, offsetX, offsetY);
      if (calibResult && calibResult.cardsFound >= 2) {
        _calibrationCache = calibResult;
        console.log(`[HardwiredDetect] Auto-calibration LOCKED after ${_calibrationAttempts} frames: dx=${calibResult.refDx} dy=${calibResult.refDy} (${calibResult.cardsFound} cards)`);
      }
    } catch (e) {
      console.warn('[HardwiredDetect] Auto-calibration error:', e.message);
    }
  }

  // Apply calibration offset on top of AR offset
  if (_calibrationCache) {
    offsetX += _calibrationCache.pixelDx;
    offsetY += _calibrationCache.pixelDy;
  }

  // Resolve variant-specific hole card regions -- direct from layout, no localizer
  const variantKey = options.variant ? String(options.variant).toLowerCase() : null;
  const byVariant = layout.holeCardsByVariant;
  let holeRegions;

  if (variantKey && byVariant && Array.isArray(byVariant[variantKey])) {
    holeRegions = byVariant[variantKey];
  } else {
    const fallback = Array.isArray(layout.holeCards) ? layout.holeCards : [];
    const maxHole = Number.isFinite(options.maxHoleCards) && options.maxHoleCards > 0
      ? Math.min(options.maxHoleCards, fallback.length)
      : fallback.length;
    holeRegions = fallback.slice(0, maxHole);
  }

  const debugMode = !!options.debug;
  const topN = debugMode ? 3 : 0;

  // Delegate to matcher.matchAllRegions which handles:
  //   - Drawing video to offscreen canvas
  //   - Unified region capture (holeCardRegion + boardCardRegion)
  //   - Per-card matching within unified crops
  //   - Fallback to direct per-card matching when unified regions not defined
  // Hardwired mode: tighter threshold + skip crop-offset sweep
  const result = matcher.matchAllRegions(videoElement, layout, {
    variant: options.variant,
    maxHoleCards: options.maxHoleCards,
    debug: debugMode,
    topN,
    threshold: HARDWIRED_MATCH_THRESHOLD,
    skipOffsets: true,
    // Pass AR-corrected offset so matcher uses correct coordinates
    scaleOffsetX: offsetX,
    scaleOffsetY: offsetY,
  });

  // Suit-color verification pass + EMPTINESS CHECK for hole cards
  const variantRegions = layout.holeCardsByVariant?.[variantKey] || layout.holeCards || [];

  const verifiedHole = (result.holeCards || []).map((card, i) => {
    const r = variantRegions[i];
    if (!r || !card || !card.suit) return card;
    try {
      const scaledR = scaleRegion(r, scaleX, scaleY, offsetX, offsetY);
      // EMPTINESS CHECK: reject hole card matches on empty/uniform regions.
      // This is the PRIMARY defense against phantom detections — when
      // coordinates point at table felt, avatars, or UI elements that
      // happen to hash within threshold of a card template.
      if (isRegionEmpty(videoElement, scaledR)) {
        return { rank: null, suit: null, key: null, distance: 99, hardwired: true, emptyRegion: true };
      }
      const verified = verifyCardSuit(card, videoElement, scaledR);
      return { ...(verified || card), hardwired: true };
    } catch (_) {
      return { ...card, hardwired: true };
    }
  });

  const verifiedBoard = (result.boardCards || []).map((card, i) => {
    const r = layout.boardCards?.[i];
    if (!r || !card || !card.suit) return card;
    try {
      const scaledR = scaleRegion(r, scaleX, scaleY, offsetX, offsetY);
      // EMPTINESS CHECK: reject board card matches on empty felt regions.
      // This prevents phantom board detections where table background
      // happens to hash close to a card template.
      if (isRegionEmpty(videoElement, scaledR)) {
        return { rank: null, suit: null, key: null, distance: 99, hardwired: true, emptyRegion: true };
      }
      const verified = verifyCardSuit(card, videoElement, scaledR);
      return { ...(verified || card), hardwired: true };
    } catch (_) {
      return { ...card, hardwired: true };
    }
  });

  // ── DEDUPLICATION ──────────────────────────────────────────────────
  // A standard deck has exactly ONE of each card. If multiple regions
  // match the same card key (e.g. two slots both say "Th"), keep only
  // the one with the LOWEST distance (best match) and discard the rest.
  // This prevents impossible hands like "Th Th Th" caused by aspect-
  // ratio distortion making different cards hash to the same template.
  const dedup = (cards) => {
    const seen = new Map(); // key -> { index, distance }
    const keep = new Array(cards.length).fill(true);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c || !c.key) continue;
      const k = c.key;
      if (seen.has(k)) {
        const prev = seen.get(k);
        // Keep the lower-distance match
        if ((c.distance ?? 99) < (prev.distance ?? 99)) {
          keep[prev.index] = false;
          seen.set(k, { index: i, distance: c.distance });
        } else {
          keep[i] = false;
        }
      } else {
        seen.set(k, { index: i, distance: c.distance });
      }
    }
    return cards.filter((_, i) => keep[i]);
  };

  // Dedup hole cards and board cards independently, then cross-check
  // (a card can't appear in BOTH hole and board)
  let dedupedHole = dedup(verifiedHole);
  let dedupedBoard = dedup(verifiedBoard);

  // Cross-dedup: if the same card appears in both hole and board,
  // keep the one with the lower distance
  const holeKeys = new Map();
  for (const c of dedupedHole) {
    if (c && c.key) holeKeys.set(c.key, c.distance ?? 99);
  }
  dedupedBoard = dedupedBoard.filter(c => {
    if (!c || !c.key) return true;
    if (holeKeys.has(c.key)) {
      // Keep in whichever group has lower distance
      return (c.distance ?? 99) < holeKeys.get(c.key);
    }
    return true;
  });
  const boardKeys = new Set(dedupedBoard.filter(c => c && c.key).map(c => c.key));
  dedupedHole = dedupedHole.filter(c => {
    if (!c || !c.key) return true;
    return !boardKeys.has(c.key);
  });

  const timingMs = performance.now() - startTime;

  // Compute hardwired-specific stats
  const allCards = [...dedupedHole, ...dedupedBoard];
  const matchDistances = allCards.filter(c => c && c.distance != null).map(c => c.distance);
  const avgDistance = matchDistances.length > 0
    ? Math.round(matchDistances.reduce((a, b) => a + b, 0) / matchDistances.length * 10) / 10
    : null;
  const maxDistance = matchDistances.length > 0
    ? Math.max(...matchDistances)
    : null;
  const perfectMatches = matchDistances.filter(d => d <= 2).length;

  const output = {
    holeCards: dedupedHole,
    boardCards: dedupedBoard,
    timingMs: Math.round(timingMs * 10) / 10,
    polledHoleCount: holeRegions.length,
    // Hardwired metadata
    hardwired: true,
    hardwiredThreshold: HARDWIRED_MATCH_THRESHOLD,
    hardwiredStats: {
      avgDistance,
      maxDistance,
      perfectMatches,
      totalDetected: allCards.length,
      allPerfect: maxDistance !== null && maxDistance <= 3,
    },
  };

  if (debugMode && result.probeLog) {
    output.probeLog = result.probeLog;
  }

  return output;
}

/**
 * Validate that the screen capture resolution matches the expected
 * PokerBros layout. If the aspect ratio is significantly different,
 * hardwired coordinates may be wrong.
 *
 * @param {number} videoW - captured video width
 * @param {number} videoH - captured video height
 * @param {object} layout - layout.json
 * @returns {{ valid: boolean, reason?: string, scaleFactor?: number }}
 */
export function validateHardwiredResolution(videoW, videoH, layout) {
  if (!videoW || !videoH) {
    return { valid: false, reason: 'No video dimensions' };
  }

  const refW = layout.referenceSize?.w || 468;
  const refH = layout.referenceSize?.h || 932;
  const refAR = refW / refH;
  const videoAR = videoW / videoH;

  // Allow up to 5% aspect ratio deviation
  const arDiff = Math.abs(videoAR - refAR) / refAR;
  if (arDiff > 0.05) {
    return {
      valid: false,
      reason: `Aspect ratio mismatch: video is ${videoW}x${videoH} (${videoAR.toFixed(3)}), layout expects ${refW}x${refH} (${refAR.toFixed(3)})`,
    };
  }

  const scaleFactor = videoW / refW;
  return { valid: true, scaleFactor };
}

export default hardwiredDetect;
