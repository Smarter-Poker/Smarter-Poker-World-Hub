/**
 * Daily Tournaments Panel — Day-of-week tabs with filters
 * Extracted from poker-near-me-lobby.js for bundle splitting
 */

import React, { useState } from 'react';

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
const TODAY_INDEX = new Date().getDay();
const GAME_TYPES = ['all', 'NLH', 'PLO', 'Mixed', 'Omaha'];
const SORT_OPTS = [{ v: 'time', l: 'Start Time' }, { v: 'buyin', l: 'Buy-In' }, { v: 'guaranteed', l: 'Guaranteed' }];

// Buy-in color coding: green <$100, gold $100-500, red $500+
const getBuyinColor = (buyIn) => {
  if (!buyIn) return { color: 'rgba(200,214,229,0.5)', bg: 'rgba(200,214,229,0.06)', border: 'rgba(200,214,229,0.12)' };
  if (buyIn < 100) return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
  if (buyIn <= 500) return { color: '#d4a853', bg: 'rgba(212,168,83,0.1)', border: 'rgba(212,168,83,0.25)' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' };
};

export default function DailyTournamentsPanel({ tournaments = [], onDayChange }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[TODAY_INDEX]);
  const [gameType, setGameType] = useState('all');
  const [sortBy, setSortBy] = useState('time');
  const [minBuyin, setMinBuyin] = useState('');
  const [maxBuyin, setMaxBuyin] = useState('');
  const [minGuaranteed, setMinGuaranteed] = useState('');
  const [groupByState, setGroupByState] = useState(false);
  const [selectedState, setSelectedState] = useState('all');

  const handleDayChange = (day) => {
    setSelectedDay(day);
    onDayChange?.(day);
  };

  // Client-side filters
  let filtered = tournaments.filter(t => {
    if (!t.day_of_week) return false;
    if (t.day_of_week.toLowerCase() !== selectedDay.toLowerCase() && t.day_of_week !== 'Daily') return false;
    if (gameType !== 'all' && t.game_type && !t.game_type.toLowerCase().includes(gameType.toLowerCase())) return false;
    if (selectedState && selectedState !== 'all' && (t.venue_state || t.state) !== selectedState) return false;
    if (minBuyin && t.buy_in < parseInt(minBuyin, 10)) return false;
    if (maxBuyin && t.buy_in > parseInt(maxBuyin, 10)) return false;
    if (minGuaranteed && (t.guaranteed || 0) < parseInt(minGuaranteed, 10)) return false;
    return true;
  });

  // Sort
  if (sortBy === 'buyin') filtered.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
  else if (sortBy === 'guaranteed') filtered.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
  else {
    const parseT = (s) => { if (!s) return 9999; const m = s.match(/(\d+):(\d+)\s*(am|pm)/i); if (!m) return 9999; let h = parseInt(m[1]); if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12; if (m[3].toLowerCase() === 'am' && h === 12) h = 0; return h * 60 + parseInt(m[2]); };
    filtered.sort((a, b) => parseT(a.start_time) - parseT(b.start_time));
  }

  // State grouping
  const groupedByState = groupByState ? filtered.reduce((acc, t) => {
    const st = t.venue_state || t.state || 'Unknown';
    if (!acc[st]) acc[st] = [];
    acc[st].push(t);
    return acc;
  }, {}) : null;

  const renderTournamentCard = (t, i) => {
    const buyinStyle = getBuyinColor(t.buy_in);
    return (
    <div key={t.id || i} onClick={() => t.venue_id ? window.location.href = `/hub/venues/${t.venue_id}` : null} style={{
      background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(88,166,255,0.2)',
      borderRadius: 12, padding: '12px 16px', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
      cursor: t.venue_id ? 'pointer' : 'default', position: 'relative',
    }}>
      {/* Countdown Timer */}
      {(() => {
        if (!t.start_time) return null;
        const now = new Date();
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', marginBottom: 2 }}>
            {t.tournament_name || t.name || `${formatGameType(t.game_type)} Tournament`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(200,214,229,0.55)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {t.venue_name || 'Unknown Venue'}
            {(t.venue_city || t.city) && <span style={{ color: 'rgba(200,214,229,0.35)' }}>{t.venue_city || t.city}{(t.venue_state || t.state) ? `, ${t.venue_state || t.state}` : ''}</span>}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: buyinStyle.color, background: buyinStyle.bg, border: `1px solid ${buyinStyle.border}`, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
          {t.buy_in ? `$${t.buy_in}` : 'TBD'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(200,214,229,0.45)' }}>
        {t.start_time && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{formatTime(t.start_time)}</span>}
        {t.game_type && <span style={{ color: '#58a6ff', background: 'rgba(88,166,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>{formatGameType(t.game_type)}</span>}
        {t.guaranteed && <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V2h4v20"/></svg>{typeof t.guaranteed === 'number' ? t.guaranteed.toLocaleString() : t.guaranteed} GTD</span>}
        {t.starting_stack && <span>Stack: {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
        {t.blind_levels && <span>Blinds: {t.blind_levels}</span>}
        {t.rebuy_addon && <span>{t.rebuy_addon}</span>}
      </div>
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
              border: selectedDay === day ? '1px solid rgba(88,166,255,0.6)' : '1px solid rgba(88,166,255,0.2)',
              background: selectedDay === day ? 'rgba(88,166,255,0.15)' : 'rgba(13,17,23,0.7)',
              color: selectedDay === day ? '#58a6ff' : 'rgba(200,214,229,0.6)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            {day === DAYS[TODAY_INDEX] ? 'Today' : day.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Filter Row: Game Type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {GAME_TYPES.map(gt => (
          <button key={gt} onClick={() => setGameType(gt)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: gameType === gt ? '1px solid rgba(88,166,255,0.5)' : '1px solid rgba(88,166,255,0.2)',
              background: gameType === gt ? 'rgba(88,166,255,0.15)' : 'rgba(13,17,23,0.7)',
              color: gameType === gt ? '#58a6ff' : 'rgba(200,214,229,0.5)', fontFamily: 'inherit',
              transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          >{gt === 'all' ? 'All Games' : gt}</button>
        ))}
      </div>

      {/* Advanced Filters Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="number" placeholder="Min $" value={minBuyin} onChange={e => setMinBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <span style={{ color: 'rgba(200,214,229,0.3)', fontSize: 11 }}>to</span>
        <input type="number" placeholder="Max $" value={maxBuyin} onChange={e => setMaxBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <input type="number" placeholder="Min GTD" value={minGuaranteed} onChange={e => setMinGuaranteed(e.target.value)}
          style={{ width: 85, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
          {SORT_OPTS.map(o => <option key={o.v} value={o.v} style={{ background: '#0d1117' }}>{o.l}</option>)}
        </select>
        <button onClick={() => setGroupByState(!groupByState)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: groupByState ? '1px solid rgba(212,168,83,0.5)' : '1px solid rgba(88,166,255,0.2)',
            background: groupByState ? 'rgba(212,168,83,0.12)' : 'rgba(13,17,23,0.7)',
            color: groupByState ? '#d4a853' : 'rgba(200,214,229,0.5)', fontFamily: 'inherit', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}
        >By State</button>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', marginBottom: 10 }}>
        <span style={{ color: '#d4a853', fontWeight: 700 }}>{filtered.length}</span> tournament{filtered.length !== 1 ? 's' : ''}
        {gameType !== 'all' && <span> ({gameType})</span>}
        {selectedState && selectedState !== 'all' && <span> in <span style={{ color: '#d4a853' }}>{selectedState}</span></span>}
      </div>

      {/* Top States quick filter */}
      {(() => {
        const stateCounts = {};
        tournaments.filter(t => t.day_of_week === selectedDay || selectedDay === 'all').forEach(t => {
          const st = t.venue_state || t.state;
          if (st) stateCounts[st] = (stateCounts[st] || 0) + 1;
        });
        const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (topStates.length < 2) return null;
        return (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button onClick={() => setSelectedState('all')}
              style={{
                flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: (!selectedState || selectedState === 'all') ? '1px solid rgba(212,168,83,0.5)' : '1px solid rgba(88,166,255,0.15)',
                background: (!selectedState || selectedState === 'all') ? 'rgba(212,168,83,0.12)' : 'transparent',
                color: (!selectedState || selectedState === 'all') ? '#d4a853' : 'rgba(200,214,229,0.4)',
              }}>All</button>
            {topStates.map(([st, count]) => (
              <button key={st} onClick={() => setSelectedState(st)}
                style={{
                  flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: selectedState === st ? '1px solid rgba(212,168,83,0.5)' : '1px solid rgba(88,166,255,0.15)',
                  background: selectedState === st ? 'rgba(212,168,83,0.12)' : 'transparent',
                  color: selectedState === st ? '#d4a853' : 'rgba(200,214,229,0.4)',
                }}>{st} <span style={{ fontSize: 8, opacity: 0.6 }}>({count})</span></button>
            ))}
          </div>
        );
      })()}

      {/* Tournament cards — grouped or flat */}
      {groupByState && groupedByState ? (
        Object.keys(groupedByState).sort().map(st => (
          <div key={st} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#d4a853', marginBottom: 8, borderBottom: '1px solid rgba(212,168,83,0.15)', paddingBottom: 4 }}>
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
