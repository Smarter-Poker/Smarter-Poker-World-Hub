import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, Clock3, ReceiptText, X } from 'lucide-react';

import styles from './CheckoutStatusPanel.module.css';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';

const COPY = {
  verifying: {
    eyebrow: 'Transaction Seal',
    title: 'Verifying Your Purchase',
    body: 'Your Payment Return Is Secure. We Are Confirming The Session Before Showing A Receipt.',
    Icon: Clock3,
  },
  pending: {
    eyebrow: 'Payment Received',
    title: 'Fulfillment Is Processing',
    body: 'Stripe Confirmed The Checkout. Your Balance, Membership, Or Order Will Update As Soon As The Signed Webhook Finishes.',
    Icon: Clock3,
  },
  complete: {
    eyebrow: 'Verified Transaction',
    title: 'Purchase Complete',
    body: 'The Payment And Store Record Match. Your Purchase Is Now Recorded On Your Smarter.Poker Account.',
    Icon: CheckCircle,
  },
  canceled: {
    eyebrow: 'Checkout Closed',
    title: 'No Payment Was Made',
    body: 'The Checkout Was Canceled Before Payment. Your Balance And Membership Were Not Changed.',
    Icon: X,
  },
  failed: {
    eyebrow: 'Verification Required',
    title: 'We Could Not Verify This Return',
    body: 'No Purchase Is Being Claimed From The URL Alone. Refresh Your Wallet Or Order History, Or Contact Support If Stripe Shows A Charge.',
    Icon: AlertTriangle,
  },
};

function amountLabel(receipt) {
  if (!receipt) return null;
  if (receipt.amountTotal != null) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      Number(receipt.amountTotal) / 100
    );
  }
  return null;
}
export default function CheckoutStatusPanel({ state, onDismiss }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!state?.status) return undefined;
    const frame = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: false }));
    return () => cancelAnimationFrame(frame);
  }, [state?.status]);

  if (!state?.status) return null;

  const config = COPY[state.status] || COPY.failed;
  const Icon = config.Icon;
  const receipt = state.receipt || null;
  const reference = receipt?.sessionId ? receipt.sessionId.slice(-12).toUpperCase() : null;
  const amount = amountLabel(receipt);

  return (
    <section
      ref={panelRef}
      className={`${styles.panel} ${styles[state.status] || styles.failed}`}
      role={state.status === 'failed' ? 'alert' : 'status'}
      aria-live={state.status === 'failed' ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-checkout-status={state.status}
      tabIndex={-1}
    >
      <div className={styles.seal} aria-hidden="true">
        <Icon size={28} strokeWidth={1.7} />
      </div>
      <div className={styles.copy}>
        <span>{config.eyebrow}</span>
        <h2>{config.title}</h2>
        <p>{marketplaceCopy(state.message || config.body)}</p>
        {(reference || amount || receipt?.type) && (
          <dl className={styles.receipt}>
            {receipt?.type && (
              <div>
                <dt>Purchase</dt>
                <dd>{marketplaceCopy(String(receipt.type).replace(/-/g, ' '))}</dd>
              </div>
            )}
            {amount && (
              <div>
                <dt>Total</dt>
                <dd>{amount}</dd>
              </div>
            )}
            {reference && (
              <div>
                <dt>Reference</dt>
                <dd>{reference}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {state.status !== 'verifying' && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss Checkout Status">
          <X size={19} />
        </button>
      )}
      <ReceiptText className={styles.watermark} size={92} aria-hidden="true" />
    </section>
  );
}
