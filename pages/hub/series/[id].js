/**
 * Tournament Series Detail Page
 * PokerAtlas-style public view for a specific tournament series
 * (e.g., "55th Annual World Series of Poker")
 *
 * Facebook color scheme: Primary #1877F2, Background #F9FAFB
 * Inter font, no emojis, clean card-based layout
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  Heart,
  Share2,
  ExternalLink,
  Calendar,
  MapPin,
  Trophy,
  DollarSign,
  Users,
  Tag,
  Clock,
  Navigation,
  Info,
  ChevronRight
} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  primary: '#1877F2',
  primaryDark: '#1565C0',
  primaryLight: '#E3F0FF',
  background: '#F9FAFB',
  white: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  gold: '#C9A227',
};

const SERIES_TYPE_STYLES = {
  major: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B', label: 'Major Series' },
  circuit: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', label: 'Circuit Event' },
  regional: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', label: 'Regional Series' },
  festival: { bg: '#EDE9FE', text: '#5B21B6', border: '#8B5CF6', label: 'Festival' },
  online: { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899', label: 'Online Series' },
};

const TOUR_BADGE_STYLES = {
  WSOP: { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  WPT: { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
  WSOPC: { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  EPT: { bg: 'linear-gradient(135deg, #dc2626, #7f1d1d)', text: '#fff', border: '#dc2626' },
  MSPT: { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
  RGPS: { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
  SHRPO: { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
  LAPC: { bg: 'linear-gradient(135deg, #0369a1, #075985)', text: '#fff', border: '#0ea5e9' },
  VDC: { bg: 'linear-gradient(135deg, #b45309, #92400e)', text: '#fff', border: '#f59e0b' },
  default: { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' },
};

// ---------------------------------------------------------------------------
// Fallback mock data (WSOP 2026) for development
// ---------------------------------------------------------------------------

const MOCK_SERIES = {
  id: 1,
  name: '55th Annual World Series of Poker',
  short_name: 'WSOP',
  tour_name: 'World Series of Poker',
  location: 'Las Vegas, NV',
  venue_name: 'Paris Las Vegas & Horseshoe Las Vegas',
  venue_id: null,
  start_date: '2026-05-26',
  end_date: '2026-07-16',
  main_event_buyin: 10000,
  main_event_guaranteed: 50000000,
  total_events: 99,
  series_type: 'major',
  is_featured: true,
  source_url: 'https://www.wsop.com/2026/',
  description:
    'The 55th Annual World Series of Poker returns to the Las Vegas Strip with 99 bracelet events across a wide range of buy-ins and poker variants. The crown jewel remains the $10,000 Main Event with a $50 million guaranteed prize pool, the largest in WSOP history. From low-stakes events to super high rollers, the WSOP offers something for every level of player.',
  notes: 'All events held at Paris Las Vegas and Horseshoe Las Vegas on the Las Vegas Strip.',
  events: [
    { name: 'Employee Event', date: '2026-05-26', buyin: 500 },
    { name: 'Casino Employees NLH', date: '2026-05-27', buyin: 500 },
    { name: '$500 NLH Kick-Off', date: '2026-05-28', buyin: 500 },
    { name: '$1,000 Mystery Bounty', date: '2026-05-29', buyin: 1000 },
    { name: '$600 Deepstack NLH', date: '2026-05-30', buyin: 600 },
    { name: '$1,500 Omaha Hi-Lo 8 or Better', date: '2026-05-31', buyin: 1500 },
    { name: '$1,500 NLH Freezeout', date: '2026-06-01', buyin: 1500 },
    { name: '$2,500 NLH', date: '2026-06-02', buyin: 2500 },
    { name: '$1,000 PLO', date: '2026-06-03', buyin: 1000 },
    { name: '$5,000 NLH 6-Handed', date: '2026-06-04', buyin: 5000 },
    { name: '$1,500 Dealers Choice', date: '2026-06-05', buyin: 1500 },
    { name: '$1,000 Super Turbo Bounty', date: '2026-06-06', buyin: 1000 },
    { name: '$10,000 Dealers Choice', date: '2026-06-07', buyin: 10000 },
    { name: '$800 NLH Deepstack', date: '2026-06-08', buyin: 800 },
    { name: '$3,000 NLH 6-Handed', date: '2026-06-09', buyin: 3000 },
    { name: '$10,000 Omaha Hi-Lo Championship', date: '2026-06-10', buyin: 10000 },
    { name: '$1,500 Razz', date: '2026-06-11', buyin: 1500 },
    { name: '$25,000 High Roller NLH', date: '2026-06-12', buyin: 25000 },
    { name: 'Millionaire Maker $1,500 NLH', date: '2026-06-13', buyin: 1500 },
    { name: '$10,000 PLO Championship', date: '2026-06-15', buyin: 10000 },
    { name: '$50,000 Poker Players Championship', date: '2026-06-20', buyin: 50000 },
    { name: '$10,000 NLH Main Event', date: '2026-07-01', buyin: 10000 },
    { name: '$1,000 NLH Super Turbo', date: '2026-07-10', buyin: 1000 },
  ],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatMoney(amount) {
  if (amount == null || amount === 0) return '--';
  if (amount >= 1000000) {
    const val = amount / 1000000;
    return val % 1 === 0 ? `$${val.toFixed(0)}M` : `$${val.toFixed(1)}M`;
  }
  if (amount >= 10000) {
    const val = amount / 1000;
    return val % 1 === 0 ? `$${val.toFixed(0)}K` : `$${val.toFixed(1)}K`;
  }
  if (amount >= 1000) {
    return `$${amount.toLocaleString()}`;
  }
  return `$${amount}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateRange(start, end) {
  if (!start) return '';
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : null;

  const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!e) return startStr;

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${startStr} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TourBadge({ code }) {
  const style = TOUR_BADGE_STYLES[code] || TOUR_BADGE_STYLES.default;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 14px',
        borderRadius: 6,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: '0.5px',
        lineHeight: 1,
      }}
    >
      {code || 'TOUR'}
    </span>
  );
}

function SeriesTypeBadge({ type }) {
  const style = SERIES_TYPE_STYLES[type] || SERIES_TYPE_STYLES.regional;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 20,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {style.label}
    </span>
  );
}

function StatBox({ icon, label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 12px',
        background: COLORS.borderLight,
        borderRadius: 10,
        minWidth: 0,
        flex: '1 1 0',
      }}
    >
      <div style={{ color: COLORS.primary, marginBottom: 8 }}>{icon}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.text,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: COLORS.textMuted,
          textAlign: 'center',
          marginTop: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Card({ title, icon, children, style: extraStyle }) {
  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        overflow: 'hidden',
        ...extraStyle,
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 20px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {icon && <span style={{ color: COLORS.primary }}>{icon}</span>}
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.text,
            }}
          >
            {title}
          </h2>
        </div>
      )}
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SeriesDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');

  // ---- Load following state from localStorage ----
  useEffect(() => {
    if (!id) return;
    try {
      const stored = localStorage.getItem('smarter_poker_following');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.series) && parsed.series.includes(String(id))) {
          setFollowing(true);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [id]);

  // ---- Fetch series data ----
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function fetchSeries() {
      setLoading(true);
      try {
        const res = await fetch(`/api/poker/series?search=${encodeURIComponent(id)}`);
        const json = await res.json();

        if (!cancelled) {
          if (json.success && json.data && json.data.length > 0) {
            // Try to find an exact id match first, then take first result
            const match =
              json.data.find((s) => String(s.id) === String(id)) || json.data[0];
            setSeries(match);
          } else {
            // Use mock data as fallback
            setSeries(MOCK_SERIES);
          }
        }
      } catch (err) {
        console.error('[SeriesDetail] Fetch error:', err);
        if (!cancelled) {
          setSeries(MOCK_SERIES);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSeries();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ---- Toggle follow ----
  const toggleFollow = () => {
    try {
      const stored = localStorage.getItem('smarter_poker_following');
      const data = stored ? JSON.parse(stored) : { venues: [], tours: [], series: [] };
      if (!Array.isArray(data.series)) data.series = [];

      const sid = String(id);
      if (following) {
        data.series = data.series.filter((s) => s !== sid);
      } else {
        if (!data.series.includes(sid)) data.series.push(sid);
      }

      localStorage.setItem('smarter_poker_following', JSON.stringify(data));
      setFollowing(!following);
    } catch {
      // ignore
    }
  };

  // ---- Share ----
  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = series?.name || 'Tournament Series';

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user cancelled or share failed
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage('Link copied');
        setTimeout(() => setShareMessage(''), 2000);
      } catch {
        setShareMessage('Could not copy');
        setTimeout(() => setShareMessage(''), 2000);
      }
    }
  };

  // ---- Loading state ----
  if (loading || !series) {
    return (
      <>
        <Head>
          <title>Tournament Series | Smarter.Poker</title>
          <style>{`* { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; box-sizing: border-box; margin: 0; }`}</style>
        </Head>
        <UniversalHeader pageDepth={2} />
        <div
          style={{
            background: COLORS.background,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>Loading series details...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </>
    );
  }

  // ---- Derived data ----
  const dateRange = formatDateRange(series.start_date, series.end_date);
  const seriesEvents = series.events || [];
  const hasEvents = seriesEvents.length > 0;
  const typeStyle = SERIES_TYPE_STYLES[series.series_type] || SERIES_TYPE_STYLES.regional;

  return (
    <>
      <Head>
        <title>{series.name} | Smarter.Poker</title>
        <meta name="description" content={`${series.name} - ${dateRange} in ${series.location}`} />
        <style>{`
          * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; box-sizing: border-box; margin: 0; }
          a { text-decoration: none; color: inherit; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </Head>

      <UniversalHeader pageDepth={2} />

      <div style={{ background: COLORS.background, minHeight: '100vh' }}>
        {/* ================================================================
            SECTION 1: Header
           ================================================================ */}
        <div
          style={{
            background: COLORS.white,
            borderBottom: `1px solid ${COLORS.border}`,
            padding: '20px 16px 24px',
          }}
        >
          {/* Back link */}
          <button
            onClick={() => router.push('/hub/poker-near-me')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              color: COLORS.primary,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 16,
            }}
          >
            <ArrowLeft size={16} />
            Back to Poker Near Me
          </button>

          {/* Badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {series.short_name && <TourBadge code={series.short_name} />}
            <SeriesTypeBadge type={series.series_type} />
            {series.is_featured && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  color: '#92400E',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                <Trophy size={12} />
                Featured
              </span>
            )}
          </div>

          {/* Series name */}
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: COLORS.text,
              lineHeight: 1.3,
              marginBottom: 8,
            }}
          >
            {series.name}
          </h1>

          {/* Location & Dates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.textSecondary, fontSize: 14 }}>
              <MapPin size={15} style={{ flexShrink: 0 }} />
              <span>{series.venue_name ? `${series.venue_name} -- ${series.location}` : series.location}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.textSecondary, fontSize: 14 }}>
              <Calendar size={15} style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: COLORS.text }}>{dateRange}</span>
            </div>
          </div>
        </div>

        {/* ================================================================
            SECTION 2: Quick Actions Bar
           ================================================================ */}
        <div
          style={{
            background: COLORS.white,
            borderBottom: `1px solid ${COLORS.border}`,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {/* Follow button */}
          <button
            onClick={toggleFollow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 18px',
              borderRadius: 8,
              background: following ? COLORS.primary : COLORS.white,
              color: following ? COLORS.white : COLORS.primary,
              border: `2px solid ${COLORS.primary}`,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Heart size={16} fill={following ? COLORS.white : 'none'} />
            {following ? 'Following' : 'Follow'}
          </button>

          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 18px',
              borderRadius: 8,
              background: COLORS.white,
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.border}`,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Share2 size={16} />
            {shareMessage || 'Share'}
          </button>

          {/* Source URL */}
          {series.source_url && (
            <a
              href={series.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                borderRadius: 8,
                background: COLORS.white,
                color: COLORS.primary,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={16} />
              Official Site
            </a>
          )}
        </div>

        {/* Main content area with padding */}
        <div style={{ padding: '16px', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ================================================================
              SECTION 3: Key Stats Card
             ================================================================ */}
          <Card title="Key Stats" icon={<Trophy size={18} />}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              <StatBox
                icon={<Users size={20} />}
                label="Total Events"
                value={series.total_events || '--'}
              />
              <StatBox
                icon={<DollarSign size={20} />}
                label="Main Event Buy-in"
                value={formatMoney(series.main_event_buyin)}
              />
              <StatBox
                icon={<Trophy size={20} />}
                label="Main Event GTD"
                value={formatMoney(series.main_event_guaranteed)}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginTop: 10,
              }}
            >
              <StatBox
                icon={<Calendar size={20} />}
                label="Date Range"
                value={`${formatDate(series.start_date)} - ${formatDate(series.end_date)}`}
              />
              <StatBox
                icon={<MapPin size={20} />}
                label="Location"
                value={series.location || '--'}
              />
              <StatBox
                icon={<Tag size={20} />}
                label="Series Type"
                value={typeStyle.label}
              />
            </div>
          </Card>

          {/* ================================================================
              SECTION 4: Schedule Overview Card
             ================================================================ */}
          <Card title="Schedule Overview" icon={<Clock size={18} />}>
            {hasEvents ? (
              <>
                <p
                  style={{
                    fontSize: 13,
                    color: COLORS.textSecondary,
                    marginBottom: 14,
                  }}
                >
                  Showing {seriesEvents.length} of {series.total_events || seriesEvents.length} events
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {seriesEvents.map((event, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: idx < seriesEvents.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: COLORS.primary,
                            background: COLORS.primaryLight,
                            padding: '4px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {formatDate(event.date)}
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: COLORS.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {event.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: COLORS.text,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {formatMoney(event.buyin)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : series.source_url ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
                  Full schedule available on the official site.
                </p>
                <a
                  href={series.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 20px',
                    borderRadius: 8,
                    background: COLORS.primary,
                    color: COLORS.white,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={16} />
                  View Full Schedule
                </a>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', padding: '20px 0' }}>
                Schedule information is not yet available for this series.
              </p>
            )}
          </Card>

          {/* ================================================================
              SECTION 5: Venue Info Card
             ================================================================ */}
          <Card title="Venue Information" icon={<MapPin size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {series.venue_name && (
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Venue
                  </span>
                  <p style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginTop: 2 }}>
                    {series.venue_name}
                  </p>
                </div>
              )}

              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Location
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: COLORS.text, marginTop: 2 }}>
                  {series.location}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {/* Google Maps link */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    (series.venue_name ? series.venue_name + ', ' : '') + series.location
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: COLORS.primaryLight,
                    color: COLORS.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    border: `1px solid ${COLORS.primary}20`,
                  }}
                >
                  <Navigation size={14} />
                  Open in Google Maps
                </a>

                {/* Venue detail link */}
                {series.venue_id && (
                  <Link
                    href={`/hub/venues/${series.venue_id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: COLORS.borderLight,
                      color: COLORS.text,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    View Venue Details
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          </Card>

          {/* ================================================================
              SECTION 6: About Card
             ================================================================ */}
          {(series.description || series.notes) && (
            <Card title="About This Series" icon={<Info size={18} />}>
              {series.description && (
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: COLORS.text,
                    marginBottom: series.notes ? 14 : 0,
                  }}
                >
                  {series.description}
                </p>
              )}
              {series.notes && (
                <div
                  style={{
                    background: COLORS.borderLight,
                    borderRadius: 8,
                    padding: '12px 16px',
                    borderLeft: `3px solid ${COLORS.primary}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: COLORS.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Note
                  </span>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: COLORS.textSecondary, marginTop: 4 }}>
                    {series.notes}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Bottom spacer */}
          <div style={{ height: 40 }} />
        </div>
      </div>
    </>
  );
}
