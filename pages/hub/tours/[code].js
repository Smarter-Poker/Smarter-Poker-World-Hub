/**
 * TOUR DETAIL PAGE - Tour information and series overview
 * Displays tour details, about info, upcoming series,
 * activity feed, tournament results, and notification opt-in
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import StopScheduleModal from '../../../src/components/tours/StopScheduleModal';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';


const TOUR_COLORS = {
  'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
  'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff' },
  'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
  'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff' },
  'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff' },
  'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff' },
  'TRITON': { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', text: '#fff' },
  'NAPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff' },
  'CPPT': { bg: 'linear-gradient(135deg, #0f766e, #134e4a)', text: '#fff' },
  'BPO': { bg: 'linear-gradient(135deg, #0369a1, #0c4a6e)', text: '#fff' },
  'FPN': { bg: 'linear-gradient(135deg, #4338ca, #312e81)', text: '#fff' },
  'LIPS': { bg: 'linear-gradient(135deg, #be185d, #831843)', text: '#fff' },
  'ROUGHRIDER': { bg: 'linear-gradient(135deg, #854d0e, #713f12)', text: '#fff' },
  'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff' },
};

const TOUR_TYPE_LABELS = {
  major: 'Major',
  circuit: 'Circuit',
  regional: 'Regional',
  high_roller: 'High Roller',
  grassroots: 'Grassroots',
  charity: 'Charity',
};

const ACTIVITY_TYPE_COLORS = {
  update: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' },
  announcement: { bg: 'rgba(0, 212, 255, 0.15)', text: '#00D4FF', border: 'rgba(0, 212, 255, 0.3)' },
  promotion: { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' },
  result: { bg: 'rgba(167, 139, 250, 0.15)', text: '#a78bfa', border: 'rgba(167, 139, 250, 0.3)' },
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
    return startFormatted + ' - ' + end.getDate() + ', ' + end.getFullYear();
  }
  if (sameYear) {
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return startFormatted + ' - ' + endFormatted + ', ' + end.getFullYear();
  }

  const endFull = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return startFormatted + ', ' + start.getFullYear() + ' - ' + endFull;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
  return '$' + amount.toLocaleString();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return diffDays + 'd ago';
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths + 'mo ago';
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

// ── Smarter.Poker Standard: buy-in tier colors ───────────────────────────────
const BUY_IN_TIER_STYLE = {
  tbd:   { bg: 'rgba(100,116,139,0.15)', color: '#64748b', border: 'rgba(100,116,139,0.3)', label: 'TBD' },
  value: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
  low:   { bg: 'rgba(0,212,255,0.12)',  color: '#00D4FF', border: 'rgba(0,212,255,0.3)' },
  mid:   { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  midhi: { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  high:  { bg: 'rgba(234,179,8,0.15)',  color: '#eab308', border: 'rgba(234,179,8,0.3)' },
  super: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.3)' },
  ultra: { bg: 'rgba(236,72,153,0.15)', color: '#ec4899', border: 'rgba(236,72,153,0.3)' },
};
function getBuyInTier(amount) {
  if (!amount) return 'tbd';
  if (amount < 500) return 'value';
  if (amount < 1000) return 'low';
  if (amount < 2500) return 'mid';
  if (amount < 10000) return 'midhi';
  if (amount < 25000) return 'high';
  if (amount < 100000) return 'super';
  return 'ultra';
}
const GAME_COLORS = {
  NLH:'#00D4FF', PLO:'#a78bfa', O8:'#fb923c', HORSE:'#f59e0b',
  STUD:'#94a3b8','STUD-8':'#94a3b8', RAZZ:'#f43f5e', MIXED:'#10b981',
  LHE:'#6b7280', SHORT:'#06b6d4', '2-7':'#84cc16', PLO5:'#c084fc',
};

export default function TourDetailPage() {
  const router = useRouter();
  const { code } = router.query;
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('schedule');
  const [eventFilter, setEventFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const [selectedStop, setSelectedStop] = useState(null);


  const [isFollowed, setIsFollowed] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [notifPermission, setNotifPermission] = useState('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifPermission(Notification.permission);
  }, []);

  // Fast-load follow state from localStorage (instant, zero network round-trip)
  useEffect(() => {
    if (!code) return;
    try {
      const followed = JSON.parse(localStorage.getItem('followed-tours') || '[]');
      if (followed.includes(String(code))) setIsFollowed(true);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [code]);

  // Load follow state from Supabase API (with JWT for authenticated users)
  // CRITICAL: Only call check_user with a real UUID - fake IDs always return false and override localStorage
  useEffect(() => {
    if (!code) return;
    let accessToken = null;
    let userId = null;
    try {
      const _pa = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      accessToken = _pa?.access_token || null;
      if (!accessToken) {
        const sbKeys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKeys.length > 0) accessToken = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
      }
      // Extract user UUID from JWT payload
      if (accessToken) {
        try {
          const sub = JSON.parse(atob(accessToken.split('.')[1]));
          userId = sub?.sub || null;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    // Only query follow state if we have a real authenticated UUID
    if (!userId) return;
    const headers = { 'Authorization': 'Bearer ' + accessToken };
    fetch('/api/poker/follow?page_type=tour&page_id=' + encodeURIComponent(code) + '&check_user=' + encodeURIComponent(userId), { headers })
      .then(r => r.json())
      .then(d => { if (d.is_following !== undefined) setIsFollowed(d.is_following); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [code]);

  // Listen to cross-tab Follow events
  useEffect(() => {
    if (!code) return;
    const unsub = eventBus.on(EventType.SOCIAL_FOLLOW_CHANGED, (e) => {
      const { followedId, added } = e.payload || {};
      if (followedId === String(code) && typeof added === 'boolean') {
        setIsFollowed(added);
      }
    });
    return () => unsub();
  }, [code]);

  // SWR — parallel fetch all tour data
  const swrKey = code ? `/api/poker/tours?tour_code=${encodeURIComponent(code)}&include_series=true` : null;
  const { data: swrData, isLoading: loading, error } = useSWR(swrKey, async () => {
    const [tourRes, activityRes, resultsRes, followRes] = await Promise.all([
      fetch('/api/poker/tours?tour_code=' + encodeURIComponent(code) + '&include_series=true').catch(() => ({ ok: false })),
      fetch('/api/poker/activity?page_type=tour&page_id=' + encodeURIComponent(code) + '&limit=10').catch(() => ({ ok: false })),
      fetch('/api/poker/results?tour_code=' + encodeURIComponent(code) + '&limit=10').catch(() => ({ ok: false })),
      fetch('/api/poker/follow?page_type=tour&page_id=' + encodeURIComponent(code)).catch(() => ({ ok: false }))
    ]);
    if (!tourRes.ok) throw new Error(`Request failed (${tourRes.status})`);
    const tj = await tourRes.json();
    const aj = activityRes.ok ? await activityRes.json().catch(() => ({})) : {};
    const rj = resultsRes.ok ? await resultsRes.json().catch(() => ({})) : {};
    const fj = followRes.ok ? await followRes.json().catch(() => ({})) : {};
    return {
      tour: tj.data && tj.data.length > 0 ? tj.data[0] : null,
      activities: aj.success ? (Array.isArray(aj.activities || aj.data) ? (aj.activities || aj.data) : []) : [],
      results: rj.success && Array.isArray(rj.data) ? rj.data : [],
      followerCount: fj.success ? (fj.follower_count || 0) : 0
    };
  });
  const tour = swrData?.tour || null;
  const activities = swrData?.activities || [];
  const results = swrData?.results || [];
  const [localFollowerCount, setFollowerCount] = useState(null);
  const followerCount = localFollowerCount !== null ? localFollowerCount : (swrData?.followerCount || 0);

  // Smarter.Poker Standard: fetch full event schedule
  const scheduleKey = code ? `/api/poker/tour-schedule?tour_code=${encodeURIComponent(code)}&all_stops=true` : null;
  const { data: scheduleData } = useSWR(scheduleKey, url => fetch(url).then(r => r.json()).catch(() => null));
  const allStops = scheduleData?.stops || [];
  const currentStop = allStops.find(s => s.stop_type === 'current') || allStops.find(s => s.stop_type === 'next') || null;
  const allEvents = scheduleData?.events ||
    allStops.flatMap(s => (s.events || []).map(e => ({ ...e, _stop_type: s.stop_type }))) || [];
  const currentStopType = currentStop?.stop_type || null;

  function handleFollow() {
    const newState = !isFollowed;
    const prevState = isFollowed;
    const prevCount = localFollowerCount !== null ? localFollowerCount : (swrData?.followerCount || 0);
    setIsFollowed(newState);
    setFollowerCount(prev => {
      const base = prev !== null ? prev : (swrData?.followerCount || 0);
      return newState ? base + 1 : Math.max(0, base - 1);
    });

    // Persist follow state to localStorage for instant load next visit
    try {
      const tourCode = String(code);
      const followed = JSON.parse(localStorage.getItem('followed-tours') || '[]');
      const updated = newState
        ? (followed.includes(tourCode) ? followed : [...followed, tourCode])
        : followed.filter(t => t !== tourCode);
      localStorage.setItem('followed-tours', JSON.stringify(updated));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // Persist follow state via API (JWT required)
    const fetchHeaders = { 'Content-Type': 'application/json' };
    try {
      const _hf_auth = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      const _hf_tok = _hf_auth?.access_token || null;
      if (_hf_tok) {
        fetchHeaders['Authorization'] = 'Bearer ' + _hf_tok;
      } else {
        const sbKeys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKeys.length > 0) {
          const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
          if (tokenData.access_token) fetchHeaders['Authorization'] = 'Bearer ' + tokenData.access_token;
        }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    fetch('/api/poker/follow', {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify({
        page_type: 'tour',
        page_id: code,
        action: newState ? 'follow' : 'unfollow',
      }),
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success && data.error !== undefined) {
        // API rejected — rollback UI to previous state
        setIsFollowed(prevState);
        setFollowerCount(prevCount);
        // Rollback localStorage
        try {
          const tourCode = String(code);
          const followed = JSON.parse(localStorage.getItem('followed-tours') || '[]');
          const rolled = prevState
            ? (followed.includes(tourCode) ? followed : [...followed, tourCode])
            : followed.filter(t => t !== tourCode);
          localStorage.setItem('followed-tours', JSON.stringify(rolled));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }
    })
    .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    // Emit EventBus event for cross-page reactivity
    try { busEmit.socialFollowChanged(code, 'tour-detail', { added: newState }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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

  function handleEnableNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    Notification.requestPermission().then(function (permission) {
      setNotifPermission(permission);
    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }

  const tourColor = TOUR_COLORS[code] || TOUR_COLORS['default'];
  const tourTypeLabel = tour ? (TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type) : '';
  const pageTitle = tour ? (tour.tour_name + ' | Smarter.Poker') : 'Tour Details | Smarter.Poker';

  if (!router.isReady) return null;

  return (
    <>
      <SEOHead
        title={tour ? (tour.tour_name + ' — Poker Tour Details') : 'Poker Tour Details'}
        description={tour ? ('View ' + tour.tour_name + ' schedule, stops, and results on Smarter.Poker.') : 'View details for this poker tour on Smarter.Poker.'}
      >


      </SEOHead>

      <UniversalHeader 
        pageDepth={2} 
        onMenuClick={() => setMenuOpen(true)}
        onBackClick={() => {
          router.back();
        }}
      />

      <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
      />

      {/* ── Full-Screen Stop Schedule Modal ── */}
      {selectedStop && (
        <StopScheduleModal
          stop={selectedStop}
          tourCode={String(code)}
          tourName={tour?.tour_name}
          tourColor={tourColor}
          onClose={() => setSelectedStop(null)}
        />
      )}

      <div className="tour-page">
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading Tour Details...</p>
          </div>
        )}

        {error && !loading && (
          <div className="error-container">
            <div className="error-icon">!</div>
            <h2 className="error-title">Tour Not Found</h2>
            <p className="error-text">{error?.message || 'An error occurred loading this tour.'}</p>
          </div>
        )}

        {tour && !loading && (
          <>
            {/* Header Section */}
            <section className="tour-header">
              <div className="header-content">

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
                      {tour.tour_name}
                    </li>
                  </ol>
                </nav>

                <div className="header-top-row">
                  <h1 className="tour-name">{tour.tour_name}</h1>
                  <div className="header-actions">
                    <button
                      className={'follow-btn' + (isFollowed ? ' followed' : '')}
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

                        {/* ══ SMARTER.POKER STANDARD: Tab Navigation ══ */}
            <section className="sp-tabs-bar">
              <div className="sp-tabs-inner">
                {[
                  { id: 'schedule', label: currentStopType === 'current' ? 'Current Event' : currentStopType === 'next' ? 'Next Event' : 'Event Schedule' },
                  { id: 'stops',    label: 'All Stops',      count: allStops.length || (tour.stops_2026||[]).length },
                  { id: 'about',    label: 'About' },
                  { id: 'results',  label: 'Results', count: results.length || null },
                ].map(tab => (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    className={`sp-tab${activeTab === tab.id ? ' sp-tab-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {tab.count > 0 && <span className="sp-tab-count">{tab.count}</span>}
                  </button>
                ))}
              </div>
            </section>

            {/* ══ TAB: EVENT SCHEDULE (Smarter.Poker Standard) ══ */}
            {activeTab === 'schedule' && (
            <section className="sp-schedule-section">
              {/* Current / Next Stop Banner */}
              {currentStop && (
                <div
                  className={`sp-stop-banner sp-stop-banner-clickable ${currentStopType === 'current' ? 'sp-stop-live' : 'sp-stop-next'}`}
                  onClick={() => setSelectedStop(currentStop)}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedStop(currentStop)}
                >
                  <div className="sp-stop-banner-left">
                    <span className={`sp-stop-status-dot ${currentStopType === 'current' ? 'dot-live' : 'dot-next'}`} />
                    <span className="sp-stop-status-label">
                      {currentStopType === 'current' ? 'LIVE NOW' : 'NEXT STOP'}
                    </span>
                    <span className="sp-stop-name">{currentStop.stop_name}</span>
                  </div>
                  <div className="sp-stop-banner-right">
                    {currentStop.stop_venue && <span className="sp-stop-venue">{currentStop.stop_venue}</span>}
                    {(currentStop.stop_city || currentStop.stop_state) && (
                      <span className="sp-stop-loc">
                        {[currentStop.stop_city, currentStop.stop_state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {currentStop.stop_start_date && (
                      <span className="sp-stop-dates">
                        {formatDateRange(currentStop.stop_start_date, currentStop.stop_end_date)}
                      </span>
                    )}
                    <span className="sp-view-sched-hint">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      View Full Schedule
                    </span>
                  </div>
                </div>
              )}


              {/* Filter Bar */}
              {(() => {
                const srcEvents = currentStop?.events?.length ? currentStop.events
                  : allEvents.length ? allEvents
                  : (tour.series_2026 || []).map((s, i) => ({
                      event_number: i+1, event_name: s.name, game_type: s.game || 'NLH',
                      buy_in: s.buyin, start_display: s.dates || 'TBD', data_quality: 'pending'
                    }));
                const gameTypes = [...new Set(srcEvents.map(e => e.game_type).filter(Boolean))];
                const filtered = srcEvents.filter(e => {
                  const nameMatch = !eventFilter || (e.event_name||'').toLowerCase().includes(eventFilter.toLowerCase());
                  const gameMatch = gameFilter === 'all' || e.game_type === gameFilter;
                  return nameMatch && gameMatch;
                });
                return (
                  <>
                    {srcEvents.length > 5 && (
                      <div className="sp-filter-bar">
                        <input
                          className="sp-filter-input"
                          placeholder="Search events..."
                          value={eventFilter}
                          onChange={e => setEventFilter(e.target.value)}
                          id="event-search-input"
                        />
                        <select
                          className="sp-filter-select"
                          value={gameFilter}
                          onChange={e => setGameFilter(e.target.value)}
                          id="game-type-filter"
                        >
                          <option value="all">All Games</option>
                          {gameTypes.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <span className="sp-filter-count">{filtered.length} events</span>
                      </div>
                    )}

                    {/* ── Smarter.Poker Standard Event Table ── */}
                    {filtered.length === 0 && (
                      <div className="sp-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <p>No events found{eventFilter ? ` matching "${eventFilter}"` : '. Schedule coming soon.'}.</p>
                      </div>
                    )}

                    {filtered.length > 0 && (
                      <div className="sp-event-table-wrap">
                        {/* Column Headers */}
                        <div className="sp-event-header-row">
                          <div className="sp-col-num">#</div>
                          <div className="sp-col-name">Event</div>
                          <div className="sp-col-buyin">Buy-In</div>
                          <div className="sp-col-date">Date</div>
                          <div className="sp-col-time">Start Time</div>
                          <div className="sp-col-latereg">Late Reg</div>
                          <div className="sp-col-chips">Chips</div>
                          <div className="sp-col-gtd">Guarantee</div>
                        </div>

                        {filtered.map((evt, idx) => {
                          const tier = getBuyInTier(evt.buy_in);
                          const tierStyle = BUY_IN_TIER_STYLE[tier];
                          const gameColor = GAME_COLORS[evt.game_type] || '#94a3b8';
                          const isMain = evt.is_main_event || (evt.event_name||'').toLowerCase().includes('main event');
                          const isHR = evt.is_high_roller || (evt.buy_in >= 25000);
                          return (
                            <div key={idx} className={`sp-event-row${isMain ? ' sp-event-main' : ''}${isHR ? ' sp-event-hr' : ''}`}>
                              <div className="sp-col-num">
                                {isMain ? (
                                  <span className="sp-main-star">★</span>
                                ) : (
                                  <span className="sp-evt-num">{evt.event_number || (idx+1)}</span>
                                )}
                              </div>
                              <div className="sp-col-name">
                                <span className="sp-evt-name">{evt.event_name}</span>
                                <span className="sp-game-badge" style={{ color: gameColor, borderColor: gameColor + '44' }}>
                                  {evt.game_type || 'NLH'}
                                </span>
                                {evt.re_entry && <span className="sp-flag-badge sp-flag-reentry">Re-Entry</span>}
                                {isMain && <span className="sp-flag-badge sp-flag-main">Main Event</span>}
                                {isHR && !isMain && <span className="sp-flag-badge sp-flag-hr">High Roller</span>}
                                {evt.is_ladies_event && <span className="sp-flag-badge sp-flag-ladies">Ladies</span>}
                                {evt.is_seniors_event && <span className="sp-flag-badge sp-flag-seniors">Seniors</span>}
                              </div>
                              <div className="sp-col-buyin">
                                <span className="sp-buyin-chip" style={{ background: tierStyle.bg, color: tierStyle.color, borderColor: tierStyle.border }}>
                                  {evt.buy_in ? formatMoney(evt.buy_in) : 'TBD'}
                                </span>
                                {evt.entry_fee > 0 && <span className="sp-fee">+{formatMoney(evt.entry_fee)}</span>}
                              </div>
                              <div className="sp-col-date">
                                <span className="sp-date-val">{evt.start_display || evt.start_date || 'TBD'}</span>
                              </div>
                              <div className="sp-col-time">
                                <span className="sp-time-val">{evt.start_time || 'TBD'}</span>
                              </div>
                              <div className="sp-col-latereg">
                                <span className="sp-latereg-val">{evt.late_registration || '—'}</span>
                              </div>
                              <div className="sp-col-chips">
                                <span className="sp-chips-val">{evt.starting_chips_display || (evt.starting_chips ? evt.starting_chips.toLocaleString() : 'TBD')}</span>
                              </div>
                              <div className="sp-col-gtd">
                                {evt.guarantee ? (
                                  <span className="sp-gtd-chip">{formatMoney(evt.guarantee)}</span>
                                ) : <span className="sp-na">—</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {srcEvents.length > 0 && srcEvents[0]?.data_quality === 'pending' && (
                      <p className="sp-data-note">⚠ Showing registry data — live schedule scrape pending</p>
                    )}
                  </>
                );
              })()}
            </section>
            )}

            {/* ══ TAB: ALL STOPS ══ */}
            {activeTab === 'stops' && (
            <section className="tour-series">
              <h2 className="section-title">
                {new Date().getFullYear()} Tour Stops
                {(() => {
                  const hasGranular = allStops.some(s => s.stop_city || s.stop_venue);
                  const count = hasGranular ? allStops.length : ((tour.stops_2026||[]).length || allStops.length);
                  return count > 0 ? <span className="series-count">{count}</span> : null;
                })()}
              </h2>

              {(!tour.upcoming_series || tour.upcoming_series.length === 0) && (!tour.series_2026 || tour.series_2026.length === 0) && (
                <div className="empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <p>No Upcoming Stops Announced Yet.</p>
                  <p className="empty-subtext">Check Back Soon For Updates.</p>
                </div>
              )}

              {/* All stops list */}
              {(allStops.length > 0 ? allStops : []).length === 0 && (!tour.upcoming_series || tour.upcoming_series.length === 0) && (!tour.stops_2026 || tour.stops_2026.length === 0) && (
                <div className="empty-state"><p>No stops announced yet.</p></div>
              )}
              <div className="series-grid">
                {/* Prefer registry venue stops over generic consolidated DB stops (e.g. "RGPS 2026") */}
                {(() => {
                  // If all DB stops are generic consolidated (no venue/city data), prefer registry
                  const hasGranularDbStops = allStops.some(s => s.stop_city || s.stop_venue);
                  return hasGranularDbStops ? allStops : [];
                })().map((s, idx) => (
                  <div
                    key={'db-' + idx}
                    className="series-card series-card-clickable"
                    onClick={() => setSelectedStop(s)}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedStop(s)}
                  >
                    <div className="series-card-header">
                      <h3 className="series-name">{s.stop_name || s.short_name || s.name}</h3>
                      {s.stop_type && <span className={`sp-stop-type-badge sp-stype-${s.stop_type}`}>{s.stop_type === 'current' ? 'Live Now' : s.stop_type === 'next' ? 'Next' : s.stop_type}</span>}
                    </div>
                    {(s.stop_city || s.stop_state || s.city || s.state) && (
                      <div className="series-location">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>{[s.stop_city||s.city, s.stop_state||s.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {s.stop_venue && <div className="series-location" style={{color:'#94a3b8',fontSize:'12px'}}><span>{s.stop_venue}</span></div>}
                    <div className="series-dates">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span>{formatDateRange(s.stop_start_date, s.stop_end_date) || s.dates || 'TBD'}</span>
                    </div>
                    {s.events?.length > 0 && <div className="sp-stop-event-count">{s.events.length} Events</div>}
                    <div className="sp-view-sched-cta">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      View Full Schedule
                    </div>
                  </div>
                ))}
                {/* Also render registry stops when DB only has generic consolidated stops (no granular venue/city data) */}
                {!allStops.some(s => s.stop_city || s.stop_venue) && (tour.stops_2026 || []).map((s, idx) => {
                  // Convert registry stop to stop shape for modal
                  const stopShape = {
                    stop_name: s.name,
                    stop_venue: s.venue || null,
                    stop_city: s.location ? s.location.split(',')[0]?.trim() : null,
                    stop_state: s.location ? s.location.split(',')[1]?.trim() : null,
                    dates: s.dates,
                    events: (tour.series_2026 || []).map((e, i) => ({
                      event_number: i + 1, event_name: e.name,
                      buy_in: e.buyin, game_type: e.game || 'NLH',
                      start_display: e.dates || 'TBD', data_quality: 'pending'
                    }))
                  };
                  return (
                    <div
                      key={'reg-' + idx}
                      className="series-card series-card-clickable"
                      onClick={() => setSelectedStop(stopShape)}
                      role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelectedStop(stopShape)}
                    >
                      <div className="series-card-header"><h3 className="series-name">{s.name}</h3></div>
                      {s.location && <div className="series-location"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>{s.location}</span></div>}
                      <div className="series-dates"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>{s.dates || 'TBD'}</span></div>
                      <div className="sp-view-sched-cta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        View Schedule
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            )}

            {/* ══ TAB: ABOUT ══ */}
            {activeTab === 'about' && (
            <section className="tour-about">
              <h2 className="section-title">About</h2>
              <div className="about-grid">
                {tour.official_website && (
                  <div className="about-item">
                    <span className="about-label">Official Website</span>
                    <a
                      href={tour.official_website.startsWith('http') ? tour.official_website : ('https://' + tour.official_website)}
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
                {tour.typical_buyins && (tour.typical_buyins.min != null || tour.typical_buyins.max != null) && (
                  <div className="about-item">
                    <span className="about-label">Typical Buy-In Range</span>
                    <span className="about-value">
                      {tour.typical_buyins.min != null && tour.typical_buyins.max != null
                        ? (formatMoney(tour.typical_buyins.min) + ' - ' + formatMoney(tour.typical_buyins.max))
                        : tour.typical_buyins.min != null
                          ? ('From ' + formatMoney(tour.typical_buyins.min))
                          : ('Up to ' + formatMoney(tour.typical_buyins.max))}
                      {tour.typical_buyins.main_event && (
                        <span className="main-event-buyin">{' (Main Event: ' + formatMoney(tour.typical_buyins.main_event) + ')'}</span>
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
            )}

            {/* ══ TAB: RESULTS ══ */}
            {activeTab === 'results' && (
            <>
              <section className="tour-activity">
                <h2 className="section-title">Latest Updates</h2>
                <div className="activity-container">
                  {activities.length === 0 && (
                    <div className="empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <p>No Updates Yet.</p>
                    </div>
                  )}
                  {activities.length > 0 && (
                    <div className="activity-list">
                      {activities.map((activity, idx) => {
                        const typeColor = ACTIVITY_TYPE_COLORS[activity.type] || ACTIVITY_TYPE_COLORS.update;
                        return (
                          <div key={idx} className="activity-item">
                            <div className="activity-header">
                              <span className="activity-type-badge" style={{ background: typeColor.bg, color: typeColor.text, borderColor: typeColor.border }}>
                                {(activity.type || 'update').charAt(0).toUpperCase() + (activity.type || 'update').slice(1)}
                              </span>
                              <span className="activity-time">{timeAgo(activity.created_at)}</span>
                            </div>
                            <p className="activity-content">{activity.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
              <section className="tour-results">
                <h2 className="section-title">Recent Results</h2>
                <div className="results-container">
                  {results.length === 0 && (
                    <div className="empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5"><path d="M18 2H6v7a6 6 0 0012 0V2Z"/><path d="M4 22h16"/></svg>
                      <p>No Results Available Yet.</p>
                    </div>
                  )}
                  {results.length > 0 && (
                    <div className="results-grid">
                      {results.map((result, idx) => (
                        <div key={idx} className="result-card">
                          <div className="result-event-name">{result.event_name}</div>
                          {result.event_date && <div className="result-event-date">{formatDate(result.event_date)}</div>}
                          <div className="result-details">
                            {result.winner_name && <div className="result-row"><span className="result-label">Winner</span><span className="result-winner">{result.winner_name}</span></div>}
                            {result.winner_prize && <div className="result-row"><span className="result-label">Prize</span><span className="result-prize">{formatMoney(result.winner_prize)}</span></div>}
                            {result.total_entries && <div className="result-row"><span className="result-label">Entries</span><span className="result-value">{result.total_entries}</span></div>}
                            {result.prize_pool && <div className="result-row"><span className="result-label">Prize Pool</span><span className="result-value">{formatMoney(result.prize_pool)}</span></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
            )}

            {/* Notifications — always visible */}
            <section className="tour-notifications">
              <div className="notif-card">
                <div className="notif-content">
                  <p className="notif-text">{'Get notified about new ' + tour.tour_name + ' events and results'}</p>
                  {notifPermission === 'granted' ? (
                    <span className="notif-enabled">Notifications Enabled</span>
                  ) : (
                    <button className="notif-btn" onClick={handleEnableNotifications}>Enable Notifications</button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
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

  .tour-page {
    font-family: 'Rajdhani', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    min-height: 100vh; padding-bottom: 70px;
    background: radial-gradient(ellipse at top, #0f172a 0%, #030712 50%),
                radial-gradient(ellipse at bottom right, #1e1b4b 0%, #030712 50%);
    background-color: #030712;
    color: #e2e8f0;
    padding-bottom: 80px;
  }

  /* Clickable cards + banners */
  .series-card-clickable {
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  }
  .series-card-clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,212,255,0.12);
    border-color: rgba(0,212,255,0.3) !important;
  }
  .series-card-clickable:focus-visible {
    outline: 2px solid rgba(0,212,255,0.6);
    outline-offset: 2px;
  }
  .sp-view-sched-cta {
    display: flex; align-items: center; gap: 5px;
    margin-top: 10px; font-size: 11px; font-weight: 600;
    color: #00D4FF; text-transform: uppercase; letter-spacing: 0.5px;
    opacity: 0; transition: opacity 0.15s;
  }
  .series-card-clickable:hover .sp-view-sched-cta { opacity: 1; }

  .sp-stop-banner-clickable {
    cursor: pointer;
    transition: filter 0.15s;
  }
  .sp-stop-banner-clickable:hover { filter: brightness(1.08); }
  .sp-view-sched-hint {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 500;
    margin-top: 4px;
  }

  .sp-event-row-clickable {
    cursor: pointer;
  }
  .sp-event-row-clickable:hover { background: rgba(0,212,255,0.04) !important; }


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
    border: 3px solid rgba(0, 212, 255, 0.2);
    border-top-color: #00D4FF;
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
    background: rgba(0, 212, 255, 0.15);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 8px;
    color: #00D4FF;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }
  .back-link-btn:hover {
    background: rgba(0, 212, 255, 0.25);
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
  .breadcrumb-nav {
    margin-bottom: 20px;
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
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.4);
    color: #00D4FF;
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
    color: #00D4FF;
    font-weight: 600;
  }
  .about-link {
    display: inline-flex;
    align-items: center;
    color: #00D4FF;
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
    margin-bottom: 32px;
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
    background: rgba(0, 212, 255, 0.15);
    color: #00D4FF;
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
    border-color: rgba(0, 212, 255, 0.3);
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
  .venue-link-text {
    color: #00D4FF;
    text-decoration: underline;
    text-decoration-color: rgba(0, 212, 255, 0.3);
    text-underline-offset: 2px;
    cursor: pointer;
    transition: text-decoration-color 0.2s;
  }
  .venue-link-text:hover {
    text-decoration-color: #00D4FF;
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
    color: #00D4FF;
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
    color: #00D4FF;
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

  /* Tour Stops Section */
  .tour-stops {
    margin-bottom: 24px;
  }
  .stops-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stop-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    transition: all 0.2s;
  }
  .stop-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .stop-clickable {
    cursor: pointer;
  }
  .stop-clickable:hover {
    border-color: rgba(0, 212, 255, 0.3);
  }
  .stop-index {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.15);
    color: #00D4FF;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .stop-info {
    flex: 1;
    min-width: 0;
  }
  .stop-name {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .stop-clickable .stop-name {
    color: #00D4FF;
  }
  .stop-location {
    display: block;
    font-size: 12px;
    color: #94a3b8;
  }
  .stop-dates {
    font-size: 13px;
    color: #94a3b8;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .stop-link-icon {
    flex-shrink: 0;
  }
  @media (max-width: 640px) {
    .stop-row {
      padding: 10px 12px;
      gap: 10px;
    }
    .stop-name {
      font-size: 13px;
    }
    .stop-dates {
      font-size: 11px;
    }
  }

  /* Activity Feed Section */
  .tour-activity {
    padding: 0 16px;
    margin-bottom: 32px;
  }
  .tour-activity > * {
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
  }
  .activity-container {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    backdrop-filter: blur(12px);
  }
  .activity-list {
    display: flex;
    flex-direction: column;
  }
  .activity-item {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s;
  }
  .activity-item:last-child {
    border-bottom: none;
  }
  .activity-item:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  .activity-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .activity-type-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
  }
  .activity-time {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
    white-space: nowrap;
  }
  .activity-content {
    margin: 0;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.5;
  }

  /* Tournament Results Section */
  .tour-results {
    padding: 0 16px;
    margin-bottom: 32px;
  }
  .tour-results > * {
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
  }
  .results-container {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    backdrop-filter: blur(12px);
  }
  .results-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
  }
  .result-card {
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s;
  }
  .result-card:last-child {
    border-bottom: none;
  }
  .result-card:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  .result-event-name {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 4px;
  }
  .result-event-date {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 12px;
  }
  .result-details {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .result-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .result-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #64748b;
  }
  .result-winner {
    font-size: 14px;
    font-weight: 700;
    color: #00D4FF;
  }
  .result-prize {
    font-size: 14px;
    font-weight: 700;
    color: #4ade80;
  }
  .result-value {
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
  }

  /* Notifications Opt-in */
  .tour-notifications {
    padding: 0 16px;
    margin-bottom: 32px;
  }
  .notif-card {
    max-width: 900px;
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 20px 24px;
    backdrop-filter: blur(12px);
  }
  .notif-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .notif-text {
    margin: 0;
    font-size: 14px;
    color: #94a3b8;
    font-weight: 500;
  }
  .notif-btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(0, 212, 255, 0.12);
    border: 1px solid rgba(0, 212, 255, 0.3);
    color: #00D4FF;
  }
  .notif-btn:hover {
    background: rgba(0, 212, 255, 0.22);
    border-color: #00D4FF;
  }
  .notif-enabled {
    font-size: 13px;
    font-weight: 600;
    color: #4ade80;
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
    .result-details {
      flex-direction: column;
      gap: 10px;
    }
    .notif-content {
      flex-direction: column;
      text-align: center;
    }
  }

  /* ═══ SMARTER.POKER STANDARD STYLES ═══════════════════════════════════════ */

  /* Tab Bar */
  .sp-tabs-bar {
    padding: 0 16px;
    margin-bottom: 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .sp-tabs-inner {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    gap: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sp-tabs-inner::-webkit-scrollbar { display: none; }
  .sp-tab {
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    color: #64748b;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sp-tab:hover { color: #94a3b8; }
  .sp-tab-active {
    color: #00D4FF;
    border-bottom-color: #00D4FF;
  }
  .sp-tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: rgba(0,212,255,0.15);
    color: #00D4FF;
    font-size: 11px;
    font-weight: 700;
  }

  /* Schedule Section */
  .sp-schedule-section {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px 16px;
  }

  /* Current/Next Stop Banner */
  .sp-stop-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 10px;
    margin-bottom: 20px;
    border: 1px solid;
  }
  .sp-stop-live {
    background: rgba(0,212,255,0.08);
    border-color: rgba(0,212,255,0.25);
  }
  .sp-stop-next {
    background: rgba(139,92,246,0.08);
    border-color: rgba(139,92,246,0.25);
  }
  .sp-stop-banner-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .sp-stop-status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-live { background: #00D4FF; box-shadow: 0 0 6px #00D4FF; animation: pulse-dot 1.5s infinite; }
  .dot-next { background: #a78bfa; }
  @keyframes pulse-dot {
    0%,100% { opacity: 1; } 50% { opacity: 0.4; }
  }
  .sp-stop-status-label {
    font-size: 11px; font-weight: 800;
    letter-spacing: 0.08em;
    color: #64748b;
  }
  .sp-stop-name {
    font-size: 15px; font-weight: 700; color: #f1f5f9;
  }
  .sp-stop-banner-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .sp-stop-venue { font-size: 13px; color: #94a3b8; }
  .sp-stop-loc { font-size: 13px; color: #64748b; }
  .sp-stop-dates {
    font-size: 12px; color: #00D4FF; font-weight: 600;
    padding: 2px 8px;
    background: rgba(0,212,255,0.1);
    border-radius: 4px;
  }

  /* Filter Bar */
  .sp-filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .sp-filter-input {
    flex: 1;
    min-width: 160px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    font-family: 'Inter', sans-serif;
  }
  .sp-filter-input::placeholder { color: #4b5563; }
  .sp-filter-input:focus { border-color: rgba(0,212,255,0.4); }
  .sp-filter-select {
    padding: 8px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #94a3b8;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    appearance: none;
  }
  .sp-filter-count {
    font-size: 12px; color: #4b5563; white-space: nowrap;
  }

  /* Event Table */
  .sp-event-table-wrap {
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    overflow: hidden;
  }
  .sp-event-header-row {
    display: grid;
    grid-template-columns: 44px 1fr 100px 100px 90px 100px 90px 100px;
    gap: 0;
    padding: 0 12px;
    height: 36px;
    align-items: center;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #4b5563;
    text-transform: uppercase;
  }
  .sp-event-row {
    display: grid;
    grid-template-columns: 44px 1fr 100px 100px 90px 100px 90px 100px;
    gap: 0;
    padding: 0 12px;
    min-height: 52px;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.15s;
  }
  .sp-event-row:last-child { border-bottom: none; }
  .sp-event-row:hover { background: rgba(255,255,255,0.03); }
  .sp-event-main {
    background: rgba(234,179,8,0.04);
    border-left: 2px solid rgba(234,179,8,0.4);
  }
  .sp-event-hr {
    background: rgba(139,92,246,0.04);
    border-left: 2px solid rgba(139,92,246,0.3);
  }

  /* Column cells */
  .sp-col-num {
    display: flex; align-items: center; justify-content: center;
  }
  .sp-evt-num {
    font-size: 12px; color: #4b5563; font-weight: 700;
  }
  .sp-main-star {
    font-size: 14px; color: #eab308;
  }
  .sp-col-name {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px 0;
    min-width: 0;
  }
  .sp-evt-name {
    font-size: 13px; font-weight: 600; color: #e2e8f0;
    flex: 1; min-width: 120px;
    overflow: hidden; text-overflow: ellipsis;
  }
  .sp-game-badge {
    font-size: 10px; font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.04em;
    background: rgba(0,0,0,0.2);
  }
  .sp-flag-badge {
    font-size: 10px; font-weight: 600;
    padding: 2px 6px; border-radius: 4px;
    white-space: nowrap; flex-shrink: 0;
  }
  .sp-flag-main { background: rgba(234,179,8,0.15); color: #eab308; }
  .sp-flag-hr { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .sp-flag-reentry { background: rgba(59,130,246,0.15); color: #60a5fa; }
  .sp-flag-ladies { background: rgba(236,72,153,0.15); color: #ec4899; }
  .sp-flag-seniors { background: rgba(34,197,94,0.15); color: #22c55e; }

  .sp-col-buyin {
    display: flex; flex-direction: column; gap: 2px;
  }
  .sp-buyin-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid;
    font-size: 12px; font-weight: 700;
    white-space: nowrap;
    width: fit-content;
  }
  .sp-fee { font-size: 10px; color: #4b5563; }

  .sp-col-date {
    display: flex; flex-direction: column; gap: 2px;
  }
  .sp-date-val { font-size: 12px; color: #94a3b8; font-weight: 500; }
  .sp-time-val { font-size: 11px; color: #64748b; }

  .sp-chips-val { font-size: 12px; color: #94a3b8; }
  .sp-col-chips {
    display: flex; align-items: center; justify-content: flex-start;
  }
  .sp-levels-val { font-size: 12px; color: #94a3b8; }

  .sp-col-gtd {
    display: flex; align-items: center;
  }
  .sp-gtd-chip {
    font-size: 12px; font-weight: 700;
    color: #22c55e;
    padding: 2px 7px;
    background: rgba(34,197,94,0.1);
    border-radius: 5px;
  }
  .sp-na { color: #374151; font-size: 13px; }

  /* Empty state */
  .sp-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 48px 24px; text-align: center;
    color: #64748b; font-size: 14px;
  }
  .sp-data-note {
    margin-top: 12px;
    font-size: 12px; color: #64748b;
    text-align: center; padding: 8px;
    background: rgba(234,179,8,0.05);
    border-radius: 6px;
    border: 1px solid rgba(234,179,8,0.15);
  }

  /* Stop type badges */
  .sp-stop-type-badge {
    font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .sp-stype-current { background: rgba(0,212,255,0.15); color: #00D4FF; }
  .sp-stype-next { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .sp-stype-future { background: rgba(100,116,139,0.15); color: #64748b; }
  .sp-stype-past { background: rgba(71,85,105,0.1); color: #475569; }

  .sp-stop-event-count {
    font-size: 11px; color: #64748b;
    margin-top: 6px;
  }
  .sp-view-stop-btn {
    margin-top: 8px;
    padding: 5px 12px;
    border: 1px solid rgba(0,212,255,0.3);
    border-radius: 6px;
    background: rgba(0,212,255,0.08);
    color: #00D4FF;
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Inter', sans-serif;
    display: inline-block;
  }
  .sp-view-stop-btn:hover {
    background: rgba(0,212,255,0.15);
  }

  /* Mobile: collapse table to cards on small screens */
  @media (max-width: 640px) {
    .sp-event-header-row { display: none; }
    .sp-event-row {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      gap: 6px;
      padding: 12px 14px;
    }
    .sp-col-num { justify-content: flex-start; }
    .sp-col-name { flex-direction: column; align-items: flex-start; }
    .sp-col-buyin, .sp-col-date, .sp-col-time, .sp-col-latereg, .sp-col-chips, .sp-col-gtd {
      display: flex;
      justify-content: flex-start;
      margin-left: 44px;
    }
    .sp-col-buyin::before { content: 'Buy-In: '; font-size: 11px; color: #4b5563; min-width: 56px; }
    .sp-col-date::before { content: 'Date: '; font-size: 11px; color: #4b5563; min-width: 40px; }
    .sp-col-time::before { content: 'Time: '; font-size: 11px; color: #4b5563; min-width: 44px; }
    .sp-col-latereg::before { content: 'Late Reg: '; font-size: 11px; color: #4b5563; min-width: 48px; }
    .sp-col-chips::before { content: 'Chips: '; font-size: 11px; color: #4b5563; min-width: 44px; }
    .sp-col-gtd::before { content: 'GTD: '; font-size: 11px; color: #4b5563; min-width: 36px; }
    .sp-tabs-bar { padding: 0 10px; }
    .sp-tab { padding: 10px 14px; font-size: 13px; }
  }
`;
