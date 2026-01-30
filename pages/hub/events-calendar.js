/**
 * EVENTS CALENDAR - Poker Events Calendar with List and Grid Views
 * Shows upcoming tournaments and events across all venues and series.
 * Fetches from /api/poker/series and displays events in chronological order.
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const C = { bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B', border: '#DADDE1', blue: '#1877F2', green: '#42B72A' };

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const BUY_IN_RANGES = [
  { key: 'all', label: 'All Buy-ins' },
  { key: '0-500', label: 'Under $500', min: 0, max: 500 },
  { key: '500-1500', label: '$500 - $1,500', min: 500, max: 1500 },
  { key: '1500-5000', label: '$1,500 - $5,000', min: 1500, max: 5000 },
  { key: '5000-10000', label: '$5,000 - $10,000', min: 5000, max: 10000 },
  { key: '10000+', label: '$10,000+', min: 10000, max: Infinity },
];

function formatMoney(amount) {
  if (!amount && amount !== 0) return '--';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + amount.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isSameDay(dateStr1, dateStr2) {
  return dateStr1 === dateStr2;
}

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayKey() {
  return getDateKey(new Date());
}

function getWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - d.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startLabel = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - d.getDay());
  return getDateKey(startOfWeek);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

/* ---- Icons (SVG, no emojis) ---- */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function VenueIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/* ---- Event Card Component ---- */
function EventCard({ event, isToday }) {
  return (
    <div className="event-card" style={{
      background: C.card,
      border: `1px solid ${isToday ? C.blue : C.border}`,
      borderRadius: '10px',
      padding: '16px',
      marginBottom: '10px',
      boxShadow: isToday ? `0 0 0 1px ${C.blue}` : '0 1px 2px rgba(0,0,0,0.05)',
      transition: 'box-shadow 0.15s ease',
    }}>
      {isToday && (
        <div style={{
          display: 'inline-block',
          background: C.blue,
          color: '#fff',
          fontSize: '11px',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '4px',
          marginBottom: '8px',
          letterSpacing: '0.02em',
        }}>
          TODAY
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            color: C.text,
            lineHeight: 1.3,
          }}>
            {event.event_name || 'Unnamed Event'}
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: C.textSec }}>
              <CalendarIcon />
              {formatDate(event.event_date || event.start_date)}
            </span>
            {(event.start_time) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: C.textSec }}>
                <ClockIcon />
                {event.start_time}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
            {event.venue_name && event.venue_id && (
              <Link href={`/hub/venues/${event.venue_id}`} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '13px', color: C.blue, textDecoration: 'none', fontWeight: 500,
              }}>
                <VenueIcon />
                {event.venue_name}
              </Link>
            )}
            {event.venue_name && !event.venue_id && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: C.textSec }}>
                <VenueIcon />
                {event.venue_name}
              </span>
            )}
            {event.series_name && event.series_id && (
              <Link href={`/hub/series/${event.series_id}`} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '13px', color: C.blue, textDecoration: 'none', fontWeight: 500,
              }}>
                <TrophyIcon />
                {event.series_name}
              </Link>
            )}
            {event.series_name && !event.series_id && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: C.textSec }}>
                <TrophyIcon />
                {event.series_name}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {event.buy_in != null && (
            <div style={{
              fontSize: '15px',
              fontWeight: 700,
              color: C.text,
            }}>
              {formatMoney(event.buy_in)}
            </div>
          )}
          {event.guaranteed != null && event.guaranteed > 0 && (
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: C.green,
              marginTop: '2px',
            }}>
              {formatMoney(event.guaranteed)} GTD
            </div>
          )}
          {event.game_type && (
            <div style={{
              display: 'inline-block',
              marginTop: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: C.textSec,
              background: '#F0F2F5',
              padding: '2px 6px',
              borderRadius: '4px',
            }}>
              {event.game_type}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ---- Main Page ---- */
export default function EventsCalendarPage() {
  const [viewMode, setViewMode] = useState('list');
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [buyInRange, setBuyInRange] = useState('all');
  const [selectedSeries, setSelectedSeries] = useState('all');
  const [seriesOptions, setSeriesOptions] = useState([]);

  const todayKey = getTodayKey();

  /* ---- Fetch data ---- */
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/poker/series?limit=100');
        if (!res.ok) throw new Error('Failed to load series data');
        const json = await res.json();
        const seriesList = json.data || [];

        // Collect all unique series for filter dropdown
        const seriesOpts = [];
        const seenSeries = new Set();

        // Flatten events from all series
        const events = [];
        for (const series of seriesList) {
          const seriesName = series.name || series.short_name || 'Unknown Series';
          const seriesId = series.id;
          const venueName = series.venue || '';
          const venueId = series.venue_id || '';

          if (!seenSeries.has(seriesName)) {
            seenSeries.add(seriesName);
            seriesOpts.push({ key: String(seriesId), label: seriesName });
          }

          if (series.events && Array.isArray(series.events)) {
            for (const evt of series.events) {
              events.push({
                ...evt,
                event_date: evt.event_date || evt.start_date || '',
                series_name: seriesName,
                series_id: seriesId,
                venue_name: evt.venue_name || venueName,
                venue_id: evt.venue_id || venueId,
              });
            }
          } else {
            // If no events array, create an entry from the series itself
            events.push({
              event_name: seriesName,
              event_date: series.start_date || '',
              start_date: series.start_date || '',
              start_time: '',
              buy_in: series.main_event_buyin || null,
              guaranteed: series.main_event_guaranteed || null,
              series_name: seriesName,
              series_id: seriesId,
              venue_name: venueName,
              venue_id: venueId,
              game_type: series.series_type || '',
            });
          }
        }

        // Sort by date
        events.sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));

        setAllEvents(events);
        setSeriesOptions(seriesOpts);
      } catch (err) {
        console.error('Events calendar fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  /* ---- Filtered events ---- */
  const filteredEvents = allEvents.filter(evt => {
    // Buy-in filter
    if (buyInRange !== 'all') {
      const range = BUY_IN_RANGES.find(r => r.key === buyInRange);
      if (range) {
        const buyIn = evt.buy_in || 0;
        if (buyIn < range.min || buyIn > range.max) return false;
      }
    }
    // Series filter
    if (selectedSeries !== 'all') {
      if (String(evt.series_id) !== selectedSeries) return false;
    }
    return true;
  });

  /* ---- Upcoming events for list view (from today onward) ---- */
  const upcomingEvents = filteredEvents.filter(evt => {
    const d = evt.event_date || evt.start_date || '';
    return d >= todayKey;
  });

  /* ---- Group by week for list view ---- */
  const weekGroups = {};
  const weekOrder = [];
  for (const evt of upcomingEvents) {
    const dateStr = evt.event_date || evt.start_date || '';
    const wk = getWeekKey(dateStr);
    if (!weekGroups[wk]) {
      weekGroups[wk] = { label: getWeekLabel(dateStr), events: [] };
      weekOrder.push(wk);
    }
    weekGroups[wk].events.push(evt);
  }

  /* ---- Events grouped by date for calendar grid ---- */
  const eventsByDate = {};
  for (const evt of filteredEvents) {
    const dateStr = evt.event_date || evt.start_date || '';
    if (!dateStr) continue;
    if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
    eventsByDate[dateStr].push(evt);
  }

  /* ---- Calendar grid data ---- */
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const calendarCells = [];

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push({ day: null, key: `empty-${i}` });
  }
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = eventsByDate[dateKey] || [];
    calendarCells.push({
      day: d,
      dateKey,
      events: dayEvents,
      isToday: dateKey === todayKey,
      key: dateKey,
    });
  }

  const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  /* ---- Month navigation ---- */
  function goToPrevMonth() {
    setSelectedDate(null);
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  }

  function goToNextMonth() {
    setSelectedDate(null);
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  }

  function goToToday() {
    const today = new Date();
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setSelectedDate(todayKey);
  }

  /* ---- Render ---- */
  return (
    <>
      <Head>
        <title>Events Calendar | Smarter.Poker</title>
        <meta name="description" content="Browse upcoming poker tournaments and events across all venues and series." />
      </Head>
      <UniversalHeader />

      <div className="ec-page">
        {/* Page Header */}
        <div className="ec-header">
          <div className="ec-header-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CalendarIcon />
              <h1 className="ec-title">Events Calendar</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="ec-today-btn"
                onClick={goToToday}
              >
                Today
              </button>
              <div className="ec-view-toggle">
                <button
                  className={`ec-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  <ListIcon />
                  <span>List</span>
                </button>
                <button
                  className={`ec-view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                  onClick={() => setViewMode('calendar')}
                  title="Calendar View"
                >
                  <CalendarIcon />
                  <span>Calendar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="ec-filters-bar">
          <button
            className="ec-filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon />
            <span>Filters</span>
            {(buyInRange !== 'all' || selectedSeries !== 'all') && (
              <span className="ec-filter-badge">
                {[buyInRange !== 'all', selectedSeries !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>

          {showFilters && (
            <div className="ec-filter-panel">
              <div className="ec-filter-group">
                <label className="ec-filter-label">Buy-in Range</label>
                <select
                  className="ec-select"
                  value={buyInRange}
                  onChange={e => setBuyInRange(e.target.value)}
                >
                  {BUY_IN_RANGES.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="ec-filter-group">
                <label className="ec-filter-label">Series</label>
                <select
                  className="ec-select"
                  value={selectedSeries}
                  onChange={e => setSelectedSeries(e.target.value)}
                >
                  <option value="all">All Series</option>
                  {seriesOptions.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              {(buyInRange !== 'all' || selectedSeries !== 'all') && (
                <button
                  className="ec-clear-filters"
                  onClick={() => { setBuyInRange('all'); setSelectedSeries('all'); }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="ec-content">
          {loading && (
            <div className="ec-loading">
              <div className="ec-spinner" />
              <p style={{ color: C.textSec, marginTop: '12px', fontSize: '14px' }}>Loading events...</p>
            </div>
          )}

          {error && !loading && (
            <div className="ec-error">
              <p style={{ color: '#dc3545', fontWeight: 500 }}>Failed to load events</p>
              <p style={{ color: C.textSec, fontSize: '13px', marginTop: '4px' }}>{error}</p>
            </div>
          )}

          {!loading && !error && viewMode === 'list' && (
            <div className="ec-list-view">
              {upcomingEvents.length === 0 ? (
                <div className="ec-empty">
                  <CalendarIcon />
                  <p style={{ color: C.textSec, marginTop: '12px', fontSize: '15px', fontWeight: 500 }}>No upcoming events found</p>
                  <p style={{ color: C.textSec, fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters or check back later.</p>
                </div>
              ) : (
                <>
                  <div className="ec-count">
                    {upcomingEvents.length} upcoming event{upcomingEvents.length !== 1 ? 's' : ''}
                  </div>
                  {weekOrder.map(wk => (
                    <div key={wk} className="ec-week-group">
                      <div className="ec-week-label">{weekGroups[wk].label}</div>
                      {weekGroups[wk].events.map((evt, idx) => (
                        <EventCard
                          key={`${wk}-${idx}`}
                          event={evt}
                          isToday={isSameDay(evt.event_date || evt.start_date, todayKey)}
                        />
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {!loading && !error && viewMode === 'calendar' && (
            <div className="ec-calendar-view">
              {/* Month Navigation */}
              <div className="ec-month-nav">
                <button className="ec-nav-btn" onClick={goToPrevMonth}>
                  <ChevronLeft />
                </button>
                <h2 className="ec-month-label">
                  {MONTH_NAMES[calMonth]} {calYear}
                </h2>
                <button className="ec-nav-btn" onClick={goToNextMonth}>
                  <ChevronRight />
                </button>
              </div>

              {/* Day Headers */}
              <div className="ec-grid-header">
                {DAYS_SHORT.map(d => (
                  <div key={d} className="ec-day-header">{d}</div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="ec-grid">
                {calendarCells.map(cell => (
                  <div
                    key={cell.key}
                    className={`ec-cell ${cell.day ? 'has-day' : 'empty'} ${cell.isToday ? 'today' : ''} ${cell.dateKey === selectedDate ? 'selected' : ''}`}
                    onClick={() => {
                      if (cell.day) setSelectedDate(cell.dateKey === selectedDate ? null : cell.dateKey);
                    }}
                  >
                    {cell.day && (
                      <>
                        <span className={`ec-day-num ${cell.isToday ? 'today' : ''}`}>
                          {cell.day}
                        </span>
                        {cell.events && cell.events.length > 0 && (
                          <div className="ec-dot-row">
                            {cell.events.slice(0, 3).map((_, i) => (
                              <span key={i} className="ec-dot" />
                            ))}
                            {cell.events.length > 3 && (
                              <span className="ec-dot-more">+{cell.events.length - 3}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Selected Date Events */}
              {selectedDate && (
                <div className="ec-selected-date-panel">
                  <h3 className="ec-selected-date-title">
                    {formatDate(selectedDate)}
                    <span className="ec-selected-count">
                      {selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? 's' : ''}
                    </span>
                  </h3>
                  {selectedDateEvents.length === 0 ? (
                    <p style={{ color: C.textSec, fontSize: '13px', padding: '12px 0' }}>
                      No events scheduled for this date.
                    </p>
                  ) : (
                    selectedDateEvents.map((evt, idx) => (
                      <EventCard
                        key={idx}
                        event={evt}
                        isToday={isSameDay(evt.event_date || evt.start_date, todayKey)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .ec-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: ${C.bg};
          min-height: 100vh;
          padding-bottom: 60px;
        }

        .ec-header {
          background: ${C.card};
          border-bottom: 1px solid ${C.border};
          padding: 16px 20px;
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .ec-header-inner {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .ec-title {
          font-size: 22px;
          font-weight: 700;
          color: ${C.text};
          margin: 0;
        }

        .ec-today-btn {
          background: ${C.card};
          border: 1px solid ${C.border};
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 600;
          color: ${C.blue};
          cursor: pointer;
          font-family: inherit;
        }

        .ec-today-btn:hover {
          background: #F0F2F5;
        }

        .ec-view-toggle {
          display: flex;
          background: ${C.bg};
          border-radius: 8px;
          padding: 3px;
          border: 1px solid ${C.border};
        }

        .ec-view-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: ${C.textSec};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }

        .ec-view-btn.active {
          background: ${C.card};
          color: ${C.blue};
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .ec-filters-bar {
          max-width: 900px;
          margin: 16px auto 0;
          padding: 0 20px;
        }

        .ec-filter-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: ${C.card};
          border: 1px solid ${C.border};
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
        }

        .ec-filter-toggle:hover {
          border-color: ${C.blue};
          color: ${C.blue};
        }

        .ec-filter-badge {
          background: ${C.blue};
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }

        .ec-filter-panel {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
          margin-top: 12px;
          padding: 16px;
          background: ${C.card};
          border: 1px solid ${C.border};
          border-radius: 10px;
        }

        .ec-filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ec-filter-label {
          font-size: 12px;
          font-weight: 600;
          color: ${C.textSec};
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .ec-select {
          padding: 8px 12px;
          border: 1px solid ${C.border};
          border-radius: 6px;
          font-size: 13px;
          color: ${C.text};
          background: ${C.card};
          font-family: inherit;
          min-width: 180px;
          cursor: pointer;
        }

        .ec-select:focus {
          outline: none;
          border-color: ${C.blue};
          box-shadow: 0 0 0 2px rgba(24, 119, 242, 0.15);
        }

        .ec-clear-filters {
          padding: 8px 14px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: ${C.blue};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        .ec-clear-filters:hover {
          background: rgba(24, 119, 242, 0.08);
        }

        .ec-content {
          max-width: 900px;
          margin: 16px auto 0;
          padding: 0 20px;
        }

        .ec-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 0;
        }

        .ec-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid ${C.border};
          border-top-color: ${C.blue};
          border-radius: 50%;
          animation: ec-spin 0.8s linear infinite;
        }

        @keyframes ec-spin {
          to { transform: rotate(360deg); }
        }

        .ec-error {
          text-align: center;
          padding: 40px 20px;
          background: ${C.card};
          border-radius: 10px;
          border: 1px solid ${C.border};
        }

        .ec-empty {
          text-align: center;
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .ec-count {
          font-size: 13px;
          font-weight: 600;
          color: ${C.textSec};
          margin-bottom: 16px;
        }

        /* ---- List View ---- */
        .ec-list-view {
        }

        .ec-week-group {
          margin-bottom: 24px;
        }

        .ec-week-label {
          font-size: 14px;
          font-weight: 700;
          color: ${C.text};
          margin-bottom: 10px;
          padding: 6px 0;
          border-bottom: 2px solid ${C.border};
        }

        /* ---- Calendar View ---- */
        .ec-calendar-view {
        }

        .ec-month-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .ec-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: ${C.card};
          color: ${C.text};
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .ec-nav-btn:hover {
          border-color: ${C.blue};
          color: ${C.blue};
          background: rgba(24, 119, 242, 0.05);
        }

        .ec-month-label {
          font-size: 20px;
          font-weight: 700;
          color: ${C.text};
          margin: 0;
          min-width: 200px;
          text-align: center;
        }

        .ec-grid-header {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
          margin-bottom: 4px;
        }

        .ec-day-header {
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          color: ${C.textSec};
          padding: 8px 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .ec-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          background: ${C.card};
          border: 1px solid ${C.border};
          border-radius: 10px;
          overflow: hidden;
        }

        .ec-cell {
          min-height: 80px;
          padding: 6px;
          background: ${C.card};
          border: 1px solid transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: default;
          transition: background 0.12s ease;
        }

        .ec-cell.has-day {
          cursor: pointer;
        }

        .ec-cell.has-day:hover {
          background: #F0F2F5;
        }

        .ec-cell.today {
          background: rgba(24, 119, 242, 0.04);
        }

        .ec-cell.selected {
          background: rgba(24, 119, 242, 0.08);
          border-color: ${C.blue};
        }

        .ec-cell.empty {
          background: #FAFBFC;
        }

        .ec-day-num {
          font-size: 13px;
          font-weight: 500;
          color: ${C.text};
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .ec-day-num.today {
          background: ${C.blue};
          color: #fff;
          font-weight: 700;
        }

        .ec-dot-row {
          display: flex;
          align-items: center;
          gap: 3px;
          margin-top: 4px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .ec-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${C.blue};
        }

        .ec-dot-more {
          font-size: 10px;
          font-weight: 600;
          color: ${C.textSec};
        }

        .ec-selected-date-panel {
          margin-top: 20px;
          padding: 16px;
          background: ${C.card};
          border: 1px solid ${C.border};
          border-radius: 10px;
        }

        .ec-selected-date-title {
          font-size: 16px;
          font-weight: 700;
          color: ${C.text};
          margin: 0 0 12px 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ec-selected-count {
          font-size: 13px;
          font-weight: 500;
          color: ${C.textSec};
        }

        @media (max-width: 640px) {
          .ec-header-inner {
            flex-direction: column;
            align-items: flex-start;
          }

          .ec-cell {
            min-height: 56px;
            padding: 4px 2px;
          }

          .ec-day-num {
            font-size: 12px;
            width: 24px;
            height: 24px;
          }

          .ec-month-label {
            font-size: 17px;
            min-width: 160px;
          }

          .ec-filter-panel {
            flex-direction: column;
          }

          .ec-select {
            min-width: 100%;
          }

          .ec-view-btn span {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
