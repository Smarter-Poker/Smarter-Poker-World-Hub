/**
 * Poker Brain - Available Action Detector
 * ========================================
 * PokerBros shows the current actions available to the hero (fold / check-call /
 * bet-raise) as colored buttons along the bottom of the table. Rather than
 * template-matching each button, we sample the color at the button region in
 * layout.json and ask: "does this area contain enough pixels matching the
 * expected button color?". If yes, the action is available.
 *
 * This gives the HUD a sanity signal: if the engine says "FOLD" but the fold
 * button is not actually visible (hand already folded, we're not to act, etc.),
 * we can suppress or downgrade the recommendation.
 *
 * Pure JS + Canvas. No ML.
 */

/**
 * Parse a CSS hex color into {r,g,b}. Accepts "#rrggbb".
 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Does the pixel approximately match target within a per-channel tolerance?
 */
function pixelMatches(r, g, b, target, tol) {
  return (
    Math.abs(r - target.r) <= tol &&
    Math.abs(g - target.g) <= tol &&
    Math.abs(b - target.b) <= tol
  );
}

/**
 * Count pixels in an ImageData rect that match the target color.
 */
function countMatchingPixels(imageData, rect, target, tol) {
  const { data, width } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imageData.width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(imageData.height, Math.floor(rect.y + rect.h));
  let count = 0;
  let total = 0;
  // Stride of 2 in both axes keeps the scan cheap for 1 Hz calls.
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const idx = (y * width + x) * 4;
      total += 1;
      if (pixelMatches(data[idx], data[idx + 1], data[idx + 2], target, tol)) count += 1;
    }
  }
  return { count, total };
}

/**
 * Main entry: detect which action buttons are currently "visible" (enabled).
 *
 * @param {HTMLCanvasElement|HTMLVideoElement} source
 * @param {object} layout  the layout.json object (needs actionButtons + referenceSize)
 * @param {object} [opts]
 * @param {number} [opts.tolerance=32]   per-channel color match tolerance
 * @param {number} [opts.minRatio=0.08]  fraction of sampled pixels that must match
 * @returns {{
 *   fold: boolean,
 *   checkCall: boolean,
 *   betRaise: boolean,
 *   ratios: Record<string, number>,
 *   any: boolean,
 * }}
 */
export function detectAvailableActions(source, layout, opts = {}) {
  const tolerance = opts.tolerance ?? 32;
  const minRatio = opts.minRatio ?? 0.08;
  const empty = {
    fold: false, checkCall: false, betRaise: false,
    ratios: {}, any: false,
  };
  if (!layout || !layout.actionButtons) return empty;

  const srcW = source.videoWidth || source.width || source.naturalWidth;
  const srcH = source.videoHeight || source.height || source.naturalHeight;
  if (!srcW || !srcH) return empty;

  const refW = layout.referenceSize?.w || 480;
  const refH = layout.referenceSize?.h || 1054;
  const sx = srcW / refW;
  const sy = srcH / refH;

  // Cached canvas to avoid creating a new one per call (~1 Hz)
  if (!detectAvailableActions._canvas) {
    detectAvailableActions._canvas = document.createElement('canvas');
    detectAvailableActions._ctx = detectAvailableActions._canvas.getContext('2d', { willReadFrequently: true });
  }
  const canvas = detectAvailableActions._canvas;
  if (canvas.width !== srcW || canvas.height !== srcH) {
    canvas.width = srcW;
    canvas.height = srcH;
  }
  const ctx = detectAvailableActions._ctx;
  ctx.drawImage(source, 0, 0, srcW, srcH);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);

  const result = {
    fold: false,
    checkCall: false,
    betRaise: false,
    ratios: {},
    any: false,
  };

  for (const [name, btn] of Object.entries(layout.actionButtons)) {
    const target = hexToRgb(btn.color);
    if (!target) continue;
    const scaled = {
      x: btn.x * sx,
      y: btn.y * sy,
      w: btn.w * sx,
      h: btn.h * sy,
    };
    const { count, total } = countMatchingPixels(imageData, scaled, target, tolerance);
    const ratio = total > 0 ? count / total : 0;
    result.ratios[name] = Math.round(ratio * 1000) / 1000;
    const visible = ratio >= minRatio;
    if (name === 'fold') result.fold = visible;
    else if (name === 'checkCall') result.checkCall = visible;
    else if (name === 'betRaise') result.betRaise = visible;
  }

  result.any = result.fold || result.checkCall || result.betRaise;
  return result;
}

/**
 * Given a detected action set and an engine recommendation, decide whether
 * the recommendation is consistent. Returns a conflict reason or null.
 *
 * Conflicts:
 *   - Engine says FOLD but no buttons visible   -> hero is not to act
 *   - Engine says CHECK but checkCall not visible
 *   - Engine says RAISE/BET but betRaise not visible
 */
export function validateAction(actions, engineAction) {
  if (!actions || !actions.any) {
    return { consistent: false, reason: 'No action buttons visible (not hero turn)' };
  }
  const a = String(engineAction || '').toUpperCase();
  if (a === 'FOLD' && !actions.fold) {
    return { consistent: false, reason: 'Fold button not visible' };
  }
  if (a === 'CHECK' && !actions.checkCall) {
    return { consistent: false, reason: 'Check/call button not visible' };
  }
  if (a === 'CALL' && !actions.checkCall) {
    return { consistent: false, reason: 'Check/call button not visible' };
  }
  if ((a === 'RAISE' || a === 'BET') && !actions.betRaise) {
    return { consistent: false, reason: 'Bet/raise button not visible' };
  }
  return { consistent: true, reason: null };
}

export default detectAvailableActions;
