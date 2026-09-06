import Link from 'next/link';
import { useRouter } from 'next/router';
import { CreditCard, Gem, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import {
  clearCommerceRequestId,
  clearCommerceRequestById,
  getOrCreateCommerceRequestId,
} from '../../../src/lib/store/checkoutIntentStore';
import { broadcastSync } from '../../../src/lib/broadcastSync';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import { boundedCommerceFetch } from '../../../src/lib/store/boundedCommerceFetch';
import {
  getClubDiamondPurchaseProjection,
  getClubItemEffectivePrice,
  normalizeClubCardQuote,
} from '../../../src/lib/store/clubCardCheckout.mjs';

const CLUB_DETAIL_LOAD_TIMEOUT_MS = 20000;
const CLUB_CARD_REFRESH_CODES = new Set([
  'CHECKOUT_EXPIRED',
  'CARD_QUOTE_CHANGED',
  'CLUB_ITEM_PRICE_CHANGED',
  'CLUB_ITEM_PRICE_CONFIRMATION_REQUIRED',
  'CLUB_CARD_QUOTE_CONFIRMATION_REQUIRED',
]);

export default function ClubShopItemDetail() {
  const router = useRouter();
  const itemId = Array.isArray(router.query.itemId) ? router.query.itemId[0] : router.query.itemId;
  const requestedClubId = Array.isArray(router.query.clubId) ? router.query.clubId[0] : router.query.clubId;
  const checkoutSessionId = Array.isArray(router.query.session_id)
    ? router.query.session_id[0]
    : router.query.session_id;
  const [item, setItem] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [state, setState] = useState({ kind: 'loading', message: 'Loading verified club inventory…' });
  const [diamondReviewOpen, setDiamondReviewOpen] = useState(false);
  const [diamondPurchaseRequestId, setDiamondPurchaseRequestId] = useState(null);
  const [diamondCommerceIntent, setDiamondCommerceIntent] = useState(null);
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef(null);
  const processingRef = useRef(false);
  const diamondReviewTriggerRef = useRef(null);
  const diamondReviewTitleRef = useRef(null);
  const canonical = itemId ? `/hub/club-shop/${itemId}` : '/hub/club-shop';

  const loadItem = useCallback(async ({ preserveContext = false, completionMessage = '' } = {}) => {
    const requestId = ++loadRequestRef.current;
    loadAbortRef.current?.abort();
    const loadController = new AbortController();
    loadAbortRef.current = loadController;
    const loadTimer = window.setTimeout(() => {
      if (requestId !== loadRequestRef.current) return;
      loadRequestRef.current += 1;
      loadController.abort();
      setState({
        kind: 'error',
        message: 'Club inventory timed out. Retry the verified inventory request.',
      });
    }, CLUB_DETAIL_LOAD_TIMEOUT_MS);
    if (!preserveContext) {
      setItem(null);
      setClubId(null);
      setBalance(null);
      setState({ kind: 'loading', message: 'Loading verified club inventory…' });
    }
    try {
      const token = getAccessToken();
      if (!token) {
        setState({ kind: 'auth', message: 'Sign in to view club-specific inventory and purchase controls.' });
        return;
      }

      const params = new URLSearchParams();
      if (requestedClubId) params.set('clubId', requestedClubId);
      params.set('itemId', itemId);
      const response = await fetch(`/api/club-arena/marketplace-items?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: loadController.signal,
      });
      const body = await response.json().catch(() => null);
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Club inventory could not be loaded.');
      const targetClub = body.clubId || null;
      if (!targetClub) {
        setState({ kind: 'missing-club', message: 'Join a club to unlock its live equipment bay.' });
        return;
      }
      const match = (body.items || []).find((entry) => entry.id === itemId);
      if (!match) {
        setState({ kind: 'missing', message: 'This item is no longer active in the selected club.' });
        return;
      }
      setClubId(targetClub);
      setBalance(Number(body.balance) || 0);
      const listPrice = Number(match.price) || 0;
      const effectivePrice = Number.isFinite(Number(match.effective_price))
        ? Number(match.effective_price)
        : getClubItemEffectivePrice(listPrice, match.sale_price);
      setItem({
        ...match,
        name: marketplaceCopy(match.name),
        description: marketplaceCopy(match.description),
        category: marketplaceCopy(match.category),
        list_price: listPrice,
        price: effectivePrice,
        on_sale: match.on_sale === true || effectivePrice < listPrice,
        available: match.available === true,
        availability_reason: match.availability_reason || null,
        card_checkout_reason: match.card_checkout_reason || null,
        card_quote: normalizeClubCardQuote(match.card_quote),
      });
      setState(completionMessage
        ? { kind: 'complete', message: completionMessage }
        : {
            kind: 'ready',
            message: router.query.canceled === 'true'
              ? 'Card Checkout Canceled. Your Diamonds And Club Inventory Were Not Changed.'
              : 'Verified live club inventory.',
          });
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setState({ kind: 'error', message: error?.message || 'Club inventory could not be loaded.' });
    } finally {
      window.clearTimeout(loadTimer);
      if (loadAbortRef.current === loadController) loadAbortRef.current = null;
    }
  }, [itemId, requestedClubId, router.query.canceled]);

  useEffect(() => {
    if (!router.isReady || !itemId) return;
    void loadItem();
    return () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [itemId, loadItem, router.isReady]);

  useEffect(() => {
    if (diamondReviewOpen) diamondReviewTitleRef.current?.focus();
  }, [diamondReviewOpen]);

  const purchaseWithDiamonds = useCallback(async (target = item) => {
    if (processingRef.current) return;
    const token = getAccessToken();
    const targetClub = target?.clubId || target?.club_id || clubId;
    if (!token) {
      setState({ kind: 'auth', message: 'Sign In Again Before Authorizing A Diamond Purchase.' });
      return false;
    }
    if (!target || !targetClub) {
      setState({ kind: 'error', message: 'Verified club item context is unavailable. Reload inventory and try again.' });
      return false;
    }
    if (target.available !== true) {
      setState({ kind: 'error', message: 'This Item Is Not Available For Purchase.' });
      return false;
    }
    const diamondProjection = getClubDiamondPurchaseProjection(target.price, balance);
    if (Number(target.price) !== 0
      && (!diamondProjection || diamondProjection.hasDebt || diamondProjection.shortfall > 0)) {
      setState({ kind: 'error', message: 'Your Verified Diamond Balance Cannot Fund This Purchase.' });
      return false;
    }
    processingRef.current = true;
    setState({ kind: 'processing', message: 'Authorizing diamond wallet settlement…' });
    try {
      const response = await boundedCommerceFetch('/api/club-arena/marketplace-purchase', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': target.purchaseRequestId || diamondPurchaseRequestId,
        },
        body: JSON.stringify({
          clubId: targetClub,
          itemId: target.id,
          expectedPrice: Number(target.price),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        if (body?.reason === 'price_changed') {
          clearCommerceRequestId(diamondCommerceIntent);
          setDiamondPurchaseRequestId(null);
          setDiamondCommerceIntent(null);
          setDiamondReviewOpen(false);
          await loadItem();
        }
        setState({ kind: 'error', message: body?.error || 'Purchase could not be completed.' });
        return false;
      }
      setBalance(Number(body.newBalance) || 0);
      clearCommerceRequestId(diamondCommerceIntent);
      setDiamondReviewOpen(false);
      setDiamondPurchaseRequestId(null);
      setDiamondCommerceIntent(null);
      window.dispatchEvent(new CustomEvent('smarter-poker:diamond-balance', {
        detail: { balance: Number(body.newBalance) || 0, userId: getAuthUser()?.id, source: 'club-shop' },
      }));
      broadcastSync('smarter_poker_diamond_sync', 'refresh');
      setState({ kind: 'complete', message: `${target.name} is now in your club inventory.` });
      return true;
    } catch (error) {
      setState({ kind: 'error', message: error?.message || 'Purchase could not be completed.' });
      return false;
    } finally {
      processingRef.current = false;
    }
  }, [clubId, diamondCommerceIntent, diamondPurchaseRequestId, item, loadItem]);

  const purchaseWithCard = async () => {
    if (processingRef.current) return;
    const token = getAccessToken();
    const authUser = getAuthUser();
    const cardQuote = normalizeClubCardQuote(item?.card_quote);
    if (!token || !authUser?.id) {
      setState({ kind: 'auth', message: 'Sign in again before opening secure card checkout.' });
      return;
    }
    if (!item || !clubId) {
      setState({ kind: 'error', message: 'Verified club item context is unavailable. Reload inventory and try again.' });
      return;
    }
    if (item.available !== true) {
      setState({ kind: 'error', message: 'This Item Is Not Available For Purchase.' });
      return;
    }
    if (Number(balance) < 0) {
      setState({
        kind: 'error',
        message: 'Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above.',
      });
      return;
    }
    if (!cardQuote) {
      setState({ kind: 'error', message: 'Card Checkout Is Unavailable For This Item Price.' });
      return;
    }
    const commerceIntent = {
      scope: `club-detail-card-${item.id}`,
      userId: authUser.id,
      paymentMethod: 'card',
      intent: {
        clubId,
        itemId: item.id,
        expectedPrice: Number(item.price),
        expectedCardChargeCents: cardQuote.cardChargeCents,
      },
    };
    processingRef.current = true;
    setState({ kind: 'processing', message: 'Opening secure card checkout…' });
    try {
      const origin = window.location.origin;
      const response = await boundedCommerceFetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Checkout-Request-ID': getOrCreateCommerceRequestId(commerceIntent),
        },
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: cardQuote.packageId, quantity: cardQuote.quantity }],
          redemptionIntent: {
            kind: 'club_shop',
            clubId,
            itemId: item.id,
            expectedPrice: Number(item.price),
            expectedCardChargeCents: cardQuote.cardChargeCents,
          },
          successUrl: `${origin}${canonical}?clubId=${clubId}&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}${canonical}?clubId=${clubId}&canceled=true`,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || !body?.data?.url) {
        const checkoutError = new Error(
          body?.error?.message || 'Card Checkout Could Not Start.'
        );
        checkoutError.code = body?.error?.code || null;
        throw checkoutError;
      }
      window.location.href = body.data.url;
    } catch (error) {
      if (CLUB_CARD_REFRESH_CODES.has(error?.code)) {
        clearCommerceRequestId(commerceIntent);
        await loadItem();
      }
      setState({ kind: 'error', message: error?.message || 'Card checkout could not start.' });
    } finally {
      processingRef.current = false;
    }
  };

  useEffect(() => {
    // Stripe return verification is owner-scoped by the server and must not
    // depend on the catalog row or membership still being present. An item can
    // be hidden while Checkout is open; the paid return still needs a truthful
    // receipt and current wallet balance.
    if (!router.isReady || router.query.success !== 'true' || !checkoutSessionId) return;
    const token = getAccessToken();
    if (!token) {
      setState({ kind: 'auth', message: 'Sign in again to verify this card settlement.' });
      return;
    }
    let cancelled = false;
    let retryTimer = null;
    let wakeRetry = null;
    const cleanDetailPath = () => {
      const returnClubId = clubId || requestedClubId;
      return returnClubId
        ? `${canonical}?clubId=${encodeURIComponent(returnClubId)}`
        : canonical;
    };
    const verify = async () => {
      setState({ kind: 'processing', message: 'Verifying card settlement before granting the item…' });
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        try {
          const response = await boundedCommerceFetch(
            `/api/store/checkout-status?session_id=${encodeURIComponent(checkoutSessionId)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const body = await response.json().catch(() => null);
          if (response.ok && body?.data?.status === 'failed') {
            if (!cancelled) {
              const authUser = getAuthUser();
              if (authUser?.id && body.data?.requestId) {
                clearCommerceRequestById({
                  userId: authUser.id,
                  paymentMethod: 'card',
                  requestId: body.data.requestId,
                });
              }
              setState({
                kind: 'error',
                message: 'Card checkout expired or did not complete. No item was granted and your club inventory was not changed.',
              });
              await router.replace(cleanDetailPath(), undefined, { shallow: true });
            }
            return;
          }
          if (response.ok && body?.data?.status === 'complete') {
            if (!cancelled) {
              const authUser = getAuthUser();
              if (authUser?.id && body.data?.requestId) {
                clearCommerceRequestById({
                  userId: authUser.id,
                  paymentMethod: 'card',
                  requestId: body.data.requestId,
                });
              }
              const verifiedWalletBalance = Number(body.data?.walletBalance);
              if (Number.isFinite(verifiedWalletBalance)) {
                setBalance(verifiedWalletBalance);
                window.dispatchEvent(new CustomEvent('smarter-poker:diamond-balance', {
                  detail: {
                    balance: verifiedWalletBalance,
                    userId: authUser?.id,
                    source: 'checkout-status',
                  },
                }));
                broadcastSync('smarter_poker_diamond_sync', 'refresh');
              }
              if (body.data?.redemptionStatus === 'needs_review') {
                setState({
                  kind: 'error',
                  message: 'Your Card Payment And Diamond Funding Are Recorded, But This Item Was Not Purchased. Review The Updated Wallet And Current Item Price Before Finishing With Diamonds. Do Not Pay By Card Again.',
                });
                await router.replace(cleanDetailPath(), undefined, { shallow: true });
                return;
              }
              const completionMessage = `${body.data?.label || item?.name || 'Club Shop Item'} Purchased Successfully. Card Settlement And Inventory Delivery Are Complete.`;
              if (clubId && item) {
                await loadItem({ preserveContext: true, completionMessage });
              } else {
                setState({ kind: 'complete', message: completionMessage });
              }
              if (cancelled) return;
              await router.replace(cleanDetailPath(), undefined, { shallow: true });
            }
            return;
          }
          if (!response.ok && response.status !== 409) {
            throw new Error(body?.error || 'Card settlement verification failed.');
          }
        } catch (error) {
          if (attempt === 5 && !cancelled) {
            setState({ kind: 'error', message: error.message || 'Card settlement verification failed.' });
            return;
          }
        }
        await new Promise((resolve) => {
          wakeRetry = resolve;
          retryTimer = window.setTimeout(() => {
            wakeRetry = null;
            resolve();
          }, 1200);
        });
      }
      if (!cancelled) {
        setState({
          kind: 'error',
          message: 'Card settlement is still pending. Reload this page to resume the same purchase.',
        });
      }
    };
    void verify();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (wakeRetry) wakeRetry();
    };
  }, [canonical, checkoutSessionId, clubId, item, loadItem, requestedClubId, router, router.isReady, router.query.success]);

  const name = item?.name || 'Club Shop Equipment Record';
  const description = item?.description || state.message;
  const image = item?.image_url || '/images/store-v3/club-shop-hero.webp';
  const cardQuote = normalizeClubCardQuote(item?.card_quote);
  const diamondProjection = item
    ? getClubDiamondPurchaseProjection(item.price, balance)
    : null;
  const hasDiamondDebt = diamondProjection?.hasDebt === true;
  const cardCharge = cardQuote?.cardCharge ?? null;
  const cardDiamonds = cardQuote?.diamondsPurchased ?? null;
  const diamondPurchaseBalance = diamondProjection?.remainingBalance ?? null;
  const diamondShortfall = diamondProjection?.shortfall ?? null;
  const cardPurchaseBalance = cardQuote?.cardPurchaseBalance ?? null;
  const itemAvailable = item?.available === true;
  const isFreeItem = itemAvailable && Number(item?.price) === 0;
  const canPurchaseWithDiamonds = itemAvailable && (
    isFreeItem
    || (diamondProjection && !diamondProjection.hasDebt && diamondProjection.shortfall === 0)
  );
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={name}
      description={description}
      eyebrow={`${item?.category || 'Club Equipment'} / member inventory`}
      image={image}
      imageAlt={item ? `${item.name} club shop equipment` : 'Smarter.Poker futuristic club table'}
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Club Shop', href: '/hub/club-shop' },
        { label: name, href: canonical },
      ]}
      price={cardCharge}
      diamondPrice={item?.price}
      status={state.kind === 'ready' && itemAvailable ? 'Club Verified' : state.message}
      actions={item && state.kind !== 'auth' ? (
        <>
          <button
            ref={diamondReviewTriggerRef}
            type="button"
            onClick={() => {
              const authUser = getAuthUser();
              if (!authUser?.id) {
                setState({ kind: 'auth', message: 'Sign In Again Before Authorizing A Diamond Purchase.' });
                return;
              }
              const commerceIntent = {
                scope: `club-detail-${item.id}`,
                userId: authUser.id,
                paymentMethod: 'diamonds',
                intent: { clubId, itemId: item.id, expectedPrice: Number(item.price) },
              };
              setDiamondCommerceIntent(commerceIntent);
              setDiamondPurchaseRequestId(getOrCreateCommerceRequestId(commerceIntent));
              setDiamondReviewOpen(true);
            }}
            disabled={state.kind === 'processing' || !canPurchaseWithDiamonds}
          >
            <Gem size={16} aria-hidden="true" />
            {isFreeItem
              ? 'Review Free Claim'
              : canPurchaseWithDiamonds
                ? 'Review Diamond Purchase'
                : 'Diamond Purchase Unavailable'}
          </button>
          <button
            type="button"
            onClick={purchaseWithCard}
            disabled={state.kind === 'processing' || !itemAvailable || cardCharge == null}
          >
            <CreditCard size={16} aria-hidden="true" />
            {cardCharge == null
              ? isFreeItem
                ? 'No Card Charge Required'
                : hasDiamondDebt
                  ? 'Card Checkout Paused'
                  : 'Card Checkout Unavailable'
              : `Buy With Card: $${cardCharge.toFixed(2)}`}
          </button>
        </>
      ) : (
        <>
          {state.kind === 'auth' && (
            <Link href={`/auth/login?redirect=${encodeURIComponent(`${canonical}${requestedClubId ? `?clubId=${requestedClubId}` : ''}`)}`}>
              Sign In To Buy This Item
            </Link>
          )}
          {state.kind === 'error' && (
            <button type="button" onClick={() => void loadItem()}>
              Retry Live Inventory
            </button>
          )}
          <Link href="/hub/club-shop">{state.kind === 'loading' && <Loader2 size={16} aria-hidden="true" />} Return To Club Shop</Link>
        </>
      )}
      structuredData={schema}
      noindex
    >
      <div role="status" aria-live="polite" className={detailStyles.detailCard}>
        <h2>Live Purchase Console</h2>
        <p>{marketplaceCopy(state.message)}</p>
        {balance != null && <p>Verified Wallet Balance: <strong>{balance.toLocaleString()} Diamonds</strong>.</p>}
        {item && !itemAvailable && (
          <p role="alert">
            This Item Is Not Available For Purchase. Reload Live Inventory Before Trying Again.
          </p>
        )}
        {item?.on_sale && (
          <p>
            Sale Price: <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong>. Regular
            Price: <strong>{Number(item.list_price || 0).toLocaleString()} Diamonds</strong>.
          </p>
        )}
        {hasDiamondDebt && (
          <p role="alert">
            Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above. This Prevents
            A Paid Order From Failing Its Automatic Item Redemption.
          </p>
        )}
        {diamondProjection && diamondShortfall > 0 && (
          <p>
            A Diamond Purchase Needs <strong>{diamondShortfall.toLocaleString()} More Diamonds</strong>{' '}
            At The Verified Balance Above.
          </p>
        )}
        {diamondProjection && diamondShortfall === 0 && !isFreeItem && (
          <p>
            A Diamond Purchase Redeems <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong>{' '}
            And Leaves A Projected <strong>{diamondPurchaseBalance.toLocaleString()} Diamonds</strong>{' '}
            In Your Wallet Based On The Verified Balance Above.
          </p>
        )}
        {isFreeItem && (
          <p>
            This Item Is Free. Claiming It Does Not Change Your Diamond Wallet And Does Not Require A Card.
          </p>
        )}
        {cardQuote && (
          <p>
            Card Checkout Charges <strong>${cardCharge.toFixed(2)}</strong> For{' '}
            <strong>{cardDiamonds.toLocaleString()} New Diamonds</strong>, Redeems{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> For This Item, And
            Leaves A Projected <strong>{cardPurchaseBalance.toLocaleString()} Diamonds</strong> In Your
            Wallet Based On The Verified Balance Above.
          </p>
        )}
      </div>
      {item && diamondReviewOpen && (
        <section className={detailStyles.detailCard} aria-labelledby="club-diamond-review-title">
          <h2 id="club-diamond-review-title" ref={diamondReviewTitleRef} tabIndex={-1}>
            Confirm Diamond Purchase
          </h2>
          <p>
            {isFreeItem ? 'Claim' : 'Spend'}{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> On {marketplaceCopy(item.name)}?
            The Server Will Recheck Availability, Limits, Price, And Your Wallet Before Deducting Anything.
          </p>
          <div className={detailStyles.actions}>
            <button
              type="button"
              onClick={() => {
                setDiamondReviewOpen(false);
                setDiamondPurchaseRequestId(null);
                window.requestAnimationFrame(() => diamondReviewTriggerRef.current?.focus());
              }}
              disabled={state.kind === 'processing'}
            >
              Keep Shopping
            </button>
            <button
              type="button"
              onClick={() => purchaseWithDiamonds()}
              disabled={state.kind === 'processing' || !canPurchaseWithDiamonds}
            >
              {state.kind === 'processing'
                ? 'Authorizing…'
                : isFreeItem
                  ? 'Confirm Free Claim'
                  : `Confirm ${Number(item.price || 0).toLocaleString()} Diamonds`}
            </button>
          </div>
        </section>
      )}
    </MarketplaceDetailExperience>
  );
}
