/**
 * TOUR DETAIL PAGE - Tour information and series overview
 * Displays tour details, about info, upcoming series,
 * activity feed, tournament results, and notification opt-in
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import useHasMounted from '../../../src/hooks/useHasMounted';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import StopScheduleModal from '../../../src/components/tours/StopScheduleModal';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import TourPageSummary from '../../../src/components/seo/TourPageSummary';
import { tourSeo, tourSchema, registryCodeForTour, tourCanonical } from '../../../src/lib/seo/tourPageSeo';
import { DeepRouteNotice } from '../../../src/components/poker-near-me/DeepRouteSignalDeck';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from '../../../src/components/poker-near-me/PokerNearMeConsole';
import tourSourceRegistry from '../../../data/tour-source-registry.json';


const TOUR_COLORS = {
  'WSOP': { bg: '#b9943f', text: '#05080c', tone: 'gold' },
  'WPT': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'WSOPC': { bg: '#b9943f', text: '#05080c', tone: 'gold' },
  'MSPT': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'RGPS': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'PGT': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'TRITON': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'NAPT': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'CPPT': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'BPO': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'FPN': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'LIPS': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'ROUGHRIDER': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
  'default': { bg: '#123753', text: '#f4f7fb', tone: 'blue' },
};

const TOUR_TYPE_LABELS = {
  major: 'Major',
  circuit: 'Circuit',
  regional: 'Regional',
  high_roller: 'High Roller',
  grassroots: 'Grassroots',
  charity: 'Charity',
};

const ACTIVITY_TYPE_LABELS = {
  update: 'Update',
  announcement: 'Announcement',
  promotion: 'Promotion',
  result: 'Result',
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
  if (diffMins < 1) return 'Just Now';
  if (diffMins < 60) return diffMins + 'm Ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h Ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return diffDays + 'd Ago';
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths + 'mo Ago';
}

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

/**
 * AEO phase 3 (2026-09-18). This page had no data function at all, so Next
 * statically optimised it, router.isReady was false on the server, and the
 * guard below returned null for every crawler: 29 tour routes in the sitemap
 * answered 200 with zero words and no title.
 *
 * This resolves the tour's identity on the server. The bundled registry
 * covers 25 tours and needs no network; the sitemap also lists tours that
 * live only in Supabase, so those are looked up, briefly, and a failure
 * falls back to the code rather than taking the page down.
 *
 * 2026-09-19: THE SCHEDULE COMES WITH IT. The earlier note here said the
 * schedule stays on SWR. Measured afterwards, that left every tour page
 * serving the same 190 words with only the name changed, while the summary
 * copy promised a list of stops. The bundled registry holds 82 stops across
 * the tours it covers and needs no network, so the stops and the published
 * events are resolved here and rendered on the server. What lives only in
 * Supabase still arrives over SWR, unchanged.
 */
export async function getServerSideProps({ params, res }) {
  const code = String(params?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,32}$/.test(code)) return { notFound: true };

  const registryEntry = tourSourceRegistry?.tours?.[code] || null;
  let dbName = null;
  let dbType = null;
  let dbSite = null;
  let dbRow = null;

  // DOES THIS TOUR EXIST AT ALL (2026-09-29).
  //
  // A code the bundled registry does not carry and the catalog has never
  // heard of used to be answered with a complete tour page assembled out of
  // the code itself: /hub/tours/NOPE123 served "NOPE123 Poker Tour" with the
  // line "is a Poker Tour Followed On Smarter.Poker", status 200 and an
  // indexable canonical. That is a soft 404, and worse than a missing page,
  // because it states as fact that a tour exists. `identity` carries the
  // honest answer and the page below refuses to name a tour it cannot find.
  let identity = registryEntry ? 'known' : 'not-found';

  if (!registryEntry) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        const { createClient } = await import('@supabase/supabase-js');
        const { data, error } = await createClient(url, key)
          .from('tour_source_registry')
          .select('tour_name, tour_type, official_website, headquarters, established_year, notes, regions')
          .eq('tour_code', code)
          .maybeSingle();
        if (error) {
          console.warn('[tours] identity lookup failed:', error?.message || error);
          identity = 'unavailable';
        } else if (data) {
          identity = 'known';
        }
        dbName = data?.tour_name || null;
        dbType = data?.tour_type || null;
        dbSite = data?.official_website || null;
        dbRow = data || null;
      } else {
        // The catalog was never asked. Fifteen of the tours in the sitemap
        // live only in the database, so "no such tour" would be a guess
        // here; "come back" is the truth.
        identity = 'unavailable';
      }
    } catch (e) {
      console.warn('[tours] identity lookup failed:', e?.message || e);
      identity = 'unavailable';
    }
  }

  if (identity !== 'known') {
    // A 404 caches briefly, so one bad code costs one lookup and a mistake
    // clears itself; an unreachable catalog is a 503 that is not cached at
    // all. Same shape as pages/hub/series/[id].js.
    if (identity === 'not-found') {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'public, s-maxage=60');
    } else {
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', '120');
    }
    return {
      props: {
        seo: { code, name: null, type: null, website: null, canonical: tourCanonical(code) },
        stops: [],
        events: [],
        facts: null,
        identity,
      },
    };
  }

  // ONE URL FOR A TOUR (AEO phase 3, 2026-09-18). ROUGHRIDER and RRPT are
  // the same tour under two codes, and both pages declared themselves
  // canonical. The sitemap now offers only the registry code; this hands
  // the duplicate's authority to it rather than splitting the two.
  const seo = tourSeo(code, registryEntry, dbName, dbType);
  const canonicalCode = registryCodeForTour(
    { code, name: seo.name, website: dbSite },
    tourSourceRegistry?.tours,
  );
  if (canonicalCode && canonicalCode !== code) seo.canonical = tourCanonical(canonicalCode);

  // Only fields the registry actually holds are passed through. Caps are
  // generous enough to carry every tour in the bundle (17 stops is the most
  // any tour has; WSOP publishes 100 events) without letting one grow the
  // server HTML without limit.
  const stops = Array.isArray(registryEntry?.stops_2026)
    ? registryEntry.stops_2026.slice(0, 40).map((stop) => ({
      name: String(stop?.name || '').trim(),
      venue: String(stop?.venue || '').trim() || null,
      location: String(stop?.location || '').trim() || null,
      dates: String(stop?.dates || '').trim() || null,
      buyin_range: stop?.buyin_range || null,
      buyin: Number.isFinite(stop?.buyin) ? stop.buyin : null,
      events_count: Number.isFinite(stop?.events_count) ? stop.events_count : null,
      flagship: stop?.flagship || null,
      status: stop?.status || null,
    })).filter((stop) => stop.name)
    : [];
  const events = Array.isArray(registryEntry?.series_2026)
    ? registryEntry.series_2026.slice(0, 30).map((event) => ({
      name: String(event?.name || '').trim(),
      dates: String(event?.dates || '').trim() || null,
      buyin: Number.isFinite(event?.buyin) ? event.buyin : null,
      game: event?.game || null,
    })).filter((event) => event.name)
    : [];

  // WHAT IS KNOWN ABOUT THE TOUR ITSELF. Fifteen of the twenty eight tours
  // in the sitemap live only in Supabase and have no stops anywhere, so
  // without these the pages for LODGE, VENETIAN, SEMINOLE and the rest are
  // the same words with a different name. Measured on production, three of
  // them were byte identical below the title.
  const buyins = registryEntry?.typical_buyins || null;
  const facts = {
    headquarters: (registryEntry?.headquarters || dbRow?.headquarters || '').trim() || null,
    established: registryEntry?.established || dbRow?.established_year || null,
    regions: Array.isArray(registryEntry?.regions)
      ? registryEntry.regions.slice(0, 8)
      : (Array.isArray(dbRow?.regions) ? dbRow.regions.slice(0, 8) : []),
    notes: (registryEntry?.notes || dbRow?.notes || '').trim() || null,
    buyinMin: Number.isFinite(buyins?.min) ? buyins.min : null,
    buyinMax: Number.isFinite(buyins?.max) ? buyins.max : null,
    mainEvent: Number.isFinite(buyins?.main_event) ? buyins.main_event : null,
  };

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  return { props: { seo, stops, events, facts } };
}

export default function TourDetailPage({ seo, stops = [], events = [], facts = null, identity = 'known' }) {
  const hasMounted = useHasMounted();
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
  const swrKey = code && identity === 'known'
    ? `/api/poker/tours?tour_code=${encodeURIComponent(code)}&include_series=true`
    : null;
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
        setShareMessage('Link Copied');
        setTimeout(() => setShareMessage(''), 2000);
      }).catch(() => {
        setShareMessage('Failed To Copy');
        setTimeout(() => setShareMessage(''), 2000);
      });
    } else {
      setShareMessage('Copy Not Supported');
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

  // NOTHING TRUE TO SHOW (2026-09-29). A code with no tour behind it, or a
  // catalog that could not be reached, gets a painted answer that names no
  // tour, carries noindex, and offers the real places to go next. The server
  // has already answered 404 or 503; this is what a reader sees.
  if (identity !== 'known') {
    const missing = identity === 'not-found';
    return (
      <>
        <SEOHead
          title={missing ? 'Tour Not Found' : 'Tour Directory Unavailable'}
          description={missing
            ? 'This poker tour code is not in the Smarter.Poker tour directory. Browse every poker tour and stop schedule on Smarter.Poker instead.'
            : 'The Smarter.Poker tour directory could not be reached. Browse every poker tour and stop schedule on Smarter.Poker.'}
          noindex={true}
        />
        <UniversalHeader
          pageDepth={2}
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => {
            router.back();
          }}
        />
        <PokerNearMeFamilyNav />
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="tour-page" data-pnm-secondary-foundation="interaction-v1">
          <DeepRouteNotice
            eyebrow="Poker Tours"
            title={missing ? 'Tour Not Found' : 'Directory Unavailable'}
            titleId="tour-notice-title"
            pill={missing ? 'Not Found' : 'Retry Soon'}
            pillInk={missing ? 'red' : 'gold'}
            crest="locator"
            body={missing
              ? `No poker tour is published under the code ${seo?.code || ''}. Smarter.Poker does not invent a tour to fill a page, so there is nothing here to show.`
              : 'The tour directory could not be reached just now, so this page cannot say whether any tour uses this code. Please try again in a few minutes.'}
            detail={missing ? 'Every tour Smarter.Poker tracks is listed in the tour directory.' : null}
            links={[
              { href: '/hub/poker-tours', label: 'All Poker Tours' },
              { href: '/hub/poker-series', label: 'All Poker Series' },
              { href: '/hub/poker-near-me/lobby', label: 'Poker Near Me' },
            ]}
          />
        </main>
      </>
    );
  }

  // The head and the summary are built from props alone, not from
  // router.query and not from SWR, so the server HTML, the hydrating render
  // and every later render agree, and they are present whether or not the
  // rest of the page ever paints. Deriving the name from SWR instead would
  // rewrite the title and the JSON-LD after hydration, which no crawler
  // would ever see and which only risks a mismatch.
  const seoHead = (
    <SEOHead
      title={seo.title}
      description={seo.description}
      canonical={seo.canonical}
      jsonLd={tourSchema({ ...seo, stops })}
    />
  );
  const seoSummary = (
    <TourPageSummary
      code={seo.code}
      name={seo.name}
      type={seo.type}
      website={seo.website}
      stops={stops}
      events={events}
      facts={facts}
    />
  );

  // Server render, and the hydrating render, take this branch. The summary
  // sits at the foot of the full page below, where it reads as a footer
  // rather than as something wedged above the header.
  if (!router.isReady) return <>{seoHead}{seoSummary}</>;

  return (
    <>
      {seoHead}

      <UniversalHeader 
        pageDepth={2} 
        onMenuClick={() => setMenuOpen(true)}
        onBackClick={() => {
          router.back();
        }}
      />
      <PokerNearMeFamilyNav />

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

      <main className="tour-page" data-pnm-secondary-foundation="interaction-v1">
        {/* The spinner is for the reader who is waiting. On the server
            nothing is waiting, and the summary already carries the stops, so
            saying it is still loading contradicts the page it sits in
            (AEO phase 3, 2026-09-19). */}
        {hasMounted && loading && (
          <PokerNearMePanelShell as="section" className="tour-state" bodyClassName="tour-state__body" aria-live="polite">
            <PokerNearMeConsoleIcon name="calendar" className="tour-state__icon" />
            <p className="loading-text">Loading Tour Details...</p>
          </PokerNearMePanelShell>
        )}

        {error && !loading && (
          <PokerNearMePanelShell as="section" className="tour-state" bodyClassName="tour-state__body" role="alert">
            <PokerNearMeConsoleIcon name="alert" className="tour-state__icon" />
            <h2 className="error-title">Tour Not Found</h2>
            <p className="error-text">{error?.message || 'An Error Occurred Loading This Tour.'}</p>
          </PokerNearMePanelShell>
        )}

        {tour && !loading && (
          <>
            {/* Header Section */}
            <PokerNearMePanelShell as="section" className="tour-header" bodyClassName="tour-header__body">
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
                  <h2 className="tour-name">{tour.tour_name}</h2>
                  <div className="header-actions">
                    <button
                      type="button"
                      className={'tour-action follow-btn' + (isFollowed ? ' followed' : '')}
                      onClick={handleFollow}
                    >
                      <PokerNearMeConsoleIcon name="saved" className="tour-action__icon" />
                      {isFollowed ? 'Following' : 'Follow'}
                      {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                    </button>
                    <button type="button" className="tour-action share-btn" onClick={handleShare}>
                      <PokerNearMeConsoleIcon name="share" className="tour-action__icon" />
                      Share
                    </button>
                    {shareMessage && <span className="share-message">{shareMessage}</span>}
                  </div>
                </div>

                <div className="badges-row">
                  <span className="tour-code-badge" data-tone={tourColor.tone}>
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
                    <PokerNearMeConsoleIcon name="location" className="tour-meta-icon" />
                    <span>{tour.headquarters}</span>
                  </div>
                )}
              </div>
            </PokerNearMePanelShell>

                        {/* ══ SMARTER.POKER STANDARD: Tab Navigation ══ */}
            <PokerNearMePanelShell as="section" className="sp-tabs-bar" bodyClassName="sp-tabs-shell__body" aria-label="Tour Sections">
              <div className="sp-tabs-inner" aria-label="Tour Sections">
                {[
                  { id: 'schedule', label: currentStopType === 'current' ? 'Current Event' : currentStopType === 'next' ? 'Next Event' : 'Event Schedule' },
                  { id: 'stops',    label: 'All Stops',      count: allStops.length || (tour.stops_2026||[]).length },
                  { id: 'about',    label: 'About' },
                  { id: 'results',  label: 'Results', count: results.length || null },
                ].map(tab => (
                  <button
                    type="button"
                    key={tab.id}
                    aria-pressed={activeTab === tab.id}
                    className={`sp-tab${activeTab === tab.id ? ' sp-tab-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {tab.count > 0 && <span className="sp-tab-count">{tab.count}</span>}
                  </button>
                ))}
              </div>
            </PokerNearMePanelShell>

            {/* ══ TAB: EVENT SCHEDULE (Smarter.Poker Standard) ══ */}
            {activeTab === 'schedule' && (
            <PokerNearMePanelShell as="section" className="sp-schedule-section" bodyClassName="sp-schedule-section__body">
              {/* Current / Next Stop Banner */}
              {currentStop && (
                <PokerNearMePanelShell
                  as="article"
                  className={`sp-stop-banner sp-stop-banner-clickable ${currentStopType === 'current' ? 'sp-stop-live' : 'sp-stop-next'}`}
                  bodyClassName="sp-stop-banner__body"
                  onClick={() => setSelectedStop(currentStop)}
                  role="button" tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedStop(currentStop);
                    }
                  }}
                >
                  <div className="sp-stop-banner-left">
                    <PokerNearMeConsoleIcon name="live-games" className="sp-stop-status-icon" />
                    <span className="sp-stop-status-label">
                      {currentStopType === 'current' ? 'Live Now' : 'Next Stop'}
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
                      <PokerNearMeConsoleIcon name="calendar" className="tour-inline-icon" />
                      View Full Schedule
                    </span>
                  </div>
                </PokerNearMePanelShell>
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
                          placeholder="Search Events"
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
                        <span className="sp-filter-count">{filtered.length} Events</span>
                      </div>
                    )}

                    {/* ── Smarter.Poker Standard Event Table ── */}
                    {filtered.length === 0 && (
                      <div className="sp-empty">
                        <PokerNearMeConsoleIcon name="calendar" className="tour-state__icon" />
                        <p>{eventFilter ? `No Events Found Matching "${eventFilter}".` : 'No Events Found. Schedule Coming Soon.'}</p>
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
                          const isMain = evt.is_main_event || (evt.event_name||'').toLowerCase().includes('main event');
                          const isHR = evt.is_high_roller || (evt.buy_in >= 25000);
                          return (
                            <div key={idx} className={`sp-event-row${isMain ? ' sp-event-main' : ''}${isHR ? ' sp-event-hr' : ''}`}>
                              <div className="sp-col-num">
                                {isMain ? (
                                  <PokerNearMeConsoleIcon name="trophy" className="sp-main-star" />
                                ) : (
                                  <span className="sp-evt-num">{evt.event_number || (idx+1)}</span>
                                )}
                              </div>
                              <div className="sp-col-name">
                                <span className="sp-evt-name">{evt.event_name}</span>
                                <span className="sp-game-badge">
                                  {evt.game_type || 'NLH'}
                                </span>
                                {evt.re_entry && <span className="sp-flag-badge sp-flag-reentry">Re-Entry</span>}
                                {isMain && <span className="sp-flag-badge sp-flag-main">Main Event</span>}
                                {isHR && !isMain && <span className="sp-flag-badge sp-flag-hr">High Roller</span>}
                                {evt.is_ladies_event && <span className="sp-flag-badge sp-flag-ladies">Ladies</span>}
                                {evt.is_seniors_event && <span className="sp-flag-badge sp-flag-seniors">Seniors</span>}
                              </div>
                              <div className="sp-col-buyin">
                                <span className="sp-buyin-chip" data-tier={tier}>
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
                                <span className="sp-latereg-val">{evt.late_registration || '-'}</span>
                              </div>
                              <div className="sp-col-chips">
                                <span className="sp-chips-val">{evt.starting_chips_display || (evt.starting_chips ? evt.starting_chips.toLocaleString() : 'TBD')}</span>
                              </div>
                              <div className="sp-col-gtd">
                                {evt.guarantee ? (
                                  <span className="sp-gtd-chip">{formatMoney(evt.guarantee)}</span>
                                ) : <span className="sp-na">-</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {srcEvents.length > 0 && srcEvents[0]?.data_quality === 'pending' && (
                      <p className="sp-data-note"><PokerNearMeConsoleIcon name="alert" className="tour-inline-icon" />Showing Registry Data - Live Schedule Scrape Pending</p>
                    )}
                  </>
                );
              })()}
            </PokerNearMePanelShell>
            )}

            {/* ══ TAB: ALL STOPS ══ */}
            {activeTab === 'stops' && (
            <PokerNearMePanelShell as="section" className="tour-series" bodyClassName="tour-section__body">
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
                  <PokerNearMeConsoleIcon name="calendar" className="tour-state__icon" />
                  <p>No Upcoming Stops Announced Yet.</p>
                  <p className="empty-subtext">Check Back Soon For Updates.</p>
                </div>
              )}

              {/* All stops list */}
              {(allStops.length > 0 ? allStops : []).length === 0 && (!tour.upcoming_series || tour.upcoming_series.length === 0) && (!tour.stops_2026 || tour.stops_2026.length === 0) && (
                <div className="empty-state"><p>No Stops Announced Yet.</p></div>
              )}
              <div className="series-grid">
                {/* Prefer registry venue stops over generic consolidated DB stops (e.g. "RGPS 2026") */}
                {(() => {
                  // If all DB stops are generic consolidated (no venue/city data), prefer registry
                  const hasGranularDbStops = allStops.some(s => s.stop_city || s.stop_venue);
                  return hasGranularDbStops ? allStops : [];
                })().map((s, idx) => (
                  <PokerNearMePanelShell
                    as="article"
                    key={'db-' + idx}
                    className="series-card series-card-clickable"
                    bodyClassName="series-card__body"
                    onClick={() => setSelectedStop(s)}
                    role="button" tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedStop(s);
                      }
                    }}
                  >
                    <div className="series-card-header">
                      <h3 className="series-name">{s.stop_name || s.short_name || s.name}</h3>
                      {s.stop_type && <span className={`sp-stop-type-badge sp-stype-${s.stop_type}`}>{s.stop_type === 'current' ? 'Live Now' : s.stop_type === 'next' ? 'Next' : s.stop_type}</span>}
                    </div>
                    {(s.stop_city || s.stop_state || s.city || s.state) && (
                      <div className="series-location">
                        <PokerNearMeConsoleIcon name="location" className="tour-inline-icon" />
                        <span>{[s.stop_city||s.city, s.stop_state||s.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {s.stop_venue && <div className="series-venue"><span>{s.stop_venue}</span></div>}
                    <div className="series-dates">
                      <PokerNearMeConsoleIcon name="calendar" className="tour-inline-icon" />
                      <span>{formatDateRange(s.stop_start_date, s.stop_end_date) || s.dates || 'TBD'}</span>
                    </div>
                    {s.events?.length > 0 && <div className="sp-stop-event-count">{s.events.length} Events</div>}
                    <div className="sp-view-sched-cta">
                      <PokerNearMeConsoleIcon name="calendar" className="tour-inline-icon" />
                      View Full Schedule
                    </div>
                  </PokerNearMePanelShell>
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
                    <PokerNearMePanelShell
                      as="article"
                      key={'reg-' + idx}
                      className="series-card series-card-clickable"
                      bodyClassName="series-card__body"
                      onClick={() => setSelectedStop(stopShape)}
                      role="button" tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedStop(stopShape);
                        }
                      }}
                    >
                      <div className="series-card-header"><h3 className="series-name">{s.name}</h3></div>
                      {s.location && <div className="series-location"><PokerNearMeConsoleIcon name="location" className="tour-inline-icon" /><span>{s.location}</span></div>}
                      <div className="series-dates"><PokerNearMeConsoleIcon name="calendar" className="tour-inline-icon" /><span>{s.dates || 'TBD'}</span></div>
                      <div className="sp-view-sched-cta">
                        <PokerNearMeConsoleIcon name="calendar" className="tour-inline-icon" />
                        View Schedule
                      </div>
                    </PokerNearMePanelShell>
                  );
                })}
              </div>
            </PokerNearMePanelShell>
            )}

            {/* ══ TAB: ABOUT ══ */}
            {activeTab === 'about' && (
            <PokerNearMePanelShell as="section" className="tour-about" bodyClassName="tour-section__body">
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
                      <PokerNearMeConsoleIcon name="globe" className="tour-inline-icon" />
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
            </PokerNearMePanelShell>
            )}

            {/* ══ TAB: RESULTS ══ */}
            {activeTab === 'results' && (
            <>
              <PokerNearMePanelShell as="section" className="tour-activity" bodyClassName="tour-section__body">
                <h2 className="section-title">Latest Updates</h2>
                <div className="activity-container">
                  {activities.length === 0 && (
                    <div className="empty-state">
                      <PokerNearMeConsoleIcon name="info" className="tour-state__icon" />
                      <p>No Updates Yet.</p>
                    </div>
                  )}
                  {activities.length > 0 && (
                    <div className="activity-list">
                      {activities.map((activity, idx) => {
                        const typeKey = ACTIVITY_TYPE_LABELS[activity.type] ? activity.type : 'update';
                        return (
                          <div key={idx} className="activity-item">
                            <div className="activity-header">
                              <span className="activity-type-badge" data-activity-type={typeKey}>
                                {ACTIVITY_TYPE_LABELS[typeKey]}
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
              </PokerNearMePanelShell>
              <PokerNearMePanelShell as="section" className="tour-results" bodyClassName="tour-section__body">
                <h2 className="section-title">Recent Results</h2>
                <div className="results-container">
                  {results.length === 0 && (
                    <div className="empty-state">
                      <PokerNearMeConsoleIcon name="trophy" className="tour-state__icon" />
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
              </PokerNearMePanelShell>
            </>
            )}

            {/* Notifications — always visible */}
            <PokerNearMePanelShell as="section" className="tour-notifications" bodyClassName="tour-section__body">
              <div className="notif-card">
                <div className="notif-content">
                  <p className="notif-text">{'Get Notified About New ' + tour.tour_name + ' Events And Results'}</p>
                  {notifPermission === 'granted' ? (
                    <span className="notif-enabled"><PokerNearMeConsoleIcon name="saved" className="tour-inline-icon" />Notifications Enabled</span>
                  ) : (
                    <button type="button" className="notif-btn" onClick={handleEnableNotifications}>
                      <PokerNearMeConsoleIcon name="saved" className="tour-inline-icon" />
                      Enable Notifications
                    </button>
                  )}
                </div>
              </div>
            </PokerNearMePanelShell>
          </>
        )}
      </main>

      {seoSummary}

      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: styles }} />
    </>
  );
}

const styles = `
  :root {
    --tour-black: #020407;
    --tour-black-raised: #071018;
    --tour-silver: #c6d0db;
    --tour-muted: #8f9aa8;
    --tour-dim: #65717f;
    --tour-blue: #31a8ff;
    --tour-blue-soft: #8fd4ff;
    --tour-gold: #d6b76a;
    --tour-alert: #ff5b6e;
  }

  .tour-page {
    min-height: 100vh;
    box-sizing: border-box;
    overflow-x: clip;
    padding: 20px 0 96px;
    background: var(--tour-black);
    color: var(--tour-silver);
    font-family: var(--font-rajdhani), Rajdhani, var(--font-inter), Inter, sans-serif;
  }

  body.world-poker-near-me .tour-page {
    background: var(--tour-black) !important;
  }

  body.world-poker-near-me .tour-page .pnc-panel.sp-tabs-bar {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .tour-page .sp-tabs-inner {
    gap: 8px !important;
    padding: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .tour-page .sp-tab,
  body.world-poker-near-me .tour-page .tour-action,
  body.world-poker-near-me .tour-page .notif-btn {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / contain no-repeat !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .tour-page .sp-tab-active,
  body.world-poker-near-me .tour-page .tour-action.follow-btn,
  body.world-poker-near-me .tour-page .notif-btn {
    background-image: url('/images/pnm-console/painted-controls-v1/button-primary.png') !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-bar {
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-input,
  body.world-poker-near-me .tour-page .sp-filter-select {
    height: auto !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-select {
    width: min(100%, 260px) !important;
    padding: 0 14% !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-input {
    padding: 0 10% !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-select:is(:hover, :focus),
  body.world-poker-near-me .tour-page .sp-filter-input:is(:hover, :focus) {
    border: 0 !important;
    outline: 0 !important;
  }

  body.world-poker-near-me .tour-page .sp-filter-select:focus-visible,
  body.world-poker-near-me .tour-page .sp-filter-input:focus-visible {
    outline: 2px solid var(--tour-blue-soft) !important;
    outline-offset: -5px !important;
  }

  .tour-page *,
  .tour-page *::before,
  .tour-page *::after {
    box-sizing: border-box;
  }

  .tour-page > .pnc-panel,
  .tour-page > .tour-header {
    width: min(calc(100% - 24px), 940px);
    margin: 0 auto 18px;
  }

  .tour-state__body {
    display: grid;
    justify-items: center;
    gap: 10px;
    min-height: 240px;
    align-content: center;
    padding: 28px clamp(18px, 4vw, 42px);
    text-align: center;
  }

  .tour-state__icon {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    opacity: 0.84;
  }

  .loading-text,
  .error-text {
    margin: 0;
    color: var(--tour-muted);
    font: 600 14px/1.5 var(--font-inter), Inter, sans-serif;
  }

  .error-title {
    margin: 0;
    color: #f4f7fb;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tour-header__body {
    display: grid;
    gap: 16px;
    padding: 24px clamp(18px, 4vw, 40px) 22px;
  }

  .tour-header__body .header-content {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .breadcrumb-nav {
    min-width: 0;
  }

  .breadcrumb-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .breadcrumb-item {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    color: var(--tour-dim);
    font: 700 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .breadcrumb-link {
    color: var(--tour-muted);
    text-decoration: none;
  }

  .breadcrumb-link:focus-visible {
    outline: 2px solid var(--tour-blue-soft);
    outline-offset: 3px;
  }

  .breadcrumb-sep {
    margin-left: 6px;
    color: var(--tour-dim);
  }

  .breadcrumb-current {
    max-width: min(48vw, 360px);
    overflow: hidden;
    color: var(--tour-blue-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    min-width: 0;
  }

  .tour-name {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: #f4f7fb;
    font-size: clamp(28px, 5vw, 42px);
    font-weight: 700;
    letter-spacing: 0.015em;
    line-height: 1.02;
  }

  .header-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .tour-action,
  .notif-btn,
  .sp-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    aspect-ratio: 348 / 114;
    padding: 0 17px;
    border: 0;
    border-radius: 0;
    background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / contain no-repeat;
    box-shadow: none;
    color: var(--tour-silver);
    cursor: pointer;
    font: 800 12px/1 var(--font-rajdhani), Rajdhani, sans-serif;
    letter-spacing: 0.1em;
    text-shadow: 0 1px 0 #000;
    text-transform: uppercase;
    touch-action: manipulation;
  }

  .tour-action {
    width: 156px;
    max-width: 100%;
  }

  .tour-action.follow-btn,
  .sp-tab-active,
  .notif-btn {
    background-image: url('/images/pnm-console/painted-controls-v1/button-primary.png');
    color: #f4f7fb;
  }

  .tour-action:active,
  .notif-btn:active,
  .sp-tab:active,
  .series-card-clickable:active,
  .sp-stop-banner-clickable:active {
    filter: brightness(1.16);
  }

  .tour-action:focus-visible,
  .notif-btn:focus-visible,
  .sp-tab:focus-visible,
  .series-card-clickable:focus-visible,
  .sp-stop-banner-clickable:focus-visible,
  .sp-filter-input:focus-visible,
  .sp-filter-select:focus-visible {
    outline: 2px solid var(--tour-blue-soft);
    outline-offset: -5px;
  }

  .tour-action__icon {
    width: 19px;
    height: 19px;
    flex: 0 0 19px;
  }

  .follow-count {
    padding-left: 7px;
    border-left: 1px solid #6d7b89;
    color: inherit;
  }

  .share-message {
    width: 100%;
    color: var(--tour-blue-soft);
    font: 700 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.05em;
    text-align: right;
  }

  .badges-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0;
    min-height: 30px;
  }

  .tour-code-badge,
  .tour-type-badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 14px;
    border-left: 1px solid #3a4652;
    color: var(--tour-muted);
    font: 800 12px/1 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .tour-code-badge[data-tone='gold'] {
    color: var(--tour-gold);
  }

  .tour-code-badge[data-tone='blue'] {
    color: var(--tour-blue-soft);
  }

  .headquarters,
  .series-location,
  .series-dates,
  .series-venue {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--tour-muted);
    font: 600 13px/1.4 var(--font-inter), Inter, sans-serif;
  }

  .tour-meta-icon,
  .tour-inline-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
  }

  .sp-tabs-shell__body {
    padding: 14px clamp(14px, 3vw, 28px);
  }

  .sp-tabs-inner {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .sp-tab {
    width: 100%;
    min-width: 0;
    white-space: nowrap;
  }

  .sp-tab-count {
    padding-left: 6px;
    border-left: 1px solid #6d7b89;
    color: inherit;
  }

  .sp-schedule-section__body,
  .tour-section__body {
    display: grid;
    gap: 18px;
    padding: 22px clamp(18px, 4vw, 38px) 26px;
  }

  .sp-stop-banner {
    width: 100%;
    margin: 0;
    cursor: pointer;
  }

  .sp-stop-banner__body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 16px clamp(16px, 3vw, 28px);
  }

  .sp-stop-banner-left,
  .sp-stop-banner-right {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px 12px;
    min-width: 0;
  }

  .sp-stop-banner-right {
    justify-content: flex-end;
  }

  .sp-stop-status-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
  }

  .sp-stop-status-label {
    color: var(--tour-blue-soft);
    font: 800 12px/1 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .sp-stop-next .sp-stop-status-label {
    color: var(--tour-gold);
  }

  .sp-stop-name {
    color: #f4f7fb;
    font-size: 16px;
    font-weight: 800;
  }

  .sp-stop-venue,
  .sp-stop-loc {
    color: var(--tour-muted);
    font: 600 13px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .sp-stop-dates {
    color: var(--tour-blue-soft);
    font: 800 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .sp-view-sched-hint,
  .sp-view-sched-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--tour-blue-soft);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .sp-filter-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .sp-filter-input,
  .sp-filter-select {
    min-width: 0;
    min-height: 44px;
    border: 0;
    border-radius: 0;
    background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat;
    box-shadow: none;
    color: #f4f7fb;
    font: 700 13px/1 var(--font-inter), Inter, sans-serif;
    outline: 0;
  }

  .sp-filter-input {
    flex: 1 1 320px;
    aspect-ratio: 1829 / 313;
    padding: 0 10%;
  }

  .sp-filter-select {
    flex: 0 1 260px;
    aspect-ratio: 1829 / 313;
    padding: 0 14%;
    appearance: none;
    cursor: pointer;
  }

  .sp-filter-input::placeholder {
    color: var(--tour-dim);
  }

  .sp-filter-select option {
    background: var(--tour-black-raised);
    color: #f4f7fb;
  }

  .sp-filter-count {
    color: var(--tour-dim);
    font: 700 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .sp-event-table-wrap {
    min-width: 0;
    overflow-x: auto;
    scrollbar-color: #30516c var(--tour-black);
  }

  .sp-event-header-row,
  .sp-event-row {
    display: grid;
    grid-template-columns: 44px minmax(190px, 1fr) 92px 100px 86px 92px 82px 92px;
    align-items: center;
    min-width: 800px;
    padding: 0 10px;
  }

  .sp-event-header-row {
    min-height: 38px;
    border-bottom: 1px solid #33404c;
    color: var(--tour-dim);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .sp-event-row {
    min-height: 58px;
    border-bottom: 1px solid #202a33;
  }

  .sp-event-row:last-child {
    border-bottom: 0;
  }

  .sp-event-main {
    border-left: 2px solid var(--tour-gold);
  }

  .sp-event-hr:not(.sp-event-main) {
    border-left: 2px solid var(--tour-blue);
  }

  .sp-col-num {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sp-main-star {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
  }

  .sp-evt-num,
  .sp-fee,
  .sp-time-val,
  .sp-latereg-val,
  .sp-na {
    color: var(--tour-dim);
    font: 700 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .sp-col-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px 7px;
    min-width: 0;
    padding: 8px 8px 8px 0;
  }

  .sp-evt-name {
    flex: 1 1 150px;
    min-width: 120px;
    overflow: hidden;
    color: var(--tour-silver);
    font: 700 13px/1.3 var(--font-inter), Inter, sans-serif;
    text-overflow: ellipsis;
  }

  .sp-game-badge,
  .sp-flag-badge,
  .sp-buyin-chip,
  .sp-gtd-chip,
  .sp-stop-type-badge {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding-left: 7px;
    border-left: 1px solid #526170;
    color: var(--tour-blue-soft);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .sp-flag-main,
  .sp-buyin-chip[data-tier='high'],
  .sp-buyin-chip[data-tier='super'],
  .sp-buyin-chip[data-tier='ultra'],
  .sp-gtd-chip {
    border-left-color: var(--tour-gold);
    color: var(--tour-gold);
  }

  .sp-flag-hr,
  .sp-flag-reentry {
    color: var(--tour-blue-soft);
  }

  .sp-flag-ladies,
  .sp-flag-seniors,
  .sp-buyin-chip[data-tier='tbd'],
  .sp-buyin-chip[data-tier='value'] {
    color: var(--tour-muted);
  }

  .sp-col-buyin,
  .sp-col-date,
  .sp-col-time,
  .sp-col-latereg,
  .sp-col-chips,
  .sp-col-gtd {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .sp-date-val,
  .sp-chips-val {
    color: var(--tour-muted);
    font: 600 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .sp-empty,
  .empty-state {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 34px 18px;
    color: var(--tour-muted);
    text-align: center;
  }

  .sp-empty p,
  .empty-state p {
    margin: 0;
    color: inherit;
    font: 600 14px/1.5 var(--font-inter), Inter, sans-serif;
  }

  .empty-subtext {
    color: var(--tour-dim) !important;
    font-size: 13px !important;
  }

  .sp-data-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid #35414c;
    color: var(--tour-gold);
    font: 700 12px/1.4 var(--font-inter), Inter, sans-serif;
    text-align: center;
  }

  .section-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0;
    color: #f4f7fb;
    font-size: 21px;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .series-count {
    padding-left: 9px;
    border-left: 1px solid #526170;
    color: var(--tour-blue-soft);
    font-size: 13px;
  }

  .series-grid {
    display: grid;
    gap: 12px;
  }

  .series-card {
    width: 100%;
    margin: 0;
    cursor: pointer;
  }

  .series-card__body {
    display: grid;
    gap: 9px;
    padding: 18px clamp(16px, 3vw, 28px);
  }

  .series-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .series-name {
    min-width: 0;
    margin: 0;
    color: #f4f7fb;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.25;
  }

  .series-venue {
    color: var(--tour-dim);
    font-size: 12px;
  }

  .sp-stop-type-badge {
    flex: 0 0 auto;
    text-transform: uppercase;
  }

  .sp-stype-current {
    color: var(--tour-blue-soft);
  }

  .sp-stype-next {
    color: var(--tour-gold);
  }

  .sp-stype-future,
  .sp-stype-past {
    color: var(--tour-muted);
  }

  .sp-stop-event-count {
    color: var(--tour-dim);
    font: 700 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }

  .about-item {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 15px 18px;
    border-top: 1px solid #27333e;
  }

  .about-item:nth-child(even) {
    border-left: 1px solid #27333e;
  }

  .about-item-full {
    grid-column: 1 / -1;
    border-left: 0 !important;
  }

  .about-label,
  .result-label {
    color: var(--tour-dim);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .about-value,
  .about-notes {
    margin: 0;
    color: var(--tour-silver);
    font: 600 14px/1.55 var(--font-inter), Inter, sans-serif;
    overflow-wrap: anywhere;
  }

  .main-event-buyin {
    color: var(--tour-gold);
    font-weight: 800;
  }

  .about-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--tour-blue-soft);
    font: 700 14px/1.4 var(--font-inter), Inter, sans-serif;
    overflow-wrap: anywhere;
    text-decoration: none;
  }

  .about-link:focus-visible {
    outline: 2px solid var(--tour-blue-soft);
    outline-offset: 3px;
  }

  .regions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .region-tag {
    padding-left: 8px;
    border-left: 1px solid #526170;
    color: var(--tour-muted);
    font: 700 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .activity-container,
  .results-container {
    min-width: 0;
  }

  .activity-list,
  .results-grid {
    display: grid;
  }

  .activity-item,
  .result-card {
    display: grid;
    gap: 9px;
    padding: 16px 4px;
    border-bottom: 1px solid #27333e;
  }

  .activity-item:last-child,
  .result-card:last-child {
    border-bottom: 0;
  }

  .activity-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .activity-type-badge {
    padding-left: 8px;
    border-left: 1px solid #526170;
    color: var(--tour-blue-soft);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .activity-type-badge[data-activity-type='result'] {
    color: var(--tour-gold);
  }

  .activity-time,
  .result-event-date {
    color: var(--tour-dim);
    font: 700 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .activity-content {
    margin: 0;
    color: var(--tour-silver);
    font: 600 14px/1.55 var(--font-inter), Inter, sans-serif;
  }

  .result-event-name {
    color: #f4f7fb;
    font: 800 15px/1.35 var(--font-inter), Inter, sans-serif;
  }

  .result-details {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 24px;
  }

  .result-row {
    display: grid;
    gap: 3px;
    min-width: 90px;
  }

  .result-winner,
  .result-prize,
  .result-value {
    color: var(--tour-silver);
    font: 700 14px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .result-prize {
    color: var(--tour-gold);
  }

  .notif-card {
    min-width: 0;
  }

  .notif-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .notif-text {
    margin: 0;
    color: var(--tour-muted);
    font: 700 14px/1.5 var(--font-inter), Inter, sans-serif;
  }

  .notif-btn {
    flex: 0 0 204px;
    width: 204px;
    max-width: 100%;
  }

  .notif-enabled {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--tour-blue-soft);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 760px) {
    .tour-page {
      padding-top: 12px;
    }

    .tour-page > .pnc-panel,
    .tour-page > .tour-header {
      width: min(calc(100% - 16px), 940px);
      margin-bottom: 12px;
    }

    .header-top-row {
      display: grid;
    }

    .header-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .tour-action {
      flex: 1 1 145px;
      width: auto;
      max-width: 180px;
    }

    .share-message {
      text-align: left;
    }

    .sp-tabs-inner {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    body.world-poker-near-me .tour-page .sp-tabs-inner {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .sp-stop-banner__body {
      display: grid;
    }

    .sp-stop-banner-right {
      justify-content: flex-start;
    }

    .sp-filter-input,
    .sp-filter-select {
      flex-basis: 100%;
      width: 100%;
    }

    body.world-poker-near-me .tour-page .sp-filter-select {
      width: 100% !important;
    }

    .sp-filter-select {
      aspect-ratio: 1829 / 313;
    }

    .sp-event-table-wrap {
      overflow: visible;
    }

    .sp-event-header-row {
      display: none;
    }

    .sp-event-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 7px;
      min-width: 0;
      padding: 14px 8px;
    }

    .sp-col-num {
      justify-content: flex-start;
    }

    .sp-col-name {
      display: flex;
      align-items: flex-start;
      flex-direction: column;
      padding: 0;
    }

    .sp-col-buyin,
    .sp-col-date,
    .sp-col-time,
    .sp-col-latereg,
    .sp-col-chips,
    .sp-col-gtd {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      align-items: center;
      margin-left: 32px;
    }

    .sp-col-buyin::before,
    .sp-col-date::before,
    .sp-col-time::before,
    .sp-col-latereg::before,
    .sp-col-chips::before,
    .sp-col-gtd::before {
      color: var(--tour-dim);
      font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .sp-col-buyin::before { content: 'Buy-In'; }
    .sp-col-date::before { content: 'Date'; }
    .sp-col-time::before { content: 'Start Time'; }
    .sp-col-latereg::before { content: 'Late Reg'; }
    .sp-col-chips::before { content: 'Chips'; }
    .sp-col-gtd::before { content: 'Guarantee'; }

    .about-grid {
      grid-template-columns: 1fr;
    }

    .about-item,
    .about-item:nth-child(even) {
      grid-column: 1;
      border-left: 0 !important;
    }

    .notif-content {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 390px) {
    .tour-header__body,
    .sp-schedule-section__body,
    .tour-section__body {
      padding-left: 14px;
      padding-right: 14px;
    }

    .tour-name {
      font-size: 26px;
    }

    .tour-action {
      flex-basis: calc(50% - 4px);
      min-width: 0;
      padding: 0 10px;
      font-size: 12px;
    }

    .sp-tab {
      padding: 0 9px;
      font-size: 12px;
      letter-spacing: 0.06em;
    }

    .sp-stop-banner-left,
    .sp-stop-banner-right {
      align-items: flex-start;
      flex-direction: column;
    }

    .breadcrumb-current {
      max-width: 70vw;
    }

    .result-details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
