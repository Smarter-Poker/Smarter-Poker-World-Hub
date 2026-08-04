/**
 * Daily Tournaments Panel — Day-of-week tabs with filters
 * Extracted from poker-near-me-lobby.js for bundle splitting
 */

import React, { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { getInitialsColor, US_STATE_TIMEZONES } from './pnm-utils';

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


const SOURCE_COLORS = {
  daily:   { bg: 'rgba(0, 212, 255, 0.15)', border: 'rgba(0, 212, 255, 0.4)',  text: '#00D4FF', label: 'Daily' },
  series:  { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#A855F7', label: 'Series' },
  tour:    { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#F59E0B', label: 'Tour' },
  charity: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60A5FA', label: 'Charity' },
  home:    { bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.4)', text: '#94A3B8', label: 'Home Game' },
};

/**
 * BUG FIX: `SOURCE_COLORS[t.source]` was dead — /api/poker/daily-tournaments never
 * emits a `source` field, so every card (including charity, tour-series and home-game
 * rows the API unions in) was badged "Daily". The API does emit `venueType` /
 * `is_home_game`, so derive the badge from those. `source` is still honoured first in
 * case the API starts stamping it.
 */
function resolveSourceStyle(t) {
  if (t && t.source && SOURCE_COLORS[t.source]) return SOURCE_COLORS[t.source];
  const vt = String((t && t.venueType) || '').toLowerCase();
  if ((t && t.is_home_game) || vt === 'home game') return SOURCE_COLORS.home;
  if (vt === 'charity') return SOURCE_COLORS.charity;
  if (vt === 'tournament series' || vt === 'series') return SOURCE_COLORS.series;
  if (vt === 'tour' || vt === 'poker tour' || vt === 'tour stop') return SOURCE_COLORS.tour;
  return SOURCE_COLORS.daily;
}

/**
 * GAP FIX: the day filter compared `day_of_week` against the selected weekday name and
 * dropped everything else. But /api/poker/daily-tournaments deliberately unions in rows
 * whose `day_of_week` is a CALENDAR DATE, not a weekday name — charity events
 * (`c.start_date`), tour/series events (`e.event_date`) and home games
 * (`hg.scheduled_date`). '2026-08-15' matched neither the weekday nor 'daily', so every
 * one of those rows was silently discarded by the client.
 *
 * Parsed as a LOCAL date (not `new Date('YYYY-MM-DD')`, which is UTC midnight and reads
 * back as the previous day in every US timezone).
 */
function dayOfWeekMatches(rawDayOfWeek, selectedDay) {
  if (!rawDayOfWeek) return false;
  const dow = String(rawDayOfWeek).trim().toLowerCase();
  if (!dow) return false;
  if (dow === 'daily') return true;
  if (dow === String(selectedDay).toLowerCase()) return true;
  const dateMatch = dow.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const d = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    if (!isNaN(d.getTime())) {
      return DAYS[d.getDay()].toLowerCase() === String(selectedDay).toLowerCase();
    }
  }
  return false;
}

/**
 * Single predicate chain shared by the card list and the Top-States chip counts.
 * `includeState: false` is used for the chips so each chip reports how many results
 * the user would ACTUALLY get by clicking it, under the filters already active.
 */
function matchesTournamentFilters(t, f, includeState) {
  if (!t.day_of_week) return false;
  if (!dayOfWeekMatches(t.day_of_week, f.selectedDay)) return false;
  if (f.gameType !== 'all' && t.game_type && !t.game_type.toLowerCase().includes(f.gameType.toLowerCase())) return false;
  if (includeState && f.selectedState && f.selectedState !== 'all' && (t.venue_state || t.state) !== f.selectedState) return false;
  if (f.minBuyin && t.buy_in < parseInt(f.minBuyin, 10)) return false;
  if (f.maxBuyin && t.buy_in > parseInt(f.maxBuyin, 10)) return false;
  if (f.minGuaranteed && (t.guaranteed || 0) < parseInt(f.minGuaranteed, 10)) return false;
  return true;
}
function MapPinIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function ClockIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }

/**
 * Minutes since midnight for `date` as observed in `timeZone`.
 *
 * BUG FIX: the previous approach — `new Date(new Date().toLocaleString('en-US', { timeZone }))`
 * — round-trips through a locale-formatted string and misparses in environments whose
 * en-US formatting differs (and silently yields Invalid Date). Intl.DateTimeFormat
 * with formatToParts reads the zoned wall clock directly.
 *
 * @returns {number|null} 0-1439, or null if the timezone is unusable.
 */
function zonedMinutesOfDay(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, hour: '2-digit', minute: '2-digit',
    }).formatToParts(date);
    let hour = null;
    let minute = null;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      else if (p.type === 'minute') minute = parseInt(p.value, 10);
    }
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour === 24) hour = 0; // some engines emit '24' for midnight under hour12:false
    return hour * 60 + minute;
  } catch (e) {
    return null;
  }
}

// State -> IANA timezone now lives in pnm-utils as the single copy (US_STATE_TIMEZONES),
// shared with NearMeNowFeed so the two cannot drift apart.
const IANA_TZ = US_STATE_TIMEZONES;

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

  // Performance hooks
  const [isPending, startTransition] = useTransition();
  const [renderLimit, setRenderLimit] = useState(20);
  const loadMoreRef = useRef(null);

  // Reset pagination on filter changes
  useEffect(() => {
    setRenderLimit(20);
  }, [selectedDay, gameType, sortBy, selectedState, minBuyin, maxBuyin, minGuaranteed, groupByState]);

  // Intersection Observer for DOM Pagination
  // The sentinel node is stable for the component's lifetime, so subscribe once.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setRenderLimit(prev => prev + 20);
      }
    }, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // [DTP3 FIX v2] Tick now every 60s so countdowns don't freeze after mount.
  // useMemo(()=>new Date(),[]) was stale for the entire lifetime of the component.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleDayChange = (day) => {
    startTransition(() => {
      setSelectedDay(day);
      setSelectedState('all');
    });
    onDayChange?.(day);
  };

  // [DTP4 FIX] Memoized — was computed inline in render body (O(N) filter ran on every re-render)
  const filtered = useMemo(() => {
    const activeFilters = { selectedDay, gameType, selectedState, minBuyin, maxBuyin, minGuaranteed };
    let result = tournaments.filter(t => matchesTournamentFilters(t, activeFilters, true));

    // Sort
    if (sortBy === 'buyin') result.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
    else if (sortBy === 'guaranteed') result.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
    else {
      const parseT = (s) => {
        if (!s) return 9999;
        // Format: HH:MM:SS optional AM/PM
        const hhmmss = s.match(/^(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)?$/i);
        if (hhmmss) {
          let h = parseInt(hhmmss[1]), m = parseInt(hhmmss[2]);
          const p = (hhmmss[3] || '').toUpperCase();
          if (p === 'PM' && h !== 12) h += 12;
          if (p === 'AM' && h === 12) h = 0;
          return h * 60 + m;
        }
        // Format: HH:MM optional AM/PM (12hr with suffix OR bare 24hr)
        const hhmm = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
        if (hhmm) {
          let h = parseInt(hhmm[1]), m = parseInt(hhmm[2]);
          const p = (hhmm[3] || '').toUpperCase();
          if (p === 'PM' && h !== 12) h += 12;
          if (p === 'AM' && h === 12) h = 0;
          return h * 60 + m;
        }
        // Format: bare hour + AM/PM: "7PM", "10 AM"
        const hOnly = s.match(/^(\d{1,2})\s*([AP]M)$/i);
        if (hOnly) {
          let h = parseInt(hOnly[1]);
          const p = hOnly[2].toUpperCase();
          if (p === 'PM' && h !== 12) h += 12;
          if (p === 'AM' && h === 12) h = 0;
          return h * 60;
        }
        return 9999;
      };
      result.sort((a, b) => parseT(a.start_time) - parseT(b.start_time));
    }
    return result;
  }, [tournaments, selectedDay, gameType, selectedState, minBuyin, maxBuyin, minGuaranteed, sortBy]);

  // DOM Virtualization slice
  const visibleFiltered = useMemo(() => filtered.slice(0, renderLimit), [filtered, renderLimit]);

  // BUG FIX: IntersectionObserver only fires on threshold *crossings*. If appending
  // 20 more cards doesn't push the sentinel out of the viewport (tall desktop viewport,
  // compact cards, grouped mode with few groups), no further callback ever fires and
  // the remaining tournaments are unreachable until the user scrolls it out and back in.
  // After each page, re-check whether the sentinel is still on screen and keep paging.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (renderLimit >= filtered.length) return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const raf = window.requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight) setRenderLimit(prev => prev + 20);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [renderLimit, filtered.length]);

  // [DTP5 FIX] Memoize grouped-by-state object — was recomputed on every render
  const groupedByState = useMemo(() => {
    if (!groupByState) return null;
    return visibleFiltered.reduce((acc, t) => {
      const st = t.venue_state || t.state || 'Unknown';
      if (!acc[st]) acc[st] = [];
      acc[st].push(t);
      return acc;
    }, {});
  // [DTP6 FIX] Dep must be visibleFiltered not filtered — this memo groups the paginated slice.
  // Using filtered caused stale group counts when renderLimit < filtered.length.
  }, [visibleFiltered, groupByState]);

  // [DTP5 FIX] State counts also memoized — iterates raw tournaments prop on every render otherwise.
  // UX FIX: the chips used to be counted from the day filter ALONE, so with "PLO" and
  // "Min $500" active the counter could read "3 tournaments" while the chip beside it
  // still promised "NV (47)". Count through the same predicate chain minus the state
  // clause, so each chip reports the result set the user actually gets by clicking it.
  const topStates = useMemo(() => {
    const activeFilters = { selectedDay, gameType, selectedState, minBuyin, maxBuyin, minGuaranteed };
    const stateCounts = {};
    tournaments.filter(t => matchesTournamentFilters(t, activeFilters, false)).forEach(t => {
      const st = t.venue_state || t.state;
      if (st) stateCounts[st] = (stateCounts[st] || 0) + 1;
    });
    return Object.entries(stateCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [tournaments, selectedDay, gameType, selectedState, minBuyin, maxBuyin, minGuaranteed]);

  const renderTournamentCard = (t, idx) => {
    // Combine id (or venue+time fallback) with index prevents collisions across renders
    const cardId = t.id ? String(t.id) : `${t.venue_id || 'v'}-${t.start_time || 'notime'}-${idx}`;
    const isExpanded = !!expandedCards[cardId];
    
    const source = resolveSourceStyle(t);
    // BUG FIX: getInitialsColor returns an OBJECT ({bg,border,text}). It used to be
    // interpolated straight into a CSS gradient, producing
    // "linear-gradient(135deg, [object Object]40, ...)" — a declaration the CSS parser
    // rejects wholesale, so every logo-less card lost its gradient entirely.
    const initialsColor = getInitialsColor(t.venue_id);
    const isTodayTab = selectedDay.toLowerCase() === DAYS[todayIndex].toLowerCase();
    
    // Generate initials fallback for venues without logos
    const initials = (t.venue_name || t.tournament_name || t.name || 'T')
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();

    const handleCardClick = () => {
      if (t.is_clustered) {
          setExpandedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
      } else if (t.venue_id) {
          if (openVenueModal) openVenueModal(`/hub/venues/${t.venue_id}`);
          else window.location.href = `/hub/venues/${t.venue_id}`;
      }
    };

    return (
      <div key={cardId} className="ev-card" data-today={isTodayTab ? '1' : ''} onClick={handleCardClick} style={{ cursor: 'pointer' }}>
        {/* -- LEFT: Full-height logo (appears ONCE) -- */}
        <div className="ev-card-logo">
          {t.logo_url ? (
            <img
              src={t.logo_url}
              alt={t.venue_name || ''}
              className="ev-logo-img"
              loading="lazy"
            />
          ) : (
            <div className="ev-logo-fallback" style={{ background: `linear-gradient(135deg, ${initialsColor.text}40, rgba(15,23,42,0.9))` }}>
              {initials}
            </div>
          )}
        </div>

        {/* -- RIGHT: All tournament data -- */}
        <div className="ev-card-data" style={{ flex: 1, minWidth: 0, padding: '12px 16px' }}>
          
          {/* Countdown timer (if today and soon) */}
          {(() => {
            if (!t.start_time || !isTodayTab) return null;
            const match = (t.start_time || '').match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
            const timePart = match ? match[1] : null;
            const ampm = match ? match[2] : null;
            if (!timePart) return null;
            const [h, m] = timePart.split(':').map(Number);
            let hour24 = h;
            if (ampm) { if (ampm.toUpperCase() === 'PM' && h !== 12) hour24 += 12; if (ampm.toUpperCase() === 'AM' && h === 12) hour24 = 0; }
            
            // Timezone math — compare wall-clock minutes in the venue's own zone.
            // Driven by nowTick so the 60s interval actually refreshes the countdown.
            const tz = IANA_TZ[t.state || t.venue_state] || 'America/New_York';
            const nowMinutes = zonedMinutesOfDay(nowTick, tz);
            if (nowMinutes === null) return null;
            const diffMin = (hour24 * 60 + m) - nowMinutes;

            // BUG FIX: previously a passed start time rolled the target to tomorrow,
            // so a 7PM tournament viewed at 8PM rendered "23h 0m" — implying it was
            // still 23 hours away today. Show an honest "Started" badge instead.
            if (diffMin <= 0) {
              return (
                <div style={{ float: 'right', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(148,163,184,0.12)', color: 'rgba(203,213,225,0.7)' }}>
                  Started
                </div>
              );
            }
            const hrs = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const isImminent = diffMin <= 60;
            return (
              <div style={{ float: 'right', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: isImminent ? 'rgba(239,68,68,0.15)' : 'rgba(110,231,239,0.08)', color: isImminent ? '#f87171' : '#6ee7ef', animation: isImminent ? 'lobby-badgePulse 1.5s ease-in-out infinite' : 'none' }}>
                {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
              </div>
            );
          })()}

          {/* Top row: source badge + event name */}
          <div className="ev-data-top" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="ev-source" style={{ background: source.bg, borderColor: source.border, color: source.text }}>
                {source.label}
              </span>
              <h3 className="ev-name" style={{ margin: '6px 0 4px', fontSize: 15, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3, textTransform: 'capitalize' }}>
                {t.tournament_name || t.name || `${formatGameType(t.game_type)} Tournament`}
              </h3>
            </div>

            {/* Buy-in and Guarantee */}
            <div className="ev-data-numbers" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {t.buy_in != null && t.buy_in > 0 ? (
                <div className="ev-buyin" style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                  ${Number(t.buy_in).toLocaleString()}
                </div>
              ) : (
                <div className="ev-buyin" style={{ fontSize: 13, fontWeight: 700, color: 'rgba(148,163,184,0.6)', background: 'transparent', padding: '2px 4px' }}>TBD</div>
              )}
              {t.guaranteed != null && t.guaranteed > 0 && (
                <div className="ev-gtd" style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                  ${Number(t.guaranteed).toLocaleString()} GTD
                </div>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="ev-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', fontSize: 13, color: '#94a3b8', alignItems: 'center', marginTop: 4 }}>
            {t.venue_name && (
              <span className="ev-meta-item" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#e2e8f0', textTransform: 'capitalize' }}>
                <MapPinIcon />
                {t.venue_name}
              </span>
            )}
            {(t.venue_city || t.city || t.venue_state || t.state) && (
              <span className="ev-meta-item ev-location" style={{ opacity: 0.8, textTransform: 'capitalize' }}>
                &middot; {[t.venue_city || t.city, t.venue_state || t.state].filter(Boolean).join(', ')}
              </span>
            )}
            {t.start_time && (
              <span className="ev-meta-item" style={{ color: '#ec4899', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ClockIcon />
                {formatTime(t.start_time)} 
              </span>
            )}
            {t.game_type && t.game_type !== 'Unknown' && (
              <span className="ev-game-type" style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: '#cbd5e1' }}>
                {formatGameType(t.game_type)}
              </span>
            )}
            {t.is_clustered && (
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#cbd5e1' }}>
                {t.flights?.length || 0} Flights
              </span>
            )}
          </div>

          {/* Structural Data Row */}
          {(t.starting_stack || t.level_duration_minutes || t.late_registration) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'rgba(148,163,184,0.6)', marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
              {t.starting_stack && <span><strong style={{ color: '#e2e8f0' }}>Stack:</strong> {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
              {(t.level_duration_minutes || t.blind_levels) && <span><strong style={{ color: '#e2e8f0' }}>Blinds:</strong> {t.level_duration_minutes ? `${t.level_duration_minutes}m` : t.blind_levels}</span>}
              {t.late_registration && <span><strong style={{ color: '#e2e8f0' }}>Late Reg:</strong> {t.late_registration}</span>}
              {t.rebuy_addon && <span><strong style={{ color: '#e2e8f0' }}>Rules:</strong> {t.rebuy_addon}</span>}
            </div>
          )}

          {/* Structure Link */}
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
                        <div key={f.id || `${f.start_time || ''}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}>
                            <span>{f.day_of_week && f.day_of_week !== 'Daily' ? `${f.day_of_week} ` : ''}{formatTime(f.start_time)}</span>
                            {f.tournament_name && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{f.tournament_name}</span>}
                        </div>
                    ))}
                </div>
            </div>
          )}
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
          <button key={gt} onClick={() => startTransition(() => setGameType(gt))}
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
        <input type="number" placeholder="Min $" value={minBuyin} onChange={e => startTransition(() => setMinBuyin(e.target.value))}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <span style={{ color: 'rgba(148,163,184,0.4)', fontSize: 11 }}>to</span>
        <input type="number" placeholder="Max $" value={maxBuyin} onChange={e => startTransition(() => setMaxBuyin(e.target.value))}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <input type="number" placeholder="Min GTD" value={minGuaranteed} onChange={e => startTransition(() => setMinGuaranteed(e.target.value))}
          style={{ width: 85, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }} />
        <select value={sortBy} onChange={e => startTransition(() => setSortBy(e.target.value))}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}>
          {SORT_OPTS.map(o => <option key={o.v} value={o.v} style={{ background: '#0d1117' }}>{o.l}</option>)}
        </select>
        <button onClick={() => startTransition(() => setGroupByState(!groupByState))}
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
            <button onClick={() => startTransition(() => setSelectedState('all'))}
              style={{
                flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: (!selectedState || selectedState === 'all') ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
                background: (!selectedState || selectedState === 'all') ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: (!selectedState || selectedState === 'all') ? '#ffffff' : 'rgba(148,163,184,0.5)',
              }}>All</button>
            {topStates.map(([st, count]) => (
              <button key={st} onClick={() => startTransition(() => setSelectedState(st))}
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
        Object.keys(groupedByState || {}).sort().map(st => (
          <div key={st} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 4 }}>
              {st} ({groupedByState[st].length})
            </div>
            <div style={{ display: 'grid', gap: 10, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s' }}>
              {groupedByState[st].map((t, i) => renderTournamentCard(t, `${st}-${i}`))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: 'grid', gap: 10, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {visibleFiltered.map((t, i) => renderTournamentCard(t, i))}
        </div>
      )}

      {/* Intersection Observer target node */}
      <div ref={loadMoreRef} style={{ height: 20, opacity: 0 }} />

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tournaments found for {selectedDay}</p>
          <p style={{ fontSize: 13 }}>Try another day, adjust filters, or enable GPS to see tournaments near you.</p>
        </div>
      )}

      <style>{`
        /* ───── Event Card CSS (Identical to Events Calendar) ───── */
        .ev-card {
          display: flex; align-items: stretch; gap: 0;
          background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          transition: all 0.15s; overflow: hidden;
        }
        .ev-card:hover { background: rgba(15, 23, 42, 0.7); border-color: rgba(255,255,255,0.15); }
        .ev-card[data-today="1"] { border-color: rgba(0,212,255,0.3); }

        .ev-card-logo {
          width: 80px; min-height: 100%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.25);
          border-right: 1px solid rgba(255,255,255,0.06);
          padding: 8px;
        }
        .ev-logo-img {
          width: 56px; height: 56px; object-fit: contain; border-radius: 8px;
        }
        .ev-logo-fallback {
          width: 56px; height: 56px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5); font-size: 18px; font-weight: 700;
        }
        .ev-source {
          display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
          text-transform: uppercase; padding: 2px 6px; border-radius: 4px; border: 1px solid;
        }

        @media (max-width: 640px) {
          .ev-card-logo { width: 64px; }
          .ev-logo-img { width: 44px; height: 44px; }
          .ev-logo-fallback { width: 44px; height: 44px; font-size: 15px; }
          .ev-data-top { flex-direction: column; gap: 4px; align-items: flex-start !important; }
          .ev-data-numbers { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; }
        }
      `}</style>
    </div>
  );
}
