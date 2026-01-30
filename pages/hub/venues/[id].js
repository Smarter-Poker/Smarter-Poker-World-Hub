/**
 * VENUE DETAIL PAGE - PokerAtlas-style venue profile
 * Displays full venue info, contact details, daily tournament schedules,
 * live games, check-ins, reviews, activity feed, and claim page
 * Fetches venue data from /api/poker/venues?id=X
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
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

function TrustDots({ score }) {
  const maxDots = 5;
  const filled = Math.round(score || 0);
  return (
    <div className="trust-dots">
      {Array.from({ length: maxDots }, (_, i) => (
        <span
          key={i}
          className={'trust-dot' + (i < filled ? ' filled' : '')}
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

function StarRating({ rating, size, interactive, onRate }) {
  const sz = size || 16;
  const stars = [1, 2, 3, 4, 5];
  return (
    <span style={{ display: 'inline-flex', gap: '2px', cursor: interactive ? 'pointer' : 'default' }}>
      {stars.map(function(star) {
        return (
          <svg
            key={star}
            width={sz}
            height={sz}
            viewBox="0 0 24 24"
            fill={star <= rating ? '#d4a853' : 'none'}
            stroke={star <= rating ? '#d4a853' : 'rgba(255,255,255,0.25)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            onClick={function() { if (interactive && onRate) onRate(star); }}
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
  const { id, action } = router.query;

  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);

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

  // Check follow status on mount
  useEffect(function() {
    if (!id) return;
    try {
      var stored = localStorage.getItem('followed-venues');
      var ids = stored ? JSON.parse(stored) : [];
      setIsFollowed(ids.includes(String(id)));
    } catch (e) {
      // ignore parse errors
    }
    fetch('/api/poker/follow?page_type=venue&page_id=' + id)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (json.success) setFollowerCount(json.follower_count || 0);
      })
      .catch(function() {});
  }, [id]);

  // Fetch venue data
  useEffect(function() {
    if (!id) return;
    var fetchVenue = async function() {
      setLoading(true);
      setError(null);
      try {
        var res = await fetch('/api/poker/venues?id=' + id);
        var json = await res.json();
        if (json.success && json.data) {
          var venueData = Array.isArray(json.data)
            ? json.data.find(function(v) { return String(v.id) === String(id); }) || json.data[0]
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

  // Fetch live games
  var fetchLiveGames = async function() {
    try {
      var res = await fetch('/api/poker/live-games?venue_id=' + id);
      var json = await res.json();
      if (json.success) {
        var games = json.games || json.data || [];
        setLiveGames(Array.isArray(games) ? games : []);
      }
    } catch (e) { /* silent */ }
  };

  useEffect(function() {
    if (!id) return;
    fetchLiveGames();
  }, [id]);

  // Fetch check-ins
  var fetchCheckins = async function() {
    try {
      var res = await fetch('/api/poker/checkins?venue_id=' + id);
      var json = await res.json();
      if (json.success) {
        var data = json.checkins || json.data || [];
        data = Array.isArray(data) ? data : [];
        setCheckins(data);
        setCheckinCount(json.count || data.length);
        var uid = getAnonymousUserId();
        var fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        var recent = data.find(function(c) {
          return c.user_id === uid && new Date(c.created_at) > fourHoursAgo;
        });
        if (recent) setHasCheckedIn(true);
      }
    } catch (e) { /* silent */ }
  };

  useEffect(function() {
    if (!id) return;
    fetchCheckins();
  }, [id]);

  // Fetch reviews
  var fetchReviews = async function() {
    try {
      var res = await fetch('/api/poker/reviews?venue_id=' + id);
      var json = await res.json();
      if (json.success) {
        var reviewData = json.reviews || json.data || [];
        reviewData = Array.isArray(reviewData) ? reviewData : [];
        setReviews(reviewData);
        setTotalReviews(json.total_reviews || json.total || reviewData.length);
        setAvgRating(json.avg_rating || (reviewData.length > 0
          ? reviewData.reduce(function(sum, r) { return sum + (r.rating || 0); }, 0) / reviewData.length
          : 0));
      }
    } catch (e) { /* silent */ }
  };

  useEffect(function() {
    if (!id) return;
    fetchReviews();
  }, [id]);

  // Fetch activity feed
  var fetchActivities = async function() {
    try {
      var res = await fetch('/api/poker/activity?page_type=venue&page_id=' + id + '&limit=10');
      var json = await res.json();
      if (json.success) {
        var items = json.activities || json.data || [];
        setActivities(Array.isArray(items) ? items : []);
      }
    } catch (e) { /* silent */ }
  };

  useEffect(function() {
    if (!id) return;
    fetchActivities();
  }, [id]);

  // Fetch claim status
  var fetchClaimStatus = async function() {
    try {
      var res = await fetch('/api/poker/claim-page?page_type=venue&page_id=' + id);
      var json = await res.json();
      if (json.success) {
        if (json.claimed && json.claim) {
          setClaimStatus(json.claim.status || 'pending');
        } else {
          setClaimStatus(null);
        }
      }
    } catch (e) { /* silent */ }
  };

  useEffect(function() {
    if (!id) return;
    fetchClaimStatus();
  }, [id]);

  // Fetch venue promotions
  useEffect(function() {
    if (!id) return;
    fetch('/api/poker/promotions?page_type=venue&page_id=' + id + '&limit=5')
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (json.success) {
          setPromotions(json.promotions || []);
        }
      })
      .catch(function() {});
  }, [id]);

  // Fetch nearby venues (once we have venue lat/lng)
  useEffect(function() {
    if (!venue || !venue.latitude || !venue.longitude) return;
    fetch('/api/poker/venues?lat=' + venue.latitude + '&lng=' + venue.longitude + '&radius=80&limit=6')
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (json.success) {
          var all = json.data || [];
          // Exclude current venue and take top 5
          var nearby = all.filter(function(v) { return String(v.id) !== String(id); }).slice(0, 5);
          setNearbyVenues(nearby);
        }
      })
      .catch(function() {});
  }, [venue, id]);

  // Fetch related series (match by venue name)
  useEffect(function() {
    if (!venue || !venue.name) return;
    fetch('/api/poker/series')
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (json.success) {
          var allSeries = json.series || json.data || [];
          var venueLower = venue.name.toLowerCase();
          var matched = allSeries.filter(function(s) {
            var seriesVenue = (s.venue || s.venue_name || '').toLowerCase();
            // Match if venue name appears in series venue or vice versa
            return seriesVenue.indexOf(venueLower) !== -1 || venueLower.indexOf(seriesVenue) !== -1;
          });
          setRelatedSeries(matched.slice(0, 5));
        }
      })
      .catch(function() {});
  }, [venue]);

  // Handle ?action= query parameter from geofence alerts
  useEffect(function() {
    if (!action || loading) return;
    var sectionId = null;
    if (action === 'checkin') {
      sectionId = 'checkins-section';
      setShowCheckinForm(true);
    } else if (action === 'review') {
      sectionId = 'reviews-section';
      setShowReviewForm(true);
    }
    if (sectionId) {
      setTimeout(function() {
        var el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [action, loading]);

  // Wait for Leaflet scripts
  useEffect(function() {
    if (typeof window === 'undefined') return;
    var check = function() {
      if (window.L) {
        setMapReady(true);
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  }, []);

  // Initialize venue map once Leaflet is ready and venue loaded
  useEffect(function() {
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
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#d4a853;border:3px solid #fff;box-shadow:0 0 12px rgba(212,168,83,0.8);"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    L.marker([venue.latitude, venue.longitude], { icon: goldIcon }).addTo(map);
    mapInstanceRef.current = map;

    return function() {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapReady, venue]);

  // Handlers
  var handleFollow = function() {
    var venueId = String(id);
    var newState = !isFollowed;
    setIsFollowed(newState);
    setFollowerCount(function(prev) { return newState ? prev + 1 : Math.max(0, prev - 1); });
    try {
      var stored = localStorage.getItem('followed-venues');
      var ids = stored ? JSON.parse(stored) : [];
      if (newState) {
        if (!ids.includes(venueId)) ids.push(venueId);
      } else {
        ids = ids.filter(function(x) { return x !== venueId; });
      }
      localStorage.setItem('followed-venues', JSON.stringify(ids));
    } catch (e) { /* ignore */ }
    fetch('/api/poker/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_type: 'venue',
        page_id: venueId,
        action: newState ? 'follow' : 'unfollow',
        user_id: getAnonymousUserId(),
      }),
    }).catch(function() {});
  };

  var handleShare = async function() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(function() { setCopySuccess(false); }, 2000);
    } catch (e) {
      var textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(function() { setCopySuccess(false); }, 2000);
    }
  };

  var handleReportGame = async function(e) {
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
      var json = await res.json();
      if (json.success) {
        setShowReportGame(false);
        setReportForm({ game_type: 'NL Holdem', stakes: '', table_count: 1, wait_time: '', notes: '' });
        await fetchLiveGames();
      }
    } catch (err) { /* silent */ }
    finally { setReportSubmitting(false); }
  };

  var handleCheckin = async function(e) {
    e.preventDefault();
    setCheckinSubmitting(true);
    try {
      var res = await fetch('/api/poker/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: id,
          user_id: getAnonymousUserId(),
          user_name: checkinName.trim() || 'Anonymous',
          message: checkinMessage.trim() || null,
        }),
      });
      var json = await res.json();
      if (json.success) {
        setHasCheckedIn(true);
        setCheckinConfirm(true);
        setShowCheckinForm(false);
        setCheckinMessage('');
        setCheckinName('');
        await fetchCheckins();
        setTimeout(function() { setCheckinConfirm(false); }, 3000);
      }
    } catch (err) { /* silent */ }
    finally { setCheckinSubmitting(false); }
  };

  var handleSubmitReview = async function(e) {
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
      var json = await res.json();
      if (json.success) {
        setShowReviewForm(false);
        setReviewForm({ rating: 0, reviewer_name: '', review_text: '' });
        await fetchReviews();
      }
    } catch (err) { /* silent */ }
    finally { setReviewSubmitting(false); }
  };

  var handlePostActivity = async function(e) {
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
      var json = await res.json();
      if (json.success) {
        setShowPostForm(false);
        setPostContent('');
        await fetchActivities();
      }
    } catch (err) { /* silent */ }
    finally { setPostSubmitting(false); }
  };

  var handleClaimSubmit = async function(e) {
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
      var json = await res.json();
      if (json.success) {
        setClaimStatus('pending');
        setShowClaimForm(false);
        setClaimForm({ contact_name: '', contact_email: '', contact_phone: '', role: 'Manager', verification_notes: '' });
      }
    } catch (err) { /* silent */ }
    finally { setClaimSubmitting(false); }
  };

  var googleMapsUrl = venue
    ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(
        [venue.address, venue.city, venue.state].filter(Boolean).join(', ')
      )
    : '#';

  // Group daily tournament schedules by day
  var getGroupedSchedules = function() {
    if (!venue || !venue.daily_tournaments || !venue.daily_tournaments.length) return null;
    var allSchedules = [];
    venue.daily_tournaments.forEach(function(dt) {
      if (dt.schedules && dt.schedules.length) {
        dt.schedules.forEach(function(s) {
          allSchedules.push(Object.assign({}, s, { source_url: dt.source_url }));
        });
      }
    });
    if (!allSchedules.length) return null;
    var grouped = {};
    allSchedules.forEach(function(s) {
      var day = s.day_of_week || 'Unknown';
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(s);
    });
    var sorted = {};
    DAYS_ORDER.forEach(function(day) {
      if (grouped[day]) sorted[day] = grouped[day];
    });
    Object.keys(grouped).forEach(function(day) {
      if (!sorted[day]) sorted[day] = grouped[day];
    });
    return sorted;
  };

  var groupedSchedules = venue ? getGroupedSchedules() : null;
  var todayName = DAYS_ORDER[(new Date().getDay() + 6) % 7];

  // Compute rating distribution
  var getRatingDistribution = function() {
    var dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(function(r) {
      var star = Math.round(r.rating || 0);
      if (star >= 1 && star <= 5) dist[star]++;
    });
    return dist;
  };
  var ratingDistribution = reviews.length > 0 ? getRatingDistribution() : null;

  var getWaitTimeColor = function(waitTime) {
    if (waitTime === null || waitTime === undefined) return '#94a3b8';
    if (waitTime <= 10) return '#22c55e';
    if (waitTime <= 30) return '#d4a853';
    return '#ef4444';
  };

  var getActivityTypeStyle = function(type) {
    var styles = {
      update: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa' },
      announcement: { bg: 'rgba(212, 168, 83, 0.12)', border: 'rgba(212, 168, 83, 0.25)', color: '#d4a853' },
      promotion: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.25)', color: '#4ade80' },
      result: { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.25)', color: '#a78bfa' },
    };
    return styles[type] || styles.update;
  };

  var pageTitle = venue ? venue.name + ' - Poker Venue' : 'Venue Detail';

  return (
    <>
      <Head>
        <title>{pageTitle} | Smarter.Poker</title>
        <meta name="description" content={venue ? venue.name + ' poker room in ' + venue.city + ', ' + venue.state + '. Find tournaments, hours, and contact info.' : 'Poker venue details'} />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
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
            {/* Breadcrumb Navigation */}
            <nav className="breadcrumb-nav" aria-label="Breadcrumb">
              <ol className="breadcrumb-list">
                <li className="breadcrumb-item">
                  <Link href="/hub" legacyBehavior><a className="breadcrumb-link">Hub</a></Link>
                  <span className="breadcrumb-sep">/</span>
                </li>
                <li className="breadcrumb-item">
                  <Link href="/hub/poker-near-me" legacyBehavior><a className="breadcrumb-link">Poker Near Me</a></Link>
                  <span className="breadcrumb-sep">/</span>
                </li>
                <li className="breadcrumb-item breadcrumb-current">
                  {venue.name}
                </li>
              </ol>
            </nav>

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
                  className={'action-btn follow-btn' + (isFollowed ? ' followed' : '')}
                  onClick={handleFollow}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={isFollowed ? '#d4a853' : 'none'} stroke={isFollowed ? '#d4a853' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {isFollowed ? 'Following' : 'Follow'}
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
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
              <h2 className="section-title">Contact &amp; Info</h2>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="info-content">
                    <span className="info-label">Phone</span>
                    {venue.phone ? (
                      <a href={'tel:' + venue.phone} className="info-value info-link">{venue.phone}</a>
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
                    <span className={'info-value' + (venue.has_tournaments ? ' has-yes' : ' muted')}>
                      {venue.has_tournaments ? 'Yes - Tournaments Available' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* ============================================ */}
            {/* MAP & DIRECTIONS SECTION                     */}
            {/* ============================================ */}
            {venue.latitude && venue.longitude && (
              <section className="map-section">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Location
                </h2>
                <div className="venue-map-wrapper">
                  <div ref={mapContainerRef} className="venue-map-container" />
                </div>
                <div className="map-actions">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="directions-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Get Directions
                  </a>
                  {venue.address && (
                    <span className="map-address-text">
                      {venue.address}{venue.city ? ', ' + venue.city : ''}{venue.state ? ', ' + venue.state : ''}
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* Daily Tournaments Section */}
            {groupedSchedules && Object.keys(groupedSchedules).length > 0 && (
              <section className="tournaments-section">
                <h2 className="section-title">Daily Tournament Schedule</h2>
                <div className="schedule-container">
                  {Object.entries(groupedSchedules).map(function([day, schedules]) {
                    var isToday = day === DAYS_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
                      || day === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
                    return (
                      <div key={day} className={'day-group' + (isToday ? ' today' : '')}>
                        <div className="day-header">
                          <h3 className="day-name">{day}</h3>
                          {isToday && <span className="today-badge">Today</span>}
                        </div>
                        <div className="schedule-cards">
                          {schedules.map(function(s, idx) {
                            return (
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

            {/* ============================================ */}
            {/* LIVE GAMES SECTION                           */}
            {/* ============================================ */}
            <section className="live-games-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
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
                  onClick={function() { setShowReportGame(!showReportGame); }}
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
                        onChange={function(e) { setReportForm(Object.assign({}, reportForm, { game_type: e.target.value })); }}
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
                        onChange={function(e) { setReportForm(Object.assign({}, reportForm, { stakes: e.target.value })); }}
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
                        onChange={function(e) { setReportForm(Object.assign({}, reportForm, { table_count: e.target.value })); }}
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
                        onChange={function(e) { setReportForm(Object.assign({}, reportForm, { wait_time: e.target.value })); }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Optional notes..."
                      value={reportForm.notes}
                      onChange={function(e) { setReportForm(Object.assign({}, reportForm, { notes: e.target.value })); }}
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
                  {liveGames.map(function(game, idx) {
                    return (
                      <div key={game.id || idx} className="live-game-card">
                        <div className="live-game-header">
                          <span className="live-game-type">{game.game_type || 'Cash Game'}</span>
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
                  <p>No live game reports. Be the first to report what&apos;s running!</p>
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* CHECK-INS SECTION                            */}
            {/* ============================================ */}
            <section id="checkins-section" className="checkins-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
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
                    onClick={function() { setShowCheckinForm(!showCheckinForm); }}
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

              {/* Check-in Confirmation */}
              {checkinConfirm && (
                <div className="checkin-confirm-banner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Checked in! Others can see you&apos;re here.
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
                        placeholder="Display name..."
                        value={checkinName}
                        onChange={function(e) { setCheckinName(e.target.value); }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message (optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="What are you playing? Looking for a game?"
                      value={checkinMessage}
                      onChange={function(e) { setCheckinMessage(e.target.value); }}
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
                  {checkins.map(function(ci, idx) {
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
                  <p>No check-ins yet today. Be the first to check in!</p>
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* REVIEWS & RATINGS SECTION                    */}
            {/* ============================================ */}
            <section id="reviews-section" className="reviews-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Reviews &amp; Ratings
                </h2>
                <button
                  className="section-action-btn"
                  onClick={function() { setShowReviewForm(!showReviewForm); }}
                >
                  {showReviewForm ? 'Cancel' : 'Write a Review'}
                </button>
              </div>

              {/* Rating Summary */}
              {totalReviews > 0 && (
                <div className="rating-summary">
                  <div className="rating-overview">
                    <div className="rating-big-number">{avgRating.toFixed(1)}</div>
                    <StarRating rating={Math.round(avgRating)} size={20} />
                    <div className="rating-total">{totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}</div>
                  </div>
                  {ratingDistribution && (
                    <div className="rating-bars">
                      {[5, 4, 3, 2, 1].map(function(star) {
                        var count = ratingDistribution[star] || 0;
                        var pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                        return (
                          <div key={star} className="rating-bar-row">
                            <span className="rating-bar-label">{star}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#d4a853" stroke="none">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <div className="rating-bar-track">
                              <div
                                className="rating-bar-fill"
                                style={{ width: pct + '%' }}
                              />
                            </div>
                            <span className="rating-bar-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Review Form */}
              {showReviewForm && (
                <form className="inline-form" onSubmit={handleSubmitReview}>
                  <div className="form-group">
                    <label className="form-label">Your Rating *</label>
                    <div className="star-selector">
                      <StarRating
                        rating={reviewForm.rating}
                        size={28}
                        interactive={true}
                        onRate={function(val) { setReviewForm(Object.assign({}, reviewForm, { rating: val })); }}
                      />
                      {reviewForm.rating > 0 && (
                        <span className="star-selector-label">
                          {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][reviewForm.rating]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Your Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Display name..."
                      value={reviewForm.reviewer_name}
                      onChange={function(e) { setReviewForm(Object.assign({}, reviewForm, { reviewer_name: e.target.value })); }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Review *</label>
                    <textarea
                      className="form-textarea"
                      rows="4"
                      placeholder="Share your experience at this venue..."
                      value={reviewForm.review_text}
                      onChange={function(e) { setReviewForm(Object.assign({}, reviewForm, { review_text: e.target.value })); }}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="form-submit-btn"
                    disabled={reviewSubmitting || !reviewForm.rating || !reviewForm.review_text.trim()}
                  >
                    {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </form>
              )}

              {/* Reviews List */}
              {reviews.length > 0 ? (
                <div className="reviews-list">
                  {reviews.map(function(review, idx) {
                    return (
                      <div key={review.id || idx} className="review-card">
                        <div className="review-header">
                          <div className="review-author">
                            <div className="review-avatar">
                              {(review.reviewer_name || 'A').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="review-name">{review.reviewer_name || 'Anonymous'}</span>
                              <span className="review-date">{timeAgo(review.created_at)}</span>
                            </div>
                          </div>
                          <StarRating rating={review.rating || 0} size={14} />
                        </div>
                        <p className="review-text">{review.review_text}</p>
                        {review.helpful_count > 0 && (
                          <span className="review-helpful">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                            </svg>
                            {review.helpful_count} found helpful
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !showReviewForm && (
                <div className="empty-section-card">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <p>No reviews yet. Be the first to review this venue!</p>
                </div>
              )}
            </section>

            {/* ============================================ */}
            {/* ACTIVITY FEED SECTION                        */}
            {/* ============================================ */}
            <section className="activity-section">
              <div className="section-header-row">
                <h2 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Activity Feed
                </h2>
                <button
                  className="section-action-btn"
                  onClick={function() { setShowPostForm(!showPostForm); }}
                >
                  {showPostForm ? 'Cancel' : 'Post Update'}
                </button>
              </div>

              {/* Post Form */}
              {showPostForm && (
                <form className="inline-form" onSubmit={handlePostActivity}>
                  <div className="form-group">
                    <label className="form-label">What&apos;s happening?</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      placeholder="Share an update about this venue..."
                      value={postContent}
                      onChange={function(e) { setPostContent(e.target.value); }}
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
                  {activities.map(function(activity, idx) {
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
                  <p>No updates yet. Follow this venue for the latest news!</p>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
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
                  {promotions.map(function(promo) {
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                    <path d="M4 22h16" />
                    <path d="M10 22V2h4v20" />
                    <path d="M8 9h8" />
                  </svg>
                  Tournament Series at This Venue
                </h2>
                <div className="related-series-list">
                  {relatedSeries.map(function(s) {
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Nearby Poker Rooms
                </h2>
                <div className="nearby-venues-grid">
                  {nearbyVenues.map(function(nv) {
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
                    <span className="claim-verified-desc">This venue page is managed by verified staff.</span>
                  </div>
                </div>
              ) : claimStatus === 'pending' ? (
                <div className="claim-pending-card">
                  <div className="claim-pending-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="claim-pending-text">
                    <span className="claim-pending-title">Claim Pending Review</span>
                    <span className="claim-pending-desc">Your claim for this page is being reviewed. We&apos;ll be in touch soon.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="claim-cta-card">
                    <div className="claim-cta-content">
                      <h3 className="claim-cta-title">Own or manage this venue?</h3>
                      <p className="claim-cta-desc">
                        Claim this page to update info, respond to reviews, and post updates.
                      </p>
                      {!showClaimForm && (
                        <button
                          className="claim-cta-btn"
                          onClick={function() { setShowClaimForm(true); }}
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
                            placeholder="Full name"
                            value={claimForm.contact_name}
                            onChange={function(e) { setClaimForm(Object.assign({}, claimForm, { contact_name: e.target.value })); }}
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
                            onChange={function(e) { setClaimForm(Object.assign({}, claimForm, { contact_email: e.target.value })); }}
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
                            placeholder="Phone number"
                            value={claimForm.contact_phone}
                            onChange={function(e) { setClaimForm(Object.assign({}, claimForm, { contact_phone: e.target.value })); }}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Your Role</label>
                          <select
                            className="form-select"
                            value={claimForm.role}
                            onChange={function(e) { setClaimForm(Object.assign({}, claimForm, { role: e.target.value })); }}
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
                          placeholder="How can we verify your association with this venue?"
                          value={claimForm.verification_notes}
                          onChange={function(e) { setClaimForm(Object.assign({}, claimForm, { verification_notes: e.target.value })); }}
                        />
                      </div>
                      <div className="form-actions">
                        <button type="submit" className="form-submit-btn" disabled={claimSubmitting || !claimForm.contact_name.trim() || !claimForm.contact_email.trim()}>
                          {claimSubmitting ? 'Submitting...' : 'Submit Claim'}
                        </button>
                        <button type="button" className="form-cancel-btn" onClick={function() { setShowClaimForm(false); }}>
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
          background: rgba(212, 168, 83, 0.1);
          border: 1px solid rgba(212, 168, 83, 0.3);
          color: #d4a853;
          white-space: nowrap;
          margin-top: 2px;
        }
        .section-action-btn:hover {
          background: rgba(212, 168, 83, 0.2);
          border-color: #d4a853;
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

        /* ========================================= */
        /* SHARED FORM STYLES                        */
        /* ========================================= */
        .inline-form {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(212, 168, 83, 0.2);
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
          border-color: rgba(212, 168, 83, 0.5);
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
          background: rgba(212, 168, 83, 0.15);
          border: 1px solid #d4a853;
          border-radius: 8px;
          color: #d4a853;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .form-submit-btn:hover:not(:disabled) {
          background: rgba(212, 168, 83, 0.25);
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
          border: 1px solid rgba(212, 168, 83, 0.15);
          border-radius: 12px;
          backdrop-filter: blur(12px);
          transition: border-color 0.2s;
        }
        .live-game-card:hover {
          border-color: rgba(212, 168, 83, 0.3);
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
          color: #d4a853;
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
          background: rgba(212, 168, 83, 0.15);
          border: 1px solid rgba(212, 168, 83, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          color: #d4a853;
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
          color: #d4a853;
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
          background: #d4a853;
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
          color: #d4a853;
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
          border: 1px solid rgba(212, 168, 83, 0.15);
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
          background: rgba(212, 168, 83, 0.12);
          border: 1px solid #d4a853;
          border-radius: 8px;
          color: #d4a853;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .claim-cta-btn:hover {
          background: rgba(212, 168, 83, 0.25);
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
          background: rgba(212, 168, 83, 0.06);
          border: 1px solid rgba(212, 168, 83, 0.2);
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
          background: rgba(212, 168, 83, 0.1);
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
          color: #d4a853;
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
          padding: 16px 24px 0;
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
          color: #d4a853;
        }
        .breadcrumb-sep {
          margin: 0 8px;
          color: #475569;
        }
        .breadcrumb-current {
          color: #d4a853;
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
          background: rgba(212, 168, 83, 0.12);
          border: 1px solid #d4a853;
          border-radius: 8px;
          color: #d4a853;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
          flex-shrink: 0;
        }
        .directions-btn:hover {
          background: rgba(212, 168, 83, 0.25);
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
          border: 1px solid rgba(212, 168, 83, 0.12);
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .promo-card:hover {
          border-color: rgba(212, 168, 83, 0.3);
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
          border-color: rgba(212, 168, 83, 0.3);
          background: rgba(212, 168, 83, 0.04);
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
          color: #d4a853;
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
          color: #d4a853;
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
          border-color: rgba(212, 168, 83, 0.3);
          background: rgba(212, 168, 83, 0.04);
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
          color: #d4a853;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .nearby-venue-arrow {
          color: #475569;
          flex-shrink: 0;
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
          .venue-header,
          .info-section,
          .tournaments-section,
          .live-games-section,
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
