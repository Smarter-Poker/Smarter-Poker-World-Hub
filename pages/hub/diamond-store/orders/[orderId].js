import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Gem, PackageCheck, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import MarketplaceDetailExperience from '../../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../../src/components/store/MarketplaceDetailExperience.module.css';
import { useRequireAuth } from '../../../../src/lib/authUtils';
import { supabase } from '../../../../src/lib/supabase';

const DIAMONDS_PER_DOLLAR = 100;

export const ORDER_SOURCES = {
  diamonds: {
    table: 'diamond_purchases',
    select:
      'id, package_name, diamonds_amount, bonus_diamonds, price_usd, status, created_at, completed_at',
  },
  merchandise: {
    table: 'merchandise_orders',
    select:
      'id, items, total_usd, diamonds_spent, payment_method, status, metadata, tracking_number, tracking_url, carrier, created_at, updated_at, shipped_at, delivered_at',
  },
  vip: {
    table: 'vip_subscriptions',
    select:
      'id, tier, status, price_usd, current_period_start, current_period_end, created_at, updated_at',
  },
};

function safeTrackingUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

const toCents = (usd) => Math.round((Number(usd) || 0) * 100);

function normalizeOrder(source, row) {
  if (source === 'diamonds') {
    const packageName = row?.package_name || 'Diamond Package';
    const diamonds = (Number(row?.diamonds_amount) || 0) + (Number(row?.bonus_diamonds) || 0);
    return {
      id: row?.id,
      source,
      title: `${packageName} Diamond Package`,
      status: row?.status || 'pending',
      createdAt: row?.created_at || row?.completed_at || null,
      amount: toCents(row?.price_usd),
      currency: 'usd',
      items: [{ name: `${packageName} (${diamonds.toLocaleString()} Diamonds)`, quantity: 1 }],
    };
  }

  if (source === 'vip') {
    const tier = String(row?.tier || 'VIP');
    const titleTier = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      id: row?.id,
      source,
      title: `${titleTier} VIP Membership`,
      status: row?.status || 'active',
      createdAt: row?.created_at || row?.updated_at || null,
      periodStart: row?.current_period_start || null,
      periodEnd: row?.current_period_end || null,
      amount: toCents(row?.price_usd),
      currency: 'usd',
      items: [{ name: `${titleTier} VIP Access`, quantity: 1 }],
    };
  }

  const paidWithDiamonds = row?.payment_method === 'diamonds';
  return {
    id: row?.id,
    source,
    title: 'Merchandise Order',
    status: row?.status || 'pending',
    createdAt: row?.created_at || row?.updated_at || null,
    shippedAt: row?.shipped_at || row?.metadata?.shipped_at || null,
    deliveredAt: row?.delivered_at || row?.metadata?.delivered_at || null,
    fulfillmentStatus: row?.metadata?.fulfillment_status || null,
    carrier: row?.carrier || null,
    trackingNumber: row?.tracking_number || null,
    trackingUrl: safeTrackingUrl(row?.tracking_url),
    amount: paidWithDiamonds ? Number(row?.diamonds_spent) || 0 : toCents(row?.total_usd),
    currency: paidWithDiamonds ? 'diamonds' : 'usd',
    items: (Array.isArray(row?.items) ? row.items : []).map((item) => ({
      name: item?.name || 'Marketplace Item',
      option: item?.description || item?.variantLabel || null,
      quantity: Math.max(1, Number(item?.quantity) || 1),
      amount: paidWithDiamonds
        ? Number(item?.diamondPrice) || Math.ceil((Number(item?.price ?? item?.priceUsd) || 0) * DIAMONDS_PER_DOLLAR)
        : toCents(item?.price ?? item?.priceUsd),
    })),
  };
}

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
  return `$${((Number(amount) || 0) / 100).toFixed(2)}`;
}

export default function MarketplaceReceiptPage() {
  const router = useRouter();
  const rawOrderId = Array.isArray(router.query.orderId) ? router.query.orderId[0] : router.query.orderId;
  const rawSource = Array.isArray(router.query.source) ? router.query.source[0] : router.query.source;
  const source = ORDER_SOURCES[rawSource] ? rawSource : null;
  const canonical = rawOrderId
    ? `/hub/diamond-store/orders/${encodeURIComponent(rawOrderId)}`
    : '/hub/diamond-store/orders';
  // The source selects the owner-scoped table. Preserve it through login or a
  // valid receipt link returns without enough context to load its record.
  const authReturnPath = source ? `${canonical}?source=${encodeURIComponent(source)}` : canonical;
  const { user, checking } = useRequireAuth(authReturnPath);
  const [record, setRecord] = useState(null);
  const [state, setState] = useState({ kind: 'loading', message: 'Reading verified commerce record…' });

  useEffect(() => {
    if (!router.isReady || checking || !user?.id) return;
    if (!rawOrderId || !source) {
      setState({ kind: 'error', message: 'This receipt link is missing a valid order type.' });
      return;
    }
    let cancelled = false;
    const definition = ORDER_SOURCES[source];
    setState({ kind: 'loading', message: 'Reading verified commerce record…' });
    supabase
      .from(definition.table)
      .select(definition.select)
      .eq('id', rawOrderId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ kind: 'error', message: 'The receipt could not be loaded. Try again from Order History.' });
          return;
        }
        if (!data) {
          setState({ kind: 'missing', message: 'No order matching this private receipt was found.' });
          return;
        }
        setRecord(normalizeOrder(source, data));
        setState({ kind: 'ready', message: 'Verified owner-scoped commerce record.' });
      });
    return () => {
      cancelled = true;
    };
  }, [checking, rawOrderId, router.isReady, source, user?.id]);

  const timeline = useMemo(() => {
    if (!record) return [];
    return [
      ['Order placed', record.createdAt],
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
    ];
  }, [record]);

  const title = record?.title || 'Private Marketplace Receipt';
  const orderLabel = rawOrderId ? String(rawOrderId).slice(0, 12).toUpperCase() : 'PENDING';
  const image =
    source === 'merchandise'
      ? '/images/store-v3/merch-hero.webp'
      : source === 'vip'
        ? '/images/store-v3/vip-hero.webp'
        : '/images/store-v3/diamond-vault-hero.webp';

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={title}
      description="A private, owner-scoped Smarter.Poker marketplace transaction record."
      eyebrow={`Commerce Receipt / ${source || 'verification pending'}`}
      image={image}
      imageAlt="Smarter.Poker marketplace transaction vault"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Orders', href: '/hub/diamond-store/orders' },
        { label: `Receipt ${orderLabel}`, href: canonical },
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
        name: 'Private Smarter.Poker Marketplace Receipt',
        url: `https://smarter.poker${canonical}`,
      }}
      noindex
      commerceActive="orders"
    >
      <div role="status" aria-live="polite" className={detailStyles.detailCard}>
        <h2>
          <ReceiptText size={22} aria-hidden="true" /> Receipt Verification
        </h2>
        <p>{state.message}</p>
        <p>Receipt ID: <strong>{orderLabel}</strong></p>
      </div>

      {record && (
        <>
          <div className={detailStyles.detailGrid}>
            <section className={detailStyles.detailCard} aria-labelledby="receipt-lines-title">
              <h2 id="receipt-lines-title">Order Lines</h2>
              <div style={receiptStyles.lines}>
                {(record.items || []).map((item, index) => (
                  <div key={`${item.name}-${index}`} style={receiptStyles.line}>
                    <span>
                      <strong>{item.name}</strong>
                      {item.option && <small style={receiptStyles.option}>{item.option}</small>}
                    </span>
                    <span>x{item.quantity}</span>
                  </div>
                ))}
              </div>
              <div style={receiptStyles.total}>
                <span>Verified Total</span>
                <strong>{formatAmount(record.amount, record.currency)}</strong>
              </div>
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
};
