/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — LANDING PAGE
   Full-width hero image with clickable hotspot overlays + haptic feedback
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SEOHead, { schemas } from '../src/components/seo/SEOHead';
import LandingProductSummary from '../src/components/landing/LandingProductSummary';

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(25);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOTSPOT CONFIG — Main landing image
// ─────────────────────────────────────────────────────────────────────────────
const HOTSPOTS = [
  {
    id: 'join-now', label: 'Join Now',
    top: 0, left: 0, width: 100, height: 34.5,
    action: 'navigate', href: '/auth/signup',
  },
  {
    id: 'global-connection', label: 'Global Connection',
    top: 35, left: 5, width: 44, height: 23.5,
    action: 'overlay', image: '/images/global-connection-v2.webp', overlayKey: 'gc',
    imageWidth: 937, imageHeight: 1678,
  },
  {
    id: 'elite-training', label: 'Elite Training',
    top: 35, left: 51, width: 44, height: 23.5,
    action: 'overlay', image: '/images/elite-training-v2.webp', overlayKey: 'et',
    imageWidth: 968, imageHeight: 1624,
  },
  {
    id: 'bankroll-discovery', label: 'Bankroll And Discovery',
    top: 60, left: 5, width: 90, height: 13.5,
    action: 'overlay', image: '/images/total-discovery-v2.webp', overlayKey: 'td',
    imageWidth: 937, imageHeight: 1678,
  },
  {
    id: 'lifestyle-news', label: 'Lifestyle And News',
    top: 74.5, left: 5, width: 44, height: 22.5,
    action: 'overlay', image: '/images/lifestyle-rewards-v2.webp', overlayKey: 'lr',
    imageWidth: 937, imageHeight: 1679,
  },
  {
    id: 'club-commander', label: 'Club Commander',
    top: 74.5, left: 51, width: 44, height: 22.5,
    action: 'navigate', href: '/hub/commander',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY HOTSPOT CONFIGS — clickable zones on each detail image
// Cards go to signup, back/CTA buttons close or go to signup
// ─────────────────────────────────────────────────────────────────────────────
const OVERLAY_HOTSPOTS = {
  // Global Connection
  gc: [
    { id: 'gc-social', top: 24.5, left: 9, width: 27, height: 28.5, action: 'signup' },
    { id: 'gc-trivia', top: 24.5, left: 37, width: 27, height: 28.5, action: 'signup' },
    { id: 'gc-diamond', top: 24.5, left: 65, width: 27, height: 28.5, action: 'signup' },
    { id: 'gc-club', top: 55, left: 19, width: 30, height: 28, action: 'signup' },
    { id: 'gc-arcade', top: 55, left: 51, width: 30, height: 28, action: 'signup' },
    { id: 'gc-back', top: 85.5, left: 24, width: 51, height: 7, action: 'close' },
  ],
  // Elite Training
  et: [
    { id: 'et-training', top: 25.5, left: 10, width: 38, height: 29, action: 'signup' },
    { id: 'et-memory', top: 25.5, left: 52, width: 38, height: 29, action: 'signup' },
    { id: 'et-assistant', top: 55.5, left: 10, width: 38, height: 29, action: 'signup' },
    { id: 'et-sandbox', top: 55.5, left: 52, width: 38, height: 29, action: 'signup' },
    { id: 'et-cta', top: 86.5, left: 17, width: 66, height: 7.5, action: 'signup' },
  ],
  // Total Control: Bankroll & Discovery
  td: [
    { id: 'td-bankroll', top: 32, left: 2, width: 46, height: 54, action: 'signup' },
    { id: 'td-pokernear', top: 32, left: 52, width: 46, height: 54, action: 'signup' },
    { id: 'td-cta', top: 88, left: 22, width: 57, height: 9, action: 'signup' },
  ],
  // Lifestyle, News & Rewards
  lr: [
    { id: 'lr-news', top: 20.5, left: 5, width: 90, height: 22, action: 'signup' },
    { id: 'lr-store', top: 43.5, left: 5, width: 90, height: 21, action: 'signup' },
    { id: 'lr-video', top: 65.5, left: 5, width: 90, height: 21, action: 'signup' },
    { id: 'lr-cta', top: 88.5, left: 12, width: 76, height: 8.5, action: 'signup' },
  ],
};

// On a phone, show the same rendered panels at readable size instead of
// shrinking every description to a few pixels inside one tall poster.
const PHONE_PANELS = HOTSPOTS.flatMap((spot) => spot.id === 'bankroll-discovery'
  ? [
      { ...spot, id: 'bankroll-manager', label: 'Bankroll Manager',
        top: 64.5, left: 10, width: 39, height: 7.2 },
      { ...spot, id: 'poker-near-me', label: 'Poker Near Me',
        top: 64.5, left: 51, width: 39, height: 7.2 },
    ]
    : [{ ...spot, ...(spot.id === 'join-now'
      ? { phoneCopy: 'Train Smarter. Connect Globally. Manage Everything.' } : {}) }]);

const PHONE_DETAIL_COPY = {
  'lr-news': 'Stay Up To Date With All The News Around The World.',
  'lr-store': 'Buy Merch And Trade Your Diamonds For Real World Prizes Inside The Marketplace.',
  'lr-video': 'Watch Unlimited Poker Content From All Of Your Favorite Creators.',
};

function ArtworkSlice({ spot, image, width, height, onActivate }) {
  return (
    <>
    <div role={spot.action ? undefined : 'img'} aria-label={spot.action ? undefined : spot.label} style={{
      position: 'relative', overflow: 'hidden',
      width: spot.width === 100 ? '100%' : 'calc(100% - 24px)',
      maxWidth: `${width * spot.width / 100}px`,
      aspectRatio: `${width * spot.width} / ${height * spot.height}`,
    }}>
      <img src={image} alt="" width={width} height={height} draggable={false}
        style={{ position: 'absolute', maxWidth: 'none', height: 'auto',
          width: `${10000 / spot.width}%`, left: `${-100 * spot.left / spot.width}%`,
          top: `${-100 * spot.top / spot.height}%` }} />
      {spot.action && (
        <button type="button" aria-label={spot.label || (spot.action === 'close' ? 'Back' : 'Sign Up')}
          onClick={() => onActivate(spot)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }} />
      )}
    </div>
    {spot.phoneCopy && <p style={{ width: 'calc(100% - 32px)', maxWidth: '412px',
      color: '#f5fbff', fontSize: '16px', lineHeight: 1.4, textAlign: 'center',
      fontFamily: "var(--font-inter), sans-serif", margin: '0 0 4px' }}>{spot.phoneCopy}</p>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [overlay, setOverlay] = useState(null); // { image, overlayKey }
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [overlayLoaded, setOverlayLoaded] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setOverlay(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleHotspotClick = (spot) => {
    triggerHaptic();
    if (spot.action === 'navigate') {
      router.push(spot.href);
    } else if (spot.action === 'overlay') {
      setOverlayLoaded(false);
      setOverlay({ image: spot.image, overlayKey: spot.overlayKey,
        width: spot.imageWidth, height: spot.imageHeight, label: spot.label });
    }
  };

  const handleOverlayHotspotClick = (spot) => {
    triggerHaptic();
    if (spot.action === 'close') {
      setOverlay(null);
    } else if (spot.action === 'signup') {
      router.push('/auth/signup');
    }
  };

  return (
    <>
      <SEOHead
        title="Smarter.Poker: Free Poker Training, Clubs And Live Games"
        description="Smarter.Poker Is A Free Online Poker Platform: GTO Training, Private Poker Clubs In Poker Arena, Club Commander Room Management, Live Venue Discovery, Home Games And A Bankroll Manager. Free To Play, No Real-Money Gambling."
        canonical="/"
        jsonLd={[schemas.organization, schemas.website, schemas.softwareApp]}
      />

      <div style={styles.page}>
        {/* ── NAV BAR ─────────────────────────────────────────── */}
        <nav style={styles.nav}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SMARTER.POKER</span>
          </div>
          {/* AEO PHASE 1 (2026-09-17): real links, not buttons with a router
              push. A crawler follows an href; it cannot click a button. Same
              look, same destinations, now keyboard- and crawler-reachable. */}
          <div style={styles.navLinks}>
            <Link href="/auth/signup" style={styles.navButton}>
              Sign Up
            </Link>
            <Link href="/auth/login" style={styles.navButtonPrimary}>
              Sign In
            </Link>
          </div>
        </nav>

        {/* ── FULL-WIDTH HERO IMAGE WITH HOTSPOTS ─────────────── */}
        <div style={styles.imageWrapper}>
          <picture className="landing-desktop-art">
            <source media="(max-width: 480px)" srcSet="/images/landing-hero-v2.webp" />
            <img
            src="/images/landing-hero-v2.webp"
            srcSet="/images/landing-hero-v2-640.webp 640w, /images/landing-hero-v2.webp 937w"
            sizes="(max-width: 937px) 100vw, 937px"
            alt="Smarter.Poker - The Future Of The Game"
            // THE HERO RESERVES ITS OWN SPACE (2026-09-17). Without intrinsic
            // dimensions the browser gives the image a zero-height box until
            // the bytes arrive, and the shimmer below it reserved 180% of the
            // width. Whichever of the
            // two settled first, the other moved the whole page: measured on
            // production at phone width, CLS 0.797 on one load in six. With
            // width and height the box is exact before the first byte.
            width={937}
            height={1678}
            style={{ ...styles.heroImage, opacity: heroLoaded ? 1 : 0 }}
            onLoad={() => setHeroLoaded(true)}
            // The hero IS the largest contentful paint; lazy-loading it told the
            // browser to fetch it last (AEO phase 1, 2026-09-17).
            loading="eager"
            // React 18 drops the camelCase form; the lowercase attribute reaches
            // the DOM and the browser (React 19 accepts either).
            fetchpriority="high"
            decoding="async"
            draggable={false}
            />
          </picture>
          {!heroLoaded && <div className="landing-desktop-art" style={styles.shimmer} />}
          {heroLoaded && HOTSPOTS.map((spot) => (
            <div
              className="landing-desktop-art"
              key={spot.id}
              role={spot.action === 'navigate' ? 'link' : 'button'}
              tabIndex={0}
              aria-label={spot.label}
              onClick={() => handleHotspotClick(spot)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleHotspotClick(spot);
                }
              }}
              style={{
                position: 'absolute',
                top: `${spot.top}%`,
                left: `${spot.left}%`,
                width: `${spot.width}%`,
                height: `${spot.height}%`,
                cursor: 'pointer',
                zIndex: 2,
                WebkitTapHighlightColor: 'rgba(0, 198, 255, 0.15)',
              }}
            />
          ))}
          <div className="landing-phone-art">
            {PHONE_PANELS.map((spot) => (
              <ArtworkSlice key={spot.id} spot={spot} image="/images/landing-hero-v2.webp"
                width={937} height={1678} onActivate={handleHotspotClick} />
            ))}
          </div>
        </div>

        {/* ── FULL-SCREEN IMAGE OVERLAY ───────────────────────── */}
        {overlay && (
          <div style={styles.overlayBackdrop}>
            <div style={{ ...styles.overlayContainer, maxWidth: `${overlay.width}px` }}>
              <picture className="landing-desktop-art">
                <source media="(max-width: 480px)" srcSet={overlay.image} />
                <img
                src={overlay.image}
                srcSet={`${overlay.image.replace('.webp', '-640.webp')} 640w, ${overlay.image} ${overlay.width}w`}
                sizes={`(max-width: ${overlay.width}px) 100vw, ${overlay.width}px`}
                width={overlay.width}
                height={overlay.height}
                alt={`${overlay.label} Detail View`}
                style={{ ...styles.overlayImg, opacity: overlayLoaded ? 1 : 0 }}
                onLoad={() => setOverlayLoaded(true)}
                loading="lazy"
                draggable={false}
                />
              </picture>
              {!overlayLoaded && (
                <div className="landing-desktop-art" style={styles.overlayLoading}>
                  <div style={styles.spinner} />
                </div>
              )}

              {/* Overlay hotspots */}
              {overlayLoaded && OVERLAY_HOTSPOTS[overlay.overlayKey] &&
                OVERLAY_HOTSPOTS[overlay.overlayKey].map((spot) => (
                  <div
                    className="landing-desktop-art"
                    key={spot.id}
                    role="button"
                    tabIndex={0}
                    aria-label={spot.action === 'close' ? 'Back' : 'Sign Up'}
                    onClick={() => handleOverlayHotspotClick(spot)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOverlayHotspotClick(spot);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: `${spot.top}%`,
                      left: `${spot.left}%`,
                      width: `${spot.width}%`,
                      height: `${spot.height}%`,
                      cursor: 'pointer',
                      zIndex: 3,
                      WebkitTapHighlightColor: 'rgba(0, 198, 255, 0.15)',
                    }}
                  />
                ))
              }

              <div className="landing-phone-art">
                <ArtworkSlice spot={{ id: 'detail-title', label: overlay.label, top: 0, left: 0, width: 100,
                  height: OVERLAY_HOTSPOTS[overlay.overlayKey][0].top }}
                  image={overlay.image} width={overlay.width} height={overlay.height} />
                {OVERLAY_HOTSPOTS[overlay.overlayKey].map((spot) => (
                  <ArtworkSlice key={spot.id} spot={{ ...spot, phoneCopy: PHONE_DETAIL_COPY[spot.id] }} image={overlay.image}
                    width={overlay.width} height={overlay.height} onActivate={handleOverlayHotspotClick} />
                ))}
              </div>

              {/* Close X button */}
              <button
                onClick={() => { triggerHaptic(); setOverlay(null); }}
                aria-label="Close Detail View"
                style={styles.overlayCloseBtn}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── PRODUCT SUMMARY (AEO phase 1) ─────────────────────
           The one server-rendered block of words on the landing page:
           H1, definition, one H2 per product. See the component header. */}
        <LandingProductSummary />

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <footer style={styles.footer}>
          <span style={styles.footerText}>© {new Date().getFullYear()} Smarter.Poker - The Future Of The Game</span>
        </footer>
      </div>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #0a0e17; }
        #__next { overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e17; }
        ::-webkit-scrollbar-thumb { background: #1a2a44; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #00c6ff; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .landing-phone-art { display: none; }
        @media (max-width: 480px) {
          .landing-desktop-art { display: none; }
          .landing-phone-art { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a0e17',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  nav: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'rgba(10, 14, 23, 0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(0, 198, 255, 0.1)',
  },
  logo: { display: 'flex', alignItems: 'center' },
  logoText: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(12px, 3.2vw, 16px)',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  navLinks: { display: 'flex', gap: '8px', flexShrink: 0 },
  navButton: {
    background: 'transparent',
    display: 'inline-block',
    textDecoration: 'none',
    border: '1px solid rgba(0, 198, 255, 0.4)',
    color: '#00c6ff',
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "var(--font-inter), sans-serif",
    whiteSpace: 'nowrap',
  },
  navButtonPrimary: {
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    display: 'inline-block',
    textDecoration: 'none',
    border: 'none',
    color: '#ffffff',
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "var(--font-inter), sans-serif",
    whiteSpace: 'nowrap',
    boxShadow: '0 0 20px rgba(0, 198, 255, 0.25)',
  },
  // Never enlarge a raster beyond its native pixels on a wide display.
  imageWrapper: { position: 'relative', width: '100%', maxWidth: '937px' },
  heroImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    transition: 'opacity 0.4s ease',
    userSelect: 'none',
  },
  shimmer: {
    // An OVERLAY, not a sibling in the flow. It used to reserve its own
    // 180% band beside a zero-height image; removing it when the image
    // arrived moved everything below it (2026-09-17). The image now owns
    // the box and the shimmer sits on top of it until it paints.
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'linear-gradient(90deg, #111827 25%, #1a2540 50%, #111827 75%)',
    backgroundSize: '200% 100%',
  },
  overlayBackdrop: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: '#05080c',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  overlayContainer: { position: 'relative', width: '100%' },
  overlayImg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    transition: 'opacity 0.4s ease',
    userSelect: 'none',
  },
  overlayCloseBtn: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    background: 'rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    fontSize: '18px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    backdropFilter: 'blur(4px)',
  },
  overlayLoading: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid rgba(0, 198, 255, 0.2)',
    borderTop: '3px solid #00c6ff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  footer: {
    width: '100%',
    textAlign: 'center',
    padding: '24px 20px',
    borderTop: '1px solid rgba(0, 198, 255, 0.08)',
  },
  footerText: {
    fontSize: '12px',
    color: '#475569',
    fontFamily: "var(--font-inter), sans-serif",
  },
};
