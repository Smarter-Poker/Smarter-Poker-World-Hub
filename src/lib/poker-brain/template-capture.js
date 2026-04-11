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

// ---- Local hash implementations (mirrors matcher.js) ----

function computeAHashLocal(imageData) {
  const { data, width, height } = imageData;
  // Resize to 8x8 grayscale
  const size = 8;
  const gray = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX = Math.floor(x * width / size);
      const srcY = Math.floor(y * height / size);
      const idx = (srcY * width + srcX) * 4;
      gray[y * size + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const avg = sum / gray.length;

  const hash = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if (gray[i] >= avg) {
      hash[i >> 3] |= (1 << (7 - (i & 7)));
    }
  }
  return hash;
}

function computeDHashLocal(imageData) {
  const { data, width, height } = imageData;
  const DHASH_SIZE = 9;
  const gray = new Float32Array(DHASH_SIZE * DHASH_SIZE);

  for (let y = 0; y < DHASH_SIZE; y++) {
    for (let x = 0; x < DHASH_SIZE; x++) {
      const srcX = Math.floor(x * width / DHASH_SIZE);
      const srcY = Math.floor(y * height / DHASH_SIZE);
      const idx = (srcY * width + srcX) * 4;
      gray[y * DHASH_SIZE + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  const hash = new Uint8Array(8);
  let bitIndex = 0;
  for (let y = 0; y < DHASH_SIZE - 1; y++) {
    for (let x = 0; x < DHASH_SIZE - 1; x++) {
      const left = gray[y * DHASH_SIZE + x];
      const right = gray[y * DHASH_SIZE + x + 1];
      if (left > right) {
        hash[bitIndex >> 3] |= (1 << (7 - (bitIndex & 7)));
      }
      bitIndex++;
    }
  }
  return hash;
}

export default captureCardCrops;
