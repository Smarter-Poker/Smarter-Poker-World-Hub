/**
 * VENUE DETAIL PAGE - PokerAtlas-Style Public Venue Profile
 *
 * Displays comprehensive information about a casino, card room, or poker club.
 * Fetches from /api/poker/venues and /api/poker/daily-tournaments.
 * Includes fallback mock data for development.
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
  home_game: 'Home Game'
};

const VENUE_TYPE_COLORS = {
  casino: { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  card_room: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  poker_club: { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
  home_game: { bg: '#FDF2F8', text: '#9D174D', border: '#FBCFE8' }
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
// FALLBACK MOCK DATA
// ============================================================================

const MOCK_VENUES = {
  '1': {
    id: 1,
    name: 'Bellagio Poker Room',
    venue_type: 'casino',
    city: 'Las Vegas',
    state: 'NV',
    address: '3600 S Las Vegas Blvd, Las Vegas, NV 89109',
    phone: '702-693-7111',
    poker_room_phone: '702-693-7291',
    website: 'https://bellagio.mgmresorts.com/en/entertainment/poker-room.html',
    hours: '24/7',
    games_offered: ['NLH', 'PLO', 'Mixed', 'Limit Hold\'em'],
    stakes_cash: ['$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'],
    poker_tables: 40,
    trust_score: 4.8,
    is_featured: true,
    lat: 36.1127,
    lng: -115.1767,
    established: 1998,
    description: 'The Bellagio Poker Room is one of the most iconic poker rooms in the world, located in the heart of the Las Vegas Strip. Known for hosting high-stakes cash games and major tournament series, the room features 40 tables in an elegant setting with world-class service. The Bobby\'s Room high-stakes area is legendary in the poker community.',
    amenities: {
      food_service: true,
      valet_parking: true,
      hotel: true,
      self_parking: true,
      wifi: true,
      rewards_program: true,
      atm: true,
      cocktail_service: true,
      smoking_area: false,
      sports_bar: false
    }
  },
  '2': {
    id: 2,
    name: 'Commerce Casino',
    venue_type: 'card_room',
    city: 'Commerce',
    state: 'CA',
    address: '6131 E Telegraph Rd, Commerce, CA 90040',
    phone: '323-721-2100',
    poker_room_phone: '323-721-2100',
    website: 'https://commercecasino.com',
    hours: '24/7',
    games_offered: ['NLH', 'PLO', 'Mixed', 'Limit Hold\'em', 'Stud', 'Omaha Hi-Lo'],
    stakes_cash: ['$1/$2', '$2/$3', '$3/$5', '$5/$10', '$10/$20', '$20/$40', '$40/$80'],
    poker_tables: 200,
    trust_score: 4.3,
    is_featured: true,
    lat: 33.9958,
    lng: -118.1517,
    established: 1983,
    description: 'Commerce Casino is the largest card room in the world, featuring over 200 poker tables spread across a massive gaming floor. Located just outside of Los Angeles, Commerce hosts the prestigious LA Poker Classic and offers the widest variety of poker games and stakes anywhere in Southern California. From low-limit games to nosebleed stakes, every poker player can find their game here.',
    amenities: {
      food_service: true,
      valet_parking: true,
      hotel: true,
      self_parking: true,
      wifi: true,
      rewards_program: true,
      atm: true,
      cocktail_service: true,
      smoking_area: false,
      sports_bar: true
    }
  },
  '3': {
    id: 3,
    name: 'Seminole Hard Rock Hotel & Casino',
    venue_type: 'casino',
    city: 'Hollywood',
    state: 'FL',
    address: '1 Seminole Way, Hollywood, FL 33314',
    phone: '866-502-7529',
    poker_room_phone: '954-327-7625',
    website: 'https://www.seminolehardrockhollywood.com',
    hours: '24/7',
    games_offered: ['NLH', 'PLO', 'Mixed'],
    stakes_cash: ['$1/$2', '$2/$5', '$5/$10', '$10/$25', '$25/$50'],
    poker_tables: 45,
    trust_score: 4.7,
    is_featured: true,
    lat: 26.0501,
    lng: -80.2115,
    established: 2004,
    description: 'Seminole Hard Rock Hollywood features one of the premier poker rooms in the Southeast United States. The spacious poker room hosts major tournament series throughout the year and offers a wide range of cash game stakes. The venue underwent a $1.5 billion expansion and now features a stunning guitar-shaped hotel tower.',
    amenities: {
      food_service: true,
      valet_parking: true,
      hotel: true,
      self_parking: true,
      wifi: true,
      rewards_program: true,
      atm: true,
      cocktail_service: true,
      smoking_area: true,
      sports_bar: true
    }
  },
  '4': {
    id: 4,
    name: 'Borgata Hotel Casino & Spa',
    venue_type: 'casino',
    city: 'Atlantic City',
    state: 'NJ',
    address: '1 Borgata Way, Atlantic City, NJ 08401',
    phone: '609-317-1000',
    poker_room_phone: '609-317-1000',
    website: 'https://www.theborgata.com',
    hours: '24/7',
    games_offered: ['NLH', 'PLO', 'Mixed', 'Limit Hold\'em'],
    stakes_cash: ['$1/$2', '$2/$5', '$5/$10', '$10/$20'],
    poker_tables: 85,
    trust_score: 4.6,
    is_featured: true,
    lat: 39.3773,
    lng: -74.4379,
    established: 2003,
    description: 'The Borgata poker room is the premier poker destination in Atlantic City. With 85 tables and a dedicated tournament area, it hosts the Borgata Poker Open and other major events. The room is known for its excellent service, comfortable seating, and professional dealing staff.',
    amenities: {
      food_service: true,
      valet_parking: true,
      hotel: true,
      self_parking: true,
      wifi: true,
      rewards_program: true,
      atm: true,
      cocktail_service: true,
      smoking_area: false,
      sports_bar: true
    }
  },
  '5': {
    id: 5,
    name: 'The Lodge Poker Club',
    venue_type: 'poker_club',
    city: 'Austin',
    state: 'TX',
    address: '8723 Burnet Rd, Austin, TX 78757',
    phone: '737-232-5243',
    poker_room_phone: '737-232-5243',
    website: 'https://thelodgeaustin.com',
    hours: 'Mon-Thu: 10am-4am, Fri-Sat: 10am-6am, Sun: 10am-2am',
    games_offered: ['NLH', 'PLO', 'Mixed', 'Short Deck'],
    stakes_cash: ['$1/$3', '$2/$5', '$5/$10', '$5/$10/$25'],
    poker_tables: 40,
    trust_score: 4.8,
    is_featured: true,
    lat: 30.4065,
    lng: -97.7148,
    established: 2020,
    description: 'The Lodge Poker Club is a state-of-the-art poker club in Austin, Texas, co-owned by poker vlogger Brad Owen and Doug Polk. The club features 40 poker tables, a modern streaming setup, and a welcoming environment for players of all levels. Known for its active community and regular live streams, The Lodge has quickly become one of the most popular poker rooms in Texas.',
    amenities: {
      food_service: true,
      valet_parking: false,
      hotel: false,
      self_parking: true,
      wifi: true,
      rewards_program: true,
      atm: true,
      cocktail_service: true,
      smoking_area: false,
      sports_bar: false
    }
  }
};

const MOCK_DAILY_TOURNAMENTS = [
  { day_of_week: 'Monday', start_time: '11:00 AM', buy_in: 80, game_type: 'NLH', guaranteed: 2000, tournament_name: 'Monday Kickoff' },
  { day_of_week: 'Monday', start_time: '7:00 PM', buy_in: 150, game_type: 'NLH', guaranteed: 5000, tournament_name: 'Monday Night Special' },
  { day_of_week: 'Tuesday', start_time: '11:00 AM', buy_in: 65, game_type: 'NLH', guaranteed: 1500, tournament_name: 'Tuesday Turbo' },
  { day_of_week: 'Tuesday', start_time: '7:00 PM', buy_in: 200, game_type: 'PLO', guaranteed: 5000, tournament_name: 'PLO Night' },
  { day_of_week: 'Wednesday', start_time: '11:00 AM', buy_in: 80, game_type: 'NLH', guaranteed: 2000, tournament_name: 'Midweek Grind' },
  { day_of_week: 'Wednesday', start_time: '7:00 PM', buy_in: 125, game_type: 'NLH', guaranteed: 4000, tournament_name: 'Hump Day Hold\'em' },
  { day_of_week: 'Thursday', start_time: '11:00 AM', buy_in: 100, game_type: 'NLH', guaranteed: 3000, tournament_name: 'Thursday Throwdown' },
  { day_of_week: 'Thursday', start_time: '7:00 PM', buy_in: 250, game_type: 'NLH', guaranteed: 10000, tournament_name: 'Big Thursday' },
  { day_of_week: 'Friday', start_time: '12:00 PM', buy_in: 150, game_type: 'NLH', guaranteed: 5000, tournament_name: 'Friday Frenzy' },
  { day_of_week: 'Friday', start_time: '7:00 PM', buy_in: 300, game_type: 'NLH', guaranteed: 15000, tournament_name: 'Friday Night Main' },
  { day_of_week: 'Saturday', start_time: '11:00 AM', buy_in: 200, game_type: 'NLH', guaranteed: 10000, tournament_name: 'Saturday Showdown' },
  { day_of_week: 'Saturday', start_time: '5:00 PM', buy_in: 500, game_type: 'NLH', guaranteed: 25000, tournament_name: 'Weekend Major' },
  { day_of_week: 'Sunday', start_time: '11:00 AM', buy_in: 100, game_type: 'NLH', guaranteed: 3000, tournament_name: 'Sunday Starter' },
  { day_of_week: 'Sunday', start_time: '4:00 PM', buy_in: 350, game_type: 'NLH', guaranteed: 20000, tournament_name: 'Sunday Championship' },
  { day_of_week: 'Daily', start_time: '10:00 AM', buy_in: 50, game_type: 'NLH', guaranteed: 1000, tournament_name: 'Daily Morning Satellite' }
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
  if (venue.address) {
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
        const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(id)}`);
        const json = await res.json();

        if (json.success && json.data && json.data.length > 0) {
          // Try to find exact match by id or name
          const match = json.data.find(v =>
            String(v.id) === String(id) || v.name.toLowerCase().includes(String(id).toLowerCase())
          ) || json.data[0];
          setVenue(enrichVenueData(match));
        } else {
          // Use mock data fallback
          const mockVenue = MOCK_VENUES[id] || Object.values(MOCK_VENUES)[0];
          setVenue(mockVenue);
        }
      } catch (err) {
        console.error('[VenueDetail] Fetch error:', err);
        const mockVenue = MOCK_VENUES[id] || Object.values(MOCK_VENUES)[0];
        setVenue(mockVenue);
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
          // Use mock fallback
          setDailyTournaments(MOCK_DAILY_TOURNAMENTS);
        }
      } catch (err) {
        console.error('[VenueDetail] Tournament fetch error:', err);
        setDailyTournaments(MOCK_DAILY_TOURNAMENTS);
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

  // ---- Enrich API venue data with mock defaults ----
  function enrichVenueData(apiVenue) {
    const mockMatch = Object.values(MOCK_VENUES).find(
      m => m.name.toLowerCase().includes(apiVenue.name.toLowerCase()) ||
           apiVenue.name.toLowerCase().includes(m.name.toLowerCase())
    );

    return {
      ...apiVenue,
      address: apiVenue.address || mockMatch?.address || `${apiVenue.city}, ${apiVenue.state}`,
      hours: apiVenue.hours || mockMatch?.hours || 'Contact venue for hours',
      poker_room_phone: apiVenue.poker_room_phone || mockMatch?.poker_room_phone || apiVenue.phone,
      established: apiVenue.established || mockMatch?.established || null,
      description: apiVenue.description || mockMatch?.description || `${apiVenue.name} is a ${VENUE_TYPE_LABELS[apiVenue.venue_type] || 'venue'} located in ${apiVenue.city}, ${apiVenue.state}. Contact the venue directly for the latest information about games, tournaments, and promotions.`,
      amenities: apiVenue.amenities || mockMatch?.amenities || {
        food_service: true,
        valet_parking: apiVenue.venue_type === 'casino',
        hotel: apiVenue.venue_type === 'casino',
        self_parking: true,
        wifi: true,
        rewards_program: true,
        atm: true,
        cocktail_service: true,
        smoking_area: false,
        sports_bar: false
      }
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
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Main Phone</p>
                      <a href={`tel:${venue.phone}`} className="text-sm text-[#1877F2] hover:underline no-underline">
                        {venue.phone}
                      </a>
                    </div>
                  </div>
                )}

                {/* Poker Room Phone */}
                {venue.poker_room_phone && venue.poker_room_phone !== venue.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-0.5">Poker Room Phone</p>
                      <a href={`tel:${venue.poker_room_phone}`} className="text-sm text-[#1877F2] hover:underline no-underline">
                        {venue.poker_room_phone}
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
            <SectionCard title="Games Spread" icon={Banknote}>
              {venue.games_offered && venue.games_offered.length > 0 ? (
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

                  {/* Stakes Range Summary */}
                  {venue.stakes_cash && venue.stakes_cash.length > 1 && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-500 mb-1">Stakes Range</p>
                      <p className="text-sm font-semibold text-gray-800 m-0">
                        {venue.stakes_cash[0]} to {venue.stakes_cash[venue.stakes_cash.length - 1]}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 m-0">Contact the venue for current game availability.</p>
              )}
            </SectionCard>

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
                      ...(tournamentsByDay['Daily'] || [])
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
