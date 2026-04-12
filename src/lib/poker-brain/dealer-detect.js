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

// Cached canvas for pixel reads — avoids creating ~4 canvases/sec
let _cachedCanvas = null;
let _cachedCtx = null;

function getCachedCanvas(w, h) {
  if (!_cachedCanvas) {
    _cachedCanvas = document.createElement('canvas');
    _cachedCtx = _cachedCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (_cachedCanvas.width !== w || _cachedCanvas.height !== h) {
    _cachedCanvas.width = w;
    _cachedCanvas.height = h;
  }
  return { canvas: _cachedCanvas, ctx: _cachedCtx };
}

/**
 * Test whether an RGB triplet is "red enough" to be the dealer button.
 * PokerBros button is roughly (200, 40, 55) - saturated crimson.
 * We require R to dominate G and B by a margin AND R to be above a threshold.
 *
 * v2: Relaxed thresholds to handle video compression artifacts and slight
 * skin variations. Also accepts darker reds (R >= 120) that appear when
 * the button is partially occluded or in shadow.
 */
function isDealerRed(r, g, b, cfg) {
  if (r < 120) return false;        // was 140, relaxed for darker reds
  if (r - g < 45) return false;      // was 60, relaxed for compression
  if (r - b < 40) return false;      // was 60, relaxed for reddish-brown tones
  // Fast path: if R strongly dominates, accept without color distance check
  if (r > 170 && g < 80 && b < 90) return true;
  const dr = Math.abs(r - cfg.color.r);
  const dg = Math.abs(g - cfg.color.g);
  const db = Math.abs(b - cfg.color.b);
  return dr + dg + db < cfg.color.tolerance * 3;
}

/**
 * Check if a cluster region contains white pixels (the "D" letter on the
 * dealer chip). This confirms a red cluster is actually the dealer button
 * and not a red UI element or avatar artifact.
 *
 * Returns true if at least `minWhitePixels` white-ish pixels are found
 * inside the bounding box of the red cluster.
 */
function hasWhiteDLetter(imageData, rect, minWhitePixels = 3) {
  const { data, width } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imageData.width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(imageData.height, Math.floor(rect.y + rect.h));
  let count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // White-ish: all channels > 200, low spread
      if (r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40) {
        count++;
        if (count >= minWhitePixels) return true;
      }
    }
  }
  return false;
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

  // Draw frame to cached canvas so we can read pixels
  const { ctx } = getCachedCanvas(srcW, srcH);
  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);

  const counts = {};
  let bestSeat = null;
  let bestCount = 0;

  // Choose seat regions: prefer table-size-specific if player count is known
  const playerCount = overrides.playerCount || layout.seats.length || 6;
  let seatRegions = layout.seats;
  if (playerCount <= 2 && (!layout.seats || layout.seats.length === 0)) {
    seatRegions = DEALER_REGIONS_HU;
  } else if (playerCount >= 7 && (!layout.seats || layout.seats.length < 7)) {
    seatRegions = DEALER_REGIONS_9MAX;
  }

  for (const seat of seatRegions) {
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
// Clockwise seat orderings by table size (from hero, going right/clockwise)
const CW_ORDER_6MAX = ['hero', 'seat5', 'seat3', 'seat1', 'seat2', 'seat4'];
const CW_ORDER_9MAX = ['hero', 'seat8', 'seat6', 'seat4', 'seat2', 'seat1', 'seat3', 'seat5', 'seat7'];
const CW_ORDER_HU   = ['hero', 'seat1'];

// Position maps: clockwise distance from dealer -> position name
const POS_MAP_6 = ['late', 'sb', 'bb', 'early', 'middle', 'late'];
const POS_MAP_9 = ['late', 'sb', 'bb', 'early', 'early', 'early', 'middle', 'middle', 'late'];
const POS_MAP_HU = ['late', 'bb']; // dealer = BTN/SB in HU, other = BB

export function heroPositionFromDealer(dealerSeatId, numPlayers = 6) {
  if (!dealerSeatId) return 'middle';

  // Select the right clockwise ordering for the table size
  let order, posMap;
  if (numPlayers <= 2) {
    order = CW_ORDER_HU;
    posMap = POS_MAP_HU;
  } else if (numPlayers <= 6) {
    order = CW_ORDER_6MAX;
    posMap = POS_MAP_6;
  } else {
    order = CW_ORDER_9MAX;
    posMap = POS_MAP_9;
  }

  const heroIdx = order.indexOf('hero');
  const dealerIdx = order.indexOf(dealerSeatId);
  if (dealerIdx === -1 || heroIdx === -1) {
    // Seat not in our ordering: use generic distance-based fallback
    return _genericPosition(numPlayers);
  }

  // n = clockwise distance FROM dealer TO hero
  const n = (heroIdx - dealerIdx + order.length) % order.length;
  return posMap[Math.min(n, posMap.length - 1)] || 'middle';
}

function _genericPosition(numPlayers) {
  // When we can't determine position, return middle as safe default
  return 'middle';
}

/**
 * Seat anchor regions for dealer button scanning by table size.
 * Coordinates are in 480x1054 reference space. Each entry defines
 * the search rectangle around a seat where the dealer chip appears.
 * The chip sits ~30px toward table center from the avatar.
 */
const DEALER_REGIONS_9MAX = [
  { id: 'hero',  x: 215, y: 820, w: 50, h: 50 },
  { id: 'seat8', x: 370, y: 750, w: 50, h: 50 },
  { id: 'seat6', x: 400, y: 575, w: 50, h: 50 },
  { id: 'seat4', x: 370, y: 400, w: 50, h: 50 },
  { id: 'seat2', x: 295, y: 280, w: 50, h: 50 },
  { id: 'seat1', x: 135, y: 280, w: 50, h: 50 },
  { id: 'seat3', x: 60,  y: 400, w: 50, h: 50 },
  { id: 'seat5', x: 30,  y: 575, w: 50, h: 50 },
  { id: 'seat7', x: 60,  y: 750, w: 50, h: 50 },
];

const DEALER_REGIONS_HU = [
  { id: 'hero',  x: 215, y: 820, w: 50, h: 50 },
  { id: 'seat1', x: 215, y: 325, w: 50, h: 50 },
];

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
export function findDealerButtonGlobal(source, tableBounds = null, overrides = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...overrides };
  const frameW = source.videoWidth || source.width || source.naturalWidth;
  const frameH = source.videoHeight || source.height || source.naturalHeight;
  if (!frameW || !frameH) return null;

  // ROI crop: when a tableBounds is supplied, scan only the table
  // region — otherwise stray red UI elsewhere in the capture
  // (chat bubbles, notification dots) can beat the real dealer chip.
  let roiX = 0, roiY = 0, roiW = frameW, roiH = frameH;
  if (tableBounds && tableBounds.w > 0 && tableBounds.h > 0) {
    roiX = Math.max(0, Math.min(frameW - 1, Math.round(tableBounds.x)));
    roiY = Math.max(0, Math.min(frameH - 1, Math.round(tableBounds.y)));
    roiW = Math.max(1, Math.min(frameW - roiX, Math.round(tableBounds.w)));
    roiH = Math.max(1, Math.min(frameH - roiY, Math.round(tableBounds.h)));
  }

  const srcW = roiW;
  const srcH = roiH;
  const { ctx } = getCachedCanvas(srcW, srcH);
  ctx.drawImage(source, roiX, roiY, roiW, roiH, 0, 0, srcW, srcH);
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

  // Confirm: check for white "D" letter inside the red cluster bbox.
  // The dealer chip on PokerBros always has a white "D" in the center.
  // This eliminates false positives from red UI elements / avatars.
  const clusterCx = sumX / cnt;
  const clusterCy = sumY / cnt;
  const chipRadius = Math.max(8, Math.sqrt(cnt / Math.PI));
  const chipRect = {
    x: clusterCx - chipRadius,
    y: clusterCy - chipRadius,
    w: chipRadius * 2,
    h: chipRadius * 2,
  };
  const confirmedByWhiteD = hasWhiteDLetter(imageData, chipRect, 2);

  // Return in FULL-FRAME coordinates so callers can mix with other
  // frame-level detections (stack clusters, hero bbox, etc.).
  return {
    x: roiX + clusterCx,
    y: roiY + clusterCy,
    pixelCount: cnt,
    confirmedD: confirmedByWhiteD,
    confidence: confirmedByWhiteD ? Math.min(1, cnt / 60) : Math.min(0.5, cnt / 120),
  };
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
  const point = findDealerButtonGlobal(source, null, overrides);
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

  const { ctx } = getCachedCanvas(srcW, srcH);
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
