/**
 * Tour Detail Page - PokerAtlas-style public tour detail
 * Route: /hub/tours/[code] (e.g., /hub/tours/WSOP)
 *
 * Displays full tour information including overview, upcoming series,
 * source URLs, and description. Uses the tour_code from the URL.
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
  MapPin,
  Calendar,
  DollarSign,
  Globe,
  Trophy,
  Clock,
  Users,
  Info,
  Link as LinkIcon,
  BookOpen,
} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const TOUR_BADGE_STYLES = {
  WSOP: { background: 'linear-gradient(135deg, #c9a227, #8b6914)', color: '#000' },
  WPT: { background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff' },
  WSOPC: { background: 'linear-gradient(135deg, #c9a227, #8b6914)', color: '#000' },
  MSPT: { background: 'linear-gradient(135deg, #1e40af, #1e3a8a)', color: '#fff' },
  RGPS: { background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff' },
  PGT: { background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff' },
  default: { background: 'linear-gradient(135deg, #374151, #1f2937)', color: '#fff' },
};

const TOUR_TYPE_LABELS = {
  major: 'Major',
  circuit: 'Circuit',
  high_roller: 'High Roller',
  regional: 'Regional',
  grassroots: 'Grassroots',
  charity: 'Charity',
  cruise: 'Cruise',
};

const MOCK_WSOP_TOUR = {
  tour_code: 'WSOP',
  tour_name: 'World Series of Poker',
  tour_type: 'major',
  priority: 1,
  official_website: 'https://www.wsop.com',
  source_urls: {
    primary: 'https://www.wsop.com/tournaments/',
    schedule_2026: 'https://www.wsop.com/2026/',
    pokeratlas: 'https://www.pokeratlas.com/poker-tournaments/wsop',
    hendonmob: 'https://www.thehendonmob.com/festivals/world-series-of-poker',
  },
  typical_buyins: { min: 400, max: 250000, main_event: 10000 },
  regions: ['US', 'Europe', 'Bahamas'],
  headquarters: 'Las Vegas, NV',
  established: 1970,
  notes:
    'The World Series of Poker is the most prestigious poker tournament series in the world. Founded in 1970 at Binion\'s Horseshoe in downtown Las Vegas, the WSOP has grown to become the ultimate test of poker skill. The annual summer series features nearly 100 bracelet events across a wide range of buy-ins and game types, culminating in the legendary $10,000 Main Event.',
  upcoming_series: [
    {
      series_uid: 'WSOP-2026',
      tour: 'WSOP',
      name: '2026 World Series of Poker',
      short_name: 'WSOP 2026',
      venue: 'Horseshoe Las Vegas / Paris Las Vegas',
      city: 'Las Vegas',
      state: 'NV',
      start_date: '2026-05-26',
      end_date: '2026-07-15',
      total_events: 99,
      main_event_buyin: 10000,
      main_event_guaranteed: null,
      series_type: 'major',
      source_url: 'https://www.wsop.com/2026/',
      is_featured: true,
    },
  ],
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function getBadgeStyle(tourCode) {
  return TOUR_BADGE_STYLES[tourCode] || TOUR_BADGE_STYLES.default;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return '';
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : null;

  const startStr = start.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (!end) return startStr;

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`;
  }
  return `${startStr} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

function getFollowingData() {
  if (typeof window === 'undefined') return { venues: [], tours: [], series: [] };
  try {
    const raw = localStorage.getItem('smarter_poker_following');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        venues: parsed.venues || [],
        tours: parsed.tours || [],
        series: parsed.series || [],
      };
    }
  } catch (e) {
    // ignore
  }
  return { venues: [], tours: [], series: [] };
}

function setFollowingData(data) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('smarter_poker_following', JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

// -------------------------------------------------------------------
// Components
// -------------------------------------------------------------------

function TourBadgeLarge({ tourCode }) {
  const style = getBadgeStyle(tourCode);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px 28px',
        borderRadius: 10,
        background: style.background,
        minWidth: 100,
      }}
    >
      <span
        style={{
          color: style.color,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 1.5,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {tourCode || 'TOUR'}
      </span>
    </div>
  );
}

function TourTypeBadge({ tourType }) {
  const label = TOUR_TYPE_LABELS[tourType] || tourType || 'Tour';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 14px',
        borderRadius: 20,
        background: '#EBF5FF',
        color: '#1877F2',
        fontSize: 13,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  );
}

function RegionTag({ region }) {
  const regionColors = {
    US: { bg: '#DBEAFE', text: '#1D4ED8' },
    Europe: { bg: '#FEF3C7', text: '#92400E' },
    Asia: { bg: '#FCE7F3', text: '#9D174D' },
    Bahamas: { bg: '#D1FAE5', text: '#065F46' },
    default: { bg: '#F3F4F6', text: '#374151' },
  };
  const colors = regionColors[region] || regionColors.default;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 16,
        background: colors.bg,
        color: colors.text,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {region}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '100px 20px',
        minHeight: '60vh',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: '4px solid #E5E7EB',
          borderTopColor: '#1877F2',
          borderRadius: '50%',
          animation: 'tourSpin 0.8s linear infinite',
        }}
      />
      <p style={{ marginTop: 20, color: '#6B7280', fontSize: 15, fontFamily: "'Inter', sans-serif" }}>
        Loading tour details...
      </p>
    </div>
  );
}

function ErrorState({ message, onBack }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '100px 20px',
        minHeight: '60vh',
      }}
    >
      <Info size={48} color="#9CA3AF" style={{ marginBottom: 16 }} />
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: '#111827',
          margin: '0 0 8px',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Tour Not Found
      </h2>
      <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 24px', fontFamily: "'Inter', sans-serif" }}>
        {message}
      </p>
      <button
        onClick={onBack}
        style={{
          padding: '10px 24px',
          background: '#1877F2',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Back to Poker Near Me
      </button>
    </div>
  );
}

// -------------------------------------------------------------------
// Main Page Component
// -------------------------------------------------------------------

export default function TourDetailPage() {
  const router = useRouter();
  const { code } = router.query;

  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [shareTooltip, setShareTooltip] = useState(false);

  // Fetch tour data
  useEffect(() => {
    if (!code) return;

    const tourCode = code.toUpperCase();

    // Check following state
    const followData = getFollowingData();
    setIsFollowing(followData.tours.includes(tourCode));

    const fetchTour = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/poker/tours?tour_code=${encodeURIComponent(tourCode)}&include_series=true`
        );
        const json = await res.json();

        if (json.success && json.data && json.data.length > 0) {
          setTour(json.data[0]);
        } else {
          // Fall back to mock data for WSOP in development
          if (tourCode === 'WSOP') {
            setTour(MOCK_WSOP_TOUR);
          } else {
            setError(`Could not find tour with code "${tourCode}".`);
          }
        }
      } catch (fetchErr) {
        console.error('Tour fetch error:', fetchErr);
        // Fallback to mock for WSOP
        if (tourCode === 'WSOP') {
          setTour(MOCK_WSOP_TOUR);
        } else {
          setError('Failed to load tour data. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTour();
  }, [code]);

  // Toggle follow
  const handleFollow = () => {
    if (!tour) return;
    const followData = getFollowingData();
    const tourCode = tour.tour_code;

    if (isFollowing) {
      followData.tours = followData.tours.filter((c) => c !== tourCode);
    } else {
      if (!followData.tours.includes(tourCode)) {
        followData.tours.push(tourCode);
      }
    }

    setFollowingData(followData);
    setIsFollowing(!isFollowing);
  };

  // Share handler
  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = tour ? `${tour.tour_name} - Smarter.Poker` : 'Poker Tour - Smarter.Poker';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // fallback to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 2000);
      } catch (e) {
        // ignore
      }
    }
  };

  // Navigate back
  const handleBack = () => {
    router.push('/hub/poker-near-me');
  };

  // Sort series by start date
  const upcomingSeries = (tour?.upcoming_series || [])
    .slice()
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  // Source URLs
  const sourceUrls = tour?.source_urls || {};

  return (
    <>
      <Head>
        <title>{tour ? `${tour.tour_name} | Smarter.Poker` : 'Tour Details | Smarter.Poker'}</title>
        <meta
          name="description"
          content={
            tour
              ? `${tour.tour_name} - ${tour.tour_type || 'Poker'} tour. Upcoming series, schedule, and details.`
              : 'Poker tour details on Smarter.Poker'
          }
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: '#F9FAFB',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <UniversalHeader pageDepth={2} />

        {/* Back bar */}
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            padding: '16px 20px 0',
          }}
        >
          <button
            onClick={handleBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              color: '#374151',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
          >
            <ArrowLeft size={16} />
            Back to Poker Near Me
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState message={error} onBack={handleBack} />
        ) : tour ? (
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 20px 60px' }}>
            {/* ============================================== */}
            {/* SECTION 1: Header                              */}
            {/* ============================================== */}
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: '28px 24px',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 20,
                }}
              >
                <TourBadgeLarge tourCode={tour.tour_code} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h1
                    style={{
                      margin: '0 0 8px',
                      fontSize: 26,
                      fontWeight: 700,
                      color: '#111827',
                    }}
                  >
                    {tour.tour_name}
                  </h1>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <TourTypeBadge tourType={tour.tour_type} />
                    {tour.headquarters && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          color: '#6B7280',
                          fontSize: 14,
                        }}
                      >
                        <MapPin size={14} color="#9CA3AF" />
                        {tour.headquarters}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================== */}
            {/* SECTION 2: Quick Actions Bar                   */}
            {/* ============================================== */}
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: '14px 24px',
                marginBottom: 16,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* Follow button */}
              <button
                onClick={handleFollow}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  background: isFollowing ? '#FEE2E2' : '#1877F2',
                  color: isFollowing ? '#DC2626' : '#fff',
                  border: isFollowing ? '1px solid #FECACA' : '1px solid #1877F2',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.15s',
                }}
              >
                <Heart
                  size={16}
                  fill={isFollowing ? '#DC2626' : 'none'}
                  color={isFollowing ? '#DC2626' : '#fff'}
                />
                {isFollowing ? 'Following' : 'Follow'}
              </button>

              {/* Share button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={handleShare}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    background: '#fff',
                    color: '#374151',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  <Share2 size={16} />
                  Share
                </button>
                {shareTooltip && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -36,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      padding: '6px 12px',
                      background: '#111827',
                      color: '#fff',
                      borderRadius: 6,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Link copied!
                  </div>
                )}
              </div>

              {/* Visit Website */}
              {tour.official_website && (
                <a
                  href={tour.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    background: '#fff',
                    color: '#1877F2',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'background 0.15s',
                  }}
                >
                  <ExternalLink size={16} />
                  Visit Website
                </a>
              )}
            </div>

            {/* ============================================== */}
            {/* SECTION 3: Tour Overview Card                  */}
            {/* ============================================== */}
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: '24px',
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  margin: '0 0 20px',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Info size={20} color="#1877F2" />
                Tour Overview
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 20,
                }}
              >
                {/* Established */}
                {tour.established && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#EBF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Clock size={20} color="#1877F2" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>
                        ESTABLISHED
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {tour.established}
                      </div>
                    </div>
                  </div>
                )}

                {/* Headquarters */}
                {tour.headquarters && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#EBF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <MapPin size={20} color="#1877F2" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>
                        HEADQUARTERS
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {tour.headquarters}
                      </div>
                    </div>
                  </div>
                )}

                {/* Regions */}
                {tour.regions && tour.regions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#EBF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Globe size={20} color="#1877F2" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>
                        REGIONS
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        {tour.regions.map((region) => (
                          <RegionTag key={region} region={region} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Buy-in Range */}
                {tour.typical_buyins && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#EBF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <DollarSign size={20} color="#1877F2" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>
                        TYPICAL BUY-IN RANGE
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {formatMoney(tour.typical_buyins.min)} - {formatMoney(tour.typical_buyins.max)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Official Website */}
                {tour.official_website && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#EBF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <LinkIcon size={20} color="#1877F2" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>
                        OFFICIAL WEBSITE
                      </div>
                      <a
                        href={tour.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#1877F2',
                          textDecoration: 'none',
                          wordBreak: 'break-all',
                        }}
                      >
                        {tour.official_website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ============================================== */}
            {/* SECTION 4: 2026 Series & Stops                 */}
            {/* ============================================== */}
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: '24px',
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  margin: '0 0 20px',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Calendar size={20} color="#1877F2" />
                2026 Series & Stops
                {upcomingSeries.length > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '3px 10px',
                      background: '#EBF5FF',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1877F2',
                    }}
                  >
                    {upcomingSeries.length}
                  </span>
                )}
              </h2>

              {upcomingSeries.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: '#9CA3AF',
                    fontSize: 14,
                  }}
                >
                  <Calendar size={32} color="#D1D5DB" style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0 }}>No upcoming series announced yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {upcomingSeries.map((s, idx) => {
                    const location = s.location || [s.venue, s.city, s.state].filter(Boolean).join(', ');
                    const seriesLink = s.series_uid ? `/hub/series/${s.series_uid}` : null;

                    const content = (
                      <div
                        key={s.series_uid || idx}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 16,
                          padding: '16px 20px',
                          background: '#F9FAFB',
                          borderRadius: 10,
                          border: '1px solid #F3F4F6',
                          cursor: seriesLink ? 'pointer' : 'default',
                          transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (seriesLink) {
                            e.currentTarget.style.borderColor = '#1877F2';
                            e.currentTarget.style.boxShadow = '0 1px 4px rgba(24,119,242,0.12)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#F3F4F6';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {/* Series Number */}
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: '#1877F2',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </div>

                        {/* Main info */}
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: '#111827',
                              marginBottom: 4,
                            }}
                          >
                            {s.name || s.short_name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 12,
                              fontSize: 13,
                              color: '#6B7280',
                            }}
                          >
                            {location && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={13} color="#9CA3AF" />
                                {location}
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Calendar size={13} color="#9CA3AF" />
                              {formatDateRange(s.start_date, s.end_date)}
                            </span>
                          </div>
                        </div>

                        {/* Stats */}
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 10,
                            alignItems: 'center',
                          }}
                        >
                          {s.main_event_buyin && (
                            <span
                              style={{
                                padding: '5px 12px',
                                background: '#FEF3C7',
                                color: '#92400E',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Main Event: {formatMoney(s.main_event_buyin)}
                            </span>
                          )}
                          {s.main_event_guaranteed && (
                            <span
                              style={{
                                padding: '5px 12px',
                                background: '#D1FAE5',
                                color: '#065F46',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {formatMoney(s.main_event_guaranteed)} GTD
                            </span>
                          )}
                          {s.total_events && (
                            <span
                              style={{
                                padding: '5px 12px',
                                background: '#EDE9FE',
                                color: '#5B21B6',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {s.total_events} Events
                            </span>
                          )}
                        </div>
                      </div>
                    );

                    if (seriesLink) {
                      return (
                        <Link
                          key={s.series_uid || idx}
                          href={seriesLink}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          {content}
                        </Link>
                      );
                    }
                    return content;
                  })}
                </div>
              )}
            </div>

            {/* ============================================== */}
            {/* SECTION 5: Source URLs Card                     */}
            {/* ============================================== */}
            {sourceUrls && Object.keys(sourceUrls).length > 0 && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  padding: '24px',
                  marginBottom: 16,
                }}
              >
                <h2
                  style={{
                    margin: '0 0 20px',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <LinkIcon size={20} color="#1877F2" />
                  Source URLs
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Official Website */}
                  {(sourceUrls.primary || tour.official_website) && (
                    <a
                      href={sourceUrls.primary || tour.official_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: '#F9FAFB',
                        borderRadius: 8,
                        border: '1px solid #F3F4F6',
                        textDecoration: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1877F2')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#F3F4F6')}
                    >
                      <Globe size={18} color="#1877F2" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          Official Website
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', wordBreak: 'break-all' }}>
                          {(sourceUrls.primary || tour.official_website).replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </div>
                      </div>
                      <ExternalLink size={16} color="#9CA3AF" />
                    </a>
                  )}

                  {/* PokerAtlas */}
                  {sourceUrls.pokeratlas && (
                    <a
                      href={sourceUrls.pokeratlas}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: '#F9FAFB',
                        borderRadius: 8,
                        border: '1px solid #F3F4F6',
                        textDecoration: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1877F2')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#F3F4F6')}
                    >
                      <Trophy size={18} color="#DC2626" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          PokerAtlas
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', wordBreak: 'break-all' }}>
                          {sourceUrls.pokeratlas.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </div>
                      </div>
                      <ExternalLink size={16} color="#9CA3AF" />
                    </a>
                  )}

                  {/* HendonMob */}
                  {sourceUrls.hendonmob && (
                    <a
                      href={sourceUrls.hendonmob}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: '#F9FAFB',
                        borderRadius: 8,
                        border: '1px solid #F3F4F6',
                        textDecoration: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1877F2')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#F3F4F6')}
                    >
                      <Users size={18} color="#059669" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          The Hendon Mob
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', wordBreak: 'break-all' }}>
                          {sourceUrls.hendonmob.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </div>
                      </div>
                      <ExternalLink size={16} color="#9CA3AF" />
                    </a>
                  )}

                  {/* Any other source URLs not covered above */}
                  {Object.entries(sourceUrls)
                    .filter(
                      ([key]) =>
                        !['primary', 'pokeratlas', 'hendonmob'].includes(key) &&
                        typeof sourceUrls[key] === 'string' &&
                        sourceUrls[key].startsWith('http')
                    )
                    .map(([key, url]) => (
                      <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          background: '#F9FAFB',
                          borderRadius: 8,
                          border: '1px solid #F3F4F6',
                          textDecoration: 'none',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1877F2')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#F3F4F6')}
                      >
                        <ExternalLink size={18} color="#6B7280" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                            {key
                              .replace(/_/g, ' ')
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </div>
                          <div style={{ fontSize: 12, color: '#6B7280', wordBreak: 'break-all' }}>
                            {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </div>
                        </div>
                        <ExternalLink size={16} color="#9CA3AF" />
                      </a>
                    ))}
                </div>
              </div>
            )}

            {/* ============================================== */}
            {/* SECTION 6: About Card                          */}
            {/* ============================================== */}
            {tour.notes && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  padding: '24px',
                  marginBottom: 16,
                }}
              >
                <h2
                  style={{
                    margin: '0 0 16px',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <BookOpen size={20} color="#1877F2" />
                  About {tour.tour_name}
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: '#4B5563',
                  }}
                >
                  {tour.notes}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes tourSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
