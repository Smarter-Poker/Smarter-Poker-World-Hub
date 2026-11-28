// Undo toasts and the live session bar, stacked just above the fixed footer.
// A spacer of the dock's measured height sits in the page flow, so the end of
// the page is never hidden behind it. The footer itself is never touched.

import { useEffect, useRef, useState } from 'react';
import { UNDO_WINDOW_MS } from '../../lib/bankroll/pendingDeletes.mjs';
import { usePendingDeletes } from './usePendingDeletes';
import styles from './BankrollDock.module.css';

export function UndoDeleteToasts({ userId }) {
  const { queue, pending } = usePendingDeletes(userId);
  const [now, setNow] = useState(() => Date.now());
  const active = pending.length > 0;
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  if (!queue || !active) return null;
  return pending.map((record) => {
    const left = Math.max(0, record.dueAt - now);
    return (
      <div key={record.key} className={styles.toast} role="status" aria-live="polite" data-testid="bankroll-undo-toast">
        <span className={styles.toastText}>{record.label}</span>
        <span className={styles.toastTime} aria-hidden="true">{Math.ceil(left / 1000)}s</span>
        <button type="button" className="sd-button sd-primary" onClick={() => queue.undo(record.key)}
          aria-label={`Undo: ${record.label}`}>
          Undo
        </button>
        <span className={styles.progress} style={{ width: `${(left / UNDO_WINDOW_MS) * 100}%` }} aria-hidden="true" />
      </div>
    );
  });
}

export default function BankrollDock({ children }) {
  const dock = useRef(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const node = dock.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    setHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden="true" style={{ height: height ? height + 8 : 0 }} data-testid="bankroll-dock-spacer" />
      <div ref={dock} className={styles.dock} data-testid="bankroll-dock">{children}</div>
    </>
  );
}
