import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { ensureAuthReady, getAccessToken } from '../../../src/lib/authUtils';
import { acquireScrollLock } from '../../../src/lib/scrollLock';
import supabase from '../../../src/lib/supabase';
import styles from './fulfillment.module.css';
import {
  marketplaceCarrierName,
  marketplaceCopy,
  marketplaceFulfillmentStatus,
} from '../../../src/lib/store/marketplaceCopy';
import { boundedCommerceFetch } from '../../../src/lib/store/boundedCommerceFetch';

const FULFILLMENT_AUTH_TIMEOUT_MS = 20000;

function itemLabel(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items
    .map((item) => `${marketplaceCopy(item.name || 'Marketplace Item')} × ${item.quantity || 1}`)
    .join(', ');
}

export default function MerchandiseFulfillmentConsole() {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState({
    kind: 'loading',
    message: 'Loading protected fulfillment queue…',
  });
  const [busyId, setBusyId] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [operation, setOperation] = useState(null);
  const [authOwnerId, setAuthOwnerId] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [loadedOwnerId, setLoadedOwnerId] = useState(null);
  const requestRef = useRef(0);
  const ordersRef = useRef([]);
  const busyIdRef = useRef(null);
  const operationDialogRef = useRef(null);
  const operationTitleRef = useRef(null);
  const operationTriggerRef = useRef(null);
  const loadAbortRef = useRef(null);
  const transitionAbortRef = useRef(null);
  const transitionInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const authOwnerRef = useRef(null);
  const authObservedRef = useRef(false);
  const loadedOwnerRef = useRef(null);

  const loadOrders = useCallback(
    async ({ append = false, cursor = null, expectedAccountId = authOwnerRef.current } = {}) => {
      const requestId = ++requestRef.current;
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      let authTimer = null;
      if (!expectedAccountId) {
        ordersRef.current = [];
        loadedOwnerRef.current = null;
        setOrders([]);
        setLoadedOwnerId(null);
        setNextCursor(null);
        setState({ kind: 'auth', message: 'Sign In With A Store-Operator Account.' });
        loadAbortRef.current = null;
        controller.abort();
        return;
      }
      setState({ kind: 'loading', message: 'Refreshing protected fulfillment queue…' });
      try {
        const authDeadline = new Promise((_resolve, reject) => {
          authTimer = setTimeout(() => {
            const error = new Error(
              'Operator Session Check Timed Out. Retry The Secure Queue Read.'
            );
            error.name = 'CommerceTimeoutError';
            reject(error);
          }, FULFILLMENT_AUTH_TIMEOUT_MS);
        });
        const user = await Promise.race([ensureAuthReady(supabase), authDeadline]);
        if (authTimer) clearTimeout(authTimer);
        authTimer = null;
        const token = getAccessToken();
        if (requestId !== requestRef.current || authOwnerRef.current !== expectedAccountId) return;
        if (!user?.id || user.id !== expectedAccountId || !token) {
          ordersRef.current = [];
          loadedOwnerRef.current = null;
          setOrders([]);
          setLoadedOwnerId(null);
          setState({ kind: 'auth', message: 'Sign In With A Store-Operator Account.' });
          return;
        }
        const params = new URLSearchParams({ limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const response = await boundedCommerceFetch(`/api/store/fulfillment-operations?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (requestId !== requestRef.current || authOwnerRef.current !== expectedAccountId) return;
        if (!response.ok || !body?.success) throw new Error(body?.error || 'Queue unavailable');
        const received = body.data?.orders || [];
        const merged = append ? [...ordersRef.current, ...received] : received;
        ordersRef.current = merged;
        loadedOwnerRef.current = expectedAccountId;
        setOrders(merged);
        setLoadedOwnerId(expectedAccountId);
        setNextCursor(body.data?.nextCursor || null);
        setState({
          kind: 'ready',
          message: received.length
            ? `${merged.length} orders loaded for fulfillment attention.`
            : append && merged.length
              ? `${merged.length} orders loaded. No older exceptions remain.`
              : 'No paid orders are waiting for fulfillment.',
        });
      } catch (error) {
        if (requestId !== requestRef.current || authOwnerRef.current !== expectedAccountId) return;
        if (error?.name === 'AbortError') return;
        if (!append) {
          ordersRef.current = [];
          setOrders([]);
        }
        setState({ kind: 'error', message: error?.message || 'Queue unavailable' });
      } finally {
        if (authTimer) clearTimeout(authTimer);
        if (loadAbortRef.current === controller) loadAbortRef.current = null;
        controller.abort();
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      transitionAbortRef.current?.abort();
      transitionAbortRef.current = null;
      transitionInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const applyOwner = (nextOwnerId) => {
      if (!active) return;
      const changed = !authObservedRef.current || authOwnerRef.current !== nextOwnerId;
      authObservedRef.current = true;
      if (!changed) return;
      authOwnerRef.current = nextOwnerId;
      requestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      transitionAbortRef.current?.abort();
      transitionAbortRef.current = null;
      transitionInFlightRef.current = false;
      loadedOwnerRef.current = null;
      ordersRef.current = [];
      setAuthOwnerId(nextOwnerId);
      setAuthResolved(true);
      setLoadedOwnerId(null);
      setOrders([]);
      setNextCursor(null);
      setBusyId(null);
      setOperation(null);
      setState(
        nextOwnerId
          ? { kind: 'loading', message: 'Verifying The Current Operator Account...' }
          : { kind: 'auth', message: 'Sign In With A Store-Operator Account.' }
      );
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyOwner(session?.user?.id || null);
    });
    void ensureAuthReady(supabase).then((user) => {
      applyOwner(user?.id || null);
    });
    return () => {
      active = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!authResolved) return;
    void loadOrders({ expectedAccountId: authOwnerId });
  }, [authOwnerId, authResolved, loadOrders]);

  useEffect(() => {
    busyIdRef.current = busyId;
  }, [busyId]);

  const operationOpen = Boolean(operation);
  useEffect(() => {
    if (!operationOpen) return undefined;
    const releaseScrollLock = acquireScrollLock('MerchFulfillmentOperationDialog');
    operationTitleRef.current?.focus();
    const handleDialogKey = (event) => {
      if (event.key === 'Escape' && !busyIdRef.current) {
        setOperation(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        operationDialogRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled)'
        ) || []
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === operationTitleRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKey);
    return () => {
      document.removeEventListener('keydown', handleDialogKey);
      releaseScrollLock();
      operationTriggerRef.current?.focus?.();
    };
  }, [operationOpen]);

  const openOperation = (event, order, action) => {
    operationTriggerRef.current = event.currentTarget;
    setOperation({ order, action, trackingNumber: '', carrier: '', trackingUrl: '' });
  };

  const transition = async (order, action, extraPayload = {}) => {
    if (transitionInFlightRef.current) return;
    const expectedAccountId = authOwnerRef.current;
    if (!expectedAccountId || loadedOwnerRef.current !== expectedAccountId) {
      setState({ kind: 'auth', message: 'Your Operator Account Changed. Reload The Queue.' });
      return;
    }
    transitionInFlightRef.current = true;
    const controller = new AbortController();
    transitionAbortRef.current = controller;
    const payload = {
      orderId: order.id,
      expectedVersion: Number(order.fulfillment_version) || 0,
      action,
      ...extraPayload,
    };

    setBusyId(order.id);
    try {
      const user = await ensureAuthReady(supabase);
      const token = getAccessToken();
      if (
        !user?.id ||
        user.id !== expectedAccountId ||
        authOwnerRef.current !== expectedAccountId ||
        loadedOwnerRef.current !== expectedAccountId ||
        !token
      ) {
        throw new Error('Your Operator Account Changed. Reload The Queue.');
      }
      const response = await boundedCommerceFetch('/api/store/fulfillment-operations', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        authOwnerRef.current !== expectedAccountId ||
        loadedOwnerRef.current !== expectedAccountId
      )
        return;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Operation failed');
      setOperation(null);
      await loadOrders({ expectedAccountId });
    } catch (error) {
      if (
        error?.name === 'AbortError' ||
        controller.signal.aborted ||
        !mountedRef.current ||
        authOwnerRef.current !== expectedAccountId
      )
        return;
      setState({ kind: 'error', message: error?.message || 'Operation failed' });
    } finally {
      const stillOwnsTransition = transitionAbortRef.current === controller;
      if (stillOwnsTransition) {
        transitionAbortRef.current = null;
        transitionInFlightRef.current = false;
        if (mountedRef.current && authOwnerRef.current === expectedAccountId) setBusyId(null);
      }
      controller.abort();
    }
  };

  const visibleOrders = loadedOwnerId === authOwnerId ? orders : [];
  const visibleNextCursor = loadedOwnerId === authOwnerId ? nextCursor : null;

  return (
    <>
      <SEOHead
        title="Merchandise Fulfillment Console"
        description="Protected Smarter.Poker merchandise fulfillment operations."
        canonical="/hub/merch-store/fulfillment"
        noindex
      />
      <UniversalHeader pageDepth={2} />
      <main
        className={styles.page}
        data-marketplace-route="/hub/merch-store/fulfillment"
        data-title-case-strategy="css"
      >
        <header className={styles.hero}>
          <div className={styles.eyebrow}>Protected Store Operations</div>
          <h1>Fulfillment Command Vault</h1>
          <p>Paid Orders, Manual Handoff, Tracking, Delivery, And Atomic Diamond Refunds.</p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={state.kind === 'loading'}
            >
              Refresh Queue
            </button>
            <Link href="/hub/merch-store">Return To Merch Store</Link>
          </div>
        </header>

        <div className={styles.status} role="status" aria-live="polite">
          {marketplaceCopy(state.message)}
        </div>
        <section className={styles.grid} aria-label="Merchandise Fulfillment Orders">
          {visibleOrders.map((order) => {
            const address = order.shipping_address || {};
            const busy = busyId === order.id;
            const metadata =
              order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
            const isManual = metadata.fulfillment_mode === 'manual';
            const isQuarantined = metadata.needs_review === true && !isManual;
            return (
              <article key={order.id} className={styles.order}>
                <div className={styles.orderTop}>
                  <span>
                    {marketplaceFulfillmentStatus(
                      metadata.fulfillment_status || order.status || 'paid'
                    )}
                  </span>
                  <code data-preserve-case="true">{order.id}</code>
                </div>
                <h2>{itemLabel(order) || 'Merchandise Order'}</h2>
                <p className={styles.money}>
                  {order.payment_method === 'diamonds'
                    ? `${Number(order.diamonds_spent || 0).toLocaleString()} Diamonds`
                    : `$${Number(order.total_usd || 0).toFixed(2)}`}
                </p>
                <address data-user-content="true" data-preserve-case="true">
                  {address.name || 'Recipient'}
                  <br />
                  {address.address1 || address.line1 || 'Address unavailable'}
                  {address.address2 ? `, ${address.address2}` : ''}
                  <br />
                  {[
                    address.city,
                    address.state_code || address.state,
                    address.zip || address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  <br />
                  {address.country_code || address.country || ''}
                </address>
                {order.tracking_number && (
                  <p>
                    <span data-preserve-case="true">
                      {marketplaceCarrierName(order.carrier || 'Carrier')}
                    </span>{' '}
                    · <span data-preserve-case="true">{order.tracking_number}</span>
                  </p>
                )}
                {isQuarantined && (
                  <div className={styles.quarantine} role="status">
                    <strong>Automatic Fulfillment Quarantined</strong>
                    <span data-user-content="true" data-preserve-case="true">
                      {metadata.reason || 'Provider State Requires Reconciliation.'}
                    </span>
                    {metadata.printful_order_id && (
                      <code data-preserve-case="true">
                        Provider Order {metadata.printful_order_id}
                      </code>
                    )}
                    <small>
                      Manual Shipping And Refunds Are Locked Until The Provider Order Is Reconciled
                      Or Cancelled.
                    </small>
                  </div>
                )}
                {isManual ? (
                  <div className={styles.actions}>
                    {order.status === 'paid' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void transition(order, 'mark_processing')}
                      >
                        Start Processing
                      </button>
                    )}
                    {['paid', 'processing'].includes(order.status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => openOperation(event, order, 'mark_shipped')}
                      >
                        Mark Shipped
                      </button>
                    )}
                    {order.status === 'shipped' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void transition(order, 'mark_delivered')}
                      >
                        Mark Delivered
                      </button>
                    )}
                    {order.payment_method === 'diamonds' &&
                      !['shipped', 'delivered'].includes(order.status) && (
                        <button
                          className={styles.danger}
                          type="button"
                          disabled={busy}
                          onClick={(event) => openOperation(event, order, 'refund')}
                        >
                          Refund Diamonds
                        </button>
                      )}
                  </div>
                ) : !isQuarantined ? (
                  <p className={styles.providerManaged}>
                    This Order Is Managed By Its Connected Fulfillment Provider.
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
        {visibleNextCursor && (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={state.kind === 'loading'}
              onClick={() =>
                void loadOrders({
                  append: true,
                  cursor: visibleNextCursor,
                  expectedAccountId: authOwnerId,
                })
              }
            >
              Load Older Exceptions
            </button>
          </div>
        )}
        {operation && (
          <div
            className={styles.dialogBackdrop}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busyId) setOperation(null);
            }}
          >
            <section
              ref={operationDialogRef}
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fulfillment-operation-title"
              aria-describedby="fulfillment-operation-copy"
            >
              <button
                type="button"
                className={styles.dialogClose}
                aria-label="Close Fulfillment Operation"
                disabled={Boolean(busyId)}
                onClick={() => setOperation(null)}
              >
                Close
              </button>
              <span className={styles.eyebrow}>Verified Operator Action</span>
              <h2 id="fulfillment-operation-title" ref={operationTitleRef} tabIndex={-1}>
                {operation.action === 'refund'
                  ? 'Authorize Diamond Refund'
                  : 'Confirm Shipment Handoff'}
              </h2>
              <p id="fulfillment-operation-copy">
                {operation.action === 'refund'
                  ? `Return ${Number(operation.order.diamonds_spent || 0).toLocaleString()} Diamonds and release unsent local stock for this order.`
                  : 'Record the shipment only after the package has been handed to the carrier. Tracking is written to the verified order ledger.'}
              </p>
              {operation.action === 'mark_shipped' && (
                <div className={styles.formGrid}>
                  <label>
                    Tracking Number
                    <input
                      data-preserve-case="true"
                      data-user-content="true"
                      autoFocus
                      required
                      maxLength={160}
                      autoComplete="off"
                      value={operation.trackingNumber}
                      onChange={(event) =>
                        setOperation((current) => ({
                          ...current,
                          trackingNumber: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Carrier
                    <input
                      data-preserve-case="true"
                      data-user-content="true"
                      maxLength={100}
                      autoComplete="organization"
                      placeholder="USPS, UPS, FedEx"
                      value={operation.carrier}
                      onChange={(event) =>
                        setOperation((current) => ({ ...current, carrier: event.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.fullField}>
                    HTTPS Tracking URL <span>Optional</span>
                    <input
                      data-preserve-case="true"
                      data-user-content="true"
                      type="url"
                      inputMode="url"
                      maxLength={500}
                      placeholder="https://"
                      value={operation.trackingUrl}
                      onChange={(event) =>
                        setOperation((current) => ({ ...current, trackingUrl: event.target.value }))
                      }
                    />
                  </label>
                </div>
              )}
              <div className={styles.dialogActions}>
                <button type="button" disabled={Boolean(busyId)} onClick={() => setOperation(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={operation.action === 'refund' ? styles.danger : ''}
                  disabled={
                    Boolean(busyId) ||
                    (operation.action === 'mark_shipped' && !operation.trackingNumber.trim())
                  }
                  onClick={() =>
                    void transition(
                      operation.order,
                      operation.action,
                      operation.action === 'mark_shipped'
                        ? {
                            trackingNumber: operation.trackingNumber.trim(),
                            carrier: operation.carrier.trim(),
                            ...(operation.trackingUrl.trim()
                              ? { trackingUrl: operation.trackingUrl.trim() }
                              : {}),
                          }
                        : {}
                    )
                  }
                >
                  {busyId
                    ? 'Authorizing…'
                    : operation.action === 'refund'
                      ? 'Confirm Diamond Refund'
                      : 'Confirm Shipment'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
