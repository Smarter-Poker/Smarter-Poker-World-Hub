/**
 * GlobalSearchOverlay.jsx — v3
 *
 * Google-style full-screen search overlay for Poker Near Me.
 *
 * v3 Fixes:
 *  - Live venue suggestions WHILE TYPING (debounced API, shows top 5 matches)
 *  - Map is OUTSIDE the scrollable body → cards always render below it
 *  - All result cards (venue/tour/series) open full-screen detail modal — no navigation
 *  - ESC closes detail modal first, then overlay
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { fuzzyMatchScore } from './pnm-utils';

const VenueMap = dynamic(
  () => import('./VenueMap').catch(() => () => null),
  { ssr: false }
);

// ─── Popular city suggestions ───
const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Phoenix, AZ', 'Houston, TX', 'Miami, FL',
  'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Seattle, WA',
  'San Francisco, CA', 'Dallas, TX', 'Orlando, FL', 'San Diego, CA', 'Tampa, FL',
  'Portland, OR', 'Nashville, TN', 'Austin, TX', 'New Orleans, LA', 'Philadelphia, PA',
  'Detroit, MI', 'Minneapolis, MN', 'Boston, MA', 'Sacramento, CA', 'Reno, NV',
  'Atlantic City, NJ', 'Biloxi, MS', 'Tunica, MS', 'Cherokee, NC', 'Tulsa, OK',
  'Oklahoma City, OK', 'Kansas City, MO', 'Salt Lake City, UT', 'Memphis, TN',
  'Charlotte, NC', 'Pittsburgh, PA', 'Cincinnati, OH', 'Cleveland, OH', 'Columbus, OH',
  'Shreveport, LA', 'Laughlin, NV', 'Henderson, NV',
];

const VENUE_TYPE_STYLES = {
  casino:     { bg: 'rgba(212,168,83,0.15)',   color: '#d4a853', label: 'Casino' },
  card_room:  { bg: 'rgba(110,231,239,0.12)',  color: '#6ee7ef', label: 'Poker Club' },
  poker_club: { bg: 'rgba(110,231,239,0.12)',  color: '#6ee7ef', label: 'Poker Club' },
  charity:    { bg: 'rgba(167,139,250,0.12)',  color: '#a78bfa', label: 'Charity' },
  tour_stop:  { bg: 'rgba(251,113,133,0.12)',  color: '#fb7185', label: 'Tour Stop' },
  series:     { bg: 'rgba(52,211,153,0.12)',   color: '#34d399', label: 'Series' },
};
const TOUR_COLORS = {
  WSOP: '#c9a227', WPT: '#dc2626', WSOPC: '#c9a227', MSPT: '#3b82f6',
  RGPS: '#10b981', PGT: '#8b5cf6', NAPT: '#f87171', FPN: '#818cf8',
};

// ─── Natural Language Query Parser ───────────────────────────────────────────
// Parses queries like "tournaments next month in Illinois" into structured intents
const US_STATES = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO',
  connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID',
  illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA',
  maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS',
  missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH',
  'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY', 'north carolina':'NC',
  'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA',
  'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD', tennessee:'TN',
  texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA',
  'west virginia':'WV', wisconsin:'WI', wyoming:'WY',
};
// Also accept abbreviations directly
const STATE_ABBREVS = Object.values(US_STATES);

function parseNaturalLanguageQuery(raw) {
  const q = (raw || '').toLowerCase().trim();
  const result = { location: null, stateCode: null, timeWindow: null, gameType: null, isNaturalLanguage: false, cleanQuery: raw };
  if (!q) return result;

  // Detect game type intent
  if (/\boutaha\b|\bplo8?\b|\bomaha\b/.test(q)) { result.gameType = 'PLO'; result.isNaturalLanguage = true; }
  else if (/\bnlh\b|\bt[exas ]*holdem\b|\bno limit\b/.test(q)) { result.gameType = 'NLH'; result.isNaturalLanguage = true; }
  else if (/\bmixed\b|\bhorse\b/.test(q)) { result.gameType = 'Mixed'; result.isNaturalLanguage = true; }
  else if (/\btournament[s]?\b|\btourney[s]?\b/.test(q)) { result.gameType = 'tournament'; result.isNaturalLanguage = true; }
  else if (/\bcash\s+game[s]?\b/.test(q)) { result.gameType = 'cash'; result.isNaturalLanguage = true; }
  else if (/\blive\s+game[s]?\b/.test(q)) { result.gameType = 'live'; result.isNaturalLanguage = true; }

  // Detect time window
  if (/\bnext\s+month\b/.test(q)) { result.timeWindow = 'next_month'; result.isNaturalLanguage = true; }
  else if (/\bthis\s+week\b/.test(q)) { result.timeWindow = 'this_week'; result.isNaturalLanguage = true; }
  else if (/\bnext\s+week\b/.test(q)) { result.timeWindow = 'next_week'; result.isNaturalLanguage = true; }
  else if (/\bthis\s+weekend\b|\bweekend\b/.test(q)) { result.timeWindow = 'this_weekend'; result.isNaturalLanguage = true; }
  else if (/\btoday\b/.test(q)) { result.timeWindow = 'today'; result.isNaturalLanguage = true; }
  else if (/\btomorrow\b/.test(q)) { result.timeWindow = 'tomorrow'; result.isNaturalLanguage = true; }

  // Detect location — full state name first
  for (const [name, code] of Object.entries(US_STATES)) {
    if (q.includes(name)) { result.stateCode = code; result.location = name; result.isNaturalLanguage = true; break; }
  }
  // Then 2-letter abbreviation (e.g. "in IL", " IL ")
  if (!result.stateCode) {
    const abbrMatch = q.match(/\b([A-Za-z]{2})\b/g);
    if (abbrMatch) {
      for (const abbr of abbrMatch) {
        const upper = abbr.toUpperCase();
        if (STATE_ABBREVS.includes(upper)) { result.stateCode = upper; result.location = upper; result.isNaturalLanguage = true; break; }
      }
    }
  }

  // Build a clean keyword-only query for the API (strip NL words)
  if (result.isNaturalLanguage) {
    let clean = q
      .replace(/\bnext\s+month\b|\bthis\s+week\b|\bnext\s+week\b|\bthis\s+weekend\b|\bweekend\b|\btoday\b|\btomorrow\b/g, '')
      .replace(/\btournament[s]?\b|\btourney\b|\bcash\s+games?\b|\blive\s+games?\b/g, '')
      .replace(/\b(in|at|near|around|for|the|show|me|all|find|with)\b/g, '')
      .replace(/\s+/g, ' ').trim();
    // Remove the state name from the clean query too (it gets passed as a separate filter)
    if (result.location && result.location.length > 2) clean = clean.replace(new RegExp(result.location, 'gi'), '').trim();
    result.cleanQuery = clean || (result.stateCode || '');
  }

  return result;
}

function TimeWindowLabel({ timeWindow }) {
  const labels = {
    today: '📅 Today',
    tomorrow: '📅 Tomorrow',
    this_week: '📅 This Week',
    next_week: '📅 Next Week',
    this_weekend: '📅 This Weekend',
    next_month: '📅 Next Month',
  };
  const label = labels[timeWindow];
  if (!label) return null;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      {label}
    </span>
  );
}


// ═══════════════════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════════════════
function DetailModal({ item, type, onClose }) {
  if (!item) return null;
  const isVenue = type === 'venue';
  const isTour = type === 'tour';
  const typeStyle = VENUE_TYPE_STYLES[item.venue_type] || VENUE_TYPE_STYLES.card_room;
  const tourColor = isTour ? (TOUR_COLORS[item.tour_code] || '#6ee7ef') : '#6ee7ef';
  const logo = item.logo_url || item.profile_photo_url || item.cover_photo_url || '';
  const city = [item.city, item.state].filter(Boolean).join(', ');
  const phone = item.phone || item.phone_number || '';
  const address = item.address || '';
  const website = item.website || item.website_url || '';
  const initials = (item.name || item.tour_name || item.series_name || 'V')
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const accentColor = isVenue ? typeStyle.color : isTour ? tourColor : '#34d399';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10010, background: 'rgba(4,10,20,0.99)', display: 'flex', flexDirection: 'column', animation: 'gso-modal-in 0.22s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(110,231,239,0.08)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.04)', color: 'rgba(200,214,229,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label="Back to results">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(200,214,229,0.8)' }}>
          {isVenue ? 'Venue Details' : isTour ? 'Tour Details' : 'Series Details'}
        </span>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 80px' }}>
          {/* Hero */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 20, marginBottom: 20, background: 'linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))', border: `1px solid ${accentColor}30`, borderRadius: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, flexShrink: 0, background: isVenue ? typeStyle.bg : `${accentColor}18`, border: `2px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} /> : <span style={{ fontSize: 18, fontWeight: 900, color: accentColor }}>{initials}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#e0e8f0', letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: 6 }}>{item.name || item.tour_name || item.series_name}</div>
              {city && <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.55)', marginBottom: 8 }}>{city}</div>}
              <span style={{ padding: '3px 10px', borderRadius: 6, background: isVenue ? typeStyle.bg : `${accentColor}20`, color: accentColor, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isVenue ? typeStyle.label : isTour ? (item.tour_code || 'Tour') : 'Series'}</span>
            </div>
          </div>
          {/* Info rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {address && <InfoRow icon="📍" label={address} />}
            {phone && <InfoRow icon="📞" label={phone} href={`tel:${phone}`} />}
            {website && <InfoRow icon="🌐" label={website.replace(/^https?:\/\//, '')} href={website} />}
            {isVenue && (item.is_24_hours || item.hours_of_operation) && <InfoRow icon="🕐" label={item.is_24_hours ? '24/7 Open' : item.hours_of_operation} />}
            {isVenue && item.games_offered?.length > 0 && <InfoRow icon="🃏" label={item.games_offered.slice(0, 6).join(' · ')} />}
            {isTour && item.regions?.length > 0 && <InfoRow icon="🗺️" label={item.regions.join(' · ')} />}
          </div>
          {/* Trust score */}
          {isVenue && item.trust_score > 0 && (
            <div style={{ padding: '14px 16px', marginBottom: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Trust Score</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4,5].map(n => <div key={n} style={{ flex: 1, height: 6, borderRadius: 3, background: n <= Math.round(item.trust_score) ? '#d4a853' : 'rgba(255,255,255,0.08)' }} />)}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#d4a853' }}>{parseFloat(item.trust_score).toFixed(1)}</div>
            </div>
          )}
          {/* Tour stops */}
          {isTour && item.stops_2026?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,214,229,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>2026 Stops</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {item.stops_2026.slice(0, 15).map((stop, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: tourColor, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0' }}>{stop.name || stop.location}</div>
                      {stop.dates && <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>{stop.dates}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {address && (
              <button onClick={() => { const q = encodeURIComponent([item.name, address, city].filter(Boolean).join(' ')); window.open(`https://maps.apple.com/?q=${q}`, '_blank'); }}
                style={{ flex: 1, minWidth: 120, padding: '12px 16px', background: 'linear-gradient(135deg,#d4a853,#b8860b)', border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                Directions
              </button>
            )}
            {phone && (
              <a href={`tel:${phone}`} style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, color: '#22c55e', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                Call
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, href }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: href ? '#6ee7ef' : 'rgba(200,214,229,0.8)', flex: 1, wordBreak: 'break-word' }}>{label}</span>
    </div>
  );
  if (href) return <a href={href} target={href.startsWith('tel') ? undefined : '_blank'} rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>{inner}</a>;
  return inner;
}

// ─── Result Cards ───
function VenueResultCard({ venue, onClick }) {
  const typeStyle = VENUE_TYPE_STYLES[venue.venue_type] || VENUE_TYPE_STYLES.card_room;
  const city = [venue.city, venue.state].filter(Boolean).join(', ');
  return (
    <button onClick={() => onClick?.(venue)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(110,231,239,0.08)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', fontFamily: 'Inter,system-ui,sans-serif' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(110,231,239,0.07)'; e.currentTarget.style.borderColor = 'rgba(110,231,239,0.25)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)'; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {venue.logo_url || venue.profile_photo_url
          ? <img src={venue.logo_url || venue.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.3)" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</div>
        {city && <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>{city}</div>}
      </div>
      <div style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, background: typeStyle.bg, fontSize: 10, fontWeight: 700, color: typeStyle.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{typeStyle.label}</div>
    </button>
  );
}

function TourResultCard({ tour, onClick }) {
  const color = TOUR_COLORS[tour.tour_code] || '#6ee7ef';
  return (
    <button onClick={() => onClick?.(tour)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(110,231,239,0.08)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', fontFamily: 'Inter,system-ui,sans-serif' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(110,231,239,0.07)'; e.currentTarget.style.borderColor = 'rgba(110,231,239,0.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)'; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: `${color}18`, border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {tour.logo_url ? <img src={tour.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} /> : <span style={{ fontSize: 11, fontWeight: 900, color }}>{tour.tour_code || '?'}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tour.tour_name || tour.tour_code}</div>
        <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>{tour.regions?.slice(0,2).join(' • ') || 'Traveling Tour'}</div>
      </div>
      <div style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, background: `${color}20`, fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tour</div>
    </button>
  );
}

function SeriesResultCard({ series, onClick }) {
  const city = [series.city, series.state].filter(Boolean).join(', ');
  return (
    <button onClick={() => onClick?.(series)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(110,231,239,0.08)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', fontFamily: 'Inter,system-ui,sans-serif' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.06)'; e.currentTarget.style.borderColor = 'rgba(52,211,153,0.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)'; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'rgba(52,211,153,0.1)', border: '1.5px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{series.name || series.series_name}</div>
        {city && <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>{city}</div>}
      </div>
      <div style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.12)', fontSize: 10, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Series</div>
    </button>
  );
}

function SectionHeader({ icon, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 8px', borderBottom: '1px solid rgba(110,231,239,0.08)', marginBottom: 10 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(200,214,229,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      {count > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'rgba(110,231,239,0.6)', background: 'rgba(110,231,239,0.08)', padding: '1px 7px', borderRadius: 10 }}>{count}</span>}
    </div>
  );
}

function SearchSkeletons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ height: 68, borderRadius: 12, background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)', backgroundSize: '200% 100%', animation: `gso-shimmer 1.5s ease-in-out infinite ${i*0.1}s` }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function GlobalSearchOverlay({
  isOpen, onClose,
  searchQuery, onSearchChange,
  allTours = [], allSeries = [],
  searchHistory = [], onHistorySelect,
  cachedFetch,
}) {
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('input'); // 'input' | 'results'
  const [localQuery, setLocalQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [venueResults, setVenueResults] = useState([]);
  const [tourResults, setTourResults] = useState([]);
  const [seriesResults, setSeriesResults] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detailItem, setDetailItem] = useState(null);
  const [nlIntent, setNlIntent] = useState(null); // parsed natural language intent
  const [userLocation, setUserLocation] = useState(null);
  const debounceRef = useRef(null);
  // [BUG FIX] AbortController ref — cancels stale in-flight venue suggestion fetches
  const abortControllerRef = useRef(null);

  // Load recent searches and GPS from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pnm_recent_searches');
      if (stored) setRecentSearches(JSON.parse(stored));
      const gps = localStorage.getItem('sp-user-gps');
      if (gps) setUserLocation(JSON.parse(gps));
    } catch { /* ignore */ }
  }, []);

  // Reset & focus when opened; abort in-flight fetches when closed
  useEffect(() => {
    if (isOpen) {
      setPhase('input');
      setLocalQuery(searchQuery || '');
      setVenueResults([]); setTourResults([]); setSeriesResults([]);
      setCitySuggestions([]);
      setDetailItem(null);
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      // [BUG FIX] Cancel any pending debounce + in-flight fetch when overlay closes
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (detailItem) setDetailItem(null);
        else onClose?.();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, detailItem]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // In-memory fuzzy match tours
  const matchTours = useCallback((q) => {
    return allTours
      .map(t => {
        const score = Math.min(
          fuzzyMatchScore(q, t.tour_name),
          fuzzyMatchScore(q, t.tour_code),
          ...(Array.isArray(t.regions) ? t.regions.map(r => fuzzyMatchScore(q, r)) : [Infinity]),
          ...(Array.isArray(t.stops_2026) ? t.stops_2026.map(s => Math.min(fuzzyMatchScore(q, s.location), fuzzyMatchScore(q, s.name))) : [Infinity])
        );
        return { item: t, score };
      })
      .filter(t => t.score < 2) // Threshold
      .sort((a, b) => a.score - b.score)
      .map(t => t.item)
      .slice(0, 8);
  }, [allTours]);

  // In-memory fuzzy match series
  const matchSeries = useCallback((q) => {
    return allSeries
      .map(s => {
        const score = Math.min(
          fuzzyMatchScore(q, s.name),
          fuzzyMatchScore(q, s.series_name),
          fuzzyMatchScore(q, s.city),
          fuzzyMatchScore(q, s.state),
          fuzzyMatchScore(q, s.venue_name)
        );
        return { item: s, score };
      })
      .filter(s => s.score < 2) // Threshold
      .sort((a, b) => a.score - b.score)
      .map(s => s.item)
      .slice(0, 8);
  }, [allSeries]);

  // Handle typing — live suggestions for ALL types
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setLocalQuery(val);
    onSearchChange?.(val);

    if (!val.trim()) {
      setPhase('input');
      setVenueResults([]); setTourResults([]); setSeriesResults([]);
      setCitySuggestions([]);
      return;
    }

    // Immediate: city typeahead
    const lower = val.toLowerCase();
    setCitySuggestions(POPULAR_CITIES.filter(c => c.toLowerCase().includes(lower)).slice(0, 4));

    // Immediate: in-memory tours + series
    setTourResults(matchTours(val.trim()));
    setSeriesResults(matchSeries(val.trim()));

    // Debounced: venue API for live suggestions
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        // Cancel any previous in-flight request to prevent stale results
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        try {
          const params = new URLSearchParams({ limit: '5', offset: '0', sort: 'trust' });
          if (val.trim()) params.set('search', val.trim());
          if (userLocation?.lat && userLocation?.lng) {
            params.set('lat', userLocation.lat);
            params.set('lng', userLocation.lng);
          }
          const url = `/api/poker/venues?${params.toString()}`;
          let data;
          if (cachedFetch) {
            data = await cachedFetch(url);
          } else {
            const r = await fetch(url, { signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            data = await r.json();
          }
          if (signal.aborted) return; // [BUG FIX] Prevent stale state updates if aborted
          const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
          setVenueResults(venues.slice(0, 5));
        } catch (err) {
          if (err?.name !== 'AbortError') console.warn('[GlobalSearch] Venue suggestion fetch failed:', err);
        }
      }, 280);
    }
  }, [onSearchChange, matchTours, matchSeries, cachedFetch]);

  // Full search on submit — supports natural language queries
  const handleSubmit = useCallback(async (e, overrideQuery) => {
    e?.preventDefault?.();
    const rawQuery = (overrideQuery || localQuery).trim();
    if (!rawQuery) return;
    inputRef.current?.blur();
    setPhase('results');
    setIsLoading(true);
    setCitySuggestions([]);
    setDetailItem(null);

    // Parse for natural language intent
    const intent = parseNaturalLanguageQuery(rawQuery);
    setNlIntent(intent.isNaturalLanguage ? intent : null);
    const apiQuery = intent.isNaturalLanguage ? intent.cleanQuery : rawQuery;

    // Build venue API URL — inject state filter if detected
    const params = new URLSearchParams({ limit: '200', offset: '0', sort: 'trust' });
    if (apiQuery) params.set('search', apiQuery);
    if (intent.stateCode) params.set('state', intent.stateCode);
    if (userLocation?.lat && userLocation?.lng) {
      params.set('lat', userLocation.lat);
      params.set('lng', userLocation.lng);
    }
    const venueUrl = `/api/poker/venues?${params.toString()}`;

    // Cancel any previous in-flight request to prevent stale results
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let data;
      if (cachedFetch) {
        data = await cachedFetch(venueUrl);
      } else {
        const r = await fetch(venueUrl, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json();
      }
      if (signal.aborted) return;
      const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setVenueResults(venues);
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('[GlobalSearch] Venue search failed:', err);
      setVenueResults([]); 
    }

    // For tours/series — use the full raw query for broader matching
    setTourResults(matchTours(rawQuery));
    setSeriesResults(matchSeries(rawQuery));
    setIsLoading(false);

    // Save to recents
    const normalized = rawQuery.toLowerCase();
    setRecentSearches(prev => {
      const next = [normalized, ...prev.filter(q => q !== normalized)].slice(0, 5);
      try { localStorage.setItem('pnm_recent_searches', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  }, [localQuery, cachedFetch, matchTours, matchSeries]);

  const handleSuggestionClick = useCallback((s) => {
    setLocalQuery(s); onSearchChange?.(s); handleSubmit(null, s);
  }, [onSearchChange, handleSubmit]);

  const handleHistoryClick = useCallback((q) => {
    setLocalQuery(q); onSearchChange?.(q); handleSubmit(null, q); onHistorySelect?.(q);
  }, [onSearchChange, handleSubmit, onHistorySelect]);

  const openDetail = useCallback((item, type) => setDetailItem({ item, type }), []);

  const getSelectableItems = useCallback(() => {
    if (phase === 'results') return [];
    if (!localQuery.trim()) return recentSearches.map(r => ({ type: 'recent', data: r }));
    return [
      ...citySuggestions.map(c => ({ type: 'city', data: c })),
      ...venueResults.map(v => ({ type: 'venue', data: v })),
      ...tourResults.map(t => ({ type: 'tour', data: t })),
      ...seriesResults.map(s => ({ type: 'series', data: s }))
    ];
  }, [phase, localQuery, recentSearches, citySuggestions, venueResults, tourResults, seriesResults]);

  const handleKeyDown = useCallback((e) => {
    const items = getSelectableItems();
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < items.length && phase === 'input') {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item.type === 'recent' || item.type === 'city') {
          handleSuggestionClick(item.data);
        } else {
          openDetail(item.data, item.type);
        }
      }
    }
  }, [getSelectableItems, selectedIndex, phase, handleSuggestionClick, openDetail]);

  const totalResults = venueResults.length + tourResults.length + seriesResults.length;
  const hasResults = totalResults > 0;

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes gso-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gso-modal-in {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gso-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes gso-underline {
          from { width: 0; } to { width: 100%; }
        }
        .gso-back:hover { background: rgba(255,255,255,0.08) !important; }
        .gso-city-btn:hover { background: rgba(110,231,239,0.07) !important; }
        .gso-hist-btn:hover { background: rgba(255,255,255,0.05) !important; }
        .gso-clear:hover { background: rgba(255,255,255,0.1) !important; }
      `}</style>

      {/* ───── OVERLAY SHELL ───── */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,10,20,0.98)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', fontFamily: 'Inter,system-ui,-apple-system,sans-serif', animation: 'gso-in 0.22s ease', overflow: 'hidden' }}
        role="dialog" aria-modal="true" aria-label="Search Poker Venues, Tours, and Series"
      >

        {/* ───── HEADER ───── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(110,231,239,0.08)', flexShrink: 0 }}>
          <button className="gso-back" onClick={onClose} aria-label="Close search"
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.04)', color: 'rgba(200,214,229,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>

          <form onSubmit={handleSubmit} style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.5)" strokeWidth="2" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef} type="text" value={localQuery} onChange={handleInputChange} onKeyDown={handleKeyDown}
                placeholder="Search City, Venue, Tour, Series, Tournament..."
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                style={{ width: '100%', paddingLeft: 30, paddingRight: localQuery ? 36 : 0, paddingTop: 8, paddingBottom: 8, background: 'transparent', border: 'none', outline: 'none', fontSize: 18, fontWeight: 500, color: '#e0e8f0', letterSpacing: '-0.3px', fontFamily: 'inherit', caretColor: '#6ee7ef' }}
              />
              <div style={{ position: 'absolute', bottom: -2, left: 30, right: 0, height: 2, background: 'linear-gradient(90deg,#6ee7ef,#a78bfa)', borderRadius: 2, animation: 'gso-underline 0.3s ease' }} />
              {localQuery && (
                <button type="button" className="gso-clear"
                  onClick={() => { setLocalQuery(''); onSearchChange?.(''); setPhase('input'); setVenueResults([]); setTourResults([]); setSeriesResults([]); setCitySuggestions([]); inputRef.current?.focus(); }}
                  style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(200,214,229,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, transition: 'background 0.15s' }}
                  aria-label="Clear">×</button>
              )}
            </div>
          </form>

          {localQuery.trim() && (
            <button onClick={handleSubmit}
              style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,rgba(110,231,239,0.2),rgba(167,139,250,0.15))', color: '#6ee7ef', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Search
            </button>
          )}
        </div>

        {/* ───── MAP — between header and scrollable body, OUTSIDE scroll ───── */}
        {phase === 'results' && !isLoading && venueResults.length > 0 && (
          <div style={{ height: 260, flexShrink: 0, position: 'relative', borderBottom: '1px solid rgba(110,231,239,0.08)' }}>
            <VenueMap
              venues={venueResults}
              userLocation={null}
              onVenueClick={v => openDetail(v, 'venue')}
              onOpenIframeModal={(url, title) => {
                const match = url.match(/\/hub\/venues\/([^?#]+)/);
                if (match) {
                  const found = venueResults.find(v => String(v.id) === match[1]);
                  if (found) { openDetail(found, 'venue'); return; }
                }
                const found = venueResults.find(v => v.name === title);
                if (found) openDetail(found, 'venue');
              }}
              fullHeight={false}
              hideLegend={true}
              disableClustering={venueResults.length < 20}
            />
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1001, padding: '4px 14px', background: 'rgba(4,10,20,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(110,231,239,0.12)', borderRadius: 20, fontSize: 11, color: 'rgba(200,214,229,0.65)', fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {venueResults.length} {venueResults.length === 1 ? 'venue' : 'venues'} — tap a pin for details
            </div>
          </div>
        )}

        {/* ───── SCROLLABLE BODY ───── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>

          {/* INPUT phase — suggestions */}
          {phase === 'input' && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 80px' }}>

              {/* Recent searches */}
              {!localQuery.trim() && recentSearches.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    label="Recent Searches" count={recentSearches.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {recentSearches.map((rec, i) => (
                      <button key={`${rec}-${i}`} className="gso-city-btn" onClick={() => handleHistoryClick(rec)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: '1px solid rgba(110,231,239,0.06)', borderRadius: 10, color: '#c8d6e5', fontSize: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.4)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <span style={{ textTransform: 'capitalize' }}>{rec}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* City suggestions */}
              {localQuery.trim().length > 0 && citySuggestions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                    label="Cities" count={citySuggestions.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {citySuggestions.map(city => (
                      <button key={city} className="gso-city-btn" onClick={() => handleSuggestionClick(city)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: '1px solid rgba(110,231,239,0.06)', borderRadius: 10, color: '#c8d6e5', fontSize: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live venue suggestions (API-backed) */}
              {localQuery.trim().length >= 2 && venueResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                    label="Venues" count={venueResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {venueResults.map(v => <VenueResultCard key={v.id} venue={v} onClick={v => openDetail(v, 'venue')} />)}
                  </div>
                </div>
              )}

              {/* Live tour suggestions */}
              {tourResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>}
                    label="Tours" count={tourResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tourResults.map(t => <TourResultCard key={t.id || t.tour_code} tour={t} onClick={t => openDetail(t, 'tour')} />)}
                  </div>
                </div>
              )}

              {/* Live series suggestions */}
              {seriesResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    label="Series" count={seriesResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {seriesResults.map(s => <SeriesResultCard key={s.id || s.name} series={s} onClick={s => openDetail(s, 'series')} />)}
                  </div>
                </div>
              )}

              {/* Recent history */}
              {searchHistory.length > 0 && !localQuery && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    label="Recent Searches"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {searchHistory.slice(0, 8).map((item, i) => (
                      <button key={item.id || i} className="gso-hist-btn" onClick={() => handleHistoryClick(item.search_query || item)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 8, color: 'rgba(200,214,229,0.65)', fontSize: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.25)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {item.search_query || item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!localQuery && searchHistory.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(200,214,229,0.25)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 16, opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Search Anything</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(200,214,229,0.35)' }}>City, State, Venue, Casino,<br />Tournament, Series, or Tour Name</div>
                </div>
              )}
            </div>
          )}

          {/* RESULTS phase — full list below the map */}
          {phase === 'results' && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 80px' }}>

              {isLoading && <SearchSkeletons />}

              {!isLoading && !hasResults && (
                <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(200,214,229,0.35)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 16, opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Results Found</div>
                  <div style={{ fontSize: 13 }}>Try a different city, venue name, or tour</div>
                </div>
              )}

              {!isLoading && hasResults && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 14px', background: 'rgba(110,231,239,0.05)', border: '1px solid rgba(110,231,239,0.1)', borderRadius: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7ef" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span style={{ fontSize: 13, color: '#6ee7ef', fontWeight: 600 }}>{totalResults} result{totalResults !== 1 ? 's' : ''} for "{localQuery}"</span>
                    {nlIntent ? (
                      <>
                        {nlIntent.stateCode && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(110,231,239,0.15)', color: '#6ee7ef', fontSize: 11, fontWeight: 700 }}>📍 {nlIntent.stateCode}</span>}
                        {nlIntent.timeWindow && <TimeWindowLabel timeWindow={nlIntent.timeWindow} />}
                        {nlIntent.gameType && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: 11, fontWeight: 700 }}>🃏 {nlIntent.gameType === 'tournament' ? 'Tournaments' : nlIntent.gameType === 'cash' ? 'Cash Games' : 'Live Games'}</span>}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.35)', marginLeft: 4 }}>— Global Search</span>
                    )}
                  </div>
                  {nlIntent?.isNaturalLanguage && (
                    <div style={{ marginTop: 8, padding: '8px 14px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, fontSize: 11, color: 'rgba(200,214,229,0.5)', lineHeight: 1.5 }}>
                      <span style={{ color: '#a78bfa', fontWeight: 700 }}>Smart Search</span> — Detected intent: {[nlIntent.gameType && `${nlIntent.gameType}s`, nlIntent.timeWindow?.replace('_', ' '), nlIntent.stateCode && `in ${nlIntent.stateCode}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {/* Venues */}
              {!isLoading && venueResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                    label="Venues" count={venueResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {venueResults.map(v => <VenueResultCard key={v.id} venue={v} onClick={v => openDetail(v, 'venue')} />)}
                  </div>
                </div>
              )}

              {/* Tours */}
              {!isLoading && tourResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>}
                    label="Poker Tours" count={tourResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tourResults.map(t => <TourResultCard key={t.id || t.tour_code} tour={t} onClick={t => openDetail(t, 'tour')} />)}
                  </div>
                </div>
              )}

              {/* Series */}
              {!isLoading && seriesResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    label="Poker Series" count={seriesResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {seriesResults.map(s => <SeriesResultCard key={s.id || s.name} series={s} onClick={s => openDetail(s, 'series')} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ───── DETAIL MODAL — inside overlay at z:10010 ───── */}
        {detailItem && (
          <DetailModal item={detailItem.item} type={detailItem.type} onClose={() => setDetailItem(null)} />
        )}
      </div>
    </>
  );
}
