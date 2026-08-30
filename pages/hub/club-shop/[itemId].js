import Link from 'next/link';
import { useRouter } from 'next/router';
import { CreditCard, Gem, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { ensureAuthReady, getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import { createCheckoutRequestId } from '../../../src/lib/store/storeAnalytics';
import supabase from '../../../src/lib/supabase';

const PACKAGE_OPTIONS = [
  { packageId: 'micro', diamonds: 100, price: 1 },
  { packageId: 'small', diamonds: 500, price: 5 },
  { packageId: 'medium', diamonds: 1000, price: 10 },
  { packageId: 'standard', diamonds: 2500, price: 25 },
  { packageId: 'large', diamonds: 5000, price: 50 },
  { packageId: 'value', diamonds: 10500, price: 100 },
  { packageId: 'premium', diamonds: 26250, price: 250 },
  { packageId: 'whale', diamonds: 52500, price: 500 },
];

function cardTopUpFor(priceInDiamonds) {
  const required = Math.max(1, Number(priceInDiamonds) || 0);
  return PACKAGE_OPTIONS
    .map((option) => ({ ...option, quantity: Math.ceil(required / option.diamonds) }))
    .filter((option) => option.quantity <= 10)
    .sort((a, b) => a.price * a.quantity - b.price * b.quantity)[0] || null;
}

export default function ClubShopItemDetail() {
  const router = useRouter();
  const itemId = Array.isArray(router.query.itemId) ? router.query.itemId[0] : router.query.itemId;
  const requestedClubId = Array.isArray(router.query.clubId) ? router.query.clubId[0] : router.query.clubId;
  const [item, setItem] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [state, setState] = useState({ kind: 'loading', message: 'Loading verified club inventory…' });
  const [diamondReviewOpen, setDiamondReviewOpen] = useState(false);
  const loadRequestRef = useRef(0);
  const processingRef = useRef(false);
  const diamondReviewTriggerRef = useRef(null);
  const diamondReviewTitleRef = useRef(null);
  const canonical = itemId ? `/hub/club-shop/${itemId}` : '/hub/club-shop';

  const loadItem = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setItem(null);
    setClubId(null);
    setBalance(null);
    setState({ kind: 'loading', message: 'Loading verified club inventory…' });
    try {
      const authUser = getAuthUser() || (await ensureAuthReady(supabase));
      const token = getAccessToken();
      if (requestId !== loadRequestRef.current) return;
      if (!authUser?.id || !token) {
        setState({ kind: 'auth', message: 'Sign in to view club-specific inventory and purchase controls.' });
        return;
      }
      let targetClub = requestedClubId;
      if (!targetClub) {
        const { data } = await supabase
          .from('club_members')
          .select('club_id')
          .eq('user_id', authUser.id)
          .limit(1)
          .maybeSingle();
        if (requestId !== loadRequestRef.current) return;
        targetClub = data?.club_id || null;
      }
      if (!targetClub) {
        setState({ kind: 'missing-club', message: 'Join a club to unlock its live equipment bay.' });
        return;
      }
      const response = await fetch(`/api/club-arena/marketplace-items?clubId=${encodeURIComponent(targetClub)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null);
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Club inventory could not be loaded.');
      const match = (body.items || []).find((entry) => entry.id === itemId);
      if (!match) {
        setState({ kind: 'missing', message: 'This item is no longer active in the selected club.' });
        return;
      }
      setClubId(targetClub);
      setBalance(Number(body.balance) || 0);
      setItem({ ...match, price: Number(match.price) || 0 });
      setState({
        kind: 'ready',
        message: router.query.canceled === 'true'
          ? 'Card checkout canceled. Your diamonds and club inventory were not changed.'
          : 'Verified live club inventory.',
      });
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setState({ kind: 'error', message: error?.message || 'Club inventory could not be loaded.' });
    }
  }, [itemId, requestedClubId, router.query.canceled]);

  useEffect(() => {
    if (!router.isReady || !itemId) return;
    void loadItem();
    return () => {
      loadRequestRef.current += 1;
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
      setState({ kind: 'auth', message: 'Sign in again before authorizing a diamond purchase.' });
      return;
    }
    if (!target || !targetClub) {
      setState({ kind: 'error', message: 'Verified club item context is unavailable. Reload inventory and try again.' });
      return;
    }
    processingRef.current = true;
    setState({ kind: 'processing', message: 'Authorizing diamond wallet settlement…' });
    try {
      const response = await fetch('/api/club-arena/marketplace-purchase', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': target.purchaseRequestId || createCheckoutRequestId(`club-detail-${target.id}`),
        },
        body: JSON.stringify({ clubId: targetClub, itemId: target.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        setState({ kind: 'error', message: body?.error || 'Purchase could not be completed.' });
        return;
      }
      window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
      setBalance(Number(body.newBalance) || 0);
      setDiamondReviewOpen(false);
      setState({ kind: 'complete', message: `${target.name} is now in your club inventory.` });
    } catch (error) {
      setState({ kind: 'error', message: error?.message || 'Purchase could not be completed.' });
    } finally {
      processingRef.current = false;
    }
  }, [clubId, item]);

  const purchaseWithCard = async () => {
    if (processingRef.current) return;
    const token = getAccessToken();
    const topUp = cardTopUpFor(item?.price);
    if (!token) {
      setState({ kind: 'auth', message: 'Sign in again before opening secure card checkout.' });
      return;
    }
    if (!item || !clubId) {
      setState({ kind: 'error', message: 'Verified club item context is unavailable. Reload inventory and try again.' });
      return;
    }
    if (!topUp) {
      setState({ kind: 'error', message: 'Card checkout is unavailable for this item price.' });
      return;
    }
    processingRef.current = true;
    setState({ kind: 'processing', message: 'Opening secure card checkout…' });
    const pending = {
      ...item,
      clubId,
      purchaseRequestId: createCheckoutRequestId(`club-detail-card-redeem-${item.id}`),
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    try {
      window.localStorage.setItem('smarter_poker_pending_club_detail_card_purchase', JSON.stringify(pending));
      const origin = window.location.origin;
      const response = await fetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Checkout-Request-ID': createCheckoutRequestId(`club-detail-card-${item.id}`),
        },
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: topUp.packageId, quantity: topUp.quantity }],
          successUrl: `${origin}${canonical}?clubId=${clubId}&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}${canonical}?clubId=${clubId}&canceled=true`,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || !body?.data?.url) {
        throw new Error(body?.error?.message || 'Card checkout could not start.');
      }
      window.location.href = body.data.url;
    } catch (error) {
      window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
      setState({ kind: 'error', message: error?.message || 'Card checkout could not start.' });
    } finally {
      processingRef.current = false;
    }
  };

  useEffect(() => {
    if (!router.isReady || router.query.canceled !== 'true') return;
    window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
  }, [router.isReady, router.query.canceled]);

  useEffect(() => {
    if (!router.isReady || router.query.success !== 'true' || !router.query.session_id) return;
    const token = getAccessToken();
    let pending = null;
    try {
      pending = JSON.parse(window.localStorage.getItem('smarter_poker_pending_club_detail_card_purchase') || 'null');
    } catch (_) {
      window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
    }
    if (!token) {
      setState({ kind: 'auth', message: 'Sign in again to verify this card settlement.' });
      return;
    }
    if (!pending?.id || Number(pending.expiresAt) < Date.now()) {
      window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
      setState({ kind: 'error', message: 'This card checkout return expired. No club item was redeemed.' });
      return;
    }
    setState({ kind: 'processing', message: 'Verifying card settlement before granting the item…' });
    fetch(`/api/store/checkout-status?session_id=${encodeURIComponent(router.query.session_id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || body?.data?.status !== 'complete') throw new Error('Card settlement is still pending.');
        router.replace(`${canonical}?clubId=${pending.clubId}`, undefined, { shallow: true });
        return purchaseWithDiamonds(pending);
      })
      .catch((error) => setState({ kind: 'error', message: error.message }));
  }, [canonical, purchaseWithDiamonds, router.isReady, router.query.session_id, router.query.success]);

  const name = item?.name || 'Club Shop Equipment Record';
  const description = item?.description || state.message;
  const image = item?.image_url || '/images/store-v3/club-shop-hero.webp';
  const cardTopUp = item ? cardTopUpFor(item.price) : null;
  const cardCharge = cardTopUp ? cardTopUp.price * cardTopUp.quantity : null;
  const cardDiamonds = cardTopUp ? cardTopUp.diamonds * cardTopUp.quantity : null;
  const cardRemainder = cardDiamonds == null || !item ? null : Math.max(0, cardDiamonds - item.price);
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
      status={state.kind === 'ready' ? 'Club Verified' : state.message}
      actions={item && state.kind !== 'auth' ? (
        <>
          <button ref={diamondReviewTriggerRef} type="button" onClick={() => setDiamondReviewOpen(true)} disabled={state.kind === 'processing'}>
            <Gem size={16} aria-hidden="true" /> Review Diamond Purchase
          </button>
          <button type="button" onClick={purchaseWithCard} disabled={state.kind === 'processing'}>
            <CreditCard size={16} aria-hidden="true" />
            {cardCharge == null ? 'Buy With Card' : `Buy With Card — $${cardCharge.toFixed(2)}`}
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
        <p>{state.message}</p>
        {balance != null && <p>Verified wallet balance: <strong>{balance.toLocaleString()} Diamonds</strong>.</p>}
        {cardTopUp && (
          <p>
            Card checkout charges <strong>${cardCharge.toFixed(2)}</strong> for{' '}
            <strong>{cardDiamonds.toLocaleString()} Diamonds</strong>, redeems{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> for this item, and
            leaves <strong>{cardRemainder.toLocaleString()} Diamonds</strong> in your wallet.
          </p>
        )}
      </div>
      {item && diamondReviewOpen && (
        <section className={detailStyles.detailCard} aria-labelledby="club-diamond-review-title">
          <h2 id="club-diamond-review-title" ref={diamondReviewTitleRef} tabIndex={-1}>
            Confirm Diamond Purchase
          </h2>
          <p>
            Spend <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> on {item.name}?
            The server will recheck availability, limits, price, and your wallet before deducting anything.
          </p>
          <div className={detailStyles.actions}>
            <button
              type="button"
              onClick={() => {
                setDiamondReviewOpen(false);
                window.requestAnimationFrame(() => diamondReviewTriggerRef.current?.focus());
              }}
              disabled={state.kind === 'processing'}
            >
              Keep Shopping
            </button>
            <button type="button" onClick={() => purchaseWithDiamonds()} disabled={state.kind === 'processing'}>
              {state.kind === 'processing' ? 'Authorizing…' : `Confirm ${Number(item.price || 0).toLocaleString()} Diamonds`}
            </button>
          </div>
        </section>
      )}
    </MarketplaceDetailExperience>
  );
}
