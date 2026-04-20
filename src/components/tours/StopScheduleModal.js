/**
 * StopScheduleModal
 * ══════════════════════════════════════════════════════════════
 * Full-screen overlay showing the complete tournament schedule
 * for one poker tour stop. Matches the MSPT PDF format exactly:
 *   DATE | EVENT # | STARTS | EVENT NAME | REG OPEN | GTD | CHIPS | LEVELS
 *
 * Usage:
 *   <StopScheduleModal
 *     stop={stopObject}
 *     tourCode="MSPT"
 *     tourName="Mid-States Poker Tour"
 *     tourColor={{ bg: '...', text: '...' }}
 *     onClose={() => setSelectedStop(null)}
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + Math.round(amount / 1000) + 'K';
  return '$' + amount.toLocaleString();
}

function formatChips(n) {
  if (!n) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

const BUY_IN_TIER = (amount) => {
  if (!amount) return 'tbd';
  if (amount < 500) return 'value';
  if (amount < 1000) return 'low';
  if (amount < 2500) return 'mid';
  if (amount < 10000) return 'midhi';
  if (amount < 25000) return 'high';
  if (amount < 100000) return 'super';
  return 'ultra';
};

const TIER_COLORS = {
  tbd:   { bg: 'rgba(100,116,139,0.2)',   color: '#94a3b8',  border: 'rgba(100,116,139,0.4)' },
  value: { bg: 'rgba(34,197,94,0.15)',    color: '#22c55e',  border: 'rgba(34,197,94,0.3)' },
  low:   { bg: 'rgba(0,212,255,0.12)',    color: '#00D4FF',  border: 'rgba(0,212,255,0.3)' },
  mid:   { bg: 'rgba(59,130,246,0.15)',   color: '#60a5fa',  border: 'rgba(59,130,246,0.3)' },
  midhi: { bg: 'rgba(139,92,246,0.15)',   color: '#a78bfa',  border: 'rgba(139,92,246,0.3)' },
  high:  { bg: 'rgba(234,179,8,0.18)',    color: '#fbbf24',  border: 'rgba(234,179,8,0.4)' },
  super: { bg: 'rgba(249,115,22,0.18)',   color: '#fb923c',  border: 'rgba(249,115,22,0.4)' },
  ultra: { bg: 'rgba(236,72,153,0.18)',   color: '#f472b6',  border: 'rgba(236,72,153,0.4)' },
};

const GAME_COLORS = {
  NLH: '#00D4FF', PLO: '#a78bfa', O8: '#fb923c', HORSE: '#f59e0b',
  STUD: '#94a3b8', RAZZ: '#f43f5e', MIXED: '#10b981', LHE: '#6b7280',
};

function detectEventType(ev) {
  const n = (ev.event_name || ev.name || '').toLowerCase();
  if (/main\s*event/i.test(n)) return 'main';
  if (/high\s*roller/i.test(n)) return 'hr';
  if (/satellite|sat\b/i.test(n)) return 'sat';
  if (/mystery\s*bounty/i.test(n)) return 'bounty';
  if (/bounty|knockout/i.test(n)) return 'bounty';
  if (/senior|seniors/i.test(n)) return 'seniors';
  if (/ladies|women/i.test(n)) return 'ladies';
  if (/turbo/i.test(n)) return 'turbo';
  return 'standard';
};

// ─── Row Component ────────────────────────────────────────────────────────────

function EventRow({ ev, idx }) {
  const buyIn = ev.buy_in || ev.buyin || null;
  const tier = BUY_IN_TIER(buyIn);
  const tierStyle = TIER_COLORS[tier];
  const eventType = detectEventType(ev);
  const isMain = eventType === 'main';
  const isHR   = eventType === 'hr';
  const isSat  = eventType === 'sat';
  const game   = ev.game_type || 'NLH';
  const gameColor = GAME_COLORS[game] || '#94a3b8';

  const gtd = ev.guaranteed || ev.guarantee || null;
  const chips = ev.starting_chips || null;
  const levels = ev.levels || ev.blind_levels_min || null;
  const num = ev.event_number || ev.event_number_raw || (idx + 1);
  const name = ev.event_name || ev.name || 'Unnamed Event';
  const dateStr = ev.date || (ev.start_date ? new Date(ev.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);
  const day = ev.day_of_week ? ev.day_of_week.substring(0, 3) : '';
  const startTime = ev.start_time || null;
  const regOpen  = ev.reg_open_time || null;

  return (
    <div
      className={`ssm-row${isMain ? ' ssm-row-main' : ''}${isHR ? ' ssm-row-hr' : ''}${isSat ? ' ssm-row-sat' : ''}`}
      style={isMain ? { background: 'rgba(234,179,8,0.07)', borderLeft: '3px solid #fbbf24' }
           : isHR   ? { background: 'rgba(139,92,246,0.07)', borderLeft: '3px solid #a78bfa' }
           : {}}
    >
      {/* Date */}
      <div className="ssm-col ssm-col-date">
        {day && <span className="ssm-day">{day}</span>}
        {dateStr && <span className="ssm-date">{dateStr}</span>}
      </div>

      {/* Event # */}
      <div className="ssm-col ssm-col-num">
        {isMain
          ? <span style={{ color: '#fbbf24', fontSize: '16px' }}>★</span>
          : <span className="ssm-evt-num">{num}</span>
        }
      </div>

      {/* Starts */}
      <div className="ssm-col ssm-col-time">
        {startTime ? <span className="ssm-time">{startTime}</span> : <span className="ssm-na">—</span>}
      </div>

      {/* Event Name */}
      <div className="ssm-col ssm-col-name">
        <span className="ssm-name">{name}</span>
        <div className="ssm-badges">
          <span className="ssm-game" style={{ color: gameColor + 'cc', borderColor: gameColor + '44' }}>{game}</span>
          {isMain   && <span className="ssm-badge ssm-badge-main">Main Event</span>}
          {isHR     && <span className="ssm-badge ssm-badge-hr">High Roller</span>}
          {isSat    && <span className="ssm-badge ssm-badge-sat">Satellite</span>}
          {eventType === 'bounty' && <span className="ssm-badge ssm-badge-bounty">Mystery Bounty</span>}
          {eventType === 'seniors' && <span className="ssm-badge ssm-badge-other">Seniors</span>}
          {eventType === 'ladies'  && <span className="ssm-badge ssm-badge-other">Ladies</span>}
        </div>
      </div>

      {/* Buy-In */}
      <div className="ssm-col ssm-col-buyin">
        <span className="ssm-buyin" style={{ background: tierStyle.bg, color: tierStyle.color, borderColor: tierStyle.border }}>
          {buyIn ? formatMoney(buyIn) : 'TBD'}
        </span>
      </div>

      {/* Reg Open */}
      <div className="ssm-col ssm-col-reg">
        {regOpen ? <span className="ssm-reg">{regOpen}</span> : <span className="ssm-na">—</span>}
      </div>

      {/* GTD */}
      <div className="ssm-col ssm-col-gtd">
        {gtd
          ? <span className="ssm-gtd">{formatMoney(gtd)}</span>
          : <span className="ssm-na">—</span>
        }
      </div>

      {/* Chips */}
      <div className="ssm-col ssm-col-chips">
        {chips
          ? <span className="ssm-chips">{formatChips(chips)}</span>
          : <span className="ssm-na">—</span>
        }
      </div>

      {/* Levels */}
      <div className="ssm-col ssm-col-levels">
        {levels
          ? <span className="ssm-levels">{levels}<span className="ssm-min">m</span></span>
          : <span className="ssm-na">—</span>
        }
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function StopScheduleModal({ stop, tourCode, tourName, tourColor, onClose }) {
  const [search, setSearch] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Merge events: stop.events (from tour_stop_events) + PDF events from tour_event_details
  // Guard: if stop_name is empty/falsy, skip SWR fetch to prevent unfiltered all-events response
  const resolvedStopName = stop?.stop_name || stop?.name || '';
  const swrKey = stop && tourCode && resolvedStopName
    ? `/api/poker/tour-schedule?tour_code=${encodeURIComponent(tourCode)}&stop_name=${encodeURIComponent(resolvedStopName)}&pdf_detail=true`
    : null;

  const { data: apiData } = useSWR(swrKey, url => fetch(url).then(r => r.json()).catch(() => null));

  // Prefer API data if it has more events than what was passed in via stop.events
  const stopEvents = stop?.events || [];
  const apiEvents = apiData?.events || [];
  const rawEvents = apiEvents.length > stopEvents.length ? apiEvents : stopEvents;

  // If we have no API data yet, use what was passed in
  const allEvents = rawEvents.length > 0 ? rawEvents : stopEvents;

  // Filter
  const gameTypes = [...new Set(allEvents.map(e => e.game_type || 'NLH').filter(Boolean))];
  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'main', label: 'Main Event' },
    { value: 'hr', label: 'High Roller' },
    { value: 'sat', label: 'Satellite' },
    { value: 'bounty', label: 'Bounty / KB' },
  ];

  const filtered = allEvents.filter(ev => {
    const n = (ev.event_name || ev.name || '').toLowerCase();
    const searchMatch = !search || n.includes(search.toLowerCase());
    const gameMatch = gameFilter === 'all' || (ev.game_type || 'NLH') === gameFilter;
    const typeMatch = typeFilter === 'all' || detectEventType(ev) === typeFilter;
    return searchMatch && gameMatch && typeMatch;
  });

  // Sort by event number then date
  filtered.sort((a, b) => {
    if (a.start_date && b.start_date) {
      const d = new Date(a.start_date) - new Date(b.start_date);
      if (d !== 0) return d;
    }
    return (a.event_number || 999) - (b.event_number || 999);
  });

  const stopName = stop?.stop_name || stop?.name || 'Stop Schedule';
  const venueLine = [stop?.stop_venue || stop?.venue, stop?.stop_city || stop?.city, stop?.stop_state || stop?.state].filter(Boolean);
  const dates = stop?.stop_start_date || stop?.dates ? (
    stop.stop_start_date
      ? new Date(stop.stop_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        + (stop.stop_end_date ? ' – ' + new Date(stop.stop_end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
      : stop.dates || ''
  ) : '';

  const mainEvent = allEvents.find(e => /main\s*event/i.test(e.event_name || e.name || ''));
  const maxGtd = allEvents.reduce((max, e) => Math.max(max, e.guaranteed || e.guarantee || 0), 0);

  const tourBg = tourColor?.bg || 'linear-gradient(135deg, #1e40af, #1e3a8a)';
  const tourText = tourColor?.text || '#fff';

  return (
    <div className="ssm-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ssm-panel">

        {/* ── Header ── */}
        <div className="ssm-header" style={{ background: tourBg }}>
          <div className="ssm-header-inner">
            <div className="ssm-header-left">
              <div className="ssm-tour-badge" style={{ color: tourText, opacity: 0.85 }}>
                {tourCode}
              </div>
              <div>
                <h2 className="ssm-stop-name" style={{ color: tourText }}>{stopName}</h2>
                {venueLine.length > 0 && (
                  <p className="ssm-venue" style={{ color: tourText, opacity: 0.8 }}>
                    {venueLine.join('  •  ')}
                  </p>
                )}
                {dates && (
                  <p className="ssm-dates" style={{ color: tourText, opacity: 0.7 }}>
                    {dates}
                  </p>
                )}
              </div>
            </div>
            <div className="ssm-header-right">
              {maxGtd > 0 && (
                <div className="ssm-gtd-banner">
                  <span className="ssm-gtd-label">MORE THAN</span>
                  <span className="ssm-gtd-amount">{formatMoney(maxGtd)}</span>
                  <span className="ssm-gtd-label">GUARANTEED</span>
                </div>
              )}
              <button className="ssm-close-btn" onClick={onClose} aria-label="Close schedule">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sub-banner: main event highlight */}
          {mainEvent && (
            <div className="ssm-main-event-banner">
              <span className="ssm-main-star">★</span>
              <span className="ssm-main-name">
                {mainEvent.event_name || mainEvent.name}
                {mainEvent.guaranteed || mainEvent.guarantee
                  ? <strong> — {formatMoney(mainEvent.guaranteed || mainEvent.guarantee)} GTD</strong>
                  : ''}
              </span>
              <span className="ssm-main-star">★</span>
            </div>
          )}
        </div>

        {/* ── Filter Bar ── */}
        <div className="ssm-filter-bar">
          <div className="ssm-filter-left">
            <div className="ssm-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="ssm-search"
                placeholder="Search events..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                id="ssm-event-search"
              />
            </div>
            {gameTypes.length > 1 && (
              <select className="ssm-filter-sel" value={gameFilter} onChange={e => setGameFilter(e.target.value)} id="ssm-game-filter">
                <option value="all">All Games</option>
                {gameTypes.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <select className="ssm-filter-sel" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} id="ssm-type-filter">
              {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <span className="ssm-event-count">{filtered.length} of {allEvents.length} events</span>
        </div>

        {/* ── Table ── */}
        <div className="ssm-table-wrap">
          {/* Column Headers */}
          <div className="ssm-header-row">
            <div className="ssm-col ssm-col-date">Date</div>
            <div className="ssm-col ssm-col-num">#</div>
            <div className="ssm-col ssm-col-time">Starts</div>
            <div className="ssm-col ssm-col-name">Event Name</div>
            <div className="ssm-col ssm-col-buyin">Buy-In</div>
            <div className="ssm-col ssm-col-reg">Reg Open</div>
            <div className="ssm-col ssm-col-gtd">GTD Prize</div>
            <div className="ssm-col ssm-col-chips">Chips</div>
            <div className="ssm-col ssm-col-levels">Levels</div>
          </div>

          {/* Rows */}
          <div className="ssm-rows">
            {filtered.length === 0 && (
              <div className="ssm-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <p>No events match your filter.</p>
              </div>
            )}
            {filtered.map((ev, idx) => <EventRow key={ev.id || idx} ev={ev} idx={idx} />)}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="ssm-footer">
          <span className="ssm-footer-note">
            Schedule data from {tourName || tourCode} official sources. Updated every 3 days.
          </span>
          <button className="ssm-footer-close" onClick={onClose}>Close</button>
        </div>
      </div>

      <style jsx global>{`
        .ssm-backdrop {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(4px);
          display: flex; align-items: stretch; justify-content: center;
          animation: ssm-fade-in 0.18s ease;
        }
        @keyframes ssm-fade-in { from { opacity: 0; } to { opacity: 1; } }

        .ssm-panel {
          width: 100%; max-width: 1200px;
          background: #0d1117;
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: ssm-slide-up 0.22s cubic-bezier(0.2, 0.8, 0.4, 1);
          border-left: 1px solid rgba(255,255,255,0.06);
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        @keyframes ssm-slide-up {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        /* ── Header ── */
        .ssm-header { padding: 0; flex-shrink: 0; }
        .ssm-header-inner {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 16px;
          padding: 20px 24px 16px;
        }
        .ssm-header-left { display: flex; align-items: flex-start; gap: 14px; flex: 1; min-width: 0; }
        .ssm-tour-badge {
          font-size: 11px; font-weight: 800; letter-spacing: 2px;
          text-transform: uppercase; background: rgba(0,0,0,0.25);
          padding: 4px 10px; border-radius: 6px; white-space: nowrap;
          margin-top: 3px;
        }
        .ssm-stop-name {
          margin: 0 0 4px; font-size: 20px; font-weight: 700;
          line-height: 1.2; color: #fff;
        }
        .ssm-venue { margin: 0 0 2px; font-size: 13px; font-weight: 500; }
        .ssm-dates { margin: 0; font-size: 12px; }

        .ssm-header-right { display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0; }
        .ssm-gtd-banner {
          display: flex; flex-direction: column; align-items: center;
          background: rgba(0,0,0,0.3); border-radius: 10px;
          padding: 8px 16px; text-align: center;
        }
        .ssm-gtd-label { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.7); }
        .ssm-gtd-amount { font-size: 22px; font-weight: 900; color: #fbbf24; line-height: 1.1; }
        .ssm-close-btn {
          background: rgba(0,0,0,0.3); border: none; border-radius: 50%;
          width: 36px; height: 36px; cursor: pointer; color: rgba(255,255,255,0.8);
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .ssm-close-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

        .ssm-main-event-banner {
          background: rgba(0,0,0,0.25); border-top: 1px solid rgba(255,255,255,0.1);
          padding: 8px 24px; display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 600; color: #fbbf24;
          text-align: center; justify-content: center;
        }
        .ssm-main-star { font-size: 14px; }
        .ssm-main-name { color: rgba(255,255,255,0.9); }
        .ssm-main-name strong { color: #fbbf24; }

        /* ── Filter Bar ── */
        .ssm-filter-bar {
          padding: 12px 20px; background: #0a0f1a;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          flex-wrap: wrap; flex-shrink: 0;
        }
        .ssm-filter-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ssm-search-wrap {
          display: flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; padding: 6px 10px; min-width: 180px;
        }
        .ssm-search {
          background: none; border: none; outline: none; color: #e2e8f0;
          font-size: 13px; width: 100%;
        }
        .ssm-search::placeholder { color: #475569; }
        .ssm-filter-sel {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; color: #94a3b8; font-size: 12px; padding: 6px 10px;
          cursor: pointer; outline: none;
        }
        .ssm-filter-sel:focus { border-color: rgba(0,212,255,0.4); }
        .ssm-event-count { font-size: 12px; color: #475569; white-space: nowrap; }

        /* ── Table Layout ── */
        .ssm-table-wrap { flex: 1; overflow-y: auto; overflow-x: auto; }

        .ssm-header-row,
        .ssm-row {
          display: grid;
          grid-template-columns: 80px 48px 72px 1fr 84px 72px 84px 64px 56px;
          gap: 0;
          align-items: center;
          min-width: 700px;
        }
        .ssm-header-row {
          position: sticky; top: 0; z-index: 10;
          background: #0a0f1a; border-bottom: 1px solid rgba(255,255,255,0.1);
          padding: 0 12px;
        }
        .ssm-header-row .ssm-col {
          padding: 10px 8px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px; color: #475569;
        }
        .ssm-rows { padding-bottom: 16px; }
        .ssm-row {
          padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.12s;
        }
        .ssm-row:hover { background: rgba(255,255,255,0.03); }
        .ssm-col { padding: 10px 8px; }

        /* Column-specific text styles */
        .ssm-day  { display: block; font-size: 10px; color: #60a5fa; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .ssm-date { display: block; font-size: 12px; color: #94a3b8; }
        .ssm-evt-num { font-size: 13px; font-weight: 600; color: #60a5fa; }
        .ssm-time { font-size: 12px; color: #e2e8f0; font-weight: 500; }
        .ssm-reg  { font-size: 11px; color: #94a3b8; }
        .ssm-na   { color: #374151; font-size: 13px; }

        .ssm-col-name { padding-right: 12px; }
        .ssm-name {
          display: block; font-size: 13px; font-weight: 600; color: #e2e8f0;
          line-height: 1.3; margin-bottom: 3px;
        }
        .ssm-badges { display: flex; gap: 4px; flex-wrap: wrap; }
        .ssm-game {
          font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          border: 1px solid; border-radius: 4px; padding: 1px 5px;
        }
        .ssm-badge {
          font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
          border-radius: 4px; padding: 1px 6px;
        }
        .ssm-badge-main   { background: rgba(234,179,8,0.2);   color: #fbbf24; }
        .ssm-badge-hr     { background: rgba(139,92,246,0.2);  color: #a78bfa; }
        .ssm-badge-sat    { background: rgba(16,185,129,0.2);  color: #34d399; }
        .ssm-badge-bounty { background: rgba(249,115,22,0.2);  color: #fb923c; }
        .ssm-badge-other  { background: rgba(148,163,184,0.1); color: #94a3b8; }

        .ssm-buyin {
          font-size: 12px; font-weight: 700; border-radius: 6px;
          border: 1px solid; padding: 3px 8px; white-space: nowrap;
          display: inline-block;
        }
        .ssm-gtd {
          font-size: 12px; font-weight: 700; color: #34d399;
          background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2);
          padding: 3px 7px; border-radius: 6px;
        }
        .ssm-chips { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .ssm-levels { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .ssm-min { font-size: 9px; color: #475569; margin-left: 1px; }

        /* ── Alternate row coloring ── */
        .ssm-rows > .ssm-row:nth-child(even) { background: rgba(255,255,255,0.012); }
        .ssm-row-main:nth-child(even) { background: rgba(234,179,8,0.05) !important; }

        /* ── Empty state ── */
        .ssm-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 10px; padding: 48px;
          color: #475569; font-size: 14px;
        }

        /* ── Footer ── */
        .ssm-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; background: #0a0f1a;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .ssm-footer-note { font-size: 11px; color: #374151; }
        .ssm-footer-close {
          background: none; border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8; font-size: 13px; padding: 6px 16px;
          border-radius: 8px; cursor: pointer; transition: all 0.15s;
        }
        .ssm-footer-close:hover { border-color: rgba(255,255,255,0.2); color: #e2e8f0; }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .ssm-header-inner { flex-direction: column; gap: 10px; }
          .ssm-header-right { align-self: flex-end; }
          .ssm-gtd-banner { display: none; }
          .ssm-stop-name { font-size: 16px; }
          .ssm-header-row,
          .ssm-row {
            grid-template-columns: 68px 36px 62px 1fr 76px 0px 76px 0px 0px;
          }
          .ssm-col-reg,
          .ssm-col-chips,
          .ssm-col-levels { display: none; }
        }
      `}</style>
    </div>
  );
}
