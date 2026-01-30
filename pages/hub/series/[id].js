/**
 * TOURNAMENT SERIES DETAIL PAGE
 * PokerAtlas-style series detail view with event schedule,
 * venue info, follow/share functionality.
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

// Tour badge color mapping
const TOUR_COLORS = {
  'WSOP':    { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  'WPT':     { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
  'WSOPC':   { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  'MSPT':    { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
  'RGPS':    { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
  'PGT':     { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
  'EPT':     { bg: 'linear-gradient(135deg, #0ea5e9, #0369a1)', text: '#fff', border: '#38bdf8' },
  'LAPC':    { bg: 'linear-gradient(135deg, #e11d48, #9f1239)', text: '#fff', border: '#fb7185' },
  'SHRPO':   { bg: 'linear-gradient(135deg, #d97706, #92400e)', text: '#fff', border: '#f59e0b' },
  'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' },
};

// Series type styling
const SERIES_TYPE_COLORS = {
  major:      { bg: '#d4a853', text: '#000' },
  circuit:    { bg: '#60a5fa', text: '#000' },
  regional:   { bg: '#a78bfa', text: '#000' },
  'mid-major': { bg: '#4ade80', text: '#000' },
  weekly:     { bg: '#94a3b8', text: '#000' },
};

function formatDateRange(startDate, endDate) {
  if (!startDate) return 'TBD';
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : null;

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const startYear = start.getFullYear();

  if (!end) return `${startMonth} ${startDay}, ${startYear}`;

  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();
  const endYear = end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`;
  }
  return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return 'N/A';
  return '$' + Number(amount).toLocaleString('en-US');
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSeriesStatus(startDate, endDate) {
  const now = new Date();
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T23:59:59') : start;

  if (now < start) {
    const diffMs = start - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 30) return { label: `Starts in ${diffDays} day${diffDays === 1 ? '' : 's'}`, color: '#fbbf24' };
    return { label: 'Upcoming', color: '#60a5fa' };
  }
  if (now <= end) return { label: 'In Progress', color: '#4ade80' };
  return { label: 'Completed', color: '#94a3b8' };
}

function getLocationParts(series) {
  // Handle both separate city/state fields and combined location string
  if (series.city && series.state) {
    return { city: series.city, state: series.state };
  }
  if (series.location) {
    const parts = series.location.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0], state: parts[1] };
    }
    return { city: series.location, state: '' };
  }
  return { city: '', state: '' };
}

export default function SeriesDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [shareMessage, setShareMessage] = useState('');

  // Load follow state - localStorage for instant UI, API for count
  useEffect(() => {
    if (!id) return;
    try {
      const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
      setIsFollowing(followed.includes(String(id)));
    } catch {
      // ignore parse errors
    }
    // Fetch follower count from API
    fetch(`/api/poker/follow?page_type=series&page_id=${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setFollowerCount(json.follower_count || 0);
      })
      .catch(() => {});
  }, [id]);

  // Fetch series data
  useEffect(() => {
    if (!id) return;
    const fetchSeries = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/poker/series?id=${id}`);
        const json = await res.json();

        if (json.success && json.data) {
          // API may return data as object (single) or array
          const seriesObj = Array.isArray(json.data) ? json.data[0] : json.data;
          if (seriesObj) {
            setSeries(seriesObj);
          } else {
            setError('Series not found');
          }
        } else {
          setError('Series not found');
        }
      } catch (e) {
        console.error('Error fetching series:', e);
        setError('Failed to load series data');
      }
      setLoading(false);
    };

    fetchSeries();
  }, [id]);

  const toggleFollow = () => {
    const sid = String(id);
    const newState = !isFollowing;
    setIsFollowing(newState);
    setFollowerCount(prev => newState ? prev + 1 : Math.max(0, prev - 1));

    // Update localStorage for instant persistence
    try {
      const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
      let updated;
      if (newState) {
        updated = followed.includes(sid) ? followed : [...followed, sid];
      } else {
        updated = followed.filter(x => x !== sid);
      }
      localStorage.setItem('followed-series', JSON.stringify(updated));
    } catch {
      // ignore
    }

    // Call API for server-side persistence
    fetch('/api/poker/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_type: 'series',
        page_id: sid,
        action: newState ? 'follow' : 'unfollow',
        user_id: getAnonymousUserId(),
      }),
    }).catch(() => {});
  };

  function getAnonymousUserId() {
    try {
      let uid = localStorage.getItem('sp-anon-uid');
      if (!uid) {
        uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('sp-anon-uid', uid);
      }
      return uid;
    } catch {
      return 'anon-fallback';
    }
  }

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: series?.name || 'Tournament Series',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage('Link copied!');
        setTimeout(() => setShareMessage(''), 2500);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage('Link copied!');
        setTimeout(() => setShareMessage(''), 2500);
      } catch {
        setShareMessage('Could not copy link');
        setTimeout(() => setShareMessage(''), 2500);
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <>
        <Head><title>Loading Series... | Smarter.Poker</title></Head>
        <UniversalHeader />
        <div className="series-page">
          <div className="loading-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading series details...</p>
          </div>
        </div>
        <style jsx>{styles}</style>
      </>
    );
  }

  // Error state
  if (error || !series) {
    return (
      <>
        <Head><title>Series Not Found | Smarter.Poker</title></Head>
        <UniversalHeader />
        <div className="series-page">
          <div className="error-container">
            <h2 className="error-title">Series Not Found</h2>
            <p className="error-text">{error || 'This tournament series could not be found.'}</p>
            <Link href="/hub/poker-near-me" legacyBehavior>
              <a className="back-link-btn">Back to Poker Near Me</a>
            </Link>
          </div>
        </div>
        <style jsx>{styles}</style>
      </>
    );
  }

  const tourStyle = TOUR_COLORS[series.short_name] || TOUR_COLORS[series.tour_code] || TOUR_COLORS.default;
  const typeStyle = SERIES_TYPE_COLORS[series.series_type] || SERIES_TYPE_COLORS.regional;
  const status = getSeriesStatus(series.start_date, series.end_date);
  const location = getLocationParts(series);
  const venueName = series.venue_name || series.venue || '';
  const sourceUrl = series.source_url || series.website || series.schedule_url || '';
  const events = series.events || [];

  return (
    <>
      <Head>
        <title>{series.name} | Smarter.Poker</title>
        <meta name="description" content={`${series.name} - ${formatDateRange(series.start_date, series.end_date)} at ${venueName || location.city}`} />
      </Head>
      <UniversalHeader />

      <div className="series-page">
        {/* Back Navigation */}
        <div className="back-nav">
          <Link href="/hub/poker-near-me" legacyBehavior>
            <a className="back-link">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Poker Near Me
            </a>
          </Link>
        </div>

        {/* Header Section */}
        <div className="series-header">
          <div className="header-badges">
            {/* Tour Badge */}
            <span
              className="tour-badge"
              style={{
                background: tourStyle.bg,
                color: tourStyle.text,
                borderColor: tourStyle.border,
              }}
            >
              {series.short_name || series.tour_code || 'SERIES'}
            </span>

            {/* Series Type Badge */}
            <span
              className="type-badge"
              style={{
                background: typeStyle.bg,
                color: typeStyle.text,
              }}
            >
              {(series.series_type || 'tournament').charAt(0).toUpperCase() + (series.series_type || 'tournament').slice(1)}
            </span>

            {/* Status Badge */}
            <span className="status-badge" style={{ color: status.color, borderColor: status.color }}>
              {status.label}
            </span>
          </div>

          <h1 className="series-title">{series.name}</h1>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              className={`action-btn follow-btn ${isFollowing ? 'following' : ''}`}
              onClick={toggleFollow}
            >
              {isFollowing ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                  </svg>
                  Following
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
                  </svg>
                  Follow
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                </>
              )}
            </button>
            <button className="action-btn share-btn" onClick={handleShare}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 8v5a1 1 0 001 1h6a1 1 0 001-1V8M11 4L8 1M8 1L5 4M8 1v9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {shareMessage || 'Share'}
            </button>
          </div>
        </div>

        {/* Key Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Dates</div>
            <div className="stat-value">{formatDateRange(series.start_date, series.end_date)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Main Event Buy-in</div>
            <div className="stat-value gold">{series.main_event_buyin ? formatMoney(series.main_event_buyin) : 'TBD'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Events</div>
            <div className="stat-value">{series.total_events || 'TBD'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Series Type</div>
            <div className="stat-value">
              <span className="inline-type-dot" style={{ background: typeStyle.bg }} />
              {(series.series_type || 'Tournament').charAt(0).toUpperCase() + (series.series_type || 'Tournament').slice(1)}
            </div>
          </div>
          {series.main_event_guaranteed && (
            <div className="stat-card">
              <div className="stat-label">Main Event GTD</div>
              <div className="stat-value gold">{formatMoney(series.main_event_guaranteed)}</div>
            </div>
          )}
          {series.total_guaranteed && (
            <div className="stat-card">
              <div className="stat-label">Total Guaranteed</div>
              <div className="stat-value gold">{formatMoney(series.total_guaranteed)}</div>
            </div>
          )}
        </div>

        {/* Venue Info */}
        <div className="section-card">
          <h2 className="section-title">Venue Information</h2>
          <div className="venue-info">
            {venueName && (
              <div className="venue-row">
                <span className="venue-label">Venue</span>
                <span className="venue-value">{venueName}</span>
              </div>
            )}
            {(location.city || location.state) && (
              <div className="venue-row">
                <span className="venue-label">Location</span>
                <span className="venue-value">
                  {location.city}{location.city && location.state ? ', ' : ''}{location.state}
                </span>
              </div>
            )}
            <div className="venue-links">
              {(venueName || location.city) && (
                <Link
                  href={`/hub/poker-near-me?search=${encodeURIComponent(venueName || location.city)}`}
                  legacyBehavior
                >
                  <a className="venue-link">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="7" cy="7" r="5"/>
                      <path d="M14 14l-3.5-3.5" strokeLinecap="round"/>
                    </svg>
                    Find venue on Poker Near Me
                  </a>
                </Link>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="venue-link external"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4M9 2h5v5M6.5 9.5L14 2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Official Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Events Section */}
        <div className="section-card">
          <h2 className="section-title">
            Event Schedule
            {events.length > 0 && <span className="event-count">{events.length} events</span>}
          </h2>

          {events.length > 0 ? (
            <div className="events-table-wrap">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Buy-in</th>
                    <th>Game</th>
                    <th>Format</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt, i) => (
                    <tr key={evt.event_number || i}>
                      <td className="event-num">{evt.event_number || i + 1}</td>
                      <td className="event-name">{evt.event_name || 'TBD'}</td>
                      <td className="event-date">{formatEventDate(evt.start_date)}</td>
                      <td className="event-buyin">{evt.buy_in ? formatMoney(evt.buy_in) : 'TBD'}</td>
                      <td className="event-game">{evt.game_type || '--'}</td>
                      <td className="event-format">{evt.format || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-events">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#64748b" strokeWidth="1.5">
                <rect x="5" y="8" width="30" height="24" rx="3"/>
                <path d="M5 16h30M13 5v6M27 5v6"/>
              </svg>
              <p>Event schedule not yet available</p>
              <p className="no-events-sub">Check back closer to the series start date for the full schedule.</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
  .series-page {
    min-height: 100vh;
    background: radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 20%, rgba(212, 168, 83, 0.06) 0%, transparent 50%),
                linear-gradient(180deg, #030712 0%, #0f172a 100%);
    padding: 80px 16px 60px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e2e8f0;
  }

  /* Back Navigation */
  .back-nav {
    max-width: 900px;
    margin: 0 auto 20px;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: #d4a853;
  }

  /* Header */
  .series-header {
    max-width: 900px;
    margin: 0 auto 28px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 28px 28px 24px;
    backdrop-filter: blur(12px);
  }

  .header-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 16px;
  }

  .tour-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 600;
    background: transparent;
  }

  .series-title {
    font-size: 28px;
    font-weight: 800;
    color: #f1f5f9;
    margin: 0 0 20px;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Inter', sans-serif;
  }

  .follow-btn {
    background: rgba(212, 168, 83, 0.12);
    border: 1px solid rgba(212, 168, 83, 0.3);
    color: #d4a853;
  }

  .follow-btn:hover {
    background: rgba(212, 168, 83, 0.22);
    border-color: #d4a853;
  }

  .follow-btn.following {
    background: rgba(74, 222, 128, 0.12);
    border-color: rgba(74, 222, 128, 0.3);
    color: #4ade80;
  }

  .follow-btn.following:hover {
    background: rgba(74, 222, 128, 0.22);
    border-color: #4ade80;
  }

  .follow-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: rgba(212, 168, 83, 0.2);
    font-size: 11px;
    font-weight: 700;
    color: #d4a853;
  }

  .share-btn {
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
  }

  .share-btn:hover {
    background: rgba(148, 163, 184, 0.16);
    border-color: rgba(148, 163, 184, 0.4);
    color: #e2e8f0;
  }

  /* Stats Grid */
  .stats-grid {
    max-width: 900px;
    margin: 0 auto 28px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px;
    backdrop-filter: blur(8px);
  }

  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-value.gold {
    color: #d4a853;
  }

  .inline-type-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Section Card */
  .section-card {
    max-width: 900px;
    margin: 0 auto 28px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 24px 28px;
    backdrop-filter: blur(12px);
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .event-count {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(148, 163, 184, 0.1);
    padding: 4px 10px;
    border-radius: 12px;
  }

  /* Venue Info */
  .venue-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .venue-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .venue-label {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    min-width: 72px;
    flex-shrink: 0;
  }

  .venue-value {
    font-size: 15px;
    color: #e2e8f0;
    font-weight: 500;
  }

  .venue-links {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 8px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .venue-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #60a5fa;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition: color 0.2s;
  }

  .venue-link:hover {
    color: #93bbfc;
  }

  .venue-link.external {
    color: #d4a853;
  }

  .venue-link.external:hover {
    color: #e8c370;
  }

  /* Events Table */
  .events-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -28px;
    padding: 0 28px;
  }

  .events-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
  }

  .events-table thead th {
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  .events-table tbody tr {
    transition: background 0.15s;
  }

  .events-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .events-table tbody td {
    padding: 12px 12px;
    font-size: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    vertical-align: middle;
  }

  .event-num {
    color: #64748b;
    font-weight: 600;
    font-size: 13px;
    width: 40px;
  }

  .event-name {
    color: #e2e8f0;
    font-weight: 600;
    max-width: 280px;
  }

  .event-date {
    color: #94a3b8;
    white-space: nowrap;
  }

  .event-buyin {
    color: #d4a853;
    font-weight: 700;
    white-space: nowrap;
  }

  .event-game {
    color: #94a3b8;
    white-space: nowrap;
  }

  .event-format {
    color: #94a3b8;
    white-space: nowrap;
  }

  /* No Events */
  .no-events {
    text-align: center;
    padding: 40px 20px;
    color: #64748b;
  }

  .no-events svg {
    margin-bottom: 16px;
  }

  .no-events p {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #94a3b8;
  }

  .no-events-sub {
    margin-top: 8px !important;
    font-size: 13px !important;
    font-weight: 400 !important;
    color: #64748b !important;
  }

  /* Loading */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(212, 168, 83, 0.15);
    border-top-color: #d4a853;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    margin-top: 16px;
    color: #94a3b8;
    font-size: 14px;
  }

  /* Error */
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
  }

  .error-title {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 12px;
  }

  .error-text {
    color: #94a3b8;
    font-size: 15px;
    margin: 0 0 24px;
  }

  .back-link-btn {
    display: inline-flex;
    align-items: center;
    padding: 12px 24px;
    background: rgba(212, 168, 83, 0.12);
    border: 1px solid rgba(212, 168, 83, 0.3);
    border-radius: 10px;
    color: #d4a853;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .back-link-btn:hover {
    background: rgba(212, 168, 83, 0.22);
    border-color: #d4a853;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .series-page {
      padding: 70px 12px 40px;
    }

    .series-header {
      padding: 20px 18px;
    }

    .series-title {
      font-size: 22px;
    }

    .stats-grid {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .stat-card {
      padding: 14px 16px;
    }

    .stat-value {
      font-size: 16px;
    }

    .section-card {
      padding: 18px 16px;
    }

    .events-table-wrap {
      margin: 0 -16px;
      padding: 0 16px;
    }

    .action-buttons {
      flex-direction: column;
    }

    .action-btn {
      justify-content: center;
    }

    .venue-row {
      flex-direction: column;
      gap: 2px;
    }
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .header-badges {
      gap: 8px;
    }

    .series-title {
      font-size: 20px;
    }
  }
`;
