/**
 * Wishlist Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's saved products from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { wishlistService } from '../../../src/services/preferences-service';
import toast from '../../../src/stores/toastStore';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, useRequireAuth } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';
import {
  MarketplaceConsolePanel,
  MarketplaceConsoleStatusRow,
} from '../../../src/components/marketplace-console/MarketplaceConsole';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import { resolveReviewedMerchArt } from '../../../src/lib/store/merchProductArt';
import accountControls from './marketplace-account-controls.module.css';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function Wishlist() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/wishlist');
  const { user: contextUser, initializing: authInitializing } = useAvatar();
  useTrainingBus('diamond-store-wishlist');
  const synchronousAccountId = getAuthUser()?.id || null;
  const committedAccountId =
    contextUser?.id === synchronousAccountId
      ? contextUser.id
      : authInitializing || authChecking
        ? user?.id === synchronousAccountId
          ? user.id
          : synchronousAccountId
        : null;
  const [loadedWishlist, setWishlist] = useState([]);
  const [wishlistOwnerId, setWishlistOwnerId] = useState(null);
  const wishlist = wishlistOwnerId === committedAccountId ? loadedWishlist : [];
  const changingOwner = Boolean(committedAccountId) && wishlistOwnerId !== committedAccountId;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [removeError, setRemoveError] = useState(null);
  const projectedLoadError = wishlistOwnerId === committedAccountId ? loadError : null;
  const projectedRemoveError = wishlistOwnerId === committedAccountId ? removeError : null;
  const [removingId, setRemovingId] = useState(null);
  const activeAccountIdRef = useRef(committedAccountId);
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef(null);
  const removeRequestRef = useRef(0);
  const removeAbortRef = useRef(null);
  const removeBusyRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    activeAccountIdRef.current = committedAccountId;
    loadRequestRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    removeRequestRef.current += 1;
    removeAbortRef.current?.abort();
    removeAbortRef.current = null;
    removeBusyRef.current = false;
    setWishlist([]);
    setWishlistOwnerId(committedAccountId);
    setLoadError(null);
    setRemoveError(null);
    setRemovingId(null);
    setLoading(Boolean(committedAccountId));
  }, [committedAccountId]);

  const loadWishlist = useCallback(async () => {
    const expectedAccountId = committedAccountId;
    if (
      !expectedAccountId ||
      activeAccountIdRef.current !== expectedAccountId ||
      getAuthUser()?.id !== expectedAccountId
    )
      return;
    const requestId = ++loadRequestRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const generationOwnsCurrentAccount = () =>
      loadRequestRef.current === requestId && activeAccountIdRef.current === expectedAccountId;
    const operationOwnsCurrentAccount = () =>
      generationOwnsCurrentAccount() && loadAbortRef.current === controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      operationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    const commitIsCurrent = () =>
      !controller.signal.aborted &&
      generationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    const errorCommitIsCurrent = () => generationOwnsCurrentAccount();
    let operationSettled = false;
    setLoading(true);
    setLoadError(null);
    try {
      const items = await wishlistService.getWishlist(expectedAccountId);
      if (!attemptIsCurrent()) return;
      let catalogById = {};
      try {
        const response = await fetch('/api/store/merch-catalog', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return;
        const body = response.ok ? await response.json() : null;
        if (!attemptIsCurrent()) return;
        const catalog = Array.isArray(body?.data?.items) ? body.data.items : [];
        catalogById = Object.fromEntries(catalog.map((item) => [item.id, item]));
      } catch (catalogError) {
        if (!operationOwnsCurrentAccount()) return;
        if (catalogError?.name === 'AbortError') return;
        console.warn('Could not enrich wishlist from live catalog:', catalogError);
      }
      if (!attemptIsCurrent()) return;
      operationSettled = true;
      setWishlist((current) => {
        if (!commitIsCurrent()) return current;
        return (Array.isArray(items) ? items : []).map((item) => ({
          ...item,
          catalog: catalogById[item.product_id] || null,
        }));
      });
    } catch (error) {
      if (!operationOwnsCurrentAccount()) return;
      if (error?.name === 'AbortError') return;
      operationSettled = true;
      console.warn('Error loading wishlist:', error);
      setLoadError((current) =>
        errorCommitIsCurrent()
          ? 'Your Wishlist Could Not Be Loaded. Check Your Connection And Try Again.'
          : current
      );
    } finally {
      if (loadRequestRef.current === requestId && loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        if (!operationSettled) {
          setLoadError((current) =>
            errorCommitIsCurrent()
              ? 'Your Account Changed Before The Wishlist Could Be Verified. Retry The Secure Read.'
              : current
          );
        }
        if (activeAccountIdRef.current === expectedAccountId) {
          setLoading((current) => (errorCommitIsCurrent() ? false : current));
        }
      }
    }
  }, [committedAccountId]);

  const removeFromWishlist = useCallback(
    async (productId) => {
      const expectedAccountId = committedAccountId;
      if (
        removeBusyRef.current ||
        !expectedAccountId ||
        wishlistOwnerId !== expectedAccountId ||
        activeAccountIdRef.current !== expectedAccountId ||
        getAuthUser()?.id !== expectedAccountId
      )
        return;
      const requestId = ++removeRequestRef.current;
      removeAbortRef.current?.abort();
      const controller = new AbortController();
      removeAbortRef.current = controller;
      removeBusyRef.current = true;
      const generationOwnsCurrentAccount = () =>
        removeRequestRef.current === requestId && activeAccountIdRef.current === expectedAccountId;
      const operationOwnsCurrentAccount = () =>
        generationOwnsCurrentAccount() && removeAbortRef.current === controller;
      const attemptIsCurrent = () =>
        !controller.signal.aborted &&
        operationOwnsCurrentAccount() &&
        getAuthUser()?.id === expectedAccountId;
      const commitIsCurrent = () =>
        !controller.signal.aborted &&
        generationOwnsCurrentAccount() &&
        getAuthUser()?.id === expectedAccountId;
      const errorCommitIsCurrent = () => generationOwnsCurrentAccount();
      setRemovingId(productId);
      setRemoveError(null);
      try {
        // This service call cannot accept an AbortSignal. It may still finish for
        // the captured account, but every browser-side effect below is fenced.
        await wishlistService.removeFromWishlist(expectedAccountId, productId);
        if (!attemptIsCurrent()) return;
        setWishlist((current) =>
          commitIsCurrent() ? current.filter((item) => item.product_id !== productId) : current
        );
        toast.success('Removed From Wishlist');
      } catch (error) {
        if (!operationOwnsCurrentAccount()) return;
        if (error?.name === 'AbortError') return;
        if (getAuthUser()?.id !== expectedAccountId) return;
        console.warn('Error removing from wishlist:', error);
        setRemoveError((current) =>
          errorCommitIsCurrent() ? 'Could Not Remove Item. Please Try Again.' : current
        );
        toast.error('Could Not Remove Item. Please Try Again.');
      } finally {
        if (removeRequestRef.current === requestId && removeAbortRef.current === controller) {
          removeAbortRef.current = null;
          removeBusyRef.current = false;
          if (activeAccountIdRef.current === expectedAccountId) {
            setRemovingId((current) => (errorCommitIsCurrent() ? null : current));
          }
        }
      }
    },
    [committedAccountId, wishlistOwnerId]
  );

  useEffect(() => {
    if (authChecking || authInitializing || !committedAccountId) return;
    void loadWishlist();
  }, [authChecking, authInitializing, committedAccountId, loadWishlist]);

  useEffect(
    () => () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      removeRequestRef.current += 1;
      removeAbortRef.current?.abort();
      removeAbortRef.current = null;
      removeBusyRef.current = false;
    },
    []
  );

  return (
    <PageTransition>
      <SEOHead
        title="Wishlist: Diamond Store"
        description="Your Saved Items In The Diamond Store Wishlist."
        canonical="/hub/diamond-store/wishlist"
        noindex={true}
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <MarketplaceSubpageShell
          active="wishlist"
          eyebrow="Saved Marketplace Gear"
          title="Wishlist"
          description="Keep A Shortlist Of Gear And Marketplace Access, Then Return To The Live Product Page For Current Options, Availability, And Payment Choice."
        >
          {loading || changingOwner || !committedAccountId ? (
            <div role="status" aria-live="polite">
              <MarketplaceConsolePanel title="Verifying Wishlist">
                <MarketplaceConsoleStatusRow
                  label="Private Wishlist"
                  value="Loading Saved Gear"
                  detail="Binding Saved Items To Your Active Account"
                  live
                />
              </MarketplaceConsolePanel>
            </div>
          ) : projectedLoadError ? (
            <div role="alert">
              <MarketplaceConsolePanel
                title="Could Not Load Wishlist"
                primaryAction={{ label: 'Retry Wishlist', onClick: loadWishlist }}
              >
                <MarketplaceConsoleStatusRow
                  label="Wishlist Status"
                  value="Secure Read Failed"
                  detail={marketplaceCopy(projectedLoadError)}
                  valueInk="red"
                />
              </MarketplaceConsolePanel>
            </div>
          ) : wishlist.length === 0 ? (
            <MarketplaceConsolePanel
              title="Your Wishlist Is Empty"
              primaryAction={{ label: 'Browse Merch', href: '/hub/merch-store' }}
            >
              <MarketplaceConsoleStatusRow
                label="Private Wishlist"
                value="No Saved Items"
                detail="Save Marketplace Gear To Build A Shortlist Here"
              />
            </MarketplaceConsolePanel>
          ) : (
            <div style={styles.wishlistGrid}>
              {projectedRemoveError && (
                <div role="alert" style={styles.gridNotice}>
                  <MarketplaceConsoleStatusRow
                    label="Wishlist Update"
                    value="Item Was Not Removed"
                    detail={marketplaceCopy(projectedRemoveError)}
                    valueInk="red"
                    live
                  />
                </div>
              )}
              {wishlist.map((item) => {
                const catalog = item.catalog;
                const productArt = resolveReviewedMerchArt(String(item.product_id || ''));
                const priceUsd = Number(catalog?.price_usd ?? item.product_price) || 0;
                const priceDiamonds = Number(catalog?.price_diamonds) || Math.ceil(priceUsd * 100);
                const destination =
                  item.product_type === 'vip'
                    ? '/hub/vip-membership'
                    : item.product_type === 'diamond' || item.product_type === 'diamonds'
                      ? '/hub/diamond-store'
                      : `/hub/merch-store/${encodeURIComponent(item.product_id)}`;
                return (
                  <article key={item.id ?? item.product_id} style={styles.wishlistItem}>
                    <div aria-hidden="true" style={styles.wishlistFrameTop} />
                    <div style={styles.wishlistFrameBody}>
                      <div style={styles.productMedia}>
                        {productArt.image && !productArt.atlasPosition ? (
                          <img
                            src={productArt.image}
                            alt={marketplaceCopy(item.product_name)}
                            style={styles.productImage}
                            loading="lazy"
                          />
                        ) : productArt.image && productArt.atlasPosition ? (
                          <div
                            role="img"
                            aria-label={marketplaceCopy(item.product_name)}
                            style={{
                              ...styles.productAtlasImage,
                              backgroundImage: `url(${productArt.image})`,
                              backgroundPosition: productArt.atlasPosition,
                            }}
                          />
                        ) : (
                          <span role="status" style={styles.productFallback}>
                            Product Artwork Requires Review
                          </span>
                        )}
                      </div>
                      <div style={styles.productBody}>
                        <span style={styles.productType}>
                          {marketplaceCopy(catalog?.category || item.product_type || 'Marketplace')}
                        </span>
                        <h2 style={styles.productName}>
                          {marketplaceCopy(catalog?.name || item.product_name)}
                        </h2>
                        <div style={styles.priceRow}>
                          <span style={styles.price}>${priceUsd.toFixed(2)}</span>
                          <span style={styles.diamondPrice}>
                            {priceDiamonds.toLocaleString()} Diamonds
                          </span>
                        </div>
                        <div style={styles.actions}>
                          <Link
                            href={destination}
                            className={`${accountControls.action} ${accountControls.actionPrimary}`}
                          >
                            View Live Item
                          </Link>
                          <button
                            type="button"
                            aria-label={`Remove ${marketplaceCopy(item.product_name)} From Wishlist`}
                            onClick={() => removeFromWishlist(item.product_id)}
                            disabled={removingId === item.product_id}
                            className={`${accountControls.action} ${accountControls.actionDanger}`}
                          >
                            {removingId === item.product_id ? 'Removing' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div aria-hidden="true" style={styles.wishlistFrameBottom} />
                  </article>
                );
              })}
            </div>
          )}
        </MarketplaceSubpageShell>
      </div>
    </PageTransition>
  );
}

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
  content: { maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 40px' },
  title: { fontSize: '32px', fontWeight: 700, marginBottom: '32px' },
  wishlistGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    gap: '20px',
  },
  wishlistItem: {
    display: 'flex',
    width: '100%',
    maxWidth: 900,
    minWidth: 0,
    flexDirection: 'column',
    justifySelf: 'center',
    overflow: 'visible',
    containerType: 'inline-size',
    backgroundColor: '#000000',
  },
  wishlistFrameTop: {
    width: '100%',
    aspectRatio: '900 / 143',
    flex: '0 0 auto',
    backgroundImage: "url('/images/marketplace-console-v1/shark-panel/top.png')",
    backgroundPosition: 'top center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% auto',
  },
  wishlistFrameBody: {
    display: 'flex',
    minHeight: '12cqw',
    flex: '1 1 auto',
    flexDirection: 'column',
    padding: '0 7.2cqw 3.4cqw',
    backgroundColor: '#000000',
    backgroundImage: "url('/images/marketplace-console-v1/shark-panel/mid.png')",
    backgroundPosition: 'top center',
    backgroundRepeat: 'repeat-y',
    backgroundSize: '100% auto',
  },
  wishlistFrameBottom: {
    width: '100%',
    aspectRatio: '900 / 139',
    flex: '0 0 auto',
    backgroundImage: "url('/images/marketplace-console-v1/shark-panel/bottom.png')",
    backgroundPosition: 'bottom center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% auto',
  },
  productMedia: {
    display: 'flex',
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  productImage: { width: '100%', height: '100%', objectFit: 'cover' },
  productAtlasImage: {
    width: 105,
    height: 210,
    flex: '0 0 auto',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '400% 100%',
  },
  productFallback: {
    color: '#9edcf0',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: '0.08em',
  },
  productBody: { display: 'flex', minHeight: 210, flexDirection: 'column', padding: '18px' },
  productType: {
    color: '#7f9aa9',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'capitalize',
  },
  productName: { margin: '10px 0 14px', color: '#edfaff', fontSize: 18, fontWeight: 700 },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  price: { color: '#00E0FF', fontSize: '18px', fontWeight: 600, margin: '8px 0' },
  diamondPrice: { color: '#a8bac4', fontSize: 12, fontWeight: 600 },
  actions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginTop: 'auto',
    paddingTop: 20,
  },
  gridNotice: { gridColumn: '1 / -1' },
};
