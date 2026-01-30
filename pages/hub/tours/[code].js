/**
 * TOUR DETAIL PAGE - PokerAtlas-style tour information
 * Displays tour details, about info, and upcoming series
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const TOUR_COLORS = {
  'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
  'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
  'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff' },
  'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff' },
  'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff' },
  'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff' },
  'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff' },
};

const TOUR_TYPE_LABELS = {
  major: 'Major',
  circuit: 'Circuit',
  regional: 'Regional',
  high_roller: 'High Roller',
  grassroots: 'Grassroots',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return 'TBD';
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : null;

  const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (!end) return startFormatted;

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${startFormatted} - ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) {
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startFormatted} - ${endFormatted}, ${end.getFullYear()}`;
  }

  const endFull = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startFormatted}, ${start.getFullYear()} - ${endFull}`;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function getSeriesTypeBadge(type) {
  const map = {
    major: { label: 'Major', bg: '#7c3aed' },
    circuit: { label: 'Circuit', bg: '#2563eb' },
    regional: { label: 'Regional', bg: '#059669' },
    festival: { label: 'Festival', bg: '#d97706' },
    championship: { label: 'Championship', bg: '#dc2626' },
    default: { label: type || 'Series', bg: '#4b5563' },
  };
  return map[type] || map.default;
}

export default function TourDetailPage() {
  const router = useRouter();
  const { code } = router.query;

  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [shareMessage, setShareMessage] = useState('');

  // Load follow state - localStorage for instant UI, API for count
  useEffect(() => {
    if (!code) return;
    try {
      const followed = JSON.parse(localStorage.getItem('followed-tours') || '[]');
      setIsFollowed(followed.includes(code));
    } catch {
      setIsFollowed(false);
    }
    // Fetch follower count from API
    fetch(`/api/poker/follow?page_type=tour&page_id=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setFollowerCount(json.follower_count || 0);
      })
      .catch(() => {});
  }, [code]);

  // Fetch tour data
  useEffect(() => {
    if (!code) return;

    async function fetchTour() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/poker/tours?tour_code=${encodeURIComponent(code)}&include_series=true`);
        if (!res.ok) {
          throw new Error(`Failed to fetch tour data (${res.status})`);
        }
        const response = await res.json();
        if (response.data && response.data.length > 0) {
          setTour(response.data[0]);
        } else {
          setError('Tour not found');
        }
      } catch (err) {
        setError(err.message || 'Failed to load tour');
      } finally {
        setLoading(false);
      }
    }

    fetchTour();
  }, [code]);

  function handleFollow() {
    const newState = !isFollowed;
    setIsFollowed(newState);
    setFollowerCount(prev => newState ? prev + 1 : Math.max(0, prev - 1));

    // Update localStorage for instant persistence
    try {
      const followed = JSON.parse(localStorage.getItem('followed-tours') || '[]');
      let updated;
      if (newState) {
        updated = followed.includes(code) ? followed : [...followed, code];
      } else {
        updated = followed.filter((c) => c !== code);
      }
      localStorage.setItem('followed-tours', JSON.stringify(updated));
    } catch {
      // Silently fail
    }

    // Call API for server-side persistence
    fetch('/api/poker/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_type: 'tour',
        page_id: code,
        action: newState ? 'follow' : 'unfollow',
        user_id: getAnonymousUserId(),
      }),
    }).catch(() => {});
  }

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

  function handleShare() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setShareMessage('Link copied!');
        setTimeout(() => setShareMessage(''), 2000);
      }).catch(() => {
        setShareMessage('Failed to copy');
        setTimeout(() => setShareMessage(''), 2000);
      });
    } else {
      setShareMessage('Copy not supported');
      setTimeout(() => setShareMessage(''), 2000);
    }
  }

  const tourColor = TOUR_COLORS[code] || TOUR_COLORS['default'];
  const tourTypeLabel = tour ? (TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type) : '';
  const pageTitle = tour ? `${tour.tour_name} | Smarter.Poker` : 'Tour Details | Smarter.Poker';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={tour ? `${tour.tour_name} - poker tour details, upcoming series, and more` : 'Poker tour details'} />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <UniversalHeader />

      <div className="tour-page">
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading tour details...</p>
          </div>
        )}

        {error && !loading && (
          <div className="error-container">
            <div className="error-icon">!</div>
            <h2 className="error-title">Tour Not Found</h2>
            <p className="error-text">{error}</p>
            <Link href="/hub/poker-near-me" legacyBehavior>
              <a className="back-link-btn">Back to Poker Near Me</a>
            </Link>
          </div>
        )}

        {tour && !loading && (
          <>
            {/* Header Section */}
            <section className="tour-header">
              <div className="header-content">
                <Link href="/hub/poker-near-me" legacyBehavior>
                  <a className="back-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back to Poker Near Me
                  </a>
                </Link>

                <div className="header-top-row">
                  <h1 className="tour-name">{tour.tour_name}</h1>
                  <div className="header-actions">
                    <button
                      className={`follow-btn ${isFollowed ? 'followed' : ''}`}
                      onClick={handleFollow}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isFollowed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      {isFollowed ? 'Following' : 'Follow'}
                      {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                    </button>
                    <button className="share-btn" onClick={handleShare}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      Share
                    </button>
                    {shareMessage && <span className="share-message">{shareMessage}</span>}
                  </div>
                </div>

                <div className="badges-row">
                  <span className="tour-code-badge" style={{ background: tourColor.bg, color: tourColor.text }}>
                    {tour.tour_code}
                  </span>
                  {tourTypeLabel && (
                    <span className="tour-type-badge">
                      {tourTypeLabel}
                    </span>
                  )}
                </div>

                {tour.headquarters && (
                  <div className="headquarters">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{tour.headquarters}</span>
                  </div>
                )}
              </div>
            </section>

            {/* About Section */}
            <section className="tour-about">
              <h2 className="section-title">About</h2>
              <div className="about-grid">
                {tour.official_website && (
                  <div className="about-item">
                    <span className="about-label">Official Website</span>
                    <a
                      href={tour.official_website.startsWith('http') ? tour.official_website : `https://${tour.official_website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="about-link"
                    >
                      {tour.official_website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                )}

                {tour.established && (
                  <div className="about-item">
                    <span className="about-label">Established</span>
                    <span className="about-value">{tour.established}</span>
                  </div>
                )}

                {tour.typical_buyins && (tour.typical_buyins.min || tour.typical_buyins.max) && (
                  <div className="about-item">
                    <span className="about-label">Typical Buy-in Range</span>
                    <span className="about-value">
                      {tour.typical_buyins.min && tour.typical_buyins.max
                        ? `${formatMoney(tour.typical_buyins.min)} - ${formatMoney(tour.typical_buyins.max)}`
                        : tour.typical_buyins.min
                          ? `From ${formatMoney(tour.typical_buyins.min)}`
                          : `Up to ${formatMoney(tour.typical_buyins.max)}`}
                      {tour.typical_buyins.main_event && (
                        <span className="main-event-buyin"> (Main Event: {formatMoney(tour.typical_buyins.main_event)})</span>
                      )}
                    </span>
                  </div>
                )}

                {tour.regions && tour.regions.length > 0 && (
                  <div className="about-item about-item-full">
                    <span className="about-label">Regions</span>
                    <div className="regions-list">
                      {tour.regions.map((region, idx) => (
                        <span key={idx} className="region-tag">{region}</span>
                      ))}
                    </div>
                  </div>
                )}

                {tour.notes && (
                  <div className="about-item about-item-full">
                    <span className="about-label">Notes</span>
                    <p className="about-notes">{tour.notes}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Upcoming Series Section */}
            <section className="tour-series">
              <h2 className="section-title">
                Upcoming Series
                {tour.upcoming_series && tour.upcoming_series.length > 0 && (
                  <span className="series-count">{tour.upcoming_series.length}</span>
                )}
              </h2>

              {(!tour.upcoming_series || tour.upcoming_series.length === 0) && (
                <div className="empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <p>No upcoming series announced yet.</p>
                  <p className="empty-subtext">Check back soon for updates.</p>
                </div>
              )}

              {tour.upcoming_series && tour.upcoming_series.length > 0 && (
                <div className="series-grid">
                  {tour.upcoming_series.map((series, idx) => {
                    const seriesTypeBadge = getSeriesTypeBadge(series.series_type);
                    return (
                      <Link key={idx} href={`/hub/series/${idx + 1}`} legacyBehavior>
                        <a className="series-card">
                          <div className="series-card-header">
                            <h3 className="series-name">{series.name}</h3>
                            {series.series_type && (
                              <span className="series-type-badge" style={{ backgroundColor: seriesTypeBadge.bg }}>
                                {seriesTypeBadge.label}
                              </span>
                            )}
                          </div>

                          <div className="series-venue">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>{series.venue}</span>
                          </div>

                          {(series.city || series.state) && (
                            <div className="series-location">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              <span>{[series.city, series.state].filter(Boolean).join(', ')}</span>
                            </div>
                          )}

                          <div className="series-dates">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{formatDateRange(series.start_date, series.end_date)}</span>
                          </div>

                          <div className="series-meta">
                            {series.main_event_buyin && (
                              <div className="meta-item">
                                <span className="meta-label">Main Event</span>
                                <span className="meta-value">{formatMoney(series.main_event_buyin)}</span>
                              </div>
                            )}
                            {series.total_events && (
                              <div className="meta-item">
                                <span className="meta-label">Events</span>
                                <span className="meta-value">{series.total_events}</span>
                              </div>
                            )}
                          </div>

                          <div className="series-card-arrow">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        </a>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <style jsx>{`
        .tour-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          min-height: 100vh;
          background: radial-gradient(ellipse at top, #0f172a 0%, #030712 50%),
                      radial-gradient(ellipse at bottom right, #1e1b4b 0%, #030712 50%);
          background-color: #030712;
          color: #e2e8f0;
          padding-bottom: 80px;
        }

        /* Loading */
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 16px;
        }
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(212, 168, 83, 0.2);
          border-top-color: #d4a853;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .loading-text {
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
          gap: 12px;
          text-align: center;
          padding: 24px;
        }
        .error-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.15);
          border: 2px solid rgba(239, 68, 68, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 700;
          color: #ef4444;
        }
        .error-title {
          font-size: 20px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }
        .error-text {
          font-size: 14px;
          color: #94a3b8;
          margin: 0;
        }
        .back-link-btn {
          margin-top: 12px;
          padding: 10px 24px;
          background: rgba(212, 168, 83, 0.15);
          border: 1px solid rgba(212, 168, 83, 0.3);
          border-radius: 8px;
          color: #d4a853;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .back-link-btn:hover {
          background: rgba(212, 168, 83, 0.25);
        }

        /* Header Section */
        .tour-header {
          padding: 0 16px;
          margin-bottom: 24px;
        }
        .header-content {
          max-width: 900px;
          margin: 0 auto;
          padding-top: 20px;
        }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 20px;
          transition: color 0.2s;
        }
        .back-link:hover {
          color: #d4a853;
        }
        .header-top-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }
        .tour-name {
          font-size: 32px;
          font-weight: 800;
          color: #f1f5f9;
          margin: 0;
          line-height: 1.2;
          flex: 1;
          min-width: 200px;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .follow-btn,
        .share-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
        }
        .follow-btn:hover,
        .share-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .follow-btn.followed {
          background: rgba(212, 168, 83, 0.15);
          border-color: rgba(212, 168, 83, 0.4);
          color: #d4a853;
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
        .share-message {
          font-size: 12px;
          color: #22c55e;
          font-weight: 500;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .badges-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .tour-code-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .tour-type-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.25);
          text-transform: capitalize;
        }
        .headquarters {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-size: 14px;
        }

        /* About Section */
        .tour-about {
          padding: 0 16px;
          margin-bottom: 32px;
        }
        .tour-about > * {
          max-width: 900px;
          margin-left: auto;
          margin-right: auto;
        }
        .section-title {
          font-size: 20px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 900px;
        }
        .about-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 20px;
          backdrop-filter: blur(12px);
        }
        .about-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .about-item-full {
          grid-column: 1 / -1;
        }
        .about-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
        }
        .about-value {
          font-size: 14px;
          color: #e2e8f0;
          font-weight: 500;
        }
        .main-event-buyin {
          color: #d4a853;
          font-weight: 600;
        }
        .about-link {
          display: inline-flex;
          align-items: center;
          color: #d4a853;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: opacity 0.2s;
        }
        .about-link:hover {
          opacity: 0.8;
          text-decoration: underline;
        }
        .about-notes {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0;
        }
        .regions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .region-tag {
          display: inline-flex;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          background: rgba(99, 102, 241, 0.1);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        /* Series Section */
        .tour-series {
          padding: 0 16px;
        }
        .tour-series > * {
          max-width: 900px;
          margin-left: auto;
          margin-right: auto;
        }
        .series-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 8px;
          border-radius: 12px;
          background: rgba(212, 168, 83, 0.15);
          color: #d4a853;
          font-size: 13px;
          font-weight: 600;
        }
        .series-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .series-card {
          position: relative;
          display: block;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 20px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          backdrop-filter: blur(12px);
          cursor: pointer;
        }
        .series-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(212, 168, 83, 0.3);
          transform: translateY(-1px);
        }
        .series-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .series-name {
          font-size: 16px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
          line-height: 1.3;
          flex: 1;
        }
        .series-type-badge {
          display: inline-flex;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .series-venue,
        .series-location,
        .series-dates {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .series-venue svg,
        .series-location svg,
        .series-dates svg {
          flex-shrink: 0;
          opacity: 0.6;
        }
        .series-meta {
          display: flex;
          gap: 20px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .meta-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          color: #64748b;
        }
        .meta-value {
          font-size: 15px;
          font-weight: 700;
          color: #d4a853;
        }
        .series-card-arrow {
          position: absolute;
          top: 50%;
          right: 16px;
          transform: translateY(-50%);
          color: #4b5563;
          transition: color 0.2s;
        }
        .series-card:hover .series-card-arrow {
          color: #d4a853;
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 48px 24px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
        }
        .empty-state p {
          margin: 8px 0 0 0;
          color: #94a3b8;
          font-size: 14px;
        }
        .empty-subtext {
          color: #64748b !important;
          font-size: 13px !important;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .tour-name {
            font-size: 24px;
          }
          .header-top-row {
            flex-direction: column;
            gap: 12px;
          }
          .about-grid {
            grid-template-columns: 1fr;
          }
          .header-actions {
            width: 100%;
          }
          .follow-btn,
          .share-btn {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}
