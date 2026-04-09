/**
 * Poker Brain - 4-Color Deck Suit Verification
 * ----------------------------------------------
 * PokerBros uses a deterministic 4-color deck:
 *   clubs    -> green
 *   hearts   -> red
 *   spades   -> black
 *   diamonds -> blue
 *
 * After the dHash matcher returns a candidate card, we sample the card
 * region's dominant non-white color and compare it against the expected
 * color for the claimed suit. This catches cross-suit confusions where the
 * rank glyph is correct but the suit is wrong (a common dHash failure mode
 * when two suit glyphs have similar low-resolution silhouettes).
 *
 * Input is a 2D canvas context OR a canvas/video you can draw from. The
 * sampler reads every Nth pixel, drops near-whites and near-blacks shallower
 * than the threshold, and accumulates them into one of four color buckets.
 */

const COLOR_TARGETS = {
  c: { r: 28,  g: 160, b: 80  }, // green
  h: { r: 220, g: 35,  b: 40  }, // red
  s: { r: 25,  g: 25,  b: 35  }, // near-black (but the pip glyph itself is dark)
  d: { r: 30,  g: 90,  b: 200 }, // blue
};

// Tuning constants
const SAMPLE_STEP = 3;          // sample every 3rd pixel
const NEAR_WHITE_THRESHOLD = 210; // r+g+b/3 above this -> ignored (card background)
const NEAR_BLACK_THRESHOLD = 40;  // below this -> ignored (most UI borders)

function sqDist(r, g, b, target) {
  const dr = r - target.r;
  const dg = g - target.g;
  const db = b - target.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Given a source (HTMLCanvasElement, HTMLVideoElement, or ImageData), sample
 * the pixels inside the given rectangle and return the best-guess suit plus
 * confidence.
 *
 * For HTMLVideoElement / HTMLCanvasElement: rect is in the source's native
 * pixel coordinates.
 *
 * Returns: { suit: 'c'|'h'|'s'|'d'|null, confidence: 0..1, counts: {c,h,s,d} }
 */
export function detectDominantSuitColor(source, rect) {
  if (!source || !rect || rect.w <= 0 || rect.h <= 0) {
    return { suit: null, confidence: 0, counts: { c: 0, h: 0, s: 0, d: 0 } };
  }

  // Draw the region into a scratch canvas so we have ImageData to sample
  const w = Math.max(1, Math.floor(rect.w));
  const h = Math.max(1, Math.floor(rect.h));
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(
      source,
      Math.max(0, Math.floor(rect.x)),
      Math.max(0, Math.floor(rect.y)),
      w, h, 0, 0, w, h,
    );
  } catch (err) {
    return { suit: null, confidence: 0, counts: { c: 0, h: 0, s: 0, d: 0 } };
  }

  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    return { suit: null, confidence: 0, counts: { c: 0, h: 0, s: 0, d: 0 } };
  }

  const counts = { c: 0, h: 0, s: 0, d: 0 };
  let total = 0;

  // Use a pixel-index stride rather than geometric stride to stay cache-friendly
  const stride = SAMPLE_STEP * 4;
  for (let i = 0; i < data.length; i += stride) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    if (brightness > NEAR_WHITE_THRESHOLD) continue;
    if (brightness < NEAR_BLACK_THRESHOLD) continue;
    // Skip low-saturation pixels: they don't help us distinguish green/red/blue
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    if (sat < 0.22) {
      // Low sat = probably dark grey / anti-aliased edge. Still useful for spades.
      if (brightness < 80) counts.s += 1;
      total += 1;
      continue;
    }

    // Classify by nearest color target
    let bestSuit = null;
    let bestDist = Infinity;
    for (const suit of ['c', 'h', 's', 'd']) {
      const d = sqDist(r, g, b, COLOR_TARGETS[suit]);
      if (d < bestDist) {
        bestDist = d;
        bestSuit = suit;
      }
    }
    if (bestSuit) counts[bestSuit] += 1;
    total += 1;
  }

  if (total < 5) {
    return { suit: null, confidence: 0, counts };
  }

  // Winner = highest count
  let winner = 'c';
  for (const s of ['c', 'h', 's', 'd']) {
    if (counts[s] > counts[winner]) winner = s;
  }
  const winnerCount = counts[winner];
  // Runner-up gap gives us confidence
  let runnerUp = 0;
  for (const s of ['c', 'h', 's', 'd']) {
    if (s !== winner && counts[s] > runnerUp) runnerUp = counts[s];
  }
  const gap = winnerCount - runnerUp;
  const confidence = total > 0 ? Math.min(1, gap / total + 0.2) : 0;

  return { suit: winner, confidence, counts };
}

/**
 * Given a matcher hit (rank + suit + confidence) and a source image, verify
 * that the dominant color matches the claimed suit. Returns an adjusted
 * card object: if the color check flips the suit, we drop confidence.
 */
export function verifyCardSuit(card, source, rect) {
  if (!card || !card.suit) return card;
  const color = detectDominantSuitColor(source, rect);
  if (!color.suit || color.confidence < 0.15) {
    // Not enough color signal -- trust the matcher unchanged
    return { ...card, colorCheck: 'insufficient' };
  }
  if (color.suit === card.suit) {
    return {
      ...card,
      colorCheck: 'pass',
      confidence: Math.min(1, (card.confidence || 0) * 1.05),
    };
  }
  // Mismatch: matcher said one suit, color says another. Trust color only if
  // its confidence is high; otherwise drop matcher confidence heavily.
  if (color.confidence > 0.45) {
    return {
      ...card,
      suit: color.suit,
      colorCheck: 'flipped',
      confidence: Math.min(1, color.confidence * 0.85),
      originalSuit: card.suit,
    };
  }
  return {
    ...card,
    colorCheck: 'conflict',
    confidence: (card.confidence || 0) * 0.6,
  };
}
