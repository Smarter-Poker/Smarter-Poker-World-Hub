import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Gem, PackageCheck, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../../src/components/store/MarketplaceDetailExperience.module.css';
import { marketplaceCopy } from '../../../../src/lib/store/marketplaceCopy';
import { authedFetch, useRequireAuth } from '../../../../src/lib/authUtils';

const MARKETPLACE_RECEIPT_TIMEOUT_MS = 20000;

export const ORDER_SOURCES = Object.freeze({
  diamonds: true,
  merchandise: true,
  vip: true,
  vip_diamonds: true,
  club: true,
});

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not recorded';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAmount(amount, currency) {
  if (currency === 'diamonds') return `${(Number(amount) || 0).toLocaleString()} Diamonds`;
  if (currency === 'chips') return `${(Number(amount) || 0).toLocaleString()} Legacy Chips`;
  return `$${((Number(amount) || 0) / 100).toFixed(2)}`;
}

export default function MarketplaceReceiptPage() {
  const router = useRouter();
  const rawOrderId = Array.isArray(router.query.orderId) ? router.query.orderId[0] : router.query.orderId;
  const rawSource = Array.isArray(router.query.source) ? router.query.source[0] : router.query.source;
  const source = Object.hasOwn(ORDER_SOURCES, rawSource || '') ? rawSource : null;
  const canonical = rawOrderId
    ? `/hub/diamond-store/orders/${encodeURIComponent(rawOrderId)}`
    : '/hub/diamond-store/orders';
  // The source selects the owner-scoped table. Preserve it through login or a
  // valid receipt link returns without enough context to load its record.
  const authReturnPath = source ? `${canonical}?source=${encodeURIComponent(source)}` : canonical;
  const { user, checking } = useRequireAuth(authReturnPath);
  const [loadedRecord, setRecord] = useState(null);
  const [state, setState] = useState({ kind: 'loading', message: 'Reading verified commerce record…' });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const requestRef = useRef(0);
  // Effects run after paint. Route-key the rendered record as well as aborting
  // requests so receipt A can never flash under receipt B's URL for one frame.
  const record =
    loadedRecord?._routeSource === source &&
    loadedRecord?._routeOrderId === String(rawOrderId || '') &&
    loadedRecord?._ownerId === user?.id
      ? loadedRecord
      : null;

  useEffect(() => {
    const requestId = ++requestRef.current;
    setRecord(null);
    if (!router.isReady || checking || !user?.id) return;
    if (!rawOrderId || !source) {
      setState({ kind: 'invalid', message: 'This Receipt Link Is Missing A Valid Order Type.' });
      return;
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, MARKETPLACE_RECEIPT_TIMEOUT_MS);
    setState({ kind: 'loading', message: 'Reading verified commerce record…' });
    authedFetch(
      `/api/store/order-ledger?source=${encodeURIComponent(source)}&id=${encodeURIComponent(rawOrderId)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (requestId !== requestRef.current) return;
        if (controller.signal.aborted) {
          if (timedOut) throw new Error('Receipt verification timed out');
          return;
        }
        if (response.status === 404) {
          setRecord(null);
          setState({ kind: 'missing', message: 'No order matching this private receipt was found.' });
          return;
        }
        if (!response.ok || !payload?.success || !payload?.data?.order) {
          throw new Error(payload?.error || 'Receipt unavailable');
        }
        setRecord({
          ...payload.data.order,
          _routeSource: source,
          _routeOrderId: String(rawOrderId),
          _ownerId: user.id,
        });
        setState({ kind: 'ready', message: 'Verified server-owned commerce record.' });
      })
      .catch((error) => {
        if (requestId !== requestRef.current) return;
        if (error?.name === 'AbortError' && !timedOut) return;
        setRecord(null);
        setState({
          kind: 'error',
          message: timedOut
            ? 'Receipt Verification Timed Out. Try Again.'
            : 'The Receipt Could Not Be Loaded. Try Again From Order History.',
        });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      requestRef.current += 1;
      controller.abort();
    };
  }, [checking, rawOrderId, retryAttempt, router.isReady, source, user?.id]);

  const timeline = useMemo(() => {
    if (!record) return [];
    return [
      ['Order placed', record.created_at],
      ...(record.source === 'merchandise'
        ? [
            ['Shipped', record.shippedAt],
            ['Delivered', record.deliveredAt],
          ]
        : []),
      ...(record.source === 'vip'
        ? [
            ['Access begins', record.periodStart],
            ['Current term ends', record.periodEnd],
          ]
        : []),
      ...(record.refundedAt ? [['Refunded', record.refundedAt]] : []),
    ];
  }, [record]);

  const isMembershipStatus = source === 'vip' || record?.recordType === 'membership_status';
  const isCardFundedClubPurchase = record?.recordType === 'card_funded_club_purchase';
  const title = record?.title || (isMembershipStatus ? 'Private VIP Membership Record' : 'Private Marketplace Receipt');
  const orderLabel = rawOrderId ? String(rawOrderId).slice(0, 12).toUpperCase() : 'PENDING';
  const image =
    source === 'merchandise'
      ? '/images/store-v3/merch-hero.webp'
      : source === 'vip' || source === 'vip_diamonds'
        ? '/images/store-v3/vip-hero.webp'
        : source === 'club'
          ? '/images/store-v3/club-shop-hero.webp'
        : '/images/store-v3/diamond-vault-hero.webp';

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={title}
      description="A private, owner-scoped Smarter.Poker marketplace transaction record."
      eyebrow={`${isMembershipStatus ? 'Membership Record' : 'Commerce Receipt'} / ${source || 'verification pending'}`}
      image={image}
      imageAlt="Smarter.Poker marketplace transaction vault"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Orders', href: '/hub/diamond-store/orders' },
        { label: `${isMembershipStatus ? 'Membership' : 'Receipt'} ${orderLabel}`, href: canonical },
      ]}
      diamondPrice={record?.currency === 'diamonds' ? record.amount : null}
      price={record?.currency === 'usd' ? record.amount / 100 : null}
      status={record?.status || state.message}
      actions={
        <>
          <Link href="/hub/diamond-store/orders">
            <ArrowLeft size={16} aria-hidden="true" /> Back To Orders
          </Link>
          <Link href="/hub/diamond-store">
            <Gem size={16} aria-hidden="true" /> Marketplace
          </Link>
        </>
      }
      structuredData={{
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: isMembershipStatus
          ? 'Private Smarter.Poker VIP Membership Record'
          : 'Private Smarter.Poker Marketplace Receipt',
        url: `https://smarter.poker${canonical}`,
      }}
      noindex
      commerceActive="orders"
    >
      <div
        role={state.kind === 'error' ? 'alert' : 'status'}
        aria-live={state.kind === 'error' ? 'assertive' : 'polite'}
        aria-busy={state.kind === 'loading'}
        className={detailStyles.detailCard}
      >
        <h2>
          <ReceiptText size={22} aria-hidden="true" />
          {isMembershipStatus ? ' Membership Verification' : ' Receipt Verification'}
        </h2>
        <p>{marketplaceCopy(state.message)}</p>
        <p>{isMembershipStatus ? 'Membership Record' : 'Receipt'} ID: <strong>{orderLabel}</strong></p>
        {state.kind === 'error' && (
          <button
            type="button"
            onClick={() => setRetryAttempt((attempt) => attempt + 1)}
            style={receiptStyles.retryButton}
          >
            Retry Receipt Verification
          </button>
        )}
      </div>

      {record && (
        <>
          {isCardFundedClubPurchase && (
            <section className={detailStyles.detailCard} aria-labelledby="club-card-settlement-title">
              <h2 id="club-card-settlement-title">Club Shop Card Settlement</h2>
              <p>
                Card Funding Added <strong>{Number(record.fundedDiamonds || 0).toLocaleString()} Diamonds</strong>.
                {' '}The Item Authorized <strong>{Number(record.clubItemPrice || 0).toLocaleString()} Diamonds</strong>.
              </p>
              {record.redemptionStatus === 'needs_review' && (
                <p role="alert">
                  The Card Payment And Diamond Funding Are Complete, But The Item Still Needs A New
                  Diamond Purchase Review. No Additional Card Payment Is Required.
                </p>
              )}
            </section>
          )}
          <div className={detailStyles.detailGrid}>
            <section className={detailStyles.detailCard} aria-labelledby="receipt-lines-title">
              <h2 id="receipt-lines-title">Order Lines</h2>
              <div style={receiptStyles.lines}>
                {(record.items || []).map((item, index) => (
                  <div key={`${item.name}-${index}`} style={receiptStyles.line}>
                    <span>
                      <strong>{marketplaceCopy(item.name)}</strong>
                      {item.option && <small style={receiptStyles.option}>{item.option}</small>}
                    </span>
                    <span>x{item.quantity}</span>
                  </div>
                ))}
              </div>
              <div style={receiptStyles.total}>
                <span>{isMembershipStatus ? 'Current Plan Rate' : 'Original Total'}</span>
                <strong>{formatAmount(record.amount, record.currency)}</strong>
              </div>
              {Number(record.refundAmount) > 0 && (
                <>
                  <div style={receiptStyles.adjustment}>
                    <span>Refunded</span>
                    <strong>-{formatAmount(record.refundAmount, record.currency)}</strong>
                  </div>
                  <div style={receiptStyles.adjustment}>
                    <span>Net Settled</span>
                    <strong>{formatAmount(record.netAmount, record.currency)}</strong>
                  </div>
                </>
              )}
              {Number(record.refundedDiamonds) > 0 && (
                <div style={receiptStyles.adjustment}>
                  <span>Diamonds Reconciled</span>
                  <strong>{Number(record.refundedDiamonds).toLocaleString()}</strong>
                </div>
              )}
            </section>

            <section className={detailStyles.detailCard} aria-labelledby="receipt-timeline-title">
              <h2 id="receipt-timeline-title">
                <PackageCheck size={22} aria-hidden="true" /> Transaction Timeline
              </h2>
              <ol style={receiptStyles.timeline}>
                {timeline.map(([label, date]) => (
                  <li key={label} style={receiptStyles.timelineItem}>
                    <span>{label}</span>
                    <time dateTime={date || undefined}>{formatDate(date)}</time>
                  </li>
                ))}
              </ol>
              {(record.carrier || record.trackingNumber) && (
                <p>
                  {record.carrier && <>Carrier: <strong>{record.carrier}</strong>. </>}
                  {record.trackingNumber && <>Tracking: <strong>{record.trackingNumber}</strong>.</>}
                </p>
              )}
              {record.trackingUrl && (
                <a href={record.trackingUrl} style={receiptStyles.trackingLink}>
                  Track Package On Carrier Site
                </a>
              )}
            </section>
          </div>
        </>
      )}
    </MarketplaceDetailExperience>
  );
}

const receiptStyles = {
  lines: { display: 'grid', gap: 10 },
  line: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 16,
    padding: '12px 0',
    borderBottom: '1px solid rgba(132,177,198,0.22)',
  },
  option: { display: 'block', marginTop: 5, color: '#91a8b4', overflowWrap: 'anywhere' },
  total: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid #8ed9eb',
    color: '#8befff',
  },
  adjustment: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 10,
    color: '#fbbf24',
  },
  timeline: { display: 'grid', gap: 12, margin: 0, padding: 0, listStyle: 'none' },
  timelineItem: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 16,
    padding: '12px 14px',
    borderLeft: '3px solid #00c8ff',
    background: 'rgba(0,168,232,0.08)',
  },
  trackingLink: {
    display: 'inline-flex',
    minHeight: 44,
    alignItems: 'center',
    marginTop: 8,
    padding: '0 14px',
    border: '1px solid #8ed9eb',
    color: '#dff9ff',
    textDecoration: 'none',
  },
  retryButton: {
    minHeight: 44,
    marginTop: 12,
    padding: '0 16px',
    border: '1px solid #8ed9eb',
    borderRadius: 0,
    background: 'linear-gradient(180deg, #1b7692, #04121b 34%, #0d4256)',
    color: '#f3fcff',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
