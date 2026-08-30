import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Gem, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { ensureAuthReady, getAccessToken } from '../../../src/lib/authUtils';
import supabase from '../../../src/lib/supabase';
import styles from './fulfillment.module.css';

function itemLabel(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item) => `${item.name || item.id} × ${item.quantity || 1}`).join(', ');
}

export default function MerchandiseFulfillmentConsole() {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({ kind: 'loading', message: 'Loading protected fulfillment queue…' });
  const [busyId, setBusyId] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const requestRef = useRef(0);

  const loadOrders = useCallback(async ({ append = false, cursor = null } = {}) => {
    const requestId = ++requestRef.current;
    setState({ kind: 'loading', message: 'Refreshing protected fulfillment queue…' });
    const user = await ensureAuthReady(supabase);
    const token = getAccessToken();
    if (requestId !== requestRef.current) return;
    if (!user?.id || !token) {
      setOrders([]);
      setState({ kind: 'auth', message: 'Sign in with a store-operator account.' });
      return;
    }
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/store/fulfillment-operations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (requestId !== requestRef.current) return;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Queue unavailable');
      const received = body.data?.orders || [];
      setOrders((current) => append ? [...current, ...received] : received);
      setNextCursor(body.data?.nextCursor || null);
      setState({
        kind: 'ready',
        message: received.length
          ? `${append ? orders.length + received.length : received.length} orders loaded for fulfillment attention.`
          : 'No paid orders are waiting for fulfillment.',
      });
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setOrders([]);
      setState({ kind: 'error', message: error?.message || 'Queue unavailable' });
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    return () => { requestRef.current += 1; };
  }, [loadOrders]);

  const transition = async (order, action) => {
    if (busyId) return;
    const token = getAccessToken();
    if (!token) return setState({ kind: 'auth', message: 'Your operator session expired.' });
    const payload = {
      orderId: order.id,
      expectedVersion: Number(order.fulfillment_version) || 0,
      action,
    };
    if (action === 'mark_shipped') {
      const trackingNumber = window.prompt('Tracking number');
      if (!trackingNumber) return;
      const carrier = window.prompt('Carrier (for example USPS, UPS, FedEx)') || '';
      const trackingUrl = window.prompt('HTTPS tracking URL (optional)') || '';
      Object.assign(payload, { trackingNumber, carrier, ...(trackingUrl ? { trackingUrl } : {}) });
    }
    if (action === 'refund' && !window.confirm(
      `Refund ${Number(order.diamonds_spent || 0).toLocaleString()} Diamonds and return unsent local stock?`
    )) return;

    setBusyId(order.id);
    try {
      const response = await fetch('/api/store/fulfillment-operations', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Operation failed');
      await loadOrders();
    } catch (error) {
      setState({ kind: 'error', message: error?.message || 'Operation failed' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <SEOHead
        title="Merchandise Fulfillment Console"
        description="Protected Smarter.Poker merchandise fulfillment operations."
        canonical="/hub/merch-store/fulfillment"
        noindex
      />
      <UniversalHeader pageDepth={2} />
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.eyebrow}><ShieldCheck size={16} /> Protected Store Operations</div>
          <h1>Fulfillment Command Vault</h1>
          <p>Paid orders, manual handoff, tracking, delivery, and atomic Diamond refunds.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => void loadOrders()} disabled={state.kind === 'loading'}>
              <RefreshCw size={16} /> Refresh Queue
            </button>
            <Link href="/hub/merch-store">Return To Merch Store</Link>
          </div>
        </header>

        <div className={styles.status} role="status" aria-live="polite">{state.message}</div>
        <section className={styles.grid} aria-label="Merchandise fulfillment orders">
          {orders.map((order) => {
            const address = order.shipping_address || {};
            const busy = busyId === order.id;
            const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
            const isManual = metadata.fulfillment_mode === 'manual';
            const isQuarantined = metadata.needs_review === true && !isManual;
            return (
              <article key={order.id} className={styles.order}>
                <div className={styles.orderTop}>
                  <span>{String(order.status || 'paid').toUpperCase()}</span>
                  <code>{order.id}</code>
                </div>
                <h2>{itemLabel(order) || 'Merchandise Order'}</h2>
                <p className={styles.money}>
                  {order.payment_method === 'diamonds'
                    ? <><Gem size={15} /> {Number(order.diamonds_spent || 0).toLocaleString()} Diamonds</>
                    : `$${Number(order.total_usd || 0).toFixed(2)}`}
                </p>
                <address>
                  {address.name || 'Recipient'}<br />
                  {address.address1 || address.line1 || 'Address unavailable'}{address.address2 ? `, ${address.address2}` : ''}<br />
                  {[address.city, address.state_code || address.state, address.zip || address.postal_code].filter(Boolean).join(', ')}<br />
                  {address.country_code || address.country || ''}
                </address>
                {order.tracking_number && (
                  <p><Truck size={15} /> {order.carrier || 'Carrier'} · {order.tracking_number}</p>
                )}
                {isQuarantined && (
                  <div className={styles.quarantine} role="status">
                    <strong>Automatic fulfillment quarantined</strong>
                    <span>{metadata.reason || 'Provider state requires reconciliation.'}</span>
                    {metadata.printful_order_id && <code>Provider order {metadata.printful_order_id}</code>}
                    <small>Manual shipping and refunds are locked until the provider order is reconciled or cancelled.</small>
                  </div>
                )}
                {isManual ? (
                  <div className={styles.actions}>
                  {order.status === 'paid' && (
                    <button type="button" disabled={busy} onClick={() => void transition(order, 'mark_processing')}>
                      <PackageCheck size={15} /> Start Processing
                    </button>
                  )}
                  {['paid', 'processing'].includes(order.status) && (
                    <button type="button" disabled={busy} onClick={() => void transition(order, 'mark_shipped')}>
                      <Truck size={15} /> Mark Shipped
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button type="button" disabled={busy} onClick={() => void transition(order, 'mark_delivered')}>
                      <CheckCircle2 size={15} /> Mark Delivered
                    </button>
                  )}
                  {order.payment_method === 'diamonds' && !['shipped', 'delivered'].includes(order.status) && (
                    <button className={styles.danger} type="button" disabled={busy} onClick={() => void transition(order, 'refund')}>
                      Refund Diamonds
                    </button>
                  )}
                  </div>
                ) : !isQuarantined ? (
                  <p className={styles.providerManaged}>This order is managed by its connected fulfillment provider.</p>
                ) : null}
              </article>
            );
          })}
        </section>
        {nextCursor && (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={state.kind === 'loading'}
              onClick={() => void loadOrders({ append: true, cursor: nextCursor })}
            >
              Load Older Exceptions
            </button>
          </div>
        )}
      </main>
    </>
  );
}
