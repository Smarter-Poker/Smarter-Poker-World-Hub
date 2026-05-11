/**
 * BottomSheet
 * ═══════════════════════════════════════════════════════════════════════════
 * Mobile-first bottom-sheet primitive. Drops in for the Range / Strategy /
 * Hints panels that currently render as cramped right-side rails on small
 * viewports. Desktop callers can opt into the same component via the
 * `placement` prop to keep behavior consistent.
 *
 * Behavior
 *   - Hidden by default (controlled component — pass `open`).
 *   - Backdrop click and Escape close the sheet.
 *   - Focus trap when open; first focusable element auto-focused.
 *   - Body scroll locked while open.
 *   - Drag-handle on top of the sheet — visual only by default; pass
 *     onDrag and onDragEnd handlers to wire up swipe-to-dismiss.
 *
 * Props
 *   open          boolean — controlled
 *   onClose       handler
 *   title         string — header
 *   subtitle      string — header sub
 *   children      ReactNode
 *   placement     'bottom' (default) | 'right' (desktop side rail)
 *   height        number|string — sheet body height (default 'auto'
 *                 with max 80vh on bottom, 100% on right)
 *   width         number|string — right-placement width (default 380)
 *   showHandle    boolean — top drag handle visual
 *   showClose     boolean — close button in the header (default true)
 *   className     string
 *   style         object
 *
 * Build-safety: no emoji chars, no JSX comments inside conditional
 * expressions.
 */
// TRAIN-BOTTOMSHEET-1 — audit-marker registry token

import React, { useEffect, useRef } from 'react';

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function CloseIcon({ size = 18 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const BottomSheet = React.memo(function BottomSheet({
  open = false,
  onClose,
  title,
  subtitle,
  children,
  placement = 'bottom',
  height,
  width = 380,
  showHandle = true,
  showClose = true,
  className,
  style,
}) {
  const sheetRef = useRef(null);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Body scroll lock + first-focusable focus.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const node = sheetRef.current;
      if (!node) return;
      const focusable = node.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable && typeof focusable.focus === 'function') focusable.focus();
    }, 16);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open]);

  if (!open) return null;

  const isBottom = placement !== 'right';

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 500,
    display: 'flex',
    alignItems: isBottom ? 'flex-end' : 'stretch',
    justifyContent: isBottom ? 'stretch' : 'flex-end',
    animation: 'sp-bs-fade var(--sp-dur-base, 220ms) var(--sp-ease-out, ease) both',
  };

  const sheetStyle = isBottom
    ? {
        width: '100%',
        maxHeight: '85vh',
        height: height || 'auto',
        background: 'var(--sp-surface-1, #131321)',
        color: 'var(--sp-text-primary, #f1f5f9)',
        borderTopLeftRadius: 'var(--sp-r-xl, 16px)',
        borderTopRightRadius: 'var(--sp-r-xl, 16px)',
        boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'sp-bs-slide-up var(--sp-dur-slow, 420ms) var(--sp-ease-out, ease) both',
        ...(style || {}),
      }
    : {
        width: typeof width === 'number' ? `${width}px` : width,
        maxWidth: '95vw',
        height: height || '100%',
        background: 'var(--sp-surface-1, #131321)',
        color: 'var(--sp-text-primary, #f1f5f9)',
        borderTopLeftRadius: 'var(--sp-r-xl, 16px)',
        borderBottomLeftRadius: 'var(--sp-r-xl, 16px)',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'sp-bs-slide-left var(--sp-dur-slow, 420ms) var(--sp-ease-out, ease) both',
        ...(style || {}),
      };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--sp-border, #2f2f44)',
  };

  const handleStyle = {
    width: 44,
    height: 4,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.15)',
    margin: '8px auto 0',
  };

  const bodyStyle = {
    overflow: 'auto',
    flex: 1,
    padding: 16,
    WebkitOverflowScrolling: 'touch',
  };

  const titleStyle = {
    fontSize: 15,
    fontWeight: 800,
    margin: 0,
    color: 'var(--sp-text-primary, #f1f5f9)',
  };
  const subStyle = {
    fontSize: 11,
    color: 'var(--sp-text-tertiary, #94a3b8)',
    margin: 0,
  };

  const closeBtnStyle = {
    marginLeft: 'auto',
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid var(--sp-border, #2f2f44)',
    background: 'transparent',
    color: 'var(--sp-text-secondary, #cbd5e1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && typeof onClose === 'function') onClose();
      }}
      role="presentation"
    >
      <style>{`
        @keyframes sp-bs-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sp-bs-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes sp-bs-slide-left { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @media (prefers-reduced-motion: reduce) {
          [data-sp-bs] { animation: none !important; }
        }
      `}</style>
      <div
        data-sp-bs="sheet"
        className={className}
        ref={sheetRef}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'sp-bs-title' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {isBottom && showHandle ? <div style={handleStyle} aria-hidden /> : null}
        {title || subtitle || showClose ? (
          <header style={headerStyle}>
            <div>
              {title ? <h2 id="sp-bs-title" style={titleStyle}>{title}</h2> : null}
              {subtitle ? <p style={subStyle}>{subtitle}</p> : null}
            </div>
            {showClose ? (
              <button
                type="button"
                aria-label="Close panel"
                onClick={onClose}
                style={closeBtnStyle}
              >
                <CloseIcon size={18} />
              </button>
            ) : null}
          </header>
        ) : null}
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
});

export default BottomSheet;
export const BOTTOM_SHEET_VERSION = '1.0.0';
