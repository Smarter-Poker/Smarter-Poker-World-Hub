/**
 * PokerSeriesCard — Futuristic Metal UI Series Card
 * Smarter.Poker Design System — Skeuomorphic Sci-Fi
 * Displays a poker tournament series with metal frame, neon accents, and industrial typography.
 */
import React, { useState } from 'react';

/* ─── Tour Badge Colors ─────────────────────────────────────────────────────── */
const TOUR_COLORS = {
  WSOP:        { bg: '#1a0a00', border: '#FF8C00', glow: 'rgba(255,140,0,0.6)',  text: '#FF8C00' },
  WPT:         { bg: '#001a10', border: '#00FF88', glow: 'rgba(0,255,136,0.6)',  text: '#00FF88' },
  MSPT:        { bg: '#0a001a', border: '#C000FF', glow: 'rgba(192,0,255,0.6)',  text: '#C000FF' },
  RGPS:        { bg: '#1a0000', border: '#FF3333', glow: 'rgba(255,51,51,0.6)',  text: '#FF3333' },
  DSE:         { bg: '#001020', border: '#00D4FF', glow: 'rgba(0,212,255,0.6)',  text: '#00D4FF' },
  MPT:         { bg: '#0a0a1a', border: '#6699FF', glow: 'rgba(102,153,255,0.6)', text: '#6699FF' },
  Independent: { bg: '#0a100a', border: '#44FF88', glow: 'rgba(68,255,136,0.4)', text: '#44FF88' },
};

function getTourStyle(tour) {
  return TOUR_COLORS[tour] || TOUR_COLORS.Independent;
}

function formatBuyIn(min, max) {
  if (!min && !max) return 'TBA';
  if (min === max || !max) return `$${Number(min || max).toLocaleString()}`;
  return `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
}

function formatDate(start, end) {
  if (!start && !end) return 'Dates TBA';
  const opts = { month: 'short', day: 'numeric' };
  const s = start ? new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts) : '';
  const e = end   ? new Date(end   + 'T00:00:00').toLocaleDateString('en-US', opts) : '';
  if (!e || s === e) return s;
  return `${s} – ${e}`;
}

function cleanName(str) {
  return (str || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function cleanCity(city, state) {
  if (!city) return state || '';
  // The city field often has the venue prepended redundantly — take last 1-2 tokens
  const parts = city.trim().split(/\s+/);
  const cleaned = parts.slice(-2).join(' ');
  return state ? `${cleaned}, ${state}` : cleaned;
}

export default function PokerSeriesCard({ series, index = 0 }) {
  const [hovered, setHovered] = useState(false);
  const tour = series.tour || 'Independent';
  const tc = getTourStyle(tour);
  const name = cleanName(series.series_name);
  const dates = formatDate(series.start_date, series.end_date);
  const buyin = formatBuyIn(series.buy_in_min, series.buy_in_max);
  const location = cleanCity(series.city, series.state);
  const tier = (series.tier || 'regional').toUpperCase();

  return (
    <div
      className={`psc-card${hovered ? ' psc-hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ '--tour-border': tc.border, '--tour-glow': tc.glow, '--tour-bg': tc.bg, '--tour-text': tc.text, animationDelay: `${index * 0.04}s` }}
      role="article"
      aria-label={`Poker series: ${name}`}
    >
      {/* ── Corner Bolts ─────────────────────────────────────────────────────── */}
      <span className="psc-bolt psc-bolt--tl" />
      <span className="psc-bolt psc-bolt--tr" />
      <span className="psc-bolt psc-bolt--bl" />
      <span className="psc-bolt psc-bolt--br" />

      {/* ── Neon Side Strips ─────────────────────────────────────────────────── */}
      <span className="psc-strip psc-strip--left" />
      <span className="psc-strip psc-strip--right" />

      {/* ── Header Row ───────────────────────────────────────────────────────── */}
      <div className="psc-header">
        <div className="psc-tour-badge" aria-label={`Tour: ${tour}`}>{tour}</div>
        <div className="psc-tier-pill">{tier}</div>
      </div>

      {/* ── Series Name ──────────────────────────────────────────────────────── */}
      <h3 className="psc-name">{name}</h3>

      {/* ── Stats Grid ───────────────────────────────────────────────────────── */}
      <div className="psc-stats">
        <div className="psc-stat">
          <span className="psc-stat-label">Dates</span>
          <span className="psc-stat-value psc-stat--dates">{dates}</span>
        </div>
        <div className="psc-divider" />
        <div className="psc-stat">
          <span className="psc-stat-label">Buy-In</span>
          <span className="psc-stat-value psc-stat--buyin">{buyin}</span>
        </div>
        <div className="psc-divider" />
        <div className="psc-stat">
          <span className="psc-stat-label">Location</span>
          <span className="psc-stat-value psc-stat--location">{location || '—'}</span>
        </div>
      </div>

      {/* ── Action Row ───────────────────────────────────────────────────────── */}
      {series.source_url && (
        <div className="psc-actions">
          <a
            href={series.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="psc-btn"
            id={`series-link-${series.id}`}
            aria-label={`View ${name} on PokerAtlas`}
          >
            View Series
          </a>
        </div>
      )}
    </div>
  );
}
