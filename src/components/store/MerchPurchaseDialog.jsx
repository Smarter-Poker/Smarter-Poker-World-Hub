import { useEffect, useRef } from 'react';
import { Gem, ShieldCheck, X } from 'lucide-react';

import { acquireScrollLock } from '../../lib/scrollLock';
import styles from './MerchPurchaseDialog.module.css';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fmt = (value) => Number(value || 0).toLocaleString('en-US');

export default function MerchPurchaseDialog({ purchase, balance, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!purchase) return undefined;

    const releaseScrollLock = acquireScrollLock('MerchPurchaseDialog');
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
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
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
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
  }, [purchase]);

  if (!purchase) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merch-purchase-dialog-title"
        aria-describedby="merch-purchase-dialog-description"
        tabIndex={-1}
      >
        <div className={styles.rail} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <header className={styles.header}>
          <div className={styles.seal} aria-hidden="true">
            <ShieldCheck size={28} strokeWidth={1.6} />
          </div>
          <div>
            <span>Diamond Authorization</span>
            <h2 id="merch-purchase-dialog-title">Confirm Merchandise Order</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel Merchandise Purchase"
          >
            <X size={19} />
          </button>
        </header>

        <p id="merch-purchase-dialog-description" className={styles.description}>
          Review The Order Before Diamonds Leave Your Balance.
        </p>

        <dl className={styles.ledger}>
          <div>
            <dt>Item</dt>
            <dd>{purchase.product.name}</dd>
          </div>
          {purchase.variant && (
            <div>
              <dt>Option</dt>
              <dd>{purchase.variant.label}</dd>
            </div>
          )}
          <div>
            <dt>Quantity</dt>
            <dd>{fmt(purchase.quantity)}</dd>
          </div>
          <div>
            <dt>Available Balance</dt>
            <dd>{fmt(balance)} Diamonds</dd>
          </div>
        </dl>

        <div className={styles.total}>
          <span>Order Total</span>
          <strong>
            <Gem size={21} aria-hidden="true" />
            {fmt(purchase.cost)} Diamonds
          </strong>
        </div>

        <p className={styles.notice}>
          Confirming Places The Order And Deducts The Diamonds Immediately.
        </p>

        <footer className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            Keep Shopping
          </button>
          <button
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Placing Order...' : `Spend ${fmt(purchase.cost)} Diamonds`}
          </button>
        </footer>
      </section>
    </div>
  );
}
