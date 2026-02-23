/**
 * Commander Layout — Global Header Component
 * Provides the consistent Club Commander top bar across ALL pages:
 *   [☰ Hamburger] [← Back] .............. [CLUB COMMANDER / Venue Name]
 * 
 * Tier-gated sidebar: items show 🔒 when locked for current tier.
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
  Menu, X, Users, Clock, Layout, Map, Bell, Trophy,
  Monitor, DollarSign, Gift, Calendar, Tv, Activity, BarChart3,
  AlertTriangle, PlusCircle, Lock, Upload, QrCode, Settings, LogOut,
  Package, Briefcase, Globe, Crown
} from 'lucide-react';
import CommanderErrorBoundary from './CommanderErrorBoundary';
import { canAccessRoute, getUpgradeTier, getTierConfig, TIERS } from '../../../lib/commander/tierConfig';

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
  { label: 'Membership Plans', href: '/commander/membership-plans', icon: Crown },
  { label: 'QR Code', href: '/commander/qr-code', icon: QrCode },
  { label: 'Settings', href: '/commander/settings', icon: Settings },
];

export default function CommanderLayout({ children, title, backHref, hideBack }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [staff, setStaff] = useState(null);
  const [showClubPagePopup, setShowClubPagePopup] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(null); // null or { label, requiredTier }
  const [currentTier, setCurrentTier] = useState('home_game');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('commander_staff');
      if (stored) setStaff(JSON.parse(stored));
    } catch { }
    try {
      const sub = JSON.parse(localStorage.getItem('commander_subscription') || '{}');
      if (sub.tier) setCurrentTier(sub.tier);
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
    if (router.asPath !== '/commander/login') {
      router.push('/commander/login').catch(() => { });
    }
  };

  const handleNavClick = (item) => {
    const allowed = canAccessRoute(currentTier, item.href);
    if (allowed) {
      setMenuOpen(false);
      router.push(item.href);
    } else {
      const upgradeTo = getUpgradeTier(currentTier);
      const upgradeConfig = upgradeTo ? getTierConfig(upgradeTo) : null;
      setShowUpgradeModal({
        label: item.label,
        upgradeTierName: upgradeConfig?.name || 'a higher tier',
        upgradePrice: upgradeConfig?.price || '',
      });
    }
  };

  const venueName = staff?.venue_name || 'Poker Room';
  const currentTierConfig = getTierConfig(currentTier);
  const currentTierLabel = currentTierConfig?.name || 'Home Game';

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
          border-bottom: 2px solid #333;
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
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .cmd-hamburger:hover {
          transform: scale(1.1);
          filter: brightness(1.2);
        }
        .cmd-hamburger img {
          height: 32px;
          width: auto;
          display: block;
        }

        /* ── BACK IMAGE BUTTON ── */
        .cmd-back-img-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        .cmd-back-img-btn:hover {
          transform: scale(1.08);
          filter: brightness(1.3);
        }
        .cmd-back-img-btn img {
          height: 32px;
          width: auto;
          display: block;
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
          width: 280px;
          max-height: 100vh;
          overflow-y: auto;
          background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
          border-left: 2px solid #444;
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
          border-bottom: 2px solid #333;
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
        .cmd-menu-item.locked {
          color: #555;
        }
        .cmd-menu-item.locked:hover {
          color: #777;
          background: rgba(255,255,255,0.02);
        }
        .cmd-menu-item.danger {
          color: #EF4444;
        }
        .cmd-menu-item.danger:hover {
          background: rgba(239,68,68,0.1);
        }
        .cmd-menu-divider {
          height: 2px;
          background: #333;
          margin: 8px 16px;
        }
        .cmd-menu-lock-badge {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #F59E0B;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .cmd-menu-tier-badge {
          padding: 4px 10px 6px;
          margin: 4px 16px 8px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          color: #22D3EE;
          background: rgba(34,211,238,0.08);
          border: 2px solid rgba(34,211,238,0.2);
          text-align: center;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* ── HUB BUTTON (dashboard only) ── */
        .cmd-hub-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        .cmd-hub-btn:hover {
          transform: scale(1.08);
          filter: brightness(1.2);
        }
        .cmd-hub-btn img {
          height: 32px;
          width: auto;
          display: block;
        }
      `}</style>

      <CommanderErrorBoundary>
        {/* ── GLOBAL HEADER BAR ── */}
        <div className="cmd-global-header">
          <div className="cmd-global-left">
            <button className="cmd-hamburger" onClick={() => setMenuOpen(true)}>
              <img src="/images/commander/btn-hamburger.png" alt="Menu" />
            </button>
            {hideBack ? (
              /* Dashboard: show HUB button */
              <button
                className="cmd-hub-btn"
                onClick={() => router.push('/hub')}
                title="Back To Smarter.Poker Hub"
              >
                <img src="/images/btn-hub.png" alt="Hub" />
              </button>
            ) : (
              /* All other pages: show metallic BACK image */
              <button
                className="cmd-back-img-btn"
                onClick={() => {
                  router.push(backHref || '/commander/dashboard').catch(() => { });
                }}
                title="Go Back"
              >
                <img src="/images/commander/btn-back.png" alt="Back" />
              </button>
            )}
          </div>
          <div className="cmd-global-right">
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
              {/* Tier badge */}
              <div className="cmd-menu-tier-badge">
                {currentTierLabel} Plan
              </div>
              <button
                className="cmd-menu-item"
                style={{ color: '#22D3EE', fontWeight: 600 }}
                onClick={() => { setMenuOpen(false); router.push('/hub'); }}
              >
                <Globe size={18} /> Back To Hub
              </button>
              <div className="cmd-menu-divider" />
              {NAV_ITEMS.map((item, idx) => {
                if (item.divider) return <div key={`d-${idx}`} className="cmd-menu-divider" />;
                const Icon = item.icon;
                const isActive = router.asPath === item.href;
                const isLocked = !canAccessRoute(currentTier, item.href);
                return (
                  <button
                    key={item.href}
                    className={`cmd-menu-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                    onClick={() => handleNavClick(item)}
                  >
                    <Icon size={18} /> {item.label}
                    {isLocked && (
                      <span className="cmd-menu-lock-badge">
                        <Lock size={12} /> Upgrade
                      </span>
                    )}
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

        {/* ── UPGRADE MODAL ── */}
        {showUpgradeModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setShowUpgradeModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
            <div style={{
              position: 'relative', background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
              borderRadius: 16, width: '90%', maxWidth: 400, padding: 28,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
              border: '2px solid rgba(255,255,255,0.12)'
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #F59E0B, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Crown size={28} color="#fff" />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
                Upgrade Required
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>
                <strong style={{ color: '#F59E0B' }}>{showUpgradeModal.label}</strong> requires the{' '}
                <strong style={{ color: '#22D3EE' }}>{showUpgradeModal.upgradeTierName}</strong> plan
                {showUpgradeModal.upgradePrice && <> (${showUpgradeModal.upgradePrice}/mo)</>}.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => {
                    setShowUpgradeModal(null);
                    setMenuOpen(false);
                    router.push('/commander/settings?tab=subscription');
                  }}
                  style={{
                    padding: '12px 24px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #F59E0B, #EF4444)', color: '#fff',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    boxShadow: '0 4px 16px rgba(245,158,11,0.4)'
                  }}
                >
                  Upgrade Plan
                </button>
                <button
                  onClick={() => setShowUpgradeModal(null)}
                  style={{
                    padding: '10px 20px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: '#888',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                  }}
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CLUB PAGE CREATION POPUP ── */}
        {showClubPagePopup && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={dismissClubPagePopup} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
            <div style={{
              position: 'relative', background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
              borderRadius: 16, width: '90%', maxWidth: 440, padding: 28,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
              border: '2px solid rgba(255,255,255,0.12)'
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
                  padding: '10px 20px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)',
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
