/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ClubShopSalesAnalytics: is the shop working, what sells, did the promo land
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the retired Club Arena Manage tab. The Hub's Club Shop Manage
 * view reports LIFETIME totals, which answer none of the three questions an
 * operator actually has. This is the windowed view: a daily burn series over
 * 7, 30 or 90 days, the items that sold, and the members who bought.
 *
 * Reads GET /api/club-arena/shop-analytics, an existing route, unchanged and
 * read only. Nothing here mutates anything.
 *
 * Revenue is the server's, summed from club_shop_purchases.price_paid and
 * never from an item's CURRENT price, which an operator can edit at any time
 * and which would otherwise let a price change rewrite reported history.
 * Refunds are reported beside gross rather than hidden inside it.
 *
 * Split the same way the ledger is: ClubShopSalesAnalyticsView renders one
 * state from props, so loading, error, empty and reported can each be proven
 * without a network or a clock.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import shellStyles from '../diamond-store/DiamondStoreShell.module.css';
import { boundedCommerceFetch } from '../../lib/store/boundedCommerceFetch';
import { getVerifiedCheckoutAuthorization } from '../../lib/store/checkoutAuthorization';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import { getAuthUser } from '../../lib/authUtils';

export const CLUB_SHOP_ANALYTICS_RANGES = Object.freeze([7, 30, 90]);
const DEFAULT_RANGE = 30;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const fmt = (value) => Number(value || 0).toLocaleString('en-US');

/** One stable empty series, so a report that has none does not re-memo. */
const EMPTY_SERIES = Object.freeze([]);

// #SMARTERDESIGN materials. `border` precedes `borderImage` in every object:
// the border shorthand resets border-image.
const SD_NAVY = 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)';

const panelStyle = {
  background: SD_NAVY,
  border: '5px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
  borderRadius: 0,
  padding: 20,
  marginBottom: 24,
  color: '#f2f7ff',
  fontVariantNumeric: 'tabular-nums',
};

const wellStyle = {
  background: SD_NAVY,
  border: '3px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch",
  borderRadius: 0,
};

const emptyStyle = {
  textAlign: 'center',
  padding: 32,
  fontSize: 14,
  color: '#bdd0e2',
  fontWeight: 600,
};

const cellStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: '#bdd0e2',
  textAlign: 'left',
  verticalAlign: 'middle',
  borderBottom: '1px solid #445e77',
  fontVariantNumeric: 'tabular-nums',
};

const headCellStyle = {
  ...cellStyle,
  color: '#f2f7ff',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

/** One state of the sales panel, rendered from props and nothing else. */
export function ClubShopSalesAnalyticsView({
  days = DEFAULT_RANGE,
  data = null,
  loading = false,
  error = null,
  onRangeChange,
  onRetry,
}) {
  const totals = data?.totals || null;
  const series = Array.isArray(data?.series) ? data.series : EMPTY_SERIES;
  // A flat series still has to draw: dividing by a zero peak paints nothing.
  // Held across renders: the peak only moves when the report does, and every
  // unrelated render was walking the whole ninety-day series again.
  const peak = useMemo(
    () => Math.max(1, ...series.map((point) => Number(point.netRevenue ?? point.revenue) || 0)),
    [series]
  );

  return (
    <div
      className={shellStyles.clubAdminCreatePanel}
      role="region"
      aria-label="Club Shop Sales Report"
      style={panelStyle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f2f7ff', margin: 0 }}>Sales</h3>
        <div role="group" aria-label="Sales Date Range" style={{ display: 'flex', gap: 8 }}>
          {CLUB_SHOP_ANALYTICS_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              className={shellStyles.clubAdminManagedStatus}
              aria-pressed={days === range}
              disabled={loading && days === range}
              onClick={() => onRangeChange?.(range)}
            >
              {range} Days
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            padding: '12px 14px',
            ...wellStyle,
            color: '#FF5B6E',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span>{marketplaceCopy(error)}</span>
          <button
            type="button"
            className={shellStyles.clubAdminManagedStatus}
            onClick={() => onRetry?.()}
            disabled={loading}
          >
            {loading ? 'Retrying...' : 'Retry Sales'}
          </button>
        </div>
      )}

      {loading && !data && (
        <div role="status" aria-live="polite" style={emptyStyle}>
          Loading Sales...
        </div>
      )}

      {data && (
        <>
          {data.truncated && (
            <div
              role="status"
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                ...wellStyle,
                color: '#86daff',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              This Report Is Partial. Some Ledger Rows In The Window Were Not Processed.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            {[
              { label: 'Net Sales', value: fmt(totals?.netSales) },
              { label: 'Net Diamonds Burned', value: fmt(totals?.netRevenue) },
              { label: 'Buyers', value: fmt(totals?.uniqueBuyers) },
              { label: 'Average Sale', value: fmt(totals?.averageSale) },
            ].map((stat) => (
              <div
                key={stat.label}
                className={shellStyles.clubAdminStat}
                style={{
                  ...wellStyle,
                  padding: '16px 14px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f2f7ff' }}>{stat.value}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#bdd0e2',
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {Number(totals?.refundedAmount || 0) > 0 && (
            <div
              style={{
                marginBottom: 12,
                fontSize: 12,
                lineHeight: 1.6,
                color: '#bdd0e2',
              }}
            >
              Gross {fmt(totals?.grossRevenue)} Less {fmt(totals?.refundedAmount)} Refunded.
            </div>
          )}

          {Number(totals?.grossSales || 0) === 0 ? (
            <div style={emptyStyle}>
              No Sales In The Last {fmt(data.days)} Days. Try A Sale Price, Or A Limited Drop To
              Create Urgency.
            </div>
          ) : (
            <>
              {/* Pure CSS bars: no chart library ships in this bundle. */}
              <div
                role="list"
                aria-label={`Daily Diamond Burns Over ${data.days} Days`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 2,
                  height: 96,
                  marginBottom: 16,
                  ...wellStyle,
                  padding: '6px 4px 0',
                }}
              >
                {series.map((point) => {
                  const value = Number(point.netRevenue ?? point.revenue) || 0;
                  return (
                    <div
                      key={point.date}
                      role="listitem"
                      aria-label={`${point.date}: ${fmt(point.netSales ?? point.sales)} Sales, ${fmt(value)} Diamonds Burned`}
                      title={`${point.date}: ${fmt(point.netSales ?? point.sales)} Sales, ${fmt(value)} Diamonds`}
                      style={{
                        flex: 1,
                        minWidth: 2,
                        height: `${Math.max(2, Math.round((value / peak) * 100))}%`,
                        background: '#86daff',
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={headCellStyle}>
                        Top Items
                      </th>
                      <th scope="col" style={headCellStyle}>
                        Net Sold
                      </th>
                      <th scope="col" style={headCellStyle}>
                        Diamonds
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.topItems || []).map((item) => (
                      <tr key={item.itemId}>
                        <td style={{ ...cellStyle, fontWeight: 700, color: '#f2f7ff' }}>
                          {marketplaceCopy(item.name || 'Deleted Item')}
                        </td>
                        <td style={cellStyle}>{fmt(item.netSales)}</td>
                        <td style={cellStyle}>{fmt(item.netRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(data.topBuyers || []).length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th scope="col" style={headCellStyle}>
                          Top Buyers
                        </th>
                        <th scope="col" style={headCellStyle}>
                          Net Purchases
                        </th>
                        <th scope="col" style={headCellStyle}>
                          Diamonds
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topBuyers.map((buyer) => (
                        <tr key={buyer.userId}>
                          {/* A member's name is an identity, not shopper copy:
                              Title-Casing it can make two members identical. */}
                          <td
                            data-preserve-case="true"
                            data-user-content="true"
                            style={{ ...cellStyle, fontWeight: 700, color: '#f2f7ff' }}
                          >
                            {buyer.name || 'Member'}
                          </td>
                          <td style={cellStyle}>{fmt(buyer.netPurchases)}</td>
                          <td style={cellStyle}>{fmt(buyer.netSpent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ClubShopSalesAnalytics({
  accountId = null,
  clubId = null,
  snapshotOwned = false,
}) {
  const [days, setDays] = useState(DEFAULT_RANGE);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const activeOwnerRef = useRef({ accountId, clubId });
  const attemptRef = useRef(0);
  const abortRef = useRef(null);

  // A private sales report belongs to one account and one club.
  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true;
    activeOwnerRef.current = { accountId, clubId };
    attemptRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setData(null);
    setError(null);
    setLoading(false);
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [accountId, clubId]);

  const load = useCallback(async () => {
    if (!accountId || !clubId || !snapshotOwned) return;
    const expectedAccountId = accountId;
    const expectedClubId = clubId;
    const attemptId = ++attemptRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestIsCurrent = () =>
      mountedRef.current &&
      !controller.signal.aborted &&
      attemptRef.current === attemptId &&
      activeOwnerRef.current.accountId === expectedAccountId &&
      activeOwnerRef.current.clubId === expectedClubId &&
      getAuthUser()?.id === expectedAccountId;

    setLoading(true);
    setError(null);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!requestIsCurrent()) return;
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Reopen The Sales Report.');
      }
      const response = await boundedCommerceFetch(
        `/api/club-arena/shop-analytics?clubId=${encodeURIComponent(expectedClubId)}&days=${days}`,
        {
          headers: { Authorization: `Bearer ${authorization.accessToken}` },
          signal: controller.signal,
        }
      );
      const json = await response
        .json()
        .catch(() => ({ success: false, error: `HTTP ${response.status}` }));
      if (!requestIsCurrent()) return;
      if (!response.ok || !json.success || !json.totals) {
        throw new Error(json.error || `The Sales Report Failed (${response.status}).`);
      }
      setData(json);
    } catch (err) {
      if (!requestIsCurrent() || err?.name === 'AbortError') return;
      // Keep the last good report behind the banner rather than blanking it.
      setError(err?.message || 'The Sales Report Could Not Be Loaded.');
    } finally {
      if (abortRef.current === controller && attemptRef.current === attemptId) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [accountId, clubId, days, snapshotOwned]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ClubShopSalesAnalyticsView
      days={days}
      data={data}
      loading={loading}
      error={error}
      onRangeChange={setDays}
      onRetry={load}
    />
  );
}
