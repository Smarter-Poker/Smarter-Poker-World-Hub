/**
 * Poker Series — Live Tournament Series Directory
 * Smarter.Poker Hub — Futuristic Metal UI Design System
 * ═══════════════════════════════════════════════════════
 * Displays all 50 poker series from the poker_series table
 * with premium Skeuomorphic Sci-Fi venue cards.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu  = dynamic(() => import('../../src/components/ui/HamburgerMenu'),  { ssr: false });

// ─── Tour color palette (Futuristic Metal) ─────────────────────────────────
const TOUR_COLORS = {
  WSOP:        { bg: 'rgba(26,10,0,0.85)',   border: '#FF8C00', glow: 'rgba(255,140,0,0.55)',  text: '#FF8C00'  },
  WPT:         { bg: 'rgba(0,26,16,0.85)',   border: '#00FF88', glow: 'rgba(0,255,136,0.55)',  text: '#00FF88'  },
  MSPT:        { bg: 'rgba(10,0,26,0.85)',   border: '#C000FF', glow: 'rgba(192,0,255,0.55)',  text: '#C000FF'  },
  RGPS:        { bg: 'rgba(26,0,0,0.85)',    border: '#FF3333', glow: 'rgba(255,51,51,0.55)',   text: '#FF3333'  },
  DSE:         { bg: 'rgba(0,16,32,0.85)',   border: '#00D4FF', glow: 'rgba(0,212,255,0.55)',  text: '#00D4FF'  },
  MPT:         { bg: 'rgba(10,10,26,0.85)',  border: '#6699FF', glow: 'rgba(102,153,255,0.55)', text: '#6699FF'  },
  Independent: { bg: 'rgba(8,16,8,0.85)',   border: '#44CC77', glow: 'rgba(68,204,119,0.4)',  text: '#44CC77'  },
};

function getTourStyle(tour) {
  return TOUR_COLORS[tour] || TOUR_COLORS.Independent;
}

function cleanName(s) {
  return (s || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function formatBuyIn(min, max) {
  if (!min && !max) return 'TBA';
  const fmt = n => '$' + Number(n).toLocaleString();
  if (min === max || !max) return fmt(min || max);
  return `${fmt(min)} – ${fmt(max)}`;
}

function formatDateRange(start, end) {
  if (!start && !end) return 'Dates TBA';
  const opts = { month: 'short', day: 'numeric' };
  const s = start ? new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts) : '';
  const e = end   ? new Date(end   + 'T00:00:00').toLocaleDateString('en-US', opts) : '';
  if (!e || s === e) return s || 'TBA';
  return `${s} – ${e}`;
}

function cleanLocation(city, state) {
  if (!city && !state) return '—';
  if (!city) return state;
  // city field typically has "Venue Name City" — grab last 1-2 real words
  const tokens = city.trim().split(/\s+/);
  const cleaned = tokens.length > 2 ? tokens.slice(-2).join(' ') : tokens.join(' ');
  return state ? `${cleaned}, ${state}` : cleaned;
}

function isSerieLive(start, end) {
  if (!start || !end) return false;
  const now = new Date();
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T23:59:59');
  return now >= s && now <= e;
}

// ─── Menu Config ────────────────────────────────────────────────────────────
function getMenuConfig() {
  return {
    menuItems: [
      { label: 'Poker Near Me', href: '/hub/poker-near-me-lobby', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> },
      { label: 'Poker Tours',   href: '/hub/poker-tours',          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
      { label: 'Poker Series',  href: '/hub/poker-series',         icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { label: 'Events Calendar', href: '/hub/events-calendar',   icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg> },
    ],
    bottomLinks: [],
  };
}

// ─── Inline PokerSeriesCard ─────────────────────────────────────────────────
function PokerSeriesCard({ series, index }) {
  const [hovered, setHovered] = useState(false);
  const tour = series.tour || 'Independent';
  const tc   = getTourStyle(tour);
  const name = cleanName(series.series_name);
  const dates    = formatDateRange(series.start_date, series.end_date);
  const buyin    = formatBuyIn(series.buy_in_min, series.buy_in_max);
  const location = cleanLocation(series.city, series.state);
  const tier     = (series.tier || 'regional').toUpperCase();
  const live     = isSerieLive(series.start_date, series.end_date);

  return (
    <div
      className={`psc${hovered ? ' psc--hover' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        '--th-border': tc.border,
        '--th-glow':   tc.glow,
        '--th-bg':     tc.bg,
        '--th-text':   tc.text,
        animationDelay: `${Math.min(index, 40) * 0.035}s`,
      }}
      role="article"
      aria-label={`Poker series: ${name}`}
    >
      {/* Bolts */}
      <span className="psc__bolt psc__bolt--tl"/>
      <span className="psc__bolt psc__bolt--tr"/>
      <span className="psc__bolt psc__bolt--bl"/>
      <span className="psc__bolt psc__bolt--br"/>
      {/* Side strips */}
      <span className="psc__strip psc__strip--l"/>
      <span className="psc__strip psc__strip--r"/>

      {/* Header */}
      <div className="psc__header">
        <span className="psc__tour">{tour}</span>
        {live && <span className="psc__live">● LIVE</span>}
        <span className="psc__tier">{tier}</span>
      </div>

      {/* Name */}
      <h3 className="psc__name">{name}</h3>

      {/* Stats bar */}
      <div className="psc__stats">
        <div className="psc__stat">
          <span className="psc__lbl">Dates</span>
          <span className="psc__val psc__val--date">{dates}</span>
        </div>
        <div className="psc__div"/>
        <div className="psc__stat">
          <span className="psc__lbl">Buy-In</span>
          <span className="psc__val psc__val--buyin">{buyin}</span>
        </div>
        <div className="psc__div"/>
        <div className="psc__stat">
          <span className="psc__lbl">Location</span>
          <span className="psc__val psc__val--loc">{location}</span>
        </div>
      </div>

      {/* CTA */}
      {series.source_url && (
        <div className="psc__foot">
          <a
            href={series.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="psc__btn"
            id={`series-btn-${series.id}`}
          >
            View Series
          </a>
        </div>
      )}
    </div>
  );
}

// ─── STAT COUNTERS ───────────────────────────────────────────────────────────
function StatBanner({ total, live, majors }) {
  return (
    <div className="ps-stats-banner">
      <span className="psc__bolt psc__bolt--tl"/>
      <span className="psc__bolt psc__bolt--tr"/>
      <span className="psc__bolt psc__bolt--bl"/>
      <span className="psc__bolt psc__bolt--br"/>
      <div className="ps-stat-item">
        <span className="ps-stat-num" style={{ color: '#00D4FF' }}>{total}</span>
        <span className="ps-stat-label">Total Series</span>
      </div>
      <div className="ps-stat-sep"/>
      <div className="ps-stat-item">
        <span className="ps-stat-num" style={{ color: '#44FF88' }}>{live}</span>
        <span className="ps-stat-label">Live Now</span>
      </div>
      <div className="ps-stat-sep"/>
      <div className="ps-stat-item">
        <span className="ps-stat-num" style={{ color: '#FF8C00' }}>{majors}</span>
        <span className="ps-stat-label">Major Tours</span>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────
export default function PokerSeriesPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig(), []);

  const [series, setSeries]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [tourFilter, setTourFilter] = useState('all');
  const [sortBy, setSortBy]     = useState('name');
  const searchRef = useRef(null);

  // Keyboard shortcut
  useEffect(() => {
    const fn = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape' && search) setSearch('');
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [search]);

  // Fetch series from API
  useEffect(() => {
    setLoading(true);
    fetch('/api/poker/series?limit=200&order=series_name')
      .then(r => r.json())
      .then(json => {
        setSeries(json.data || json.series || []);
        setLoading(false);
      })
      .catch(() => {
        // Fallback: try direct Supabase (anon key)
        setLoading(false);
      });
  }, []);

  const tours = useMemo(() => {
    const s = new Set(series.map(x => x.tour).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [series]);

  const liveCount  = useMemo(() => series.filter(s => isSerieLive(s.start_date, s.end_date)).length, [series]);
  const majorCount = useMemo(() => series.filter(s => ['WSOP','WPT','MSPT','RGPS','DSE'].includes(s.tour)).length, [series]);

  const filtered = useMemo(() => {
    let r = [...series];
    if (tourFilter !== 'all') r = r.filter(s => s.tour === tourFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s =>
        cleanName(s.series_name).toLowerCase().includes(q) ||
        (s.tour || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.state || '').toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case 'name':  r.sort((a,b) => cleanName(a.series_name).localeCompare(cleanName(b.series_name))); break;
      case 'date':  r.sort((a,b) => (a.start_date || 'z').localeCompare(b.start_date || 'z')); break;
      case 'tour':  r.sort((a,b) => (a.tour || 'z').localeCompare(b.tour || 'z')); break;
      case 'buyin': r.sort((a,b) => (b.buy_in_max || 0) - (a.buy_in_max || 0)); break;
      default: break;
    }
    return r;
  }, [series, tourFilter, search, sortBy]);

  return (
    <>
      <Head>
        <title>Poker Series — Live Tournament Series Directory | Smarter.Poker</title>
        <meta name="description" content="Browse all 50+ live poker tournament series happening now. Filter by tour (WSOP, WPT, MSPT, RGPS), date, buy-in, and location." />
        <meta property="og:title"       content="Poker Series Directory | Smarter.Poker" />
        <meta property="og:description" content="50+ live poker series tracked in real-time. Find your next big tournament." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="ps-page">
        <UniversalHeader onMenuOpen={() => setMenuOpen(true)}/>
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} config={menuConfig}/>

        {/* ── Hero ── */}
        <div className="ps-hero">
          <div className="ps-hero__scanline"/>
          <h1 className="ps-hero__title">
            <span className="ps-hero__icon">🃏</span>
            Poker Series Directory
          </h1>
          <p className="ps-hero__sub">
            Real-time tracking of live &amp; upcoming poker tournament series across North America &amp; beyond
          </p>
        </div>

        <div className="ps-container">
          {/* ── Stats Banner ── */}
          <StatBanner total={series.length} live={liveCount} majors={majorCount}/>

          {/* ── Controls ── */}
          <div className="ps-controls">
            {/* Search */}
            <div className="ps-search-wrap">
              <svg className="ps-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={searchRef}
                className="ps-search"
                type="text"
                placeholder="Search series, tour, city… (⌘K)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search poker series"
                id="series-search"
              />
              {search && <button className="ps-search-clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>}
            </div>

            {/* Tour filter */}
            <div className="ps-filter-row">
              <div className="ps-filter-group">
                <label className="ps-filter-label" htmlFor="tour-filter">Tour</label>
                <select
                  id="tour-filter"
                  className="ps-select"
                  value={tourFilter}
                  onChange={e => setTourFilter(e.target.value)}
                >
                  {tours.map(t => (
                    <option key={t} value={t}>{t === 'all' ? 'All Tours' : t}</option>
                  ))}
                </select>
              </div>

              <div className="ps-filter-group">
                <label className="ps-filter-label" htmlFor="sort-filter">Sort</label>
                <select
                  id="sort-filter"
                  className="ps-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                >
                  <option value="name">Name A–Z</option>
                  <option value="date">Date</option>
                  <option value="tour">Tour</option>
                  <option value="buyin">Buy-In (High)</option>
                </select>
              </div>

              <div className="ps-results-count">
                {filtered.length} series
              </div>
            </div>
          </div>

          {/* ── Cards Grid ── */}
          {loading ? (
            <div className="ps-loading">
              <div className="ps-spinner"/>
              <span>Loading series from database…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="ps-empty">
              <span style={{ fontSize: '3rem' }}>🃏</span>
              <p>No series match your filters.<br/>Try clearing the search or changing your tour filter.</p>
            </div>
          ) : (
            <div className="ps-grid">
              {filtered.map((s, i) => (
                <PokerSeriesCard key={s.id || s.series_uid} series={s} index={i}/>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STYLES — Futuristic Metal UI Design System
          All styles are scoped inline for zero-config deployment
         ══════════════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        /* ── Root Tokens ── */
        :root {
          --metal-dark:      #0a0a15;
          --metal-base:      #0d1117;
          --metal-mid:       #1a2332;
          --metal-light:     #2a3a4a;
          --metal-highlight: #3d4f5f;
          --neon-cyan:       #00D4FF;
          --neon-cyan-glow:  rgba(0,212,255,0.55);
          --gold-vip:        #FFD700;
          --text-pri:        #e8edf2;
          --text-muted:      rgba(232,237,242,0.5);
          --card-bg:         linear-gradient(145deg, #1c2c3c 0%, #111827 55%, #0a0e17 100%);
          --glow-cyan:       0 0 10px #00D4FF, 0 0 20px rgba(0,212,255,0.55);
        }

        /* ── Page Shell ── */
        .ps-page { background: var(--metal-dark); min-height: 100vh; color: var(--text-pri); }

        /* ── Hero ── */
        .ps-hero {
          position: relative;
          overflow: hidden;
          padding: 56px 24px 40px;
          background: linear-gradient(180deg, #0f1728 0%, #0a0a15 100%);
          border-bottom: 1px solid rgba(0,212,255,0.18);
          text-align: center;
        }
        .ps-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(0,212,255,0.1) 0%, transparent 70%);
          pointer-events: none;
        }
        .ps-hero__scanline {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,255,0.02) 3px, rgba(0,212,255,0.02) 4px);
          pointer-events: none;
        }
        .ps-hero__icon { font-size: 2.5rem; display: block; margin-bottom: 12px; }
        .ps-hero__title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 0 30px rgba(0,212,255,0.5), 0 2px 8px rgba(0,0,0,0.8);
          margin: 0 0 14px;
        }
        .ps-hero__sub {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.05rem;
          color: var(--text-muted);
          max-width: 560px;
          margin: 0 auto;
        }

        /* ── Container ── */
        .ps-container { max-width: 1400px; margin: 0 auto; padding: 0 24px 80px; }

        /* ── Stats Banner ── */
        .ps-stats-banner {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: linear-gradient(180deg, #1a2332 0%, #111827 100%);
          border: 2px solid var(--metal-highlight);
          border-radius: 12px;
          margin: 28px 0;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 20px rgba(0,0,0,0.4);
        }
        .ps-stat-item { flex: 1; text-align: center; padding: 20px 16px; }
        .ps-stat-sep  { width: 1px; background: rgba(255,255,255,0.1); height: 48px; }
        .ps-stat-num  {
          display: block;
          font-family: 'Orbitron', sans-serif;
          font-size: 2rem;
          font-weight: 800;
          text-shadow: 0 0 16px currentColor;
        }
        .ps-stat-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-top: 4px;
        }

        /* ── Controls ── */
        .ps-controls { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
        .ps-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .ps-search-icon {
          position: absolute;
          left: 14px;
          width: 18px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .ps-search {
          width: 100%;
          background: linear-gradient(180deg, #0a0e17 0%, #111827 100%);
          border: 2px solid var(--metal-highlight);
          border-radius: 10px;
          color: var(--text-pri);
          font-family: 'Rajdhani', sans-serif;
          font-size: 1rem;
          padding: 13px 44px 13px 44px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
        }
        .ps-search:focus {
          border-color: var(--neon-cyan);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4), 0 0 12px var(--neon-cyan-glow);
        }
        .ps-search::placeholder { color: var(--text-muted); }
        .ps-search-clear {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1rem;
          padding: 4px;
          transition: color 0.15s ease;
        }
        .ps-search-clear:hover { color: var(--text-pri); }

        .ps-filter-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ps-filter-group { display: flex; align-items: center; gap: 8px; }
        .ps-filter-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .ps-select {
          background: linear-gradient(180deg, #1a2332 0%, #0d1117 100%);
          border: 1px solid var(--metal-highlight);
          border-radius: 6px;
          color: var(--text-pri);
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.88rem;
          padding: 7px 28px 7px 12px;
          outline: none;
          cursor: pointer;
          transition: border-color 0.2s ease;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' viewBox='0 0 12 8'%3E%3Cpath stroke='%2300D4FF' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }
        .ps-select:focus { border-color: var(--neon-cyan); }

        .ps-results-count {
          margin-left: auto;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.82rem;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }

        /* ── Grid ── */
        .ps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 20px;
        }

        /* ── Card ── */
        .psc {
          position: relative;
          background: var(--card-bg);
          border: 2px solid var(--th-border, var(--metal-highlight));
          border-radius: 12px;
          padding: 20px 22px 18px;
          overflow: hidden;
          transition: transform 0.25s cubic-bezier(.22,.68,0,1.22),
                      box-shadow  0.25s ease,
                      border-color 0.2s ease;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.07),
            inset 0 -1px 0 rgba(0,0,0,0.3),
            0 4px 24px rgba(0,0,0,0.5);
          animation: psc-in 0.45s ease both;
          cursor: default;
        }
        .psc::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, var(--th-bg, transparent) 0%, transparent 60%);
          border-radius: 10px;
          pointer-events: none;
          opacity: 0.7;
        }
        .psc--hover {
          transform: translateY(-5px) scale(1.015);
          border-color: var(--th-border, var(--neon-cyan));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.1),
            0 10px 36px rgba(0,0,0,0.65),
            0 0 22px var(--th-glow, var(--neon-cyan-glow));
        }

        /* Bolts */
        .psc__bolt {
          position: absolute;
          width: 10px; height: 10px;
          background: radial-gradient(circle, #5a6a7a 30%, #2a3a4a 70%);
          border-radius: 50%;
          border: 1px solid #1a2a3a;
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
          z-index: 2;
        }
        .psc__bolt::after {
          content: '+';
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%,-50%);
          font-size: 7px;
          color: rgba(255,255,255,0.2);
          font-family: monospace;
        }
        .psc__bolt--tl { top: 6px;  left: 6px; }
        .psc__bolt--tr { top: 6px;  right: 6px; }
        .psc__bolt--bl { bottom: 6px; left: 6px; }
        .psc__bolt--br { bottom: 6px; right: 6px; }

        /* Neon strips */
        .psc__strip {
          position: absolute;
          width: 3px;
          top: 22%; bottom: 22%;
          background: var(--th-border, var(--neon-cyan));
          box-shadow: 0 0 8px var(--th-glow, var(--neon-cyan-glow));
          border-radius: 2px;
          opacity: 0.65;
          transition: opacity 0.2s ease;
        }
        .psc--hover .psc__strip { opacity: 1; }
        .psc__strip--l { left: 6px; }
        .psc__strip--r { right: 6px; }

        /* Card header */
        .psc__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          position: relative;
        }
        .psc__tour {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.63rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--th-text, var(--neon-cyan));
          background: var(--th-bg, rgba(0,212,255,0.08));
          border: 1px solid var(--th-border, var(--neon-cyan));
          border-radius: 4px;
          padding: 3px 8px;
          box-shadow: 0 0 6px var(--th-glow, rgba(0,212,255,0.3));
        }
        .psc__live {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.56rem;
          font-weight: 800;
          color: #44FF88;
          letter-spacing: 0.12em;
          text-shadow: 0 0 8px rgba(68,255,136,0.8);
          animation: live-pulse 1.4s ease-in-out infinite;
        }
        @keyframes live-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .psc__tier {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.58rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 3px;
          padding: 2px 7px;
          margin-left: auto;
        }

        /* Name */
        .psc__name {
          font-family: 'Rajdhani', sans-serif;
          font-size: clamp(1rem, 2.2vw, 1.15rem);
          font-weight: 700;
          color: var(--text-pri);
          margin: 0 0 16px;
          line-height: 1.3;
          padding: 0 14px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.6);
        }

        /* Stats bar */
        .psc__stats {
          display: flex;
          align-items: stretch;
          background: linear-gradient(180deg, #0a0e17 0%, #050810 100%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 16px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
        }
        .psc__stat {
          flex: 1;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .psc__div {
          width: 1px;
          background: rgba(255,255,255,0.08);
          margin: 8px 0;
        }
        .psc__lbl {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.52rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .psc__val {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-pri);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .psc__val--date  { color: #90bcd8; }
        .psc__val--buyin { color: var(--th-text, var(--neon-cyan)); text-shadow: 0 0 8px var(--th-glow, rgba(0,212,255,0.4)); }
        .psc__val--loc   { color: rgba(255,255,255,0.7); font-size: 0.75rem; }

        /* Footer CTA */
        .psc__foot { display: flex; justify-content: flex-end; }
        .psc__btn {
          display: inline-flex;
          align-items: center;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--th-text, var(--neon-cyan));
          background: transparent;
          border: 1px solid var(--th-border, var(--neon-cyan));
          border-radius: 5px;
          padding: 7px 16px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
          box-shadow: 0 0 6px var(--th-glow, rgba(0,212,255,0.3));
        }
        .psc__btn:hover {
          background: var(--th-bg, rgba(0,212,255,0.1));
          box-shadow: 0 0 14px var(--th-glow, var(--neon-cyan-glow));
          transform: translateY(-1px);
        }

        /* Card entrance animation */
        @keyframes psc-in {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Loading / Empty */
        .ps-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 80px 0;
          color: var(--text-muted);
          font-family: 'Rajdhani', sans-serif;
        }
        .ps-spinner {
          width: 48px; height: 48px;
          border: 3px solid rgba(0,212,255,0.2);
          border-top-color: var(--neon-cyan);
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ps-empty {
          text-align: center;
          padding: 80px 20px;
          color: var(--text-muted);
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.1rem;
          line-height: 1.6;
        }

        /* Stats banner bolts */
        .ps-stats-banner .psc__bolt--tl { position: absolute; top: 6px; left: 6px; }
        .ps-stats-banner .psc__bolt--tr { position: absolute; top: 6px; right: 6px; }
        .ps-stats-banner .psc__bolt--bl { position: absolute; bottom: 6px; left: 6px; }
        .ps-stats-banner .psc__bolt--br { position: absolute; bottom: 6px; right: 6px; }

        /* Responsive */
        @media (max-width: 640px) {
          .ps-grid { grid-template-columns: 1fr; gap: 14px; }
          .ps-hero { padding: 44px 16px 32px; }
          .ps-container { padding: 0 14px 60px; }
          .ps-stat-num { font-size: 1.5rem; }
          .ps-filter-row { gap: 8px; }
          .psc__name { font-size: 0.95rem; padding: 0 10px; }
          .psc__stats { flex-wrap: wrap; }
          .psc__stat { min-width: 80px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .psc, .psc--hover { animation: none; transition: none; }
          .ps-spinner { animation: none; border: 3px solid var(--neon-cyan); border-radius: 50%; }
        }
      `}</style>
    </>
  );
}
