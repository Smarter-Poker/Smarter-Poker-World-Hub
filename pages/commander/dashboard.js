/**
 * Commander Staff Dashboard - 4-Card Main Menu
 * Industrial metal card interface with sub-feature navigation
 * NO EMOJIS - Lucide icons only
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { LogOut, ArrowLeft, X, Menu, Settings, Download, Users, QrCode } from 'lucide-react';

/* ─────────────────────────────────────────────────
   CARD DEFINITIONS — each card has sub-features
   that link to pages within Club Commander
   ───────────────────────────────────────────────── */
const CARDS = [
  {
    id: 'waitlist',
    title: 'Waitlist',
    subtitle: 'Memberships and Time',
    image: '/images/commander/card-waitlist.jpg',
    glow: '#22D3EE',
    features: [
      { label: 'Desk View', href: '/commander/waitlist/desk' },
      { label: 'Player View', href: '/commander/waitlist/player-view' },
      { label: 'Player Maintenance', href: '/commander/members' },
      { label: 'Player Kiosk', href: '/commander/waitlist/kiosk' },
    ],
  },
  {
    id: 'tournaments',
    title: 'Tournaments',
    subtitle: 'Registration, Controls, Clock',
    image: '/images/commander/card-tournaments.jpg',
    glow: '#F59E0B',
    features: [
      { label: 'Tournament Registration', href: '/commander/tournaments/registration' },
      { label: 'Tournament Controls', href: '/commander/tournaments/controls' },
      { label: 'Tournament Clock', href: '/commander/tournaments/clock' },
      { label: 'Tournament Maintenance', href: '/commander/tournaments/maintenance' },
      { label: 'Tournament Settings', href: '/commander/tournaments/settings' },
      { label: 'Tournament Clock Set Up', href: '/commander/tournaments/clock-setup' },
    ],
  },
  {
    id: 'management',
    title: 'Management',
    subtitle: 'Staff and Room Operations',
    image: '/images/commander/card-management.jpg',
    glow: '#EF4444',
    features: [
      { label: 'Employee Maintenance', href: '/commander/staff' },
      { label: 'Poker Room Functions', href: '/commander/management/poker-room' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports and Maintenance',
    subtitle: 'Analytics, Configuration, System',
    image: '/images/commander/card-reports.jpg',
    glow: '#94A3B8',
    features: [
      { label: 'Wait List Reports', href: '/commander/reports/waitlist' },
      { label: 'Player Reports', href: '/commander/reports/players' },
      { label: 'Tournament Reports', href: '/commander/reports/tournaments' },
      { label: 'Custom Reports', href: '/commander/reports/custom' },
      { label: 'Configuration', href: '/commander/settings' },
      { label: 'Setups', href: '/commander/reports/setups' },
      { label: 'Activity List', href: '/commander/reports/activity' },
      { label: 'System Information', href: '/commander/reports/system' },
    ],
  },
];

export default function CommanderDashboard() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [activeCard, setActiveCard] = useState(null); // which card is "opened"
  const [menuOpen, setMenuOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    const stored = localStorage.getItem('commander_staff');
    if (!stored) { router.push('/commander/login'); return; }
    try {
      const data = JSON.parse(stored);
      if (!data.venue_id) { router.push('/commander/login'); return; }
      setStaff(data);
    } catch { router.push('/commander/login'); }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('commander_staff');
    localStorage.removeItem('commander_venue');
    localStorage.removeItem('commander_subscription');
    router.push('/commander/login');
  };

  if (!staff) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#666', fontSize: 14 }}>Loading...</div>
    </div>
  );

  const openCard = CARDS.find(c => c.id === activeCard);

  return (
    <>
      <Head>
        <title>Club Commander | Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;500;600;700&display=swap');

        .cmd-dashboard {
          min-height: 100vh;
          background: #0a0a0a;
          font-family: 'Inter', sans-serif;
        }

        /* ── TOP BAR ── */
        .cmd-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
          border-bottom: 1px solid #222;
        }
        .cmd-topbar-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .cmd-topbar-venue {
          font-size: 11px;
          color: #888;
          margin-top: 2px;
        }
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

        /* ── HAMBURGER DROPDOWN ── */
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
          background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
          border-left: 1px solid #333;
          border-bottom: 1px solid #333;
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
        }
        .cmd-menu-close:hover { color: #fff; }
        .cmd-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 20px;
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
        .cmd-menu-divider {
          height: 1px;
          background: #222;
          margin: 8px 16px;
        }
        .cmd-menu-item.danger { color: #ef4444; }
        .cmd-menu-item.danger:hover { background: rgba(239,68,68,0.1); color: #f87171; }

        /* ── 4-CARD GRID ── */
        .cmd-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 16px;
          max-width: 900px;
          margin: 0 auto;
          height: calc(100vh - 65px);
          grid-template-rows: 1fr 1fr;
        }
        @media (max-width: 640px) {
          .cmd-grid {
            grid-template-columns: 1fr;
            grid-template-rows: repeat(4, 1fr);
            gap: 12px;
            padding: 12px;
          }
        }

        /* ── CARD ── */
        .cmd-card {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.3s;
          border: 2px solid #222;
          background: #0a0a0a;
          padding: 6px;
        }
        .cmd-card:hover {
          transform: scale(1.02);
        }
        .cmd-card img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          border-radius: 10px;
        }
        .cmd-card-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%);
          pointer-events: none;
        }

        /* ── OPENED CARD VIEW ── */
        .cmd-open {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: #0a0a0a;
          display: flex;
          flex-direction: column;
          animation: cmdFadeIn 0.3s ease;
        }
        @keyframes cmdFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .cmd-open-header {
          position: relative;
          width: 100%;
          height: 200px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .cmd-open-header img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
        }
        .cmd-open-header-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(10,10,10,0.95) 85%);
        }
        .cmd-open-back {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 10;
          background: rgba(0,0,0,0.6);
          border: 1px solid #444;
          border-radius: 10px;
          padding: 8px 14px;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
          backdrop-filter: blur(8px);
        }
        .cmd-open-back:hover {
          background: rgba(0,0,0,0.8);
          border-color: #666;
        }
        .cmd-open-title {
          position: absolute;
          bottom: 20px;
          left: 20px;
          z-index: 5;
          font-family: 'Orbitron', sans-serif;
          font-size: 28px;
          font-weight: 900;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 3px;
          text-shadow: 0 2px 20px rgba(0,0,0,0.8);
        }

        /* ── SUB-FEATURE BUTTONS ── */
        .cmd-features {
          flex: 1;
          overflow-y: auto;
          padding: 24px 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          align-content: start;
          max-width: 700px;
          margin: 0 auto;
          width: 100%;
        }
        @media (max-width: 480px) {
          .cmd-features {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 16px;
          }
        }
        .cmd-feature-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 28px 16px;
          border-radius: 14px;
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #fff;
          cursor: pointer;
          transition: all 0.25s;
          border: 2px solid;
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          text-shadow: 0 0 12px var(--glow);
          box-shadow: 0 0 0 rgba(0,0,0,0), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .cmd-feature-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 24px var(--glow-dim), inset 0 1px 0 rgba(255,255,255,0.1);
          border-color: var(--glow);
          background: linear-gradient(145deg, #1f1f1f 0%, #151515 100%);
        }
        .cmd-feature-btn:active {
          transform: translateY(0);
        }
      `}</style>

      <div className="cmd-dashboard">
        {/* TOP BAR */}
        <div className="cmd-topbar">
          <div>
            <div className="cmd-topbar-title">Club Commander</div>
            <div className="cmd-topbar-venue">{staff.venue_name || 'Poker Room'}</div>
          </div>
          <button className="cmd-hamburger" onClick={() => setMenuOpen(true)}>
            <Menu size={22} />
          </button>
        </div>

        {/* HAMBURGER MENU */}
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
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/members'); }}>
                <Users size={18} /> Members
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/qr-code'); }}>
                <QrCode size={18} /> QR Code
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/downloads'); }}>
                <Download size={18} /> Downloads
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/settings'); }}>
                <Settings size={18} /> Settings
              </button>
              <div className="cmd-menu-divider" />
              <button className="cmd-menu-item danger" onClick={handleLogout}>
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </>
        )}

        {/* ── MAIN: 4-CARD GRID ── */}
        {!activeCard && (
          <div className="cmd-grid">
            {CARDS.map(card => (
              <div
                key={card.id}
                className="cmd-card"
                style={{ boxShadow: `0 0 20px ${card.glow}30, inset 0 0 1px ${card.glow}40` }}
                onClick={() => setActiveCard(card.id)}
              >
                <img src={card.image} alt={card.title} />
                <div className="cmd-card-overlay" />
              </div>
            ))}
          </div>
        )}

        {/* ── OPENED CARD: sub-features ── */}
        {openCard && (
          <div className="cmd-open">
            <div className="cmd-open-header">
              <img src={openCard.image} alt={openCard.title} />
              <div className="cmd-open-header-overlay" />
              <button className="cmd-open-back" onClick={() => setActiveCard(null)}>
                <ArrowLeft size={16} /> Back
              </button>
              <div className="cmd-open-title" style={{ color: openCard.glow }}>
                {openCard.title}
              </div>
            </div>
            <div className="cmd-features">
              {openCard.features.map((feat, i) => (
                <button
                  key={i}
                  className="cmd-feature-btn"
                  style={{
                    borderColor: `${openCard.glow}50`,
                    '--glow': openCard.glow,
                    '--glow-dim': `${openCard.glow}30`,
                  }}
                  onClick={() => router.push(feat.href)}
                >
                  {feat.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
