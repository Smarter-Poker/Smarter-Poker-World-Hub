/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — LANDING PAGE
   Interactive hero image with clickable hotspot overlays
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─────────────────────────────────────────────────────────────────────────────
// HOTSPOT CONFIG — Each section of the landing image
// Positions are percentages relative to the image dimensions
// ─────────────────────────────────────────────────────────────────────────────
const HOTSPOTS = [
  {
    id: 'join-now',
    label: 'Join Now',
    top: 31.5,
    left: 30,
    width: 40,
    height: 4.5,
    action: 'navigate',
    href: '/auth/signup',
    cursor: 'pointer',
  },
  {
    id: 'global-connection',
    label: 'Global Connection & Competition',
    top: 38,
    left: 3,
    width: 46,
    height: 19.5,
    action: 'popup',
    cursor: 'pointer',
  },
  {
    id: 'elite-training',
    label: 'Elite Training & AI Assistance',
    top: 38,
    left: 51,
    width: 46,
    height: 19.5,
    action: 'popup',
    cursor: 'pointer',
  },
  {
    id: 'bankroll-discovery',
    label: 'Total Control: Bankroll & Discovery',
    top: 59,
    left: 3,
    width: 94,
    height: 14.5,
    action: 'popup',
    cursor: 'pointer',
  },
  {
    id: 'lifestyle-news',
    label: 'Lifestyle, News & Rewards',
    top: 75,
    left: 3,
    width: 46,
    height: 22,
    action: 'popup',
    cursor: 'pointer',
  },
  {
    id: 'club-commander',
    label: 'Club Commander: Host Management',
    top: 75,
    left: 51,
    width: 46,
    height: 22,
    action: 'navigate',
    href: '/commander/login',
    cursor: 'pointer',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [hoveredSpot, setHoveredSpot] = useState(null);
  const [activePopup, setActivePopup] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Close popup on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setActivePopup(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleHotspotClick = (spot) => {
    if (spot.action === 'navigate') {
      router.push(spot.href);
    } else {
      setActivePopup(spot);
    }
  };

  // Popup descriptions — placeholders for now
  const popupContent = {
    'global-connection': {
      title: 'Global Connection & Competition',
      icon: '🌐',
      items: [
        { name: 'Social Media', desc: 'Connect with friends & players worldwide' },
        { name: 'Poker Trivia', desc: 'Test your poker knowledge against the world' },
        { name: 'Diamond Arena', desc: 'Compete for Diamond rewards' },
        { name: 'Club Poker Arena', desc: 'Club vs Club competition' },
        { name: 'Diamond Arcade', desc: 'Arcade-style poker games' },
      ],
    },
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
  };

  return (
    <>
      <Head>
        <title>Smarter.Poker — The Future of the Game</title>
        <meta name="description" content="Train Smarter, Connect Globally, Manage Everything. The ultimate poker platform." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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

        {/* ── HERO IMAGE WITH HOTSPOTS ────────────────────────── */}
        <div style={styles.imageWrapper}>
          <img
            src="/images/landing-hero.jpg"
            alt="Smarter.Poker — The Future of the Game"
            style={{
              ...styles.heroImage,
              opacity: imageLoaded ? 1 : 0,
            }}
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />

          {/* Loading shimmer */}
          {!imageLoaded && <div style={styles.shimmer} />}

          {/* Clickable hotspot overlays */}
          {imageLoaded && HOTSPOTS.map((spot) => (
            <div
              key={spot.id}
              onClick={() => handleHotspotClick(spot)}
              onMouseEnter={() => setHoveredSpot(spot.id)}
              onMouseLeave={() => setHoveredSpot(null)}
              title={spot.label}
              style={{
                position: 'absolute',
                top: `${spot.top}%`,
                left: `${spot.left}%`,
                width: `${spot.width}%`,
                height: `${spot.height}%`,
                cursor: spot.cursor,
                borderRadius: '8px',
                transition: 'all 0.25s ease',
                background: hoveredSpot === spot.id
                  ? 'rgba(0, 198, 255, 0.12)'
                  : 'transparent',
                border: hoveredSpot === spot.id
                  ? '1px solid rgba(0, 198, 255, 0.4)'
                  : '1px solid transparent',
                boxShadow: hoveredSpot === spot.id
                  ? '0 0 20px rgba(0, 198, 255, 0.15), inset 0 0 20px rgba(0, 198, 255, 0.05)'
                  : 'none',
                zIndex: 2,
              }}
            />
          ))}
        </div>

        {/* ── POPUP OVERLAY ───────────────────────────────────── */}
        {activePopup && popupContent[activePopup.id] && (
          <div style={styles.popupBackdrop} onClick={() => setActivePopup(null)}>
            <div style={styles.popupCard} onClick={(e) => e.stopPropagation()}>
              {/* Close button */}
              <button onClick={() => setActivePopup(null)} style={styles.popupClose}>✕</button>

              {/* Header */}
              <div style={styles.popupHeader}>
                <span style={styles.popupIcon}>{popupContent[activePopup.id].icon}</span>
                <h2 style={styles.popupTitle}>{popupContent[activePopup.id].title}</h2>
              </div>

              {/* Feature list */}
              <div style={styles.popupBody}>
                {popupContent[activePopup.id].items.map((item, i) => (
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
        /* Hide scrollbar but allow scroll */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e17; }
        ::-webkit-scrollbar-thumb { background: #1a2a44; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #00c6ff; }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES
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

  // ── NAV
  nav: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'rgba(10, 14, 23, 0.92)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(0, 198, 255, 0.1)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '18px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  },
  navLinks: {
    display: 'flex',
    gap: '10px',
  },
  navButton: {
    background: 'transparent',
    border: '1px solid rgba(0, 198, 255, 0.4)',
    color: '#00c6ff',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
  },
  navButtonPrimary: {
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    border: 'none',
    color: '#ffffff',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
    boxShadow: '0 0 20px rgba(0, 198, 255, 0.25)',
  },

  // ── IMAGE
  imageWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0 12px',
  },
  heroImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: '0',
    transition: 'opacity 0.5s ease',
    userSelect: 'none',
  },
  shimmer: {
    width: '100%',
    paddingBottom: '180%', // approximate aspect ratio
    background: 'linear-gradient(90deg, #111827 25%, #1a2540 50%, #111827 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '12px',
  },

  // ── POPUP
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
    zIndex: 1000,
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
    transition: 'color 0.2s',
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

  // ── FOOTER
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
