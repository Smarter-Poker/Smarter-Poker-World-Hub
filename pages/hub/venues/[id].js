/**
 * VENUE DETAIL PAGE - Venue profile
 * Displays full venue info, contact details, daily tournament schedules,
 * live games, check-ins, reviews, activity feed, and claim page
 * Fetches venue data from /api/poker/venues?id=X
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { claimReward } from '../../../src/lib/claimReward';
import { getAuthUser } from '../../../src/lib/authUtils';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import { addVenueFavorite, removeVenueFavorite } from '../../../src/services/pokerNearMeFavorites';
import { formatGameType } from '../../../src/utils/pokerFormatters';
import { openNativeMaps as openNativeMapsUtil, buildVenueAddress, getMapProviderName } from '../../../src/utils/openNativeMaps';
import dynamic from 'next/dynamic';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';

const BestTimeToGoWidget = dynamic(
  () => import('../../../src/components/poker-near-me/BestTimeToGoWidget'),
  { ssr: false }
);

const PeakHoursHeatmap = dynamic(
  () => import('../../../src/components/poker/PeakHoursHeatmap'),
  { ssr: false }
);

const VenueReviews = dynamic(
  () => import('../../../src/components/poker/VenueReviews'),
  { ssr: false }
);

const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Card Room',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity',
};

const DAYS_ORDER = ['Daily', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return 'TBD';
  var start = new Date(startDate + 'T00:00:00');
  var end = endDate ? new Date(endDate + 'T00:00:00') : null;
  var startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end) return startStr;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return startStr + ' - ' + end.getDate() + ', ' + end.getFullYear();
  }
  var endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return startStr + ' - ' + endStr;
}

function PlayerRatingDisplay({ avgRating, totalReviews, trustScore }) {
  const displayRating = totalReviews > 0 ? avgRating : (trustScore || 0);
  const displayLabel = totalReviews > 0 ? 'Player Rating' : 'Trust Score';
  const ratingColor = displayRating >= 4 ? '#22c55e' : displayRating >= 3 ? '#d4a853' : displayRating >= 2 ? '#f59e0b' : '#ef4444';
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="player-rating-display">
      <div className="prd-stars">
        {stars.map(function(star) {
          return (
            <svg
              key={star}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={star <= Math.round(displayRating) ? ratingColor : 'rgba(255,255,255,0.12)'}
              stroke={star <= Math.round(displayRating) ? ratingColor : 'rgba(255,255,255,0.15)'}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: star <= Math.round(displayRating) ? 'drop-shadow(0 0 3px ' + ratingColor + '44)' : 'none' }}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          );
        })}
      </div>
      <span className="prd-value" style={{ color: ratingColor }}>{displayRating ? displayRating.toFixed(1) : 'N/A'}</span>
      {totalReviews > 0 && (
        <a href="#reviews-section" className="prd-count" onClick={function(e) { e.preventDefault(); var el = document.getElementById('reviews-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          ({totalReviews} {totalReviews === 1 ? 'Review' : 'Reviews'})
        </a>
      )}
      <style>{`
        .player-rating-display {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .prd-stars {
          display: flex;
          gap: 2px;
        }
        .prd-value {
          font-size: 14px;
          font-weight: 700;
          margin-left: 2px;
        }
        .prd-count {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          cursor: pointer;
          transition: color 0.2s;
        }
        .prd-count:hover {
          color: rgba(255,255,255,0.7);
        }
      `}</style>
    </div>
  );
}

function VenueTypeBadge({ type }) {
  const label = VENUE_TYPE_LABELS[type] || type || 'Venue';
  const colorMap = {
    casino: { bg: 'rgba(255, 255, 255, 0.15)', border: '#ffffff', text: '#ffffff' },
    card_room: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },
    poker_club: { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#8b5cf6' },
    home_game: { bg: 'rgba(212, 168, 83, 0.15)', border: '#d4a853', text: '#d4a853' },
    charity: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#ec4899' },
  };
  const colors = colorMap[type] || { bg: 'rgba(255,255,255,0.1)', border: '#6b7280', text: '#9ca3af' };

  return (
    <span className="venue-type-badge">
      {label}
      <style>{`
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

function StarRating({ rating, size, interactive, onRate }) {
  const sz = size || 16;
  const stars = [1, 2, 3, 4, 5];
  return (
    <span style={{ display: 'inline-flex', gap: '2px', cursor: interactive ? 'pointer' : 'default' }}>
      {stars.map(function (star) {
        return (
          <svg
            key={star}
            width={sz}
            height={sz}
            viewBox="0 0 24 24"
            fill={star <= rating ? '#00D4FF' : 'none'}
            stroke={star <= rating ? '#00D4FF' : 'rgba(255,255,255,0.25)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            onClick={function () { if (interactive && onRate) onRate(star); }}
            style={{ transition: 'all 0.15s' }}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      })}
    </span>
  );
}

export default function VenueDetailPage() {
  const router = useRouter();
  const { id, action, tab } = router.query;
  const bus = useTrainingBus();
  const { hasAccess: isVip, guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

  // Global Favorite Status (Poker Near Me)
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isIframeMode, setIsIframeMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsIframeMode(window.self !== window.top);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    const loadFavs = () => {
      try {
        const f = JSON.parse(localStorage.getItem('sp-favorites') || '{}');
        setIsSaved(!!f['venue-' + id]);
      } catch (e) { console.warn('[App] Handled exception:', e); }
    };
    loadFavs();
    const handleStorage = (e) => {
      if (e.key === 'sp-favorites') loadFavs();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [id]);

  // Fast-load follow state from localStorage (instant, before API round-trip)
  const [isFollowed, setIsFollowed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [friendState, setFriendState] = useState('none');
  const [friendBusy, setFriendBusy] = useState(false);

  // Live Games state
  const [liveGames, setLiveGames] = useState([]);
  const [showReportGame, setShowReportGame] = useState(false);
  const [reportForm, setReportForm] = useState({
    game_type: 'NL Holdem',
    stakes: '',
    table_count: 1,
    wait_time: '',
    notes: '',
  });
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Check-In state
  const [checkins, setCheckins] = useState([]);
  const [checkinCount, setCheckinCount] = useState(0);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState('');
  const [checkinName, setCheckinName] = useState('');
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinConfirm, setCheckinConfirm] = useState(false);

  // Who's Here state
  const [whosHere, setWhosHere] = useState({ total: 0, people: [], friends: [] });

  // Enhancement suite state
  const [venueLeaderboard, setVenueLeaderboard] = useState([]);
  const [venueActivity, setVenueActivity] = useState({ days: [], maxCount: 1 });
  const [popularHours, setPopularHours] = useState({ hours: [], maxCount: 1, peakHour: '' });
  const [checkinError, setCheckinError] = useState('');

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 0,
    reviewer_name: '',
    review_text: '',
  });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Activity Feed state
  const [activities, setActivities] = useState([]);
  const [showPostForm, setShowPostForm] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);

  // Claim Page state
  const [claimStatus, setClaimStatus] = useState(null);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    role: 'Manager',
    verification_notes: '',
  });
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // Map state
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Promotions state
  const [promotions, setPromotions] = useState([]);

  // Nearby venues state
  const [nearbyVenues, setNearbyVenues] = useState([]);

  // Related tours/series state
  const [relatedSeries, setRelatedSeries] = useState([]);

  // Bravo Live Tables state (scraped real-time data)
  const [bravoLiveTables, setBravoLiveTables] = useState(null);
  const [bravoLiveLoading, setBravoLiveLoading] = useState(false);

  // Waitlist board state
  const [waitlistData, setWaitlistData] = useState([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  // Game Schedule state (per-day cash game listings)
  const [gameSchedule, setGameSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ day_of_week: 'monday', game_name: '', start_time: '', end_time: '', notes: '' });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleDeleting, setScheduleDeleting] = useState(null);

  // Tournament Schedule state (scraped tournament listings)
  const [tournamentSchedule, setTournamentSchedule] = useState([]);
  const [tournamentScheduleLoading, setTournamentScheduleLoading] = useState(false);

  // Get or create anonymous user ID for tracking
  function getAnonymousUserId() {
    try {
      var uid = localStorage.getItem('sp-anon-uid');
      if (!uid) {
        uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('sp-anon-uid', uid);
      }
      return uid;
    } catch (e) {
      return 'anon-fallback';
    }
  }

  // Fast-load follow state from localStorage (instant, zero network round-trip)
  useEffect(function () {
    if (!id) return;
    try {
      var followed = JSON.parse(localStorage.getItem('followed-venues') || '[]');
      if (followed.includes(String(id))) setIsFollowed(true);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [id]);

  // Load follow state from Supabase API — requires a real user UUID
  useEffect(function () {
    if (!id) return;
    var authUser = getAuthUser();
    var checkUid = authUser && authUser.id ? authUser.id : null;
    // Skip API call for unauthenticated users — localStorage already handles their state above
    if (!checkUid) return;
    fetch('/api/poker/follow?page_type=venue&page_id=' + id + '&check_user=' + encodeURIComponent(checkUid))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.is_following !== undefined) setIsFollowed(d.is_following); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [id]);

  // SWR — parallel fetch venue + follow count + social page
  const swrKey = id ? `/api/poker/venues?id=${id}` : null;
  const { data: swrData, isLoading: loading, error } = useSWR(swrKey, async () => {
    const [venueRes, followRes, socialRes] = await Promise.all([
      fetch('/api/poker/venues?id=' + id).catch(() => ({ ok: false })),
      fetch('/api/poker/follow?page_type=venue&page_id=' + id).catch(() => ({ ok: false })),
      fetch('/api/social/pages?linked_venue_id=' + String(id) + '&limit=1').catch(() => ({ ok: false }))
    ]);
    if (!venueRes.ok) throw new Error(`Request failed (${venueRes.status})`);
    const [vj, fj, sj] = await Promise.all([venueRes.json(), followRes.json(), socialRes.json()]);
    const vjDataArr = Array.isArray(vj.data) ? vj.data : (vj.data ? [vj.data] : []);
    const vjHomeGroupsArr = Array.isArray(vj.home_groups) ? vj.home_groups : (vj.home_groups ? [vj.home_groups] : []);
    const allVenues = [...vjDataArr, ...vjHomeGroupsArr];
    const venueData = allVenues.length > 0
      ? (allVenues.find(function (v) { return String(v.id) === String(id); }) || allVenues[0])
      : null;
    return {
      venue: venueData,
      followerCount: fj.success ? (fj.follower_count || 0) : 0,
      socialPageSlug: sj.success && sj.data && sj.data.length > 0 ? (sj.data[0].slug || sj.data[0].id) : null
    };
  });
  const venue = swrData?.venue || null;
  const [localFollowerCount, setFollowerCount] = useState(null);
  const followerCount = localFollowerCount !== null ? localFollowerCount : (swrData?.followerCount || 0);
  const socialPageSlug = swrData?.socialPageSlug || null;

  // Fetch live games
  var fetchLiveGames = async function () {
    try {
      var res = await fetch('/api/poker/live-games?venue_id=' + id);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        var games = json.games || json.data || [];
        setLiveGames(Array.isArray(games) ? games : []);
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchLiveGames();
  }, [id]);

  // Fetch Bravo live table data (scraped real-time from Bravo Poker Live)
  useEffect(function () {
    if (!venue || !venue.name) return;
    setBravoLiveLoading(true);
    fetch('/api/poker/live-tables?search=' + encodeURIComponent(venue.name))
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.venues && json.venues.length > 0) {
          // Find best match by name similarity
          var venueLower = venue.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
          var best = json.venues.find(function (v) {
            var bName = (v.venue_name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
            return bName === venueLower || bName.includes(venueLower) || venueLower.includes(bName);
          }) || null;
          // If no name match, try the first result if only 1 venue returned
          if (!best && json.venues.length === 1) best = json.venues[0];
          setBravoLiveTables(best);
        } else {
          setBravoLiveTables(null);
        }
      })
      .catch(function () { setBravoLiveTables(null); })
      .finally(function () { setBravoLiveLoading(false); });
  }, [venue]);

  // Fetch waitlist data for board display
  var fetchWaitlist = async function () {
    try {
      var wlRes = await fetch('/api/commander/waitlist/venue/' + id);
      if (!wlRes.ok) throw new Error(`Request failed (${wlRes.status})`);
      var wlJson = await wlRes.json();
      if (wlJson.success && wlJson.data && wlJson.data.waitlists) {
        setWaitlistData(wlJson.data.waitlists);
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchWaitlist();
    var wlInterval = setInterval(fetchWaitlist, 30000);
    return function () { clearInterval(wlInterval); };
  }, [id]);

  // Fetch check-ins
  var fetchCheckins = async function () {
    try {
      var res = await fetch('/api/poker/checkins?venue_id=' + id);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        var data = json.checkins || json.data || [];
        data = Array.isArray(data) ? data : [];
        setCheckins(data);
        setCheckinCount(json.count || data.length);
        var authUserForCheck = getAuthUser();
        var authUid = (authUserForCheck && authUserForCheck.id) ? authUserForCheck.id : null;
        var anonUid = getAnonymousUserId();
        var fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        var recent = data.find(function (c) {
          return (c.user_id === authUid || c.user_id === anonUid) && new Date(c.created_at) > fourHoursAgo;
        });
        if (recent) setHasCheckedIn(true);
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchCheckins();
    // Fetch who's here
    var whUrl = '/api/poker/checkins/whos-here?venue_id=' + id;
    var authUser = getAuthUser();
    var headers = {};
    if (authUser) {
      try {
        var _primaryAuth = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        var _token = _primaryAuth?.access_token || null;
        if (!_token) {
          var sbKeys = Object.keys(localStorage || {}).filter(function(k) { return k.startsWith('sb-') && k.endsWith('-auth-token'); });
          if (sbKeys.length > 0) _token = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
        }
        if (_token) headers['Authorization'] = 'Bearer ' + _token;
      } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    }
    fetch(whUrl, { headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(j) { if (j.success) setWhosHere({ total: j.total || 0, people: j.people || [], friends: j.friends || [] }); })
      .catch(function() { /* silent */ });
  }, [id]);

  // Fetch venue enhancement data (leaderboard, activity, popular hours)
  useEffect(function () {
    if (!id) return;
    // Leaderboard
    fetch('/api/poker/checkins/leaderboard?venue_id=' + id + '&period=month')
      .then(function(r) { return r.json(); })
      .then(function(j) { if (j.success && j.leaders) setVenueLeaderboard(j.leaders); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    // 7-day activity
    fetch('/api/poker/checkins/activity?venue_id=' + id)
      .then(function(r) { return r.json(); })
      .then(function(j) { if (j.success) setVenueActivity({ days: j.days || [], maxCount: j.maxCount || 1 }); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    // Popular hours
    fetch('/api/poker/checkins/popular-hours?venue_id=' + id)
      .then(function(r) { return r.json(); })
      .then(function(j) { if (j.success) setPopularHours({ hours: j.hours || [], maxCount: j.maxCount || 1, peakHour: j.peakHour || '' }); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [id]);

  // Fetch reviews
  var fetchReviews = async function () {
    try {
      var res = await fetch('/api/poker/reviews?venue_id=' + id);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        var reviewData = json.reviews || json.data || [];
        reviewData = Array.isArray(reviewData) ? reviewData : [];
        setReviews(reviewData);
        setTotalReviews(json.total_reviews || json.total || reviewData.length);
        setAvgRating(json.avg_rating || (reviewData.length > 0
          ? reviewData.reduce(function (sum, r) { return sum + (r.rating || 0); }, 0) / reviewData.length
          : 0));
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchReviews();
  }, [id]);

  // Fetch activity feed
  var fetchActivities = async function () {
    try {
      var res = await fetch('/api/poker/activity?page_type=venue&page_id=' + id + '&limit=10');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        var items = json.activities || json.data || [];
        setActivities(Array.isArray(items) ? items : []);
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchActivities();
  }, [id]);

  // Fetch claim status
  var fetchClaimStatus = async function () {
    try {
      var res = await fetch('/api/poker/claim-page?page_type=venue&page_id=' + id);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        if (json.claimed && json.claim) {
          setClaimStatus(json.claim.status || 'pending');
        } else {
          setClaimStatus(null);
        }
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(function () {
    if (!id) return;
    fetchClaimStatus();
  }, [id]);

  var fetchGameSchedule = async function () {
    if (venue?.venue_type === 'home_game') {
      if (venue.settings?.tables?.length > 0) {
        // Map settings to the structure expected by the UI (grouped by today's day)
        var todayKey = SCHEDULE_DAYS[(new Date().getDay() + 6) % 7];
        var scheduleObj = {};
        SCHEDULE_DAYS.forEach(d => { scheduleObj[d] = []; });
        venue.settings.tables.forEach((t, i) => {
           scheduleObj[todayKey].push({
              id: 'hg-' + i,
              game_name: (t.game_type ? t.game_type.toUpperCase() : 'Poker') + ' ' + (t.stakes || ''),
              start_time: venue.typical_time || '',
              end_time: '',
              notes: venue.settings.schedule_summary || '',
           });
        });
        setGameSchedule(scheduleObj);
      } else {
        setGameSchedule(null);
      }
      return;
    }
    
    setScheduleLoading(true);
    try {
      var res = await fetch('/api/poker/venue-schedules?venue_id=' + id);
      if (res.ok) {
        var json = await res.json();
        if (json.success && json.total_entries > 0) {
          setGameSchedule(json.schedule);
        } else {
          setGameSchedule(null);
        }
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    setScheduleLoading(false);
  };

  useEffect(function () {
    if (!id || !venue) return;
    fetchGameSchedule();
  }, [id, venue]);

  // Fetch daily tournaments
  var fetchTournamentSchedule = async function () {
    if (venue?.venue_type === 'home_game') {
      if (venue.settings?.tournaments?.length > 0) {
        var tArr = venue.settings.tournaments.map((t, i) => ({
           id: 'hg-t-' + i,
           day_of_week: venue.typical_day || 'Upcoming',
           start_time: venue.typical_time || 'TBD',
           tournament_name: t.name || 'Tournament',
           buy_in: t.buy_in || 0,
           game_type: t.game_type || '',
           guaranteed: t.guaranteed || 0,
           starting_stack: t.starting_stack || null,
           blind_levels: t.blind_levels || null,
        }));
        setTournamentSchedule(tArr);
      } else {
        setTournamentSchedule([]);
      }
      return;
    }

    setTournamentScheduleLoading(true);
    try {
      var res = await fetch('/api/poker/daily-tournaments?venue_id=' + id + '&day=all');
      if (res.ok) {
        var json = await res.json();
        if (json.success && json.tournaments && json.tournaments.length > 0) {
          setTournamentSchedule(json.tournaments);
        } else {
          setTournamentSchedule([]);
        }
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    setTournamentScheduleLoading(false);
  };

  useEffect(function () {
    if (!id || !venue) return;
    fetchTournamentSchedule();
  }, [id, venue]);

  var handleAddScheduleEntry = async function (e) {
    e.preventDefault();
    if (!scheduleForm.game_name.trim()) return;
    setScheduleSaving(true);
    try {
      var authUser = getAuthUser();
      var token = null;
      try { token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token; } catch (e) { console.warn('[App] Handled exception:', e); }
      if (!token) { setScheduleSaving(false); return; }
      var res = await fetch('/api/poker/venue-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          venue_id: parseInt(id, 10),
          day_of_week: scheduleForm.day_of_week,
          game_name: scheduleForm.game_name.trim(),
          start_time: scheduleForm.start_time.trim() || null,
          end_time: scheduleForm.end_time.trim() || null,
          notes: scheduleForm.notes.trim() || null,
        }),
      });
      if (res.ok) {
        setScheduleForm({ day_of_week: scheduleForm.day_of_week, game_name: '', start_time: '', end_time: '', notes: '' });
        await fetchGameSchedule();
      }
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    setScheduleSaving(false);
  };

  var handleDeleteScheduleEntry = async function (entryId) {
    setScheduleDeleting(entryId);
    try {
      var token = null;
      try { token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token; } catch (e) { console.warn('[App] Handled exception:', e); }
      if (!token) { setScheduleDeleting(null); return; }
      await fetch('/api/poker/venue-schedules?id=' + entryId + '&venue_id=' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
      await fetchGameSchedule();
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    setScheduleDeleting(null);
  };

  var SCHEDULE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var SCHEDULE_DAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
  var todayScheduleKey = SCHEDULE_DAYS[(new Date().getDay() + 6) % 7];

  // Fetch venue promotions
  useEffect(function () {
    if (!id) return;
    fetch('/api/poker/promotions?page_type=venue&page_id=' + id + '&limit=5')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.success) {
          setPromotions(json.promotions || []);
        }
      })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [id]);

  // Fetch nearby venues (once we have venue lat/lng)
  useEffect(function () {
    if (!venue || !venue.latitude || !venue.longitude) return;
    fetch('/api/poker/venues?lat=' + venue.latitude + '&lng=' + venue.longitude + '&radius=80&limit=6')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.success) {
          var all = json.data || [];
          // Exclude current venue and take top 5
          var nearby = all.filter(function (v) { return String(v.id) !== String(id); }).slice(0, 5);
          setNearbyVenues(nearby);
        }
      })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [venue, id]);

  // Fetch related series (match by venue name)
  useEffect(function () {
    if (!venue || !venue.name) return;
    fetch('/api/poker/series')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.success) {
          var allSeries = json.series || json.data || [];
          var venueLower = venue.name.toLowerCase();
          var matched = allSeries.filter(function (s) {
            var seriesVenue = (s.venue || s.venue_name || '').toLowerCase();
            // Match if venue name appears in series venue or vice versa
            return seriesVenue.indexOf(venueLower) !== -1 || venueLower.indexOf(seriesVenue) !== -1;
          });
          setRelatedSeries(matched.slice(0, 5));
        }
      })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [venue]);

  // Handle ?action= and ?tab= query parameters from external navigation
  useEffect(function () {
    if ((!action && !tab) || loading) return;
    var sectionId = null;
    if (action === 'checkin') {
      sectionId = 'checkins-section';
      setShowCheckinForm(true);
    } else if (action === 'review') {
      sectionId = 'reviews-section';
      setShowReviewForm(true);
    } else if (tab === 'tournaments') {
      sectionId = 'tournaments-section';
    }
    
    if (sectionId) {
      setTimeout(function () {
        var el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [action, tab, loading]);

  // Wait for Leaflet scripts
  useEffect(function () {
    if (typeof window === 'undefined') return;
    var check = function () {
      if (window.L) {
        setMapReady(true);
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  }, []);

  // Initialize venue map once Leaflet is ready and venue loaded
  useEffect(function () {
    if (!mapReady || !venue || !venue.latitude || !venue.longitude) return;
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    var L = window.L;
    var map = L.map(mapContainerRef.current, {
      center: [venue.latitude, venue.longitude],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    var goldIcon = L.divIcon({
      className: 'venue-detail-marker',
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#ffffff;border:3px solid #fff;box-shadow:0 0 12px rgba(255,255,255,0.8);"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    L.marker([venue.latitude, venue.longitude], { icon: goldIcon }).addTo(map);
    mapInstanceRef.current = map;

    return function () {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapReady, venue]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!id) return;
    const _ch = supabase
      .channel(`venue-pub:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `venue_id=eq.${id}` }, () => {
        console.warn('[VenueDetail] Received real-time update for tables');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'venue_checkins', filter: `venue_id=eq.${id}` }, () => {
        // Refresh check-in list, Who's Here, and enhancement data when someone new checks in
        fetchCheckins();
        fetch('/api/poker/checkins/whos-here?venue_id=' + id)
          .then(function(r) { return r.json(); })
          .then(function(j) { if (j.success) setWhosHere({ total: j.total || 0, people: j.people || [], friends: j.friends || [] }); })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        // Delayed refresh — let DB write settle
        setTimeout(function () {
          fetch('/api/poker/checkins/leaderboard?venue_id=' + id + '&period=month')
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success && j.leaders) setVenueLeaderboard(j.leaders); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          fetch('/api/poker/checkins/activity?venue_id=' + id)
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success) setVenueActivity({ days: j.days || [], maxCount: j.maxCount || 1 }); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          fetch('/api/poker/checkins/popular-hours?venue_id=' + id)
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success) setPopularHours({ hours: j.hours || [], maxCount: j.maxCount || 1, peakHour: j.peakHour || '' }); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }, 500);
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [id]);

  // Handlers
  const handleSaveVenue = async () => {
    const venueId = String(id);
    const newState = !isSaved;
    setIsSaved(newState); // Optimistic UI

    try {
      // Sync to Native EventBus and localStorage
      const spFavoritesStr = localStorage.getItem('sp-favorites') || '{}';
      const spFavs = JSON.parse(spFavoritesStr);
      if (newState) {
        spFavs['venue-' + venueId] = Date.now();
        try { busEmit.venueSaved(venueId, venue?.name); } catch (e) { console.warn('[App] Handled exception:', e); }
      } else {
        delete spFavs['venue-' + venueId];
        try { busEmit.venueUnsaved(venueId); } catch (e) { console.warn('[App] Handled exception:', e); }
      }
      localStorage.setItem('sp-favorites', JSON.stringify(spFavs));
      // Cross-tab trigger native event (for the current tab, EventBus handles it, but just in case, emit a full StorageEvent)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sp-favorites',
          newValue: JSON.stringify(spFavs)
        }));
      }

      // Sync to Supabase
      const authUser = getAuthUser();
      const uId = (authUser && authUser.id) ? authUser.id : getAnonymousUserId();
      if (newState) {
        await addVenueFavorite(uId, venueId, {
          name: venue?.name,
          address: venue?.address,
          city: venue?.city,
          state: venue?.state
        });
      } else {
        await removeVenueFavorite(uId, venueId);
      }
    } catch (err) {
      console.warn('Failed to save venue:', err);
      // Rollback optimistic UI
      setIsSaved(!newState);
      try {
        const spFavs = JSON.parse(localStorage.getItem('sp-favorites') || '{}');
        if (!newState) { spFavs['venue-' + venueId] = Date.now(); } else { delete spFavs['venue-' + venueId]; }
        localStorage.setItem('sp-favorites', JSON.stringify(spFavs));
      } catch (e) { console.warn('[App] Handled exception:', e); }
    }
  };

  var handleFollow = function () {
    var venueId = String(id);
    var newState = !isFollowed;
    setIsFollowed(newState);
    setFollowerCount(function (prev) { return newState ? prev + 1 : Math.max(0, prev - 1); });

    // Persist follow state to localStorage for instant load next visit
    try {
      var followed = JSON.parse(localStorage.getItem('followed-venues') || '[]');
      if (newState) {
        if (!followed.includes(venueId)) followed.push(venueId);
      } else {
        followed = followed.filter(function (v) { return v !== venueId; });
      }
      localStorage.setItem('followed-venues', JSON.stringify(followed));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // Require auth for server-side follow — anonymous users only get localStorage follows
    var fetchHeaders = { 'Content-Type': 'application/json' };
    var hasToken = false;
    try {
      var _pa = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      var _ft = _pa?.access_token || null;
      if (!_ft) {
        var sbKeys = Object.keys(localStorage || {}).filter(function (k) { return k.startsWith('sb-') && k.endsWith('-auth-token'); });
        if (sbKeys.length > 0) _ft = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
      }
      if (_ft) { fetchHeaders['Authorization'] = 'Bearer ' + _ft; hasToken = true; }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    if (!hasToken) return; // Anonymous follow state saved to localStorage only (above)

    var prevFollowed = isFollowed;
    var prevCount = followerCount;
    fetch('/api/poker/follow', {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify({
        page_type: 'venue',
        page_id: venueId,
        action: newState ? 'follow' : 'unfollow',
      }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success && data.error !== undefined) {
        // API rejected — rollback UI and localStorage
        setIsFollowed(prevFollowed);
        setFollowerCount(prevCount);
        try {
          var rl = JSON.parse(localStorage.getItem('followed-venues') || '[]');
          var rolled = prevFollowed ? (rl.includes(venueId) ? rl : [...rl, venueId]) : rl.filter(function (v) { return v !== venueId; });
          localStorage.setItem('followed-venues', JSON.stringify(rolled));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }
    })
    .catch(function () {
      // Network error — rollback
      setIsFollowed(prevFollowed);
      setFollowerCount(prevCount);
    });
  };

  var handleShare = async function () {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(function () { setCopySuccess(false); }, 2000);
    } catch (e) {
      var textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(function () { setCopySuccess(false); }, 2000);
    }
  };

  useEffect(() => {
    const fetchFriendState = async () => {
      if (!venue || venue.venue_type !== 'home_game' || !venue.owner_id) return;
      try {
        const u = getAuthUser();
        const tk = localStorage.getItem('smarter-poker-auth');
        if (!u || !tk) return;
        const res = await fetch(`/api/social/friends?userId=${u.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const friends = data.friends || [];
        const isF = friends.some((f) => f.id === venue.owner_id && f.status === 'friends');
        const isP = friends.some((f) => f.id === venue.owner_id && f.status === 'pending');
        if (isF) setFriendState('friends');
        else if (isP) setFriendState('pending');
        else setFriendState('none');
      } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    };
    fetchFriendState();
  }, [venue]);

  const handleAddFriend = async () => {
    if (!venue || !venue.owner_id) return;
    try {
      const u = getAuthUser();
      const authRaw = localStorage.getItem('smarter-poker-auth');
      if (!u || !authRaw) { alert('You must be logged in to add friends.'); return; }
      setFriendBusy(true);
      const auth = JSON.parse(authRaw);
      const res = await fetch('/api/social/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`
        },
        body: JSON.stringify({ action: 'add', targetUserId: venue.owner_id })
      });
      if (res.ok) setFriendState('pending');
      else alert('Failed to send friend request. You may already be friends.');
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    setFriendBusy(false);
  };

  var handleReportGame = async function (e) {
    e.preventDefault();
    if (!reportForm.stakes.trim()) return;
    setReportSubmitting(true);
    try {
      var res = await fetch('/api/poker/live-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: id,
          game_type: reportForm.game_type,
          stakes: reportForm.stakes,
          table_count: parseInt(reportForm.table_count) || 1,
          wait_time: reportForm.wait_time ? parseInt(reportForm.wait_time) : null,
          notes: reportForm.notes || null,
          user_id: getAnonymousUserId(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        setShowReportGame(false);
        setReportForm({ game_type: 'NL Holdem', stakes: '', table_count: 1, wait_time: '', notes: '' });
        await fetchLiveGames();
      }
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    finally { setReportSubmitting(false); }
  };

  var handleCheckin = async function (e) {
    e.preventDefault();
    setCheckinSubmitting(true);
    setCheckinError('');
    // Optimistic UI — show checked-in immediately
    setHasCheckedIn(true);
    setCheckinConfirm(true);
    setShowCheckinForm(false);
    try {
      // Prefer authenticated user ID for streak/profile/friend matching
      var authUser = getAuthUser();
      var userId = (authUser && authUser.id) ? authUser.id : getAnonymousUserId();
      var displayName = checkinName.trim() || (authUser && (authUser.user_metadata?.full_name || authUser.user_metadata?.name)) || 'Anonymous';

      // Build headers with JWT auth
      var fetchHeaders = { 'Content-Type': 'application/json' };
      try {
        var _ci_auth = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        var _ci_tok = _ci_auth?.access_token || null;
        if (!_ci_tok) {
          var sbKeys = Object.keys(localStorage || {}).filter(function(k) { return k.startsWith('sb-') && k.endsWith('-auth-token'); });
          if (sbKeys.length > 0) _ci_tok = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
        }
        if (_ci_tok) fetchHeaders['Authorization'] = 'Bearer ' + _ci_tok;
      } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }

      var res = await fetch('/api/poker/checkins', {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({
          venue_id: id,
          user_id: userId,
          user_name: displayName,
          message: checkinMessage.trim() || null,
        }),
      });

      // Register geofence visit for verified review eligibility
      try {
        await fetch('/api/venues/checkin', {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify({ venue_id: id }),
        });
      } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }

      if (!res.ok) {
        var errBody = null;
        try { errBody = await res.json(); } catch (_e2) { console.warn('[App] Handled exception:', _e2?.message || _e2); }
        throw new Error((errBody && errBody.error) || 'Check-in failed (' + res.status + ')');
      }
      var json = await res.json();
      if (json.success) {
        setCheckinMessage('');
        setCheckinName('');
        await fetchCheckins();
        // Refresh Who's Here indicator
        fetch('/api/poker/checkins/whos-here?venue_id=' + id)
          .then(function(r) { return r.json(); })
          .then(function(j) { if (j.success) setWhosHere({ total: j.total || 0, people: j.people || [], friends: j.friends || [] }); })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        try { busEmit.venueCheckinCreated(id, venue?.name || '', userId); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        // Refresh enhancement data (leaderboard, activity) after check-in
        setTimeout(function () {
          fetch('/api/poker/checkins/leaderboard?venue_id=' + id + '&period=month')
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success && j.leaders) setVenueLeaderboard(j.leaders); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          fetch('/api/poker/checkins/activity?venue_id=' + id)
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success) setVenueActivity({ days: j.days || [], maxCount: j.maxCount || 1 }); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          fetch('/api/poker/checkins/popular-hours?venue_id=' + id)
            .then(function(r) { return r.json(); })
            .then(function(j) { if (j.success) setPopularHours({ hours: j.hours || [], maxCount: j.maxCount || 1, peakHour: j.peakHour || '' }); })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }, 500);
        setTimeout(function () { setCheckinConfirm(false); }, 3000);
      } else {
        throw new Error(json.error || 'Check-in failed');
      }
    } catch (err) {
      console.warn('[App] Handled exception:', err?.message || err);
      setCheckinError(err?.message || 'Check-in failed');
    }
  };

  var handleSubmitReview = async function (e) {
    e.preventDefault();
    if (!reviewForm.rating || !reviewForm.review_text.trim()) return;
    setReviewSubmitting(true);
    try {
      var res = await fetch('/api/poker/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: id,
          rating: reviewForm.rating,
          reviewer_name: reviewForm.reviewer_name.trim() || 'Anonymous',
          review_text: reviewForm.review_text.trim(),
          user_id: getAnonymousUserId(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        setShowReviewForm(false);
        setReviewForm({ rating: 0, reviewer_name: '', review_text: '' });
        await fetchReviews();
        try { bus?.emit?.('venue:review', { venueId: id, rating: reviewForm.rating }); } catch (e) { console.warn('[App] Handled exception:', e); }

        // Award venue review diamonds (geo-fenced, fire-and-forget)
        // Only for authenticated users — anonymous reviews still save but don't earn diamonds
        var authUser = getAuthUser();
        if (authUser && authUser.id && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            function (position) {
              claimReward('/api/rewards/venue-review', {
                userId: authUser.id,
                venueId: id,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              }, 'Venue Review (GPS Verified)');
            },
            function () {
              // GPS denied — review saved, no diamonds. Silent fail.
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        }
      }
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    finally { setReviewSubmitting(false); }
  };

  var handlePostActivity = async function (e) {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPostSubmitting(true);
    try {
      var res = await fetch('/api/poker/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_type: 'venue',
          page_id: id,
          activity_type: 'update',
          content: postContent.trim(),
          user_id: getAnonymousUserId(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        setShowPostForm(false);
        setPostContent('');
        await fetchActivities();
      }
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    finally { setPostSubmitting(false); }
  };

  var handleClaimSubmit = async function (e) {
    e.preventDefault();
    if (!claimForm.contact_name.trim() || !claimForm.contact_email.trim()) return;
    setClaimSubmitting(true);
    try {
      var res = await fetch('/api/poker/claim-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_type: 'venue',
          page_id: id,
          contact_name: claimForm.contact_name.trim(),
          contact_email: claimForm.contact_email.trim(),
          contact_phone: claimForm.contact_phone.trim() || null,
          role: claimForm.role,
          verification_notes: claimForm.verification_notes.trim() || null,
          user_id: getAnonymousUserId(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      var json = await res.json();
      if (json.success) {
        setClaimStatus('pending');
        setShowClaimForm(false);
        setClaimForm({ contact_name: '', contact_email: '', contact_phone: '', role: 'Manager', verification_notes: '' });
      }
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    finally { setClaimSubmitting(false); }
  };

  var openNativeMaps = function (mode) {
    if (!venue) return;
    if (mode === 'directions' && venue.latitude && venue.longitude) {
      openNativeMapsUtil({ address: buildVenueAddress(venue), lat: parseFloat(venue.latitude), lng: parseFloat(venue.longitude), mode: 'directions' });
    } else {
      openNativeMapsUtil({ address: buildVenueAddress(venue), mode: 'search' });
    }
  };

  // Group daily tournament schedules by day
  var getGroupedSchedules = function () {
    if (!venue || !venue.daily_tournaments || !venue.daily_tournaments.length) return null;
    var allSchedules = [];
    venue.daily_tournaments.forEach(function (dt) {
      if (dt.schedules && dt.schedules.length) {
        dt.schedules.forEach(function (s) {
          allSchedules.push(Object.assign({}, s, { source_url: dt.source_url }));
        });
      }
    });
    if (!allSchedules.length) return null;
    var grouped = {};
    allSchedules.forEach(function (s) {
      var day = s.day_of_week || 'Unknown';
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(s);
    });
    var sorted = {};
    DAYS_ORDER.forEach(function (day) {
      if (grouped[day]) sorted[day] = grouped[day];
    });
    Object.keys(grouped || {}).forEach(function (day) {
      if (!sorted[day]) sorted[day] = grouped[day];
    });
    return sorted;
  };

  var groupedSchedules = venue ? getGroupedSchedules() : null;
  var todayName = DAYS_ORDER[(new Date().getDay() + 6) % 7];

  // Compute rating distribution
  var getRatingDistribution = function () {
    var dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(function (r) {
      var star = Math.round(r.rating || 0);
      if (star >= 1 && Star <= 5) dist[star]++;
    });
    return dist;
  };
  var ratingDistribution = reviews.length > 0 ? getRatingDistribution() : null;

  var getWaitTimeColor = function (waitTime) {
    if (waitTime === null || waitTime === undefined) return '#94a3b8';
    if (waitTime <= 10) return '#22c55e';
    if (waitTime <= 30) return '#00D4FF';
    return '#ef4444';
  };

  var getActivityTypeStyle = function (type) {
    var styles = {
      update: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa' },
      announcement: { bg: 'rgba(0, 212, 255, 0.12)', border: 'rgba(0, 212, 255, 0.25)', color: '#00D4FF' },
      promotion: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.25)', color: '#4ade80' },
      result: { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.25)', color: '#a78bfa' },
    };
    return styles[type] || styles.update;
  };

  var pageTitle = venue ? venue.name + ' - Poker Venue' : 'Venue Detail';

  return (
    <>
      <SEOHead
        title="Poker Venue Details"
        description="View Detailed Information About This Poker Venue Including Games, Tournaments, And Hours."
        noindex={true}
      >
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </SEOHead>

      {!isIframeMode && (
        <UniversalHeader 
          pageDepth={2} 
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => {
            router.back();
          }}
        />
      )}

      <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
      />

      <div className="venue-page">
        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading Venue...</p>
          </div>
        )}

        {error && !loading && (
          <div className="error-state">
            <div className="error-icon">!</div>
            <h2>Venue Not Found</h2>
            <p>{error}</p>
          </div>
        )}

        {venue && !loading && (
          <>

            {/* Breadcrumb Navigation */}
            {!isIframeMode && (
              <nav className="breadcrumb-nav" aria-label="Breadcrumb">
                <ol className="breadcrumb-list">
                  <li className="breadcrumb-item">
                    <Link href="/hub" legacyBehavior><a className="breadcrumb-link">Hub</a></Link>
                    <span className="breadcrumb-sep">/</span>
                  </li>
                  <li className="breadcrumb-item">
                    <Link href="/hub/poker-near-me/lobby" legacyBehavior><a className="breadcrumb-link">Poker Near Me</a></Link>
                    <span className="breadcrumb-sep">/</span>
                  </li>
                  <li className="breadcrumb-item breadcrumb-current">
                    {venue.name}
                  </li>
                </ol>
              </nav>
            )}

            {/* Header Section */}
            <header className="venue-header">
              <div className="venue-header-top">
                <div className="venue-name-group" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Venue Logo */}
                  {(() => {
                    var logoUrl = venue.profile_photo_url || venue.cover_photo_url || (venue.website ? (function() { try { var d = venue.website; if (!d.startsWith('http')) d = 'https://' + d; return 'https://www.google.com/s2/favicons?domain=' + new URL(d).hostname + '&sz=64'; } catch(e) { return null; } })() : null);
                    var initials = (venue.name || '?').split(/[\s\-]+/).filter(function(w) { return w.length > 0; }).map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
                    var colorIdx = (venue.id || 0) % 12;
                    var palette = [
                      { bg: 'rgba(212,168,83,0.25)', border: 'rgba(212,168,83,0.5)', text: '#d4a853' },
                      { bg: 'rgba(0,212,255,0.2)', border: 'rgba(0,212,255,0.5)', text: '#00d4ff' },
                      { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)', text: '#ef4444' },
                      { bg: 'rgba(34,197,94,0.2)', border: 'rgba(34,197,94,0.5)', text: '#22c55e' },
                      { bg: 'rgba(139,92,246,0.2)', border: 'rgba(139,92,246,0.5)', text: '#8b5cf6' },
                      { bg: 'rgba(59,130,246,0.2)', border: 'rgba(59,130,246,0.5)', text: '#3b82f6' },
                      { bg: 'rgba(236,72,153,0.2)', border: 'rgba(236,72,153,0.5)', text: '#ec4899' },
                      { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.5)', text: '#f59e0b' },
                      { bg: 'rgba(20,184,166,0.2)', border: 'rgba(20,184,166,0.5)', text: '#14b8a6' },
                      { bg: 'rgba(249,115,22,0.2)', border: 'rgba(249,115,22,0.5)', text: '#f97316' },
                      { bg: 'rgba(168,85,247,0.2)', border: 'rgba(168,85,247,0.5)', text: '#a855f7' },
                      { bg: 'rgba(6,182,212,0.2)', border: 'rgba(6,182,212,0.5)', text: '#06b6d4' },
                    ];
                    var colors = palette[colorIdx];
                    if (logoUrl) {
                      return <img src={logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(110,231,239,0.15)', background: '#0a1628' }} onError={function(e) { e.target.style.display = 'none'; }} />;
                    }
                    return <div style={{ width: 56, height: 56, borderRadius: 12, background: colors.bg, border: '2px solid ' + colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: colors.text, flexShrink: 0 }}>{initials}</div>;
                  })()}
                  <div>
                  <h1 className="venue-name">{venue.name}</h1>
                  <div className="venue-meta">
                    <VenueTypeBadge type={venue.venue_type} />
                    {venue.is_featured && (
                      <span className="featured-badge">Featured</span>
                    )}
                    {claimStatus === 'approved' && (
                      <span className="verified-inline-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Verified
                      </span>
                    )}
                  </div>
                  </div>
                </div>
              </div>
              <div className="venue-location">
                {venue.city && venue.state && (
                  <span className="location-text">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {venue.city}, {venue.state}
                  </span>
                )}
              </div>
              <div className="venue-trust">
                <span className="trust-text">Player Rating</span>
                <PlayerRatingDisplay avgRating={avgRating} totalReviews={totalReviews} trustScore={venue.trust_score} />
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  className={'action-btn save-btn' + (isSaved ? ' saved' : '')}
                  onClick={handleSaveVenue}
                  style={isSaved ? { borderColor: 'rgba(239, 68, 68, 0.5)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' } : {}}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? '#ef4444' : 'none'} stroke={isSaved ? '#ef4444' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {isSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  className={'action-btn follow-btn' + (isFollowed ? ' followed' : '')}
                  onClick={handleFollow}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isFollowed ? '#00D4FF' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" fill={isFollowed ? '#00D4FF' : 'none'} />
                    {!isFollowed && (
                      <>
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </>
                    )}
                  </svg>
                  {isFollowed ? 'Following' : 'Follow'}
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                </button>
                {venue.venue_type === 'home_game' && venue.owner_id && (getAuthUser()?.id !== venue.owner_id) && (
                  <>
                    <button
                      className="action-btn"
                      onClick={handleAddFriend}
                      disabled={friendBusy || friendState !== 'none'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                      {friendBusy ? '...' : friendState === 'friends' ? 'Friends' : friendState === 'pending' ? 'Request Sent' : 'Add Friend'}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => router.push(`/hub/messages?user=${venue.owner_id}`)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Message Host
                    </button>
                  </>
                )}
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
                {socialPageSlug && (
                  <button className="action-btn social-page-btn" onClick={function () { router.push('/hub/social-pages/' + socialPageSlug); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Social Page
                  </button>
                )}
              </div>
            </header>

            {/* ============================================ */}
            {/* BRAVO LIVE GAMES BANNER (top of page)        */}
            {/* ============================================ */}
            {bravoLiveTables && bravoLiveTables.games && bravoLiveTables.games.length > 0 && (function () {
              var runningGames = bravoLiveTables.games.filter(function (g) { return (g.tables_running || 0) > 0; });
              var waitlistOnly = bravoLiveTables.games.filter(function (g) { return (g.tables_running || 0) === 0 && (g.players_waiting || 0) > 0; });
              var totalTablesRunning = runningGames.reduce(function (sum, g) { return sum + (g.tables_running || 0); }, 0);
              if (runningGames.length === 0 && waitlistOnly.length === 0) return null;
              return (
              <section className="bravo-live-banner">
                <div className="bravo-live-header">
                  <div className="bravo-live-title-row">
                    <span className="bravo-live-pulse" />
                    <h2 className="bravo-live-title">Live Games Right Now</h2>
                    <span className="bravo-live-count">
                      {totalTablesRunning} {totalTablesRunning === 1 ? 'Table' : 'Tables'} Running
                    </span>
                  </div>
                  {bravoLiveTables.last_updated && (
                    <span className="bravo-live-updated">
                      Updated {timeAgo(bravoLiveTables.last_updated)}
                    </span>
                  )}
                </div>
                <div className="bravo-live-games-grid">
                  {runningGames.map(function (g, idx) {
                    var totalTables = g.tables_running || 0;
                    var waiting = g.players_waiting || 0;
                    return (
                      <div key={idx} className="bravo-live-game-card">
                        <div className="bravo-game-name">{g.game}</div>
                        <div className="bravo-game-stats">
                          <span className="bravo-game-tables">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                            </svg>
                            {totalTables} {totalTables === 1 ? 'Table' : 'Tables'}
                          </span>
                          {waiting > 0 && (
                            <span className="bravo-game-waiting">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {waiting} Waiting
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {waitlistOnly.length > 0 && (
                  <div style={{ padding: '8px 16px 4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,158,11,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Waitlist Only</div>
                    <div className="bravo-live-games-grid">
                      {waitlistOnly.map(function (g, idx) {
                        return (
                          <div key={'wl-' + idx} className="bravo-live-game-card" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
                            <div className="bravo-game-name">{g.game}</div>
                            <div className="bravo-game-stats">
                              <span className="bravo-game-waiting">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {g.players_waiting} Waiting
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="bravo-live-footer">
                  <span className="bravo-live-source">Data From {(bravoLiveTables.games || []).some(function(g) { return g.source === 'bravo'; }) ? 'Bravo Poker Live' : 'Smarter.Poker Intelligence'}</span>
                  <button
                    className="bravo-live-scroll-btn"
                    onClick={function () {
                      var el = document.querySelector('.live-games-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    View Full Details
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </section>
              );
            })()}

            {/* Loading state for Bravo data */}
            {bravoLiveLoading && (
              <div className="bravo-live-loading">
                <div className="bravo-loading-pulse" />
                <span>Checking For Live Games...</span>
              </div>
            )}

            {/* Contact & Info Section */}
            <section className="info-section">
              <h2 className="section-title">Contact &amp; Info</h2>
              <div className="info-grid">
                {/* Address */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Address</span>
                    {venue.address ? (
                      <a href="#" onClick={function(e) { e.preventDefault(); e.stopPropagation(); openNativeMaps('search'); }} className="info-value info-link">
                        {venue.address}
                        {venue.city && (', ' + venue.city)}
                        {venue.state && (', ' + venue.state)}
                      </a>
                    ) : (
                      <span className="info-value">
                        {venue.city && venue.state ? venue.city + ', ' + venue.state : 'Not available'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Phone</span>
                    {venue.phone ? (
                      <a href={'tel:' + venue.phone} className="info-value info-link">{venue.phone}</a>
                    ) : (
                      <span className="info-value muted">Not Available</span>
                    )}
                  </div>
                </div>

                {/* Website */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <span className="info-value muted">Not Available</span>
                    )}
                  </div>
                </div>

                {/* Hours */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Hours</span>
                    <span className="info-value">{venue.hours || 'Not listed'}</span>
                  </div>
                </div>

                {/* External Listing */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">External Listing</span>
                    {venue.poker_atlas_url ? (
                      <a href={venue.poker_atlas_url} target="_blank" rel="noopener noreferrer" className="info-value info-link">
                        View Details
                      </a>
                    ) : (
                      <span className="info-value muted">Not Listed</span>
                    )}
                  </div>
                </div>

                {/* Has Tournaments */}
                <div className="info-card">
                  <div className="info-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                      <path d="M4 22h16" />
                      <path d="M10 22V2h4v20" />
                      <path d="M8 9h8" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Tournaments</span>
                    <span className={'info-value' + (venue.has_tournaments ? ' has-yes' : ' muted')}>
                      {venue.has_tournaments ? 'Yes - Tournaments Available' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* ============================================ */}
            {/* UPCOMING TOURNAMENT SCHEDULE               */}
            {/* ============================================ */}
            {tournamentSchedule && tournamentSchedule.length > 0 && (
              <section className="cash-game-schedule-section">
                <div className="section-header-row">
                  <h2 className="section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                      <path d="M4 22h16" />
                      <path d="M10 22V2h4v20" />
                      <path d="M8 9h8" />
                    </svg>
                    Upcoming Tournaments
                  </h2>
                </div>
                <div className="tournament-schedule-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {tournamentSchedule.map((t, idx) => (
                    <div key={t.id || idx} style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ color: '#00D4FF', fontWeight: '800', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {t.day_of_week} • {t.start_time}
                          </span>
                          <h4 style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                            {t.tournament_name || 'No Limit Hold\'em Tournament'}
                          </h4>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>
                            ${t.buy_in}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                        {t.guaranteed && <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{formatMoney(t.guaranteed)} GTD</span>}
                        {t.game_type && <span>{t.game_type}</span>}
                        {t.starting_stack && <span>Stack: {t.starting_stack.toLocaleString()}</span>}
                        {t.blind_levels && <span>Levels: {t.blind_levels}m</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* CASH GAME SCHEDULE SECTION                  */}
            {/* ============================================ */}
            {(gameSchedule || claimStatus === 'approved') && (
              <section className="cash-game-schedule-section">
                <div className="section-header-row">
                  <h2 className="section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Cash Game Schedule
                  </h2>
                  {claimStatus === 'approved' && (
                    <button
                      className="section-action-btn"
                      onClick={function () { setShowScheduleEditor(!showScheduleEditor); }}
                    >
                      {showScheduleEditor ? 'Done Editing' : 'Manage Schedule'}
                    </button>
                  )}
                </div>

                {/* Schedule Display (Read-Only) */}
                {gameSchedule && (
                  <div className="game-schedule-grid">
                    {SCHEDULE_DAYS.map(function (day) {
                      var entries = gameSchedule[day] || [];
                      if (entries.length === 0 && !showScheduleEditor) return null;
                      var isToday = day === todayScheduleKey;
                      return (
                        <div key={day} className={'game-schedule-day' + (isToday ? ' today' : '') + (entries.length === 0 ? ' empty' : '')}>
                          <div className="game-schedule-day-header">
                            <h3 className="game-schedule-day-name">{SCHEDULE_DAY_LABELS[day]}</h3>
                            {isToday && <span className="today-badge">Today</span>}
                            {entries.length > 0 && <span className="game-schedule-day-count">{entries.length} game{entries.length !== 1 ? 's' : ''}</span>}
                          </div>
                          {entries.length > 0 ? (
                            <div className="game-schedule-entries">
                              {entries.map(function (entry) {
                                return (
                                  <div key={entry.id} className="game-schedule-entry">
                                    <div className="game-schedule-entry-main">
                                      <span className="game-schedule-game-name">{entry.game_name}</span>
                                      {(entry.start_time || entry.end_time) && (
                                        <span className="game-schedule-time">
                                          {entry.start_time}{entry.start_time && entry.end_time ? ' - ' : ''}{entry.end_time}
                                        </span>
                                      )}
                                    </div>
                                    {entry.notes && <span className="game-schedule-notes">{entry.notes}</span>}
                                    {showScheduleEditor && claimStatus === 'approved' && (
                                      <button
                                        className="game-schedule-delete-btn"
                                        onClick={function () { handleDeleteScheduleEntry(entry.id); }}
                                        disabled={scheduleDeleting === entry.id}
                                      >
                                        {scheduleDeleting === entry.id ? '...' : 'Remove'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="game-schedule-no-games">No games scheduled</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No schedule yet — empty state */}
                {!gameSchedule && !showScheduleEditor && (
                  <div className="game-schedule-empty">
                    <p>No Cash Game Schedule Has Been Set For This Venue Yet.</p>
                    {claimStatus === 'approved' && (
                      <button className="section-action-btn" onClick={function () { setShowScheduleEditor(true); }}>
                        Add Your First Game
                      </button>
                    )}
                  </div>
                )}

                {/* Schedule Editor (for claimed venue owners) */}
                {showScheduleEditor && claimStatus === 'approved' && (
                  <form className="game-schedule-editor" onSubmit={handleAddScheduleEntry}>
                    <h4 className="editor-subtitle">Add Game To Schedule</h4>
                    <div className="editor-row">
                      <div className="form-group">
                        <label className="form-label">Day</label>
                        <select
                          className="form-select"
                          value={scheduleForm.day_of_week}
                          onChange={function (e) { setScheduleForm(function (prev) { return Object.assign({}, prev, { day_of_week: e.target.value }); }); }}
                        >
                          {SCHEDULE_DAYS.map(function (d) { return <option key={d} value={d}>{SCHEDULE_DAY_LABELS[d]}</option>; })}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label className="form-label">Game</label>
                        <input
                          type="text"
                          className="form-input"
                          value={scheduleForm.game_name}
                          onChange={function (e) { setScheduleForm(function (prev) { return Object.assign({}, prev, { game_name: e.target.value }); }); }}
                          placeholder="e.g. 1/2 NLH, 2/5 PLO, 5/10 Mixed"
                          required
                        />
                      </div>
                    </div>
                    <div className="editor-row">
                      <div className="form-group">
                        <label className="form-label">Start Time</label>
                        <input
                          type="text"
                          className="form-input"
                          value={scheduleForm.start_time}
                          onChange={function (e) { setScheduleForm(function (prev) { return Object.assign({}, prev, { start_time: e.target.value }); }); }}
                          placeholder="e.g. 10:00 AM"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">End Time</label>
                        <input
                          type="text"
                          className="form-input"
                          value={scheduleForm.end_time}
                          onChange={function (e) { setScheduleForm(function (prev) { return Object.assign({}, prev, { end_time: e.target.value }); }); }}
                          placeholder="e.g. Close"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label className="form-label">Notes</label>
                        <input
                          type="text"
                          className="form-input"
                          value={scheduleForm.notes}
                          onChange={function (e) { setScheduleForm(function (prev) { return Object.assign({}, prev, { notes: e.target.value }); }); }}
                          placeholder="e.g. Must-move, runs if 6+ interested"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="schedule-add-btn"
                      disabled={scheduleSaving || !scheduleForm.game_name.trim()}
                    >
                      {scheduleSaving ? 'Adding...' : 'Add To Schedule'}
                    </button>
                  </form>
                )}
              </section>
            )}

            {/* ============================================ */}
            {/* MAP & DIRECTIONS SECTION                     */}
            {/* ============================================ */}
            {venue.latitude && venue.longitude && (
              <section className="map-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Location
                </h2>
                <div className="venue-map-wrapper">
                  <div ref={mapContainerRef} className="venue-map-container" />
                </div>
                <div className="map-actions">
                  <button
                    onClick={function(e) { e.preventDefault(); e.stopPropagation(); openNativeMaps('directions'); }}
                    className="directions-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Get Directions
                  </button>
                  <button
                    onClick={function(e) { e.preventDefault(); e.stopPropagation(); openNativeMaps('search'); }}
                    className="viewmap-btn"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    View on Map
                  </button>
                  {venue.address && (
                    <span className="map-address-text">
                      {venue.address}{venue.city ? ', ' + venue.city : ''}{venue.state ? ', ' + venue.state : ''}
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* BEST TIME TO GO WIDGET                      */}
            {/* ============================================ */}
            <BestTimeToGoWidget venueId={id} venueName={venue.name} />

            {/* Daily Tournaments Section */}
            {groupedSchedules && Object.keys(groupedSchedules || {}).length > 0 && (
              <section id="tournaments-section" className="tournaments-section">
                <h2 className="section-title">Daily Tournament Schedule</h2>
                <div className="schedule-container">
                  {Object.entries(groupedSchedules || {}).map(function ([day, schedules]) {
                    var isToday = day === todayName;
                    return (
                      <div key={day} className={'day-group' + (isToday ? ' today' : '')}>
                        <div className="day-header">
                          <h3 className="day-name">{day}</h3>
                          {isToday && <span className="today-badge">Today</span>}
                        </div>
                        <div className="schedule-cards">
                          {schedules.map(function (s, idx) {
                            return (
                              <div key={idx} className="schedule-card">
                                <div className="schedule-row">
                                  <div className="schedule-time">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
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
                                    <span className="detail-chip game-type">{formatGameType(s.game_type)}</span>
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
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* No tournaments fallback */}
            {(!groupedSchedules || Object.keys(groupedSchedules || {}).length === 0) && venue.has_tournaments && (
              <section id="tournaments-section" className="tournaments-section">
                <h2 className="section-title">Daily Tournament Schedule</h2>
                <div className="empty-tournaments">
                  <p>Tournament Schedule Data Is Being Collected For This Venue.</p>
                  {venue.poker_atlas_url && (
                    <a href={venue.poker_atlas_url} target="_blank" rel="noopener noreferrer" className="pa-link">
                      Check venue website for current schedule
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Last Scraped Badge */}
            {venue.last_scraped && (
              <div className="last-scraped-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Data Last Updated: {new Date(venue.last_scraped).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}

            {/* Venue News & Updates Section */}
            {venue.venue_news && venue.venue_news.length > 0 && (
              <section className="venue-news-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                    <path d="M18 14h-8" />
                    <path d="M15 18h-5" />
                    <path d="M10 6h8v4h-8V6Z" />
                  </svg>
                  News &amp; Updates
                  <span className="live-count-badge" style={{ background: 'rgba(0, 212, 255, 0.12)', color: '#00D4FF', borderColor: '#00D4FF40' }}>{venue.venue_news.length}</span>
                </h2>
                <div className="venue-news-grid">
                  {venue.venue_news.map(function (article, idx) {
                    return (
                      <div key={article.id || idx} className="venue-news-card">
                        {article.image_url && (
                          <div className="news-card-image" style={{ backgroundImage: 'url(' + article.image_url + ')' }} />
                        )}
                        <div className="news-card-content">
                          <h3 className="news-card-title">{article.title}</h3>
                          {article.content && (
                            <p className="news-card-excerpt">{article.content.length > 150 ? article.content.substring(0, 150) + '...' : article.content}</p>
                          )}
                          <div className="news-card-footer">
                            {article.published_at && (
                              <span className="news-card-date">
                                {new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                            {article.source_url && (
                              <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="news-card-source">
                                Source
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* WAITLIST BOARD SECTION (column layout)       */}
            {/* ============================================ */}
            {waitlistData.length > 0 && (
              <section className="waitlist-board-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {venue && venue.name ? venue.name + ' Waiting List' : 'Club Commander Waiting List'}
                  <span className="live-count-badge" style={{ background: 'rgba(76, 175, 80, 0.15)', color: '#4CAF50', borderColor: '#4CAF5040' }}>LIVE</span>
                </h2>

                <div className="waitlist-board">
                  {waitlistData.map(function (wl, colIdx) {
                    var tabColors = ['#ffffff', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];
                    var tabColor = tabColors[colIdx % tabColors.length];
                    var gameLabel = (wl.stakes || '') + ' ' + formatGameType(wl.game_type);

                    return (
                      <div key={gameLabel + '-' + colIdx} className="waitlist-column">
                        <div className="waitlist-column-header" style={{ background: tabColor }}>
                          <span className="waitlist-column-title">{gameLabel.trim()}</span>
                        </div>
                        <div className="waitlist-column-body">
                          {(wl.players || []).slice(0, 15).map(function (player, idx) {
                            return (
                              <div key={player.id || idx}
                                className={'waitlist-player-row' + (player.status === 'called' ? ' called' : '')}>
                                <span className="waitlist-player-name">{(player.player_name || 'Player').toUpperCase()}</span>
                              </div>
                            );
                          })}
                          {(wl.players || []).length > 15 && (
                            <div className="waitlist-overflow">+{wl.players.length - 15} more</div>
                          )}
                        </div>
                        <div className="waitlist-column-footer">
                          Total Count: {wl.count || (wl.players || []).length}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="waitlist-join-link">
                  <a href={'/hub/commander/waitlist/' + id} className="waitlist-join-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    Join The Waitlist
                  </a>
                  <p className="waitlist-powered-by">Powered by Club Commander</p>
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* LIVE GAMES SECTION                           */}
            {/* ============================================ */}
            <section className="live-games-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Live Games
                  {liveGames.length > 0 && (
                    <span className="live-count-badge">{liveGames.length} active</span>
                  )}
                </h2>
                <button
                  className="section-action-btn"
                  onClick={function () { setShowReportGame(!showReportGame); }}
                >
                  {showReportGame ? 'Cancel' : 'Report a Game'}
                </button>
              </div>

              {/* Report Game Form */}
              {showReportGame && (
                <form className="inline-form" onSubmit={handleReportGame}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Game Type</label>
                      <select
                        className="form-select"
                        value={reportForm.game_type}
                        onChange={function (e) { setReportForm(Object.assign({}, reportForm, { game_type: e.target.value })); }}
                      >
                        <option value="NL Holdem">NL Hold&apos;em</option>
                        <option value="PLO">PLO</option>
                        <option value="PLO8">PLO8</option>
                        <option value="Mixed">Mixed</option>
                        <option value="Stud">Stud</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Stakes *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 1/2, 2/5"
                        value={reportForm.stakes}
                        onChange={function (e) { setReportForm(Object.assign({}, reportForm, { stakes: e.target.value })); }}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Tables</label>
                      <input
                        type="number"
                        className="form-input"
                        min="1"
                        max="99"
                        value={reportForm.table_count}
                        onChange={function (e) { setReportForm(Object.assign({}, reportForm, { table_count: e.target.value })); }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Wait (mins)</label>
                      <input
                        type="number"
                        className="form-input"
                        min="0"
                        placeholder="Optional"
                        value={reportForm.wait_time}
                        onChange={function (e) { setReportForm(Object.assign({}, reportForm, { wait_time: e.target.value })); }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Optional Notes..."
                      value={reportForm.notes}
                      onChange={function (e) { setReportForm(Object.assign({}, reportForm, { notes: e.target.value })); }}
                    />
                  </div>
                  <button type="submit" className="form-submit-btn" disabled={reportSubmitting || !reportForm.stakes.trim()}>
                    {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </form>
              )}

              {/* Live Games List */}
              {liveGames.length > 0 ? (
                <div className="live-games-grid">
                  {liveGames.map(function (game, idx) {
                    return (
                      <div key={game.id || idx} className="live-game-card">
                        <div className="live-game-header">
                          <span className="live-game-type">{formatGameType(game.game_type)}</span>
                          <span className="live-game-stakes">{game.stakes}</span>
                        </div>
                        <div className="live-game-details">
                          {game.table_count && (
                            <span className="live-game-detail">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              </svg>
                              {game.table_count} {game.table_count === 1 ? 'table' : 'tables'}
                            </span>
                          )}
                          {(game.wait_time !== null && game.wait_time !== undefined) && (
                            <span className="live-game-detail" style={{ color: getWaitTimeColor(game.wait_time) }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {game.wait_time} mins
                            </span>
                          )}
                        </div>
                        {game.notes && (
                          <p className="live-game-notes">{game.notes}</p>
                        )}
                        {game.created_at && (
                          <span className="live-game-time">reported {timeAgo(game.created_at)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-section-card">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <p>No Live Game Reports. Be The First To Report What&apos;s Running!</p>
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* CHECK-INS SECTION                            */}
            {/* ============================================ */}
            <section id="checkins-section" className="checkins-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Check-Ins
                  {checkinCount > 0 && (
                    <span className="checkin-count-text">{checkinCount} {checkinCount === 1 ? 'person' : 'people'} checked in today</span>
                  )}
                </h2>
                {!hasCheckedIn ? (
                  <button
                    className="section-action-btn checkin-btn"
                    onClick={function () { setShowCheckinForm(!showCheckinForm); }}
                  >
                    {showCheckinForm ? 'Cancel' : 'Check In'}
                  </button>
                ) : (
                  <span className="checked-in-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Checked In
                  </span>
                )}
              </div>

              {/* Who's Here Indicator */}
              {whosHere.total > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)',
                  borderRadius: 10, marginBottom: 12
                }}>
                  <div style={{ display: 'flex' }}>
                    {whosHere.people.slice(0, 4).map(function(p, i) {
                      return (
                        <div key={p.user_id || i} style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: p.avatar_url ? 'transparent' : 'rgba(0,212,255,0.2)',
                          border: whosHere.friends.some(function(f) { return f.user_id === p.user_id; }) ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginLeft: i > 0 ? -8 : 0, overflow: 'hidden', fontSize: 12, fontWeight: 700,
                          color: '#00D4FF', zIndex: 4 - i, position: 'relative'
                        }}>
                          {p.avatar_url
                            ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (p.full_name || p.user_name || 'A').charAt(0).toUpperCase()
                          }
                        </div>
                      );
                    })}
                    {whosHere.total > 4 && (
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,212,255,0.15)',
                        border: '2px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', marginLeft: -8, fontSize: 10, fontWeight: 700, color: '#00D4FF'
                      }}>+{whosHere.total - 4}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: '#c8d6e5' }}>
                    <strong style={{ color: '#00D4FF' }}>{whosHere.total}</strong> {whosHere.total === 1 ? 'person' : 'people'} here now
                    {whosHere.friends.length > 0 && (
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>
                        {' '}· {whosHere.friends.length} {whosHere.friends.length === 1 ? 'friend' : 'friends'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Check-in Confirmation */}
              {checkinConfirm && (
                <div className="checkin-confirm-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Checked in! Others can see you&apos;re here.
                  </div>
                  <button
                    onClick={function() { router.push('/hub/social-media?checkin_venue=' + encodeURIComponent(venue?.name || '') + '&checkin_id=' + id); }}
                    style={{
                      background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                      borderRadius: 6, padding: '4px 10px', color: '#00D4FF',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    Share to Feed
                  </button>
                </div>
              )}

              {/* Check-in Form */}
              {showCheckinForm && !hasCheckedIn && (
                <form className="inline-form" onSubmit={handleCheckin}>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Your Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Display Name..."
                        value={checkinName}
                        onChange={function (e) { setCheckinName(e.target.value); }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message (optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="What Are You Playing? Looking For A Game?"
                      value={checkinMessage}
                      onChange={function (e) { setCheckinMessage(e.target.value); }}
                    />
                  </div>
                  <button type="submit" className="form-submit-btn" disabled={checkinSubmitting}>
                    {checkinSubmitting ? 'Checking in...' : 'Check In'}
                  </button>
                </form>
              )}

              {/* Check-in List */}
              {checkins.length > 0 ? (
                <div className="checkins-list">
                  {checkins.map(function (ci, idx) {
                    return (
                      <div key={ci.id || idx} className="checkin-item">
                        <div className="checkin-avatar">
                          {(ci.user_name || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div className="checkin-info">
                          <span className="checkin-name">{ci.user_name || 'Anonymous'}</span>
                          {ci.message && <span className="checkin-msg">{ci.message}</span>}
                        </div>
                        <span className="checkin-time">{timeAgo(ci.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : !showCheckinForm && (
                <div className="empty-section-card">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <p>No Check-Ins Yet Today. Be The First To Check In!</p>
                </div>
              )}

              {/* Check-In Error Toast */}
              {checkinError && (
                <div style={{
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8, padding: '10px 14px', marginTop: 12,
                  color: '#ef4444', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {checkinError}
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* VENUE LEADERBOARD                           */}
            {/* ============================================ */}
            {venueLeaderboard.length > 0 && (
              <section style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                  Top Check-In Players
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {venueLeaderboard.map(function (leader, idx) {
                    var medal = idx === 0 ? '#ffffff' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'rgba(255,255,255,0.2)';
                    return (
                      <div key={leader.user_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, background: idx < 3 ? 'rgba(245,158,11,0.06)' : 'transparent',
                        border: idx < 3 ? '1px solid rgba(245,158,11,0.15)' : '1px solid rgba(255,255,255,0.05)'
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: medal,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 800, color: idx < 3 ? '#000' : '#fff', flexShrink: 0
                        }}>{idx + 1}</div>
                        {leader.avatar_url ? (
                          <img src={leader.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                            {(leader.full_name || leader.user_name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {leader.full_name || leader.user_name}
                          </div>
                          {leader.username && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>@{leader.username}</div>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{leader.count}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* 7-DAY ACTIVITY CHART                        */}
            {/* ============================================ */}
            {venueActivity.days.length > 0 && venueActivity.days.some(function(d) { return d.count > 0; }) && (
              <section style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                  7-Day Check-In Activity
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                  {venueActivity.days.map(function (d) {
                    var pct = venueActivity.maxCount > 0 ? (d.count / venueActivity.maxCount) * 100 : 0;
                    return (
                      <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{d.count || ''}</span>
                        <div style={{
                          width: '100%', minHeight: 4, height: Math.max(4, pct * 0.7) + 'px',
                          borderRadius: 3, background: d.count > 0 ? 'linear-gradient(180deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.05)',
                          transition: 'height 0.3s ease'
                        }} />
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{d.dayName}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* POPULAR HOURS (REPLACED WITH PeakHoursHeatmap) */}
            {/* ============================================ */}
            <section style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16, position: 'relative' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Popular Times Heatmap
              </h3>
              
              {!isVip ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ filter: 'blur(8px)', opacity: 0.5, pointerEvents: 'none' }}>
                    <PeakHoursHeatmap venueId={id} />
                  </div>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10
                  }}>
                    <span style={{ fontSize: 32, marginBottom: 8 }}>🔒</span>
                    <h4 style={{ color: '#fff', margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>VIP Feature</h4>
                    <p style={{ color: '#a0aec0', fontSize: 13, marginBottom: 16, textAlign: 'center', maxWidth: 220 }}>
                      Upgrade to view peak hour predictions and avoid long wait lists.
                    </p>
                    <button
                      onClick={() => guardAction(() => {})}
                      style={{
                        background: 'linear-gradient(90deg, #d4a853, #b8860b)',
                        color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px',
                        fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px rgba(212, 168, 83, 0.4)'
                      }}
                    >
                      Unlock Peak Analytics
                    </button>
                    {UpgradePopup}
                  </div>
                </div>
              ) : (
                <PeakHoursHeatmap venueId={id} />
              )}
            </section>

            {/* ============================================ */}
            {/* REVIEWS & RATINGS SECTION (REPLACED WITH VenueReviews) */}
            {/* ============================================ */}
            <section id="reviews-section" className="reviews-section">
              <VenueReviews venueId={id} venueName={venue?.name} />
            </section>

            {/* ============================================ */}
            {/* ACTIVITY FEED SECTION                        */}
            {/* ============================================ */}
            <section className="activity-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Activity Feed
                </h2>
                <button
                  className="section-action-btn"
                  onClick={function () { setShowPostForm(!showPostForm); }}
                >
                  {showPostForm ? 'Cancel' : 'Post Update'}
                </button>
              </div>

              {/* Post Form */}
              {showPostForm && (
                <form className="inline-form" onSubmit={handlePostActivity}>
                  <div className="form-group">
                    <label className="form-label">What&apos;s Happening?</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      placeholder="Share An Update About This Venue..."
                      value={postContent}
                      onChange={function (e) { setPostContent(e.target.value); }}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="form-submit-btn"
                    disabled={postSubmitting || !postContent.trim()}
                  >
                    {postSubmitting ? 'Posting...' : 'Post'}
                  </button>
                </form>
              )}

              {/* Activity List */}
              {activities.length > 0 ? (
                <div className="activity-list">
                  {activities.map(function (activity, idx) {
                    var typeStyle = getActivityTypeStyle(activity.activity_type);
                    return (
                      <div key={activity.id || idx} className="activity-card">
                        <div className="activity-header">
                          <span
                            className="activity-type-badge"
                            style={{
                              background: typeStyle.bg,
                              borderColor: typeStyle.border,
                              color: typeStyle.color,
                            }}
                          >
                            {activity.activity_type || 'update'}
                          </span>
                          <span className="activity-time">{timeAgo(activity.created_at)}</span>
                        </div>
                        <p className="activity-content">{activity.content}</p>
                        {activity.likes_count > 0 && (
                          <span className="activity-likes">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                            {activity.likes_count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !showPostForm && (
                <div className="empty-section-card">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <p>No Updates Yet. Follow This Venue For The Latest News!</p>
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* PROMOTIONS SECTION                            */}
            {/* ============================================ */}
            {promotions.length > 0 && (
              <section className="promotions-section">
                <div className="section-header-row">
                  <h2 className="section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                    Promotions
                  </h2>
                  <Link href="/hub/promotions" legacyBehavior>
                    <a className="section-action-btn">View All</a>
                  </Link>
                </div>
                <div className="promotions-list">
                  {promotions.map(function (promo) {
                    return (
                      <div key={promo.id} className="promo-card">
                        <div className="promo-header">
                          <span className="promo-badge">Promotion</span>
                          <span className="promo-time">{timeAgo(promo.created_at)}</span>
                        </div>
                        {promo.title && <h3 className="promo-title">{promo.title}</h3>}
                        <p className="promo-content">{promo.content}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* RELATED TOURS & SERIES SECTION                */}
            {/* ============================================ */}
            {relatedSeries.length > 0 && (
              <section className="related-series-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                    <path d="M4 22h16" />
                    <path d="M10 22V2h4v20" />
                    <path d="M8 9h8" />
                  </svg>
                  Tournament Series at This Venue
                </h2>
                <div className="related-series-list">
                  {relatedSeries.map(function (s) {
                    return (
                      <Link key={s.id} href={'/hub/series/' + s.id} legacyBehavior>
                        <a className="related-series-card">
                          <div className="related-series-info">
                            <span className="related-series-tour">{s.tour || 'Tour'}</span>
                            <span className="related-series-name">{s.name}</span>
                            <span className="related-series-dates">{formatDateRange(s.start_date, s.end_date)}</span>
                          </div>
                          <div className="related-series-meta">
                            {s.total_events && <span className="related-series-events">{s.total_events} events</span>}
                            {s.main_event_buyin && <span className="related-series-buyin">ME: {formatMoney(s.main_event_buyin)}</span>}
                          </div>
                          <svg className="related-series-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </a>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* NEARBY VENUES SECTION                         */}
            {/* ============================================ */}
            {nearbyVenues.length > 0 && (
              <section className="nearby-venues-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Nearby Poker Rooms
                </h2>
                <div className="nearby-venues-grid">
                  {nearbyVenues.map(function (nv) {
                    return (
                      <Link key={nv.id} href={'/hub/venues/' + nv.id} legacyBehavior>
                        <a className="nearby-venue-card">
                          <div className="nearby-venue-info">
                            <span className="nearby-venue-name">{nv.name}</span>
                            <span className="nearby-venue-location">
                              {nv.city}{nv.state ? ', ' + nv.state : ''}
                            </span>
                            {nv.venue_type && (
                              <span className="nearby-venue-type">{VENUE_TYPE_LABELS[nv.venue_type] || nv.venue_type}</span>
                            )}
                          </div>
                          {nv.distance_km != null && (
                            <span className="nearby-venue-distance">
                              {nv.distance_km < 1.6
                                ? (nv.distance_km * 0.621371).toFixed(1) + ' mi'
                                : Math.round(nv.distance_km * 0.621371) + ' mi'}
                            </span>
                          )}
                          <svg className="nearby-venue-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </a>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================ */}
            {/* CLAIM THIS PAGE SECTION                      */}
            {/* ============================================ */}
            <section className="claim-section">
              {claimStatus === 'approved' ? (
                <div className="claim-verified-card">
                  <div className="claim-verified-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div className="claim-verified-text">
                    <span className="claim-verified-title">Verified Page</span>
                    <span className="claim-verified-desc">This Venue Page Is Managed By Verified Staff.</span>
                  </div>
                </div>
              ) : claimStatus === 'pending' ? (
                <div className="claim-pending-card">
                  <div className="claim-pending-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="claim-pending-text">
                    <span className="claim-pending-title">Claim Pending Review</span>
                    <span className="claim-pending-desc">Your Claim For This Page Is Being Reviewed. We&apos;ll Be In Touch Soon.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="claim-cta-card">
                    <div className="claim-cta-content">
                      <h3 className="claim-cta-title">Own Or Manage This Venue?</h3>
                      <p className="claim-cta-desc">
                        Claim this page to update info, respond to reviews, and post updates.
                      </p>
                      {!showClaimForm && (
                        <button
                          className="claim-cta-btn"
                          onClick={function () { setShowClaimForm(true); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          Claim This Page
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Claim Form */}
                  {showClaimForm && (
                    <form className="inline-form claim-form" onSubmit={handleClaimSubmit}>
                      <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Your Name *</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Full Name"
                            value={claimForm.contact_name}
                            onChange={function (e) { setClaimForm(Object.assign({}, claimForm, { contact_name: e.target.value })); }}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Email *</label>
                          <input
                            type="email"
                            className="form-input"
                            placeholder="your@email.com"
                            value={claimForm.contact_email}
                            onChange={function (e) { setClaimForm(Object.assign({}, claimForm, { contact_email: e.target.value })); }}
                            required
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Phone (optional)</label>
                          <input
                            type="tel"
                            className="form-input"
                            placeholder="Phone Number"
                            value={claimForm.contact_phone}
                            onChange={function (e) { setClaimForm(Object.assign({}, claimForm, { contact_phone: e.target.value })); }}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Your Role</label>
                          <select
                            className="form-select"
                            value={claimForm.role}
                            onChange={function (e) { setClaimForm(Object.assign({}, claimForm, { role: e.target.value })); }}
                          >
                            <option value="Owner">Owner</option>
                            <option value="Manager">Manager</option>
                            <option value="Staff">Staff</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Verification Notes</label>
                        <textarea
                          className="form-textarea"
                          rows="3"
                          placeholder="How Can We Verify Your Association With This Venue?"
                          value={claimForm.verification_notes}
                          onChange={function (e) { setClaimForm(Object.assign({}, claimForm, { verification_notes: e.target.value })); }}
                        />
                      </div>
                      <div className="form-actions">
                        <button type="submit" className="form-submit-btn" disabled={claimSubmitting || !claimForm.contact_name.trim() || !claimForm.contact_email.trim()}>
                          {claimSubmitting ? 'Submitting...' : 'Submit Claim'}
                        </button>
                        <button type="button" className="form-cancel-btn" onClick={function () { setShowClaimForm(false); }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      <style>{`
        /* Metal UI Variables */
        :root {
          --metal-dark: #0a0a15;
          --metal-base: #0d1117;
          --metal-mid: #1a2332;
          --metal-highlight: #3d4f5f;
          --neon-cyan: #00D4FF;
          --neon-cyan-glow: rgba(0, 212, 255, 0.6);
          --metal-gradient: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
          --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
        }

        /* ═══ CASH GAME SCHEDULE ═══ */
        .cash-game-schedule-section {
          background: var(--metal-bg, #0d1117);
          border: 1px solid rgba(0, 212, 255, 0.12);
          border-radius: 16px;
          padding: 20px;
          margin: 0 16px 20px;
        }
        .game-schedule-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }
        .game-schedule-day {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 12px 16px;
          transition: all 0.2s;
        }
        .game-schedule-day.today {
          border-color: rgba(0, 212, 255, 0.3);
          background: rgba(0, 212, 255, 0.04);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.06);
        }
        .game-schedule-day.empty {
          opacity: 0.4;
        }
        .game-schedule-day-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .game-schedule-day-name {
          font-size: 14px;
          font-weight: 700;
          color: #e4e8f0;
          margin: 0;
          text-transform: capitalize;
        }
        .game-schedule-day-count {
          font-size: 11px;
          color: rgba(200, 214, 229, 0.5);
          font-weight: 600;
          margin-left: auto;
        }
        .game-schedule-entries {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .game-schedule-entry {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          flex-wrap: wrap;
        }
        .game-schedule-entry-main {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }
        .game-schedule-game-name {
          font-size: 14px;
          font-weight: 700;
          color: #d4a853;
          white-space: nowrap;
        }
        .game-schedule-time {
          font-size: 12px;
          color: rgba(200, 214, 229, 0.6);
          white-space: nowrap;
        }
        .game-schedule-notes {
          font-size: 11px;
          color: rgba(200, 214, 229, 0.45);
          font-style: italic;
        }
        .game-schedule-no-games {
          font-size: 12px;
          color: rgba(200, 214, 229, 0.3);
          font-style: italic;
        }
        .game-schedule-empty {
          text-align: center;
          padding: 24px 16px;
          color: rgba(200, 214, 229, 0.5);
          font-size: 14px;
        }
        .game-schedule-empty p { margin: 0 0 12px; }
        .game-schedule-delete-btn {
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .game-schedule-delete-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
        }
        .game-schedule-editor {
          margin-top: 16px;
          padding: 16px;
          background: rgba(0, 212, 255, 0.04);
          border: 1px solid rgba(0, 212, 255, 0.15);
          border-radius: 12px;
        }
        .editor-subtitle {
          font-size: 14px;
          font-weight: 700;
          color: #00D4FF;
          margin: 0 0 12px;
        }
        .editor-row {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .editor-row .form-group {
          flex: 1;
          min-width: 120px;
        }
        .schedule-add-btn {
          padding: 10px 24px;
          border-radius: 10px;
          border: 1px solid rgba(0, 212, 255, 0.3);
          background: rgba(0, 212, 255, 0.12);
          color: #00D4FF;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
          width: 100%;
        }
        .schedule-add-btn:hover:not(:disabled) {
          background: rgba(0, 212, 255, 0.2);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
        }
        .schedule-add-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .venue-page {
          min-height: 100vh; padding-bottom: 70px;
          background: linear-gradient(180deg, #030712 0%, #0f172a 100%);
          font-family: 'Rajdhani', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
          border: 3px solid rgba(0, 212, 255, 0.2);
          border-top-color: #00D4FF;
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
          background: rgba(0, 212, 255, 0.15);
          border: 1px solid #00D4FF;
          border-radius: 8px;
          color: #00D4FF;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.2s;
        }
        .back-link-btn:hover {
          background: rgba(0, 212, 255, 0.25);
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
          color: #00D4FF;
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
          background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.1));
          border: 1px solid rgba(0, 212, 255, 0.4);
          color: #00D4FF;
        }
        .verified-inline-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
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
          border-color: #00D4FF;
          color: #00D4FF;
          background: rgba(0, 212, 255, 0.08);
        }
        .follow-btn.followed {
          background: rgba(0, 212, 255, 0.12);
          border-color: #00D4FF;
          color: #00D4FF;
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
        .follow-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background: rgba(0, 212, 255, 0.2);
          font-size: 11px;
          font-weight: 700;
          color: #00D4FF;
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

        /* Section Header Row */
        .section-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 0;
        }
        .section-header-row .section-title {
          margin-bottom: 16px;
          flex: 1;
        }
        .section-action-btn {
          flex-shrink: 0;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          color: #00D4FF;
          white-space: nowrap;
          margin-top: 2px;
        }
        .section-action-btn:hover {
          background: rgba(0, 212, 255, 0.2);
          border-color: #00D4FF;
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
          background: rgba(0, 212, 255, 0.08);
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
          color: #00D4FF;
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
          border-color: rgba(0, 212, 255, 0.3);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.05);
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
          background: rgba(0, 212, 255, 0.15);
          border: 1px solid rgba(0, 212, 255, 0.3);
          color: #00D4FF;
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
          color: #00D4FF;
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
          color: #00D4FF;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .pa-link:hover {
          text-decoration: underline;
        }

        /* Last Scraped Badge */
        .last-scraped-badge {
          max-width: 900px;
          margin: 12px auto 0;
          padding: 8px 16px;
          font-size: 12px;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 8px;
          text-align: center;
          font-weight: 500;
        }

        /* Venue News Section */
        .venue-news-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .venue-news-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .venue-news-card {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s, transform 0.2s;
        }
        .venue-news-card:hover {
          border-color: rgba(0, 212, 255, 0.25);
          transform: translateY(-2px);
        }
        .news-card-image {
          width: 100%;
          height: 140px;
          background-size: cover;
          background-position: center;
          background-color: rgba(255, 255, 255, 0.03);
        }
        .news-card-content {
          padding: 16px;
        }
        .news-card-title {
          font-size: 15px;
          font-weight: 600;
          color: #f1f5f9;
          margin: 0 0 8px;
          line-height: 1.35;
        }
        .news-card-excerpt {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0 0 12px;
        }
        .news-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .news-card-date {
          font-size: 12px;
          color: #64748b;
        }
        .news-card-source {
          font-size: 12px;
          color: #00D4FF;
          font-weight: 600;
          text-decoration: none;
        }
        .news-card-source:hover {
          text-decoration: underline;
        }

        /* ========================================= */
        /* SHARED FORM STYLES                        */
        /* ========================================= */
        .inline-form {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(0, 212, 255, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .form-row {
          display: flex;
          gap: 12px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 10px 14px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
          outline: none;
          box-sizing: border-box;
        }
        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          border-color: rgba(0, 212, 255, 0.5);
        }
        .form-input::placeholder,
        .form-textarea::placeholder {
          color: #475569;
        }
        .form-select {
          cursor: pointer;
          appearance: auto;
        }
        .form-textarea {
          resize: vertical;
          min-height: 60px;
        }
        .form-submit-btn {
          align-self: flex-start;
          padding: 10px 24px;
          background: rgba(0, 212, 255, 0.15);
          border: 1px solid #00D4FF;
          border-radius: 8px;
          color: #00D4FF;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .form-submit-btn:hover:not(:disabled) {
          background: rgba(0, 212, 255, 0.25);
        }
        .form-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .form-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .form-cancel-btn {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .form-cancel-btn:hover {
          border-color: rgba(255, 255, 255, 0.25);
          color: #cbd5e1;
        }

        /* ========================================= */
        /* EMPTY SECTION CARD                        */
        /* ========================================= */
        .empty-section-card {
          text-align: center;
          padding: 40px 24px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .empty-section-card p {
          color: #64748b;
          font-size: 14px;
          margin: 0;
          max-width: 360px;
          line-height: 1.5;
        }

        /* ========================================= */
        /* WAITLIST BOARD SECTION (columns)          */
        /* ========================================= */
        .waitlist-board-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .waitlist-board {
          display: flex;
          gap: 0;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(10, 22, 40, 0.8);
        }
        .waitlist-column {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid rgba(255,255,255,0.08);
        }
        .waitlist-column:last-child {
          border-right: none;
        }
        .waitlist-column-header {
          padding: 10px 8px;
          text-align: center;
        }
        .waitlist-column-title {
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        .waitlist-column-body {
          flex: 1;
          padding: 4px 2px;
          min-height: 80px;
        }
        .waitlist-player-row {
          padding: 4px 8px;
          text-align: center;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .waitlist-player-row.called {
          animation: pulse-called 1.2s ease-in-out infinite;
          color: #ffffff;
          font-weight: 700;
        }
        @keyframes pulse-called {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .waitlist-player-name {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .waitlist-overflow {
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          padding: 4px;
        }
        .waitlist-column-footer {
          padding: 8px;
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-top: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }
        .waitlist-join-link {
          text-align: center;
          margin-top: 12px;
        }
        .waitlist-join-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, #4CAF50, #388E3C);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .waitlist-join-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        }
        .waitlist-powered-by {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* ========================================= */
        /* LIVE GAMES SECTION                        */
        /* ========================================= */
        .live-games-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .live-count-badge {
          display: inline-block;
          margin-left: 10px;
          padding: 2px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
          vertical-align: middle;
        }
        .live-games-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .live-game-card {
          padding: 16px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(0, 212, 255, 0.15);
          border-radius: 12px;
          backdrop-filter: blur(12px);
          transition: border-color 0.2s;
        }
        .live-game-card:hover {
          border-color: rgba(0, 212, 255, 0.3);
        }
        .live-game-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .live-game-type {
          font-size: 13px;
          font-weight: 700;
          color: #00D4FF;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .live-game-stakes {
          font-size: 18px;
          font-weight: 800;
          color: #f1f5f9;
        }
        .live-game-details {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
        }
        .live-game-detail {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          color: #94a3b8;
          font-weight: 500;
        }
        .live-game-notes {
          margin: 8px 0 0;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.4;
          font-style: italic;
        }
        .live-game-time {
          display: block;
          margin-top: 8px;
          font-size: 11px;
          color: #64748b;
        }

        /* ========================================= */
        /* CHECK-INS SECTION                         */
        /* ========================================= */
        .checkins-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .checkin-count-text {
          display: inline-block;
          margin-left: 10px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          vertical-align: middle;
        }
        .checkin-btn {
          background: rgba(34, 197, 94, 0.1) !important;
          border-color: rgba(34, 197, 94, 0.3) !important;
          color: #4ade80 !important;
        }
        .checkin-btn:hover {
          background: rgba(34, 197, 94, 0.2) !important;
          border-color: #22c55e !important;
        }
        .checked-in-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #22c55e;
          margin-top: 2px;
          flex-shrink: 0;
        }
        .checkin-confirm-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 10px;
          color: #4ade80;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 16px;
        }
        .checkins-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .checkin-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          transition: border-color 0.2s;
        }
        .checkin-item:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        .checkin-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(0, 212, 255, 0.15);
          border: 1px solid rgba(0, 212, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          color: #00D4FF;
          flex-shrink: 0;
        }
        .checkin-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .checkin-name {
          font-size: 14px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .checkin-msg {
          font-size: 13px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .checkin-time {
          font-size: 12px;
          color: #64748b;
          flex-shrink: 0;
        }

        /* ========================================= */
        /* REVIEWS SECTION                           */
        /* ========================================= */
        .reviews-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .rating-summary {
          display: flex;
          gap: 32px;
          align-items: flex-start;
          padding: 20px 24px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .rating-overview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          min-width: 100px;
        }
        .rating-big-number {
          font-size: 42px;
          font-weight: 800;
          color: #00D4FF;
          line-height: 1;
        }
        .rating-total {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }
        .rating-bars {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rating-bar-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rating-bar-label {
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
          width: 14px;
          text-align: right;
        }
        .rating-bar-track {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 4px;
          overflow: hidden;
        }
        .rating-bar-fill {
          height: 100%;
          background: #00D4FF;
          border-radius: 4px;
          transition: width 0.3s ease;
          min-width: 0;
        }
        .rating-bar-count {
          font-size: 12px;
          color: #64748b;
          width: 24px;
          text-align: left;
        }
        .star-selector {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .star-selector-label {
          font-size: 14px;
          color: #00D4FF;
          font-weight: 600;
        }
        .reviews-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .review-card {
          padding: 16px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .review-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        .review-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .review-author {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .review-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #a78bfa;
          flex-shrink: 0;
        }
        .review-name {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .review-date {
          display: block;
          font-size: 12px;
          color: #64748b;
        }
        .review-text {
          margin: 0;
          font-size: 14px;
          color: #cbd5e1;
          line-height: 1.6;
        }
        .review-helpful {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 10px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }

        /* ========================================= */
        /* ACTIVITY FEED SECTION                     */
        /* ========================================= */
        .activity-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .activity-card {
          padding: 16px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .activity-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        .activity-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .activity-type-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: 1px solid;
        }
        .activity-time {
          font-size: 12px;
          color: #64748b;
        }
        .activity-content {
          margin: 0;
          font-size: 14px;
          color: #cbd5e1;
          line-height: 1.6;
        }
        .activity-likes {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 10px;
          font-size: 12px;
          color: #ef4444;
          font-weight: 500;
        }

        /* ========================================= */
        /* CLAIM PAGE SECTION                        */
        /* ========================================= */
        .claim-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .claim-cta-card {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(0, 212, 255, 0.15);
          border-radius: 12px;
          padding: 28px 24px;
          text-align: center;
        }
        .claim-cta-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .claim-cta-title {
          font-size: 18px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }
        .claim-cta-desc {
          font-size: 14px;
          color: #94a3b8;
          margin: 0;
          max-width: 480px;
          line-height: 1.5;
        }
        .claim-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 12px 28px;
          background: rgba(0, 212, 255, 0.12);
          border: 1px solid #00D4FF;
          border-radius: 8px;
          color: #00D4FF;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .claim-cta-btn:hover {
          background: rgba(0, 212, 255, 0.25);
        }
        .claim-form {
          margin-top: 16px;
        }
        .claim-verified-card,
        .claim-pending-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: 12px;
        }
        .claim-verified-card {
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .claim-pending-card {
          background: rgba(0, 212, 255, 0.06);
          border: 1px solid rgba(0, 212, 255, 0.2);
        }
        .claim-verified-icon,
        .claim-pending-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .claim-verified-icon {
          background: rgba(34, 197, 94, 0.1);
        }
        .claim-pending-icon {
          background: rgba(0, 212, 255, 0.1);
        }
        .claim-verified-text,
        .claim-pending-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .claim-verified-title {
          font-size: 16px;
          font-weight: 700;
          color: #22c55e;
        }
        .claim-pending-title {
          font-size: 16px;
          font-weight: 700;
          color: #00D4FF;
        }
        .claim-verified-desc,
        .claim-pending-desc {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.4;
        }

        /* ========================================= */
        /* BREADCRUMB NAVIGATION                     */
        /* ========================================= */
        .breadcrumb-nav {
          max-width: 900px;
          margin: 0 auto;
          padding: 12px 24px 0;
        }
        .breadcrumb-list {
          display: flex;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
          flex-wrap: wrap;
          gap: 0;
        }
        .breadcrumb-item {
          display: flex;
          align-items: center;
          font-size: 13px;
          font-weight: 500;
        }
        .breadcrumb-link {
          color: #94a3b8;
          text-decoration: none;
          transition: color 0.2s;
        }
        .breadcrumb-link:hover {
          color: #00D4FF;
        }
        .breadcrumb-sep {
          margin: 0 8px;
          color: #475569;
        }
        .breadcrumb-current {
          color: #00D4FF;
          font-weight: 600;
          max-width: 280px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ========================================= */
        /* MAP & DIRECTIONS                          */
        /* ========================================= */
        .map-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .venue-map-wrapper {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .venue-map-container {
          width: 100%;
          height: 280px;
          background: #0f172a;
        }
        .map-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .directions-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: rgba(0, 212, 255, 0.12);
          border: 1px solid #00D4FF;
          border-radius: 8px;
          color: #00D4FF;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
          flex-shrink: 0;
          -webkit-appearance: none;
          appearance: none;
        }
        .directions-btn:hover {
          background: rgba(0, 212, 255, 0.25);
        }
        .viewmap-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          color: rgba(148, 163, 184, 0.7);
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
          flex-shrink: 0;
          -webkit-appearance: none;
          appearance: none;
        }
        .viewmap-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.9);
          border-color: rgba(148, 163, 184, 0.35);
        }
        .map-address-text {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.4;
        }

        /* ========================================= */
        /* PROMOTIONS SECTION                        */
        /* ========================================= */
        .promotions-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .promotions-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .promo-card {
          padding: 16px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(0, 212, 255, 0.12);
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .promo-card:hover {
          border-color: rgba(0, 212, 255, 0.3);
        }
        .promo-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .promo-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          background: rgba(74, 222, 128, 0.15);
          border: 1px solid rgba(74, 222, 128, 0.3);
          color: #4ade80;
        }
        .promo-time {
          font-size: 12px;
          color: #64748b;
        }
        .promo-title {
          font-size: 16px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 6px;
        }
        .promo-content {
          margin: 0;
          font-size: 14px;
          color: #cbd5e1;
          line-height: 1.6;
        }

        /* ========================================= */
        /* RELATED SERIES SECTION                    */
        /* ========================================= */
        .related-series-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .related-series-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .related-series-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
        }
        .related-series-card:hover {
          border-color: rgba(0, 212, 255, 0.3);
          background: rgba(0, 212, 255, 0.04);
        }
        .related-series-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .related-series-tour {
          font-size: 10px;
          font-weight: 700;
          color: #00D4FF;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .related-series-name {
          font-size: 15px;
          font-weight: 600;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .related-series-dates {
          font-size: 13px;
          color: #94a3b8;
        }
        .related-series-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }
        .related-series-events {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .related-series-buyin {
          font-size: 13px;
          color: #00D4FF;
          font-weight: 700;
        }
        .related-series-arrow {
          color: #475569;
          flex-shrink: 0;
        }

        /* ========================================= */
        /* NEARBY VENUES SECTION                     */
        /* ========================================= */
        .nearby-venues-section {
          max-width: 900px;
          margin: 32px auto 0;
          padding: 0 24px;
        }
        .nearby-venues-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .nearby-venue-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
        }
        .nearby-venue-card:hover {
          border-color: rgba(0, 212, 255, 0.3);
          background: rgba(0, 212, 255, 0.04);
        }
        .nearby-venue-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .nearby-venue-name {
          font-size: 15px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .nearby-venue-location {
          font-size: 13px;
          color: #94a3b8;
        }
        .nearby-venue-type {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .nearby-venue-distance {
          font-size: 14px;
          font-weight: 700;
          color: #00D4FF;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .nearby-venue-arrow {
          color: #475569;
          flex-shrink: 0;
        }

        /* ========================================= */
        /* BRAVO LIVE GAMES BANNER                   */
        /* ========================================= */
        .bravo-live-banner {
          max-width: 900px;
          margin: 24px auto 0;
          padding: 0 24px;
        }
        .bravo-live-banner > * {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(0, 212, 255, 0.06) 100%);
          border: 1px solid rgba(34, 197, 94, 0.25);
          border-radius: 16px;
          box-shadow: 0 0 24px rgba(34, 197, 94, 0.08), 0 4px 16px rgba(0, 0, 0, 0.3);
        }
        .bravo-live-banner {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .bravo-live-header {
          padding: 16px 20px 12px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.10) 0%, rgba(0, 212, 255, 0.06) 100%);
          border: 1px solid rgba(34, 197, 94, 0.28);
          border-radius: 16px 16px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .bravo-live-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bravo-live-pulse {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 12px #4ade80, 0 0 24px rgba(34, 197, 94, 0.4);
          animation: bravoPulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes bravoPulse {
          0% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px #4ade80, 0 0 24px rgba(34, 197, 94, 0.4); }
          50% { opacity: 0.6; transform: scale(1.2); box-shadow: 0 0 20px #4ade80, 0 0 40px rgba(34, 197, 94, 0.6); }
          100% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px #4ade80, 0 0 24px rgba(34, 197, 94, 0.4); }
        }
        .bravo-live-title {
          font-size: 18px;
          font-weight: 800;
          color: #4ade80;
          margin: 0;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }
        .bravo-live-count {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(34, 197, 94, 0.35);
          padding: 4px 12px;
          border-radius: 20px;
          letter-spacing: 0.3px;
        }
        .bravo-live-updated {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
          font-style: italic;
        }
        .bravo-live-games-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.4);
          border-left: 1px solid rgba(34, 197, 94, 0.18);
          border-right: 1px solid rgba(34, 197, 94, 0.18);
        }
        .bravo-live-game-card {
          padding: 10px 14px;
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.15);
          border-radius: 10px;
          transition: all 0.2s;
        }
        .bravo-live-game-card:hover {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .bravo-game-name {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          line-height: 1.3;
        }
        .bravo-game-stats {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .bravo-game-tables {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #4ade80;
        }
        .bravo-game-waiting {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #f59e0b;
        }
        .bravo-live-footer {
          padding: 10px 16px;
          background: rgba(15, 23, 42, 0.3);
          border: 1px solid rgba(34, 197, 94, 0.18);
          border-top: none;
          border-radius: 0 0 16px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .bravo-live-source {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.35);
          letter-spacing: 0.3px;
          text-transform: uppercase;
          font-weight: 600;
        }
        .bravo-live-scroll-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: rgba(0, 212, 255, 0.12);
          border: 1px solid rgba(0, 212, 255, 0.25);
          border-radius: 8px;
          color: #00D4FF;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.2px;
        }
        .bravo-live-scroll-btn:hover {
          background: rgba(0, 212, 255, 0.22);
          box-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
        }
        .bravo-live-loading {
          max-width: 900px;
          margin: 16px auto 0;
          padding: 0 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          font-style: italic;
        }
        .bravo-loading-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.5);
          animation: bravoPulse 1.2s ease-in-out infinite;
        }

        /* ========================================= */
        /* MOBILE RESPONSIVE                         */
        /* ========================================= */
        @media (max-width: 640px) {
          .venue-name {
            font-size: 24px;
          }
          .info-grid {
            grid-template-columns: 1fr;
          }
          .bravo-live-banner {
            padding: 0 16px;
          }
          .bravo-live-title {
            font-size: 15px;
          }
          .bravo-live-games-grid {
            grid-template-columns: 1fr;
          }
          .bravo-live-footer {
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
            text-align: center;
          }
          .bravo-live-scroll-btn {
            justify-content: center;
          }
          .venue-header,
          .info-section,
          .tournaments-section,
          .live-games-section,
          .waitlist-board-section,
          .checkins-section,
          .reviews-section,
          .activity-section,
          .promotions-section,
          .related-series-section,
          .nearby-venues-section,
          .claim-section,
          .breadcrumb-nav,
          .map-section {
            padding-left: 16px;
            padding-right: 16px;
          }
          .waitlist-board {
            overflow-x: auto;
          }
          .waitlist-column {
            min-width: 120px;
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
          .form-row {
            flex-direction: column;
            gap: 14px;
          }
          .section-header-row {
            flex-direction: column;
            gap: 8px;
          }
          .section-action-btn {
            align-self: flex-start;
          }
          .rating-summary {
            flex-direction: column;
            gap: 20px;
            align-items: stretch;
          }
          .rating-overview {
            flex-direction: row;
            justify-content: center;
            gap: 12px;
          }
          .rating-big-number {
            font-size: 32px;
          }
          .live-game-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .review-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .claim-verified-card,
          .claim-pending-card {
            flex-direction: column;
            text-align: center;
            gap: 12px;
          }
        }
      `}</style>
    </>
  );
}
