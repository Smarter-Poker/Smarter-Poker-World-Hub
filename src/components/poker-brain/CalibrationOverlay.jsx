import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Poker Brain Calibration Overlay
 * --------------------------------
 * Renders the current layout.json regions on top of the video feed so the
 * user can see exactly where the HUD thinks hole cards, board cards, OCR
 * regions, and seats are. Supports drag-to-move and edge-drag-to-resize.
 *
 * Adjusted regions are persisted to localStorage under the key
 * `pokerBrain.layoutOverrides.v1` and merged on top of the base layout by
 * the HUD on load.
 *
 * Props:
 *   videoRef         -- ref to the <video> element
 *   baseLayout       -- the layout.json object
 *   overrides        -- current override object
 *   onOverridesChange -- callback when user edits a region
 *   visible          -- show/hide toggle
 *   editable         -- whether regions are draggable
 */

const REGION_COLORS = {
  holeCards:  '#f59e0b',
  boardCards: '#10b981',
  ocrRegions: '#60a5fa',
  actionButtons: '#a78bfa',
  seats: '#ec4899',
};

function mergeRect(base, override) {
  if (!override) return base;
  return { ...base, ...override };
}

function flattenLayout(layout, overrides) {
  const out = [];
  (layout.holeCards || []).forEach((r, i) => {
    out.push({
      group: 'holeCards',
      key: `holeCards.${i}`,
      label: `Hole ${i + 1}`,
      rect: mergeRect(r, overrides?.holeCards?.[i]),
      color: REGION_COLORS.holeCards,
    });
  });
  (layout.boardCards || []).forEach((r, i) => {
    out.push({
      group: 'boardCards',
      key: `boardCards.${i}`,
      label: `Board ${i + 1}`,
      rect: mergeRect(r, overrides?.boardCards?.[i]),
      color: REGION_COLORS.boardCards,
    });
  });
  Object.entries(layout.ocrRegions || {}).forEach(([name, r]) => {
    out.push({
      group: 'ocrRegions',
      key: `ocrRegions.${name}`,
      label: name,
      rect: mergeRect(r, overrides?.ocrRegions?.[name]),
      color: REGION_COLORS.ocrRegions,
    });
  });
  Object.entries(layout.actionButtons || {}).forEach(([name, r]) => {
    out.push({
      group: 'actionButtons',
      key: `actionButtons.${name}`,
      label: name,
      rect: mergeRect(r, overrides?.actionButtons?.[name]),
      color: REGION_COLORS.actionButtons,
    });
  });
  (layout.seats || []).forEach((s, i) => {
    if (!s.region) return;
    out.push({
      group: 'seats',
      key: `seats.${i}`,
      label: s.id || `Seat ${i + 1}`,
      rect: mergeRect(s.region, overrides?.seats?.[i]),
      color: REGION_COLORS.seats,
    });
  });
  return out;
}

function setOverride(overrides, key, newRect) {
  const next = JSON.parse(JSON.stringify(overrides || {}));
  const parts = key.split('.');
  if (parts[0] === 'holeCards' || parts[0] === 'boardCards' || parts[0] === 'seats') {
    const idx = Number(parts[1]);
    if (!next[parts[0]]) next[parts[0]] = [];
    next[parts[0]][idx] = newRect;
  } else if (parts[0] === 'ocrRegions' || parts[0] === 'actionButtons') {
    if (!next[parts[0]]) next[parts[0]] = {};
    next[parts[0]][parts[1]] = newRect;
  }
  return next;
}

const CalibrationOverlay = ({
  videoRef,
  baseLayout,
  overrides,
  onOverridesChange,
  visible = true,
  editable = false,
}) => {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  // Track the video element's rendered size (object-contain may letterbox)
  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const v = videoRef.current;
      if (!v) return;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const rect = v.getBoundingClientRect();
      if (!vw || !vh || !rect.width || !rect.height) {
        setDims({ w: 0, h: 0 });
        return;
      }
      // object-contain: the video's displayed rect is the intersection of the
      // element box and the video's aspect ratio.
      const elAspect = rect.width / rect.height;
      const vidAspect = vw / vh;
      let displayW, displayH, offsetX, offsetY;
      if (vidAspect > elAspect) {
        displayW = rect.width;
        displayH = rect.width / vidAspect;
        offsetX = 0;
        offsetY = (rect.height - displayH) / 2;
      } else {
        displayH = rect.height;
        displayW = rect.height * vidAspect;
        offsetX = (rect.width - displayW) / 2;
        offsetY = 0;
      }
      setDims({ w: displayW, h: displayH, offsetX, offsetY });
    };
    update();
    const ro = new ResizeObserver(update);
    if (videoRef.current) ro.observe(videoRef.current);
    window.addEventListener('resize', update);
    const iv = setInterval(update, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      clearInterval(iv);
    };
  }, [visible, videoRef]);

  const regions = flattenLayout(baseLayout, overrides);

  const refW = baseLayout.referenceSize?.w || 480;
  const refH = baseLayout.referenceSize?.h || 1054;
  const sx = dims.w / refW;
  const sy = dims.h / refH;

  const onPointerDown = useCallback((e, region) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...region.rect };
    const mode = e.target.dataset.handle || 'move';
    dragRef.current = { region, startX, startY, startRect, mode };
  }, [editable]);

  useEffect(() => {
    if (!editable) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dxDisplay = e.clientX - d.startX;
      const dyDisplay = e.clientY - d.startY;
      // Convert display pixels back to layout-reference units
      const dxRef = sx ? dxDisplay / sx : 0;
      const dyRef = sy ? dyDisplay / sy : 0;
      let next;
      if (d.mode === 'move') {
        next = { ...d.startRect, x: d.startRect.x + dxRef, y: d.startRect.y + dyRef };
      } else if (d.mode === 'resize') {
        next = {
          ...d.startRect,
          w: Math.max(4, d.startRect.w + dxRef),
          h: Math.max(4, d.startRect.h + dyRef),
        };
      }
      if (next && onOverridesChange) {
        onOverridesChange(setOverride(overrides, d.region.key, next));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [editable, sx, sy, overrides, onOverridesChange]);

  if (!visible || !dims.w || !dims.h) return null;

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none"
      style={{
        left: dims.offsetX,
        top: dims.offsetY,
        width: dims.w,
        height: dims.h,
      }}
    >
      {regions.map((r) => {
        const left = r.rect.x * sx;
        const top = r.rect.y * sy;
        const width = r.rect.w * sx;
        const height = r.rect.h * sy;
        return (
          <div
            key={r.key}
            onPointerDown={(e) => onPointerDown(e, r)}
            className={editable ? 'pointer-events-auto cursor-move' : ''}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              border: `2px solid ${r.color}`,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.6) inset`,
              background: `${r.color}18`,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -14,
                left: 0,
                fontSize: 9,
                color: r.color,
                background: 'rgba(0,0,0,0.75)',
                padding: '1px 4px',
                borderRadius: 2,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {r.label}
            </div>
            {editable && (
              <div
                data-handle="resize"
                onPointerDown={(e) => onPointerDown(e, r)}
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  width: 10,
                  height: 10,
                  background: r.color,
                  cursor: 'nwse-resize',
                  borderRadius: 2,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CalibrationOverlay;

// ---------------------------------------------------------------------------
// Helpers for the HUD to load/save overrides and merge them into the base layout
// ---------------------------------------------------------------------------
export const OVERRIDES_KEY = 'pokerBrain.layoutOverrides.v1';

export function loadLayoutOverrides() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function saveLayoutOverrides(overrides) {
  try {
    if (typeof window === 'undefined') return;
    if (!overrides) {
      window.localStorage.removeItem(OVERRIDES_KEY);
    } else {
      window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    }
  } catch (err) { /* swallow */ }
}

export function mergeLayoutWithOverrides(base, overrides) {
  if (!overrides) return base;
  const out = JSON.parse(JSON.stringify(base));
  if (overrides.holeCards) {
    overrides.holeCards.forEach((o, i) => {
      if (o && out.holeCards[i]) out.holeCards[i] = { ...out.holeCards[i], ...o };
    });
  }
  if (overrides.boardCards) {
    overrides.boardCards.forEach((o, i) => {
      if (o && out.boardCards[i]) out.boardCards[i] = { ...out.boardCards[i], ...o };
    });
  }
  if (overrides.ocrRegions) {
    out.ocrRegions = { ...(out.ocrRegions || {}) };
    Object.entries(overrides.ocrRegions).forEach(([k, v]) => {
      out.ocrRegions[k] = { ...(out.ocrRegions[k] || {}), ...v };
    });
  }
  if (overrides.actionButtons) {
    out.actionButtons = { ...(out.actionButtons || {}) };
    Object.entries(overrides.actionButtons).forEach(([k, v]) => {
      out.actionButtons[k] = { ...(out.actionButtons[k] || {}), ...v };
    });
  }
  if (overrides.seats) {
    overrides.seats.forEach((o, i) => {
      if (o && out.seats[i]) out.seats[i] = { ...out.seats[i], region: { ...out.seats[i].region, ...o } };
    });
  }
  return out;
}
