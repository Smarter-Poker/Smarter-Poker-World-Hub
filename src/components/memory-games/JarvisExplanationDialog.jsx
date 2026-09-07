/**
 * JarvisExplanationDialog: the "why was this hand wrong" panel after a graded
 * range.
 *
 * Mobile phase 2: `useModalHistory` so the phone back gesture closes it
 * instead of leaving the page, `useScrimDismiss` so a drag that merely ENDS
 * on the backdrop does not close it, a bottom sheet with a drag handle at
 * or below 600px (JarvisExplanationDialog.module.css), the 44x44 close in
 * the header, and no text under 12px. The focus trap, Escape and the scroll
 * lock are unchanged.
 */
import { useEffect, useRef } from 'react';
import { BrainCircuit, X } from 'lucide-react';

import { acquireScrollLock } from '../../lib/scrollLock';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import styles from './JarvisExplanationDialog.module.css';

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const ACTION_COLORS = {
  raise: '#39e9a5',
  call: '#f4c44e',
  fold: '#ef6464',
};

export default function JarvisExplanationDialog({ modal, onClose }) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const open = Boolean(modal?.show);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useModalHistory(open, onClose);
  const scrim = useScrimDismiss(onClose);

  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = acquireScrollLock('JarvisExplanationDialog');
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const action = String(modal.correctAction || 'analysis').replaceAll('_', ' ');
  const actionColor = ACTION_COLORS[modal.correctAction] || '#6bd2ff';

  return (
    <div className={styles.backdrop} {...scrim}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jarvis-dialog-title"
        aria-describedby="jarvis-dialog-description"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.topRail} aria-hidden="true"><span /><span /><span /></div>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark} aria-hidden="true"><BrainCircuit size={22} /></span>
            <div><small>LOCAL PRACTICE // RANGE KEY</small><h2 id="jarvis-dialog-title">Range-Key Notice</h2></div>
          </div>
          <button type="button" className={`${styles.close} sp-icon-btn`} onClick={onClose} aria-label="Close local range-key notice">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.scroll}>
          {modal.loading ? (
            <div className={styles.loading} role="status" aria-live="polite">
              <span className={styles.scanner} aria-hidden="true" />
              <strong>LOADING LOCAL RANGE-KEY NOTICE</strong>
              <p id="jarvis-dialog-description">Preparing The Locally Stored Practice Comparison For This Hand.</p>
            </div>
          ) : modal.panelImageUrl ? (
            <div className={styles.imageFrame}>
              <img src={modal.panelImageUrl} alt={`Local range-key notice for ${modal.hand || 'this hand'}`} />
              <p id="jarvis-dialog-description" className={styles.imageCaption}>
                {modal.hand || 'Selected hand'}
                {' // Local Key: '}
                {action}
              </p>
            </div>
          ) : (
            <div className={styles.body}>
              <div className={styles.readout}>
                <div><small>HAND SIGNAL</small><strong>{modal.hand || '-'}</strong></div>
                <span style={{ '--jarvis-action': actionColor }}>{action.toUpperCase()}</span>
              </div>
              <dl className={styles.compare}>
                <div><dt>Your Answer</dt><dd>{String(modal.userAction || 'fold').replaceAll('_', ' ')}</dd></div>
                <div><dt>Local Range Key</dt><dd>{action}</dd></div>
              </dl>
              <div className={styles.explanation}>
                <small>AUTHORITY NOTICE</small>
                <p id="jarvis-dialog-description">{modal.explanation || 'No Local Practice Note Is Available For This Hand. Close This Panel And Choose Another Hand.'}</p>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.done} onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
