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
    subtitle: 'Players, Memberships, Kiosk',
    image: '/images/commander/card-waitlist.jpg',
    glow: '#22D3EE',
    features: [
      { label: 'Desk View', href: '/commander/waitlist/desk', icon: '/images/commander/icons/wl-desk-view.png' },
      { label: 'Player Maintenance', href: '/commander/members', icon: '/images/commander/icons/wl-player-maintenance.png' },
      { label: 'Player Kiosk', href: '/commander/kiosk', icon: '/images/commander/icons/wl-player-kiosk.png' },
      { label: 'Member Import', href: '/commander/member-import', icon: '/images/commander/icons/wl-member-import.png' },
      { label: 'Membership Plans', href: '/commander/membership-plans', icon: '/images/commander/icons/mg-membership-plans.png' },
      { label: 'Player Display', href: '/commander/displays/waitlist', icon: '/images/commander/icons/wl-player-view.png' },
    ],
  },
  {
    id: 'tournaments',
    title: 'Tournaments & Events',
    subtitle: 'Tournaments, Leagues, Promos',
    image: '/images/commander/card-tournaments.jpg',
    glow: '#F59E0B',
    features: [
      { label: 'Tournament Manager', href: '/commander/tournaments', icon: '/images/commander/icons/tn-registration.png' },
      { label: 'Tournament Results', href: '/commander/reports/tournament-results', icon: '/images/commander/icons/rp-tournament.png' },
      { label: 'Leagues', href: '/commander/leagues', icon: '/images/commander/icons/tn-maintenance.png' },
      { label: 'High Hands', href: '/commander/high-hands', icon: '/images/commander/icons/tn-high-hands.png' },
      { label: 'Promotions', href: '/commander/promotions', icon: '/images/commander/icons/mg-promotions.png' },
      { label: 'Comps', href: '/commander/comps', icon: '/images/commander/icons/mg-comps.png' },
    ],
  },
  {
    id: 'floor',
    title: 'Tables & Floor',
    subtitle: 'Tables, Dealers, Floor Ops',
    image: '/images/commander/card-floor.jpg',
    glow: '#EF4444',
    features: [
      { label: 'Tables', href: '/commander/tables', icon: '/images/commander/icons/mg-tables.png' },
      { label: 'Table Assignments', href: '/commander/table-assignments', icon: '/images/commander/icons/mg-table-assignments.png' },
      { label: 'Floor Map', href: '/commander/floor', icon: '/images/commander/icons/mg-floor-map.png' },
      { label: 'Open Cash Game', href: '/commander/open-game', icon: '/images/commander/icons/mg-open-game.png' },
      { label: 'Must-Move Games', href: '/commander/must-move', icon: '/images/commander/icons/mg-must-move.png' },
      { label: 'Floor Calls', href: '/commander/floor-calls', icon: '/images/commander/icons/mg-floor-calls.png' },
      { label: 'Dealers', href: '/commander/dealers', icon: '/images/commander/icons/mg-dealers.png' },
      { label: 'Dealer Rotation', href: '/commander/dealer-rotation', icon: '/images/commander/icons/tn-clock.png' },
      { label: 'Table Vibes', href: '/commander/table-vibes', icon: '/images/commander/icons/mg-table-vibes.png' },
    ],
  },
  {
    id: 'staff',
    title: 'Staff & Operations',
    subtitle: 'Employees, Schedule, Config',
    image: '/images/commander/card-staff.jpg',
    glow: '#10B981',
    features: [
      { label: 'Employee Maintenance', href: '/commander/staff', icon: '/images/commander/icons/mg-employee.png' },
      { label: 'Poker Room Functions', href: '/commander/poker-room', icon: '/images/commander/icons/mg-poker-room.png' },
      { label: 'Staff Schedule', href: '/commander/schedule', icon: '/images/commander/icons/tn-clock-setup.png' },
      { label: 'Shift Handoff', href: '/commander/shift-handoff', icon: '/images/commander/icons/mg-shift-handoff.png' },
      { label: 'Cashier', href: '/commander/cashier', icon: '/images/commander/icons/mg-cashier.png' },
      { label: 'Time Billing', href: '/commander/time-billing', icon: '/images/commander/icons/mg-time-billing.png' },
      { label: 'Incidents', href: '/commander/incidents', icon: '/images/commander/icons/mg-incidents.png' },
      { label: 'Room Presets', href: '/commander/room-presets', icon: '/images/commander/icons/mg-room-presets.png' },
      { label: 'Game Types', href: '/commander/game-types', icon: '/images/commander/icons/tn-settings.png' },
    ],
  },
  {
    id: 'displays',
    title: 'Displays & Promotions',
    subtitle: 'TV Screens, Streaming, Alerts',
    image: '/images/commander/card-displays.jpg',
    glow: '#8B5CF6',
    features: [
      { label: 'TV Displays', href: '/commander/displays', icon: '/images/commander/icons/mg-tv-displays.png' },
      { label: 'Display: Tables', href: '/commander/displays/tables', icon: '/images/commander/icons/mg-display-tables.png' },
      { label: 'Display: Dealers', href: '/commander/displays/dealers', icon: '/images/commander/icons/mg-display-dealers.png' },
      { label: 'Display: Announcements', href: '/commander/displays/announcements', icon: '/images/commander/icons/mg-display-announcements.png' },
      { label: 'Display: Promotions', href: '/commander/displays/promotions', icon: '/images/commander/icons/mg-display-promotions.png' },
      { label: 'Display: Leaderboard', href: '/commander/displays/leaderboard', icon: '/images/commander/icons/mg-display-leaderboard.png' },
      { label: 'Display: Combined', href: '/commander/displays/combined', icon: '/images/commander/icons/mg-display-combined.png' },
      { label: 'Streaming', href: '/commander/streaming', icon: '/images/commander/icons/mg-streaming.png' },
      { label: 'Notifications', href: '/commander/notifications', icon: '/images/commander/icons/mg-notifications.png' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & System',
    subtitle: 'Analytics, Configuration, Data',
    image: '/images/commander/card-reports.jpg',
    glow: '#94A3B8',
    features: [
      { label: 'Reports Hub', href: '/commander/reports', icon: '/images/commander/icons/rp-player.png' },
      { label: 'Daily Summary', href: '/commander/reports/daily-summary', icon: '/images/commander/icons/rp-daily-summary.png' },
      { label: 'Revenue Report', href: '/commander/reports/revenue', icon: '/images/commander/icons/rp-revenue.png' },
      { label: 'Staff Activity', href: '/commander/reports/staff-activity', icon: '/images/commander/icons/rp-activity.png' },
      { label: 'Player Activity', href: '/commander/reports/player-activity', icon: '/images/commander/icons/rp-player-activity.png' },
      { label: 'Analytics', href: '/commander/analytics', icon: '/images/commander/icons/rp-custom.png' },
      { label: 'Analytics Daily', href: '/commander/reports/analytics-daily', icon: '/images/commander/icons/rp-analytics-daily.png' },
      { label: 'Table Utilization', href: '/commander/reports/table-utilization', icon: '/images/commander/icons/rp-table-utilization.png' },
      { label: 'Waitlist Metrics', href: '/commander/reports/waitlist-metrics', icon: '/images/commander/icons/rp-waitlist.png' },
      { label: 'Tax / W-2G', href: '/commander/reports/tax-compliance', icon: '/images/commander/icons/rp-tax.png' },
      { label: 'Activity Feed', href: '/commander/activity', icon: '/images/commander/icons/rp-activity-feed.png' },
      { label: 'Churn Prediction', href: '/commander/churn-prediction', icon: '/images/commander/icons/rp-churn-prediction.png' },
      { label: 'Configuration', href: '/commander/settings', icon: '/images/commander/icons/rp-setups.png' },
      { label: 'System Info', href: '/commander/system-info', icon: '/images/commander/icons/rp-system.png' },
      { label: 'Close Day', href: '/commander/close-day', icon: '/images/commander/icons/rp-close-day.png' },
      { label: 'Exports', href: '/commander/exports', icon: '/images/commander/icons/rp-config.png' },
      { label: 'Downloads', href: '/commander/downloads', icon: '/images/commander/icons/rp-downloads.png' },
      { label: 'Responsible Gaming', href: '/commander/responsible-gaming', icon: '/images/commander/icons/rp-responsible-gaming.png' },
      { label: 'Marketplace', href: '/commander/marketplace', icon: '/images/commander/icons/rp-marketplace.png' },
      { label: 'Reputation', href: '/commander/reputation', icon: '/images/commander/icons/rp-reputation.png' },
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
    localStorage.removeItem('commander_remember');
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

        /* ── 6-CARD GRID ── */
        .cmd-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
          padding: 16px;
          max-width: 1100px;
          margin: 0 auto;
          height: calc(100vh - 65px);
          grid-template-rows: 1fr 1fr;
        }
        @media (max-width: 900px) {
          .cmd-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: repeat(3, 1fr);
            gap: 12px;
          }
        }
        @media (max-width: 640px) {
          .cmd-grid {
            grid-template-columns: 1fr;
            grid-template-rows: repeat(6, minmax(120px, 1fr));
            gap: 10px;
            padding: 12px;
            height: auto;
            min-height: calc(100vh - 65px);
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
          background: #0a0a0a;
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
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          border-bottom: 1px solid #222;
          background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
          flex-shrink: 0;
        }
        .cmd-open-back {
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
        }
        .cmd-open-back:hover {
          border-color: #666;
          color: #fff;
        }
        .cmd-open-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 22px;
          font-weight: 900;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 3px;
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
        .cmd-features-stacked {
          grid-template-columns: 1fr !important;
          max-width: 90% !important;
          gap: 24px !important;
          justify-items: center;
        }
        .cmd-features-stacked .cmd-feature-btn {
          width: 100%;
          max-width: 600px;
          min-height: 200px;
        }
        .cmd-features-stacked .cmd-feature-btn img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .cmd-feature-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.25s;
          border: none;
          overflow: hidden;
          background: transparent;
          box-shadow: none;
        }
        .cmd-feature-btn img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .cmd-feature-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 6px 30px var(--glow-dim), inset 0 1px 0 rgba(255,255,255,0.1);
          border-color: var(--glow);
        }
        .cmd-feature-btn:active {
          transform: translateY(0);
        }
      `}</style>

      <div className="cmd-dashboard">
        {/* TOP BAR */}
        <div className="cmd-topbar">
          <button className="cmd-hamburger" onClick={() => setMenuOpen(true)}>
            <img src="/images/btn-hamburger.png" alt="Menu" style={{ height: 22, width: 22, objectFit: 'contain' }} />
          </button>
          <div style={{ textAlign: 'right' }}>
            <div className="cmd-topbar-title">Club Commander</div>
            <div className="cmd-topbar-venue">{staff.venue_name || 'Poker Room'}</div>
          </div>
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
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/waitlist/desk'); }}>
                <Clock size={18} /> Waitlist Desk
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/tables'); }}>
                <Layout size={18} /> Tables
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/floor'); }}>
                <Map size={18} /> Floor Map
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/floor-calls'); }}>
                <Bell size={18} /> Floor Calls
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/tournaments'); }}>
                <Trophy size={18} /> Tournaments
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/dealers'); }}>
                <Users size={18} /> Dealers
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/kiosk'); }}>
                <Monitor size={18} /> Kiosk
              </button>
              <div className="cmd-menu-divider" />
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/comps'); }}>
                <DollarSign size={18} /> Comps
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/promotions'); }}>
                <Gift size={18} /> Promotions
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/schedule'); }}>
                <Calendar size={18} /> Staff Schedule
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/displays'); }}>
                <Tv size={18} /> TV Displays
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/activity'); }}>
                <Activity size={18} /> Activity Feed
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/reports'); }}>
                <BarChart3 size={18} /> Reports
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/incidents'); }}>
                <AlertTriangle size={18} /> Incidents
              </button>
              <div className="cmd-menu-divider" />
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/open-game'); }}>
                <PlusCircle size={18} /> Open Cash Game
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/close-day'); }}>
                <Lock size={18} /> Close Day
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/member-import'); }}>
                <Upload size={18} /> Member Import
              </button>
              <button className="cmd-menu-item" onClick={() => { setMenuOpen(false); router.push('/commander/qr-code'); }}>
                <QrCode size={18} /> QR Code
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
                    '--glow': openCard.glow,
                    '--glow-dim': `${openCard.glow}30`,
                  }}
                  onClick={() => router.push(feat.href)}
                >
                  <img src={feat.icon} alt={feat.label} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
