import { useEffect, useRef, useState } from 'react';
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
  const [shipping, setShipping] = useState({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

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

  const shippingRequired = purchase.requiresShipping === true;
  const shippingComplete =
    !shippingRequired ||
    [
      shipping.name,
      shipping.line1,
      shipping.city,
      shipping.state,
      shipping.postalCode,
      shipping.country,
    ].every((value) => String(value || '').trim());
  const updateShipping = (field) => (event) => {
    setShipping((current) => ({ ...current, [field]: event.target.value }));
  };

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

        {shippingRequired && (
          <fieldset className={styles.shipping}>
            <legend>Shipping Destination</legend>
            <label className={styles.full}>
              <span>Full Name</span>
              <input
                autoComplete="name"
                value={shipping.name}
                onChange={updateShipping('name')}
                required
              />
            </label>
            <label className={styles.full}>
              <span>Address</span>
              <input
                autoComplete="address-line1"
                value={shipping.line1}
                onChange={updateShipping('line1')}
                required
              />
            </label>
            <label className={styles.full}>
              <span>Apartment / Suite (Optional)</span>
              <input
                autoComplete="address-line2"
                value={shipping.line2}
                onChange={updateShipping('line2')}
              />
            </label>
            <label>
              <span>City</span>
              <input
                autoComplete="address-level2"
                value={shipping.city}
                onChange={updateShipping('city')}
                required
              />
            </label>
            <label>
              <span>State / Province</span>
              <input
                autoComplete="address-level1"
                value={shipping.state}
                onChange={updateShipping('state')}
                required
              />
            </label>
            <label>
              <span>Postal Code</span>
              <input
                autoComplete="postal-code"
                value={shipping.postalCode}
                onChange={updateShipping('postalCode')}
                required
              />
            </label>
            <label>
              <span>Country</span>
              <select
                autoComplete="country"
                value={shipping.country}
                onChange={updateShipping('country')}
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </label>
          </fieldset>
        )}

        <p className={styles.notice}>
          {shippingRequired
            ? 'Confirming Deducts The Diamonds And Sends This Order To Secure Fulfillment.'
            : 'Confirming Places The Order And Deducts The Diamonds Immediately.'}
        </p>

        <footer className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            Keep Shopping
          </button>
          <button
            type="button"
            className={styles.confirm}
            onClick={() => onConfirm(shippingRequired ? shipping : null)}
            disabled={busy || !shippingComplete}
            aria-busy={busy}
          >
            {busy
              ? 'Placing Order...'
              : shippingComplete
                ? `Spend ${fmt(purchase.cost)} Diamonds`
                : 'Complete Shipping Details'}
          </button>
        </footer>
      </section>
    </div>
  );
}
