/**
 * Poker Brain — Detection Loop (Pure Module)
 * ============================================
 * Extracts card detection into a pure, testable function.
 * Input:  video element + layout + matcher + options
 * Output: { holeCards, boardCards, confidence, timing, probeLog }
 *
 * No side effects, no state management, no rendering.
 * This module is independently testable against ground-truth frames.
 */

import { verifyCardSuit } from './suit-color.js';

/**
 * Scale a region from layout reference space to actual video dimensions.
 */
function scaleRegion(region, scaleX, scaleY) {
  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    w: Math.round(region.w * scaleX),
    h: Math.round(region.h * scaleY),
  };
}

/**
 * Detect all cards in a single video frame.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
 * @param {object} layout — layout-capture.json (with referenceSize, boardCards, holeCardsByVariant)
 * @param {object} matcher — PokerBrainMatcher instance (loaded)
 * @param {object} [options]
 * @param {string} [options.variant] — 'nlhe' | 'plo' | 'plo5' | 'plo6' | 'plo_hilo'
 * @param {number} [options.maxHoleCards] — legacy fallback cap
 * @param {boolean} [options.debug] — include probe log and crop previews
 * @param {number} [options.topN] — top-N candidates in debug mode
 * @returns {{ holeCards: Array, boardCards: Array, timingMs: number, polledHoleCount: number, probeLog?: Array, cropPreviews?: Array }}
 */
export function detectCards(videoElement, layout, matcher, options = {}) {
  if (!matcher || !matcher.isReady() || !matcher.getTemplateCount()) {
    return { holeCards: [], boardCards: [], timingMs: 0, polledHoleCount: 0 };
  }

  const startTime = performance.now();

  const videoW = videoElement.videoWidth || videoElement.width;
  const videoH = videoElement.videoHeight || videoElement.height;
  if (!videoW || !videoH) {
    return { holeCards: [], boardCards: [], timingMs: 0, polledHoleCount: 0 };
  }

  // Scale from layout reference to actual video dimensions
  const refW = layout.referenceSize?.w || 480;
  const refH = layout.referenceSize?.h || 1054;
  const scaleX = videoW / refW;
  const scaleY = videoH / refH;

  // Resolve variant-specific hole card regions
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
  const topN = debugMode ? (Number.isFinite(options.topN) ? options.topN : 3) : 0;

  // Run the matcher against all regions
  const result = matcher.matchAllRegions(videoElement, layout, {
    variant: options.variant,
    maxHoleCards: options.maxHoleCards,
    debug: debugMode,
    topN,
  });

  // Suit-color verification pass (PokerBros 4-color deck sanity check)
  const variantRegions = layout.holeCardsByVariant?.[variantKey] || layout.holeCards || [];

  const verifiedHole = (result.holeCards || []).map((card, i) => {
    const r = variantRegions[i];
    if (!r || !card || !card.suit) return card;
    const scaledR = scaleRegion(r, scaleX, scaleY);
    return verifyCardSuit(card, videoElement, scaledR);
  });

  const verifiedBoard = (result.boardCards || []).map((card, i) => {
    const r = layout.boardCards?.[i];
    if (!r || !card || !card.suit) return card;
    const scaledR = scaleRegion(r, scaleX, scaleY);
    return verifyCardSuit(card, videoElement, scaledR);
  });

  const timingMs = performance.now() - startTime;

  const output = {
    holeCards: verifiedHole,
    boardCards: verifiedBoard,
    timingMs: Math.round(timingMs * 10) / 10,
    polledHoleCount: holeRegions.length,
  };

  // Debug: include probe log
  if (debugMode && result.probeLog) {
    output.probeLog = result.probeLog;
  }

  // Debug: generate crop preview data URIs
  if (debugMode) {
    try {
      const cropPreviews = [];
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');

      const allRegions = [
        ...holeRegions.map((r, i) => ({ label: `hole${i}`, region: r })),
        ...(layout.boardCards || []).map((r, i) => ({ label: `board${i}`, region: r })),
      ];

      for (const { label, region } of allRegions) {
        const sx = Math.round(region.x * scaleX);
        const sy = Math.round(region.y * scaleY);
        const sw = Math.round(region.w * scaleX);
        const sh = Math.round(region.h * scaleY);
        if (sw > 0 && sh > 0) {
          cropCanvas.width = sw;
          cropCanvas.height = sh;
          cropCtx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, sw, sh);
          cropPreviews.push({
            label,
            src: cropCanvas.toDataURL('image/png'),
            region: `${sx},${sy} ${sw}x${sh}`,
          });
        }
      }
      output.cropPreviews = cropPreviews;
    } catch (_) { /* swallow */ }
  }

  return output;
}

/**
 * Run OCR on a single named region.
 * @param {HTMLCanvasElement} fullFrameCanvas — full frame drawn to canvas
 * @param {object} layout — layout with ocrRegions
 * @param {object} ocr — OCR engine instance
 * @param {string} regionName — e.g. 'pot', 'heroStack'
 * @param {string} method — OCR method name, e.g. 'readPotSize'
 * @param {number} scaleX — video/ref width ratio
 * @param {number} scaleY — video/ref height ratio
 * @returns {Promise<any>}
 */
export async function ocrRegion(fullFrameCanvas, layout, ocr, regionName, method, scaleX, scaleY) {
  const raw = layout.ocrRegions?.[regionName];
  if (!raw) return null;

  const rect = {
    x: raw.x * scaleX,
    y: raw.y * scaleY,
    w: raw.w * scaleX,
    h: raw.h * scaleY,
  };

  // Crop the region
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(rect.w));
  c.height = Math.max(1, Math.floor(rect.h));
  const ctx = c.getContext('2d');
  ctx.drawImage(
    fullFrameCanvas,
    Math.max(0, Math.floor(rect.x)),
    Math.max(0, Math.floor(rect.y)),
    Math.max(1, Math.floor(rect.w)),
    Math.max(1, Math.floor(rect.h)),
    0, 0, c.width, c.height,
  );

  try {
    return await ocr[method](c, { cacheKey: regionName });
  } catch (_) {
    return null;
  }
}

export default detectCards;
