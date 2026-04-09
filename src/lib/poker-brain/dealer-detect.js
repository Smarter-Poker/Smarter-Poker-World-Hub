/**
 * Poker Brain - Dealer Button Detector
 * =====================================
 * Finds the dealer button (the small red chip with "D" on PokerBros) near
 * each seat and returns which seat is currently the dealer. From that we
 * derive position (dealer, SB, BB, UTG, MP, CO, etc.) for the hero.
 *
 * Approach: color-based. The dealer button on PokerBros is a distinctive
 * saturated red circle. Rather than template matching (which requires an
 * extracted sprite we do not yet have), we scan each seat region for
 * clusters of "red-dominant" pixels. The seat with the largest red cluster
 * near its avatar wins.
 *
 * This is tolerant to:
 *   - Minor scaling differences (ratio-based coordinates)
 *   - Slight color shifts from video compression
 *   - Occlusion by chip stacks or names (cluster must exceed min size)
 *
 * Not a neural network, but more than sufficient for a deterministic UI.
 * Pure JS + Canvas.
 */

const DEFAULT_CONFIG = {
  color: { r: 200, g: 40, b: 55, tolerance: 50 },
  minClusterPixels: 20,
  searchRadius: 60, // px around seat anchor
};

/**
 * Test whether an RGB triplet is "red enough" to be the dealer button.
 * PokerBros button is roughly (200, 40, 55) - saturated crimson.
 * We require R to dominate G and B by a margin AND R to be above ~160.
 */
function isDealerRed(r, g, b, cfg) {
  if (r < 140) return false;
  if (r - g < 60) return false;
  if (r - b < 60) return false;
  const dr = Math.abs(r - cfg.color.r);
  const dg = Math.abs(g - cfg.color.g);
  const db = Math.abs(b - cfg.color.b);
  return dr + dg + db < cfg.color.tolerance * 3;
}

/**
 * Count red-dominant pixels inside a rectangle on an ImageData.
 */
function countRedPixels(imageData, rect, cfg) {
  const { data, width } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imageData.width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(imageData.height, Math.floor(rect.y + rect.h));
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      if (isDealerRed(data[idx], data[idx + 1], data[idx + 2], cfg)) count += 1;
    }
  }
  return count;
}

/**
 * Scale a seat anchor to the actual captured frame resolution.
 */
function scaleRect(rect, scaleX, scaleY) {
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    w: rect.w * scaleX,
    h: rect.h * scaleY,
  };
}

/**
 * Main entry point.
 * @param {HTMLCanvasElement|HTMLVideoElement} source - frame to analyze
 * @param {object} layout - layout.json object (needs seats + dealerButton + referenceSize)
 * @param {object} overrides - optional config overrides
 * @returns {{ seatId: string|null, position: string|null, counts: object }}
 */
export function detectDealer(source, layout, overrides = {}) {
  if (!layout || !layout.seats || layout.seats.length === 0) {
    return { seatId: null, position: null, counts: {} };
  }
  const cfg = {
    ...DEFAULT_CONFIG,
    ...(layout.dealerButton || {}),
    ...overrides,
  };

  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return { seatId: null, position: null, counts: {} };

  const refW = layout.referenceSize.w;
  const refH = layout.referenceSize.h;
  const scaleX = srcW / refW;
  const scaleY = srcH / refH;

  // Draw frame to a temp canvas so we can read pixels
  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);

  const counts = {};
  let bestSeat = null;
  let bestCount = 0;

  for (const seat of layout.seats) {
    const scaled = scaleRect(seat, scaleX, scaleY);
    const count = countRedPixels(imageData, scaled, cfg);
    counts[seat.id] = count;
    if (count > bestCount && count >= cfg.minClusterPixels) {
      bestCount = count;
      bestSeat = seat;
    }
  }

  return {
    seatId: bestSeat ? bestSeat.id : null,
    position: bestSeat ? bestSeat.position : null,
    counts,
    confidence: bestCount > 0 ? Math.min(1, bestCount / 100) : 0,
  };
}

/**
 * Convert dealer seat id to engine position string for hero.
 * Engine uses: early | middle | late | sb | bb
 *
 * PokerBros 6-max clockwise seat order (derived from layout.json coordinates
 * with hero at the bottom, clockwise = up-the-right-side first):
 *
 *   hero (bottom) -> seat5 (middleRight) -> seat3 (topRight) ->
 *   seat1 (topCenter) -> seat2 (topLeft) -> seat4 (middleLeft) -> hero
 *
 * Dealer rotates clockwise. Given the dealer's seat id, hero's position is
 * determined by the clockwise distance from dealer to hero:
 *   n=0 (hero IS dealer)  -> BTN  -> 'late'
 *   n=1                    -> SB   -> 'sb'
 *   n=2                    -> BB   -> 'bb'
 *   n=3                    -> UTG  -> 'early'
 *   n=4                    -> MP   -> 'middle'
 *   n=5                    -> CO   -> 'late'
 */
const CW_ORDER_6MAX = ['hero', 'seat5', 'seat3', 'seat1', 'seat2', 'seat4'];

export function heroPositionFromDealer(dealerSeatId, numPlayers = 6) {
  if (!dealerSeatId) return 'middle';
  const order = CW_ORDER_6MAX;
  const heroIdx = order.indexOf('hero');
  const dealerIdx = order.indexOf(dealerSeatId);
  if (dealerIdx === -1 || heroIdx === -1) return 'middle';
  // n = clockwise distance FROM dealer TO hero
  const n = (heroIdx - dealerIdx + order.length) % order.length;
  if (numPlayers <= 6) {
    switch (n) {
      case 0: return 'late';   // BTN (hero has the button)
      case 1: return 'sb';
      case 2: return 'bb';
      case 3: return 'early';  // UTG
      case 4: return 'middle'; // MP/HJ
      case 5: return 'late';   // CO
      default: return 'middle';
    }
  }
  // Fallback for non-6max (table sizes not yet supported explicitly)
  if (n === 0) return 'late';
  if (n === 1) return 'sb';
  if (n === 2) return 'bb';
  if (n <= Math.floor(numPlayers / 2)) return 'early';
  return 'middle';
}

/* ═══════════════════════════════════════════════════════════════════════
 * Auto-calibration helpers
 * ═══════════════════════════════════════════════════════════════════════
 * The old detectDealer() requires per-seat rectangles in layout.json. If
 * those are even slightly off, the button scan misses. These helpers do
 * whole-table scans instead, so detection works on any table scale/offset
 * as long as the seat anchor points are roughly in the right area.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Scan the ENTIRE frame for the largest red-dominant pixel cluster and
 * return its centroid. This finds the dealer button wherever it is,
 * without needing pre-calibrated seat rectangles.
 *
 * Uses a downscaled 8x8 grid sampling pass first for speed, then a full
 * resolution pass only inside the hottest cell. Total cost: ~1ms.
 */
export function findDealerButtonGlobal(source, overrides = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...overrides };
  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return null;

  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);

  // Coarse grid pass: split into an 8x8 grid, count red pixels per cell
  const GRID = 8;
  const cellW = Math.floor(srcW / GRID);
  const cellH = Math.floor(srcH / GRID);
  const cellCounts = new Int32Array(GRID * GRID);

  // Sample every 2nd pixel for speed (still thousands per cell)
  const { data, width } = imageData;
  for (let y = 0; y < srcH; y += 2) {
    const row = y * width;
    const gy = Math.min(GRID - 1, Math.floor(y / cellH));
    for (let x = 0; x < srcW; x += 2) {
      const idx = (row + x) * 4;
      if (isDealerRed(data[idx], data[idx + 1], data[idx + 2], cfg)) {
        const gx = Math.min(GRID - 1, Math.floor(x / cellW));
        cellCounts[gy * GRID + gx]++;
      }
    }
  }

  // Find the hottest cell
  let bestCell = -1;
  let bestCellCount = 0;
  for (let i = 0; i < cellCounts.length; i++) {
    if (cellCounts[i] > bestCellCount) {
      bestCellCount = cellCounts[i];
      bestCell = i;
    }
  }
  // No red found at all (very low count = button probably not visible)
  if (bestCell < 0 || bestCellCount < cfg.minClusterPixels / 4) return null;

  const gx = bestCell % GRID;
  const gy = Math.floor(bestCell / GRID);

  // Full-resolution centroid pass inside the hot cell + 1-cell margin
  const x0 = Math.max(0, (gx - 1) * cellW);
  const y0 = Math.max(0, (gy - 1) * cellH);
  const x1 = Math.min(srcW, (gx + 2) * cellW);
  const y1 = Math.min(srcH, (gy + 2) * cellH);

  let sumX = 0, sumY = 0, cnt = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      const idx = (row + x) * 4;
      if (isDealerRed(data[idx], data[idx + 1], data[idx + 2], cfg)) {
        sumX += x;
        sumY += y;
        cnt++;
      }
    }
  }
  if (cnt < cfg.minClusterPixels) return null;

  return { x: sumX / cnt, y: sumY / cnt, pixelCount: cnt };
}

/**
 * Map a pixel-space point (e.g. the dealer button centroid) to the
 * nearest layout seat. Handles seat coordinates in layout reference
 * space by scaling to the actual capture resolution.
 */
export function nearestSeatToPoint(point, layout, srcW, srcH) {
  if (!layout || !layout.seats || !point) return null;
  const scaleX = srcW / layout.referenceSize.w;
  const scaleY = srcH / layout.referenceSize.h;
  let best = null;
  let bestDist = Infinity;
  for (const seat of layout.seats) {
    const cx = (seat.x + seat.w / 2) * scaleX;
    const cy = (seat.y + seat.h / 2) * scaleY;
    const dx = cx - point.x;
    const dy = cy - point.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = seat;
    }
  }
  return best;
}

/**
 * Convenience wrapper: find the dealer button globally and return the
 * nearest seat id. This is the zero-calibration path.
 */
export function detectDealerAuto(source, layout, overrides = {}) {
  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH || !layout) {
    return { seatId: null, position: null, confidence: 0 };
  }
  const point = findDealerButtonGlobal(source, overrides);
  if (!point) return { seatId: null, position: null, confidence: 0 };
  const seat = nearestSeatToPoint(point, layout, srcW, srcH);
  if (!seat) return { seatId: null, position: null, confidence: 0 };
  return {
    seatId: seat.id,
    position: seat.position,
    confidence: Math.min(1, point.pixelCount / 80),
    buttonPoint: point,
  };
}

/**
 * Detect how many seats are currently occupied by players (not empty).
 *
 * PokerBros renders empty seats either with the "+" add-player icon or
 * a transparent slot, and occupied seats with a colorful avatar. We
 * distinguish them by measuring chroma + luminance variance inside the
 * seat avatar region — occupied avatars are high-variance, empty slots
 * are either uniform dark or uniform button-colored.
 *
 * Returns an object with:
 *   occupiedSeats: array of seat ids that look occupied
 *   playerCount:   occupiedSeats.length (always includes hero if hero avatar present)
 *   hero:          boolean — is hero seat occupied
 */
export function detectOccupiedSeats(source, layout) {
  if (!layout || !layout.seats) return { occupiedSeats: [], playerCount: 0, hero: true };
  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return { occupiedSeats: [], playerCount: 0, hero: true };

  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, srcW, srcH);

  const scaleX = srcW / layout.referenceSize.w;
  const scaleY = srcH / layout.referenceSize.h;

  const occupiedSeats = [];
  let heroOccupied = true; // hero is always us, even if we're sitting out

  for (const seat of layout.seats) {
    const rx = Math.max(0, Math.floor(seat.x * scaleX));
    const ry = Math.max(0, Math.floor(seat.y * scaleY));
    const rw = Math.max(1, Math.floor(seat.w * scaleX));
    const rh = Math.max(1, Math.floor(seat.h * scaleY));
    const clipW = Math.min(rw, srcW - rx);
    const clipH = Math.min(rh, srcH - ry);
    if (clipW <= 0 || clipH <= 0) continue;

    const img = ctx.getImageData(rx, ry, clipW, clipH);
    const { data } = img;

    // Compute luminance variance + average saturation over sampled pixels
    let lumSum = 0, lumSqSum = 0, satSum = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      lumSum += lum;
      lumSqSum += lum * lum;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      satSum += sat;
      n++;
    }
    if (n === 0) continue;
    const lumMean = lumSum / n;
    const lumVar = lumSqSum / n - lumMean * lumMean;
    const satMean = satSum / n;

    // Heuristic: occupied seats have either high luminance variance
    // (colorful avatar with shading) or high saturation (not just table felt).
    // Empty seats on PokerBros are either translucent dark or a plain
    // "+ sit here" button with very little variance.
    const occupied = (lumVar > 400) || (satMean > 0.25 && lumMean > 60);

    if (seat.id === 'hero') {
      heroOccupied = occupied;
      if (occupied) occupiedSeats.push('hero');
    } else if (occupied) {
      occupiedSeats.push(seat.id);
    }
  }

  return {
    occupiedSeats,
    playerCount: occupiedSeats.length,
    hero: heroOccupied,
  };
}

export default detectDealer;
