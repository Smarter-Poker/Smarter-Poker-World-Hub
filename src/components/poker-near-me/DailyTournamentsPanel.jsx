/**
 * Daily Tournaments Panel — Day-of-week tabs with filters
 * Extracted from poker-near-me-lobby.js for bundle splitting
 */

import React, { useState, useMemo } from 'react';

// ─── Game type normalization ───
function formatGameType(raw) {
  if (!raw) return 'NLH';
  const lower = raw.toLowerCase();
  if (lower === 'holdem' || lower === "hold'em" || lower === "texas hold'em") return "Hold'em";
  if (lower === 'nlh' || lower === 'no limit holdem' || lower === "no limit hold'em") return 'NLH';
  if (lower === 'plo' || lower === 'omaha') return 'PLO';
  if (lower === 'horse') return 'HORSE';
  if (lower === 'mixed') return 'Mixed';
  if (lower === 'stud') return 'Stud';
  if (lower === 'deepstack' || lower === 'deep stack') return 'Deep Stack';
  return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Time formatting — uppercase AM/PM ───
function formatTime(timeStr) {
  if (!timeStr) return '';
  const colonParts = timeStr.split(':');
  if (colonParts.length >= 2 && !timeStr.match(/[AP]M/i)) {
    let h = parseInt(colonParts[0], 10);
    const m = colonParts[1];
    if (!isNaN(h)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      return `${h}:${m} ${ampm}`;
    }
  }
  return timeStr.replace(/(\d+:\d+)\s*([ap]m)/i, (_, time, p) => `${time} ${p.toUpperCase()}`);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// [DTP1 FIX] Removed module-level TODAY_INDEX — it would be stale across midnight for long-lived tabs.
// Now computed inside the component so it refreshes per-mount.
const GAME_TYPES = ['all', 'NLH', 'PLO', 'Mixed', 'Omaha'];
const SORT_OPTS = [{ v: 'time', l: 'Start Time' }, { v: 'buyin', l: 'Buy-In' }, { v: 'guaranteed', l: 'Guaranteed' }];

// [DTP2 FIX] Sanitize structure PDF URLs against javascript: / data: XSS vectors
function safeHref(url) {
    if (!url || typeof url !== 'string') return null;
    const clean = url.replace(/[\x00-\x20]/g, '');
    const lower = clean.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return null;
    return clean;
}

// Buy-in color coding: green <$100, gold $100-500, red $500+
const getBuyinColor = (buyIn) => {
  if (!buyIn) return { color: 'rgba(200,214,229,0.5)', bg: 'rgba(200,214,229,0.06)', border: 'rgba(200,214,229,0.12)' };
  if (buyIn < 100) return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
  if (buyIn <= 500) return { color: '#ffffff', bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.25)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' };
};

export default function DailyTournamentsPanel({ tournaments = [], onDayChange, openVenueModal }) {
  // [DTP1 FIX] Compute today inside component, not at module load time (stale after midnight)
  const todayIndex = useMemo(() => new Date().getDay(), []);
  const [selectedDay, setSelectedDay] = useState(DAYS[todayIndex]);
  const [gameType, setGameType] = useState('all');
  const [sortBy, setSortBy] = useState('time');
  const [minBuyin, setMinBuyin] = useState('');
  const [maxBuyin, setMaxBuyin] = useState('');
  const [minGuaranteed, setMinGuaranteed] = useState('');
  const [groupByState, setGroupByState] = useState(false);
  const [selectedState, setSelectedState] = useState('all');
  const [expandedCards, setExpandedCards] = useState({});

  // [DTP3] Capture now once per render-cycle for countdown comparisons
  const now = useMemo(() => new Date(), []);

  const handleDayChange = (day) => {
    setSelectedDay(day);
    onDayChange?.(day);
  };

  // [DTP4 FIX] Memoized — was computed inline in render body (O(N) filter ran on every re-render)
  const filtered = useMemo(() => {
    let result = tournaments.filter(t => {
      if (!t.day_of_week) return false;
      const dow = t.day_of_week.toLowerCase();
      if (dow !== selectedDay.toLowerCase() && dow !== 'daily') return false;
      if (gameType !== 'all' && t.game_type && !t.game_type.toLowerCase().includes(gameType.toLowerCase())) return false;
      if (selectedState && selectedState !== 'all' && (t.venue_state || t.state) !== selectedState) return false;
      if (minBuyin && t.buy_in < parseInt(minBuyin, 10)) return false;
      if (maxBuyin && t.buy_in > parseInt(maxBuyin, 10)) return false;
      if (minGuaranteed && (t.guaranteed || 0) < parseInt(minGuaranteed, 10)) return false;
      return true;
    });

    // Sort
    if (sortBy === 'buyin') result.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
    else if (sortBy === 'guaranteed') result.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
    else {
      const parseT = (s) => { if (!s) return 9999; const m = s.match(/(\d+):(\d+)\s*(am|pm)/i); if (!m) return 9999; let h = parseInt(m[1]); if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12; if (m[3].toLowerCase() === 'am' && h === 12) h = 0; return h * 60 + parseInt(m[2]); };
      result.sort((a, b) => parseT(a.start_time) - parseT(b.start_time));
    }
    return result;
  }, [tournaments, selectedDay, gameType, selectedState, minBuyin, maxBuyin, minGuaranteed, sortBy]);

  // [DTP5 FIX] Memoize grouped-by-state object — was recomputed on every render
  const groupedByState = useMemo(() => {
    if (!groupByState) return null;
    return filtered.reduce((acc, t) => {
      const st = t.venue_state || t.state || 'Unknown';
      if (!acc[st]) acc[st] = [];
      acc[st].push(t);
      return acc;
    }, {});
  }, [filtered, groupByState]);

  // [DTP5 FIX] State counts also memoized — iterates raw tournaments prop on every render otherwise
  const topStates = useMemo(() => {
    const stateCounts = {};
    tournaments.filter(t => {
      const dow = (t.day_of_week || '').toLowerCase();
      return dow === selectedDay.toLowerCase() || dow === 'daily';
    }).forEach(t => {
      const st = t.venue_state || t.state;
      if (st) stateCounts[st] = (stateCounts[st] || 0) + 1;
    });
    return Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [tournaments, selectedDay]);

  const renderTournamentCard = (t, idx) => {
    const buyinStyle = getBuyinColor(t.buy_in);
    // [B9 FIX] Use a stable string key so expandedCards map survives re-renders
    // Combining id (or venue+time fallback) with index prevents collisions across renders
    const cardId = t.id ? String(t.id) : `${t.venue_id || 'v'}-${t.start_time || 'notime'}-${idx}`;
    const isExpanded = !!expandedCards[cardId];
    
    return (
    <div key={cardId} style={{
      background: 'linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92))', border: '1.5px solid rgba(148,163,184,0.12)',
      borderRadius: 12, padding: '12px 16px', transition: 'all 0.25s', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
      position: 'relative',
    }}>
      {/* Countdown Timer — uses `now` from outer useMemo, not a new Date() per card */}
      {(() => {
        if (!t.start_time) return null;
        const [timePart, ampm] = (t.start_time || '').match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i)?.slice(1) || [];
        if (!timePart) return null;
        const [h, m] = timePart.split(':').map(Number);
        let hour24 = h;
        if (ampm) { if (ampm.toUpperCase() === 'PM' && h !== 12) hour24 += 12; if (ampm.toUpperCase() === 'AM' && h === 12) hour24 = 0; }
        const target = new Date(now); target.setHours(hour24, m, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const diffMin = Math.round((target - now) / 60000);
        if (diffMin <= 0 || diffMin > 1440) return null;
        const hrs = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        const isImminent = diffMin <= 60;
        return (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
            padding: '2px 6px', borderRadius: 4,
            background: isImminent ? 'rgba(239,68,68,0.15)' : 'rgba(110,231,239,0.08)',
            border: isImminent ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(110,231,239,0.2)',
            color: isImminent ? '#f87171' : '#6ee7ef',
            animation: isImminent ? 'lobby-badgePulse 1.5s ease-in-out infinite' : 'none',
          }}>
            {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
          </span>
        );
      })()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => {
            if (t.is_clustered) {
                setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
            } else if (t.venue_id) {
                if (openVenueModal) openVenueModal(`/hub/venues/${t.venue_id}`);
                else window.location.href = `/hub/venues/${t.venue_id}`;
            }
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 2, textTransform: 'capitalize' }}>
            {t.tournament_name || t.name || `${formatGameType(t.game_type)} Tournament`}
            {t.is_clustered && (
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#94a3b8' }}>
                    {t.flights?.length || 0} Flights
                </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(148,163,184,0.6)' }} onClick={(e) => {
              e.stopPropagation();
              if (t.venue_id) {
                if (openVenueModal) openVenueModal(`/hub/venues/${t.venue_id}`);
                else window.location.href = `/hub/venues/${t.venue_id}`;
              }
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span style={{ textTransform: 'capitalize', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent', transition: '0.2s' }} onMouseOver={e=>e.target.style.textDecorationColor='currentColor'} onMouseOut={e=>e.target.style.textDecorationColor='transparent'}>{t.venue_name || 'Unknown Venue'}</span>
            {(t.venue_city || t.city) && <span style={{ color: 'rgba(148,163,184,0.4)', textTransform: 'capitalize' }}>{t.venue_city || t.city}{(t.venue_state || t.state) ? `, ${t.venue_state || t.state}` : ''}</span>}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: buyinStyle.color, background: buyinStyle.bg, border: `1px solid ${buyinStyle.border}`, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
          {t.buy_in ? `$${t.buy_in}` : 'TBD'}
        </div>
      </div>
      
      {/* Primary Row: Essential Details */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 8 }}>
        {t.start_time && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{formatTime(t.start_time)}</span>}
        {t.day_of_week && (t.day_of_week || '').toLowerCase() !== selectedDay.toLowerCase() && (t.day_of_week || '').toLowerCase() !== 'daily' && <span style={{ color: '#94a3b8' }}>{t.day_of_week}</span>}
        {t.game_type && <span style={{ color: '#ffffff', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>{formatGameType(t.game_type)}</span>}
        {t.guaranteed && <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V2h4v20"/></svg>{typeof t.guaranteed === 'number' ? t.guaranteed.toLocaleString() : t.guaranteed} GTD</span>}
        {t.format && <span style={{ color: '#cbd5e1' }}>{t.format.substring(0, 30)}</span>}
      </div>

      {/* Structural Data Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'rgba(148,163,184,0.6)', marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
        {(t.starting_stack || t.level_duration_minutes || t.late_registration) ? (
            <>
                {t.starting_stack && <span><strong style={{ color: '#e2e8f0' }}>Stack:</strong> {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
                {(t.level_duration_minutes || t.blind_levels) && <span><strong style={{ color: '#e2e8f0' }}>Blinds:</strong> {t.level_duration_minutes ? `${t.level_duration_minutes}m` : t.blind_levels}</span>}
                {t.late_registration && <span><strong style={{ color: '#e2e8f0' }}>Late Reg:</strong> {t.late_registration}</span>}
                {t.rebuy_addon && <span><strong style={{ color: '#e2e8f0' }}>Rules:</strong> {t.rebuy_addon}</span>}
            </>
        ) : (
            <span>Structure details pending...</span>
        )}
      </div>

      {/* [DTP2 FIX] safeHref() sanitizes structure_sheet_url — field comes from scraped Supabase data
           and could contain javascript: or data: XSS payloads if data is corrupted. */}
      {safeHref(t.structure_sheet_url) && (
        <a href={safeHref(t.structure_sheet_url)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800,
          background: 'linear-gradient(180deg, rgba(14,165,233,0.15), rgba(2,132,199,0.05))', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)',
          padding: '6px 12px', borderRadius: 6, marginTop: 10, textDecoration: 'none', letterSpacing: '0.05em'
        }}>
          VIEW STRUCTURE PDF
        </a>
      )}
      
      {/* Clustered Flights Dropdown */}
      {t.is_clustered && isExpanded && t.flights?.length > 1 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Included Flights</div>
            <div style={{ display: 'grid', gap: 6 }}>
                {t.flights.map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}>
                        <span>{f.day_of_week && f.day_of_week !== 'Daily' ? `${f.day_of_week} ` : ''}{formatTime(f.start_time)}</span>
                        {f.tournament_name && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{f.tournament_name}</span>}
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
    );
  };

  return (
    <div>
      {/* Day-of-week tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {DAYS.map((day) => (
          <button key={day} onClick={() => handleDayChange(day)}
            style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 8,
              border: selectedDay === day ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
              background: selectedDay === day ? 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(200,214,229,0.08))' : 'linear-gradient(180deg, rgba(25,35,55,0.9), rgba(15,23,42,0.95))',
              color: selectedDay === day ? '#ffffff' : 'rgba(148,163,184,0.6)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.25s', boxShadow: selectedDay === day ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(255,255,255,0.1)' : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            {/* [DTP1] Uses todayIndex from useMemo inside component, not stale module-level TODAY_INDEX */}
            {day === DAYS[todayIndex] ? 'Today' : day.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Filter Row: Game Type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {GAME_TYPES.map(gt => (
          <button key={gt} onClick={() => setGameType(gt)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: gameType === gt ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
              background: gameType === gt ? 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(200,214,229,0.08))' : 'linear-gradient(180deg, rgba(25,35,55,0.9), rgba(15,23,42,0.95))',
              color: gameType === gt ? '#ffffff' : 'rgba(148,163,184,0.6)', fontFamily: 'inherit',
              transition: 'all 0.25s', boxShadow: gameType === gt ? 'inset 0 1px 0 rgba(255,255,255,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.3)'
            }}
          >{gt === 'all' ? 'All Games' : gt}</button>
        ))}
      </div>

      {/* Advanced Filters Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="number" placeholder="Min $" value={minBuyin} onChange={e => setMinBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <span style={{ color: 'rgba(148,163,184,0.4)', fontSize: 11 }}>to</span>
        <input type="number" placeholder="Max $" value={maxBuyin} onChange={e => setMaxBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <input type="number" placeholder="Min GTD" value={minGuaranteed} onChange={e => setMinGuaranteed(e.target.value)}
          style={{ width: 85, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}>
          {SORT_OPTS.map(o => <option key={o.v} value={o.v} style={{ background: '#0d1117' }}>{o.l}</option>)}
        </select>
        <button onClick={() => setGroupByState(!groupByState)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: groupByState ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
            background: groupByState ? 'rgba(255,255,255,0.12)' : 'linear-gradient(180deg, rgba(25,35,55,0.9), rgba(15,23,42,0.95))',
            color: groupByState ? '#ffffff' : 'rgba(148,163,184,0.6)', fontFamily: 'inherit', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.3)'
          }}
        >By State</button>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginBottom: 10 }}>
        <span style={{ color: '#ffffff', fontWeight: 700 }}>{filtered.length}</span> tournament{filtered.length !== 1 ? 's' : ''}
        {gameType !== 'all' && <span> ({gameType})</span>}
        {selectedState && selectedState !== 'all' && <span> in <span style={{ color: '#ffffff' }}>{selectedState}</span></span>}
      </div>

      {/* Top States quick filter — [DTP5] uses memoized topStates (was an IIFE re-running 400+ items per render) */}
      {topStates.length >= 2 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button onClick={() => setSelectedState('all')}
              style={{
                flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: (!selectedState || selectedState === 'all') ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
                background: (!selectedState || selectedState === 'all') ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: (!selectedState || selectedState === 'all') ? '#ffffff' : 'rgba(148,163,184,0.5)',
              }}>All</button>
            {topStates.map(([st, count]) => (
              <button key={st} onClick={() => setSelectedState(st)}
                style={{
                  flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: selectedState === st ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
                  background: selectedState === st ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: selectedState === st ? '#ffffff' : 'rgba(148,163,184,0.5)',
                }}>{st} <span style={{ fontSize: 8, opacity: 0.6 }}>({count})</span></button>
            ))}
          </div>
      )}

      {/* Tournament cards — grouped or flat */}
      {groupByState && groupedByState ? (
        Object.keys(groupedByState).sort().map(st => (
          <div key={st} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 4 }}>
              {st} ({groupedByState[st].length})
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {groupedByState[st].map((t, i) => renderTournamentCard(t, `${st}-${i}`))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((t, i) => renderTournamentCard(t, i))}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tournaments found for {selectedDay}</p>
          <p style={{ fontSize: 13 }}>Try another day, adjust filters, or enable GPS to see tournaments near you.</p>
        </div>
      )}
    </div>
  );
}
