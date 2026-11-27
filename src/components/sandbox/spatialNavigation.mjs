/**
 * spatialNavigation.mjs - Edge-based getBoundingClientRect() directional focus
 * navigation for composite grids (e.g., CardPickerSheet).
 *
 * Rules enforced:
 *  - Inspects event.composedPath()[0] so editable controls are never intercepted.
 *  - Computes edge-to-edge distance via getBoundingClientRect().
 *  - NEVER calls event.preventDefault() when no focusable candidate exists in
 *    the pressed direction, preserving native scrolling.
 *  - Calls scrollIntoView({ block: 'nearest', inline: 'nearest' }) on focus move.
 */

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableEventTarget(event) {
  const target = (typeof event?.composedPath === 'function' ? event.composedPath()[0] : null) || event?.target;
  if (!target) return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (EDITABLE_TAGS.has(tag)) return true;
  if (target.isContentEditable === true) return true;
  if (typeof target.getAttribute === 'function') {
    const ce = target.getAttribute('contenteditable');
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
  }
  return false;
}

function axisOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function orthogonalGap(aStart, aEnd, bStart, bEnd) {
  if (axisOverlap(aStart, aEnd, bStart, bEnd) > 0) return 0;
  if (bStart >= aEnd) return bStart - aEnd;
  return aStart - bEnd;
}

/**
 * Find the nearest candidate element strictly in the requested direction
 * using edge-based getBoundingClientRect() comparisons.
 */
export function findSpatialNeighbor(currentEl, candidates, direction) {
  if (!currentEl || !ARROW_KEYS.has(direction)) return null;
  if (typeof currentEl.getBoundingClientRect !== 'function') return null;
  const cur = currentEl.getBoundingClientRect();
  if (!cur || (cur.width === 0 && cur.height === 0)) return null;

  const curCx = (cur.left + cur.right) / 2;
  const curCy = (cur.top + cur.bottom) / 2;
  const eps = 1;

  let bestAligned = null;
  let bestAlignedScore = Infinity;
  let bestFallback = null;
  let bestFallbackScore = Infinity;

  for (const el of candidates || []) {
    if (!el || el === currentEl || el.disabled) continue;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-disabled') === 'true') continue;
    if (typeof el.getBoundingClientRect !== 'function') continue;

    const r = el.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) continue;

    let primary = Infinity;
    let orthoEdge = Infinity;
    let centerOffset = Infinity;

    if (direction === 'ArrowRight') {
      if (r.left < cur.right - eps) continue;
      primary = Math.max(0, r.left - cur.right);
      orthoEdge = orthogonalGap(cur.top, cur.bottom, r.top, r.bottom);
      centerOffset = Math.abs(((r.top + r.bottom) / 2) - curCy);
    } else if (direction === 'ArrowLeft') {
      if (r.right > cur.left + eps) continue;
      primary = Math.max(0, cur.left - r.right);
      orthoEdge = orthogonalGap(cur.top, cur.bottom, r.top, r.bottom);
      centerOffset = Math.abs(((r.top + r.bottom) / 2) - curCy);
    } else if (direction === 'ArrowDown') {
      if (r.top < cur.bottom - eps) continue;
      primary = Math.max(0, r.top - cur.bottom);
      orthoEdge = orthogonalGap(cur.left, cur.right, r.left, r.right);
      centerOffset = Math.abs(((r.left + r.right) / 2) - curCx);
    } else if (direction === 'ArrowUp') {
      if (r.bottom > cur.top + eps) continue;
      primary = Math.max(0, cur.top - r.bottom);
      orthoEdge = orthogonalGap(cur.left, cur.right, r.left, r.right);
      centerOffset = Math.abs(((r.left + r.right) / 2) - curCx);
    }

    // Prefer candidates aligned on the orthogonal band (same row for Left/Right,
    // same column for Up/Down) so skipping a disabled cell stays in the same row/col.
    if (orthoEdge === 0) {
      const score = primary + centerOffset * 0.5;
      if (score < bestAlignedScore) {
        bestAlignedScore = score;
        bestAligned = el;
      }
    } else {
      const score = primary + orthoEdge * 4 + centerOffset * 2;
      if (score < bestFallbackScore) {
        bestFallbackScore = score;
        bestFallback = el;
      }
    }
  }

  return bestAligned || bestFallback;
}

/**
 * Keyboard handler for composite role="grid" containers.
 * Returns the newly focused element, or null if no move occurred (in which case
 * preventDefault is NOT called so native scroll continues uninterrupted).
 */
export function handleSpatialGridKeyDown(event, {
  container,
  itemSelector = '[role="gridcell"]:not([disabled])',
  onMove,
} = {}) {
  if (!event || !ARROW_KEYS.has(event.key)) return null;
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (isEditableEventTarget(event)) return null;
  if (!container || typeof container.querySelectorAll !== 'function') return null;

  const currentEl = (typeof event.composedPath === 'function' ? event.composedPath()[0] : null)
    || event.currentTarget
    || event.target;
  const candidates = Array.from(container.querySelectorAll(itemSelector));
  const nextEl = findSpatialNeighbor(currentEl, candidates, event.key);

  if (!nextEl) {
    // Critical spatial-navigation law: never call preventDefault() at grid edges.
    return null;
  }

  event.preventDefault?.();
  onMove?.(nextEl);
  nextEl.focus?.({ preventScroll: true });
  nextEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return nextEl;
}
