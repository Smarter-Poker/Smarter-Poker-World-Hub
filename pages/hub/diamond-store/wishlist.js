/**
 * Wishlist Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's saved products from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { wishlistService } from '../../../src/services/preferences-service';
import toast from '../../../src/stores/toastStore';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';
import { Heart, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';

export default function Wishlist() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/wishlist');
  useTrainingBus('diamond-store-wishlist');
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    if (authChecking || !user?.id) return;
    loadWishlist();
  }, [authChecking, user?.id]);

  const loadWishlist = async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const items = await wishlistService.getWishlist(user.id);
      let catalogById = {};
      try {
        const response = await fetch('/api/store/merch-catalog', {
          headers: { Accept: 'application/json' },
        });
        const body = response.ok ? await response.json() : null;
        const catalog = Array.isArray(body?.data?.items) ? body.data.items : [];
        catalogById = Object.fromEntries(catalog.map((item) => [item.id, item]));
      } catch (catalogError) {
        console.warn('Could not enrich wishlist from live catalog:', catalogError);
      }
      if (requestId !== loadRequestRef.current) return;
      setWishlist(
        (Array.isArray(items) ? items : []).map((item) => ({
          ...item,
          catalog: catalogById[item.product_id] || null,
        }))
      );
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.warn('Error loading wishlist:', error);
      setLoadError('Your Wishlist Could Not Be Loaded. Check Your Connection And Try Again.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  const removeFromWishlist = async (productId) => {
    if (removingId) return;
    setRemovingId(productId);
    try {
      await wishlistService.removeFromWishlist(user.id, productId);
      setWishlist((prev) => prev.filter((item) => item.product_id !== productId));
      toast.success('Removed From Wishlist');
    } catch (error) {
      console.warn('Error removing from wishlist:', error);
      toast.error('Could Not Remove Item. Please Try Again.');
    } finally {
      setRemovingId(null);
    }
  };

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
          {loading ? (
            <div role="status" aria-live="polite" style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading Wishlist...</p>
              <style>{`@keyframes dsSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : loadError ? (
            <div role="alert" style={styles.emptyState}>
              <Heart size={46} color="#ff5f6d" aria-hidden="true" />
              <h2 style={styles.emptyTitle}>Could Not Load Wishlist</h2>
              <p style={styles.emptyText}>{marketplaceCopy(loadError)}</p>
              <button type="button" onClick={loadWishlist} style={styles.retryButton}>
                <RefreshCw size={15} aria-hidden="true" /> Retry Wishlist
              </button>
            </div>
          ) : wishlist.length === 0 ? (
            <div style={styles.emptyState}>
              <Heart size={46} color="#607d8e" aria-hidden="true" />
              <h2 style={styles.emptyTitle}>Your Wishlist Is Empty</h2>
              <p style={styles.emptyText}>Save Marketplace Gear To Build A Shortlist Here.</p>
              <Link href="/hub/merch-store" style={styles.shopButton}>
                Browse Merch
              </Link>
            </div>
          ) : (
            <div style={styles.wishlistGrid}>
              {wishlist.map((item) => {
                const catalog = item.catalog;
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
                    <div style={styles.productMedia}>
                      {catalog?.image_url ? (
                        <img
                          src={catalog.image_url}
                          alt={marketplaceCopy(item.product_name)}
                          style={styles.productImage}
                          loading="lazy"
                        />
                      ) : (
                        <ShoppingBag size={42} color="#698494" aria-hidden="true" />
                      )}
                    </div>
                    <div style={styles.productBody}>
                      <span style={styles.productType}>
                        {marketplaceCopy(catalog?.category || item.product_type || 'Marketplace')}
                      </span>
                      <h2 style={styles.productName}>{marketplaceCopy(catalog?.name || item.product_name)}</h2>
                      <div style={styles.priceRow}>
                        <span style={styles.price}>${priceUsd.toFixed(2)}</span>
                        <span style={styles.diamondPrice}>
                          {priceDiamonds.toLocaleString()} Diamonds
                        </span>
                      </div>
                      <div style={styles.actions}>
                        <Link href={destination} style={styles.viewButton}>
                          View Live Item
                        </Link>
                        <button
                          type="button"
                          aria-label={`Remove ${marketplaceCopy(item.product_name)} From Wishlist`}
                          onClick={() => removeFromWishlist(item.product_id)}
                          disabled={removingId === item.product_id}
                          style={styles.removeButton}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          {removingId === item.product_id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
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
    overflow: 'hidden',
    background: 'linear-gradient(145deg, #172933, #050a0f 34%, #010305)',
    border: '1px solid #526f80',
    borderRadius: 0,
    boxShadow: 'inset 0 1px 0 rgba(235,251,255,0.38), inset 0 0 0 4px #03080c',
  },
  productMedia: {
    display: 'flex',
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottom: '1px solid #476273',
    background:
      'radial-gradient(circle at 50% 35%, rgba(0,190,255,0.14), transparent 48%), #02070b',
  },
  productImage: { width: '100%', height: '100%', objectFit: 'cover' },
  productBody: { display: 'flex', minHeight: 210, flexDirection: 'column', padding: '18px' },
  productType: {
    color: '#7f9aa9',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
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
  viewButton: {
    display: 'inline-flex',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '9px 12px',
    background: 'linear-gradient(180deg, #dff9ff, #6da7bc 48%, #1c4b61)',
    border: '1px solid #9cd7e8',
    color: '#06131a',
    fontSize: 11,
    fontWeight: 800,
    textDecoration: 'none',
    textTransform: 'uppercase',
  },
  removeButton: {
    display: 'inline-flex',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '9px 12px',
    background: 'rgba(255, 68, 68, 0.06)',
    border: '1px solid rgba(255, 95, 109, 0.55)',
    color: '#ff7b87',
    borderRadius: 0,
    cursor: 'pointer',
  },
  emptyState: { textAlign: 'center', padding: '80px 24px' },
  emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
  emptyText: { color: '#9ca3af', marginBottom: '24px' },
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
    textAlign: 'center',
    padding: '80px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.15)',
    borderTopColor: '#00E0FF',
    borderRadius: '50%',
    animation: 'dsSpin 1s linear infinite',
  },
  loadingText: { marginTop: '16px', color: '#9ca3af' },
  retryButton: {
    display: 'inline-flex',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    border: '1px solid #8adff0',
    borderRadius: 0,
    background: 'linear-gradient(180deg, #dff9ff, #6da7bc 48%, #1c4b61)',
    color: '#06131a',
    fontWeight: 800,
    cursor: 'pointer',
  },
};
