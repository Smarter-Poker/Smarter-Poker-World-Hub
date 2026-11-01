/**
 * TOURNAMENTS THIS WEEKEND - Intent-Based Programmatic Landing Page
 * Aggregates all poker tournaments running Friday, Saturday, and Sunday.
 * Optimized for high-volume search queries: "poker tournaments this weekend",
 * "weekend poker tournaments near me", "poker tournaments today and this weekend".
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Calendar as CalendarLuc,
  ChevronRight as ChevRight,
  Clock as ClockLuc,
  MapPin as MapPinLuc,
  Trophy as TrophyLuc,
  DollarSign as DollarLuc,
} from 'lucide-react';
import useSWR from 'swr';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import PokerIdentityMark from '../../../src/components/poker-near-me/PokerIdentityMark';
import { homeGameUrl } from '../../../src/lib/home-games/urls';
import { buildDailyTournamentSchema, serializePokerJsonLd } from '../../../src/lib/poker-near-me/structuredData';
import { getWeekendDates } from '../../../src/lib/poker-near-me/weekendSchedule.mjs';
import { datasetSchema, faqSchema } from '../../../src/lib/seo/hubPageSchema';

const WEEKEND_TOURNAMENTS_FAQS = [
  {
    question: 'How Do I Find Poker Tournaments Running This Weekend Near Me?',
    answer: 'Smarter.Poker Aggregates All Recurring And Special Friday, Saturday, And Sunday Live Poker Tournaments Across 324+ Verified Casino Poker Rooms And Licensed Cardrooms. Filter By Day (Friday, Saturday, Sunday), State, Or Buy-In Range To Compare Start Times And Guaranteed Prize Pools.',
  },
  {
    question: 'Which Weekend Day Has The Largest Guaranteed Poker Tournaments?',
    answer: 'Saturday Afternoon And Sunday Morning Sessions Feature The Largest Guaranteed Prize Pools (GTD) And Deepest Starting Stacks At Most North American Cardrooms, While Friday Nights Feature Turbo And Bounty Warm-Up Events.',
  },
  {
    question: 'Does Smarter.Poker Host Free Online Weekend Poker Tournaments?',
    answer: 'Yes. Smarter.Poker Hosts $2,000 In Free Online Poker Tournaments Every Day Of The Weekend Plus Diamond Freerolls Every 3 Hours With Zero Entry Fees At Smarter.Poker/Freerolls.',
  },
];

const POPULAR_STATES = [
  { name: 'Texas', abbr: 'TX' },
  { name: 'California', abbr: 'CA' },
  { name: 'Florida', abbr: 'FL' },
  { name: 'Nevada', abbr: 'NV' },
];

const BUYIN_RANGES = [
  { label: 'All Buy-Ins', min: null, max: null },
  { label: 'Under $100', min: null, max: 100 },
  { label: '$100 - $300', min: 100, max: 300 },
  { label: '$300 - $500', min: 300, max: 500 },
  { label: '$500+', min: 500, max: null },
];

function formatTime(timeStr) {
  if (!timeStr) return '';
  const clean = timeStr.trim().replace(/^(\d{1,2}:\d{2}):\d{2}\s*(AM|PM)?/i, (_, hm, ap) => ap ? `${hm}${ap}` : hm);
  if (!clean.match(/[AP]M/i)) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1].replace(/\D/g, '').slice(0, 2).padStart(2, '0');
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${h}:${m} ${ampm}`;
      }
    }
    const noColon = clean.match(/^(\d{1,2})([AP]M)$/i);
    if (noColon) {
      return `${parseInt(noColon[1], 10)}:00 ${noColon[2].toUpperCase()}`;
    }
    return clean;
  }
  const noColonAMPM = clean.match(/^(\d{1,2})\s*([AP]M)$/i);
  if (noColonAMPM) {
    return `${parseInt(noColonAMPM[1], 10)}:00 ${noColonAMPM[2].toUpperCase()}`;
  }
  return clean
    .replace(/(\d)(([AP]M))$/i, (_, d, ampm) => `${d} ${ampm.toUpperCase()}`)
    .replace(/\s{2,}/g, ' ')
    .replace(/([ap]m)/i, s => s.toUpperCase())
    .replace(/^0(\d)/, '$1');
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  return `$${amount.toLocaleString()}`;
}

export default function TournamentsThisWeekendPage({ initialTournaments = [] }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig('hub'), []);

  // Filter state
  const [selectedDayTab, setSelectedDayTab] = useState('ALL'); // 'ALL' | 'Friday' | 'Saturday' | 'Sunday'
  const [selectedState, setSelectedState] = useState('');
  const [selectedBuyin, setSelectedBuyin] = useState(BUYIN_RANGES[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const weekendInfo = useMemo(() => getWeekendDates(), []);

  // Multi-day SWR fetch for Friday, Saturday, Sunday
  const fetcher = (url) => fetch(url).then((r) => r.json());
  const { data: friData, isLoading: friLoading } = useSWR('/api/poker/daily-tournaments?day=Friday', fetcher);
  const { data: satData, isLoading: satLoading } = useSWR('/api/poker/daily-tournaments?day=Saturday', fetcher);
  const { data: sunData, isLoading: sunLoading } = useSWR('/api/poker/daily-tournaments?day=Sunday', fetcher);

  const isLoading = (friLoading || satLoading || sunLoading) && initialTournaments.length === 0;

  // Aggregate tournaments across the full weekend
  const allWeekendTournaments = useMemo(() => {
    const list = [];
    if (friData?.tournaments) {
      friData.tournaments.forEach(t => list.push({ ...t, weekendDay: 'Friday', weekendDate: weekendInfo.friday }));
    }
    if (satData?.tournaments) {
      satData.tournaments.forEach(t => list.push({ ...t, weekendDay: 'Saturday', weekendDate: weekendInfo.saturday }));
    }
    if (sunData?.tournaments) {
      sunData.tournaments.forEach(t => list.push({ ...t, weekendDay: 'Sunday', weekendDate: weekendInfo.sunday }));
    }
    if (list.length === 0 && initialTournaments && initialTournaments.length > 0) {
      return initialTournaments;
    }
    return list;
  }, [friData, satData, sunData, weekendInfo, initialTournaments]);

  // Filtered view
  const filteredTournaments = useMemo(() => {
    return allWeekendTournaments.filter((t) => {
      if (selectedDayTab !== 'ALL' && t.weekendDay !== selectedDayTab) return false;
      if (selectedState && t.state !== selectedState) return false;
      if (selectedBuyin.min !== null && (t.buy_in || 0) < selectedBuyin.min) return false;
      if (selectedBuyin.max !== null && (t.buy_in || 0) > selectedBuyin.max) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const vName = (t.venue_name || '').toLowerCase();
        const tName = (t.tournament_name || '').toLowerCase();
        const city = (t.city || '').toLowerCase();
        if (!vName.includes(q) && !tName.includes(q) && !city.includes(q)) return false;
      }
      return true;
    });
  }, [allWeekendTournaments, selectedDayTab, selectedState, selectedBuyin, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const venues = new Set(allWeekendTournaments.map(t => t.venue_name)).size;
    const totalPrizePools = allWeekendTournaments.reduce((sum, t) => sum + (t.guaranteed || 0), 0);
    return {
      total: allWeekendTournaments.length,
      venues,
      totalPrizePools,
      fridayCount: (friData?.tournaments || []).length,
      saturdayCount: (satData?.tournaments || []).length,
      sundayCount: (sunData?.tournaments || []).length,
    };
  }, [allWeekendTournaments, friData, satData, sunData]);

  // Structured Data (Schema.org CollectionPage + ItemList of SportsEvents)
  const structuredData = useMemo(() => {
    return buildDailyTournamentSchema(
      filteredTournaments.slice(0, 50),
      new Date().toISOString(),
      {
        canonical: 'https://smarter.poker/hub/tournaments/this-weekend',
        pageName: 'Poker Tournaments This Weekend',
        pageDescription: `Browse upcoming weekend poker tournaments from ${weekendInfo.weekendRangeLabel}. Find buy-ins, schedules, and guaranteed prize pools across verified poker rooms.`,
      }
    );
  }, [filteredTournaments, weekendInfo]);

  return (
    <>
      <SEOHead
        title={`Poker Tournaments This Weekend (${weekendInfo.weekendRangeLabel}) - Smarter.Poker`}
        description={`Find live poker tournaments running this weekend (${weekendInfo.weekendRangeLabel}). Compare buy-ins, guarantees, schedules, and card room locations nationwide.`}
        canonical="/hub/tournaments/this-weekend"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializePokerJsonLd(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              datasetSchema({
                path: '/hub/tournaments/this-weekend',
                name: 'Smarter.Poker Weekend Poker Tournaments Directory (Friday, Saturday & Sunday)',
                description:
                  'Live Friday, Saturday, And Sunday Poker Tournament Schedules, Buy-Ins, Starting Stacks, And Guaranteed Prize Pools Across 324+ Verified North American Poker Rooms.',
                keywords: [
                  'poker tournaments this weekend',
                  'weekend poker tournaments near me',
                  'saturday poker tournaments',
                  'sunday poker tournaments',
                  'guaranteed poker tournaments this weekend',
                ],
                variableMeasured: [
                  'Buy-In Amount ($)',
                  'Guaranteed Prize Pool ($)',
                  'Weekend Day (Friday, Saturday, Sunday)',
                  'Start Time & Registration Window',
                  'Game Type (NLH, PLO, Mixed)',
                ],
                size: '1,800+ Recurring Weekend Tournament Schedules Across 324+ Verified Venues',
              })
            ),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(WEEKEND_TOURNAMENTS_FAQS)) }}
        />
      </SEOHead>

      <div className="weekend-page">
        <UniversalHeader
          pageDepth={1}
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => router.back()}
        />
        <PokerNearMeFamilyNav />
        <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          direction="right"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <main className="weekend-main" aria-labelledby="weekend-heading">
          {/* Hero Banner with Intent Optimizations */}
          <header className="weekend-hero">
            <div className="badge-pill">
              <CalendarLuc size={14} aria-hidden />
              <span>{weekendInfo.weekendRangeLabel}</span>
              {weekendInfo.isCurrentlyWeekend && <span className="live-indicator">LIVE NOW</span>}
            </div>

            <h1 id="weekend-heading" className="weekend-title">
              POKER TOURNAMENTS <span className="highlight-cyan">THIS WEEKEND</span>
            </h1>

            <p className="weekend-lead">
              Your Definitive Guide To Friday, Saturday, And Sunday Tournaments.
              Compare Guaranteed Prize Pools, Structures, And Start Times At Verified Card Rooms.
            </p>

            {/* Quick-Facts Key Metrics */}
            <dl className="weekend-stats-dl">
              <div className="stat-card">
                <dt className="stat-label">Total Tournaments</dt>
                <dd className="stat-value">{stats.total || '1,800+'}</dd>
              </div>
              <div className="stat-card">
                <dt className="stat-label">Verified Venues</dt>
                <dd className="stat-value">{stats.venues || '324+'}</dd>
              </div>
              <div className="stat-card">
                <dt className="stat-label">Total Guarantees</dt>
                <dd className="stat-value highlight-gold">
                  {stats.totalPrizePools > 0 ? formatMoney(stats.totalPrizePools) : '$1.5M+ GTD'}
                </dd>
              </div>
            </dl>
          </header>

          {/* Interactive Filters Bar */}
          <div className="weekend-controls">
            {/* Day Selector Tabs */}
            <div className="day-tabs-group" role="tablist" aria-label="Select Weekend Day">
              <button
                role="tab"
                aria-selected={selectedDayTab === 'ALL'}
                className={`day-tab ${selectedDayTab === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('ALL')}
              >
                All Weekend ({stats.total})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Friday'}
                className={`day-tab ${selectedDayTab === 'Friday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Friday')}
              >
                Friday ({stats.fridayCount})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Saturday'}
                className={`day-tab ${selectedDayTab === 'Saturday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Saturday')}
              >
                Saturday ({stats.saturdayCount})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Sunday'}
                className={`day-tab ${selectedDayTab === 'Sunday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Sunday')}
              >
                Sunday ({stats.sundayCount})
              </button>
            </div>

            {/* Filter Dropdowns */}
            <div className="dropdowns-group">
              <select
                className="filter-select"
                aria-label="Filter by State"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
              >
                <option value="">All States</option>
                {POPULAR_STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="filter-select"
                aria-label="Filter by Buy-in"
                value={selectedBuyin.label}
                onChange={(e) => {
                  const found = BUYIN_RANGES.find((b) => b.label === e.target.value);
                  setSelectedBuyin(found || BUYIN_RANGES[0]);
                }}
              >
                {BUYIN_RANGES.map((b) => (
                  <option key={b.label} value={b.label}>
                    {b.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                className="search-input"
                placeholder="Search venue or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Tournament Grid Content */}
          <div className="tournament-content">
            {isLoading ? (
              <div className="loading-state">
                <div className="spinner" />
                <p>Loading Weekend Tournament Schedules...</p>
              </div>
            ) : filteredTournaments.length === 0 ? (
              <div className="empty-state">
                <p>No Tournaments Match Your Current Filters.</p>
                <button
                  className="reset-btn"
                  onClick={() => {
                    setSelectedDayTab('ALL');
                    setSelectedState('');
                    setSelectedBuyin(BUYIN_RANGES[0]);
                    setSearchQuery('');
                  }}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="tournament-grid">
                {filteredTournaments.slice(0, 100).map((t, i) => (
                  <WeekendTournamentCard key={`${t.id || t.venue_id}-${i}`} tournament={t} />
                ))}
              </div>
            )}
          </div>

          {/* Informational SEO Content Section (Rich AEO Text) */}
          <section className="weekend-seo-content" aria-labelledby="weekend-guide-heading">
            <h2 id="weekend-guide-heading">Finding Poker Tournaments This Weekend</h2>
            <p>
              Weekend Poker Tournaments Represent The Largest Prize Pools, Biggest Fields, And Most Diverse Tournament
              Schedules Across Casinos And Dedicated Poker Clubs. From Friday Night Warm-Ups To Saturday Marquee Deepstacks
              And Sunday Majors, Smarter.Poker Provides Real-Time Schedule Tracking From Hundreds Of Verified Venues.
            </p>
            <div className="seo-tips-grid">
              <div className="seo-tip">
                <h3>Early Registration</h3>
                <p>
                  Saturday Tournaments Often Reach Capacity Quickly. Check Late Registration Levels And Starting Stack
                  Depths Directly On The Venue Profile Before Traveling.
                </p>
              </div>
              <div className="seo-tip">
                <h3>Guaranteed Prize Pools</h3>
                <p>
                  Look For The GTD Badge On Tournament Cards For Tournaments Backed By Guaranteed Payouts Regardless Of
                  Total Entrant Turnout.
                </p>
              </div>
            </div>
          </section>
        </main>

        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
          .weekend-page {
            min-height: 100vh;
            background: #0a0d14;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          .weekend-main {
            max-width: 1300px;
            margin: 0 auto;
            padding: 24px 20px 80px;
          }
          .weekend-hero {
            text-align: center;
            margin-bottom: 32px;
          }
          .badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 9999px;
            background: rgba(0, 212, 255, 0.12);
            border: 1px solid rgba(0, 212, 255, 0.3);
            color: #00d4ff;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 16px;
          }
          .live-indicator {
            background: #22c55e;
            color: #000;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
          }
          .weekend-title {
            font-size: 2.4rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            margin: 0 0 12px;
          }
          .highlight-cyan {
            color: #00d4ff;
          }
          .highlight-gold {
            color: #f59e0b;
          }
          .weekend-lead {
            font-size: 1.05rem;
            color: #94a3b8;
            max-width: 720px;
            margin: 0 auto 28px;
            line-height: 1.5;
          }
          .weekend-stats-dl {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            max-width: 650px;
            margin: 0 auto;
          }
          .stat-card {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 14px 12px;
            text-align: center;
          }
          .stat-label {
            font-size: 12px;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #ffffff;
            margin: 0;
          }
          .weekend-controls {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 16px 20px;
            margin-bottom: 30px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .day-tabs-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .day-tab {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #cbd5e1;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .day-tab:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
          }
          .day-tab.active {
            background: #00d4ff;
            color: #000000;
            border-color: #00d4ff;
            box-shadow: 0 0 14px rgba(0, 212, 255, 0.4);
          }
          .dropdowns-group {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }
          .filter-select, .search-input {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #f1f5f9;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 13px;
          }
          .search-input {
            flex: 1;
            min-width: 200px;
          }
          .tournament-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
          }
          .loading-state, .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #94a3b8;
          }
          .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(0, 212, 255, 0.2);
            border-top-color: #00d4ff;
            border-radius: 50%;
            animation: spin 1s infinite linear;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .reset-btn {
            background: #00d4ff;
            color: #000;
            border: none;
            padding: 8px 18px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 12px;
          }
          .weekend-seo-content {
            margin-top: 60px;
            padding-top: 40px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          .weekend-seo-content h2 {
            font-size: 1.4rem;
            margin-bottom: 12px;
          }
          .weekend-seo-content p {
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .seo-tips-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
          }
          .seo-tip {
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 16px;
          }
          .seo-tip h3 {
            font-size: 15px;
            color: #00d4ff;
            margin: 0 0 8px;
          }
          .seo-tip p {
            margin: 0;
            font-size: 13px;
          }
          @media (max-width: 640px) {
            .weekend-stats-dl {
              grid-template-columns: 1fr;
            }
            .weekend-title {
              font-size: 1.8rem;
            }
          }
        ` }} />
      </div>
    </>
  );
}

function WeekendTournamentCard({ tournament }) {
  const t = tournament;
  const isHomeGame = Boolean(t.is_home_game);
  const isRealVenue = Number.isFinite(Number(t.venue_id)) && Number(t.venue_id) > 0;
  const detailUrl = isHomeGame ? homeGameUrl(t) : (isRealVenue ? `/hub/venues/${t.venue_id}` : null);

  return (
    <div className="card-item">
      <div className="card-header">
        <span className="card-day-badge">{t.weekendDay}</span>
        <span className="card-time">{formatTime(t.start_time)}</span>
        <span className="card-buyin">{typeof t.buy_in === 'number' && t.buy_in > 0 ? `$${t.buy_in}` : (t.buy_in === 0 ? 'Free' : 'TBD')}</span>
      </div>

      <div className="card-body">
        <h3 className="card-name">{t.tournament_name || 'Weekend Tournament'}</h3>
        <p className="card-venue">{t.venue_name}</p>
        {(t.city || t.state) && (
          <p className="card-location">
            <MapPinLuc size={12} aria-hidden />
            <span>{[t.city, t.state].filter(Boolean).join(', ')}</span>
          </p>
        )}

        <div className="card-pills">
          <span className="pill game-type">{t.game_type || 'NLH'}</span>
          {t.guaranteed > 0 && <span className="pill gtd">{formatMoney(t.guaranteed)} GTD</span>}
          <span className="pill weekend-badge">Live This Weekend</span>
          {t.open_status?.open === true && <span className="pill open-now-badge">Open Now</span>}
        </div>
      </div>

      {detailUrl && (
        <div className="card-footer">
          <Link href={detailUrl} legacyBehavior>
            <a className="card-link">
              <span>View Venue Schedule</span>
              <ChevRight size={14} aria-hidden />
            </a>
          </Link>
        </div>
      )}

      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
        .card-item {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 0.15s, border-color 0.15s;
        }
        .card-item:hover {
          border-color: rgba(0, 212, 255, 0.3);
          transform: translateY(-2px);
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .card-day-badge {
          background: rgba(0, 212, 255, 0.15);
          color: #00d4ff;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .card-time {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .card-buyin {
          margin-left: auto;
          font-size: 15px;
          font-weight: 700;
          color: #22c55e;
        }
        .card-name {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px;
          color: #ffffff;
        }
        .card-venue {
          font-size: 13px;
          color: #cbd5e1;
          margin: 0 0 4px;
        }
        .card-location {
          font-size: 12px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 4px;
          margin: 0 0 8px;
        }
        .card-pills {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pill {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .pill.game-type {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
        }
        .pill.gtd {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
        }
        .pill.weekend-badge {
          background: rgba(168, 85, 247, 0.2);
          color: #c084fc;
        }
        .pill.open-now-badge {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          font-weight: 700;
        }
        .card-footer {
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .card-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #00d4ff;
          text-decoration: none;
          font-weight: 500;
        }
        .card-link:hover {
          text-decoration: underline;
        }
      ` }} />
    </div>
  );
}
