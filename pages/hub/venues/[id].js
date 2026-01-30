/**
 * VENUE DETAIL PAGE - PokerAtlas-style venue profile
 * Displays full venue info, contact details, daily tournament schedules
 * Fetches venue data from /api/poker/venues?id=X
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Card Room',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity',
};

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.replace(/([AP])M$/i, ' $1M');
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '-';
  if (typeof amount === 'string') {
    if (amount.startsWith('$')) return amount;
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return `$${num.toLocaleString()}`;
  }
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function TrustDots({ score }) {
  const maxDots = 5;
  const filled = Math.round(score || 0);
  return (
    <div className="trust-dots">
      {Array.from({ length: maxDots }, (_, i) => (
        <span
          key={i}
          className={`trust-dot ${i < filled ? 'filled' : ''}`}
        />
      ))}
      <span className="trust-label">{score ? score.toFixed(1) : 'N/A'}</span>
      <style jsx>{`
        .trust-dots {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .trust-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: background 0.2s;
        }
        .trust-dot.filled {
          background: #d4a853;
          border-color: #d4a853;
          box-shadow: 0 0 4px rgba(212, 168, 83, 0.4);
        }
        .trust-label {
          margin-left: 6px;
          font-size: 13px;
          color: #d4a853;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function VenueTypeBadge({ type }) {
  const label = VENUE_TYPE_LABELS[type] || type || 'Venue';
  const colorMap = {
    casino: { bg: 'rgba(212, 168, 83, 0.15)', border: '#d4a853', text: '#d4a853' },
    card_room: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },
    poker_club: { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#8b5cf6' },
    home_game: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#22c55e' },
    charity: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#ec4899' },
  };
  const colors = colorMap[type] || { bg: 'rgba(255,255,255,0.1)', border: '#6b7280', text: '#9ca3af' };

  return (
    <span className="venue-type-badge">
      {label}
      <style jsx>{`
        .venue-type-badge {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          background: ${colors.bg};
          border: 1px solid ${colors.border};
          color: ${colors.text};
        }
      `}</style>
    </span>
  );
}

export default function VenueDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Check follow status on mount
  useEffect(() => {
    if (!id) return;
    try {
      const stored = localStorage.getItem('followed-venues');
      const ids = stored ? JSON.parse(stored) : [];
      setIsFollowed(ids.includes(String(id)));
    } catch {
      // ignore parse errors
    }
  }, [id]);

  // Fetch venue data
  useEffect(() => {
    if (!id) return;

    const fetchVenue = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/poker/venues?id=${id}`);
        const json = await res.json();

        if (json.success && json.data) {
          // API may return array or single object
          const venueData = Array.isArray(json.data)
            ? json.data.find(v => String(v.id) === String(id)) || json.data[0]
            : json.data;
          setVenue(venueData);
        } else {
          setError('Venue not found');
        }
      } catch (err) {
        console.error('Failed to fetch venue:', err);
        setError('Failed to load venue data');
      } finally {
        setLoading(false);
      }
    };

    fetchVenue();
  }, [id]);

  const handleFollow = () => {
    try {
      const stored = localStorage.getItem('followed-venues');
      let ids = stored ? JSON.parse(stored) : [];
      const venueId = String(id);

      if (ids.includes(venueId)) {
        ids = ids.filter(x => x !== venueId);
        setIsFollowed(false);
      } else {
        ids.push(venueId);
        setIsFollowed(true);
      }
      localStorage.setItem('followed-venues', JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const googleMapsUrl = venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [venue.address, venue.city, venue.state].filter(Boolean).join(', ')
      )}`
    : '#';

  // Group daily tournament schedules by day
  const getGroupedSchedules = () => {
    if (!venue?.daily_tournaments?.length) return null;

    const allSchedules = [];
    venue.daily_tournaments.forEach(dt => {
      if (dt.schedules && dt.schedules.length) {
        dt.schedules.forEach(s => {
          allSchedules.push({
            ...s,
            source_url: dt.source_url,
          });
        });
      }
    });

    if (!allSchedules.length) return null;

    // Group by day
    const grouped = {};
    allSchedules.forEach(s => {
      const day = s.day_of_week || 'Unknown';
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(s);
    });

    // Sort days in order
    const sorted = {};
    DAYS_ORDER.forEach(day => {
      if (grouped[day]) sorted[day] = grouped[day];
    });
    // Add any days not in standard order
    Object.keys(grouped).forEach(day => {
      if (!sorted[day]) sorted[day] = grouped[day];
    });

    return sorted;
  };

  const groupedSchedules = venue ? getGroupedSchedules() : null;
  const todayName = DAYS_ORDER[(new Date().getDay() + 6) % 7]; // JS getDay: 0=Sun, we want Mon=0

  const pageTitle = venue ? `${venue.name} - Poker Venue` : 'Venue Detail';

  return (
    <>
      <Head>
        <title>{pageTitle} | Smarter.Poker</title>
        <meta name="description" content={venue ? `${venue.name} poker room in ${venue.city}, ${venue.state}. Find tournaments, hours, and contact info.` : 'Poker venue details'} />
      </Head>

      <UniversalHeader />

      <div className="venue-page">
        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading venue...</p>
          </div>
        )}

        {error && !loading && (
          <div className="error-state">
            <div className="error-icon">!</div>
            <h2>Venue Not Found</h2>
            <p>{error}</p>
            <Link href="/hub/poker-near-me">
              <a className="back-link-btn">Back to Poker Near Me</a>
            </Link>
          </div>
        )}

        {venue && !loading && (
          <>
            {/* Back Navigation */}
            <div className="back-nav">
              <Link href="/hub/poker-near-me">
                <a className="back-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back to Poker Near Me
                </a>
              </Link>
            </div>

            {/* Header Section */}
            <header className="venue-header">
              <div className="venue-header-top">
                <div className="venue-name-group">
                  <h1 className="venue-name">{venue.name}</h1>
                  <div className="venue-meta">
                    <VenueTypeBadge type={venue.venue_type} />
                    {venue.is_featured && (
                      <span className="featured-badge">Featured</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="venue-location">
                {venue.city && venue.state && (
                  <span className="location-text">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {venue.city}, {venue.state}
                  </span>
                )}
              </div>
              <div className="venue-trust">
                <span className="trust-text">Trust Score</span>
                <TrustDots score={venue.trust_score} />
              </div>

              {/* Follow / Share Buttons */}
              <div className="action-buttons">
                <button
                  className={`action-btn follow-btn ${isFollowed ? 'followed' : ''}`}
                  onClick={handleFollow}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={isFollowed ? '#d4a853' : 'none'} stroke={isFollowed ? '#d4a853' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {isFollowed ? 'Following' : 'Follow'}
                </button>
                <button className="action-btn share-btn" onClick={handleShare}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {copySuccess ? 'Copied!' : 'Share'}
                </button>
              </div>
            </header>

            {/* Contact & Info Section */}
            <section className="info-section">
              <h2 className="section-title">Contact & Info</h2>
              <div className="info-grid">
                {/* Address */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Address</span>
                    {venue.address ? (
                      <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="info-value info-link">
                        {venue.address}
                        {venue.city && `, ${venue.city}`}
                        {venue.state && `, ${venue.state}`}
                      </a>
                    ) : (
                      <span className="info-value">
                        {venue.city && venue.state ? `${venue.city}, ${venue.state}` : 'Not available'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Phone</span>
                    {venue.phone ? (
                      <a href={`tel:${venue.phone}`} className="info-value info-link">{venue.phone}</a>
                    ) : (
                      <span className="info-value muted">Not available</span>
                    )}
                  </div>
                </div>

                {/* Website */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Website</span>
                    {venue.website ? (
                      <a href={venue.website} target="_blank" rel="noopener noreferrer" className="info-value info-link">
                        {venue.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    ) : (
                      <span className="info-value muted">Not available</span>
                    )}
                  </div>
                </div>

                {/* Hours */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Hours</span>
                    <span className="info-value">{venue.hours || 'Not listed'}</span>
                  </div>
                </div>

                {/* PokerAtlas */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">PokerAtlas</span>
                    {venue.poker_atlas_url ? (
                      <a href={venue.poker_atlas_url} target="_blank" rel="noopener noreferrer" className="info-value info-link">
                        View on PokerAtlas
                      </a>
                    ) : (
                      <span className="info-value muted">Not listed</span>
                    )}
                  </div>
                </div>

                {/* Has Tournaments */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                      <path d="M4 22h16" />
                      <path d="M10 22V2h4v20" />
                      <path d="M8 9h8" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Tournaments</span>
                    <span className={`info-value ${venue.has_tournaments ? 'has-yes' : 'muted'}`}>
                      {venue.has_tournaments ? 'Yes - Tournaments Available' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Daily Tournaments Section */}
            {groupedSchedules && Object.keys(groupedSchedules).length > 0 && (
              <section className="tournaments-section">
                <h2 className="section-title">Daily Tournament Schedule</h2>
                <div className="schedule-container">
                  {Object.entries(groupedSchedules).map(([day, schedules]) => {
                    const isToday = day === DAYS_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
                      || day === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
                    return (
                      <div key={day} className={`day-group ${isToday ? 'today' : ''}`}>
                        <div className="day-header">
                          <h3 className="day-name">{day}</h3>
                          {isToday && <span className="today-badge">Today</span>}
                        </div>
                        <div className="schedule-cards">
                          {schedules.map((s, idx) => (
                            <div key={idx} className="schedule-card">
                              <div className="schedule-row">
                                <div className="schedule-time">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  {formatTime(s.start_time) || 'TBD'}
                                </div>
                                {s.buy_in && (
                                  <div className="schedule-buyin">
                                    {formatMoney(s.buy_in)}
                                  </div>
                                )}
                              </div>
                              <div className="schedule-details">
                                {s.game_type && (
                                  <span className="detail-chip game-type">{s.game_type}</span>
                                )}
                                {s.format && (
                                  <span className="detail-chip format">{s.format}</span>
                                )}
                                {s.guaranteed && (
                                  <span className="detail-chip guaranteed">
                                    GTD: {formatMoney(s.guaranteed)}
                                  </span>
                                )}
                              </div>
                              {s.notes && (
                                <p className="schedule-notes">{s.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* No tournaments fallback */}
            {(!groupedSchedules || Object.keys(groupedSchedules).length === 0) && venue.has_tournaments && (
              <section className="tournaments-section">
                <h2 className="section-title">Daily Tournament Schedule</h2>
                <div className="empty-tournaments">
                  <p>Tournament schedule data is being collected for this venue.</p>
                  {venue.poker_atlas_url && (
                    <a href={venue.poker_atlas_url} target="_blank" rel="noopener noreferrer" className="pa-link">
                      Check PokerAtlas for current schedule
                    </a>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .venue-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #030712 0%, #0f172a 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #e2e8f0;
          padding-bottom: 60px;
        }

        /* Loading State */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 16px;
        }
        .loading-state p {
          color: #94a3b8;
          font-size: 15px;
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(212, 168, 83, 0.2);
          border-top-color: #d4a853;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Error State */
        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 12px;
          text-align: center;
          padding: 24px;
        }
        .error-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.15);
          border: 2px solid #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 700;
          color: #ef4444;
        }
        .error-state h2 {
          font-size: 20px;
          color: #f1f5f9;
          margin: 0;
        }
        .error-state p {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
        }
        .back-link-btn {
          margin-top: 8px;
          padding: 10px 24px;
          background: rgba(212, 168, 83, 0.15);
          border: 1px solid #d4a853;
          border-radius: 8px;
          color: #d4a853;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.2s;
        }
        .back-link-btn:hover {
          background: rgba(212, 168, 83, 0.25);
        }

        /* Back Navigation */
        .back-nav {
          padding: 16px 24px 0;
          max-width: 900px;
          margin: 0 auto;
        }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .back-link:hover {
          color: #d4a853;
        }

        /* Header Section */
        .venue-header {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px 24px 24px;
        }
        .venue-header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .venue-name-group {
          flex: 1;
        }
        .venue-name {
          font-size: 32px;
          font-weight: 800;
          color: #f8fafc;
          margin: 0 0 12px;
          line-height: 1.2;
          letter-spacing: -0.5px;
        }
        .venue-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .featured-badge {
          display: inline-block;
          padding: 3px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          background: linear-gradient(135deg, rgba(212, 168, 83, 0.2), rgba(212, 168, 83, 0.1));
          border: 1px solid rgba(212, 168, 83, 0.4);
          color: #d4a853;
        }
        .venue-location {
          margin-top: 12px;
        }
        .location-text {
          color: #94a3b8;
          font-size: 15px;
          font-weight: 500;
        }
        .venue-trust {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
        }
        .trust-text {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }

        /* Action Buttons */
        .action-buttons {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .follow-btn {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #cbd5e1;
        }
        .follow-btn:hover {
          border-color: #d4a853;
          color: #d4a853;
          background: rgba(212, 168, 83, 0.08);
        }
        .follow-btn.followed {
          background: rgba(212, 168, 83, 0.12);
          border-color: #d4a853;
          color: #d4a853;
        }
        .share-btn {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #cbd5e1;
        }
        .share-btn:hover {
          border-color: rgba(255, 255, 255, 0.3);
          color: #f1f5f9;
        }

        /* Section Titles */
        .section-title {
          font-size: 20px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* Info Section */
        .info-section {
          max-width: 900px;
          margin: 8px auto 0;
          padding: 0 24px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .info-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          backdrop-filter: blur(12px);
          transition: border-color 0.2s;
        }
        .info-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        .info-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(212, 168, 83, 0.08);
          border-radius: 8px;
        }
        .info-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .info-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .info-value {
          font-size: 14px;
          color: #e2e8f0;
          font-weight: 500;
          word-break: break-word;
        }
        .info-value.muted {
          color: #475569;
          font-style: italic;
        }
        .info-value.has-yes {
          color: #22c55e;
        }
        .info-link {
          color: #d4a853;
          text-decoration: none;
          transition: color 0.2s;
        }
        .info-link:hover {
          color: #e8c374;
          text-decoration: underline;
        }

        /* Tournaments Section */
        .tournaments-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .schedule-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .day-group {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          backdrop-filter: blur(12px);
        }
        .day-group.today {
          border-color: rgba(212, 168, 83, 0.3);
          box-shadow: 0 0 20px rgba(212, 168, 83, 0.05);
        }
        .day-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .day-name {
          font-size: 16px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }
        .today-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 2px 10px;
          border-radius: 10px;
          background: rgba(212, 168, 83, 0.15);
          border: 1px solid rgba(212, 168, 83, 0.3);
          color: #d4a853;
        }
        .schedule-cards {
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .schedule-card {
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          transition: border-color 0.2s;
        }
        .schedule-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
        }
        .schedule-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
        }
        .schedule-time {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
          display: flex;
          align-items: center;
        }
        .schedule-buyin {
          font-size: 15px;
          font-weight: 700;
          color: #d4a853;
        }
        .schedule-details {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .detail-chip {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .detail-chip.game-type {
          background: rgba(59, 130, 246, 0.12);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
        .detail-chip.format {
          background: rgba(139, 92, 246, 0.12);
          color: #a78bfa;
          border: 1px solid rgba(139, 92, 246, 0.2);
        }
        .detail-chip.guaranteed {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .schedule-notes {
          margin: 6px 0 0;
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.4;
          font-style: italic;
        }

        /* Empty Tournaments */
        .empty-tournaments {
          text-align: center;
          padding: 32px 24px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .empty-tournaments p {
          color: #64748b;
          font-size: 14px;
          margin: 0 0 12px;
        }
        .pa-link {
          display: inline-block;
          color: #d4a853;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .pa-link:hover {
          text-decoration: underline;
        }

        /* Mobile Responsive */
        @media (max-width: 640px) {
          .venue-name {
            font-size: 24px;
          }
          .info-grid {
            grid-template-columns: 1fr;
          }
          .venue-header,
          .info-section,
          .tournaments-section,
          .back-nav {
            padding-left: 16px;
            padding-right: 16px;
          }
          .action-buttons {
            flex-direction: column;
          }
          .action-btn {
            justify-content: center;
          }
          .schedule-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </>
  );
}
