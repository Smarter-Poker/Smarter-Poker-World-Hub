import { useEffect, useRef } from 'react';
import { BrainCircuit, X } from 'lucide-react';

import { acquireScrollLock } from '../../lib/scrollLock';
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
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jarvis-dialog-title"
        aria-describedby="jarvis-dialog-description"
        tabIndex={-1}
      >
        <div className={styles.topRail} aria-hidden="true"><span /><span /><span /></div>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark} aria-hidden="true"><BrainCircuit size={22} /></span>
            <div><small>JARVIS // RANGE INTELLIGENCE</small><h2 id="jarvis-dialog-title">Strategic analysis</h2></div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close strategic analysis">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        {modal.loading ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className={styles.scanner} aria-hidden="true" />
            <strong>ANALYZING RANGE SIGNAL</strong>
            <p id="jarvis-dialog-description">Generating strategic intelligence for this hand.</p>
          </div>
        ) : modal.panelImageUrl ? (
          <div className={styles.imageFrame}>
            <img src={modal.panelImageUrl} alt={`Jarvis strategic analysis for ${modal.hand || 'this hand'}`} />
            <p id="jarvis-dialog-description" className={styles.imageCaption}>{modal.hand || 'Selected hand'} // optimal action: {action}</p>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.readout}>
              <div><small>HAND SIGNAL</small><strong>{modal.hand || '—'}</strong></div>
              <span style={{ '--jarvis-action': actionColor }}>{action.toUpperCase()}</span>
            </div>
            <dl className={styles.compare}>
              <div><dt>Your answer</dt><dd>{String(modal.userAction || 'fold').replaceAll('_', ' ')}</dd></div>
              <div><dt>Optimal line</dt><dd>{action}</dd></div>
            </dl>
            <div className={styles.explanation}>
              <small>GTO EXPLANATION</small>
              <p id="jarvis-dialog-description">{modal.explanation || 'No explanation was returned. Close this panel and request the analysis again.'}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
