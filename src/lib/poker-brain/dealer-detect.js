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

export default detectDealer;
