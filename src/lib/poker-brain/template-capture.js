/**
 * Poker Brain -- Template Capture & Live Learning
 * =================================================
 * Captures card crops from the live video feed and either:
 *   1. Downloads them as 64x88 PNG template files (for permanent storage)
 *   2. Injects their hashes directly into the matcher (for immediate use)
 *
 * This solves the template mismatch problem: when the PokerBros skin/theme
 * changes or the emulator rendering differs from the original templates,
 * detection distances jump from 0-3 to 15-23 and nothing matches.
 *
 * Usage from HUD:
 *   import { captureCardCrops, injectLiveHashes, downloadAllCrops } from './template-capture';
 *
 *   // Capture crops from current frame
 *   const crops = captureCardCrops(videoElement, layout, { variant: 'nlhe' });
 *
 *   // Inject hashes into matcher for immediate use
 *   injectLiveHashes(matcher, crops, cardLabels);
 *
 *   // Download crops as PNG files
 *   downloadAllCrops(crops);
 */

const TEMPLATE_W = 64;
const TEMPLATE_H = 88;

/**
 * Capture card crops from a video element at exact layout coordinates.
 * Returns an array of { slot, kind, canvas, dataUrl } objects.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
 * @param {object} layout - layout-capture.json
 * @param {object} options
 * @param {string} [options.variant='nlhe'] - game variant
 * @returns {Array<{slot: number, kind: string, region: object, canvas: HTMLCanvasElement, dataUrl: string}>}
 */
export function captureCardCrops(videoElement, layout, options = {}) {
  const videoW = videoElement.videoWidth || videoElement.width;
  const videoH = videoElement.videoHeight || videoElement.height;
  if (!videoW || !videoH) return [];

  const refW = layout.referenceSize?.w || 468;
  const refH = layout.referenceSize?.h || 932;
  const scaleX = videoW / refW;
  const scaleY = videoH / refH;

  const variant = options.variant || 'nlhe';
  const holeRegions = layout.holeCardsByVariant?.[variant] || layout.holeCards || [];
  const boardRegions = layout.boardCards || [];

  // Draw video to a full-size offscreen canvas once
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = videoW;
  fullCanvas.height = videoH;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.drawImage(videoElement, 0, 0, videoW, videoH);

  const crops = [];

  // Capture hole cards
  holeRegions.forEach((region, i) => {
    const scaled = {
      x: Math.round(region.x * scaleX),
      y: Math.round(region.y * scaleY),
      w: Math.round(region.w * scaleX),
      h: Math.round(region.h * scaleY),
    };
    const crop = cropAndResize(fullCanvas, scaled);
    crops.push({
      slot: i,
      kind: 'hole',
      region: scaled,
      canvas: crop.canvas,
      dataUrl: crop.dataUrl,
    });
  });

  // Capture board cards
  boardRegions.forEach((region, i) => {
    const scaled = {
      x: Math.round(region.x * scaleX),
      y: Math.round(region.y * scaleY),
      w: Math.round(region.w * scaleX),
      h: Math.round(region.h * scaleY),
    };
    const crop = cropAndResize(fullCanvas, scaled);
    crops.push({
      slot: i,
      kind: 'board',
      region: scaled,
      canvas: crop.canvas,
      dataUrl: crop.dataUrl,
    });
  });

  return crops;
}

/**
 * Crop a region from a canvas and resize to TEMPLATE_W x TEMPLATE_H (64x88).
 */
function cropAndResize(sourceCanvas, region) {
  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    sourceCanvas,
    Math.max(0, region.x), Math.max(0, region.y),
    Math.max(1, region.w), Math.max(1, region.h),
    0, 0,
    TEMPLATE_W, TEMPLATE_H,
  );

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

/**
 * Capture a full-frame screenshot from the video element and return as data URL.
 * Useful for visual debugging of what the video feed actually contains.
 */
export function captureFullFrame(videoElement) {
  const videoW = videoElement.videoWidth || videoElement.width;
  const videoH = videoElement.videoHeight || videoElement.height;
  if (!videoW || !videoH) return null;

  const canvas = document.createElement('canvas');
  canvas.width = videoW;
  canvas.height = videoH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, videoW, videoH);

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    width: videoW,
    height: videoH,
  };
}

/**
 * Download a single crop as a PNG file.
 */
export function downloadCrop(crop, filename) {
  const link = document.createElement('a');
  link.download = filename || `crop_${crop.kind}_${crop.slot}.png`;
  link.href = crop.dataUrl;
  link.click();
}

/**
 * Download all crops as individual PNG files.
 * If labels are provided, uses them as filenames (e.g., 'Ah.png', 'Kd.png').
 */
export function downloadAllCrops(crops, labels = null) {
  crops.forEach((crop, i) => {
    const filename = labels && labels[i]
      ? `${labels[i]}.png`
      : `crop_${crop.kind}_${crop.slot}.png`;
    setTimeout(() => downloadCrop(crop, filename), i * 200); // stagger downloads
  });
}

/**
 * Inject live-captured card hashes directly into the matcher's templateHashes map.
 * This enables immediate detection without needing to save/reload PNG files.
 *
 * @param {PokerBrainMatcher} matcher
 * @param {Array} crops - from captureCardCrops()
 * @param {Array<string>} labels - card keys like ['Ah', 'Kd', '7s', ...]
 *   Must be same length as crops. null entries are skipped.
 */
export function injectLiveHashes(matcher, crops, labels) {
  if (!matcher || !matcher.templateHashes) return 0;

  // We need access to the hash functions from matcher.js
  // Since they're not exported, we'll compute hashes using the same algorithm
  let injected = 0;

  crops.forEach((crop, i) => {
    const label = labels?.[i];
    if (!label || label === 'back' || label === 'empty' || label === 'unknown') return;

    const ctx = crop.canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);

    const dHash = computeDHashLocal(imageData);
    const aHash = computeAHashLocal(imageData);

    matcher.templateHashes.set(label, { dHash, aHash });
    injected++;
  });

  return injected;
}

// ---- Local hash implementations ----
// CRITICAL: These MUST return [hi, lo] (two 32-bit integers) to match
// matcher.js's format. The original implementation returned Uint8Array(8)
// which is INCOMPATIBLE with the matcher's hammingDistance() function
// that expects hash[0] and hash[1] to be 32-bit integer halves.

function computeAHashLocal(imageData) {
  const { data, width, height } = imageData;
  const size = 8;
  const gray = new Float64Array(size * size);
  let totalSum = 0;

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const srcX0 = Math.floor((dx / size) * width);
      const srcY0 = Math.floor((dy / size) * height);
      const srcX1 = Math.floor(((dx + 1) / size) * width);
      const srcY1 = Math.floor(((dy + 1) / size) * height);
      let sum = 0, count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * width + sx) * 4;
          sum += data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          count++;
        }
      }
      const val = count > 0 ? sum / count : 0;
      gray[dy * size + dx] = val;
      totalSum += val;
    }
  }

  const avg = totalSum / 64;
  let hi = 0, lo = 0;
  for (let i = 0; i < 32; i++) { if (gray[i] > avg) hi |= (1 << (31 - i)); }
  for (let i = 32; i < 64; i++) { if (gray[i] > avg) lo |= (1 << (63 - i)); }
  return [hi, lo];
}

function computeDHashLocal(imageData) {
  const { data, width, height } = imageData;
  const DHASH_SIZE = 9;
  const gray = new Float64Array(DHASH_SIZE * DHASH_SIZE);

  for (let dy = 0; dy < DHASH_SIZE; dy++) {
    for (let dx = 0; dx < DHASH_SIZE; dx++) {
      const srcX0 = Math.floor((dx / DHASH_SIZE) * width);
      const srcY0 = Math.floor((dy / DHASH_SIZE) * height);
      const srcX1 = Math.floor(((dx + 1) / DHASH_SIZE) * width);
      const srcY1 = Math.floor(((dy + 1) / DHASH_SIZE) * height);
      let sum = 0, count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * width + sx) * 4;
          sum += data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          count++;
        }
      }
      gray[dy * DHASH_SIZE + dx] = count > 0 ? sum / count : 0;
    }
  }

  const hashBits = new Uint8Array(64);
  let bitIndex = 0;
  for (let y = 0; y < DHASH_SIZE - 1; y++) {
    for (let x = 0; x < DHASH_SIZE - 1; x++) {
      hashBits[bitIndex] = gray[y * DHASH_SIZE + x] > gray[y * DHASH_SIZE + x + 1] ? 1 : 0;
      bitIndex++;
    }
  }

  let hi = 0, lo = 0;
  for (let i = 0; i < 32; i++) { if (hashBits[i]) hi |= (1 << (31 - i)); }
  for (let i = 32; i < 64; i++) { if (hashBits[i]) lo |= (1 << (63 - i)); }
  return [hi, lo];
}

/**
 * Auto-calibrate: capture crops from the live video at ALL card positions,
 * match each against existing templates (accepting ANY distance), and inject
 * the live crop hashes as the matched card label. This recalibrates the
 * template hashes to the exact video resolution, dropping distances from
 * 10-25 down to 0-3 on all subsequent frames.
 *
 * Should be called once after screen capture starts (when cards are visible).
 *
 * @param {HTMLVideoElement} videoElement
 * @param {object} layout - layout-capture.json
 * @param {PokerBrainMatcher} matcher
 * @param {object} options
 * @param {string} [options.variant='nlhe']
 * @param {number} [options.maxDistance=25] - reject matches worse than this
 * @returns {{ injected: number, matches: Array }}
 */
export function autoCalibrateLive(videoElement, layout, matcher, options = {}) {
  if (!matcher || !matcher.templateHashes || matcher.templateHashes.size === 0) {
    return { injected: 0, matches: [] };
  }

  const variant = options.variant || 'nlhe';
  const maxDistance = options.maxDistance ?? 25;

  // Capture crops from current frame
  const crops = captureCardCrops(videoElement, layout, { variant });
  if (crops.length === 0) return { injected: 0, matches: [] };

  const matches = [];
  let injected = 0;

  for (const crop of crops) {
    const ctx = crop.canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
    const liveDHash = computeDHashLocal(imageData);
    const liveAHash = computeAHashLocal(imageData);

    // Find best matching template at ANY distance
    let bestKey = null;
    let bestDist = Infinity;
    for (const [key, tplHash] of matcher.templateHashes) {
      if (key === 'back' || key === 'empty') continue;
      const dDist = popcount32((liveDHash[0] ^ tplHash.dHash[0]) >>> 0) +
                    popcount32((liveDHash[1] ^ tplHash.dHash[1]) >>> 0);
      const aDist = popcount32((liveAHash[0] ^ tplHash.aHash[0]) >>> 0) +
                    popcount32((liveAHash[1] ^ tplHash.aHash[1]) >>> 0);
      const dist = Math.min(dDist, aDist);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }

    matches.push({
      kind: crop.kind, slot: crop.slot,
      bestKey, bestDist,
      accepted: bestDist <= maxDistance,
    });

    // Inject if match is reasonable
    if (bestKey && bestDist <= maxDistance) {
      matcher.templateHashes.set(bestKey, { dHash: liveDHash, aHash: liveAHash });
      injected++;
    }
  }

  console.log(`[AutoCal] Injected ${injected}/${crops.length} live hashes (variant=${variant})`);
  matches.forEach(m => {
    console.log(`  ${m.kind}[${m.slot}] -> ${m.bestKey} dist=${m.bestDist} ${m.accepted ? 'OK' : 'SKIP'}`);
  });

  // Persist injected hashes so they survive page reload.
  // Without this, calibration data is lost on refresh and the matcher
  // reverts to stock template hashes (which have high distances).
  if (injected > 0) {
    try { persistCalibratedHashes(matcher.templateHashes); } catch (_) {}
  }

  return { injected, matches };
}

// Popcount for 32-bit integer (Brian Kernighan)
function popcount32(v) {
  let c = 0;
  while (v) { v &= v - 1; c++; }
  return c;
}

// ---- Hand-Strength-Verified Auto-Calibration ----
// Parses OCR handStrength text (e.g., "Pair of Kings") to extract rank info,
// then only injects hashes for cards that are CONSISTENT with the hand strength.
// This prevents circular corruption where a wrong match at distance 20+ gets
// injected and progressively poisons the entire hash map.

const RANK_ALIASES = {
  ace: 'A', aces: 'A', king: 'K', kings: 'K', queen: 'Q', queens: 'Q',
  jack: 'J', jacks: 'J', ten: 'T', tens: 'T', nine: '9', nines: '9',
  eight: '8', eights: '8', seven: '7', sevens: '7', six: '6', sixes: '6',
  five: '5', fives: '5', four: '4', fours: '4', three: '3', threes: '3',
  two: '2', twos: '2', deuce: '2', deuces: '2',
};

/**
 * Parse hand strength text from OCR into a set of ranks that must be present
 * in the hero's hole cards. Returns { ranks: Set<string>, confidence: string }.
 *
 * Examples:
 *   "Pair of Kings"      -> { ranks: Set(['K']), confidence: 'rank' }
 *   "Two Pair, A and 7"  -> { ranks: Set(['A','7']), confidence: 'rank' }
 *   "High Card"          -> { ranks: Set(), confidence: 'none' }
 *   null                 -> { ranks: Set(), confidence: 'none' }
 */
export function parseHandStrength(text) {
  if (!text || typeof text !== 'string') return { ranks: new Set(), confidence: 'none' };

  const t = text.toLowerCase().trim();
  const foundRanks = new Set();

  // Match rank words or single rank chars preceded by space/start
  for (const [word, rank] of Object.entries(RANK_ALIASES)) {
    if (t.includes(word)) foundRanks.add(rank);
  }

  // Also check for single-char ranks like "A" "K" in "Two Pair, A and 7"
  const singleRankPattern = /\b([AKQJT2-9])\b/gi;
  let m;
  while ((m = singleRankPattern.exec(text)) !== null) {
    foundRanks.add(m[1].toUpperCase());
  }

  return {
    ranks: foundRanks,
    confidence: foundRanks.size > 0 ? 'rank' : 'none',
  };
}

/**
 * Verified auto-calibration: only inject hashes when the matched card
 * is consistent with the OCR hand strength. Falls back to tight threshold
 * matching when no hand strength info is available.
 *
 * @param {HTMLVideoElement} videoElement
 * @param {object} layout
 * @param {PokerBrainMatcher} matcher
 * @param {object} options
 * @param {string} [options.variant='nlhe']
 * @param {string} [options.handStrength] - OCR hand strength text
 * @param {number} [options.verifiedMaxDistance=20] - max dist when verified by hand strength
 * @param {number} [options.unverifiedMaxDistance=10] - max dist when NO hand strength (tight)
 * @returns {{ injected: number, rejected: number, matches: Array }}
 */
export function verifiedAutoCalibrate(videoElement, layout, matcher, options = {}) {
  if (!matcher || !matcher.templateHashes || matcher.templateHashes.size === 0) {
    return { injected: 0, rejected: 0, matches: [] };
  }

  const variant = options.variant || 'nlhe';
  const handStrength = options.handStrength || null;
  const verifiedMaxDist = options.verifiedMaxDistance ?? 20;
  const unverifiedMaxDist = options.unverifiedMaxDistance ?? 10;

  const { ranks: hsRanks, confidence: hsConf } = parseHandStrength(handStrength);

  const crops = captureCardCrops(videoElement, layout, { variant });
  if (crops.length === 0) return { injected: 0, rejected: 0, matches: [] };

  const matches = [];
  let injected = 0;
  let rejected = 0;

  for (const crop of crops) {
    const ctx = crop.canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
    const liveDHash = computeDHashLocal(imageData);
    const liveAHash = computeAHashLocal(imageData);

    let bestKey = null;
    let bestDist = Infinity;
    let bestDDist = Infinity;
    let bestADist = Infinity;
    for (const [key, tplHash] of matcher.templateHashes) {
      if (key === 'back' || key === 'empty') continue;
      const dDist = popcount32((liveDHash[0] ^ tplHash.dHash[0]) >>> 0) +
                    popcount32((liveDHash[1] ^ tplHash.dHash[1]) >>> 0);
      const aDist = popcount32((liveAHash[0] ^ tplHash.aHash[0]) >>> 0) +
                    popcount32((liveAHash[1] ^ tplHash.aHash[1]) >>> 0);
      const dist = Math.min(dDist, aDist);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = key;
        bestDDist = dDist;
        bestADist = aDist;
      }
    }

    // Determine if this match should be accepted
    let accept = false;
    let reason = '';

    if (bestKey && crop.kind === 'hole' && hsConf === 'rank') {
      // Hole card: verify rank against hand strength
      const matchedRank = bestKey.charAt(0).toUpperCase();
      if (hsRanks.has(matchedRank) && bestDist <= verifiedMaxDist) {
        accept = true;
        reason = 'verified-rank';
      } else if (!hsRanks.has(matchedRank)) {
        reason = 'rank-mismatch';
      } else {
        reason = 'dist-too-high';
      }
    } else if (bestKey && bestDist <= unverifiedMaxDist) {
      // Board card or no hand strength: use tight threshold only
      accept = true;
      reason = crop.kind === 'board' ? 'board-tight' : 'unverified-tight';
    } else {
      reason = bestKey ? 'dist-too-high' : 'no-match';
    }

    matches.push({
      kind: crop.kind, slot: crop.slot,
      bestKey, bestDist, bestDDist, bestADist,
      accepted: accept, reason,
    });

    if (accept && bestKey) {
      matcher.templateHashes.set(bestKey, { dHash: liveDHash, aHash: liveAHash });
      injected++;
    } else {
      rejected++;
    }
  }

  console.log(`[VerifiedCal] ${injected} injected, ${rejected} rejected (handStrength="${handStrength || 'none'}", ranks=[${[...hsRanks]}])`);
  matches.forEach(m => {
    console.log(`  ${m.kind}[${m.slot}] -> ${m.bestKey} dist=${m.bestDist} ${m.accepted ? 'OK' : 'SKIP'} (${m.reason})`);
  });

  return { injected, rejected, matches };
}

// ---- localStorage Persistence ----
// Save auto-calibrated hashes so they survive page refreshes.
// Key format: 'pb-cal-{label}' → JSON { dHash: [hi, lo], aHash: [hi, lo] }

const CAL_STORAGE_PREFIX = 'pb-cal-';
const CAL_META_KEY = 'pb-cal-meta';

/**
 * Persist all calibrated template hashes to localStorage.
 * Call after autoCalibrateLive() succeeds.
 *
 * @param {Map<string, {dHash: number[], aHash: number[]}>} templateHashes
 * @returns {number} count of entries saved
 */
export function persistCalibratedHashes(templateHashes) {
  if (!templateHashes || typeof localStorage === 'undefined') return 0;
  let saved = 0;
  const keys = [];
  for (const [label, hash] of templateHashes) {
    if (!hash || !hash.dHash || !hash.aHash) continue;
    try {
      localStorage.setItem(
        CAL_STORAGE_PREFIX + label,
        JSON.stringify({ dHash: hash.dHash, aHash: hash.aHash }),
      );
      keys.push(label);
      saved++;
    } catch (_) { /* quota exceeded — skip silently */ }
  }
  try {
    localStorage.setItem(CAL_META_KEY, JSON.stringify({
      keys,
      savedAt: Date.now(),
      count: saved,
    }));
  } catch (_) { /* ignore */ }
  console.log(`[TemplateCal] Persisted ${saved} calibrated hashes to localStorage`);
  return saved;
}

/**
 * Restore previously calibrated hashes from localStorage into the matcher.
 * Returns the number of hashes restored. If stale (>24h), returns 0.
 *
 * @param {PokerBrainMatcher} matcher
 * @param {object} [options]
 * @param {number} [options.maxAgeMs=86400000] - max age before considering stale (default 24h)
 * @returns {number} count restored
 */
export function restoreCalibratedHashes(matcher, options = {}) {
  if (!matcher || !matcher.templateHashes || typeof localStorage === 'undefined') return 0;
  const maxAge = options.maxAgeMs ?? 86400000; // 24 hours

  try {
    const metaStr = localStorage.getItem(CAL_META_KEY);
    if (!metaStr) return 0;
    const meta = JSON.parse(metaStr);
    if (Date.now() - (meta.savedAt || 0) > maxAge) {
      console.log('[TemplateCal] Cached hashes are stale (>24h), skipping restore');
      return 0;
    }

    let restored = 0;
    for (const label of (meta.keys || [])) {
      const raw = localStorage.getItem(CAL_STORAGE_PREFIX + label);
      if (!raw) continue;
      try {
        const hash = JSON.parse(raw);
        if (Array.isArray(hash.dHash) && Array.isArray(hash.aHash)) {
          matcher.templateHashes.set(label, hash);
          restored++;
        }
      } catch (_) { /* corrupt entry */ }
    }
    console.log(`[TemplateCal] Restored ${restored} calibrated hashes from localStorage`);
    return restored;
  } catch (_) {
    return 0;
  }
}

/**
 * Clear all calibrated hashes from localStorage.
 */
export function clearCalibratedHashes() {
  if (typeof localStorage === 'undefined') return;
  try {
    const metaStr = localStorage.getItem(CAL_META_KEY);
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      for (const label of (meta.keys || [])) {
        localStorage.removeItem(CAL_STORAGE_PREFIX + label);
      }
    }
    localStorage.removeItem(CAL_META_KEY);
    console.log('[TemplateCal] Cleared all calibrated hashes from localStorage');
  } catch (_) { /* ignore */ }
}

export default captureCardCrops;
