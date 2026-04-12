/**
 * Template Extractor -- Captures fresh 64x88 PNG templates from live PokerBros
 *
 * Solves the root cause of detection failures: template hash mismatch from
 * extracting PNGs from a different rendering than the live emulator.
 *
 * Usage from HUD:
 *   1. User deals a known hand (they can see the cards on screen)
 *   2. Tool crops each card region from the live video frame
 *   3. User labels each visible card via a picker UI
 *   4. Tool computes hashes, injects into matcher, and optionally saves PNGs
 *
 * Hash algorithms are IDENTICAL to template-capture.js to ensure compatibility
 * with matcher.js hammingDistance(). Format: [hi, lo] (two 32-bit integers).
 */

const TEMPLATE_W = 64;
const TEMPLATE_H = 88;
const DHASH_SIZE = 9;

// ---------------------------------------------------------------------------
// Hash algorithms -- exact copies from template-capture.js
// DO NOT modify independently; they MUST produce identical output.
// ---------------------------------------------------------------------------

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

  // 8 rows x 8 cols = 64 bits (NOT 9x8 = 72)
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

// ---------------------------------------------------------------------------
// Crop helper -- crops a region from a source canvas and resizes to 64x88
// Uses drawImage for proper bilinear downscaling (NOT putImageData which
// does pixel-for-pixel copy with truncation).
// ---------------------------------------------------------------------------

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
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract card crops from a live video frame at layout coordinates.
 * Returns array of { slot, kind, canvas, dataUrl, imageData }.
 */
export function extractTemplatesFromFrame(videoElement, layout, options = {}) {
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

  // Capture full frame once
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = videoW;
  fullCanvas.height = videoH;
  fullCanvas.getContext('2d').drawImage(videoElement, 0, 0, videoW, videoH);

  const crops = [];

  holeRegions.forEach((region, i) => {
    const scaled = {
      x: Math.round(region.x * scaleX),
      y: Math.round(region.y * scaleY),
      w: Math.round(region.w * scaleX),
      h: Math.round(region.h * scaleY),
    };
    const canvas = cropAndResize(fullCanvas, scaled);
    const ctx = canvas.getContext('2d');
    crops.push({
      slot: i, kind: 'hole', canvas,
      dataUrl: canvas.toDataURL('image/png'),
      imageData: ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H),
    });
  });

  boardRegions.forEach((region, i) => {
    const scaled = {
      x: Math.round(region.x * scaleX),
      y: Math.round(region.y * scaleY),
      w: Math.round(region.w * scaleX),
      h: Math.round(region.h * scaleY),
    };
    const canvas = cropAndResize(fullCanvas, scaled);
    const ctx = canvas.getContext('2d');
    crops.push({
      slot: i, kind: 'board', canvas,
      dataUrl: canvas.toDataURL('image/png'),
      imageData: ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H),
    });
  });

  return crops;
}

/**
 * Compute dHash + aHash for a 64x88 canvas.
 * Returns { dHash: [hi, lo], aHash: [hi, lo] }.
 */
export function computeTemplateHashes(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H);
  return {
    dHash: computeDHashLocal(imageData),
    aHash: computeAHashLocal(imageData),
  };
}

/**
 * Build a labeled template bundle from crops.
 * @param {Array} crops - from extractTemplatesFromFrame
 * @param {Object} labels - { 0: 'Ah', 1: 'Kd', ... } slot index -> card key
 * @returns {{ templates: Map, count: number }}
 */
export function buildTemplateBundle(crops, labels) {
  const templates = new Map();
  for (let i = 0; i < crops.length; i++) {
    const key = labels?.[i];
    if (!key || key === 'back' || key === 'empty' || key === 'unknown') continue;
    const hashes = computeTemplateHashes(crops[i].canvas);
    templates.set(key, {
      dHash: hashes.dHash,
      aHash: hashes.aHash,
      dataUrl: crops[i].dataUrl,
    });
  }
  return { templates, count: templates.size, capturedAt: new Date().toISOString() };
}

/**
 * Inject all templates from a bundle into the matcher.
 * Returns count of injected templates.
 */
export function injectTemplateBundle(matcher, bundle) {
  if (!matcher || !matcher.templateHashes || !bundle?.templates) return 0;
  let injected = 0;
  for (const [key, tpl] of bundle.templates) {
    matcher.templateHashes.set(key, { dHash: tpl.dHash, aHash: tpl.aHash });
    injected++;
  }
  return injected;
}

/**
 * Download each template in the bundle as a PNG file.
 */
export function exportTemplatePNGs(bundle) {
  if (!bundle?.templates) return 0;
  let i = 0;
  for (const [key, tpl] of bundle.templates) {
    if (!tpl.dataUrl) continue;
    setTimeout(() => {
      const link = document.createElement('a');
      link.download = `${key}.png`;
      link.href = tpl.dataUrl;
      link.click();
    }, i * 200);
    i++;
  }
  return i;
}

/**
 * Serialize bundle for POST to /api/poker-brain/calibration.
 */
export function serializeBundleForUpload(bundle) {
  if (!bundle?.templates) return null;
  const out = { capturedAt: bundle.capturedAt || new Date().toISOString(), templates: {} };
  for (const [key, tpl] of bundle.templates) {
    out.templates[key] = { dHash: tpl.dHash, aHash: tpl.aHash };
  }
  return out;
}

export default extractTemplatesFromFrame;
