/**
 * Poker Brain — Table Bounds Finder (v2)
 * ========================================
 * Locates the PokerBros felt oval inside a captured frame using TWO
 * independent visual signatures, with confidence-weighted fusion:
 *
 *   1. Gold ring  — a bright warm border drawn around the felt
 *   2. Green felt — the dark green interior of the table itself
 *
 * Why two signals: the gold ring is distinctive but can be dim or
 * partially occluded (chat bubbles, player avatars, dealer animations).
 * The green felt interior is larger and more robust but can be confused
 * with other green UI elements (start-game button, tournament lobby).
 * Running both and taking the OVERLAP gives us the tight bbox of the
 * felt + ring combo — the true table rectangle.
 *
 * When we screen-share a whole browser window (Chrome + Android emulator
 * + PokerBros), the poker table is often less than 30% of the capture
 * area. The rest is Chrome chrome, Android nav bars, and desktop. Every
 * HERO/BOARD fractional region the localizer uses MUST be relative to
 * the table bbox, not the full frame. This module provides that bbox.
 *
 * API:
 *   findTableBounds(source, options?) → { x, y, w, h, confidence, debug } | null
 *
 * Coordinates are in SOURCE pixel space and can be passed to
 *   localizeCards({ tableBounds })
 *   findDealerButtonGlobal(source, tableBounds)
 *   detectPlayerCountByStacks(source, tableBounds)
 */

// ─────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────

const DOWNSCALE_MAX_W = 400;

// ---- Gold ring signature (warm saturated) --------------------------
// PokerBros table gold: ~R 210-240, G 160-200, B 30-90
const GOLD_R_MIN = 170;
const GOLD_G_MIN = 115;
const GOLD_B_MAX = 130;
const GOLD_RB_MIN = 70;
const GOLD_RG_MIN = 5;

// ---- Green felt signature (dark saturated green) ------------------
// PokerBros felt: ~R 20-60, G 70-140, B 40-90
const FELT_R_MAX = 90;
const FELT_G_MIN = 55;
const FELT_B_MAX = 110;
const FELT_GR_MIN = 15; // G - R > 15 (green dominates)
const FELT_GB_MIN = 5;  // G - B > 5  (green dominates blue)
const FELT_G_MAX = 170; // reject too-bright green (button labels)

// ---- Bounds validation (fraction of source frame) ------------------
const MIN_TABLE_W_FRAC = 0.14;
const MIN_TABLE_H_FRAC = 0.14;
const MAX_TABLE_W_FRAC = 1.00;
const MAX_TABLE_H_FRAC = 1.00;
const MIN_TABLE_ASPECT = 0.35;  // h/w lower bound (wide tables)
const MAX_TABLE_ASPECT = 3.00;  // h/w upper bound (tall phone tables)

const MIN_GOLD_PIXELS = 150;
const MIN_FELT_PIXELS = 800;

// ─────────────────────────────────────────────────────────────────────
// Color predicates
// ─────────────────────────────────────────────────────────────────────

function isGold(r, g, b) {
  if (r < GOLD_R_MIN) return false;
  if (g < GOLD_G_MIN) return false;
  if (b > GOLD_B_MAX) return false;
  if (r - b < GOLD_RB_MIN) return false;
  if (r - g < GOLD_RG_MIN) return false;
  return true;
}

function isFelt(r, g, b) {
  if (r > FELT_R_MAX) return false;
  if (g < FELT_G_MIN) return false;
  if (g > FELT_G_MAX) return false;
  if (b > FELT_B_MAX) return false;
  if (g - r < FELT_GR_MIN) return false;
  if (g - b < FELT_GB_MIN) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Downscale
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Projection-based bbox extraction
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a bbox from a single-signal mask using row + column density
 * histograms. Drops rows / cols with density below densityFrac so
 * isolated pixel blobs (icons, notification dots) don't inflate the
 * bbox.
 *
 * @param {Uint8Array} mask    pixel mask, 1 where signal present
 * @param {number} width
 * @param {number} height
 * @param {number} minPixels   minimum total signal pixels to accept
 * @param {number} densityFrac min row/col density required (0..1)
 * @returns {{x,y,w,h,count}|null}
 */
function maskBBox(mask, width, height, minPixels, densityFrac) {
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  let total = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x]) {
        rowCounts[y]++;
        colCounts[x]++;
        total++;
      }
    }
  }
  if (total < minPixels) return null;

  const rowThresh = Math.max(2, Math.floor(width * densityFrac));
  const colThresh = Math.max(2, Math.floor(height * densityFrac));

  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] >= rowThresh) {
      if (y0 === -1) y0 = y;
      y1 = y;
    }
  }
  for (let x = 0; x < width; x++) {
    if (colCounts[x] >= colThresh) {
      if (x0 === -1) x0 = x;
      x1 = x;
    }
  }
  if (x0 < 0 || y0 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count: total };
}

// ─────────────────────────────────────────────────────────────────────
// Bbox sanity + fusion
// ─────────────────────────────────────────────────────────────────────

function validateBBoxShape(bbox, srcW, srcH) {
  if (!bbox) return false;
  const wFrac = bbox.w / srcW;
  const hFrac = bbox.h / srcH;
  if (wFrac < MIN_TABLE_W_FRAC || wFrac > MAX_TABLE_W_FRAC) return false;
  if (hFrac < MIN_TABLE_H_FRAC || hFrac > MAX_TABLE_H_FRAC) return false;
  const ar = bbox.h / bbox.w;
  if (ar < MIN_TABLE_ASPECT || ar > MAX_TABLE_ASPECT) return false;
  return true;
}

function bboxUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function bboxIntersect(a, b) {
  if (!a || !b) return null;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Find the PokerBros table bbox in a frame using multi-signal fusion.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} source
 * @param {object} [options]
 * @param {object} [options.previous]  previous bounds; used as a prior
 *                                     so we can reject wildly different
 *                                     re-detections (stability hint).
 * @returns {{x,y,w,h,confidence,debug}|null}
 */
export function findTableBounds(source, options = {}) {
  const dn = downscale(source);
  if (!dn) return null;
  const { imageData, scaleBackX, scaleBackY, srcW, srcH } = dn;
  const { data, width, height } = imageData;

  // ---- Single-pass over pixels: build both masks together -----------
  const goldMask = new Uint8Array(width * height);
  const feltMask = new Uint8Array(width * height);
  let goldCount = 0;
  let feltCount = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isGold(r, g, b)) { goldMask[p] = 1; goldCount++; }
    else if (isFelt(r, g, b)) { feltMask[p] = 1; feltCount++; }
  }

  // ---- Bbox from each signal independently --------------------------
  const goldBox = goldCount >= MIN_GOLD_PIXELS
    ? maskBBox(goldMask, width, height, MIN_GOLD_PIXELS, 0.012)
    : null;
  const feltBox = feltCount >= MIN_FELT_PIXELS
    ? maskBBox(feltMask, width, height, MIN_FELT_PIXELS, 0.020)
    : null;

  // ---- Fusion strategy ----------------------------------------------
  // Prefer gold when present (the gold ring tightly encloses the felt).
  // Fall back to felt only when gold is missing or too small. When both
  // are present, use the UNION since gold is exactly the ring of felt
  // and felt fills the interior — their union is the true table area.
  let fused = null;
  let source_ = 'none';
  if (goldBox && feltBox) {
    fused = bboxUnion(goldBox, feltBox);
    source_ = 'gold+felt';
  } else if (goldBox) {
    fused = goldBox;
    source_ = 'gold';
  } else if (feltBox) {
    fused = feltBox;
    source_ = 'felt';
  }

  if (!fused) return null;

  // Scale back to source pixels
  const tx = Math.round(fused.x * scaleBackX);
  const ty = Math.round(fused.y * scaleBackY);
  const tw = Math.round(fused.w * scaleBackX);
  const th = Math.round(fused.h * scaleBackY);
  const bbox = { x: tx, y: ty, w: tw, h: th };

  if (!validateBBoxShape(bbox, srcW, srcH)) return null;

  // ---- Confidence scoring ------------------------------------------
  // Factors:
  //   • goldDensity  — gold pixels / gold bbox area (0.01 = strong ring)
  //   • feltDensity  — felt pixels / felt bbox area (0.20+ = real felt)
  //   • sizeScore    — bbox fills a reasonable fraction of frame
  //   • aspectScore  — aspect sits in the normal table range
  //   • signalBonus  — both signals present is much higher confidence
  //   • priorAgree   — matches the previous bounds (if any)
  const goldDensity = goldBox ? goldBox.count / (goldBox.w * goldBox.h) : 0;
  const feltDensity = feltBox ? feltBox.count / (feltBox.w * feltBox.h) : 0;
  const wFrac = bbox.w / srcW;
  const hFrac = bbox.h / srcH;
  const ar = bbox.h / bbox.w;

  const goldScore = Math.min(1, goldDensity / 0.025);
  const feltScore = Math.min(1, feltDensity / 0.30);
  const sizeScore = Math.min(1, (wFrac + hFrac) / 0.8);
  const arScore = ar >= 0.9 && ar <= 2.4 ? 1 : 0.65;
  const signalBonus = (goldBox && feltBox) ? 1.0
                    : (goldBox ? 0.85 : 0.70);

  let priorAgree = 1.0;
  if (options.previous) {
    const prev = options.previous;
    const pcx = prev.x + prev.w / 2;
    const pcy = prev.y + prev.h / 2;
    const ncx = bbox.x + bbox.w / 2;
    const ncy = bbox.y + bbox.h / 2;
    const centerDiag = Math.hypot(prev.w, prev.h);
    const drift = Math.hypot(ncx - pcx, ncy - pcy);
    priorAgree = drift / Math.max(1, centerDiag) < 0.12 ? 1.05 : 0.95;
  }

  const mixed = Math.max(goldScore, feltScore) * 0.6
              + Math.min(goldScore, feltScore) * 0.2
              + sizeScore * 0.2;
  const confidence = Math.max(0, Math.min(1, mixed * arScore * signalBonus * priorAgree));

  return {
    ...bbox,
    confidence,
    debug: {
      source: source_,
      goldPixels: goldCount,
      feltPixels: feltCount,
      goldDensity,
      feltDensity,
      wFrac,
      hFrac,
      aspect: ar,
      goldBox,
      feltBox,
    },
  };
}

export default findTableBounds;
