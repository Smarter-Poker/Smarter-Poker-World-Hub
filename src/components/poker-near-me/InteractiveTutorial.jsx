/**
 * InteractiveTutorial.jsx — Premium Guided Tutorial Overlay
 *
 * Features:
 *   - Spotlight Mask: Full-viewport dark overlay with transparent cutout over the target element
 *   - Animated Pointer Arrow: SVG dashed line from tooltip to highlighted target
 *   - 2.5x Sized Tooltip Card with rich descriptions
 *   - Auto-Positioning: tooltip intelligently positions around the target
 *   - Smooth Framer-Motion transitions between steps
 *   - Per-Page Persistence via localStorage
 *   - "Don't Show Again" + "Skip" + "Next" controls
 *
 * Fixes:
 *   - Grid pod elements (transparent buttons) are handled correctly even with
 *     zero-height or absolutely-positioned layouts
 *   - scrollIntoView only fires when element is truly off-screen, not when
 *     inside a scrollable container that's already visible
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── CONSTANTS ───
const SPOTLIGHT_PADDING = 12;
const ARROW_COLOR = '#6ee7ef';
const GLOW_COLOR = 'rgba(110, 231, 239, 0.5)';
const TOOLTIP_MAX_WIDTH = 480;
const TOOLTIP_MIN_WIDTH = 340;
const MIN_TARGET_SIZE = 20; // Minimum px size to consider an element "visible"

// Sub-pixel-tolerant comparisons so the position poll only triggers a re-render
// when the layout actually moved.
function sameRect(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') return Math.abs(va - vb) < 0.5;
    return va === vb;
  });
}

/**
 * Compute the bounding rect of a target element by data-tutorial-id.
 * If the element has zero/tiny dimensions (transparent grid buttons),
 * walk up to the nearest parent with real dimensions.
 */
function getTargetRect(targetId) {
  if (!targetId || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tutorial-id="${targetId}"]`);
  if (!el) return null;

  let rect = el.getBoundingClientRect();

  // If element is too small (e.g. transparent grid buttons), use parent dims
  if (rect.width < MIN_TARGET_SIZE || rect.height < MIN_TARGET_SIZE) {
    // The grid button is in a CSS grid cell — its own rect IS the cell rect,
    // but it might report 0 height if it's an empty button with no content.
    // Walk up to a parent with real dimensions.
    let parent = el.parentElement;
    let tries = 0;
    while (parent && tries < 5) {
      const pRect = parent.getBoundingClientRect();
      if (pRect.width >= MIN_TARGET_SIZE && pRect.height >= MIN_TARGET_SIZE) {
        // For grid children, the element's position within the parent matters
        // Use the element's actual position but with minimum dimensions
        rect = {
          top: rect.top,
          left: rect.left,
          right: Math.max(rect.right, rect.left + MIN_TARGET_SIZE * 4),
          bottom: Math.max(rect.bottom, rect.top + MIN_TARGET_SIZE * 4),
          width: Math.max(rect.width, MIN_TARGET_SIZE * 4),
          height: Math.max(rect.height, MIN_TARGET_SIZE * 4),
        };
        break;
      }
      parent = parent.parentElement;
      tries++;
    }
  }

  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    element: el,
  };
}

/**
 * Generate the SVG clip-path for the spotlight cutout
 */
function buildClipPath(rect) {
  if (!rect) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const t = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const l = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const r = Math.min(vw, rect.right + SPOTLIGHT_PADDING);
  const b = Math.min(vh, rect.bottom + SPOTLIGHT_PADDING);
  const br = 12;

  return `M0,0 L${vw},0 L${vw},${vh} L0,${vh} Z ` +
    `M${l + br},${t} L${r - br},${t} Q${r},${t} ${r},${t + br} ` +
    `L${r},${b - br} Q${r},${b} ${r - br},${b} ` +
    `L${l + br},${b} Q${l},${b} ${l},${b - br} ` +
    `L${l},${t + br} Q${l},${t} ${l + br},${t} Z`;
}

/**
 * Determine best tooltip position relative to target
 */
function getTooltipPosition(targetRect, tooltipWidth, tooltipHeight) {
  if (!targetRect) return { top: '50%', left: '50%', arrowDir: 'none' };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  const tw = Math.min(tooltipWidth, vw - 32);

  const spaceBelow = vh - targetRect.bottom - SPOTLIGHT_PADDING;
  const spaceAbove = targetRect.top - SPOTLIGHT_PADDING;
  const spaceRight = vw - targetRect.right - SPOTLIGHT_PADDING;
  const spaceLeft = targetRect.left - SPOTLIGHT_PADDING;

  let top, left, arrowDir;

  if (spaceBelow > tooltipHeight + margin * 2) {
    top = targetRect.bottom + SPOTLIGHT_PADDING + margin;
    left = Math.max(margin, Math.min(targetRect.centerX - tw / 2, vw - tw - margin));
    arrowDir = 'up';
  } else if (spaceAbove > tooltipHeight + margin * 2) {
    top = targetRect.top - SPOTLIGHT_PADDING - margin - tooltipHeight;
    left = Math.max(margin, Math.min(targetRect.centerX - tw / 2, vw - tw - margin));
    arrowDir = 'down';
  } else if (spaceRight > tw + margin * 2) {
    top = Math.max(margin, Math.min(targetRect.centerY - tooltipHeight / 2, vh - tooltipHeight - margin));
    left = targetRect.right + SPOTLIGHT_PADDING + margin;
    arrowDir = 'left';
  } else if (spaceLeft > tw + margin * 2) {
    top = Math.max(margin, Math.min(targetRect.centerY - tooltipHeight / 2, vh - tooltipHeight - margin));
    left = targetRect.left - SPOTLIGHT_PADDING - margin - tw;
    arrowDir = 'right';
  } else {
    // Fallback: position tooltip at bottom of screen
    top = vh - tooltipHeight - margin - 60;
    left = Math.max(margin, (vw - tw) / 2);
    arrowDir = 'up';
  }

  return { top, left, arrowDir };
}

/**
 * Compute arrow SVG path from tooltip to target
 */
function getArrowPath(targetRect, tooltipPos, arrowDir) {
  if (!targetRect || arrowDir === 'none') return null;

  let fromX, fromY, toX, toY;
  const tw = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - 32);

  toX = targetRect.centerX;
  toY = targetRect.centerY;

  switch (arrowDir) {
    case 'up':
      fromX = Math.min(Math.max(targetRect.centerX, (tooltipPos.left || 0) + 40), (tooltipPos.left || 0) + tw - 40);
      fromY = tooltipPos.top || 0;
      toY = targetRect.bottom + SPOTLIGHT_PADDING;
      break;
    case 'down':
      fromX = Math.min(Math.max(targetRect.centerX, (tooltipPos.left || 0) + 40), (tooltipPos.left || 0) + tw - 40);
      fromY = (tooltipPos.top || 0) + 280;
      toY = targetRect.top - SPOTLIGHT_PADDING;
      break;
    case 'left':
      fromX = tooltipPos.left || 0;
      fromY = (tooltipPos.top || 0) + 140;
      toX = targetRect.right + SPOTLIGHT_PADDING;
      break;
    case 'right':
      fromX = (tooltipPos.left || 0) + tw;
      fromY = (tooltipPos.top || 0) + 140;
      toX = targetRect.left - SPOTLIGHT_PADDING;
      break;
    default:
      return null;
  }

  const midY = (fromY + toY) / 2;
  const midX = (fromX + toX) / 2;
  const cpOffset = Math.abs(fromY - toY) * 0.3 || 30;

  return {
    path: arrowDir === 'up' || arrowDir === 'down'
      ? `M${fromX},${fromY} C${fromX},${midY - cpOffset} ${toX},${midY + cpOffset} ${toX},${toY}`
      : `M${fromX},${fromY} C${midX - cpOffset},${fromY} ${midX + cpOffset},${toY} ${toX},${toY}`,
    fromX, fromY, toX, toY,
  };
}

/**
 * GlowBorder — Animated Border Around The Spotlighted Element
 */
function GlowBorder({ rect }) {
  if (!rect) return null;
  const p = SPOTLIGHT_PADDING;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        top: rect.top - p,
        left: rect.left - p,
        width: rect.width + p * 2,
        height: rect.height + p * 2,
        borderRadius: 14,
        border: `2px solid ${ARROW_COLOR}`,
        boxShadow: `0 0 20px ${GLOW_COLOR}, 0 0 40px rgba(110,231,239,0.2), inset 0 0 20px ${GLOW_COLOR}`,
        pointerEvents: 'none',
        zIndex: 10001,
        animation: 'tutorial-glow-pulse 2s ease-in-out infinite',
      }}
    />
  );
}

/**
 * ArrowSVG — Animated Dashed Arrow From Tooltip To Target
 */
function ArrowSVG({ arrowData }) {
  if (!arrowData) return null;
  const { path, toX, toY } = arrowData;

  return (
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 10002,
        overflow: 'visible',
      }}
    >
      <defs>
        <marker
          id="tutorial-arrowhead"
          markerWidth="12"
          markerHeight="10"
          refX="10"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L12,5 L0,10 Z" fill={ARROW_COLOR} />
        </marker>
        <filter id="tutorial-arrow-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow Line */}
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(110,231,239,0.2)"
        strokeWidth="6"
        filter="url(#tutorial-arrow-glow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      {/* Main Dashed Line */}
      <motion.path
        d={path}
        fill="none"
        stroke={ARROW_COLOR}
        strokeWidth="2.5"
        strokeDasharray="8,6"
        markerEnd="url(#tutorial-arrowhead)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        style={{
          filter: 'drop-shadow(0 0 4px rgba(110,231,239,0.4))',
        }}
      />

      {/* Pulsing Dot At Target End */}
      <motion.circle
        cx={toX}
        cy={toY}
        r="6"
        fill={ARROW_COLOR}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0.6, 1], scale: [0, 1.3, 1, 1.2] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
        style={{ filter: `drop-shadow(0 0 8px ${GLOW_COLOR})` }}
      />
    </svg>
  );
}

/**
 * TooltipCard — Mobile-Optimized Tutorial Tooltip
 * Features prominent close button, scrollable content, compact mobile layout
 */
function TooltipCard({ step, currentIndex, totalSteps, position, onNext, onSkip, onDontShow, cardRef }) {
  if (!step) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 480;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const icons = {
    'pod-nearme': '●', 'pod-homegames': '', 'pod-livegames': '', 'pod-tours': '◆',
    'pod-mapview': '■', 'pod-calendar': '', 'pod-series': '★', 'pod-roadtrip': '',
    'pod-daily': '', 'pod-favorites': '', 'pod-social': '', 'pod-alerts': '',
    'tab-venues': '●', 'tab-events': '', 'tab-live': '', 'tab-map': '■',
    'tab-saved': '', 'tab-more': '',
    'pnm-search': '○', 'pnm-gps': '', 'pnm-filters': '', 'pnm-sort': '↕',
    'subtab-tours': '◆', 'subtab-series': '★', 'subtab-daily': '', 'subtab-calendar': '',
  };

  // Mobile: bottom-sheet style so users can still see the page above
  const mobileStyles = isMobile ? {
    position: 'fixed',
    bottom: 'env(safe-area-inset-bottom, 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: Math.min(vw - 16, 420),
    maxHeight: Math.min(vh * 0.55, 380),
    zIndex: 10003,
    pointerEvents: 'auto',
  } : {
    position: 'fixed',
    top: position.top,
    left: position.left,
    width: Math.min(TOOLTIP_MAX_WIDTH, vw - 32),
    minWidth: Math.min(TOOLTIP_MIN_WIDTH, vw - 32),
    zIndex: 10003,
    pointerEvents: 'auto',
  };

  return (
    <motion.div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="pnm-tutorial-title"
      tabIndex={-1}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{ ...mobileStyles, outline: 'none' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      <div style={{
        background: 'linear-gradient(145deg, rgba(12,24,40,0.97), rgba(6,15,28,0.98))',
        backdropFilter: 'blur(24px)',
        border: '1.5px solid rgba(110,231,239,0.25)',
        borderRadius: isMobile ? 16 : 20,
        padding: isMobile ? '16px' : 'clamp(20px, 4vw, 32px)',
        boxShadow: `
          0 0 40px rgba(110,231,239,0.15),
          0 20px 60px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,255,255,0.05)
        `,
        fontFamily: 'Inter, system-ui, sans-serif',
        maxHeight: isMobile ? (vh - 60) : 'none',
        overflowY: isMobile ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}>
        {/* ═══ Close (X) Button — Always Visible ═══ */}
        <button
          onClick={(e) => { e.stopPropagation(); onSkip?.(); }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSkip?.(); }}
          aria-label="Close tutorial"
          style={{
            position: 'absolute',
            top: isMobile ? 8 : 12,
            right: isMobile ? 8 : 12,
            width: 36, height: 36,
            borderRadius: '50%',
            border: '1px solid rgba(200,214,229,0.15)',
            background: 'rgba(200,214,229,0.06)',
            color: 'rgba(200,214,229,0.6)',
            fontSize: 20, fontWeight: 400,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1,
            transition: 'all 0.2s',
            fontFamily: 'system-ui',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>

        {/* Step Counter */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: isMobile ? 10 : 16,
          paddingRight: 40, // space for X button
        }}>
          <span style={{
            fontSize: isMobile ? 11 : 13, color: ARROW_COLOR, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.12em',
            opacity: 0.8,
          }}>
            Step {currentIndex + 1} Of {totalSteps}
          </span>
          <div style={{
            padding: isMobile ? '3px 8px' : '4px 10px', borderRadius: 8,
            background: 'rgba(110,231,239,0.08)',
            border: '1px solid rgba(110,231,239,0.15)',
            fontSize: isMobile ? 10 : 11, color: 'rgba(200,214,229,0.5)',
            fontWeight: 600, letterSpacing: '0.05em',
          }}>
            TUTORIAL
          </div>
        </div>

        {/* Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, marginBottom: isMobile ? 10 : 16 }}>
          <div style={{
            width: isMobile ? 48 : 72, height: isMobile ? 48 : 72, borderRadius: isMobile ? 12 : 18,
            background: 'linear-gradient(135deg, rgba(110,231,239,0.12), rgba(110,231,239,0.04))',
            border: '2px solid rgba(110,231,239,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            animation: 'tutorial-badge-pulse 2.5s ease-in-out infinite',
            boxShadow: '0 0 20px rgba(110,231,239,0.1)',
          }}>
            <span style={{ fontSize: isMobile ? 24 : 36 }}>
              {icons[step.targetId] || ''}
            </span>
          </div>
          <div>
            <h3 id="pnm-tutorial-title" style={{
              fontSize: isMobile ? '18px' : 'clamp(22px, 4vw, 28px)', fontWeight: 800, color: '#fff',
              margin: 0, letterSpacing: '-0.5px',
              lineHeight: 1.2,
            }}>
              {step.title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: isMobile ? '13px' : 'clamp(14px, 2.5vw, 17px)',
          color: 'rgba(200,214,229,0.75)',
          lineHeight: 1.55, margin: isMobile ? '0 0 14px' : '0 0 24px',
          letterSpacing: '0.01em',
        }}>
          {step.desc}
        </p>

        {/* Pro Tip */}
        {step.tip && (
          <div style={{
            padding: isMobile ? '8px 10px' : '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            marginBottom: isMobile ? 14 : 24,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span style={{ fontSize: isMobile ? 12 : 13, color: '#ffffff', lineHeight: 1.45, fontWeight: 500 }}>
              {step.tip}
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div style={{
          width: '100%', height: isMobile ? 3 : 4, borderRadius: 2,
          background: 'rgba(200,214,229,0.08)',
          marginBottom: isMobile ? 12 : 20, overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${ARROW_COLOR}, #3fb950)`,
              boxShadow: `0 0 8px ${GLOW_COLOR}`,
            }}
          />
        </div>

        {/* Action Buttons — Compact On Mobile */}
        <div style={{
          display: 'flex', gap: isMobile ? 6 : 10,
          justifyContent: 'space-between', alignItems: 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDontShow?.(); }}
            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onDontShow?.(); }}
            style={{
              padding: isMobile ? '6px 8px' : '8px 12px', borderRadius: 10,
              border: 'none', background: 'transparent',
              color: 'rgba(200,214,229,0.3)',
              fontSize: isMobile ? 11 : 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'color 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            Don't Show Again
          </button>
          <div style={{ display: 'flex', gap: isMobile ? 6 : 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onSkip?.(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSkip?.(); }}
              style={{
                padding: isMobile ? '10px 16px' : '12px 24px', borderRadius: 12,
                border: '1px solid rgba(200,214,229,0.12)',
                background: 'rgba(200,214,229,0.04)',
                color: 'rgba(200,214,229,0.55)',
                fontSize: isMobile ? 13 : 15, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.2s',
              }}
            >
              Skip
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNext?.(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onNext?.(); }}
              style={{
                padding: isMobile ? '10px 20px' : '12px 32px', borderRadius: 12,
                border: 'none',
                background: `linear-gradient(135deg, ${ARROW_COLOR}, #3fb950)`,
                color: '#0c1828', fontSize: isMobile ? 13 : 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(110,231,239,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {currentIndex === totalSteps - 1 ? 'Got It' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * InteractiveTutorial — Main Export
 *
 * Props:
 *   steps: Array<{ targetId: string, title: string, desc: string, tip?: string }>
 *   storageKey: string — localStorage key for persistence
 *   visible: boolean — external control
 *   onDismiss: () => void — called when user finishes or skips
 *   onDontShowAgain: () => void — called when user opts out permanently
 */
export default function InteractiveTutorial({
  steps = [],
  storageKey = 'pnm_tutorial_seen',
  visible = false,
  onDismiss,
  onDontShowAgain,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: '50%', left: '50%', arrowDir: 'none' });
  const [arrowData, setArrowData] = useState(null);

  const tooltipRef = useRef(null);

  const step = steps[currentStep];

  // Recalculate target position on step change and on resize/scroll.
  // PERF: every setState below used to receive a fresh object literal, so the
  // 600ms poll re-rendered the overlay, glow border, SVG arrow and tooltip
  // twice a second on a completely static page. Only commit real changes.
  const recalculate = useCallback(() => {
    if (!step || !visible) return;

    const rect = getTargetRect(step.targetId);
    setTargetRect(prev => (sameRect(prev, rect) ? prev : rect));

    const tooltipH = 380;
    const tooltipW = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - 32);
    const pos = getTooltipPosition(rect, tooltipW, tooltipH);
    setTooltipPos(prev => (shallowEqual(prev, pos) ? prev : pos));

    if (rect) {
      const arrow = getArrowPath(rect, pos, pos.arrowDir);
      setArrowData(prev => (shallowEqual(prev, arrow) ? prev : arrow));
    } else {
      setArrowData(prev => (prev === null ? prev : null));
    }
  }, [step, visible]);

  useEffect(() => {
    if (!visible) return;

    // Delay initial calculation to let layout settle
    const initialTimer = setTimeout(recalculate, 100);

    // Coalesce resize/scroll bursts into one recalculation per animation frame.
    // The scroll listener is capture-phase (it has to see scrolling containers,
    // not just the window), so on a phone it can fire many times per frame and
    // each pass re-measures the target and re-renders the framer-motion overlay.
    let rafId = null;
    const handleResize = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => { rafId = null; recalculate(); });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    // PERF: a 600ms setInterval used to run for the whole tutorial. Prefer a
    // ResizeObserver on the document so a static page costs nothing, and keep a
    // slow safety poll for layouts that shift without resizing (lazy images,
    // late-mounting pods).
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      observer = new ResizeObserver(handleResize);
      observer.observe(document.body);
    }
    const interval = setInterval(recalculate, 2000);

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      if (rafId != null) window.cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      clearInterval(interval);
    };
  }, [visible, recalculate]);

  // Scroll target into view ONLY if it's truly off-screen (not inside a visible container)
  useEffect(() => {
    if (!visible || !step) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-tutorial-id="${step.targetId}"]`);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Only scroll if the element is genuinely outside the viewport
      const isOffScreen = rect.bottom < -50 || rect.top > vh + 50 ||
                          rect.right < -50 || rect.left > vw + 50;

      if (isOffScreen) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(recalculate, 500);
      } else {
        recalculate();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [visible, step, currentStep, recalculate]);

  const handleNext = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      onDismiss?.();
      setCurrentStep(0);
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [currentStep, steps.length, onDismiss]);

  const handleSkip = useCallback(() => {
    onDismiss?.();
    setCurrentStep(0);
  }, [onDismiss]);

  const handleDontShow = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch (e) { console.warn('[App] Handled exception:', e); }
    onDontShowAgain?.();
    onDismiss?.();
    setCurrentStep(0);
  }, [storageKey, onDismiss, onDontShowAgain]);

  // Reset step when visibility changes
  useEffect(() => {
    if (visible) setCurrentStep(0);
  }, [visible]);

  // ─── NARROW VIEWPORTS: bottom-sheet instead of a full-page block ───
  // This used to return null below 900px, which made the entire mobile
  // bottom-sheet layout in TooltipCard dead code and left phone and tablet
  // users with no onboarding at all. Render the sheet (which deliberately
  // leaves the page visible and interactive above it) and skip only the
  // full-viewport dark overlay that would trap taps.
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 900;
    return false;
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const check = () => setIsMobileView(window.innerWidth < 900);
      window.addEventListener('resize', check);
      return () => window.removeEventListener('resize', check);
    }
  }, []);

  // Escape dismisses the tutorial; without it keyboard users had no way out.
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); handleSkip(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, handleSkip]);

  // Move focus into the tooltip on each step so screen readers announce it and
  // Tab starts inside the dialog rather than in the page behind it.
  useEffect(() => {
    if (!visible || !step) return;
    const t = setTimeout(() => {
      try { tooltipRef.current?.focus?.({ preventScroll: true }); } catch (_) { /* ignore */ }
    }, 60);
    return () => clearTimeout(t);
  }, [visible, step, currentStep]);

  if (!visible || !step || steps.length === 0) return null;

  const clipPath = targetRect ? buildClipPath(targetRect) : null;

  return (
    <>
      {/* Global CSS For Animations */}
      <style>{`
        @keyframes tutorial-glow-pulse {
          0%, 100% { box-shadow: 0 0 20px ${GLOW_COLOR}, 0 0 40px rgba(110,231,239,0.2), inset 0 0 20px ${GLOW_COLOR}; }
          50% { box-shadow: 0 0 30px ${GLOW_COLOR}, 0 0 60px rgba(110,231,239,0.3), inset 0 0 30px ${GLOW_COLOR}; }
        }
        @keyframes tutorial-badge-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(110,231,239,0.1); }
          50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(110,231,239,0.2); }
        }
      `}</style>

      {/* Dark Overlay With Spotlight Cutout — desktop only. On narrow
          viewports the bottom-sheet tooltip is shown over a live page instead
          of a full-viewport click-trap. */}
      {!isMobileView && (
      <AnimatePresence mode="wait">
        <motion.div
          key={`overlay-${currentStep}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => { e.stopPropagation(); handleSkip(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleSkip(); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'default',
          }}
        >
          <svg
            width="100%"
            height="100%"
            style={{ position: 'absolute', inset: 0 }}
          >
            {clipPath ? (
              <motion.path
                d={clipPath}
                fill="rgba(0,0,0,0.82)"
                fillRule="evenodd"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            ) : (
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.82)" />
            )}
          </svg>
        </motion.div>
      </AnimatePresence>
      )}

      {/* Glow Border Around Target */}
      <AnimatePresence>
        {targetRect && (
          <GlowBorder key={`glow-${currentStep}`} rect={targetRect} />
        )}
      </AnimatePresence>

      {/* Arrow From Tooltip To Target */}
      <AnimatePresence>
        {arrowData && (
          <ArrowSVG key={`arrow-${currentStep}`} arrowData={arrowData} />
        )}
      </AnimatePresence>

      {/* Tooltip Card */}
      <AnimatePresence mode="wait">
        <TooltipCard
          key={`tooltip-${currentStep}`}
          cardRef={tooltipRef}
          step={step}
          currentIndex={currentStep}
          totalSteps={steps.length}
          position={tooltipPos}
          onNext={handleNext}
          onSkip={handleSkip}
          onDontShow={handleDontShow}
        />
      </AnimatePresence>
    </>
  );
}

// ─── PAGE-SPECIFIC TUTORIAL STEP DEFINITIONS ───
// All User-Facing Text Uses Title Case (First Letter Of Every Word Capitalized)

/**
 * Lobby Page Tutorial Steps (12 Pods)
 */
export const LOBBY_TUTORIAL_STEPS = [
  { targetId: 'pod-nearme', title: 'Poker Near Me', desc: 'Find Poker Rooms Within Your Search Radius — Sorted By Distance When GPS Is Active. Tap To Browse All 700+ Venues Across The US.', tip: 'Enable GPS For Automatic Distance Sorting And Nearby Venue Discovery.' },
  { targetId: 'pod-homegames', title: 'Home Games', desc: 'Search For Home Games Nearby Or List Your Own Private Game For Other Players To Find. Perfect For Building Your Local Poker Network.', tip: 'Home Games Are Verified By The Community For Safety And Fairness.' },
  { targetId: 'pod-livegames', title: 'Live Games', desc: 'See Which Games Are Likely Running — Table Activity Is Estimated From Each Room\'s Own History, Plus Live Games Reported By Players On The Ground.', tip: 'Counts Marked Estimated Are Modelled, Not Observed. Player Reports Are The Freshest Signal.' },
  { targetId: 'pod-tours', title: 'Poker Tours', desc: 'Browse Upcoming Stops On Major Tours Like WSOP, WPT, MSPT, RGPS, And More. Never Miss A Tournament Series Near You.', tip: 'Tour Badges Are Color-Coded By Organization For Quick Identification.' },
  { targetId: 'pod-mapview', title: 'Map View', desc: 'Interactive Map Showing All Poker Venues With Filters For Game Type, Stakes, And Operating Hours. Zoom To Discover Hidden Gems.', tip: 'Tap Any Marker To See Venue Details, Live Game Counts, And Directions.' },
  { targetId: 'pod-calendar', title: 'Calendar', desc: 'Monthly View Of Upcoming Tournaments And Series In Your Area. Plan Your Poker Schedule Weeks In Advance.', tip: 'Sync With Your Saved Venues To Highlight Events At Your Favorite Rooms.' },
  { targetId: 'pod-series', title: 'Poker Series', desc: 'Multi-Day Tournament Series With Complete Schedules, Buy-In Ranges, And Guaranteed Prize Pools. Track Event Start Dates And Structures.', tip: 'Filter By Timeframe (30/60/90 Days) To Plan Ahead.' },
  { targetId: 'pod-roadtrip', title: 'Trip Planner', desc: 'Plan A Poker Road Trip — Find Venues Along Your Route With Smart Stop Recommendations, Drive Times, And Trip Cost Estimates.', tip: 'Enter Your Start And End Cities To See All Poker Rooms Along The Way.' },
  { targetId: 'pod-daily', title: 'Daily Grind', desc: 'Today\'s Daily Tournaments — Filtered By Day Of Week, Buy-In Range, And Distance. Your Go-To For Finding Action Tonight.', tip: 'Swipe Between Days To Plan Your Week Of Tournament Play.' },
  { targetId: 'pod-favorites', title: 'Saved Venues', desc: 'Quick Access To Your Bookmarked Venues. Get Alerts When New Games Or Tournaments Appear At Venues You Follow.', tip: 'Tap The Heart Icon On Any Venue Card To Add It Here.' },
  { targetId: 'pod-social', title: 'Friends', desc: 'Connect With Poker Friends And See Who\'s Checked In Nearby. Build Your Poker Community And Coordinate Sessions.', tip: 'Link Your Smarter.Poker Friends List To See Who\'s Playing Near You.' },
  { targetId: 'pod-alerts', title: 'Tournament Alerts', desc: 'Get Notified When New Tournaments Are Posted At Venues You Follow. Never Miss Registration For A Big Event Again.', tip: 'Enable Push Notifications For Real-Time Alerts Even When The App Is Closed.' },
];

/**
 * Main PNM Page — Tab-Specific Tutorial Steps
 */
export const PNM_TAB_TUTORIALS = {
  venues: [
    { targetId: 'pnm-search', title: 'Search Venues', desc: 'Search By City Name, Venue Name, Or Zip Code To Find Poker Rooms. Use GPS For Automatic Nearby Discovery.', tip: 'Try Searching "Las Vegas" Or "Atlantic City" To See Results Instantly.' },
    { targetId: 'pnm-gps', title: 'GPS Location', desc: 'Tap To Enable GPS — Venues Will Automatically Sort By Distance So You See The Closest Rooms First.', tip: 'Works On Both Mobile And Desktop. Desktop Uses WiFi Positioning.' },
    { targetId: 'tab-venues', title: 'Venues Tab', desc: 'Browse All 700+ Poker Venues Across The United States. Each Card Shows Trust Scores, Game Types, And Distance From You.', tip: 'Tap Any Venue Card For Detailed Info, Reviews, And Live Game Status.' },
  ],
  events: [
    { targetId: 'tab-events', title: 'Events Hub', desc: 'Your Central Hub For All Poker Events — Tours, Series, Daily Tournaments, And The Seasonal Calendar.', tip: 'Use The Sub-Tabs Below To Switch Between Event Types.' },
    { targetId: 'subtab-tours', title: 'Tours', desc: 'Major Poker Tour Stops Including WSOP, WPT, MSPT, And More. See Upcoming Stops, Dates, And Host Venues.', tip: 'Tour Badges Are Color-Coded: Gold For WSOP, Red For WPT, Blue For MSPT.' },
    { targetId: 'subtab-daily', title: 'Daily Tournaments', desc: 'Filter Daily Tournaments By Day Of Week, Buy-In Range, And Game Type. Perfect For Finding Tonight\'s Action.', tip: 'Select Different Days To Plan Your Entire Tournament Week.' },
  ],
  live: [
    { targetId: 'tab-live', title: 'Live Games', desc: 'Table Activity Across The Country, Modelled From Each Room\'s Historical Patterns And Combined With Live Games Reported By Players.', tip: 'Estimated Counts Are Labelled As Such. Report A Game You Are Sitting In To Help Other Players.' },
  ],
  map: [
    { targetId: 'tab-map', title: 'Map View', desc: 'Interactive Map Showing All Poker Venues. Zoom, Pan, And Filter To Discover Rooms Near Any Location.', tip: 'Enable GPS To Center The Map On Your Current Location.' },
  ],
  saved: [
    { targetId: 'tab-saved', title: 'Saved Venues', desc: 'Your Bookmarked Poker Rooms — Quick Access To The Venues You Visit Most. Tap The Heart On Any Venue To Save It Here.', tip: 'Saved Venues Sync Across Devices When You\'re Logged In.' },
  ],
  more: [
    { targetId: 'tab-more', title: 'More Tools', desc: 'Additional Features Including Road Trip Planner, Social Connections, Tournament Alerts, And Venue Comparison Tools.', tip: 'The Road Trip Planner Is Perfect For Finding Poker Rooms Along Your Travel Route.' },
  ],
};
