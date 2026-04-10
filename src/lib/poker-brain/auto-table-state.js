/**
 * Poker Brain — Auto Table State
 * ================================
 * Zero-calibration detection of the two HUD fields that have been the
 * most embarrassing to ship wrong:
 *
 *   1. playerCount  — how many players are actually sitting at the table
 *   2. position     — the HERO's canonical poker position, with a SPECIFIC
 *                     label ("BTN"/"SB"/"BB"/"UTG"/"UTG+1"/"MP"/"HJ"/"CO")
 *                     instead of a vague bucket ("early"/"late").
 *
 * Both run off the same signal used everywhere else in the HUD: a
 * downscaled frame + simple color heuristics. No layout.json required.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Player count
 * ─────────────────────────────────────────────────────────────────────
 * PokerBros renders every OCCUPIED seat with a distinctive yellow stack
 * number directly under the avatar (e.g. "2,107.88", "250", "132.50").
 * EMPTY seats render a dark grey "EMPTY" text instead — NOT yellow. So
 * counting yellow-text clusters inside the table bbox gives us the
 * exact number of players sitting at the table right now.
 *
 * Yellow signature: R ≥ 200, G ≥ 170, B ≤ 100, saturated warm.
 *
 * Algorithm:
 *   1. Downscale the ROI to ~400px wide
 *   2. Build a yellow mask
 *   3. Find 4-connected components
 *   4. Keep components that look like text runs
 *      (aspect w/h ≥ 1.0, area ≥ minArea)
 *   5. Merge components whose centroids are within a small radius
 *      (the digits of a single stack number like "1,240")
 *   6. Return merged count, clamped to 1..9
 *
 * ─────────────────────────────────────────────────────────────────────
 * Canonical position mapping
 * ─────────────────────────────────────────────────────────────────────
 * Once we know (dealerSeatIndex, heroSeatIndex, playerCount) we can
 * assign each seat a canonical position label based on clockwise
 * distance from the button. This mirrors standard live poker seating.
 */

// ═══════════════════════════════════════════════════════════════════════
// Player count
// ═══════════════════════════════════════════════════════════════════════

const DOWNSCALE_MAX_W = 400;

// Yellow stack-number signature (PokerBros stack text color).
//
// Adaptive test: we want a single predicate that works across dim
// captures, bright HDR windows, and heavy JPEG compression. The fixed
// R>=200,G>=170 test from v1 missed yellows at ~180/150 on lower-
// brightness monitors and fired on orange stack pulses on bright ones.
//
// Instead we test three orthogonal properties of "yellow text":
//   1. Lightness floor — (R+G)/2 > LIGHTNESS_MIN, so dim pixels are
//      rejected but we don't anchor on R alone.
//   2. Blue deficit — (R+G)/2 - B > BLUE_DEFICIT_MIN, so neutral greys
//      and whites are rejected (whites have R≈G≈B, yellows have low B).
//   3. Red-green balance — |R - G| <= RG_BALANCE_MAX, so orange (R>>G)
//      and lime (G>>R) are rejected.
//
// These three tests together form a tight yellow gate that auto-adapts
// to lighting without any calibration.
const LIGHTNESS_MIN = 155;    // (R+G)/2 — permissive enough for dim captures
const BLUE_DEFICIT_MIN = 70;  // (R+G)/2 - B — tight enough to reject white
const RG_BALANCE_MAX = 55;    // |R - G| — rejects orange and lime

function isStackYellow(r, g, b) {
  const lightness = (r + g) * 0.5;
  if (lightness < LIGHTNESS_MIN) return false;
  if (lightness - b < BLUE_DEFICIT_MIN) return false;
  if (Math.abs(r - g) > RG_BALANCE_MAX) return false;
  return true;
}

function downscaleROI(source, tableBounds) {
  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return null;

  let roiX = 0;
  let roiY = 0;
  let roiW = srcW;
  let roiH = srcH;
  if (tableBounds && tableBounds.w > 0 && tableBounds.h > 0) {
    roiX = Math.max(0, Math.min(srcW - 1, Math.round(tableBounds.x)));
    roiY = Math.max(0, Math.min(srcH - 1, Math.round(tableBounds.y)));
    roiW = Math.max(1, Math.min(srcW - roiX, Math.round(tableBounds.w)));
    roiH = Math.max(1, Math.min(srcH - roiY, Math.round(tableBounds.h)));
  }

  const scale = Math.min(1, DOWNSCALE_MAX_W / roiW);
  const dw = Math.max(1, Math.round(roiW * scale));
  const dh = Math.max(1, Math.round(roiH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, roiX, roiY, roiW, roiH, 0, 0, dw, dh);
  const imageData = ctx.getImageData(0, 0, dw, dh);

  return { imageData, roiX, roiY, roiW, roiH, dw, dh };
}

function computeYellowMask(imageData) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (isStackYellow(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
  }
  return mask;
}

/**
 * 4-connected component labeling via iterative flood fill. Returns
 * array of { x, y, w, h, area, cx, cy }.
 */
function findComponents(mask, width, height, minArea) {
  const labels = new Int32Array(width * height);
  const out = [];
  let label = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || labels[idx] !== 0) continue;
      label++;
      labels[idx] = label;
      const stack = [idx];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / width) | 0;
        const cx = cur - cy * width;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        // 4-connected neighbors
        if (cx > 0) {
          const n = cur - 1;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cx < width - 1) {
          const n = cur + 1;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cy > 0) {
          const n = cur - width;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
        if (cy < height - 1) {
          const n = cur + width;
          if (mask[n] && labels[n] === 0) { labels[n] = label; stack.push(n); }
        }
      }
      if (area >= minArea) {
        out.push({
          x: minX,
          y: minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
          area,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
        });
      }
    }
  }
  return out;
}

/**
 * Cluster components into "stack groups" — the individual digits of
 * a single stack number (e.g. "1,240") become one cluster. Clusters
 * are formed by merging components whose centroids are within mergeR
 * pixels on BOTH axes.
 */
function clusterComponents(comps, mergeR) {
  const clusters = [];
  const used = new Array(comps.length).fill(false);
  for (let i = 0; i < comps.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const group = [comps[i]];
    let gx = comps[i].cx;
    let gy = comps[i].cy;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < comps.length; j++) {
        if (used[j]) continue;
        // Test against any member of the group
        let nearby = false;
        for (const m of group) {
          if (Math.abs(comps[j].cx - m.cx) <= mergeR && Math.abs(comps[j].cy - m.cy) <= mergeR * 0.5) {
            nearby = true;
            break;
          }
        }
        if (nearby) {
          group.push(comps[j]);
          used[j] = true;
          changed = true;
        }
      }
    }
    // Cluster bbox
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let totalArea = 0;
    for (const c of group) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.w > maxX) maxX = c.x + c.w;
      if (c.y + c.h > maxY) maxY = c.y + c.h;
      totalArea += c.area;
    }
    clusters.push({
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      area: totalArea,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    });
  }
  return clusters;
}

/**
 * Detect the number of seated players in the current frame by counting
 * yellow stack-number clusters inside the given table bounds.
 *
 * @returns {{
 *   playerCount: number,
 *   clusters: Array<{x,y,w,h,cx,cy}>,   // in FULL source-frame pixels
 *   debug: object
 * }}
 */
export function detectPlayerCountByStacks(source, tableBounds) {
  const dn = downscaleROI(source, tableBounds);
  if (!dn) return { playerCount: 0, clusters: [], debug: { reason: 'no-source' } };
  const { imageData, roiX, roiY, roiW, roiH, dw, dh } = dn;

  const mask = computeYellowMask(imageData);
  // Require ~0.03% of ROI pixels as min component area (roughly ≥ 4 px
  // in downscaled space — one digit stroke)
  const minArea = Math.max(4, Math.floor(dw * dh * 0.00015));
  const comps = findComponents(mask, dw, dh, minArea);

  // Merge radius: digits of a number sit within ~4% of ROI width of each
  // other, and name-label runs may span ~8% — we cluster tight to avoid
  // merging two different seats' stacks together.
  const mergeR = Math.max(4, Math.floor(dw * 0.035));
  const rawClusters = clusterComponents(comps, mergeR);

  // Filter clusters that look like real stack numbers:
  //   - minimum width of ~1.5% of ROI
  //   - aspect ratio w/h >= 1.0 (text runs are wider than tall)
  //   - area >= 3× single-digit area
  const minClusterW = Math.max(3, Math.floor(dw * 0.015));
  const clusters = rawClusters.filter((c) => {
    if (c.w < minClusterW) return false;
    if (c.h <= 0) return false;
    const ar = c.w / c.h;
    if (ar < 0.9) return false;
    if (c.area < minArea * 3) return false;
    return true;
  });

  // Scale clusters back to full source-frame coordinates
  const sx = roiW / dw;
  const sy = roiH / dh;
  const clustersSrc = clusters.map((c) => ({
    x: Math.round(roiX + c.x * sx),
    y: Math.round(roiY + c.y * sy),
    w: Math.round(c.w * sx),
    h: Math.round(c.h * sy),
    cx: Math.round(roiX + c.cx * sx),
    cy: Math.round(roiY + c.cy * sy),
  }));

  // PokerBros max 9 seats; clamp to 1..9. If we detect 0 stacks the
  // table is likely mis-detected so fall back to "unknown" = 0.
  const playerCount = Math.max(0, Math.min(9, clusters.length));

  return {
    playerCount,
    clusters: clustersSrc,
    debug: {
      dw,
      dh,
      rawComps: comps.length,
      rawClusters: rawClusters.length,
      finalClusters: clusters.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Canonical position mapping
// ═══════════════════════════════════════════════════════════════════════

/**
 * Map a (clockwise distance from BTN, total players) pair to a
 * canonical poker position label. Distance 0 = the button seat itself.
 *
 * Supports 2..9 handed games.
 */
function positionByOffset(offset, numPlayers) {
  if (numPlayers === 2) {
    return offset === 0 ? 'BTN/SB' : 'BB';
  }
  if (numPlayers === 3) {
    return ['BTN', 'SB', 'BB'][offset];
  }
  if (numPlayers === 4) {
    return ['BTN', 'SB', 'BB', 'CO'][offset];
  }
  if (numPlayers === 5) {
    return ['BTN', 'SB', 'BB', 'UTG', 'CO'][offset];
  }
  if (numPlayers === 6) {
    return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'][offset];
  }
  if (numPlayers === 7) {
    return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'][offset];
  }
  if (numPlayers === 8) {
    return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'][offset];
  }
  // 9-handed (full ring)
  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'][offset];
}

/**
 * Compute the hero's canonical poker position given:
 *   - dealerAngleDeg: dealer seat angle around table center (degrees)
 *   - heroAngleDeg:   hero   seat angle around table center (degrees)
 *   - numPlayers:     seated player count (2..9)
 *   - occupiedAngles: OPTIONAL sorted-clockwise list of occupied seat angles,
 *                     so we can skip empty seats when computing the offset
 *
 * Returns a specific position label like "BTN" / "SB" / "BB" / "UTG" /
 * "MP" / "CO" / "HJ".
 */
export function canonicalPosition({
  dealerAngleDeg,
  heroAngleDeg,
  numPlayers,
  occupiedAngles,
}) {
  if (!Number.isFinite(dealerAngleDeg) || !Number.isFinite(heroAngleDeg)) {
    return 'unknown';
  }
  const n = Math.max(2, Math.min(9, Math.round(numPlayers || 6)));

  // If we have occupied seat angles, compute the offset in terms of
  // OCCUPIED seat order (ignore empty seats — position math follows
  // seated players, not physical chairs). Otherwise assume uniform
  // spacing around the circle.
  if (Array.isArray(occupiedAngles) && occupiedAngles.length === n) {
    // Find index of dealer and hero in the clockwise-sorted list
    const byDist = (ref) => {
      let bestI = 0;
      let bestD = 360;
      for (let i = 0; i < occupiedAngles.length; i++) {
        const d = Math.abs(((occupiedAngles[i] - ref + 540) % 360) - 180);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      return bestI;
    };
    const dIdx = byDist(dealerAngleDeg);
    const hIdx = byDist(heroAngleDeg);
    const offset = (hIdx - dIdx + n) % n;
    return positionByOffset(offset, n);
  }

  // Uniform-spacing fallback
  const delta = ((heroAngleDeg - dealerAngleDeg + 360) % 360);
  const offset = Math.round((delta / 360) * n) % n;
  return positionByOffset(offset, n);
}

/**
 * Simpler overload: given a clockwise offset directly (0 = dealer,
 * 1 = next clockwise from dealer, etc.), return the position.
 */
export function positionFromOffset(offset, numPlayers) {
  const n = Math.max(2, Math.min(9, Math.round(numPlayers || 6)));
  const o = ((offset % n) + n) % n;
  return positionByOffset(o, n);
}

export default detectPlayerCountByStacks;
