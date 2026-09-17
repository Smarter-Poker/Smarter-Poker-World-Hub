/**
 * Shopping Cart Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Dedicated cart page for Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth, getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import toast from '../../../src/stores/toastStore';
import { supabase } from '../../../src/lib/supabase';
import { busEmit } from '../../../src/engine/EventBus';
import useCartStore from '../../../src/stores/cartStore';
import MerchPurchaseDialog from '../../../src/components/store/MerchPurchaseDialog';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';
import {
  MarketplaceConsolePanel,
  MarketplaceConsoleStatusRow,
} from '../../../src/components/marketplace-console/MarketplaceConsole';
import cartStyles from './cart.module.css';
import {
  clearCommerceRequestId,
  getOrCreateCommerceRequestId,
  inspectCommerceRequestRecovery,
  replaceCommerceRequestId,
} from '../../../src/lib/store/checkoutIntentStore';
import {
  checkoutRequestReplacementRequired,
  diamondCheckoutOfferConfirmation,
  merchandiseCheckoutOfferConfirmation,
  merchandiseDiamondOfferConfirmation,
  normalizeVerifiedCheckoutSession,
} from '../../../src/lib/store/verifiedCheckoutUrl.mjs';
import { getVerifiedCheckoutAuthorization } from '../../../src/lib/store/checkoutAuthorization';
import { broadcastSync } from '../../../src/lib/broadcastSync';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import { boundedCommerceFetch } from '../../../src/lib/store/boundedCommerceFetch';
import { resolveReviewedMerchArt } from '../../../src/lib/store/merchProductArt';
import {
  classifyMerchDiamondPurchaseRefusal,
  normalizeVerifiedMerchDiamondPurchase,
} from '../../../src/lib/store/verifiedCommerceResponse.mjs';

// Legacy standalone key used by earlier versions of this page. It is folded
// into the shared zustand cart once and then removed.
const LEGACY_CART_KEY = 'diamond-store-cart';
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const REVIEWED_NON_MERCH_CART_IMAGE_PREFIXES = Object.freeze([
  '/images/store-v3/',
  '/images/vip/',
  '/images/diamond-store/',
]);

function resolveReviewedCartMedia(item) {
  const type = String(item?.type || '');
  const isMerchandise = type !== 'diamonds' && type !== 'vip';
  if (isMerchandise) {
    const lineId = String(item?.catalogId || item?.id || '');
    const catalogId = lineId.split('::')[0];
    const art = resolveReviewedMerchArt(catalogId);
    return art.reviewed
      ? { source: art.image, atlasPosition: art.atlasPosition }
      : { source: null, atlasPosition: null };
  }

  const source = typeof item?.image === 'string' ? item.image.trim() : '';
  const reviewed =
    source.startsWith('/') &&
    !source.startsWith('//') &&
    REVIEWED_NON_MERCH_CART_IMAGE_PREFIXES.some((prefix) => source.startsWith(prefix));
  return reviewed ? { source, atlasPosition: null } : { source: null, atlasPosition: null };
}

const checkoutErrorMessage = (data, status) => {
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (status === 401) return 'Your Session Expired. Please Sign In Again.';
  if (status === 409) return 'This Checkout Is Already Being Finalized. Try Again In A Moment.';
  if (status === 429) return 'Too Many Checkout Attempts. Wait A Moment And Try Again.';
  return `Checkout Could Not Start (${status})`;
};

function canonicalMerchCartLine(item) {
  const explicitCatalogId = String(item?.catalogId || '').trim();
  const rawId = String(item?.id || '').trim();
  const separatorIndex = rawId.indexOf('::');
  const legacyCatalogId = separatorIndex >= 0 ? rawId.slice(0, separatorIndex).trim() : rawId;
  const legacyVariantToken = separatorIndex >= 0 ? rawId.slice(separatorIndex + 2).trim() : '';
  const id = explicitCatalogId || legacyCatalogId;
  const variantId = String(item?.variantId || item?.variant_id || '').trim() || null;
  const quantity = Number(item?.quantity);
  if (
    !id ||
    id.length > 160 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10 ||
    (legacyVariantToken && legacyVariantToken !== 'standard' && !variantId)
  )
    return null;
  return { id, variantId, quantity };
}

export default function ShoppingCart() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/cart');
  useTrainingBus('diamond-store-cart');
  const synchronousAccountId = getAuthUser()?.id || null;

  // Cart CONTENTS live in the shared zustand store (persist key
  // 'smarter-poker-cart'): the same store the diamond-store page and the
  // floating cart drawer use. Supabase user_preferences.diamond_cart is only
  // cross-device persistence: it hydrates this store on load and mirrors it
  // on change.
  const cart = useCartStore((state) => state.items);
  const setCartItems = useCartStore((state) => state.setItems);
  const replaceCartFromServer = useCartStore((state) => state.replaceFromServer);
  const markCartSynced = useCartStore((state) => state.markSynced);
  const storeUpdateQuantity = useCartStore((state) => state.updateQuantity);
  const storeRemoveItem = useCartStore((state) => state.removeItem);
  const storeClearCart = useCartStore((state) => state.clearCart);
  const cartOwnerId = useCartStore((state) => state.ownerId);
  const setCartOwner = useCartStore((state) => state.setOwner);

  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [cartLoadError, setCartLoadError] = useState(null);
  const [diamondBalance, setDiamondBalance] = useState(0);
  const [payWithDiamonds, setPayWithDiamonds] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingDiamondCheckout, setPendingDiamondCheckout] = useState(null);

  const hydratedRef = useRef(false);
  // JSON of the last cart known to match Supabase: prevents mirror loops
  const lastSyncedRef = useRef(null);
  // Timestamp of the last edit made in this tab: a realtime echo must not
  // stomp an edit the user just made here
  const lastLocalEditRef = useRef(0);
  const cartOwnerRef = useRef(null);
  const cartLoadRequestRef = useRef(0);
  const diamondCheckoutAccountRef = useRef(user?.id || null);
  const diamondCheckoutAttemptRef = useRef(0);
  const diamondCheckoutAbortRef = useRef(null);
  const cardCheckoutAccountRef = useRef(user?.id || null);
  const cardCheckoutAttemptRef = useRef(0);
  const cardCheckoutAbortRef = useRef(null);
  const cardCheckoutProcessingRef = useRef(false);
  const checkoutMountedRef = useRef(true);
  // Serialize preference writes so an older, slower request can never finish
  // after a newer snapshot and leave the server with stale cart contents.
  const cartWriteChainRef = useRef(Promise.resolve(true));

  const DIAMONDS_PER_DOLLAR = 100;

  useIsomorphicLayoutEffect(() => {
    diamondCheckoutAccountRef.current = user?.id || null;
    cardCheckoutAccountRef.current = user?.id || null;
    diamondCheckoutAttemptRef.current += 1;
    cardCheckoutAttemptRef.current += 1;
    const invalidatedDiamondAttempt = !!diamondCheckoutAbortRef.current;
    const invalidatedCardAttempt = !!cardCheckoutAbortRef.current;
    diamondCheckoutAbortRef.current?.abort();
    diamondCheckoutAbortRef.current = null;
    cardCheckoutAbortRef.current?.abort();
    cardCheckoutAbortRef.current = null;
    cardCheckoutProcessingRef.current = false;
    setPendingDiamondCheckout(null);
    if (invalidatedDiamondAttempt || invalidatedCardAttempt) setCheckingOut(false);
    setDiamondBalance(0);
  }, [user?.id]);

  useEffect(() => {
    checkoutMountedRef.current = true;
    return () => {
      checkoutMountedRef.current = false;
      diamondCheckoutAttemptRef.current += 1;
      diamondCheckoutAbortRef.current?.abort();
      diamondCheckoutAbortRef.current = null;
      cardCheckoutAttemptRef.current += 1;
      cardCheckoutAbortRef.current?.abort();
      cardCheckoutAbortRef.current = null;
      cardCheckoutProcessingRef.current = false;
    };
  }, []);

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
    setCartLoadError(null);
    setLoading(true);
    cartOwnerRef.current = nextOwner;
    const requestId = ++cartLoadRequestRef.current;
    loadCart(undefined, nextOwner, requestId);
    return () => {
      if (cartLoadRequestRef.current === requestId) cartLoadRequestRef.current += 1;
    };
  }, [authChecking, cartOwnerId, setCartOwner, user?.id]);
  // Realtime subscription: live updates
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
    cartOwnerRef.current === ownerId &&
    cartLoadRequestRef.current === requestId &&
    useCartStore.getState().ownerId === ownerId;

  const applyRemoteCart = (remoteItems, ownerId, requestId) => {
    if (!isCurrentCartLoad(ownerId, requestId)) return;
    if (useCartStore.getState().syncPending) return;
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
    replaceCartFromServer(remoteItems);
  };

  const loadCart = async (
    signal,
    ownerId = user?.id || 'guest',
    requestId = cartLoadRequestRef.current
  ) => {
    try {
      // Cart contents come from the shared store; Supabase only hydrates it
      if (user?.id) {
        try {
          const { data: prefData, error: preferenceError } = await supabase
            .from('user_preferences')
            .select('preferences')
            .eq('user_id', user.id)
            .maybeSingle();
          if (preferenceError) throw preferenceError;
          const savedCart = prefData?.preferences?.diamond_cart;
          if (!isCurrentCartLoad(ownerId, requestId)) return;
          if (Array.isArray(savedCart)) {
            if (useCartStore.getState().syncPending) {
              const localItems = useCartStore.getState().items;
              const saved = await saveCart(localItems);
              if (!isCurrentCartLoad(ownerId, requestId)) return;
              if (
                saved &&
                JSON.stringify(useCartStore.getState().items) === JSON.stringify(localItems)
              ) {
                markCartSynced();
                lastSyncedRef.current = JSON.stringify(localItems);
              }
            } else {
              applyRemoteCart(savedCart, ownerId, requestId);
            }
          } else if (!hydratedRef.current) {
            // No server cart yet: seed it from the shared store, or from
            // the legacy standalone cart if the store is empty.
            const storeItems = useCartStore.getState().items;
            const seed = storeItems.length > 0 ? storeItems : readLegacyLocalCart();
            if (seed.length > 0) {
              if (storeItems.length === 0) setCartItems(seed);
              // Only drop the legacy copy once the Supabase write succeeds
              const saved = await saveCart(seed);
              if (!isCurrentCartLoad(ownerId, requestId)) return;
              if (saved) {
                if (JSON.stringify(useCartStore.getState().items) === JSON.stringify(seed)) {
                  markCartSynced();
                }
                lastSyncedRef.current = JSON.stringify(seed);
                localStorage.removeItem(LEGACY_CART_KEY);
              }
            }
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
          if (!isCurrentCartLoad(ownerId, requestId)) return;
          throw new Error(
            'Your Saved Cart Could Not Be Verified. Check Your Connection And Try Again.'
          );
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
      setCartLoadError(null);

      // Fetch diamond balance
      if (user?.id) {
        const token = getAccessToken();
        if (!token) {
          throw new Error('Your Wallet Session Could Not Be Verified. Sign In Again And Retry.');
        }
        const res = await fetch('/api/store/diamond-transactions?limit=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Wallet Verification Failed (${res.status})`);
        const data = await res.json();
        const verifiedBalance = Number(data?.balance);
        if (!data?.success || !Number.isSafeInteger(verifiedBalance) || verifiedBalance < 0) {
          throw new Error('Your Diamond Balance Could Not Be Verified. Try Again Before Checkout.');
        }
        if (isCurrentCartLoad(ownerId, requestId)) {
          setDiamondBalance(verifiedBalance);
        }
      }

      if (isCurrentCartLoad(ownerId, requestId)) setLoading(false);
    } catch (error) {
      console.warn('Error loading cart:', error);
      if (isCurrentCartLoad(ownerId, requestId)) {
        setCartLoadError({
          ownerId,
          message:
            error?.message ||
            'Your Cart Could Not Be Verified. Check Your Connection And Try Again.',
        });
        setLoading(false);
      }
    }
  };

  const retryCartLoad = () => {
    const ownerId = getAuthUser()?.id || 'guest';
    if (user?.id && user.id !== ownerId) return;
    if (cartOwnerRef.current !== ownerId || useCartStore.getState().ownerId !== ownerId) return;
    const requestId = ++cartLoadRequestRef.current;
    setCartLoadError(null);
    setLoading(true);
    void loadCart(undefined, ownerId, requestId);
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
    const write = cartWriteChainRef.current.catch(() => false).then(() => saveCart(cart));
    cartWriteChainRef.current = write;
    (async () => {
      const ok = await write;
      if (ok && !cancelled && JSON.stringify(useCartStore.getState().items) === json) {
        markCartSynced();
      } else if (!ok && !cancelled) {
        // Let the next change retry instead of assuming the server matches
        lastSyncedRef.current = null;
        toast.error('Cart Could Not Be Saved On The Server');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, hydrated, markCartSynced, user?.id]);

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
  // handles ONE type per session: 'diamonds' (any number of packages, each
  // up to MAX_DIAMOND_QUANTITY_PER_PACKAGE), 'subscription' (a server-resolved
  // Stripe price ID), or 'merchandise' (catalog/merch rows).
  // Sending a diamond package down the merchandise path is rejected as
  // "no longer available", and even if it were accepted the webhook's
  // merchandise branch never credits diamonds.
  // The persisted Zustand cart can still contain the previous account's
  // snapshot during the render immediately before the owner-reset effect.
  // Never paint, price, or submit that private snapshot for a replacement
  // account. The raw cart remains available to the persistence effects above,
  // which replace it with the current owner's authoritative cart.
  // The synchronous session source changes before React context can finish a
  // replacement-account render. Project private cart state against that
  // source so account A cannot remain visible for a frame under account B.
  const expectedCartOwnerId = synchronousAccountId || 'guest';
  const visibleCart = !authChecking && cartOwnerId === expectedCartOwnerId && hydrated ? cart : [];
  const projectedCartLoadError =
    cartLoadError?.ownerId === expectedCartOwnerId ? cartLoadError.message : null;
  const diamondItems = visibleCart.filter((item) => item?.type === 'diamonds');
  const vipItems = visibleCart.filter((item) => item?.type === 'vip');
  const merchItems = visibleCart.filter(
    (item) => item?.type !== 'diamonds' && item?.type !== 'vip'
  );

  // Diamond packages can't be bought with diamonds: the purchase API only
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
          : (currentIndex +
              (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) +
              choices.length) %
            choices.length;
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

  const getSubtotalCents = () => subtotalCentsOf(visibleCart);

  // Card checkout settles one group per session; diamond packages first.
  // The 'diamonds' branch bills every package at its own quantity, so a
  // diamonds session covers ALL diamond packages in the cart. VIP and merch
  // stay behind for their own session.
  const cardGroup = hasDiamondItems ? 'diamonds' : merchItems.length > 0 ? 'merchandise' : null;
  const cardGroupUnits = cardGroup === 'diamonds' ? unitsOf(diamondItems) : unitsOf(merchItems);
  const deferredUnits = Math.max(unitsOf(visibleCart) - cardGroupUnits, 0);
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
      const perUnit =
        Number.isFinite(explicit) && explicit > 0
          ? Math.round(explicit)
          : Math.round((Number(item?.price) || 0) * DIAMONDS_PER_DOLLAR);
      return total + perUnit * (Number(item?.quantity) || 0);
    }, 0);
  };

  // Any item carrying an id may be priced from the catalog instead
  const diamondCostIsEstimate = merchItems.some(
    (item) =>
      !Number.isFinite(Number(item?.diamonds ?? item?.priceDiamonds ?? item?.price_diamonds))
  );

  const canAffordWithDiamonds = () => {
    return diamondBalance >= getDiamondCost();
  };

  const handleCheckout = async () => {
    if (checkingOut || cardCheckoutProcessingRef.current) return;
    const expectedAccountId = user?.id;
    if (!expectedAccountId) {
      toast.error('Please Sign In Again To Check Out');
      return;
    }

    // Build a single-purpose payload for this session
    let payload = null;
    if (cardGroup === 'diamonds') {
      // The store page adds diamond packages as `diamond-<packageId>`;
      // the server keys off the bare package id. Only the id and quantity
      // are sent: every price/diamond figure is resolved server-side.
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
      const verifiedLines = merchItems.map(canonicalMerchCartLine);
      if (verifiedLines.some((line) => !line)) {
        toast.error('A Merchandise Option Could Not Be Verified. Remove It And Add It Again.');
        return;
      }
      payload = {
        type: 'merchandise',
        items: merchItems.map((item, index) => ({
          ...item,
          id: verifiedLines[index].id,
          variantId: verifiedLines[index].variantId,
          quantity: verifiedLines[index].quantity,
        })),
      };
    } else {
      toast.error('VIP Memberships Are Purchased From The Diamond Store Page.');
      return;
    }

    const buildOfferForItems = (items) =>
      cardGroup === 'diamonds'
        ? diamondCheckoutOfferConfirmation(
            expectedAccountId,
            items.map((item) => ({
              packageId: item.packageId || item.id,
              quantity: Math.max(1, Number(item.quantity) || 1),
              unitCents: Number.isSafeInteger(item.priceCents)
                ? item.priceCents
                : Math.round(Number(item.price || 0) * 100),
              diamonds: Number(item.baseDiamonds ?? item.diamonds),
              bonus: Number(item.bonusDiamonds ?? item.bonus ?? 0),
            }))
          )
        : (() => {
            const verifiedLines = items.map(canonicalMerchCartLine);
            if (verifiedLines.some((line) => !line)) return null;
            return merchandiseCheckoutOfferConfirmation(
              expectedAccountId,
              items.map((item, index) => ({
                id: verifiedLines[index].id,
                variantId: verifiedLines[index].variantId,
                quantity: verifiedLines[index].quantity,
                price: Number(item.price),
              }))
            );
          })();
    const offerConfirmation = buildOfferForItems(
      cardGroup === 'diamonds' ? diamondItems : merchItems
    );
    if (!offerConfirmation) {
      toast.error('The Current Cart Offer Could Not Be Verified. Review The Cart And Try Again.');
      return;
    }
    payload.offerConfirmation = offerConfirmation;

    const commerceIntent = {
      scope: `cart-${cardGroup}`,
      userId: expectedAccountId,
      paymentMethod: 'card',
      intent: {
        type: payload.type,
        items: payload.items.map((item) => ({
          id: item.id || item.packageId,
          variantId: item.variantId || null,
          quantity: item.quantity,
        })),
      },
    };
    let checkoutRequestId = null;
    const attemptId = ++cardCheckoutAttemptRef.current;
    cardCheckoutAbortRef.current?.abort();
    const controller = new AbortController();
    cardCheckoutAbortRef.current = controller;
    cardCheckoutProcessingRef.current = true;
    const attemptIsCurrent = () =>
      checkoutMountedRef.current &&
      !controller.signal.aborted &&
      cardCheckoutAttemptRef.current === attemptId &&
      cardCheckoutAccountRef.current === expectedAccountId &&
      getAuthUser()?.id === expectedAccountId;
    setCheckingOut(true);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      const currentCart = useCartStore.getState();
      const currentGroupItems =
        cardGroup === 'diamonds'
          ? currentCart.items.filter((item) => item?.type === 'diamonds')
          : currentCart.items.filter((item) => item?.type !== 'diamonds' && item?.type !== 'vip');
      const currentOffer = buildOfferForItems(currentGroupItems);
      if (
        !authorization ||
        !attemptIsCurrent() ||
        currentCart.ownerId !== expectedAccountId ||
        JSON.stringify(currentOffer) !== JSON.stringify(offerConfirmation)
      ) {
        throw new Error('Your Account Or Cart Changed. Review This Purchase Again.');
      }
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      const res = await boundedCommerceFetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorization.accessToken}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!attemptIsCurrent()) return;
      if (!res.ok) {
        const checkoutError = new Error(checkoutErrorMessage(data, res.status));
        checkoutError.code = data?.error?.code || null;
        throw checkoutError;
      }
      const checkoutSession = normalizeVerifiedCheckoutSession(
        data,
        checkoutRequestId,
        offerConfirmation
      );
      if (!checkoutSession) {
        throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
      }
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      const latestCart = useCartStore.getState();
      const latestGroupItems =
        cardGroup === 'diamonds'
          ? latestCart.items.filter((item) => item?.type === 'diamonds')
          : latestCart.items.filter((item) => item?.type !== 'diamonds' && item?.type !== 'vip');
      if (
        !confirmedAuthorization ||
        !attemptIsCurrent() ||
        latestCart.ownerId !== expectedAccountId ||
        JSON.stringify(buildOfferForItems(latestGroupItems)) !== JSON.stringify(offerConfirmation)
      ) {
        throw new Error('Your Account Or Cart Changed. The Checkout Link Was Not Opened.');
      }
      if (!attemptIsCurrent()) return;
      window.location.assign(checkoutSession.url);
      return;
    } catch (err) {
      if (err?.name === 'AbortError' || !attemptIsCurrent()) return;
      if (checkoutRequestReplacementRequired(err) && checkoutRequestId) {
        try {
          replaceCommerceRequestId({ ...commerceIntent, expectedRequestId: checkoutRequestId });
        } catch (replacementError) {
          err = replacementError;
        }
      }
      // Stay on the cart so the user can retry: the button re-enables via finally
      toast.error(err.message || 'Checkout Unavailable. Please Try Again.');
    } finally {
      if (
        cardCheckoutAbortRef.current === controller &&
        cardCheckoutAttemptRef.current === attemptId
      ) {
        cardCheckoutAbortRef.current = null;
        cardCheckoutProcessingRef.current = false;
        setCheckingOut(false);
      }
    }
  };

  const beginDiamondCheckout = () => {
    if (checkingOut) return;
    const authUser = getAuthUser();
    if (!authUser?.id || authUser.id !== user?.id) {
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
    const verifiedLines = merchItems.map(canonicalMerchCartLine);
    if (verifiedLines.some((line) => !line)) {
      toast.error('A Merchandise Option Could Not Be Verified. Remove It And Add It Again.');
      return;
    }
    const purchaseItems = merchItems.map((item, index) => ({
      ...item,
      id: verifiedLines[index].id,
      variantId: verifiedLines[index].variantId,
      quantity: verifiedLines[index].quantity,
    }));
    const reviewedDiamondLines = purchaseItems.map((item) => {
      const explicit = Number(item?.diamonds ?? item?.priceDiamonds ?? item?.price_diamonds);
      const unitDiamonds =
        Number.isFinite(explicit) && explicit > 0
          ? Math.round(explicit)
          : Math.round((Number(item?.price) || 0) * DIAMONDS_PER_DOLLAR);
      return {
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitDiamonds,
      };
    });
    const offerConfirmation = merchandiseDiamondOfferConfirmation(
      authUser.id,
      reviewedDiamondLines
    );
    const reviewedCost = getDiamondCost();
    if (!offerConfirmation || offerConfirmation.totalDiamonds !== reviewedCost) {
      toast.error('The Current Diamond Price Could Not Be Verified. Review The Cart Again.');
      return;
    }
    const commerceIntent = {
      scope: 'cart-diamond-merch',
      userId: authUser.id,
      paymentMethod: 'diamonds',
      intent: {
        items: purchaseItems.map((item) => ({
          id: item.id,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      },
    };
    let recovery;
    let purchaseRequestId;
    try {
      recovery = inspectCommerceRequestRecovery(commerceIntent);
      if (recovery.status === 'terms-changed') {
        throw new Error(
          'An Earlier Protected Purchase Uses Different Cart Terms. Verify It Before Starting Another.'
        );
      }
      const purchaseWasResumed = recovery.status === 'recoverable';
      purchaseRequestId = purchaseWasResumed
        ? recovery.requestId
        : getOrCreateCommerceRequestId(commerceIntent);
      if (!purchaseRequestId) {
        throw new Error('Secure Purchase Recovery Could Not Verify The Protected Request.');
      }
      setPendingDiamondCheckout({
        product: {
          name: `${unitsOf(merchItems)} Merchandise ${unitsOf(merchItems) === 1 ? 'Item' : 'Items'}`,
        },
        variant: {
          label: `${merchItems.length} Product ${merchItems.length === 1 ? 'Type' : 'Types'} In This Shipment`,
        },
        quantity: unitsOf(merchItems),
        cost: reviewedCost,
        requiresShipping: true,
        items: purchaseItems,
        commerceIntent,
        purchaseRequestId,
        purchaseWasResumed,
        offerConfirmation,
      });
    } catch (error) {
      toast.error(error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.');
      return;
    }
  };

  const confirmDiamondCheckout = async (shipping) => {
    if (checkingOut || !pendingDiamondCheckout) return;

    const expectedAccountId = pendingDiamondCheckout.commerceIntent?.userId || null;
    const purchaseWasResumed = pendingDiamondCheckout.purchaseWasResumed === true;
    const authUser = getAuthUser();
    if (!expectedAccountId || !authUser?.id) {
      toast.error('Please Sign In Again To Check Out');
      return;
    }
    if (
      authUser.id !== expectedAccountId ||
      diamondCheckoutAccountRef.current !== expectedAccountId ||
      useCartStore.getState().ownerId !== expectedAccountId
    ) {
      setPendingDiamondCheckout(null);
      toast.error('Your Signed-In Account Changed. Review This Purchase Again.');
      return;
    }

    const attemptId = ++diamondCheckoutAttemptRef.current;
    diamondCheckoutAbortRef.current?.abort();
    const controller = new AbortController();
    diamondCheckoutAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      diamondCheckoutAttemptRef.current === attemptId &&
      diamondCheckoutAccountRef.current === expectedAccountId &&
      getAuthUser()?.id === expectedAccountId &&
      useCartStore.getState().ownerId === expectedAccountId;

    setCheckingOut(true);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!authorization || !attemptIsCurrent()) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      const durableRequestId = getOrCreateCommerceRequestId(pendingDiamondCheckout.commerceIntent);
      if (durableRequestId !== pendingDiamondCheckout.purchaseRequestId) {
        setPendingDiamondCheckout((current) =>
          current?.commerceIntent === pendingDiamondCheckout.commerceIntent
            ? { ...current, purchaseRequestId: durableRequestId, purchaseWasResumed: true }
            : current
        );
        throw new Error('Secure Purchase Recovery Was Refreshed. Review And Confirm Again.');
      }
      setPendingDiamondCheckout((current) =>
        current?.commerceIntent === pendingDiamondCheckout.commerceIntent
          ? { ...current, purchaseWasResumed: true }
          : current
      );
      const res = await boundedCommerceFetch('/api/store/purchase-with-diamonds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorization.accessToken}`,
          'X-Idempotency-Key': durableRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          items: pendingDiamondCheckout.items,
          offerConfirmation: pendingDiamondCheckout.offerConfirmation,
          shipping,
        }),
      });

      const data = await res.json().catch(() => null);
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!confirmedAuthorization || !attemptIsCurrent()) {
        throw new Error(
          'Your Signed-In Account Changed. The Original Purchase Still Needs Verification.'
        );
      }
      if (!res.ok || !data?.success) {
        const refusal = classifyMerchDiamondPurchaseRefusal(res.status, data, {
          accountId: expectedAccountId,
          requestId: durableRequestId,
        });
        if (refusal.definitive && !purchaseWasResumed) {
          try {
            const replacementRequestId = replaceCommerceRequestId({
              ...pendingDiamondCheckout.commerceIntent,
              expectedRequestId: durableRequestId,
            });
            setPendingDiamondCheckout((current) =>
              current?.commerceIntent === pendingDiamondCheckout.commerceIntent
                ? {
                    ...current,
                    purchaseRequestId: replacementRequestId,
                    purchaseWasResumed: false,
                  }
                : current
            );
          } catch (persistenceError) {
            setPendingDiamondCheckout(null);
            throw persistenceError;
          }
        }
        // Prefer the server's own figures: the client estimate can differ
        // from merchandise_items.price_diamonds
        const required = data?.details?.required;
        if (typeof required === 'number') {
          const current = data?.details?.current;
          if (Number.isSafeInteger(current) && current >= 0) setDiamondBalance(current);
          throw new Error(
            `Not Enough Diamonds. This Order Costs ${required.toLocaleString()} Diamonds${Number.isSafeInteger(current) ? ` And You Have ${current.toLocaleString()}` : ''}.`
          );
        }
        throw new Error(checkoutErrorMessage(data, res.status));
      }

      const verifiedPurchase = normalizeVerifiedMerchDiamondPurchase(data, {
        accountId: expectedAccountId,
        requestId: durableRequestId,
        units: pendingDiamondCheckout.quantity,
        diamondsSpent: pendingDiamondCheckout.cost,
        items: pendingDiamondCheckout.items,
      });
      if (verifiedPurchase) {
        const recoveryRetired = clearCommerceRequestId({
          ...pendingDiamondCheckout.commerceIntent,
          expectedRequestId: durableRequestId,
        });
        // Drop the purchased lines first so a display hiccup can't leave
        // paid items in the cart. Anything not covered by this purchase
        // (e.g. VIP) stays put.
        lastLocalEditRef.current = Date.now();
        const purchasedIdentities = new Set(
          pendingDiamondCheckout.items.map((item) => `${item.id}\u0000${item.variantId || ''}`)
        );
        setCartItems(
          useCartStore
            .getState()
            .items.filter(
              (item) =>
                !purchasedIdentities.has(
                  `${item.catalogId || item.id}\u0000${item.variantId || item.variant_id || ''}`
                )
            )
        );
        const replayed = verifiedPurchase.idempotent;
        const spent = verifiedPurchase.diamondsSpent;
        const newBalance = verifiedPurchase.newBalance;
        if (recoveryRetired) {
          toast.success(
            replayed
              ? 'Order Already Placed. No Additional Diamonds Were Deducted.'
              : `Purchased With ${spent.toLocaleString()} Diamonds. New Balance: ${newBalance.toLocaleString()}.`
          );
        } else {
          toast.warning(
            'Order Was Placed And Your Balance Was Updated, But Secure Purchase Recovery Could Not Be Cleared. Do Not Submit This Purchase Again.'
          );
        }
        if (!replayed) busEmit.diamondsSpent(spent, 'Diamond Store Purchase');
        setDiamondBalance(newBalance);
        window.dispatchEvent(
          new CustomEvent('smarter-poker:diamond-balance', {
            detail: { balance: newBalance, userId: expectedAccountId, source: 'merch-cart' },
          })
        );
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        setPendingDiamondCheckout(null);
      } else {
        throw new Error(
          'Purchase Status Is Uncertain. Confirm Again To Verify The Original Order.'
        );
      }
    } catch (err) {
      if (!attemptIsCurrent()) return;
      toast.error(err.message || 'Diamond Purchase Failed');
    } finally {
      if (diamondCheckoutAbortRef.current === controller) {
        diamondCheckoutAbortRef.current = null;
        setCheckingOut(false);
      }
    }
  };

  if (
    (loading || authChecking || !hydrated || cartOwnerId !== expectedCartOwnerId) &&
    !projectedCartLoadError
  ) {
    return (
      <>
        <SEOHead
          title="Shopping Cart: Diamond Store"
          description="View And Manage Items In Your Diamond Store Shopping Cart."
          canonical="/hub/diamond-store/cart"
          noindex={true}
        />
        <main
          style={styles.loadingContainer}
          aria-busy="true"
          aria-label="Shopping Cart"
          data-marketplace-route="/hub/diamond-store/cart"
        >
          <div role="status" aria-live="polite" className={cartStyles.loadingPanel}>
            <MarketplaceConsolePanel title="Preparing Your Cart">
              <MarketplaceConsoleStatusRow
                label="Secure Cart"
                value="Loading Cart"
                detail="Binding Cart Contents To Your Active Account"
                live
              />
            </MarketplaceConsolePanel>
          </div>
        </main>
      </>
    );
  }

  const diamondCost = getDiamondCost();
  const affordable = canAffordWithDiamonds();
  const itemCount = unitsOf(visibleCart);

  return (
    <PageTransition>
      <SEOHead
        title="Shopping Cart: Diamond Store"
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
          {projectedCartLoadError ? (
            <div role="alert">
              <MarketplaceConsolePanel
                title="Could Not Verify Your Cart"
                primaryAction={{ label: 'Retry Secure Read', onClick: retryCartLoad }}
              >
                <MarketplaceConsoleStatusRow
                  label="Owner-Scoped Cart"
                  value="Secure Read Failed"
                  detail={marketplaceCopy(projectedCartLoadError)}
                  valueInk="red"
                />
              </MarketplaceConsolePanel>
            </div>
          ) : visibleCart.length === 0 ? (
            <MarketplaceConsolePanel title="Your Cart Is Empty">
              <MarketplaceConsoleStatusRow
                label="Cart Status"
                value="No Items Reserved"
                detail="Add Marketplace Gear To Begin A Secure Checkout"
              />
              <Link href="/hub/diamond-store" className={cartStyles.emptyBrowseButton}>
                Browse Store
              </Link>
            </MarketplaceConsolePanel>
          ) : (
            <div
              style={{ ...styles.cartLayout, gridTemplateColumns: isMobile ? '1fr' : '1fr 400px' }}
            >
              {/* Cart Items */}
              <div style={styles.itemsSection}>
                <AnimatePresence>
                  {visibleCart.map((item) => (
                    <CartItem
                      key={item.id}
                      {...item}
                      isMobile={isMobile}
                      onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </AnimatePresence>

                <button type="button" onClick={clearCart} className={cartStyles.clearCartButton}>
                  Clear Cart
                </button>
              </div>

              {/* Summary */}
              <aside className={cartStyles.summaryFrame} aria-labelledby="cart-summary-title">
                <div className={cartStyles.summaryFrameTop} aria-hidden="true" />
                <div className={cartStyles.summaryFrameBody}>
                  <h3 id="cart-summary-title" style={styles.summaryTitle}>
                    Order Summary
                  </h3>

                  <div style={styles.summaryRow}>
                    <span>
                      Subtotal ({itemCount} {itemCount === 1 ? 'Item' : 'Items'})
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

                  {/* Mixed cart: one purchase type per checkout session */}
                  {!usingDiamonds && !cardGroup && (
                    <div style={styles.noticeBox}>
                      VIP Memberships Are Purchased From The Diamond Store Page, Not From The Cart.
                    </div>
                  )}
                  {!usingDiamonds && cardGroup && deferredUnits > 0 && (
                    <div style={styles.noticeBox}>
                      {cardGroup === 'diamonds'
                        ? `All Diamond Packages Check Out Together For $${(cardChargeCents / 100).toFixed(2)}. The Other ${deferredUnits} ${deferredUnits === 1 ? 'Item Stays' : 'Items Stay'} In Your Cart For A Separate Checkout.`
                        : `This Checkout Covers Your Merchandise ($${(cardChargeCents / 100).toFixed(2)}). The Other ${deferredUnits} ${deferredUnits === 1 ? 'Item Stays' : 'Items Stay'} In Your Cart.`}
                    </div>
                  )}
                  {usingDiamonds && vipItems.length > 0 && (
                    <div style={styles.noticeBox}>
                      VIP Memberships Cannot Be Paid For With Diamonds And Will Stay In Your Cart.
                    </div>
                  )}

                  {/* ═══ Payment Method Selection ═══ */}
                  <div
                    role="radiogroup"
                    aria-labelledby="marketplace-payment-method-label"
                    onKeyDown={handlePaymentChoiceKeyDown}
                    className={cartStyles.paymentGroup}
                  >
                    <p id="marketplace-payment-method-label" className={cartStyles.paymentLabel}>
                      Payment Method
                    </p>

                    {/* Pay with Diamonds Option: hidden when the cart holds diamond packages */}
                    {!hasDiamondItems && (
                      <button
                        type="button"
                        role="radio"
                        aria-label="Pay With Diamonds"
                        aria-checked={usingDiamonds}
                        tabIndex={usingDiamonds ? 0 : -1}
                        onClick={() => setPayWithDiamonds(true)}
                        className={cartStyles.paymentChoice}
                      >
                        <div className={cartStyles.paymentCopy}>
                          <div>
                            <span className={cartStyles.paymentName}>Pay With Diamonds</span>
                            <span
                              className={
                                affordable
                                  ? cartStyles.paymentMeta
                                  : `${cartStyles.paymentMeta} ${cartStyles.paymentMetaWarning}`
                              }
                            >
                              Balance: {diamondBalance.toLocaleString()}
                              {!affordable &&
                                ` (Need ${diamondCostIsEstimate ? 'About ' : ''}${diamondCost.toLocaleString()})`}
                            </span>
                          </div>
                        </div>
                        <div className={cartStyles.paymentTotal}>
                          <span className={cartStyles.paymentPrice}>
                            {diamondCostIsEstimate ? '~' : ''}
                            {diamondCost.toLocaleString()}
                          </span>
                          <span className={cartStyles.selectionSeam} aria-hidden="true" />
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
                      className={cartStyles.paymentChoice}
                    >
                      <div className={cartStyles.paymentCopy}>
                        <div>
                          <span className={cartStyles.paymentName}>Pay With Card</span>
                          <span className={cartStyles.paymentMetaMuted}>
                            Visa, Mastercard, Amex
                          </span>
                        </div>
                      </div>
                      <div className={cartStyles.paymentTotal}>
                        <span className={cartStyles.paymentPrice}>
                          ${(cardChargeCents / 100).toFixed(2)}
                        </span>
                        <span className={cartStyles.selectionSeam} aria-hidden="true" />
                      </div>
                    </button>
                  </div>

                  {/* Checkout Button */}
                  <button
                    type="button"
                    onClick={usingDiamonds ? beginDiamondCheckout : handleCheckout}
                    disabled={checkingOut || (!usingDiamonds && !cardGroup)}
                    className={cartStyles.checkoutButton}
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
                      Final Diamond Cost Is Confirmed By The Server At Purchase.
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
                      Displayed Cart Pricing Indicates A Shortfall Of{' '}
                      {diamondCostIsEstimate ? 'About ' : ''}
                      {(diamondCost - diamondBalance).toLocaleString()} Diamonds. You May Continue;
                      The Server Will Confirm The Current Catalog Price Before Any Debit.
                    </p>
                  )}

                  <Link href="/hub/diamond-store" className={cartStyles.continueShoppingLink}>
                    Continue Shopping
                  </Link>
                </div>
                <div className={cartStyles.summaryFrameBottom} aria-hidden="true" />
              </aside>
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

function CartItem({
  id,
  catalogId,
  name,
  price,
  quantity,
  image,
  type,
  isMobile,
  onUpdateQuantity,
  onRemove,
}) {
  const copyName = marketplaceCopy(name);
  const media = resolveReviewedCartMedia({ id, catalogId, image, type });
  return (
    <motion.article
      className={cartStyles.cartItemFrame}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      layout
    >
      <div className={cartStyles.cartItemFrameTop} aria-hidden="true" />
      <div
        className={`${cartStyles.cartItemFrameBody} ${isMobile ? cartStyles.cartItemMobile : ''}`}
      >
        {media.source && !media.atlasPosition && (
          <img
            src={media.source}
            alt={copyName}
            style={{ ...styles.itemImage, ...(isMobile ? styles.itemImageMobile : {}) }}
            loading="lazy"
            decoding="async"
          />
        )}
        {media.source && media.atlasPosition && (
          <span
            role="img"
            aria-label={copyName}
            style={{
              ...styles.itemImage,
              ...(isMobile ? styles.itemImageMobile : {}),
              display: 'block',
              backgroundImage: `url(${media.source})`,
              backgroundPosition: media.atlasPosition,
              backgroundRepeat: 'no-repeat',
              backgroundSize: '400% 100%',
            }}
          />
        )}

        <div style={styles.itemDetails}>
          <h4 style={styles.itemName}>{copyName}</h4>
          <p style={styles.itemType}>{marketplaceCopy(type)}</p>
          <p style={styles.itemPrice}>${(Number(price) || 0).toFixed(2)}</p>
        </div>

        <div style={{ ...styles.itemActions, ...(isMobile ? styles.itemActionsMobile : {}) }}>
          <div className={cartStyles.quantityControl}>
            <button
              type="button"
              aria-label={`Decrease Quantity Of ${copyName}`}
              onClick={() => onUpdateQuantity(quantity - 1)}
              className={cartStyles.quantityButton}
            >
              Less
            </button>
            <output aria-live="polite" className={cartStyles.quantity}>
              {quantity}
            </output>
            <button
              type="button"
              aria-label={`Increase Quantity Of ${copyName}`}
              onClick={() => onUpdateQuantity(quantity + 1)}
              className={cartStyles.quantityButton}
            >
              More
            </button>
          </div>

          <button type="button" onClick={onRemove} className={cartStyles.removeButton}>
            Remove
          </button>
        </div>
      </div>
      <div className={cartStyles.cartItemFrameBottom} aria-hidden="true" />
    </motion.article>
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
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    color: '#FFFFFF',
  },
};
