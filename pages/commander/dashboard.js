/**
 * Commander Staff Dashboard - 6-Card Main Menu
 * Industrial metal card interface with sub-feature navigation
 * CSS-rendered metal plate icons with Lucide glyphs for perfect consistency
 * NO EMOJIS - Lucide icons only
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  // Waitlist
  Monitor, Users, TabletSmartphone, UserPlus, CreditCard, Eye,
  // Tournaments
  Trophy, BarChart3, Award, Sparkles,
  // Tables & Floor
  LayoutGrid, ArrowLeftRight, Map, DollarSign, Shuffle, PhoneCall,
  GraduationCap, RotateCcw, Heart,
  // Staff & Operations
  UserCog, Gamepad2, CalendarDays, ArrowRightLeft, Wallet, Clock,
  AlertTriangle, SlidersHorizontal, Dices, Gift,
  // Displays & Promotions
  Tv, Table2, Users2, Megaphone, Star, Layers, Video, Bell, Percent,
  // Reports & System
  FileText, Sun, TrendingUp, Activity, UserCheck, PieChart, BarChart,
  Grid3X3, ListChecks, Receipt, Rss, Brain, Settings, Cpu, Power,
  FolderDown, Download, Shield, ShoppingBag, ThumbsUp,
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

/* ─────────────────────────────────────────────────
   LUCIDE ICON MAP — maps string names to components
   ───────────────────────────────────────────────── */
const ICON_MAP = {
  Monitor, Users, TabletSmartphone, UserPlus, CreditCard, Eye,
  Trophy, BarChart3, Award, Sparkles,
  LayoutGrid, ArrowLeftRight, Map, DollarSign, Shuffle, PhoneCall,
  GraduationCap, RotateCcw, Heart,
  UserCog, Gamepad2, CalendarDays, ArrowRightLeft, Wallet, Clock,
  AlertTriangle, SlidersHorizontal, Dices, Gift,
  Tv, Table2, Users2, Megaphone, Star, Layers, Video, Bell, Percent,
  FileText, Sun, TrendingUp, Activity, UserCheck, PieChart, BarChart,
  Grid3X3, ListChecks, Receipt, Rss, Brain, Settings, Cpu, Power,
  FolderDown, Download, Shield, ShoppingBag, ThumbsUp,
};

/* ─────────────────────────────────────────────────
   CARD DEFINITIONS — each card has sub-features
   with Lucide icon names for CSS-rendered plates
   ───────────────────────────────────────────────── */
const CARDS = [
  {
    id: 'waitlist',
    title: 'Waitlist',
    subtitle: 'Players, Memberships, Kiosk',
    image: '/images/commander/card-waitlist.jpg',
    glow: '#22D3EE',
    features: [
      { label: 'Desk View', href: '/commander/waitlist/desk', icon: 'Monitor' },
      { label: 'Player Maintenance', href: '/commander/members', icon: 'Users' },
      { label: 'Player Kiosk', href: '/commander/kiosk', icon: 'TabletSmartphone' },
      { label: 'Member Import', href: '/commander/member-import', icon: 'UserPlus' },
      { label: 'Membership Plans', href: '/commander/membership-plans', icon: 'CreditCard' },
      { label: 'Player Display', href: '/commander/displays/waitlist', icon: 'Eye' },
    ],
  },
  {
    id: 'tournaments',
    title: 'Tournaments & Events',
    subtitle: 'Tournaments, Leagues, Promos',
    image: '/images/commander/card-tournaments.jpg',
    glow: '#F59E0B',
    features: [
      { label: 'Tournament Manager', href: '/commander/tournaments', icon: 'Trophy' },
      { label: 'Tournament Results', href: '/commander/reports/tournament-results', icon: 'BarChart3' },
      { label: 'Leagues', href: '/commander/leagues', icon: 'Award' },
      { label: 'High Hands', href: '/commander/high-hands', icon: 'Sparkles' },
    ],
  },
  {
    id: 'floor',
    title: 'Tables & Floor',
    subtitle: 'Tables, Dealers, Floor Ops',
    image: '/images/commander/card-floor.jpg?v=4',
    glow: '#22C55E',
    features: [
      { label: 'Tables', href: '/commander/tables', icon: 'LayoutGrid' },
      { label: 'Table Assignments', href: '/commander/table-assignments', icon: 'ArrowLeftRight' },
      { label: 'Floor Map', href: '/commander/floor', icon: 'Map' },
      { label: 'Open Cash Game', href: '/commander/open-game', icon: 'DollarSign' },
      { label: 'Must-Move Games', href: '/commander/must-move', icon: 'Shuffle' },
      { label: 'Floor Calls', href: '/commander/floor-calls', icon: 'PhoneCall' },
      { label: 'Dealers', href: '/commander/dealers', icon: 'GraduationCap' },
      { label: 'Dealer Rotation', href: '/commander/dealer-rotation', icon: 'RotateCcw' },
      { label: 'Table Vibes', href: '/commander/table-vibes', icon: 'Heart' },
    ],
  },
  {
    id: 'staff',
    title: 'Staff & Operations',
    subtitle: 'Employees, Schedule, Config',
    image: '/images/commander/card-staff.jpg',
    glow: '#DC2626',
    features: [
      { label: 'Employee Maintenance', href: '/commander/staff', icon: 'UserCog' },
      { label: 'Poker Room Functions', href: '/commander/poker-room', icon: 'Gamepad2' },
      { label: 'Staff Schedule', href: '/commander/schedule', icon: 'CalendarDays' },
      { label: 'Shift Handoff', href: '/commander/shift-handoff', icon: 'ArrowRightLeft' },
      { label: 'Cashier', href: '/commander/cashier', icon: 'Wallet' },
      { label: 'Time Billing', href: '/commander/time-billing', icon: 'Clock' },
      { label: 'Incidents', href: '/commander/incidents', icon: 'AlertTriangle' },
      { label: 'Room Presets', href: '/commander/room-presets', icon: 'SlidersHorizontal' },
      { label: 'Game Types', href: '/commander/game-types', icon: 'Dices' },
      { label: 'Comps', href: '/commander/comps', icon: 'Gift' },
    ],
  },
  {
    id: 'displays',
    title: 'Displays & Promotions',
    subtitle: 'TV Screens, Streaming, Alerts',
    image: '/images/commander/card-displays.jpg',
    glow: '#8B5CF6',
    features: [
      { label: 'TV Displays', href: '/commander/displays', icon: 'Tv' },
      { label: 'Display: Tables', href: '/commander/displays/tables', icon: 'Table2' },
      { label: 'Display: Dealers', href: '/commander/displays/dealers', icon: 'Users2' },
      { label: 'Display: Announcements', href: '/commander/displays/announcements', icon: 'Megaphone' },
      { label: 'Display: Promotions', href: '/commander/displays/promotions', icon: 'Star' },
      { label: 'Display: Leaderboard', href: '/commander/displays/leaderboard', icon: 'Trophy' },
      { label: 'Display: Combined', href: '/commander/displays/combined', icon: 'Layers' },
      { label: 'Streaming', href: '/commander/streaming', icon: 'Video' },
      { label: 'Notifications', href: '/commander/notifications', icon: 'Bell' },
      { label: 'Promotions', href: '/commander/promotions', icon: 'Percent' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & System',
    subtitle: 'Analytics, Configuration, Data',
    image: '/images/commander/card-reports.jpg',
    glow: '#94A3B8',
    features: [
      { label: 'Reports Hub', href: '/commander/reports', icon: 'FileText' },
      { label: 'Daily Summary', href: '/commander/reports/daily-summary', icon: 'Sun' },
      { label: 'Revenue Report', href: '/commander/reports/revenue', icon: 'TrendingUp' },
      { label: 'Staff Activity', href: '/commander/reports/staff-activity', icon: 'Activity' },
      { label: 'Player Activity', href: '/commander/reports/player-activity', icon: 'UserCheck' },
      { label: 'Analytics', href: '/commander/analytics', icon: 'PieChart' },
      { label: 'Analytics Daily', href: '/commander/reports/analytics-daily', icon: 'BarChart' },
      { label: 'Table Utilization', href: '/commander/reports/table-utilization', icon: 'Grid3X3' },
      { label: 'Waitlist Metrics', href: '/commander/reports/waitlist-metrics', icon: 'ListChecks' },
      { label: 'Tax / W-2G', href: '/commander/reports/tax-compliance', icon: 'Receipt' },
      { label: 'Activity Feed', href: '/commander/activity', icon: 'Rss' },
      { label: 'Churn Prediction', href: '/commander/churn-prediction', icon: 'Brain' },
      { label: 'Configuration', href: '/commander/settings', icon: 'Settings' },
      { label: 'System Info', href: '/commander/system-info', icon: 'Cpu' },
      { label: 'Close Day', href: '/commander/close-day', icon: 'Power' },
      { label: 'Exports', href: '/commander/exports', icon: 'FolderDown' },
      { label: 'Downloads', href: '/commander/downloads', icon: 'Download' },
      { label: 'Responsible Gaming', href: '/commander/responsible-gaming', icon: 'Shield' },
      { label: 'Marketplace', href: '/commander/marketplace', icon: 'ShoppingBag' },
      { label: 'Reputation', href: '/commander/reputation', icon: 'ThumbsUp' },
    ],
  },
];

/* ─────────────────────────────────────────────────
   METAL PLATE ICON — CSS-rendered, pixel-perfect
   Same frame for every single icon across all cards
   ───────────────────────────────────────────────── */
function MetalPlateIcon({ iconName, label, glowColor, onClick }) {
  const IconComponent = ICON_MAP[iconName];
  if (!IconComponent) return null;

  return (
    <button className="metal-plate-btn" onClick={onClick} style={{ '--glow': glowColor }}>
      <div className="metal-plate">
        {/* Corner bolts */}
        <div className="bolt bolt-tl" />
        <div className="bolt bolt-tr" />
        <div className="bolt bolt-bl" />
        <div className="bolt bolt-br" />
        {/* Neon border */}
        <div className="neon-border" />
        {/* Icon */}
        <div className="plate-icon">
          <IconComponent size={40} strokeWidth={1.5} />
        </div>
        {/* Label */}
        <div className="plate-label">{label}</div>
      </div>
    </button>
  );
}

export default function CommanderDashboard() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [activeCard, setActiveCard] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('commander_staff');
    if (!stored) { router.push('/commander/login'); return; }
    try {
      const data = JSON.parse(stored);
      if (!data.venue_id) { router.push('/commander/login'); return; }
      setStaff(data);
    } catch { router.push('/commander/login'); }
  }, [router]);

  if (!staff) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#666', fontSize: 14 }}>Loading...</div>
    </div>
  );

  const openCard = CARDS.find(c => c.id === activeCard);

  return (
    <CommanderLayout title="Club Commander | Dashboard" backHref="/commander/dashboard" hideBack={true}>
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
          object-fit: fill;
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

        /* ── SUB-FEATURE GRID ── */
        .cmd-features {
          flex: 1;
          overflow-y: auto;
          padding: 24px 20px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          align-content: start;
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
        }
        @media (max-width: 700px) {
          .cmd-features {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 16px;
          }
        }
        @media (max-width: 400px) {
          .cmd-features {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            padding: 12px;
          }
        }

        /* ════════════════════════════════════════════
           METAL PLATE ICON — identical across ALL cards
           ════════════════════════════════════════════ */
        .metal-plate-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s;
          width: 100%;
          aspect-ratio: 1;
        }
        .metal-plate-btn:hover {
          transform: translateY(-4px) scale(1.03);
          filter: brightness(1.15);
        }
        .metal-plate-btn:active {
          transform: translateY(0) scale(0.98);
        }

        .metal-plate {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 14px;
          /* Brushed metal background */
          background:
            radial-gradient(ellipse at 30% 20%, rgba(180,185,195,0.15) 0%, transparent 50%),
            linear-gradient(145deg, #2a2d33 0%, #1a1d22 30%, #22252b 50%, #1a1d22 70%, #2a2d33 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          overflow: hidden;
          box-shadow:
            0 0 15px color-mix(in srgb, var(--glow) 30%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 -1px 0 rgba(0,0,0,0.3);
        }

        /* Brushed metal texture overlay */
        .metal-plate::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 14px;
          background:
            repeating-linear-gradient(
              90deg,
              transparent,
              rgba(255,255,255,0.015) 1px,
              transparent 2px,
              transparent 4px
            );
          pointer-events: none;
        }

        /* Neon border glow */
        .neon-border {
          position: absolute;
          inset: 4px;
          border-radius: 10px;
          border: 2px solid var(--glow);
          box-shadow:
            0 0 8px color-mix(in srgb, var(--glow) 50%, transparent),
            inset 0 0 8px color-mix(in srgb, var(--glow) 20%, transparent);
          pointer-events: none;
        }

        /* Corner bolts — identical on every plate */
        .bolt {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, #555, #222 60%, #111);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.2),
            0 1px 2px rgba(0,0,0,0.5);
          z-index: 2;
        }
        .bolt-tl { top: 8px; left: 8px; }
        .bolt-tr { top: 8px; right: 8px; }
        .bolt-bl { bottom: 8px; left: 8px; }
        .bolt-br { bottom: 8px; right: 8px; }

        /* Icon glyph */
        .plate-icon {
          position: relative;
          z-index: 1;
          color: var(--glow);
          filter: drop-shadow(0 0 10px color-mix(in srgb, var(--glow) 60%, transparent));
          margin-top: 4px;
        }

        /* Label text */
        .plate-label {
          position: relative;
          z-index: 1;
          font-family: 'Orbitron', sans-serif;
          font-size: 10px;
          font-weight: 700;
          color: var(--glow);
          text-transform: uppercase;
          letter-spacing: 1px;
          text-shadow: 0 0 8px color-mix(in srgb, var(--glow) 50%, transparent);
          padding: 0 12px;
          text-align: center;
          line-height: 1.2;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
      `}</style>

        <div className="cmd-dashboard">
          {/* TOP BAR */}
          <div className="cmd-topbar">
            <div style={{ textAlign: 'right' }}>
              <div className="cmd-topbar-title">Club Commander</div>
              <div className="cmd-topbar-venue">{staff.venue_name || 'Poker Room'}</div>
            </div>
          </div>

          {/* ── MAIN: 6-CARD GRID ── */}
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

          {/* ── OPENED CARD: sub-features as metal plate icons ── */}
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
                  <MetalPlateIcon
                    key={i}
                    iconName={feat.icon}
                    label={feat.label}
                    glowColor={openCard.glow}
                    onClick={() => router.push(feat.href)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    </CommanderLayout>
  );
}
