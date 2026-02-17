/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — LANDING PAGE
   Full-width hero image with clickable hotspot overlays + haptic feedback
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead, { schemas } from '../src/components/seo/SEOHead';

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
    id: 'join-now',
    top: 0, left: 0, width: 100, height: 36,
    action: 'navigate', href: '/auth/signup',
  },
  {
    id: 'global-connection',
    top: 36.5, left: 1, width: 48, height: 21,
    action: 'overlay', image: '/images/global-connection.jpg', overlayKey: 'gc',
  },
  {
    id: 'elite-training',
    top: 36.5, left: 51, width: 48, height: 21,
    action: 'overlay', image: '/images/elite-training.jpg', overlayKey: 'et',
  },
  {
    id: 'bankroll-discovery',
    top: 58.5, left: 1, width: 98, height: 15,
    action: 'overlay', image: '/images/total-discovery.jpg', overlayKey: 'td',
  },
  {
    id: 'lifestyle-news',
    top: 74.5, left: 1, width: 48, height: 24,
    action: 'overlay', image: '/images/lifestyle-rewards.jpg', overlayKey: 'lr',
  },
  {
    id: 'club-commander',
    top: 74.5, left: 51, width: 48, height: 24,
    action: 'navigate', href: '/commander/login',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY HOTSPOT CONFIGS — clickable zones on each detail image
// Cards go to signup, back/CTA buttons close or go to signup
// ─────────────────────────────────────────────────────────────────────────────
const OVERLAY_HOTSPOTS = {
  // Global Connection
  gc: [
    { id: 'gc-social', top: 15, left: 3, width: 32, height: 33, action: 'signup' },
    { id: 'gc-trivia', top: 15, left: 35, width: 30, height: 33, action: 'signup' },
    { id: 'gc-diamond', top: 15, left: 65, width: 32, height: 33, action: 'signup' },
    { id: 'gc-club', top: 50, left: 5, width: 43, height: 33, action: 'signup' },
    { id: 'gc-arcade', top: 50, left: 52, width: 43, height: 33, action: 'signup' },
    { id: 'gc-back', top: 86, left: 15, width: 70, height: 7, action: 'close' },
  ],
  // Elite Training
  et: [
    { id: 'et-training', top: 20, left: 3, width: 47, height: 30, action: 'signup' },
    { id: 'et-memory', top: 20, left: 52, width: 46, height: 30, action: 'signup' },
    { id: 'et-assistant', top: 52, left: 3, width: 47, height: 32, action: 'signup' },
    { id: 'et-sandbox', top: 52, left: 52, width: 46, height: 32, action: 'signup' },
    { id: 'et-cta', top: 88, left: 10, width: 80, height: 7, action: 'signup' },
  ],
  // Total Control: Bankroll & Discovery
  td: [
    { id: 'td-bankroll', top: 22, left: 3, width: 46, height: 65, action: 'signup' },
    { id: 'td-pokernear', top: 22, left: 52, width: 46, height: 65, action: 'signup' },
    { id: 'td-cta', top: 90, left: 15, width: 70, height: 7, action: 'signup' },
  ],
  // Lifestyle, News & Rewards
  lr: [
    { id: 'lr-news', top: 16, left: 5, width: 90, height: 22, action: 'signup' },
    { id: 'lr-store', top: 40, left: 5, width: 90, height: 22, action: 'signup' },
    { id: 'lr-video', top: 64, left: 5, width: 90, height: 22, action: 'signup' },
    { id: 'lr-cta', top: 89, left: 10, width: 80, height: 7, action: 'signup' },
  ],
};

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
      setOverlay({ image: spot.image, overlayKey: spot.overlayKey });
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
        title="Smarter.Poker — The Future Of The Game"
        description="Train Smarter, Connect Globally, Manage Everything. The Ultimate Poker Platform For GTO Training, Live Venue Discovery, Bankroll Tracking, Trivia, And Community."
        canonical="/"
        jsonLd={[schemas.organization, schemas.website, schemas.softwareApp]}
      >
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </SEOHead>

      <div style={styles.page}>
        {/* ── NAV BAR ─────────────────────────────────────────── */}
        <nav style={styles.nav}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SMARTER.POKER</span>
          </div>
          <div style={styles.navLinks}>
            <button onClick={() => router.push('/auth/signup')} style={styles.navButton}>
              Sign Up
            </button>
            <button onClick={() => router.push('/auth/signin')} style={styles.navButtonPrimary}>
              Sign In
            </button>
          </div>
        </nav>

        {/* ── FULL-WIDTH HERO IMAGE WITH HOTSPOTS ─────────────── */}
        <div style={styles.imageWrapper}>
          <img
            src="/images/landing-hero.jpg"
            alt="Smarter.Poker — The Future Of The Game"
            style={{ ...styles.heroImage, opacity: heroLoaded ? 1 : 0 }}
            onLoad={() => setHeroLoaded(true)}
            draggable={false}
          />
          {!heroLoaded && <div style={styles.shimmer} />}
          {heroLoaded && HOTSPOTS.map((spot) => (
            <div
              key={spot.id}
              onClick={() => handleHotspotClick(spot)}
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
        </div>

        {/* ── FULL-SCREEN IMAGE OVERLAY ───────────────────────── */}
        {overlay && (
          <div style={styles.overlayBackdrop}>
            <div style={styles.overlayContainer}>
              <img
                src={overlay.image}
                alt="Detail View"
                style={{ ...styles.overlayImg, opacity: overlayLoaded ? 1 : 0 }}
                onLoad={() => setOverlayLoaded(true)}
                draggable={false}
              />
              {!overlayLoaded && (
                <div style={styles.overlayLoading}>
                  <div style={styles.spinner} />
                </div>
              )}

              {/* Overlay hotspots */}
              {overlayLoaded && OVERLAY_HOTSPOTS[overlay.overlayKey] &&
                OVERLAY_HOTSPOTS[overlay.overlayKey].map((spot) => (
                  <div
                    key={spot.id}
                    onClick={() => handleOverlayHotspotClick(spot)}
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

              {/* Close X button */}
              <button
                onClick={() => { triggerHaptic(); setOverlay(null); }}
                style={styles.overlayCloseBtn}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <footer style={styles.footer}>
          <span style={styles.footerText}>© 2025 Smarter.Poker — The Future Of The Game</span>
        </footer>
      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #0a0e17; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e17; }
        ::-webkit-scrollbar-thumb { background: #1a2a44; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #00c6ff; }
        @keyframes spin { to { transform: rotate(360deg); } }
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
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '16px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  navLinks: { display: 'flex', gap: '8px' },
  navButton: {
    background: 'transparent',
    border: '1px solid rgba(0, 198, 255, 0.4)',
    color: '#00c6ff',
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
  },
  navButtonPrimary: {
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    border: 'none',
    color: '#ffffff',
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    boxShadow: '0 0 20px rgba(0, 198, 255, 0.25)',
  },
  imageWrapper: { position: 'relative', width: '100%' },
  heroImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    transition: 'opacity 0.4s ease',
    userSelect: 'none',
  },
  shimmer: {
    width: '100%',
    paddingBottom: '180%',
    background: 'linear-gradient(90deg, #111827 25%, #1a2540 50%, #111827 75%)',
    backgroundSize: '200% 100%',
  },
  overlayBackdrop: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: '#0a0e17',
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
    fontFamily: "'Inter', sans-serif",
  },
};
