import Link from 'next/link';
import { useRouter } from 'next/router';
import { CreditCard, Gem, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
  const canonical = itemId ? `/hub/club-shop/${itemId}` : '/hub/club-shop';

  const loadItem = useCallback(async () => {
    const authUser = getAuthUser() || (await ensureAuthReady(supabase));
    const token = getAccessToken();
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
    if (!response.ok || !body?.success) throw new Error(body?.error || 'Club inventory could not be loaded.');
    const match = (body.items || []).find((entry) => entry.id === itemId);
    if (!match) {
      setState({ kind: 'missing', message: 'This item is no longer active in the selected club.' });
      return;
    }
    setClubId(targetClub);
    setBalance(Number(body.balance) || 0);
    setItem({ ...match, price: Number(match.price) || 0 });
    setState({ kind: 'ready', message: 'Verified live club inventory.' });
  }, [itemId, requestedClubId]);

  useEffect(() => {
    if (!router.isReady || !itemId) return;
    loadItem().catch((error) => setState({ kind: 'error', message: error.message }));
  }, [itemId, loadItem, router.isReady]);

  const purchaseWithDiamonds = useCallback(async (target = item) => {
    const token = getAccessToken();
    const targetClub = target?.clubId || target?.club_id || clubId;
    if (!token || !target || !targetClub) return;
    setState({ kind: 'processing', message: 'Authorizing diamond wallet settlement…' });
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
    setState({ kind: 'complete', message: `${target.name} is now in your club inventory.` });
  }, [clubId, item]);

  const purchaseWithCard = async () => {
    const token = getAccessToken();
    const topUp = cardTopUpFor(item?.price);
    if (!token || !item || !clubId || !topUp) return;
    setState({ kind: 'processing', message: 'Opening secure card checkout…' });
    const pending = {
      ...item,
      clubId,
      purchaseRequestId: createCheckoutRequestId(`club-detail-card-redeem-${item.id}`),
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
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
      setState({ kind: 'error', message: body?.error?.message || 'Card checkout could not start.' });
      return;
    }
    window.location.href = body.data.url;
  };

  useEffect(() => {
    if (!router.isReady || router.query.success !== 'true' || !router.query.session_id) return;
    const token = getAccessToken();
    let pending = null;
    try {
      pending = JSON.parse(window.localStorage.getItem('smarter_poker_pending_club_detail_card_purchase') || 'null');
    } catch (_) {
      window.localStorage.removeItem('smarter_poker_pending_club_detail_card_purchase');
    }
    if (!token || !pending?.id || Number(pending.expiresAt) < Date.now()) return;
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
      price={item ? item.price / 100 : null}
      diamondPrice={item?.price}
      status={state.kind === 'ready' ? 'Club Verified' : state.message}
      actions={item ? (
        <>
          <button type="button" onClick={() => purchaseWithDiamonds()} disabled={state.kind === 'processing'}>
            <Gem size={16} aria-hidden="true" /> Buy With Diamonds
          </button>
          <button type="button" onClick={purchaseWithCard} disabled={state.kind === 'processing'}>
            <CreditCard size={16} aria-hidden="true" /> Buy With Card
          </button>
        </>
      ) : (
        <Link href="/hub/club-shop">{state.kind === 'loading' && <Loader2 size={16} aria-hidden="true" />} Return To Club Shop</Link>
      )}
      structuredData={schema}
    >
      <div role="status" aria-live="polite" className={detailStyles.detailCard}>
        <h2>Live Purchase Console</h2>
        <p>{state.message}</p>
        {balance != null && <p>Verified wallet balance: <strong>{balance.toLocaleString()} Diamonds</strong>.</p>}
        <p>Card purchases fund only the diamonds required for this item, then redeem it through the same idempotent club inventory endpoint used by direct wallet purchases.</p>
      </div>
    </MarketplaceDetailExperience>
  );
}
