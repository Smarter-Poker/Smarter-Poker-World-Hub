/**
 * Modal - the one dialog shell for the /horses console.
 *
 * Ported from the implementation in pages/horses/hg-moderation.js, which was
 * the only correct one in the surface: role/aria-modal/accessible name, focus
 * moved in on open and restored to the opener on close, Tab cycled inside the
 * dialog, Escape to close. The three dialogs in pages/horses/index.js each had
 * some subset of that - the Mint confirmation, the screen that creates money,
 * had none of it - so they all use this now.
 *
 * Props
 *   title        Required. Rendered as the dialog's accessible name.
 *   onClose      Called by Escape, the close button and the backdrop.
 *   sticky       Backdrop clicks do not close (use while a write is running).
 *   blockEscape  Escape does not close (same reason).
 *   wide         Wider box for form-heavy dialogs.
 *   hideClose    Omit the header close button (a confirm dialog owns its own).
 *
 * It deliberately does NOT portal: the palette in horses.module.css is declared
 * on .dashboard and inherited, so a dialog rendered outside that subtree would
 * lose every colour token.
 */
import React, { useCallback, useEffect, useId, useRef } from 'react';
import styles from './shared.module.css';

export const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  onClose,
  children,
  sticky = false,
  blockEscape = false,
  wide = false,
  hideClose = false,
}) {
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  const blockRef = useRef(blockEscape);
  const titleId = useId();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { blockRef.current = blockEscape; }, [blockEscape]);

  // Focus management and the Tab cycle. Mount-only on purpose: re-running it
  // when a prop changes would yank focus back to the first control mid-typing.
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const box = boxRef.current;
    const first = box ? box.querySelector(FOCUSABLE) : null;
    if (first) first.focus();
    else if (box) box.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (blockRef.current) { e.preventDefault(); return; }
        e.stopPropagation();
        if (closeRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const items = Array.from(boxRef.current.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  // Body scroll lock. The dialog scrolls; the page behind it must not, or a
  // touch drag on mobile scrolls the console out from under the dialog.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const onBackdrop = useCallback((e) => {
    if (sticky) return;
    if (e.target === e.currentTarget && onClose) onClose();
  }, [sticky, onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onBackdrop}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${styles.dialog} ${wide ? styles.dialogWide : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
          {!hideClose && (
            <button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Close">
              Close
            </button>
          )}
        </div>
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </div>
  );
}
