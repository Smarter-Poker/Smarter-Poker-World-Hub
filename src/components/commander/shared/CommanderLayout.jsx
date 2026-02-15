/**
 * Commander Layout — Global Header Component
 * Provides the consistent Club Commander top bar across ALL pages:
 *   [☰ Hamburger] [← Back] .............. [CLUB COMMANDER / Venue Name]
 * 
 * Props:
 *   title       — page title for <Head> tag
 *   backHref    — where Back button navigates (default: /commander/dashboard)
 *   hideBack    — set true on dashboard to hide the back button
 *   children    — page content
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Menu, X, ArrowLeft, Users, Clock, Layout, Map, Bell, Trophy,
  Monitor, DollarSign, Gift, Calendar, Tv, Activity, BarChart3,
  AlertTriangle, PlusCircle, Lock, Upload, QrCode, Settings, LogOut,
  Package, Briefcase, Globe
} from 'lucide-react';
import CommanderErrorBoundary from './CommanderErrorBoundary';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/commander/dashboard', icon: Layout },
  { divider: true },
  { label: 'Waitlist Desk', href: '/commander/waitlist/desk', icon: Clock },
  { label: 'Members', href: '/commander/members', icon: Users },
  { label: 'Tables', href: '/commander/tables', icon: Layout },
  { label: 'Floor Map', href: '/commander/floor', icon: Map },
  { label: 'Floor Calls', href: '/commander/floor-calls', icon: Bell },
  { divider: true },
  { label: 'Tournaments', href: '/commander/tournaments', icon: Trophy },
  { label: 'Dealers', href: '/commander/dealers', icon: Users },
  { label: 'Kiosk', href: '/commander/kiosk', icon: Monitor },
  { divider: true },
  { label: 'Comps', href: '/commander/comps', icon: DollarSign },
  { label: 'Promotions', href: '/commander/promotions', icon: Gift },
  { label: 'Staff Schedule', href: '/commander/schedule', icon: Calendar },
  { label: 'TV Displays', href: '/commander/displays', icon: Tv },
  { label: 'Activity Feed', href: '/commander/activity', icon: Activity },
  { label: 'Reports', href: '/commander/reports', icon: BarChart3 },
  { label: 'Incidents', href: '/commander/incidents', icon: AlertTriangle },
  { divider: true },
  { label: 'Open Cash Game', href: '/commander/open-game', icon: PlusCircle },
  { label: 'Close Day', href: '/commander/close-day', icon: Lock },
  { label: 'Member Import', href: '/commander/member-import', icon: Upload },
  { label: 'QR Code', href: '/commander/qr-code', icon: QrCode },
  { label: 'Settings', href: '/commander/settings', icon: Settings },
];

export default function CommanderLayout({ children, title, backHref, hideBack }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [staff, setStaff] = useState(null);
  const [showClubPagePopup, setShowClubPagePopup] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('commander_staff');
      if (stored) setStaff(JSON.parse(stored));
    } catch { }
  }, []);

  // Club Page creation reminder popup
  useEffect(() => {
    if (!staff || !staff.venue_id) return;

    const checkClubPageReminder = async () => {
      try {
        // Check if already dismissed today
        const dismissKey = 'club_page_popup_dismissed';
        const lastDismissed = localStorage.getItem(dismissKey);
        if (lastDismissed) {
          const dismissDate = new Date(lastDismissed);
          const now = new Date();
          // If dismissed today, skip
          if (dismissDate.toDateString() === now.toDateString()) return;
        }

        // Check if account is at least 1 hour old (use subscription created_at if available)
        try {
          const sub = JSON.parse(localStorage.getItem('commander_subscription') || '{}');
          if (sub.created_at) {
            const createdAt = new Date(sub.created_at);
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (createdAt > hourAgo) return; // Less than 1 hour old, skip
          }
        } catch { }

        // Check if user already has a club page
        const res = await fetch(`/api/social/pages?linked_venue_id=${staff.venue_id}`);
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          // Already has a page, no need to remind
          return;
        }

        // Show the popup
        setShowClubPagePopup(true);
      } catch (e) {
        console.error('[Commander] Club page popup check error:', e);
      }
    };

    // Delay check to not interfere with page load
    const timer = setTimeout(checkClubPageReminder, 2000);
    return () => clearTimeout(timer);
  }, [staff]);

  const dismissClubPagePopup = () => {
    setShowClubPagePopup(false);
    localStorage.setItem('club_page_popup_dismissed', new Date().toISOString());
  };

  const handleLogout = () => {
    localStorage.removeItem('commander_staff');
    localStorage.removeItem('commander_venue');
    localStorage.removeItem('commander_subscription');
    localStorage.removeItem('commander_remember');
    router.push('/commander/login');
  };

  const venueName = staff?.venue_name || 'Poker Room';

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {title && <title>{title} | Club Commander</title>}
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;500;600;700&display=swap');

        /* ── GLOBAL COMMANDER HEADER ── */
        .cmd-global-header {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
          border-bottom: 1px solid #222;
          position: sticky;
          top: 0;
          z-index: 50;
          gap: 10px;
        }
        .cmd-global-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cmd-global-right {
          margin-left: auto;
          text-align: right;
        }
        .cmd-global-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        @media (min-width: 640px) {
          .cmd-global-title { font-size: 16px; }
        }
        .cmd-global-venue {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
        }

        /* ── HAMBURGER BUTTON ── */
        .cmd-hamburger {
          background: none;
          border: 1px solid #333;
          padding: 8px;
          border-radius: 8px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .cmd-hamburger:hover {
          border-color: #555;
          color: #fff;
          background: rgba(255,255,255,0.05);
        }

        /* ── BACK BUTTON ── */
        .cmd-back-btn {
          background: none;
          border: 1px solid #444;
          border-radius: 10px;
          padding: 8px 14px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
          text-decoration: none;
          white-space: nowrap;
        }
        .cmd-back-btn:hover {
          border-color: #666;
          color: #fff;
        }

        /* ── SLIDE-OUT MENU ── */
        .cmd-menu-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.5);
          animation: cmdMenuFade 0.15s ease;
        }
        @keyframes cmdMenuFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cmd-menu-panel {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 201;
          width: 260px;
          max-height: 100vh;
          overflow-y: auto;
          background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
          border-left: 1px solid #333;
          padding: 16px 0;
          animation: cmdMenuSlide 0.2s ease;
        }
        @keyframes cmdMenuSlide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .cmd-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px 12px;
          border-bottom: 1px solid #222;
          margin-bottom: 8px;
        }
        .cmd-menu-header-text {
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .cmd-menu-close {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .cmd-menu-close:hover {
          color: #fff;
        }
        .cmd-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 16px;
          background: none;
          border: none;
          color: #ccc;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .cmd-menu-item:hover {
          background: rgba(255,255,255,0.05);
          color: #fff;
        }
        .cmd-menu-item.active {
          color: #22D3EE;
          background: rgba(34,211,238,0.05);
        }
        .cmd-menu-item.danger {
          color: #EF4444;
        }
        .cmd-menu-item.danger:hover {
          background: rgba(239,68,68,0.1);
        }
        .cmd-menu-divider {
          height: 1px;
          background: #222;
          margin: 8px 16px;
        }

        /* ── HUB BUTTON ── */
        .cmd-hub-btn {
          background: none;
          border: 1px solid #22D3EE;
          border-radius: 10px;
          padding: 6px 12px;
          color: #22D3EE;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s;
          text-decoration: none;
          white-space: nowrap;
        }
        .cmd-hub-btn:hover {
          background: rgba(34,211,238,0.1);
          color: #fff;
          border-color: #fff;
        }
      `}</style>

      <CommanderErrorBoundary>
        {/* ── GLOBAL HEADER BAR ── */}
        <div className="cmd-global-header">
          <div className="cmd-global-left">
            <button className="cmd-hamburger" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </button>
            {!hideBack && (
              <button
                className="cmd-back-btn"
                onClick={() => {
                  // Use real browser history so Back always returns to the actual previous page
                  if (window.history.length > 1) {
                    router.back();
                  } else {
                    router.push('/commander/dashboard');
                  }
                }}
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}
          </div>
          <div className="cmd-global-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="cmd-hub-btn"
              onClick={() => router.push('/hub')}
              title="Back to Smarter.Poker Hub"
            >
              <Globe size={16} /> Hub
            </button>
            <div>
              <div className="cmd-global-title">Club Commander</div>
              <div className="cmd-global-venue">{venueName}</div>
            </div>
          </div>
        </div>

        {/* ── HAMBURGER SLIDE-OUT MENU ── */}
        {menuOpen && (
          <>
            <div className="cmd-menu-overlay" onClick={() => setMenuOpen(false)} />
            <div className="cmd-menu-panel">
              <div className="cmd-menu-header">
                <span className="cmd-menu-header-text">Menu</span>
                <button className="cmd-menu-close" onClick={() => setMenuOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <button
                className="cmd-menu-item"
                style={{ color: '#22D3EE', fontWeight: 600 }}
                onClick={() => { setMenuOpen(false); router.push('/hub'); }}
              >
                <Globe size={18} /> Back to Hub
              </button>
              <div className="cmd-menu-divider" />
              {NAV_ITEMS.map((item, idx) => {
                if (item.divider) return <div key={`d-${idx}`} className="cmd-menu-divider" />;
                const Icon = item.icon;
                const isActive = router.asPath === item.href;
                return (
                  <button
                    key={item.href}
                    className={`cmd-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => { setMenuOpen(false); router.push(item.href); }}
                  >
                    <Icon size={18} /> {item.label}
                  </button>
                );
              })}
              <div className="cmd-menu-divider" />
              <button className="cmd-menu-item danger" onClick={handleLogout}>
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </>
        )}

        {/* ── CLUB PAGE CREATION POPUP ── */}
        {showClubPagePopup && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={dismissClubPagePopup} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
            <div style={{
              position: 'relative', background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
              borderRadius: 16, width: '90%', maxWidth: 440, padding: 28,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              {/* Header icon */}
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #1877F2, #42B72A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <path d="M8 21V3" />
                  <path d="M16 3v18" />
                </svg>
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>Create Your Club Page</h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>
                Set up a public page for <strong style={{ color: '#ddd' }}>{venueName}</strong> on Smarter.Poker Social. Attract new players and keep your regulars updated.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => { dismissClubPagePopup(); router.push('/hub/social-media?createPage=true'); }} style={{
                  padding: '12px 24px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #1877F2, #166FE5)', color: '#fff',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 4px 16px rgba(24,119,242,0.4)'
                }}>Create Club Page</button>
                <button onClick={dismissClubPagePopup} style={{
                  padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: '#888',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                }}>Remind Me Later</button>
              </div>
            </div>
          </div>
        )}

        {/* ── PAGE CONTENT ── */}
        {children}
      </CommanderErrorBoundary>
    </>
  );
}
