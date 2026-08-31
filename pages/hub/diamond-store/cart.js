/**
 * Shopping Cart Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Dedicated cart page for Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, CreditCard } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import toast from '../../../src/stores/toastStore';
import { supabase } from '../../../src/lib/supabase';
import { busEmit } from '../../../src/engine/EventBus';
import useCartStore from '../../../src/stores/cartStore';
import MerchPurchaseDialog from '../../../src/components/store/MerchPurchaseDialog';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';
import {
  clearCommerceRequestId,
  getOrCreateCommerceRequestId,
} from '../../../src/lib/store/checkoutIntentStore';
import { broadcastSync } from '../../../src/lib/broadcastSync';

// Legacy standalone key used by earlier versions of this page. It is folded
// into the shared zustand cart once and then removed.
const LEGACY_CART_KEY = 'diamond-store-cart';

const checkoutErrorMessage = (data, status) => {
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (status === 401) return 'Your Session Expired. Please Sign In Again.';
  if (status === 409) return 'This Checkout Is Already Being Finalized. Try Again In A Moment.';
  if (status === 429) return 'Too Many Checkout Attempts. Wait A Moment And Try Again.';
  return `Checkout Could Not Start (${status})`;
};

export default function ShoppingCart() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/cart');
  useTrainingBus('diamond-store-cart');

  // Cart CONTENTS live in the shared zustand store (persist key
  // 'smarter-poker-cart') — the same store the diamond-store page and the
  // floating cart drawer use. Supabase user_preferences.diamond_cart is only
  // cross-device persistence: it hydrates this store on load and mirrors it
  // on change.
  const cart = useCartStore((state) => state.items);
  const setCartItems = useCartStore((state) => state.setItems);
  const storeUpdateQuantity = useCartStore((state) => state.updateQuantity);
  const storeRemoveItem = useCartStore((state) => state.removeItem);
  const storeClearCart = useCartStore((state) => state.clearCart);
  const cartOwnerId = useCartStore((state) => state.ownerId);
  const setCartOwner = useCartStore((state) => state.setOwner);

  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [diamondBalance, setDiamondBalance] = useState(0);
  const [payWithDiamonds, setPayWithDiamonds] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingDiamondCheckout, setPendingDiamondCheckout] = useState(null);

  const hydratedRef = useRef(false);
  // JSON of the last cart known to match Supabase — prevents mirror loops
  const lastSyncedRef = useRef(null);
  // Timestamp of the last edit made in this tab — a realtime echo must not
  // stomp an edit the user just made here
  const lastLocalEditRef = useRef(0);
  const cartOwnerRef = useRef(null);
  const cartLoadRequestRef = useRef(0);

  const DIAMONDS_PER_DOLLAR = 100;

  // Real media query (inline-style '@media' keys are ignored by React)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (authChecking) return;
    const nextOwner = user?.id || 'guest';
    if (cartOwnerId !== nextOwner) {
      // A persisted browser cart is never allowed to cross an account
      // boundary. This also rejects ownerless/global carts from older builds
      // on the first authenticated mount, before any server mirroring occurs.
      setCartOwner(nextOwner);
      hydratedRef.current = false;
      lastSyncedRef.current = null;
      setHydrated(false);
    }
    cartOwnerRef.current = nextOwner;
    const requestId = ++cartLoadRequestRef.current;
    loadCart(undefined, nextOwner, requestId);
    return () => {
      if (cartLoadRequestRef.current === requestId) cartLoadRequestRef.current += 1;
    };
  }, [authChecking, cartOwnerId, setCartOwner, user?.id]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`dcart:${user?.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user?.id}` },
        () => {
          const requestId = ++cartLoadRequestRef.current;
          loadCart(undefined, user.id, requestId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          const requestId = ++cartLoadRequestRef.current;
          loadCart(undefined, user.id, requestId);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id]);

  // Read the pre-zustand standalone cart, if one is still lying around.
  const readLegacyLocalCart = () => {
    try {
      const raw = localStorage.getItem(LEGACY_CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
      return [];
    }
  };

  // Push a Supabase copy of the cart into the shared store. Local edits win
  // over a realtime echo that may already be stale.
  const isCurrentCartLoad = (ownerId, requestId) =>
    cartOwnerRef.current === ownerId
    && cartLoadRequestRef.current === requestId
    && useCartStore.getState().ownerId === ownerId;

  const applyRemoteCart = (remoteItems, ownerId, requestId) => {
    if (!isCurrentCartLoad(ownerId, requestId)) return;
    const remoteJson = JSON.stringify(remoteItems);
    const currentItems = useCartStore.getState().items;
    if (remoteJson === JSON.stringify(currentItems)) {
      lastSyncedRef.current = remoteJson;
      return;
    }
    if (hydratedRef.current && Date.now() - lastLocalEditRef.current < 3000) return;
    // First hydrate with items already in the shared store: keep them and let
    // the mirror effect push them up rather than silently discarding them.
    if (!hydratedRef.current && currentItems.length > 0) return;
    lastSyncedRef.current = remoteJson;
    setCartItems(remoteItems);
  };

  const loadCart = async (signal, ownerId = user?.id || 'guest', requestId = cartLoadRequestRef.current) => {
    try {
      // Cart contents come from the shared store; Supabase only hydrates it
      if (user?.id) {
        try {
          const { data: prefData } = await supabase
            .from('user_preferences')
            .select('preferences')
            .eq('user_id', user.id)
            .maybeSingle();
          const savedCart = prefData?.preferences?.diamond_cart;
          if (!isCurrentCartLoad(ownerId, requestId)) return;
          if (Array.isArray(savedCart)) {
            applyRemoteCart(savedCart, ownerId, requestId);
          } else if (!hydratedRef.current) {
            // No server cart yet — seed it from the shared store, or from
            // the legacy standalone cart if the store is empty.
            const storeItems = useCartStore.getState().items;
            const seed = storeItems.length > 0 ? storeItems : readLegacyLocalCart();
            if (seed.length > 0) {
              if (storeItems.length === 0) setCartItems(seed);
              // Only drop the legacy copy once the Supabase write succeeds
              const saved = await saveCart(seed);
              if (!isCurrentCartLoad(ownerId, requestId)) return;
              if (saved) {
                lastSyncedRef.current = JSON.stringify(seed);
                localStorage.removeItem(LEGACY_CART_KEY);
              }
            }
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      } else if (!hydratedRef.current) {
        // Signed out: fold any legacy standalone cart into the shared store
        const legacy = readLegacyLocalCart();
        if (legacy.length > 0 && useCartStore.getState().items.length === 0) {
          setCartItems(legacy);
          localStorage.removeItem(LEGACY_CART_KEY);
        }
      }

      if (!isCurrentCartLoad(ownerId, requestId)) return;

      hydratedRef.current = true;
      setHydrated(true);

      // Fetch diamond balance
      if (user?.id) {
        const token = getAccessToken();
        if (token) {
          const res = await fetch('/api/store/diamond-transactions?limit=1', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (data.success && isCurrentCartLoad(ownerId, requestId)) {
            setDiamondBalance(data.balance || 0);
          }
        }
      }

      if (isCurrentCartLoad(ownerId, requestId)) setLoading(false);
    } catch (error) {
      console.warn('Error loading cart:', error);
      if (isCurrentCartLoad(ownerId, requestId)) setLoading(false);
    }
  };

  // Persist the diamond_cart key without clobbering the rest of the
  // user's preferences JSON (read-merge-write). Returns true on success.
  const writeCartPreference = async (cartData) => {
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const merged = { ...(existing?.preferences || {}), diamond_cart: cartData };
    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        preferences: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    return { error };
  };

  // Mirror the cart to Supabase for cross-device persistence. Signed-out carts
  // are already persisted by the zustand store itself.
  const saveCart = async (cartData) => {
    if (!user?.id) return true;
    try {
      const { error: err_user_preferences_lt8v4 } = await writeCartPreference(cartData);
      if (err_user_preferences_lt8v4) {
        console.warn(
          '[Supabase] Silent mutation failed in user_preferences:',
          err_user_preferences_lt8v4.message
        );
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
      return false;
    }
  };

  // Cross-device mirror: whenever the shared cart changes, write it up.
  useEffect(() => {
    if (!hydrated || !user?.id) return;
    const json = JSON.stringify(cart);
    if (json === lastSyncedRef.current) return;
    lastSyncedRef.current = json;
    let cancelled = false;
    (async () => {
      const ok = await saveCart(cart);
      if (!ok && !cancelled) {
        // Let the next change retry instead of assuming the server matches
        lastSyncedRef.current = null;
        toast.error('Cart Could Not Be Saved On The Server');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, hydrated, user?.id]);

  const updateQuantity = (itemId, newQuantity) => {
    lastLocalEditRef.current = Date.now();
    if (newQuantity < 1) {
      storeRemoveItem(itemId);
      return;
    }
    storeUpdateQuantity(itemId, newQuantity);
  };

  const removeItem = (itemId) => {
    lastLocalEditRef.current = Date.now();
    storeRemoveItem(itemId);
  };

  const clearCart = () => {
    lastLocalEditRef.current = Date.now();
    storeClearCart();
  };

  // ═══ Cart grouping ═══
  // A Stripe checkout session is single-purpose: create-checkout-session.js
  // handles ONE type per session — 'diamonds' (any number of packages, each
  // up to MAX_DIAMOND_QUANTITY_PER_PACKAGE), 'subscription' (a server-resolved
  // Stripe price ID), or 'merchandise' (catalog/merch rows).
  // Sending a diamond package down the merchandise path is rejected as
  // "no longer available", and even if it were accepted the webhook's
  // merchandise branch never credits diamonds.
  const diamondItems = cart.filter((item) => item?.type === 'diamonds');
  const vipItems = cart.filter((item) => item?.type === 'vip');
  const merchItems = cart.filter((item) => item?.type !== 'diamonds' && item?.type !== 'vip');

  // Diamond packages can't be bought with diamonds — the purchase API only
  // deducts diamonds (no grant happens outside the Stripe webhook), so this
  // path would charge the user and deliver nothing.
  const hasDiamondItems = diamondItems.length > 0;
  const usingDiamonds = payWithDiamonds && !hasDiamondItems;
  const handlePaymentChoiceKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const choices = Array.from(
      event.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')
    );
    if (choices.length < 2) return;
    const currentIndex = Math.max(0, choices.indexOf(document.activeElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? choices.length - 1
          : (currentIndex + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
    event.preventDefault();
    choices[nextIndex].click();
    choices[nextIndex].focus();
  };

  // Integer-cent subtotal avoids IEEE-754 drift (e.g. 7 x $0.01 -> 0.07000000000000001)
  const subtotalCentsOf = (list) =>
    (list || []).reduce(
      (sum, item) =>
        sum + Math.round((Number(item?.price) || 0) * 100) * (Number(item?.quantity) || 0),
      0
    );

  const unitsOf = (list) => (list || []).reduce((n, item) => n + (Number(item?.quantity) || 0), 0);

  const getSubtotalCents = () => subtotalCentsOf(cart);

  // Card checkout settles one group per session; diamond packages first.
  // The 'diamonds' branch bills every package at its own quantity, so a
  // diamonds session covers ALL diamond packages in the cart. VIP and merch
  // stay behind for their own session.
  const cardGroup = hasDiamondItems ? 'diamonds' : merchItems.length > 0 ? 'merchandise' : null;
  const cardGroupUnits = cardGroup === 'diamonds' ? unitsOf(diamondItems) : unitsOf(merchItems);
  const deferredUnits = Math.max(unitsOf(cart) - cardGroupUnits, 0);
  const cardChargeCents =
    cardGroup === 'diamonds' ? subtotalCentsOf(diamondItems) : subtotalCentsOf(merchItems);

  const getSubtotal = () => {
    return getSubtotalCents() / 100;
  };

  // ESTIMATE ONLY. purchase-with-diamonds.js prices catalogued items from
  // merchandise_items.price_diamonds and only falls back to this 100-per-dollar
  // conversion for items it can't find in the catalog. The authoritative figure
  // is the diamonds_spent the server returns.
  const getDiamondCost = () => {
    return merchItems.reduce((total, item) => {
      const explicit = Number(item?.diamonds ?? item?.priceDiamonds ?? item?.price_diamonds);
      const perUnit = Number.isFinite(explicit) && explicit > 0
        ? Math.round(explicit)
        : Math.round((Number(item?.price) || 0) * DIAMONDS_PER_DOLLAR);
      return total + perUnit * (Number(item?.quantity) || 0);
    }, 0);
  };

  // Any item carrying an id may be priced from the catalog instead
  const diamondCostIsEstimate = merchItems.some((item) => (
    !Number.isFinite(Number(item?.diamonds ?? item?.priceDiamonds ?? item?.price_diamonds))
  ));

  const canAffordWithDiamonds = () => {
    return diamondBalance >= getDiamondCost();
  };

  const handleCheckout = async () => {
    if (checkingOut) return;
    const token = getAccessToken();
    if (!token || !user?.id) {
      toast.error('Please Sign In Again To Check Out');
      return;
    }

    // Build a single-purpose payload for this session
    let payload = null;
    if (cardGroup === 'diamonds') {
      // The store page adds diamond packages as `diamond-<packageId>`;
      // the server keys off the bare package id. Only the id and quantity
      // are sent — every price/diamond figure is resolved server-side.
      const lineItems = [];
      for (const pkg of diamondItems) {
        const packageId = String(pkg?.packageId || pkg?.id || '').replace(/^diamond-/, '');
        if (!packageId) {
          toast.error('This Diamond Package Is No Longer Available. Please Remove It.');
          return;
        }
        lineItems.push({
          id: packageId,
          packageId,
          name: pkg?.name,
          quantity: Math.max(1, Number(pkg?.quantity) || 1),
        });
      }
      payload = { type: 'diamonds', items: lineItems };
    } else if (cardGroup === 'merchandise') {
      payload = {
        type: 'merchandise',
        items: merchItems.map((item) => ({
          ...item,
          id: item.catalogId || item.id,
        })),
      };
    } else {
      toast.error('VIP Memberships Are Purchased From The Diamond Store Page.');
      return;
    }

    setCheckingOut(true);
    try {
      const commerceIntent = {
        scope: `cart-${cardGroup}`,
        userId: user.id,
        paymentMethod: 'card',
        intent: {
          type: payload.type,
          items: payload.items.map((item) => ({
            id: item.catalogId || item.id || item.packageId,
            variantId: item.variantId || item.variant_id || null,
            quantity: Math.max(1, Number(item.quantity) || 1),
          })),
        },
      };
      const checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      const res = await fetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(checkoutErrorMessage(data, res.status));
      }
      const url = data?.data?.url || data?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error('Checkout Session Missing Redirect URL');
    } catch (err) {
      // Stay on the cart so the user can retry — the button re-enables via finally
      toast.error(err.message || 'Checkout Unavailable. Please Try Again.');
    } finally {
      setCheckingOut(false);
    }
  };

  const beginDiamondCheckout = () => {
    if (checkingOut) return;
    if (!user?.id) {
      toast.error('Please Sign In Again To Check Out');
      return;
    }
    if (hasDiamondItems) {
      toast.error('Diamond Packages Cannot Be Purchased With Diamonds. Please Pay With Card.');
      return;
    }
    if (merchItems.length === 0) {
      toast.error('There Is Nothing In Your Cart That Can Be Paid For With Diamonds.');
      return;
    }
    const commerceIntent = {
      scope: 'cart-diamond-merch',
      userId: user.id,
      paymentMethod: 'diamonds',
      intent: {
        items: merchItems.map((item) => ({
          id: item.catalogId || item.id,
          variantId: item.variantId || item.variant_id || null,
          quantity: Math.max(1, Number(item.quantity) || 1),
        })),
      },
    };
    setPendingDiamondCheckout({
      product: {
        name: `${unitsOf(merchItems)} Merchandise ${unitsOf(merchItems) === 1 ? 'Item' : 'Items'}`,
      },
      variant: {
        label: `${merchItems.length} Product ${merchItems.length === 1 ? 'Type' : 'Types'} In This Shipment`,
      },
      quantity: unitsOf(merchItems),
      cost: getDiamondCost(),
      requiresShipping: true,
      commerceIntent,
      purchaseRequestId: getOrCreateCommerceRequestId(commerceIntent),
    });
  };

  const confirmDiamondCheckout = async (shipping) => {
    if (checkingOut || !pendingDiamondCheckout) return;

    const token = getAccessToken();
    if (!token) {
      toast.error('Please Sign In Again To Check Out');
      return;
    }

    setCheckingOut(true);
    try {
      const res = await fetch('/api/store/purchase-with-diamonds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': pendingDiamondCheckout.purchaseRequestId,
        },
        body: JSON.stringify({
          items: merchItems.map((item) => ({
            ...item,
            id: item.catalogId || item.id,
          })),
          shipping,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Prefer the server's own figures — the client estimate can differ
        // from merchandise_items.price_diamonds
        const required = data?.details?.required;
        if (typeof required === 'number') {
          const current = data?.details?.current ?? diamondBalance;
          setDiamondBalance(current);
          throw new Error(
            `Not Enough Diamonds. This Order Costs ${required.toLocaleString()} Diamonds And You Have ${current.toLocaleString()}.`
          );
        }
        throw new Error(checkoutErrorMessage(data, res.status));
      }

      if (data?.success) {
        // Drop the purchased lines first so a display hiccup can't leave
        // paid items in the cart. Anything not covered by this purchase
        // (e.g. VIP) stays put.
        lastLocalEditRef.current = Date.now();
        const purchasedIds = new Set(merchItems.map((item) => item?.id));
        setCartItems(useCartStore.getState().items.filter((item) => !purchasedIds.has(item?.id)));
        const result = data.data || {};
        const replayed = data.idempotent === true;
        const spent = result.diamonds_spent ?? 0;
        const newBalance = result.new_balance ?? diamondBalance;
        toast.success(
          replayed
            ? 'Order Already Placed. No Additional Diamonds Were Deducted.'
            : `Purchased With ${spent.toLocaleString()} Diamonds. New Balance: ${newBalance.toLocaleString()}.`
        );
        if (!replayed) busEmit.diamondsSpent(spent, 'Diamond Store Purchase');
        clearCommerceRequestId(pendingDiamondCheckout.commerceIntent);
        setDiamondBalance(newBalance);
        window.dispatchEvent(new CustomEvent('smarter-poker:diamond-balance', {
          detail: { balance: Number(newBalance) || 0, userId: user?.id, source: 'merch-cart' },
        }));
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        setPendingDiamondCheckout(null);
      } else {
        throw new Error(data?.error || 'Diamond purchase failed');
      }
    } catch (err) {
      toast.error(err.message || 'Diamond Purchase Failed');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <>
        <SEOHead
          title="Shopping Cart — Diamond Store"
          description="View And Manage Items In Your Diamond Store Shopping Cart."
          canonical="/hub/diamond-store/cart"
          noindex={true}
        />
        <main style={styles.loadingContainer} aria-busy="true" aria-label="Shopping Cart">
          <div style={styles.spinner} aria-hidden="true"></div>
          <p role="status" style={styles.loadingText}>Loading Cart...</p>
          <style>{`@keyframes dsSpin { to { transform: rotate(360deg); } }`}</style>
        </main>
      </>
    );
  }

  const diamondCost = getDiamondCost();
  const affordable = canAffordWithDiamonds();
  const itemCount = unitsOf(cart);

  return (
    <PageTransition>
      <SEOHead
        title="Shopping Cart — Diamond Store"
        description="View And Manage Items In Your Diamond Store Shopping Cart."
        canonical="/hub/diamond-store/cart"
        noindex={true}
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <MarketplaceSubpageShell
          active="cart"
          eyebrow="Marketplace Checkout"
          title="Your Cart"
          description="Review Your Stack, Confirm The Delivery Details, And Settle Every Eligible Merchandise Order With Card Or Diamonds."
        >
          {cart.length === 0 ? (
            <div style={styles.emptyState}>
              <h2 style={styles.emptyTitle}>Your Cart Is Empty</h2>
              <p style={styles.emptyText}>Add Some Items To Get Started!</p>
              <Link href="/hub/diamond-store" style={styles.shopButton}>
                Browse Store
              </Link>
            </div>
          ) : (
            <div
              style={{ ...styles.cartLayout, gridTemplateColumns: isMobile ? '1fr' : '1fr 400px' }}
            >
              {/* Cart Items */}
              <div style={styles.itemsSection}>
                <AnimatePresence>
                  {cart.map((item) => (
                    <CartItem
                      key={item.id}
                      {...item}
                      isMobile={isMobile}
                      onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </AnimatePresence>

                <button type="button" onClick={clearCart} style={styles.clearButton}>
                  Clear Cart
                </button>
              </div>

              {/* Summary */}
              <div style={styles.summarySection}>
                <h3 style={styles.summaryTitle}>Order Summary</h3>

                <div style={styles.summaryRow}>
                  <span>
                    Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                  </span>
                  <span>${getSubtotal().toFixed(2)}</span>
                </div>

                <div style={styles.summaryRow}>
                  <span>Tax</span>
                  <span>Calculated At Checkout</span>
                </div>

                <div style={styles.divider} />

                <div style={styles.totalRow}>
                  <span>Total</span>
                  <span>${getSubtotal().toFixed(2)}</span>
                </div>

                {/* Mixed cart — one purchase type per checkout session */}
                {!usingDiamonds && !cardGroup && (
                  <div style={styles.noticeBox}>
                    VIP memberships are purchased from the Diamond Store page, not from the cart.
                  </div>
                )}
                {!usingDiamonds && cardGroup && deferredUnits > 0 && (
                  <div style={styles.noticeBox}>
                    {cardGroup === 'diamonds'
                      ? `All diamond packages check out together for $${(cardChargeCents / 100).toFixed(2)}. The other ${deferredUnits} ${deferredUnits === 1 ? 'item stays' : 'items stay'} in your cart for a separate checkout.`
                      : `This checkout covers your merchandise ($${(cardChargeCents / 100).toFixed(2)}). The other ${deferredUnits} ${deferredUnits === 1 ? 'item stays' : 'items stay'} in your cart.`}
                  </div>
                )}
                {usingDiamonds && vipItems.length > 0 && (
                  <div style={styles.noticeBox}>
                    VIP memberships cannot be paid for with diamonds and will stay in your cart.
                  </div>
                )}

                {/* ═══ Payment Method Selection ═══ */}
                <div
                  role="radiogroup"
                  aria-labelledby="marketplace-payment-method-label"
                  onKeyDown={handlePaymentChoiceKeyDown}
                  style={{ marginBottom: '16px' }}
                >
                  <p
                    id="marketplace-payment-method-label"
                    style={{
                      fontSize: '13px',
                      color: '#9ca3af',
                      marginBottom: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Payment Method
                  </p>

                  {/* Pay with Diamonds Option — hidden when the cart holds diamond packages */}
                  {!hasDiamondItems && (
                    <button
                      type="button"
                      role="radio"
                      aria-label="Pay With Diamonds"
                      aria-checked={usingDiamonds}
                      tabIndex={usingDiamonds ? 0 : -1}
                      onClick={() => setPayWithDiamonds(true)}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: usingDiamonds
                          ? 'linear-gradient(135deg, rgba(0, 224, 255, 0.15), rgba(36, 96, 126, 0.15))'
                          : 'rgba(255, 255, 255, 0.03)',
                        border: usingDiamonds
                          ? '2px solid #00E0FF'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 0,
                        cursor: 'pointer',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Gem size={22} color="#00E0FF" aria-hidden="true" />
                        <div style={{ textAlign: 'left' }}>
                          <span
                            style={{
                              color: '#FFFFFF',
                              fontWeight: 600,
                              fontSize: '14px',
                              display: 'block',
                            }}
                          >
                            Pay with Diamonds
                          </span>
                          <span
                            style={{ color: affordable ? '#00E0FF' : '#FF6B6B', fontSize: '12px' }}
                          >
                            Balance: {diamondBalance.toLocaleString()}
                            {!affordable &&
                              ` (Need ${diamondCostIsEstimate ? 'about ' : ''}${diamondCost.toLocaleString()})`}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            color: usingDiamonds ? '#00E0FF' : '#FFFFFF',
                            fontWeight: 700,
                            fontSize: '16px',
                          }}
                        >
                          {diamondCostIsEstimate ? '~' : ''}
                          {diamondCost.toLocaleString()}
                        </span>
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: `2px solid ${usingDiamonds ? '#00E0FF' : 'rgba(255,255,255,0.3)'}`,
                            background: usingDiamonds ? '#00E0FF' : 'transparent',
                            marginLeft: 'auto',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {usingDiamonds && (
                            <span style={{ color: '#000', fontSize: '11px', fontWeight: 900 }}>
                              ✓
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Pay with Card Option */}
                  <button
                    type="button"
                    role="radio"
                    aria-label="Pay With Card"
                    aria-checked={!usingDiamonds}
                    tabIndex={!usingDiamonds ? 0 : -1}
                    onClick={() => setPayWithDiamonds(false)}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: !usingDiamonds
                        ? 'linear-gradient(135deg, rgba(0, 224, 255, 0.15), rgba(0, 153, 255, 0.15))'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: !usingDiamonds
                        ? '2px solid #00E0FF'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CreditCard size={22} color="#00E0FF" aria-hidden="true" />
                      <div style={{ textAlign: 'left' }}>
                        <span
                          style={{
                            color: '#FFFFFF',
                            fontWeight: 600,
                            fontSize: '14px',
                            display: 'block',
                          }}
                        >
                          Pay with Card
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                          Visa, Mastercard, Amex
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          color: !usingDiamonds ? '#00E0FF' : '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '16px',
                        }}
                      >
                        ${(cardChargeCents / 100).toFixed(2)}
                      </span>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: `2px solid ${!usingDiamonds ? '#00E0FF' : 'rgba(255,255,255,0.3)'}`,
                          background: !usingDiamonds ? '#00E0FF' : 'transparent',
                          marginLeft: 'auto',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {!usingDiamonds && (
                          <span style={{ color: '#000', fontSize: '11px', fontWeight: 900 }}>
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Checkout Button */}
                <button
                  type="button"
                  onClick={usingDiamonds ? beginDiamondCheckout : handleCheckout}
                  disabled={
                    checkingOut || (!usingDiamonds && !cardGroup)
                  }
                  style={{
                    ...styles.checkoutButton,
                    background: usingDiamonds
                      ? 'linear-gradient(135deg, #00E0FF, #446F86)'
                      : 'linear-gradient(135deg, #00E0FF, #0099FF)',
                    opacity:
                      checkingOut ||
                      (!usingDiamonds && !cardGroup)
                        ? 0.5
                        : 1,
                    cursor:
                      checkingOut ||
                      (!usingDiamonds && !cardGroup)
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {checkingOut
                    ? 'Processing...'
                    : usingDiamonds
                      ? diamondCostIsEstimate
                        ? `Pay With Diamonds (About ${diamondCost.toLocaleString()})`
                        : `Pay ${diamondCost.toLocaleString()} Diamonds`
                      : cardGroup === 'diamonds'
                        ? 'Checkout Diamond Package'
                        : 'Proceed To Checkout'}
                </button>

                {usingDiamonds && diamondCostIsEstimate && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#9ca3af',
                      textAlign: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    Final diamond cost is confirmed by the server at purchase.
                  </p>
                )}

                {usingDiamonds && !affordable && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#FF6B6B',
                      textAlign: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    Displayed cart pricing indicates a shortfall of {diamondCostIsEstimate ? 'about ' : ''}
                    {(diamondCost - diamondBalance).toLocaleString()} diamonds. You may continue;
                    the server will confirm the current catalog price before any debit.
                  </p>
                )}

                <Link href="/hub/diamond-store" style={styles.continueShoppingLink}>
                  ← Continue Shopping
                </Link>
              </div>
            </div>
          )}
        </MarketplaceSubpageShell>
      </div>
      {pendingDiamondCheckout && (
        <MerchPurchaseDialog
          purchase={pendingDiamondCheckout}
          balance={diamondBalance}
          busy={checkingOut}
          onCancel={() => !checkingOut && setPendingDiamondCheckout(null)}
          onConfirm={confirmDiamondCheckout}
        />
      )}
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function CartItem({ id, name, price, quantity, image, type, isMobile, onUpdateQuantity, onRemove }) {
  return (
    <motion.div
      style={{ ...styles.cartItem, ...(isMobile ? styles.cartItemMobile : {}) }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      layout
    >
      {image && (
        <img
          src={image}
          alt={name}
          style={{ ...styles.itemImage, ...(isMobile ? styles.itemImageMobile : {}) }}
          loading="lazy"
          decoding="async"
        />
      )}

      <div style={styles.itemDetails}>
        <h4 style={styles.itemName}>{name}</h4>
        <p style={styles.itemType}>{type}</p>
        <p style={styles.itemPrice}>${(Number(price) || 0).toFixed(2)}</p>
      </div>

      <div style={{ ...styles.itemActions, ...(isMobile ? styles.itemActionsMobile : {}) }}>
        <div style={styles.quantityControl}>
          <button
            type="button"
            aria-label={`Decrease Quantity Of ${name}`}
            onClick={() => onUpdateQuantity(quantity - 1)}
            style={styles.quantityButton}
          >
            −
          </button>
          <output aria-live="polite" style={styles.quantity}>
            {quantity}
          </output>
          <button
            type="button"
            aria-label={`Increase Quantity Of ${name}`}
            onClick={() => onUpdateQuantity(quantity + 1)}
            style={styles.quantityButton}
          >
            +
          </button>
        </div>

        <button type="button" onClick={onRemove} style={styles.removeButton}>
          Remove
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh',
    paddingBottom: 70,
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: '#000000',
    color: '#FFFFFF',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '32px',
  },
  cartLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '32px',
  },
  itemsSection: {
    display: 'grid',
    gap: '16px',
  },
  cartItem: {
    display: 'flex',
    gap: '16px',
    padding: '18px',
    background: 'linear-gradient(145deg, #172833, #050a0f 34%, #010305)',
    border: '1px solid #526f80',
    borderRadius: 0,
    boxShadow: 'inset 0 1px 0 rgba(235,251,255,0.38), inset 0 0 0 4px #03080c',
  },
  cartItemMobile: {
    flexWrap: 'wrap',
    gap: '12px',
    padding: '14px',
  },
  itemImage: {
    width: '100px',
    height: '100px',
    flexShrink: 0,
    objectFit: 'cover',
    borderRadius: 0,
  },
  itemImageMobile: { width: '72px', height: '72px' },
  itemDetails: {
    flex: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  itemName: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  itemType: {
    fontSize: '14px',
    color: '#9ca3af',
    marginBottom: '8px',
  },
  itemPrice: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#00E0FF',
  },
  itemActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'flex-end',
  },
  itemActionsMobile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 0,
    padding: '4px',
  },
  quantityButton: {
    // Keep one physical-pixel safety margin: a nominal 44 CSS px control can
    // resolve to 43.999px under mobile device scaling and miss the WCAG target.
    width: '45px',
    minWidth: '45px',
    height: '45px',
    minHeight: '45px',
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '18px',
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.2s',
  },
  quantity: {
    minWidth: '40px',
    textAlign: 'center',
    fontSize: '16px',
    fontWeight: 600,
  },
  removeButton: {
    padding: '6px 12px',
    minHeight: '44px',
    background: 'transparent',
    border: '1px solid rgba(255, 68, 68, 0.5)',
    color: '#FF4444',
    borderRadius: 0,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  clearButton: {
    padding: '12px 24px',
    background: 'transparent',
    border: '1px solid rgba(255, 68, 68, 0.5)',
    color: '#FF4444',
    borderRadius: 0,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '16px',
  },
  summarySection: {
    background: 'linear-gradient(160deg, #1c303b, #050a0f 30%, #010305)',
    border: '1px solid #607d8e',
    borderRadius: 0,
    padding: '24px',
    height: 'fit-content',
    position: 'sticky',
    top: '80px',
    boxShadow: 'inset 0 1px 0 rgba(236,251,255,0.46), inset 0 0 0 5px #03080c',
  },
  summaryTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '24px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
    fontSize: '14px',
    color: '#9ca3af',
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '16px 0',
  },
  noticeBox: {
    padding: '10px 12px',
    marginBottom: '16px',
    background: 'rgba(0, 224, 255, 0.08)',
    border: '1px solid rgba(0, 224, 255, 0.25)',
    borderRadius: 0,
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#9ca3af',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '24px',
  },
  checkoutButton: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 0,
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '16px',
  },
  continueShoppingLink: {
    display: 'block',
    textAlign: 'center',
    color: '#00E0FF',
    textDecoration: 'none',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 24px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  emptyText: {
    color: '#9ca3af',
    marginBottom: '32px',
  },
  shopButton: {
    display: 'inline-block',
    padding: '12px 32px',
    background: '#00E0FF',
    color: '#FFFFFF',
    borderRadius: 0,
    textDecoration: 'none',
    fontWeight: 600,
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    color: '#FFFFFF',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.15)',
    borderTopColor: '#00E0FF',
    borderRadius: '50%',
    animation: 'dsSpin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: '#9ca3af',
  },
};
