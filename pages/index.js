/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — LANDING PAGE
   Full-width hero image with clickable hotspot overlays + haptic feedback
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─────────────────────────────────────────────────────────────────────────────
// HOTSPOT CONFIG — percentage positions over the hero image
// ─────────────────────────────────────────────────────────────────────────────
const HOTSPOTS = [
  {
    id: 'join-now',
    label: 'Join Now',
    // Covers the entire hero panel including the JOIN NOW button
    top: 0,
    left: 0,
    width: 100,
    height: 36,
    action: 'navigate',
    href: '/auth/signup',
  },
  {
    id: 'global-connection',
    label: 'Global Connection & Competition',
    top: 36.5,
    left: 1,
    width: 48,
    height: 21,
    action: 'image-popup',
    image: '/images/global-connection.jpg',
  },
  {
    id: 'elite-training',
    label: 'Elite Training & AI Assistance',
    top: 36.5,
    left: 51,
    width: 48,
    height: 21,
    action: 'popup',
  },
  {
    id: 'bankroll-discovery',
    label: 'Total Control: Bankroll & Discovery',
    top: 58.5,
    left: 1,
    width: 98,
    height: 15,
    action: 'popup',
  },
  {
    id: 'lifestyle-news',
    label: 'Lifestyle, News & Rewards',
    top: 74.5,
    left: 1,
    width: 48,
    height: 24,
    action: 'popup',
  },
  {
    id: 'club-commander',
    label: 'Club Commander: Host Management',
    top: 74.5,
    left: 51,
    width: 48,
    height: 24,
    action: 'navigate',
    href: '/commander/login',
  },
];

// ── Hotspots overlaid on the Global Connection detail image
const GC_HOTSPOTS = [
  {
    id: 'social-media',
    label: 'Social Media',
    top: 15,
    left: 3,
    width: 32,
    height: 33,
    action: 'popup',
  },
  {
    id: 'poker-trivia',
    label: 'Poker Trivia',
    top: 15,
    left: 35,
    width: 30,
    height: 33,
    action: 'popup',
  },
  {
    id: 'diamond-arena',
    label: 'Diamond Arena',
    top: 15,
    left: 65,
    width: 32,
    height: 33,
    action: 'popup',
  },
  {
    id: 'club-arena',
    label: 'Club Arena',
    top: 50,
    left: 5,
    width: 43,
    height: 33,
    action: 'popup',
  },
  {
    id: 'diamond-arcade',
    label: 'Diamond Arcade',
    top: 50,
    left: 52,
    width: 43,
    height: 33,
    action: 'popup',
  },
  {
    id: 'gc-back',
    label: 'Back to Main Menu',
    top: 86,
    left: 15,
    width: 70,
    height: 7,
    action: 'close',
  },
];

// Popup placeholder content
const POPUP_CONTENT = {
  'elite-training': {
    title: 'Elite Training & AI Assistance',
    icon: '🧠',
    items: [
      { name: 'GTO Mastery', desc: 'Over 100 training & memory games' },
      { name: 'Jarvis AI Assistant', desc: 'Find leaks in your game' },
      { name: 'Virtual Sandbox', desc: 'Practice scenarios risk-free' },
      { name: 'Hand Solving', desc: 'AI-powered hand analysis' },
    ],
  },
  'bankroll-discovery': {
    title: 'Total Control: Bankroll & Discovery',
    icon: '💎',
    items: [
      { name: 'Bankroll Manager', desc: 'Track expenses, wins, trips, series, table games, betting, slots & more' },
      { name: 'Poker Near Me', desc: 'Revolutionary search engine for venues, series, clubs & home games' },
    ],
  },
  'lifestyle-news': {
    title: 'Lifestyle, News & Rewards',
    icon: '📰',
    items: [
      { name: 'News Page', desc: 'Stay updated globally' },
      { name: 'Diamond Store', desc: 'Buy merch, trade diamonds for real world prizes' },
      { name: 'Video Library', desc: 'Unlimited content from favorite creators' },
    ],
  },
  'social-media': {
    title: 'Social Media',
    icon: '👥',
    items: [{ name: 'Stay Connected', desc: 'Connect with friends & players in the poker world' }],
  },
  'poker-trivia': {
    title: 'Poker Trivia',
    icon: '❓',
    items: [{ name: 'Test Your Knowledge', desc: 'Compete in poker trivia challenges' }],
  },
  'diamond-arena': {
    title: 'Diamond Arena',
    icon: '💎',
    items: [{ name: 'Live Poker & Tournaments', desc: 'Play live poker and tournaments with your diamonds' }],
  },
  'club-arena': {
    title: 'Club Arena',
    icon: '🦁',
    items: [{ name: 'Global Club Competition', desc: 'Play against other players in clubs around the world' }],
  },
  'diamond-arcade': {
    title: 'Diamond Arcade',
    icon: '🕹️',
    items: [{ name: 'Compete Under Pressure', desc: 'Win diamonds in arcade-style poker challenges' }],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK HELPER
// ─────────────────────────────────────────────────────────────────────────────
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(25);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [activePopup, setActivePopup] = useState(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [overlayLoaded, setOverlayLoaded] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setActivePopup(null);
        setImageOverlay(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleHotspotClick = (spot) => {
    triggerHaptic();
    if (spot.action === 'navigate') {
      router.push(spot.href);
    } else if (spot.action === 'image-popup') {
      setOverlayLoaded(false);
      setImageOverlay(spot.image);
    } else if (spot.action === 'popup') {
      setActivePopup(spot.id);
    }
  };

  const handleGcHotspotClick = (spot) => {
    triggerHaptic();
    if (spot.action === 'close') {
      setImageOverlay(null);
    } else if (spot.action === 'popup') {
      setActivePopup(spot.id);
    }
  };

  return (
    <>
      <Head>
        <title>Smarter.Poker — The Future of the Game</title>
        <meta name="description" content="Train Smarter, Connect Globally, Manage Everything. The ultimate poker platform." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

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
            alt="Smarter.Poker — The Future of the Game"
            style={{
              ...styles.heroImage,
              opacity: heroLoaded ? 1 : 0,
            }}
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

        {/* ── FULL-SCREEN IMAGE OVERLAY (Global Connection etc.) ── */}
        {imageOverlay && (
          <div style={styles.imageOverlayBackdrop}>
            <div style={styles.imageOverlayContainer}>
              <img
                src={imageOverlay}
                alt="Detail View"
                style={{
                  ...styles.imageOverlayImg,
                  opacity: overlayLoaded ? 1 : 0,
                }}
                onLoad={() => setOverlayLoaded(true)}
                draggable={false}
              />

              {!overlayLoaded && (
                <div style={styles.overlayLoading}>
                  <div style={styles.spinner} />
                </div>
              )}

              {overlayLoaded && imageOverlay === '/images/global-connection.jpg' && GC_HOTSPOTS.map((spot) => (
                <div
                  key={spot.id}
                  onClick={() => handleGcHotspotClick(spot)}
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
              ))}

              <button
                onClick={() => { triggerHaptic(); setImageOverlay(null); }}
                style={styles.overlayCloseBtn}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── TEXT POPUP OVERLAY ───────────────────────────────── */}
        {activePopup && POPUP_CONTENT[activePopup] && (
          <div style={styles.popupBackdrop} onClick={() => setActivePopup(null)}>
            <div style={styles.popupCard} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setActivePopup(null)} style={styles.popupClose}>✕</button>

              <div style={styles.popupHeader}>
                <span style={styles.popupIcon}>{POPUP_CONTENT[activePopup].icon}</span>
                <h2 style={styles.popupTitle}>{POPUP_CONTENT[activePopup].title}</h2>
              </div>

              <div style={styles.popupBody}>
                {POPUP_CONTENT[activePopup].items.map((item, i) => (
                  <div key={i} style={styles.popupItem}>
                    <div style={styles.popupItemDot} />
                    <div>
                      <div style={styles.popupItemName}>{item.name}</div>
                      <div style={styles.popupItemDesc}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.popupFooter}>
                <span style={styles.popupComingSoon}>Coming Soon — Full Interactive Details</span>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <footer style={styles.footer}>
          <span style={styles.footerText}>© 2025 Smarter.Poker — The Future of the Game</span>
        </footer>
      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #0a0e17; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e17; }
        ::-webkit-scrollbar-thumb { background: #1a2a44; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #00c6ff; }
        @keyframes spin {
          to { transform: rotate(360deg); }
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
  logo: {
    display: 'flex',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '16px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  navLinks: {
    display: 'flex',
    gap: '8px',
  },
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

  imageWrapper: {
    position: 'relative',
    width: '100%',
  },
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

  imageOverlayBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#0a0e17',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  imageOverlayContainer: {
    position: 'relative',
    width: '100%',
  },
  imageOverlayImg: {
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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

  popupBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    padding: '20px',
  },
  popupCard: {
    background: 'linear-gradient(145deg, #111827 0%, #0d1424 100%)',
    border: '1px solid rgba(0, 198, 255, 0.3)',
    borderRadius: '16px',
    padding: '28px',
    maxWidth: '480px',
    width: '100%',
    position: 'relative',
    boxShadow: '0 0 40px rgba(0, 198, 255, 0.12), 0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  popupClose: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(0, 198, 255, 0.15)',
  },
  popupIcon: {
    fontSize: '28px',
  },
  popupTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '0.5px',
  },
  popupBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  popupItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  popupItemDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00c6ff, #0072ff)',
    marginTop: '6px',
    flexShrink: 0,
    boxShadow: '0 0 8px rgba(0, 198, 255, 0.4)',
  },
  popupItemName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: '2px',
  },
  popupItemDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  popupFooter: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(0, 198, 255, 0.1)',
    textAlign: 'center',
  },
  popupComingSoon: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '11px',
    fontWeight: 500,
    color: '#00c6ff',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    opacity: 0.7,
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
