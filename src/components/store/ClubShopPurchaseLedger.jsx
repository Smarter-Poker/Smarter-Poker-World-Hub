/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ClubShopPurchaseLedger: who bought what, when, for how much (operator only)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from the retired Club Arena Manage tab. The Hub's Club Shop Manage
 * view reported club-wide TOTALS but never the individual purchases behind
 * them, so an operator could see that five hundred Diamonds had been burned
 * and not which member burned them on what.
 *
 * It also makes refunds reachable. /api/club-arena/refund-purchase has always
 * accepted any purchase in the club and has always been owner/admin gated, but
 * the only control that called it in this repo lived in the buyer's OWN
 * purchase history, so an operator could refund nobody but themselves. The
 * case the endpoint was built for, a member who bought the wrong item, had no
 * path at all.
 *
 * Reads:  GET  /api/club-arena/shop-purchases  (existing route, unchanged)
 * Writes: POST /api/club-arena/refund-purchase (existing route, unchanged)
 *
 * A redeemed purchase is listed and is NOT refundable: the granted benefit,
 * table time or throw credits, is already spent and cannot be taken back
 * automatically. The server enforces the same rule; this only avoids offering
 * a control that can never succeed.
 *
 * ACCOUNT AND CLUB BINDING. This panel moves money, so every request is bound
 * the way the page's other operator actions are bound: a fresh verified session
 * for the account that owns the visible club, an attempt counter and an
 * AbortController per request, and a re-check that neither the signed-in
 * account nor the club on screen changed before a response is allowed to land.
 * A superseded request may not write to this table, and a refund key minted
 * here names both the club and the purchase, so it can never settle against
 * another club's ledger.
 *
 * The panel is split in two on purpose: ClubShopPurchaseLedgerView is a pure
 * render of one state and nothing else, so loading, error, empty, searched
 * empty, listed and refunding can each be proven without a network or a clock.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import shellStyles from '../diamond-store/DiamondStoreShell.module.css';
import { boundedCommerceFetch } from '../../lib/store/boundedCommerceFetch';
import { getVerifiedCheckoutAuthorization } from '../../lib/store/checkoutAuthorization';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import { getAuthUser } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';

export const CLUB_SHOP_LEDGER_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const fmt = (value) => Number(value || 0).toLocaleString('en-US');

const unitOf = (currency) => (currency === 'chips' ? 'Chips' : 'Diamonds');

const STATUS_LABEL = {
  refunded: 'Refunded',
  redeemed: 'Redeemed',
  not_delivered: 'Not Delivered',
  owned: 'Owned',
};

const UNAVAILABLE_REASON = {
  redeemed: 'Already Used. The Granted Benefit Cannot Be Taken Back Automatically.',
  refunded: 'Already Refunded.',
  not_delivered: 'No Delivered Copy To Revoke.',
};

const panelStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: 20,
  marginBottom: 24,
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#E4E6EB',
  fontSize: 14,
  outline: 'none',
};

const emptyStyle = {
  textAlign: 'center',
  padding: 32,
  fontSize: 14,
  color: 'rgba(255,255,255,0.5)',
  fontWeight: 600,
};

const cellStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: '#C8D5DD',
  textAlign: 'left',
  verticalAlign: 'middle',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const headCellStyle = {
  ...cellStyle,
  color: 'rgba(255,255,255,0.45)',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

export function purchaseTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One state of the ledger, rendered from props and nothing else. */
export function ClubShopPurchaseLedgerView({
  rows = [],
  total = 0,
  offset = 0,
  query = '',
  appliedQuery = '',
  loading = false,
  loaded = false,
  error = null,
  refundingId = null,
  searching = false,
  onQueryChange,
  onRetry,
  onHide,
  onPrevious,
  onNext,
  onRefund,
}) {
  const showingFrom = rows.length === 0 ? 0 : offset + 1;
  const showingTo = offset + rows.length;

  return (
    <div
      className={shellStyles.clubAdminCreatePanel}
      role="region"
      aria-label="Club Shop Purchase Ledger"
      style={panelStyle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB', margin: 0 }}>
          Purchase Ledger
        </h3>
        {/* A control is a control: the status-pill class is the read-only
            badge's, and wearing it made this disclosure look like a label. */}
        <div className={shellStyles.clubAdminActions}>
          <button type="button" aria-expanded={true} onClick={() => onHide?.()}>
            Hide Ledger
          </button>
        </div>
      </div>

      <div className={shellStyles.controlRow} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          data-preserve-case="true"
          data-user-content="true"
          aria-label="Search Purchases By Item Or Member"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Search Item Or Member"
          maxLength={80}
          style={inputStyle}
        />
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
            border: '1px solid rgba(240,40,73,0.55)',
            background: 'rgba(240,40,73,0.10)',
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
            {loading ? 'Retrying...' : 'Retry Ledger'}
          </button>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div role="status" aria-live="polite" style={emptyStyle}>
          Loading Purchases...
        </div>
      )}

      {!loading && rows.length === 0 && loaded && !error && (
        <div style={emptyStyle}>
          {appliedQuery ? 'No Purchases Match That Search.' : 'No Purchases Yet.'}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption
                style={{
                  captionSide: 'top',
                  textAlign: 'left',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.45)',
                  paddingBottom: 8,
                }}
              >
                Every Club Shop Purchase, Newest First.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={headCellStyle}>
                    Member
                  </th>
                  <th scope="col" style={headCellStyle}>
                    Item
                  </th>
                  <th scope="col" style={headCellStyle}>
                    Paid
                  </th>
                  <th scope="col" style={headCellStyle}>
                    When
                  </th>
                  <th scope="col" style={headCellStyle}>
                    Status
                  </th>
                  <th scope="col" style={headCellStyle}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {/* A member's name is an identity, not shopper copy. Run
                        through marketplaceCopy, ALLIN_ACE reads as "Allin Ace"
                        and two different members can render identically, which
                        is how a refund reaches the wrong row. */}
                    <td
                      data-preserve-case="true"
                      data-user-content="true"
                      style={{ ...cellStyle, fontWeight: 700, color: '#E4E6EB' }}
                    >
                      {row.buyerName || 'Member'}
                    </td>
                    <td style={cellStyle}>{marketplaceCopy(row.itemName || 'Deleted Item')}</td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      {fmt(row.pricePaid)} {unitOf(row.currency)}
                    </td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      <time dateTime={row.createdAt || undefined}>
                        {purchaseTimestamp(row.createdAt)}
                      </time>
                    </td>
                    <td style={cellStyle}>{STATUS_LABEL[row.status] || 'Owned'}</td>
                    <td style={cellStyle}>
                      {row.refundable ? (
                        <button
                          type="button"
                          className={shellStyles.clubAdminManagedStatus}
                          onClick={() => onRefund?.(row)}
                          disabled={refundingId !== null}
                          aria-busy={refundingId === row.id}
                          aria-label={`Refund ${marketplaceCopy(row.itemName || 'Purchase')} For ${row.buyerName || 'Member'}`}
                        >
                          {refundingId === row.id ? 'Refunding...' : 'Refund'}
                        </button>
                      ) : (
                        // The reason was a `title` on a span, which no phone and
                        // no screen reader can reach. It is ordinary text now.
                        <span>
                          Refund Unavailable
                          <span
                            style={{
                              display: 'block',
                              marginTop: 2,
                              color: 'rgba(255,255,255,0.45)',
                            }}
                          >
                            {UNAVAILABLE_REASON[row.status] || 'No Delivered Copy To Revoke.'}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 12,
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            <button
              type="button"
              className={shellStyles.clubAdminManagedStatus}
              disabled={offset === 0 || loading || searching}
              onClick={() => onPrevious?.()}
            >
              Previous
            </button>
            <span>
              {showingFrom} To {showingTo} Of {fmt(total)}
            </span>
            <button
              type="button"
              className={shellStyles.clubAdminManagedStatus}
              disabled={offset + CLUB_SHOP_LEDGER_PAGE_SIZE >= total || loading || searching}
              onClick={() => onNext?.()}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ClubShopPurchaseLedger({
  accountId = null,
  clubId = null,
  snapshotOwned = false,
  onLedgerChanged,
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [refundingId, setRefundingId] = useState(null);

  const mountedRef = useRef(true);
  const activeOwnerRef = useRef({ accountId, clubId });
  const loadAttemptRef = useRef(0);
  const loadAbortRef = useRef(null);
  const refundAttemptRef = useRef(0);
  const refundAbortRef = useRef(null);
  const refundingRef = useRef(false);

  // A private ledger and an in-flight refund belong to one account and one
  // club. Never carry either across an auth or club transition.
  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true;
    activeOwnerRef.current = { accountId, clubId };
    loadAttemptRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    refundAttemptRef.current += 1;
    refundAbortRef.current?.abort();
    refundAbortRef.current = null;
    refundingRef.current = false;
    setRefundingId(null);
    setRows([]);
    setTotal(0);
    setOffset(0);
    // A search term belongs to the club it was typed in. Carried across, it
    // reported the next club empty for a term nobody there had searched for.
    setQuery('');
    setAppliedQuery('');
    setError(null);
    setLoaded(false);
    setLoading(false);
    return () => {
      mountedRef.current = false;
      loadAttemptRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      refundAttemptRef.current += 1;
      refundAbortRef.current?.abort();
      refundAbortRef.current = null;
      refundingRef.current = false;
    };
  }, [accountId, clubId]);

  // One request per pause in typing, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQuery(query.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Between a keystroke and the pause the box holds a newer question than the
  // rows below it, so the pager is held until they agree again.
  const searching = query.trim() !== appliedQuery;

  const load = useCallback(async () => {
    if (!open || !accountId || !clubId || !snapshotOwned) return;
    const expectedAccountId = accountId;
    const expectedClubId = clubId;
    const attemptId = ++loadAttemptRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const requestIsCurrent = () =>
      mountedRef.current &&
      !controller.signal.aborted &&
      loadAttemptRef.current === attemptId &&
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
        throw new Error('Your Signed-In Account Changed. Reopen The Purchase Ledger.');
      }
      const search = appliedQuery ? `&q=${encodeURIComponent(appliedQuery)}` : '';
      const response = await boundedCommerceFetch(
        `/api/club-arena/shop-purchases?clubId=${encodeURIComponent(expectedClubId)}` +
          `&limit=${CLUB_SHOP_LEDGER_PAGE_SIZE}&offset=${offset}${search}`,
        {
          headers: { Authorization: `Bearer ${authorization.accessToken}` },
          signal: controller.signal,
        }
      );
      const data = await response
        .json()
        .catch(() => ({ success: false, error: `HTTP ${response.status}` }));
      if (!requestIsCurrent()) return;
      if (!response.ok || !data.success || !Array.isArray(data.purchases)) {
        throw new Error(data.error || `The Purchase Ledger Failed (${response.status}).`);
      }
      setRows(data.purchases);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      if (!requestIsCurrent() || err?.name === 'AbortError') return;
      // Keep whatever is already listed: blanking the ledger on a transient
      // failure is worse than stale rows behind a banner nobody can miss.
      setError(err?.message || 'The Purchase Ledger Could Not Be Loaded.');
    } finally {
      // Must be in `finally`, or a failed request leaves the panel reading
      // "Loading Purchases" for ever.
      if (loadAbortRef.current === controller && loadAttemptRef.current === attemptId) {
        loadAbortRef.current = null;
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [accountId, appliedQuery, clubId, offset, open, snapshotOwned]);

  useEffect(() => {
    load();
  }, [load]);

  const refund = useCallback(
    async (row) => {
      if (refundingRef.current || !row?.id) return;
      const expectedAccountId = accountId;
      const expectedClubId = clubId;
      if (
        !snapshotOwned ||
        !expectedAccountId ||
        !expectedClubId ||
        activeOwnerRef.current.accountId !== expectedAccountId ||
        activeOwnerRef.current.clubId !== expectedClubId ||
        getAuthUser()?.id !== expectedAccountId
      ) {
        showStoreToast('error', 'The Club Shop Changed. Reload The Current Club Before Refunding.');
        return;
      }
      const attemptId = ++refundAttemptRef.current;
      refundAbortRef.current?.abort();
      const controller = new AbortController();
      refundAbortRef.current = controller;
      const attemptIsCurrent = () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        refundAttemptRef.current === attemptId &&
        activeOwnerRef.current.accountId === expectedAccountId &&
        activeOwnerRef.current.clubId === expectedClubId &&
        getAuthUser()?.id === expectedAccountId;

      refundingRef.current = true;
      setRefundingId(row.id);
      try {
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return;
        if (!authorization) {
          throw new Error('Your Signed-In Account Changed. Review This Refund Again.');
        }
        const response = await boundedCommerceFetch('/api/club-arena/refund-purchase', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authorization.accessToken}`,
            'Content-Type': 'application/json',
            // The same purchase retried is the SAME refund. The key names the
            // club and the purchase so a replay settles once, and so a key
            // minted here can never apply to another club's ledger.
            'X-Idempotency-Key': `refund:${expectedClubId}:${row.id}`,
          },
          signal: controller.signal,
          body: JSON.stringify({ clubId: expectedClubId, purchaseId: row.id }),
        });
        const data = await response
          .json()
          .catch(() => ({ success: false, error: `HTTP ${response.status}` }));
        const confirmed = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return;
        if (!confirmed) {
          throw new Error(
            'Your Signed-In Account Changed. The Original Refund Still Needs Verification.'
          );
        }
        if (!response.ok || !data.success) {
          throw new Error(data.error || `The Refund Failed (${response.status}).`);
        }
        showStoreToast(
          'success',
          data.alreadyRefunded
            ? 'That Purchase Was Already Refunded.'
            : `Refunded ${fmt(data.amount)} ${unitOf(data.currency || row.currency)} To ${row.buyerName || 'Member'}.`
        );
        await load();
        onLedgerChanged?.();
      } catch (err) {
        if (!attemptIsCurrent() || err?.name === 'AbortError') return;
        showStoreToast('error', marketplaceCopy(err?.message || 'The Refund Could Not Be Applied.'));
      } finally {
        if (refundAbortRef.current === controller && refundAttemptRef.current === attemptId) {
          refundAbortRef.current = null;
          refundingRef.current = false;
          setRefundingId(null);
        }
      }
    },
    [accountId, clubId, load, onLedgerChanged, snapshotOwned]
  );

  if (!open) {
    return (
      <div style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={shellStyles.clubAdminCreateAction}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          Purchase Ledger
        </button>
      </div>
    );
  }

  return (
    <ClubShopPurchaseLedgerView
      rows={rows}
      total={total}
      offset={offset}
      query={query}
      appliedQuery={appliedQuery}
      loading={loading}
      loaded={loaded}
      error={error}
      refundingId={refundingId}
      searching={searching}
      onQueryChange={setQuery}
      onRetry={load}
      onHide={() => setOpen(false)}
      onPrevious={() => setOffset(Math.max(0, offset - CLUB_SHOP_LEDGER_PAGE_SIZE))}
      onNext={() => setOffset(offset + CLUB_SHOP_LEDGER_PAGE_SIZE)}
      onRefund={refund}
    />
  );
}
