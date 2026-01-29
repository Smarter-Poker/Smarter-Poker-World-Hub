/**
 * VENUE DETAIL PAGE - PokerAtlas-Style Public Venue Profile
 *
 * Displays comprehensive information about a casino, card room, or poker club.
 * Fetches from /api/poker/venues?id=X and /api/poker/daily-tournaments.
 * Supports all 483+ verified venues from the master data.
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import {
  ArrowLeft,
  Heart,
  Share2,
  Phone,
  MapPin,
  Globe,
  ExternalLink,
  Star,
  Clock,
  Check,
  X,
  UtensilsCrossed,
  Car,
  Hotel,
  ParkingCircle,
  Wifi,
  Gift,
  Landmark,
  Wine,
  Cigarette,
  Tv,
  Banknote,
  Calendar,
  Users,
  Info,
  Navigation,
  Copy,
  ChevronRight,
  Building2
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Card Room',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity Room'
};

const VENUE_TYPE_COLORS = {
  casino: { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  card_room: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  poker_club: { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
  home_game: { bg: '#FDF2F8', text: '#9D174D', border: '#FBCFE8' },
  charity: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const AMENITY_LIST = [
  { key: 'food_service', label: 'Food Service', icon: UtensilsCrossed },
  { key: 'valet_parking', label: 'Valet Parking', icon: Car },
  { key: 'hotel', label: 'Hotel', icon: Hotel },
  { key: 'self_parking', label: 'Self-Parking', icon: ParkingCircle },
  { key: 'wifi', label: 'WiFi', icon: Wifi },
  { key: 'rewards_program', label: 'Rewards Program', icon: Gift },
  { key: 'atm', label: 'ATM', icon: Landmark },
  { key: 'cocktail_service', label: 'Cocktail Service', icon: Wine },
  { key: 'smoking_area', label: 'Smoking Area', icon: Cigarette },
  { key: 'sports_bar', label: 'Sports Bar', icon: Tv }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function renderStars(score) {
  const fullStars = Math.floor(score);
  const hasHalf = score - fullStars >= 0.5;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push('full');
    } else if (i === fullStars && hasHalf) {
      stars.push('half');
    } else {
      stars.push('empty');
    }
  }
  return stars;
}

function formatMoney(amount) {
  if (!amount) return '';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function getGoogleMapsUrl(venue) {
  if (venue.address && venue.address !== `${venue.city}, ${venue.state}`) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.city + ' ' + venue.state)}`;
}

function getFollowingData() {
  if (typeof window === 'undefined') return { venues: [], tours: [], series: [] };
  try {
    const data = localStorage.getItem('smarter_poker_following');
    if (data) return JSON.parse(data);
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

// Infer amenities from venue type when not provided by DB
function inferAmenities(venue) {
  if (venue.amenities) return venue.amenities;
  const isCasino = venue.venue_type === 'casino';
  return {
    food_service: isCasino,
    valet_parking: isCasino,
    hotel: isCasino,
    self_parking: true,
    wifi: venue.venue_type !== 'charity',
    rewards_program: isCasino,
    atm: venue.venue_type !== 'charity',
    cocktail_service: isCasino,
    smoking_area: false,
    sports_bar: false
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TrustStars({ score }) {
  const stars = renderStars(score || 0);
  return (
    <div className="flex items-center gap-1">
      {stars.map((type, i) => (
        <Star
          key={i}
          size={16}
          className={
            type === 'full'
              ? 'text-yellow-400 fill-yellow-400'
              : type === 'half'
              ? 'text-yellow-400 fill-yellow-400 opacity-60'
              : 'text-gray-300'
          }
        />
      ))}
      {score && (
        <span className="ml-1 text-sm font-semibold text-gray-700">{score.toFixed(1)}</span>
      )}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
        {Icon && <Icon size={18} className="text-[#1877F2]" />}
        <h2 className="text-base font-semibold text-gray-900 m-0">{title}</h2>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function AmenityItem({ icon: Icon, label, available }) {
  return (
    <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg ${available ? 'bg-green-50' : 'bg-gray-50'}`}>
      <Icon size={16} className={available ? 'text-green-600' : 'text-gray-400'} />
      <span className={`text-sm ${available ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
      <div className="ml-auto">
        {available ? (
          <Check size={16} className="text-green-600" />
        ) : (
          <X size={16} className="text-gray-300" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function VenueDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [shareTooltip, setShareTooltip] = useState(false);

  // ---- Load venue data ----
  useEffect(() => {
    if (!id) return;

    const loadVenue = async () => {
      setLoading(true);
      try {
        // Fetch by ID directly
        const res = await fetch(`/api/poker/venues?id=${encodeURIComponent(id)}`);
        const json = await res.json();

        if (json.success && json.data && json.data.length > 0) {
          setVenue(enrichVenueData(json.data[0]));
        } else {
          // Try search as fallback (in case id is a name fragment)
          const searchRes = await fetch(`/api/poker/venues?search=${encodeURIComponent(id)}&limit=1`);
          const searchJson = await searchRes.json();
          if (searchJson.success && searchJson.data && searchJson.data.length > 0) {
            setVenue(enrichVenueData(searchJson.data[0]));
          } else {
            setVenue(null);
          }
        }
      } catch (err) {
        console.error('[VenueDetail] Fetch error:', err);
        setVenue(null);
      } finally {
        setLoading(false);
      }
    };

    loadVenue();
  }, [id]);

  // ---- Load daily tournaments ----
  useEffect(() => {
    if (!venue) return;

    const loadTournaments = async () => {
      setTournamentsLoading(true);
      try {
        const res = await fetch(`/api/poker/daily-tournaments?venue=${encodeURIComponent(venue.name)}`);
        const json = await res.json();

        if (json.success && json.tournaments && json.tournaments.length > 0) {
          setDailyTournaments(json.tournaments);
        } else {
          setDailyTournaments([]);
        }
      } catch (err) {
        console.error('[VenueDetail] Tournament fetch error:', err);
        setDailyTournaments([]);
      } finally {
        setTournamentsLoading(false);
      }
    };

    loadTournaments();
  }, [venue]);

  // ---- Load following state ----
  useEffect(() => {
    if (!id) return;
    const data = getFollowingData();
    setFollowing(data.venues.includes(String(id)));
  }, [id]);

  // ---- Enrich venue data with defaults ----
  function enrichVenueData(apiVenue) {
    const venueType = VENUE_TYPE_LABELS[apiVenue.venue_type] || 'Venue';
    return {
      ...apiVenue,
      hours: apiVenue.hours || null,
      description: apiVenue.description || `${apiVenue.name} is a ${venueType.toLowerCase()} located in ${apiVenue.city}, ${apiVenue.state}. Contact the venue directly for the latest information about games, tournaments, and promotions.`,
      amenities: inferAmenities(apiVenue)
    };
  }

  // ---- Toggle follow ----
  function toggleFollow() {
    const data = getFollowingData();
    const venueId = String(id);

    if (data.venues.includes(venueId)) {
      data.venues = data.venues.filter(v => v !== venueId);
      setFollowing(false);
    } else {
      data.venues.push(venueId);
      setFollowing(true);
    }
    setFollowingData(data);
  }

  // ---- Share ----
  function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      navigator.share({
        title: venue?.name || 'Poker Venue',
        text: `Check out ${venue?.name} on Smarter.Poker`,
        url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 2000);
      }).catch(() => {});
    }
  }

  // ---- Group tournaments by day ----
  function getTournamentsByDay() {
    const grouped = {};
    DAYS_OF_WEEK.forEach(day => { grouped[day] = []; });
    grouped['Daily'] = [];

    dailyTournaments.forEach(t => {
      const day = t.day_of_week || 'Daily';
      if (grouped[day]) {
        grouped[day].push(t);
      } else {
        grouped['Daily'].push(t);
      }
    });

    return grouped;
  }

  // ============================================================================
  // RENDER: LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading Venue... | Smarter.Poker</title>
        </Head>
        <div className="min-h-screen bg-[#F9FAFB] font-['Inter',sans-serif]">
          <UniversalHeader pageDepth={2} />
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1877F2] rounded-full animate-spin mb-4" />
            <p className="text-gray-500 text-sm">Loading venue details...</p>
          </div>
        </div>
      </>
    );
  }

  if (!venue) {
    return (
      <>
        <Head>
          <title>Venue Not Found | Smarter.Poker</title>
        </Head>
        <div className="min-h-screen bg-[#F9FAFB] font-['Inter',sans-serif]">
          <UniversalHeader pageDepth={2} />
          <div className="flex flex-col items-center justify-center py-32">
            <Building2 size={48} className="text-gray-300 mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Venue Not Found</h2>
            <p className="text-gray-500 text-sm mb-6">We could not find a venue matching this ID.</p>
            <Link
              href="/hub/poker-near-me"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] transition-colors no-underline"
            >
              <ArrowLeft size={16} />
              Back to Poker Near Me
            </Link>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // RENDER: VENUE DETAIL
  // ============================================================================

  const venueTypeColor = VENUE_TYPE_COLORS[venue.venue_type] || VENUE_TYPE_COLORS.casino;
  const tournamentsByDay = getTournamentsByDay();
  const mapsUrl = getGoogleMapsUrl(venue);
  const websiteUrl = venue.website
    ? (venue.website.startsWith('http') ? venue.website : `https://${venue.website}`)
    : null;
  const pokerAtlasUrl = venue.poker_atlas_url || null;

  return (
    <>
      <Head>
        <title>{venue.name} | Smarter.Poker</title>
        <meta name="description" content={`${venue.name} - ${VENUE_TYPE_LABELS[venue.venue_type] || 'Poker Venue'} in ${venue.city}, ${venue.state}. Games, tournaments, amenities, and more.`} />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB] font-['Inter',sans-serif]">
        <UniversalHeader pageDepth={2} />

        {/* Back Navigation */}
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
          <Link
            href="/hub/poker-near-me"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1877F2] transition-colors no-underline"
          >
            <ArrowLeft size={16} />
            <span>Back to Poker Near Me</span>
          </Link>
        </div>

        {/* ================================================================ */}
        {/* SECTION 1: HEADER */}
        {/* ================================================================ */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 m-0 leading-tight">
                    {venue.name}
                  </h1>
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: venueTypeColor.bg,
                      color: venueTypeColor.text,
                      border: `1px solid ${venueTypeColor.border}`
                    }}
                  >
                    {VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}
                  </span>
                  {venue.has_tournaments && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-green-50 text-green-700 border border-green-200">
                      Tournaments
                    </span>
                  )}
                </div>
                <TrustStars score={venue.trust_score} />
                <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-500">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{venue.city}, {venue.state}</span>
                </div>
              </div>
              {venue.poker_tables && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg flex-shrink-0">
                  <Users size={16} className="text-[#1877F2]" />
                  <span className="text-sm font-semibold text-[#1877F2]">{venue.poker_tables} Tables</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SECTION 2: QUICK ACTIONS BAR */}
        {/* ================================================================ */}
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            {/* Follow */}
            <button
              onClick={toggleFollow}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
                following
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Heart size={16} className={following ? 'fill-red-500 text-red-500' : ''} />
              {following ? 'Following' : 'Follow'}
            </button>

            {/* Share */}
            <div className="relative">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap"
              >
                <Share2 size={16} />
                Share
              </button>
              {shareTooltip && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
                  Link copied
                </div>
              )}
            </div>

            {/* Call */}
            {venue.phone && (
              <a
                href={`tel:${venue.phone}`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap no-underline"
              >
                <Phone size={16} />
                Call
              </a>
            )}

            {/* Directions */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#1877F2] text-white border border-[#1877F2] hover:bg-[#1565C0] transition-all whitespace-nowrap no-underline"
            >
              <Navigation size={16} />
              Directions
            </a>

            {/* Website */}
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap no-underline"
              >
                <Globe size={16} />
                Website
              </a>
            )}

            {/* PokerAtlas */}
            {pokerAtlasUrl && (
              <a
                href={pokerAtlasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap no-underline"
              >
                <ExternalLink size={16} />
                PokerAtlas
              </a>
            )}
          </div>
        </div>

        {/* ================================================================ */}
        {/* MAIN CONTENT GRID */}
        {/* ================================================================ */}
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <div className="flex flex-col gap-4">

            {/* ============================================================ */}
            {/* SECTION 3: CONTACT & LOCATION */}
            {/* ============================================================ */}
            <SectionCard title="Contact & Location" icon={MapPin}>
              <div className="space-y-3">
                {/* Address */}
                {venue.address && (
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Address</p>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1877F2] hover:underline no-underline"
                      >
                        {venue.address}
                      </a>
                    </div>
                  </div>
                )}

                {/* Main Phone */}
                {venue.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Phone</p>
                      <a href={`tel:${venue.phone}`} className="text-sm text-[#1877F2] hover:underline no-underline">
                        {venue.phone}
                      </a>
                    </div>
                  </div>
                )}

                {/* Website */}
                {websiteUrl && (
                  <div className="flex items-start gap-3">
                    <Globe size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Website</p>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1877F2] hover:underline no-underline flex items-center gap-1"
                      >
                        {venue.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}

                {/* PokerAtlas */}
                {pokerAtlasUrl && (
                  <div className="flex items-start gap-3">
                    <ExternalLink size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">PokerAtlas</p>
                      <a
                        href={pokerAtlasUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1877F2] hover:underline no-underline flex items-center gap-1"
                      >
                        View on PokerAtlas
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}

                {/* Hours */}
                {venue.hours && (
                  <div className="flex items-start gap-3">
                    <Clock size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Hours of Operation</p>
                      <p className="text-sm text-gray-800 m-0">{venue.hours}</p>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ============================================================ */}
            {/* SECTION 4: AMENITIES */}
            {/* ============================================================ */}
            <SectionCard title="Amenities" icon={Check}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AMENITY_LIST.map(amenity => {
                  const available = venue.amenities
                    ? venue.amenities[amenity.key] === true
                    : false;
                  return (
                    <AmenityItem
                      key={amenity.key}
                      icon={amenity.icon}
                      label={amenity.label}
                      available={available}
                    />
                  );
                })}
              </div>
            </SectionCard>

            {/* ============================================================ */}
            {/* SECTION 5: GAMES SPREAD */}
            {/* ============================================================ */}
            {venue.games_offered && venue.games_offered.length > 0 && (
              <SectionCard title="Games Spread" icon={Banknote}>
                <div className="space-y-4">
                  {/* Game Type Tags */}
                  <div className="flex flex-wrap gap-2">
                    {venue.games_offered.map(game => (
                      <span
                        key={game}
                        className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-[#1877F2] border border-blue-100"
                      >
                        {game}
                      </span>
                    ))}
                  </div>

                  {/* Stakes */}
                  {venue.stakes_cash && venue.stakes_cash.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Cash Game Stakes</p>
                      <div className="flex flex-wrap gap-2">
                        {venue.stakes_cash.map(stake => (
                          <span
                            key={stake}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-50 text-green-700 border border-green-100"
                          >
                            {stake}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* ============================================================ */}
            {/* SECTION 6: TOURNAMENT SCHEDULE */}
            {/* ============================================================ */}
            <SectionCard title="Tournament Schedule" icon={Calendar}>
              {tournamentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-[#1877F2] rounded-full animate-spin" />
                  <span className="ml-3 text-sm text-gray-500">Loading tournaments...</span>
                </div>
              ) : dailyTournaments.length > 0 ? (
                <div className="space-y-4">
                  {DAYS_OF_WEEK.map(day => {
                    const dayTournaments = [
                      ...(tournamentsByDay[day] || []),
                      ...(day === DAYS_OF_WEEK[0] ? (tournamentsByDay['Daily'] || []) : [])
                    ];
                    if (dayTournaments.length === 0) return null;

                    const isToday = day === DAYS_OF_WEEK[new Date().getDay()];

                    return (
                      <div key={day}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className={`text-sm font-semibold m-0 ${isToday ? 'text-[#1877F2]' : 'text-gray-700'}`}>
                            {day}
                          </h3>
                          {isToday && (
                            <span className="px-2 py-0.5 bg-[#1877F2] text-white text-[10px] font-bold rounded-full uppercase tracking-wide">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {dayTournaments.map((t, i) => (
                            <div
                              key={`${day}-${i}`}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                                isToday ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-semibold text-[#1877F2] whitespace-nowrap w-[72px]">
                                  {t.start_time}
                                </span>
                                <span className="text-sm text-gray-800 truncate">
                                  {t.tournament_name || `${t.game_type || 'NLH'} Tournament`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-sm font-semibold text-gray-800">
                                  ${t.buy_in}
                                </span>
                                {t.guaranteed && (
                                  <span className="text-xs text-green-600 font-medium">
                                    {formatMoney(t.guaranteed)} GTD
                                  </span>
                                )}
                                {t.game_type && t.game_type !== 'NLH' && (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded">
                                    {t.game_type}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : venue.has_tournaments ? (
                <p className="text-sm text-gray-500 m-0">
                  This venue hosts tournaments. Contact them directly or check{' '}
                  {pokerAtlasUrl ? (
                    <a href={pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="text-[#1877F2] hover:underline no-underline">
                      PokerAtlas
                    </a>
                  ) : (
                    'their website'
                  )}
                  {' '}for the current schedule.
                </p>
              ) : (
                <p className="text-sm text-gray-500 m-0">
                  No tournament schedule available. Contact the venue for current tournament information.
                </p>
              )}
            </SectionCard>

            {/* ============================================================ */}
            {/* SECTION 7: ABOUT */}
            {/* ============================================================ */}
            <SectionCard title="About" icon={Info}>
              <div className="space-y-4">
                {/* Description */}
                {venue.description && (
                  <p className="text-sm text-gray-700 leading-relaxed m-0">
                    {venue.description}
                  </p>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {venue.poker_tables && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Total Tables</p>
                      <p className="text-lg font-bold text-gray-900 m-0">{venue.poker_tables}</p>
                    </div>
                  )}
                  {venue.established && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Established</p>
                      <p className="text-lg font-bold text-gray-900 m-0">{venue.established}</p>
                    </div>
                  )}
                  {venue.trust_score && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">Trust Score</p>
                      <p className="text-lg font-bold text-gray-900 m-0">{venue.trust_score}/5.0</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Venue Type</p>
                    <p className="text-lg font-bold text-gray-900 m-0">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Tournaments</p>
                    <p className="text-lg font-bold text-gray-900 m-0">{venue.has_tournaments ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                {/* Games Summary */}
                {venue.games_offered && venue.games_offered.length > 0 && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Games Offered</p>
                    <p className="text-sm font-medium text-gray-800 m-0">
                      {venue.games_offered.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ============================================================ */}
            {/* SECTION 8: MAP */}
            {/* ============================================================ */}
            <SectionCard title="Location" icon={MapPin}>
              <div className="space-y-3">
                {venue.address && (
                  <p className="text-sm text-gray-700 m-0">{venue.address}</p>
                )}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] transition-colors no-underline w-full sm:w-auto justify-center"
                >
                  <Navigation size={16} />
                  View on Google Maps
                  <ExternalLink size={14} />
                </a>
                {venue.lat && venue.lng && (
                  <p className="text-xs text-gray-400 m-0">
                    Coordinates: {venue.lat.toFixed(4)}, {venue.lng.toFixed(4)}
                  </p>
                )}
              </div>
            </SectionCard>

          </div>
        </div>

        {/* Bottom spacer for mobile */}
        <div className="h-8" />
      </div>
    </>
  );
}
