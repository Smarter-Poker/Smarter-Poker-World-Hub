/**
 * Poker Brain — Table Bounds Finder
 * ===================================
 * Locates the PokerBros felt oval inside a captured frame by scanning
 * for the distinctive gold glow around the table border.
 *
 * Why: when the user screen-shares an entire Chrome window (with an
 * Android emulator inside it), the actual poker table is only a small
 * sub-region of the capture. Every hero/board/seat fraction the HUD
 * tunes against a stand-alone table becomes nonsense when applied to
 * the full capture. The fix is a pre-pass that finds the table
 * rectangle FIRST, then runs all downstream detection in table-local
 * coordinates instead of full-frame coordinates.
 *
 * Detection signal: PokerBros tables are ringed by a bright gold glow
 * (roughly R≥180, G≥130, B≤130, R−B≥70). That color is rare anywhere
 * else on the UI, and the glow forms a continuous ring so the bbox of
 * all gold pixels tightly matches the felt oval.
 *
 * API:
 *   findTableBounds(source) → { x, y, w, h, confidence, debug }  or  null
 *
 * Output rectangles are in SOURCE pixel coordinates and can be passed
 * directly to card-localizer / dealer-detect as a ROI.
 */

const DOWNSCALE_MAX_W = 400;

// Gold-glow pixel signature
const GOLD_R_MIN = 170;
const GOLD_G_MIN = 120;
const GOLD_B_MAX = 130;
const GOLD_RB_MIN = 70;   // R - B must exceed this (warm dominance)
const GOLD_RG_MIN = 10;   // R - G (slight)

// Bounds validation (fraction of source frame)
const MIN_TABLE_W_FRAC = 0.15; // reject too-small clusters
const MIN_TABLE_H_FRAC = 0.15;
const MAX_TABLE_W_FRAC = 1.00;
const MAX_TABLE_H_FRAC = 1.00;
const MIN_TABLE_ASPECT = 0.35;  // h/w lower bound (wide tables)
const MAX_TABLE_ASPECT = 2.80;  // h/w upper bound (tall phone tables)
const MIN_GOLD_PIXELS = 200;    // min gold pixels in downscaled space

// ─────────────────────────────────────────────────────────────────────

function isGold(r, g, b) {
  if (r < GOLD_R_MIN) return false;
  if (g < GOLD_G_MIN) return false;
  if (b > GOLD_B_MAX) return false;
  if (r - b < GOLD_RB_MIN) return false;
  if (r - g < GOLD_RG_MIN) return false;
  return true;
}

function downscale(source) {
  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, DOWNSCALE_MAX_W / srcW);
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, dw, dh);
  const imageData = ctx.getImageData(0, 0, dw, dh);
  return { imageData, scaleBackX: srcW / dw, scaleBackY: srcH / dh, srcW, srcH };
}

/**
 * Find the tightest bounding box around gold pixels in the downscaled
 * frame. Uses row + column projection histograms so we can drop rows
 * and columns with near-zero gold density (ignores isolated gold text
 * like chip icons).
 */
function goldBBox(imageData) {
  const { data, width, height } = imageData;

  // Row + column gold-pixel counts
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  let totalGold = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      if (isGold(data[i], data[i + 1], data[i + 2])) {
        rowCounts[y]++;
        colCounts[x]++;
        totalGold++;
      }
    }
  }

  if (totalGold < MIN_GOLD_PIXELS) return null;

  // Require at least ~1% row / column density to be part of the table
  // (filters isolated gold UI clusters like chip icons or "LUCKY DRAW")
  const rowThresh = Math.max(2, Math.floor(width * 0.012));
  const colThresh = Math.max(2, Math.floor(height * 0.012));

  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] >= rowThresh) {
      if (y0 === -1) y0 = y;
      y1 = y;
    }
  }
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < width; x++) {
    if (colCounts[x] >= colThresh) {
      if (x0 === -1) x0 = x;
      x1 = x;
    }
  }

  if (x0 < 0 || y0 < 0) return null;

  return {
    x: x0,
    y: y0,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    goldPixels: totalGold,
  };
}

/**
 * Find the table bounds in a frame. Returns {x,y,w,h} in SOURCE pixel
 * coordinates, plus a confidence score (0..1). Returns null if the
 * frame contains no recognizable table.
 */
export function findTableBounds(source) {
  const dn = downscale(source);
  if (!dn) return null;
  const { imageData, scaleBackX, scaleBackY, srcW, srcH } = dn;

  const bbox = goldBBox(imageData);
  if (!bbox) return null;

  // Scale back to source pixels
  const tx = Math.round(bbox.x * scaleBackX);
  const ty = Math.round(bbox.y * scaleBackY);
  const tw = Math.round(bbox.w * scaleBackX);
  const th = Math.round(bbox.h * scaleBackY);

  // Size sanity (fractions of full frame)
  const wFrac = tw / srcW;
  const hFrac = th / srcH;
  if (wFrac < MIN_TABLE_W_FRAC || wFrac > MAX_TABLE_W_FRAC) return null;
  if (hFrac < MIN_TABLE_H_FRAC || hFrac > MAX_TABLE_H_FRAC) return null;

  // Aspect sanity (h/w). PokerBros phone tables are taller than wide.
  const ar = th / tw;
  if (ar < MIN_TABLE_ASPECT || ar > MAX_TABLE_ASPECT) return null;

  // Confidence: gold density × size score × aspect score
  const goldDensity = bbox.goldPixels / (bbox.w * bbox.h);
  const densityScore = Math.min(1, goldDensity / 0.025);  // ~2.5% gold is solid
  const sizeScore = Math.min(1, (wFrac + hFrac) / 0.8);
  const arScore = ar >= 0.9 && ar <= 2.4 ? 1 : 0.6;
  const confidence = Math.max(0, Math.min(1, densityScore * sizeScore * arScore));

  return {
    x: tx,
    y: ty,
    w: tw,
    h: th,
    confidence,
    debug: {
      goldPixels: bbox.goldPixels,
      goldDensity,
      wFrac,
      hFrac,
      aspect: ar,
    },
  };
}

export default findTableBounds;
