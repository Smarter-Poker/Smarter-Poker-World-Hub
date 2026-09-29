/**
 *  POKER NEAR ME - Live Venue & Cash Games Finder v4.2
 * Find poker rooms, venues, and live cash games near you
 *
 * Mobile phase 3 (2026-09-04, docs/mobile-standard/ROLLOUT-PLAN.md): the
 * discovery page is built on the always-displayed standard. There are no
 * hidden tabs and no swipe navigation any more: every surface (venues,
 * events with its four sub-surfaces, live games, map, saved, more with its
 * five tools) renders stacked in document order under its own heading, and
 * the tab rows are anchor jump lists that scroll a section into view while
 * the URL still updates through pushDiscoverySurface. HubPageShell owns the
 * shell, PullToRefresh owns the refresh gesture, LazyPanel mounts the heavy
 * panels when they scroll near, and the page tutorial lives in
 * src/tutorials/poker-near-me.js (offered by TutorialProvider, never
 * launched by this page).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary, { HUB_PAGE_SUMMARIES } from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import {
  getPokerNearMePreferences,
  updatePokerNearMePreferences,
} from '../../../src/services/pokerNearMePreferences';
import {
  getVenueFavorites,
  addVenueFavorite,
  removeVenueFavorite,
} from '../../../src/services/pokerNearMeFavorites';
import {
  addSearchHistory as addSearchHistoryToDb,
  getSearchHistory as getSearchHistoryFromDb,
} from '../../../src/services/pokerNearMeSearchHistory';
import { eventBus, busEmit, EventType } from '../../../src/engine/EventBus';
import useTourMapStops from '../../../src/hooks/useTourMapStops';
import useVenueRealtime from '../../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PullToRefresh from '../../../src/components/ui/PullToRefresh';
import { useLoadFailsafe, useInitialLoadRef } from '../../../src/hooks/useLoadFailsafe';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import toast from '../../../src/stores/toastStore';
import { TUTORIAL_WILL_OPEN_EVENT } from '../../../src/tutorials';
import DiscoveryStatusRail from '../../../src/components/poker-near-me/DiscoveryStatusRail';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import { FavLiveToast, TabErrorBoundary } from '../../../src/components/poker-near-me/ControllerRecovery';
import LazyPanel from '../../../src/components/poker-near-me/LazyPanel';
import {
  EVENT_SECTIONS,
  PRIMARY_SECTIONS,
  scrollToSection,
  sectionForSlug,
  sectionId,
} from '../../../src/components/poker-near-me/pnmSections';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { fetchVenueDirectoryResilient } from '../../../src/lib/poker-near-me/venueDirectoryServer';
import { isPokerDiscoveryRouteIndexable } from '../../../src/lib/poker-near-me/sitemapRoutes';
import directorySnapshotData from '../../../data/poker-venue-directory-snapshot.json';
import { capturePokerNearMeEvent } from '../../../src/lib/poker-near-me/activity';
import {
  buildLiveCashGameIndex,
  cashGameCountLabel,
  findLiveCashGameEntry,
  isModeledCashGameData,
  liveCashGameEntrySignature,
} from '../../../src/lib/poker-near-me/liveCashGameData';
import {
  buildDiscoveryUrl,
  DEFAULT_RADIUS_MILES,
  DIRECTORY_PAGE_SIZE,
  getCurrentDay,
  getTabSlug,
  MAX_RADIUS_MILES,
  normalizeRadiusMiles,
  normalizeRouteSlug,
  normalizeVenueType,
  PAGE_SIZE,
  INITIAL_VISIBLE,
  INITIAL_VISIBLE_LIVE,
  PAGE_SIZE_DAILY,
  PAGE_SIZE_LIVE,
  RADIUS_TIERS,
  resolveDiscoveryDeepLink,
  ROUTE_META,
  safeSetItem,
  SEARCH_HISTORY_MAX,
  snapshotAgeDays,
  TAB_ORDER,
  trackSearchEvent,
  venueMatchesGameType,
  venueMatchesStakes,
} from '../../../src/components/poker-near-me/discoveryController';
const GlobalSearchOverlay = dynamic(
  () => import('../../../src/components/poker-near-me/GlobalSearchOverlay'),
  { ssr: false }
);
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
const FullScreenPageOverlay = dynamic(
  () => import('../../../src/components/ui/FullScreenPageOverlay'),
  { ssr: false }
);

// Every panel is a dynamic chunk (code splitting) and the heavy ones (map,
// live feed, tournaments, tours, series, calendar, the More tools) are also
// wrapped in LazyPanel below so they mount when scrolled near, not on first
// paint. Loading placeholders share the one .pnm-skel shimmer.
const PanelSkeleton = ({ height = 240 }) => (
  <div className="pnm-skel" style={{ minHeight: height }} aria-hidden="true" />
);
const MapTabPanel = dynamic(() => import('../../../src/components/poker-near-me/MapTabPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton height={360} />,
});
const VenuesTabPanel = dynamic(
  () => import('../../../src/components/poker-near-me/VenuesTabPanel'),
  { ssr: false }
);
const ToursTabPanel = dynamic(() => import('../../../src/components/poker-near-me/ToursTabPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const SeriesTabPanel = dynamic(
  () => import('../../../src/components/poker-near-me/SeriesTabPanel'),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const DailyTournamentsTabPanel = dynamic(
  () => import('../../../src/components/poker-near-me/DailyTournamentsTabPanel'),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const FavoritesTabPanel = dynamic(
  () => import('../../../src/components/poker-near-me/FavoritesTabPanel'),
  { ssr: false }
);
const MoreTabPanel = dynamic(() => import('../../../src/components/poker-near-me/MoreTabPanel'), {
  ssr: false,
});

// Components still used directly in the main file
const GeofenceAlertBanner = dynamic(
  () => import('../../../src/components/poker-near-me/GeofenceAlertBanner'),
  { ssr: false }
);
const VenueReviews = dynamic(() => import('../../../src/components/poker-near-me/VenueReviews'), {
  ssr: false,
});
const VoiceSearch = dynamic(() => import('../../../src/components/poker-near-me/VoiceSearch'), {
  ssr: false,
});
const SeasonalCalendar = dynamic(
  () => import('../../../src/components/poker-near-me/SeasonalCalendar'),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const LiveGamesFeed = dynamic(() => import('../../../src/components/poker-near-me/LiveGamesFeed'), {
  ssr: false,
  loading: () => <PanelSkeleton height={320} />,
});

import {
  cachedFetch,
  fetchWithRetry,
} from '../../../src/components/poker-near-me/lobby/PnmApiCache';
const LocationEnableModal = dynamic(
  () => import('../../../src/components/ui/LocationEnableModal'),
  { ssr: false }
);

// ---- Geofence Alert Banner (bottom of screen) ----------------------------
export default function PokerNearMePage({ initialDirectory = null }) {
  const router = useRouter();
  const { user } = useAvatar();
  const bus = eventBus;
  const userId = user?.id;
  const haptic = useHaptics();
  const online = useOnlineStatus();
  // Offline: mutations explain instead of firing (OfflineBar in pages/_app.js
  // is the global banner; this is the per-action guard).
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);
  const fetchSequenceRef = useRef(0);
  const fetchToursSeqRef = useRef(0);
  const fetchSeriesSeqRef = useRef(0);
  const fetchDailySeqRef = useRef(0);
  // [BUG FIX] fetchVenuesRef avoids temporal dead zone: fetchVenues is declared later
  // as a const, so useVenueRealtime cannot reference it directly at mount time.
  const fetchVenuesRef = useRef(null);
  // Same temporal-dead-zone dodge for fetchLiveCount (declared further down).
  const fetchLiveCountRef = useRef(null);
  // Same again for fetchAllData — handleGpsSuccess is a first-render-only
  // useCallback and MUST go through this ref rather than capturing a stale copy.
  const fetchAllDataRef = useRef(null);
  // And for fetchDailyTournaments, so the post-geocode corrective refetch can
  // re-request the schedule once the 2-letter state is finally known.
  const fetchDailyRef = useRef(null);
  // GlobalSearchOverlay lifts EVERY keystroke into `searchQuery`, so while the
  // overlay is open that text is UNCOMMITTED and a background revalidation must
  // ignore it — otherwise a poll tick swaps the underlying list for a partial-text
  // search the user never submitted. Once the overlay closes, `searchQuery` is
  // either '' (onClose clears it) or a COMMITTED search (VoiceSearch sets it and
  // immediately fetches with it), and a background refresh must PRESERVE it — a
  // blanket searchOverride:'' would silently replace the user's voice-search
  // results with a location browse ~5 minutes later.
  const searchOverlayOpenRef = useRef(false);
  const backgroundFetchArgs = () =>
    searchOverlayOpenRef.current ? { silent: true, searchOverride: '' } : { silent: true };
  // Persists the last confirmed 2-letter US state ('IL', 'NV', etc.) for GPS user.
  // Unlike gpsLocationLabel (which temporarily becomes raw coordinates when fresh GPS fires
  // before reverseGeocode resolves), this ref is never cleared — it ensures user_state=IL
  // is always sent to the API even during the raw-coordinate phase of GPS refresh.
  const gpsStateRef = useRef('');

  // [HARDENING] Bind venue component to Supabase postgres_changes for global updates
  // BUG FIX: Prevent global DDOS vector! Previously `useVenueRealtime` monitored all global
  // changes to poker_venues, venue_daily_tournaments, etc and indiscriminately spammed fetchVenues()
  // across all 10,000+ connected users for a single tournament add. Now we use surgical injection!
  // WIRING FIX: useVenueRealtime is no longer a postgres_changes subscription —
  // it is a 5-minute poller that always invokes this callback with `null` (on
  // mount, on every tick and on tab-visibility recovery). The old first line
  // (`if (!payload || payload.table !== 'poker_venues') return;`) therefore
  // returned on 100% of invocations, which killed the entire background refresh.
  // `null` now means "no specific row — revalidate". The very first (mount)
  // invocation is skipped because the page already does its own mount fetch via
  // fetchAllData({ includeVenues: true }); firing here too would double-request.
  const realtimeMountSkipRef = useRef(false);
  useVenueRealtime((payload) => {
    if (!payload) {
      if (!realtimeMountSkipRef.current) {
        realtimeMountSkipRef.current = true; // mount tick — page fetches on its own
        return;
      }
      // BUG FIX: background refreshes must NOT inherit UNCOMMITTED overlay
      // keystrokes — that turned the 5-minute poll into a silent re-run of the
      // half-typed search and replaced the location-browse list. See
      // backgroundFetchArgs: a committed (voice) search is still preserved.
      if (fetchVenuesRef.current) fetchVenuesRef.current(backgroundFetchArgs());
      if (fetchLiveCountRef.current) fetchLiveCountRef.current();
      return;
    }
    // Surgical path — kept for the day a row-level payload is delivered again.
    if (payload.table !== 'poker_venues') return;

    const { eventType, new: newRec } = payload;
    if (eventType === 'UPDATE' && newRec) {
      const isHidden = newRec.is_active === false || newRec.is_suppressed === true;

      setVenues((prev) => {
        const idx = prev.findIndex((v) => v.id === newRec.id);
        if (idx === -1) return prev; // Ignore venue not currently loaded in our local UI sphere
        const next = [...prev];
        if (isHidden) {
          next.splice(idx, 1);
        } else {
          next[idx] = { ...next[idx], ...newRec };
        }
        return next;
      });
      // Update the map array as well so pins stay perfectly in sync
      setAllVenuesForMap((prev) => {
        const idx = prev.findIndex((v) => v.id === newRec.id);
        if (idx === -1) return prev;
        const next = [...prev];
        if (isHidden) {
          next.splice(idx, 1);
        } else {
          next[idx] = { ...next[idx], ...newRec };
        }
        return next;
      });
    }
  });

  // ═══ VIP ACTION GATE ═══
  const { guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

  // Active tab state — persisted with sortBy and seriesViewMode
  // Always default to 'map' tab — never persist 'live' tab across sessions
  const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
    activeTab: 'map',
    activeEventTab: 'daily',
    activeMoreTab: 'overview',
    sortBy: 'distance',
    seriesViewMode: 'grid',
    // NOTE: venueViewMode was declared/derived/persisted here but never consumed —
    // VenuesTabPanel has no list/grid toggle prop. Removed so we stop writing a
    // dead key to localStorage on every session.
  });

  // Native history writes do not update Next's router query. This ref prevents
  // that stale query from fighting the currently selected discovery surface.
  const lastRouteTabRef = useRef(null);
  const discoveryPageExitingRef = useRef(false);

  // A debounced filter write must never win a race against a full navigation.
  // WebKit dispatches pagehide early enough to cancel the stale writer; pageshow
  // resets the guard when this page returns from the back-forward cache.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const markExiting = () => { discoveryPageExitingRef.current = true; };
    const markActive = () => { discoveryPageExitingRef.current = false; };
    window.addEventListener('beforeunload', markExiting);
    window.addEventListener('pagehide', markExiting);
    window.addEventListener('pageshow', markActive);
    return () => {
      window.removeEventListener('beforeunload', markExiting);
      window.removeEventListener('pagehide', markExiting);
      window.removeEventListener('pageshow', markActive);
    };
  }, []);

  // HARDENED: Reset 'live' tab back to 'map' on every mount — live tab is ephemeral
  const tabResetDoneRef = useRef(false);

  // If persisted tab is 'live', reset it to 'map' immediately (live tab must not persist)
  const rawActiveTab = uiFilters.activeTab;
  const activeTab = rawActiveTab === 'live' || !rawActiveTab ? 'map' : rawActiveTab;
  const activeEventTab = uiFilters.activeEventTab || 'daily';
  const activeMoreTab = uiFilters.activeMoreTab || 'overview';
  const sortBy = uiFilters.sortBy;
  const seriesViewMode = uiFilters.seriesViewMode;

  // Surface changes are committed synchronously. WebKit can heavily defer a
  // timer while a newly selected dynamic panel is evaluating, which previously
  // left the visible Events state paired with the old /venues address. Filter
  // and search changes remain debounced replacements in the effect below.
  const pushDiscoverySurface = (nextState) => {
    if (typeof window === 'undefined' || discoveryPageExitingRef.current) return;
    const pathSlug = getTabSlug({
      showLiveTab,
      activeTab,
      activeEventTab,
      activeMoreTab,
      ...nextState,
    });
    const newUrl = `/hub/poker-near-me/${pathSlug}${window.location.search}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    lastRouteTabRef.current = pathSlug;
    if (currentUrl !== newUrl) {
      // This is a view-state transition inside one already-mounted discovery
      // application. A native entry preserves live map/realtime state and gives
      // Back/Forward real semantics; router.push can refetch this dynamic Pages
      // route in WebKit even when `shallow` is requested. Do not copy Next's
      // private `__N` marker from the current entry: these are PNM-owned
      // same-document states, and marking them as Next navigations lets its
      // popstate handler consume or replace the browser's Forward entry.
      window.history.pushState(
        {
          spPnmDiscovery: true,
          as: newUrl,
          url: newUrl,
          options: { shallow: true, scroll: false },
        },
        '',
        newUrl
      );
    }
  };

  // Ephemeral live tab state — never persisted across sessions. Starts always false.
  // Mobile phase 3: none of this state hides content any more. activeTab /
  // activeEventTab / activeMoreTab / showLiveTab name the CURRENT surface for
  // the URL, the canonical tag and the anchor row's aria-current; every panel
  // is always in the DOM and a tab tap scrolls its section into view.
  const [showLiveTab, setShowLiveTab] = React.useState(false);
  const setActiveTab = (val) => {
    // 'live' is handled by showLiveTab state — don't write it to persisted storage
    if (val !== 'live') {
      setUiFilter('activeTab', val);
    }
  };
  // Scroll the section for a surface into view once its DOM exists. A
  // section that has not mounted yet (dynamic chunk still loading) is retried
  // for a moment rather than silently ignored.
  const scrollTargetRef = useRef(null);
  const scrollRetryRef = useRef(null);
  const scrollToSurface = useCallback((key, options) => {
    if (typeof window === 'undefined') return;
    if (scrollRetryRef.current) window.clearTimeout(scrollRetryRef.current);
    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      const done = scrollToSection(key, options);
      if (!done && attempts < 12) {
        scrollRetryRef.current = window.setTimeout(attempt, 120);
      } else {
        scrollRetryRef.current = null;
      }
    };
    scrollTargetRef.current = key;
    window.requestAnimationFrame(attempt);
  }, []);
  useEffect(() => () => {
    if (scrollRetryRef.current) window.clearTimeout(scrollRetryRef.current);
  }, []);
  const navigateActiveTab = (val) => {
    if (val !== activeTab || showLiveTab) {
      pushDiscoverySurface({
        showLiveTab: false,
        activeTab: val,
        activeMoreTab: val === 'more' ? activeMoreTab : activeMoreTab,
      });
    }
    setShowLiveTab(false);
    setActiveTab(val);
    scrollToSurface(val);
  };
  // Anchor row tap: the URL names the surface, the page scrolls to it. Live
  // is a real section now, so it is a destination rather than a toggle.
  const activateTab = (val) => {
    haptic('light');
    if (val === 'live') {
      if (!showLiveTab) pushDiscoverySurface({ showLiveTab: true });
      setShowLiveTab(true);
      scrollToSurface('live');
      return;
    }
    navigateActiveTab(val);
  };
  const activePrimaryTab = showLiveTab ? 'live' : activeTab;
  const setActiveEventTab = (val) => setUiFilter('activeEventTab', val);
  const setActiveMoreTab = (val) => setUiFilter('activeMoreTab', val);
  const navigateActiveEventTab = (val) => {
    if (val !== activeEventTab || activeTab !== 'events' || showLiveTab) {
      pushDiscoverySurface({ showLiveTab: false, activeTab: 'events', activeEventTab: val });
    }
    setShowLiveTab(false);
    setUiFilter('activeTab', 'events');
    setActiveEventTab(val);
    scrollToSurface(val);
  };
  const navigateActiveMoreTab = (val) => {
    if (val !== activeMoreTab || activeTab !== 'more' || showLiveTab) {
      pushDiscoverySurface({ showLiveTab: false, activeTab: 'more', activeMoreTab: val });
    }
    setShowLiveTab(false);
    setUiFilter('activeTab', 'more');
    setActiveMoreTab(val);
    scrollToSurface(val === 'overview' ? 'more' : val);
  };
  const setSortBy = (val) => setUiFilter('sortBy', val);
  const setSeriesViewMode = (val) => setUiFilter('seriesViewMode', val);

  // ─── HARDENING: Sync Next.js route parameter to LocalStorage active tabs ───
  // WIRING FIX: this page has no data-fetching exports, so the old `initialTab` prop
  // was always undefined and this effect never fired. Derive the tab from the live
  // router query instead, so client-side router.push between
  // /hub/poker-near-me/<slug> URLs switches tabs (the one-shot mount parser below
  // only runs once). lastRouteTabRef is also updated by the deep-link URL writer so
  // UI-driven tab changes (history.replaceState) don't get fought by this effect.
  useEffect(() => {
    if (!router.isReady) return;
    const rawParam = router.query.pnmTab;
    const routeTab = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    if (!routeTab || routeTab === lastRouteTabRef.current) return;
    const isFirstSync = lastRouteTabRef.current === null;
    lastRouteTabRef.current = routeTab;
    // The mount parser handles the initial URL (including ?q=/?sub= params)
    if (isFirstSync) return;
    // Every surface is on the page; a client-side route change scrolls to it.
    const routeSection = sectionForSlug(routeTab);
    if (routeSection) scrollToSurface(routeSection);
    if (routeTab === 'live-games' || routeTab === 'live') {
      setShowLiveTab(true);
      return;
    }
    const EVENT_SLUGS = {
      tours: 'tours',
      series: 'series',
      daily: 'daily',
      'daily-tournaments': 'daily',
      calendar: 'calendar',
      'events-calendar': 'calendar',
    };
    setShowLiveTab(false);
    if (EVENT_SLUGS[routeTab]) {
      setUiFilter('activeTab', 'events');
      setUiFilter('activeEventTab', EVENT_SLUGS[routeTab]);
    } else if (routeTab === 'roadtrip' || routeTab === 'alerts') {
      // Set directly — setActiveTab('more') would reset the sub-tab to 'overview'
      setUiFilter('activeTab', 'more');
      setUiFilter('activeMoreTab', routeTab);
    } else if (['venues', 'map', 'saved', 'more', 'events'].includes(routeTab)) {
      setActiveTab(routeTab);
    }
  }, [router.isReady, router.query.pnmTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data states
  const initialVenues = Array.isArray(initialDirectory?.data) ? initialDirectory.data : [];
  const [venues, setVenues] = useState(initialVenues);
  const [allVenuesForMap, setAllVenuesForMap] = useState(initialVenues);
  const [directorySource, setDirectorySource] = useState(
    initialDirectory?.data_source || (initialDirectory?.degraded ? 'static_snapshot' : 'supabase')
  );
  const [directorySnapshot, setDirectorySnapshot] = useState(initialDirectory?.snapshot || null);
  const [directoryProgress, setDirectoryProgress] = useState({
    loaded: initialVenues.length,
    total: Number(initialDirectory?.total) || initialVenues.length,
    complete: false,
  });
  const [tours, setTours] = useState([]);
  const [series, setSeries] = useState([]);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [dbStats, setDbStats] = useState({
    total: Number(initialDirectory?.total) || initialVenues.length,
    tournaments: 0,
    states: 0,
    // Which day `tournaments` was counted for — the day selector lets the user
    // move off today, and the subtitle used to label every count 'Today'.
    tournamentsDay: null,
  });
  const [mappedVenueCount, setMappedVenueCount] = useState(0);

  // Shared count contract separates public directory, map-ready, observed,
  // and modeled totals so the header never compares unlike quantities.
  const [liveTableCount, setLiveTableCount] = useState(0);
  // 'live' | 'mixed' | 'estimated' | 'catalog' | 'none' from /api/poker/live-tables.
  // Modeled counts remain explicitly approximate and separate from observations.
  const [liveDataMode, setLiveDataMode] = useState(null);
  // metadata.data_age_minutes — qualifies the figure in the page subtitle.
  const [liveDataAgeMinutes, setLiveDataAgeMinutes] = useState(null);

  // UI states
  const [isHydrated, setIsHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [venueLoading, setVenueLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  // Ref mirror so long-lived timeouts (GPS failsafe) read fresh location state
  const userLocationRef = useRef(null);
  userLocationRef.current = userLocation;
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsLocationLabel, setGpsLocationLabel] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [iframeModal, setIframeModal] = useState({ isOpen: false, url: '', title: '' });
  const [selectedCity, setSelectedCity] = useState(null);
  const selectedCityRef = useRef(null);
  selectedCityRef.current = selectedCity;
  const [nearestDistance, setNearestDistance] = useState(null);
  const [hasSearched, setHasSearched] = useState(true);

  // Geofence alert state
  const [geofenceAlert, setGeofenceAlert] = useState(null);
  const geofenceRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  // Read by backgroundFetchArgs() from timer/event callbacks that outlive this render.
  searchOverlayOpenRef.current = showGlobalSearch;

  // The discovery anchor row is server-rendered for crawlability, so its mere
  // visibility does not prove that client-side navigation handlers are ready.
  // Publish an explicit interactive-state contract for tests and assistive
  // tooling that need to activate controls immediately after navigation.
  useEffect(() => setIsHydrated(true), []);

  // ─── Batch fetch review stats for venue cards (star ratings) ───
  const [pnmReviewStatsMap, setPnmReviewStatsMap] = useState({});
  const pnmReviewStatsRef = useRef(pnmReviewStatsMap);
  pnmReviewStatsRef.current = pnmReviewStatsMap;
  // PERF FIX: this used to request ONE 50-id chunk per effect run and depend on
  // pnmReviewStatsMap, so each response re-ran the effect for the next chunk —
  // up to 10 strictly sequential round trips for a 500-venue list, with star
  // ratings trickling in over several seconds. The server caps a request at 50
  // ids (reviews.js), so chunking is required, but the chunks are now issued in
  // parallel with a small concurrency bound and merged in a single setState.
  const reviewStatsInFlightRef = useRef(false);
  useEffect(() => {
    if (venues.length === 0) return undefined;
    if (reviewStatsInFlightRef.current) return undefined;
    const missing = venues
      .map((v) => v.id)
      // Social-page discovery entries use synthetic `sp-*` identifiers while
      // venue_reviews.venue_id is an integer FK. Keep those identities out of
      // the ratings request rather than asking Postgres to coerce them.
      .filter((id) => /^\d+$/.test(String(id)) && !pnmReviewStatsRef.current[String(id)]);
    if (missing.length === 0) return undefined;

    const CHUNK = 50;
    const CONCURRENCY = 4;
    const chunks = [];
    for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));

    let cancelled = false;
    reviewStatsInFlightRef.current = true;

    const runChunk = (ids) =>
      fetch('/api/poker/reviews?stats_only=true&venue_ids=' + ids.join(','))
        .then((r) => r.json())
        .then((j) => (j && j.success && j.stats ? j.stats : null))
        .catch((e) => {
          console.warn('[App] Handled promise rejection:', e?.message || e);
          return null;
        });

    (async () => {
      const merged = {};
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        if (cancelled) break;
        const batch = await Promise.all(chunks.slice(i, i + CONCURRENCY).map(runChunk));
        batch.forEach((stats) => {
          if (stats) Object.assign(merged, stats);
        });
      }
      reviewStatsInFlightRef.current = false;
      if (!cancelled && Object.keys(merged).length > 0) {
        setPnmReviewStatsMap((prev) => ({ ...prev, ...merged }));
      }
    })();

    return () => {
      cancelled = true;
      reviewStatsInFlightRef.current = false;
    };
    // Deliberately NOT depending on pnmReviewStatsMap any more — every missing id
    // is requested in this single pass, so there is no chunk-chaining re-run.
  }, [venues]);

  // ─── Live Cash Game Data Merger ───
  // Fetches /api/poker/live-tables on mount AND every 15 minutes (matching scraper cadence)
  // to keep VenueCard live_data counts fresh. LiveGamesFeed has its own 2-min polling;
  // this is a lightweight background sync for the Venues tab cards only.
  const [liveDataMap, setLiveDataMap] = useState({}); // bravo_slug/normalized_name → live_data
  // Staleness threshold published by /api/poker/live-tables (metadata.stale_threshold_hours).
  // Anything older than this is no longer presentable as "running right now".
  const liveStaleMsRef = useRef(3 * 60 * 60 * 1000);
  // Consecutive-miss counter per map key, so a single flaky response doesn't wipe
  // the map but a venue that has genuinely stopped reporting does age out.
  const liveMissCountRef = useRef({});
  const LIVE_MAX_MISSES = 3; // ~45 min at the 15-minute poll cadence

  const isLiveEntryFresh = useCallback((entry) => {
    if (!entry) return false;
    const ts = entry.last_updated ? new Date(entry.last_updated).getTime() : entry._seen_at;
    if (!ts || isNaN(ts)) return false;
    return Date.now() - ts <= liveStaleMsRef.current;
  }, []);

  const buildLiveDataMap = useCallback(() => {
    fetch('/api/poker/live-tables')
      .then((r) => {
        if (!r.ok) throw new Error(`Live table feed returned ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (json && json.metadata && typeof json.metadata.stale_threshold_hours === 'number') {
          liveStaleMsRef.current = json.metadata.stale_threshold_hours * 3600000;
        }
        if (!json.venues) return;
        const map = buildLiveCashGameIndex(json);
        setLiveDataMap((prev) => {
          // POLICY (retained): a single empty/partial response never wipes good data.
          // GAP FIX: but it can no longer grow forever either. Entries missing from
          // the newest response survive LIVE_MAX_MISSES consecutive polls, and any
          // entry older than the feed's own stale threshold is dropped outright —
          // otherwise a venue that stopped spreading games advertised "N tables
          // running" indefinitely.
          const merged = {};
          const misses = liveMissCountRef.current;
          Object.keys(prev).forEach((key) => {
            if (map[key]) return; // refreshed below
            const carried = prev[key];
            const missCount = (misses[key] || 0) + 1;
            if (missCount <= LIVE_MAX_MISSES && isLiveEntryFresh(carried)) {
              misses[key] = missCount;
              merged[key] = carried;
            } else {
              delete misses[key];
            }
          });
          Object.keys(map).forEach((key) => {
            delete misses[key];
            merged[key] = map[key];
          });
          return merged;
        });
      })
      .catch((e) => {
        console.warn('[App] Handled promise rejection:', e?.message || e);
      });
  }, [isLiveEntryFresh]);
  useEffect(() => {
    buildLiveDataMap(); // Initial fetch on mount
    const refreshTimer = setInterval(buildLiveDataMap, 15 * 60 * 1000); // 15-min refresh
    return () => clearInterval(refreshTimer);
  }, [buildLiveDataMap]);
  const liveDataMapRef = useRef({});
  useEffect(() => {
    liveDataMapRef.current = liveDataMap;
  }, [liveDataMap]);

  // Merge live_data into venues whenever liveDataMap changes (runs on every scrape cycle)
  // FIXED: was guarded by _liveMerged one-shot flag that permanently prevented re-merging.
  // Now always re-merges when liveDataMap updates, using last_updated timestamp to skip
  // venues where the data hasn't actually changed (avoids unnecessary re-renders).
  // GAP FIX: the map can now shrink (see pruning above), so this effect must be
  // allowed to run when it empties — that is exactly the case where a card is
  // still advertising tables that are no longer running.
  const venueLiveMergeRevision = useMemo(() => venues.map((venue) => (
    `${venue?.id || venue?.slug || ''}:${liveCashGameEntrySignature(venue?.live_data)}`
  )).join(','), [venues]);
  useEffect(() => {
    setVenues((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((venue) => {
        const liveEntry = findLiveCashGameEntry(venue, liveDataMap);
        // POLICY (retained): while the scraper is up but reporting 0 tables we
        // still show the games list (stakes offered, game types). Only an entry
        // with zero games counts as "nothing to show".
        const hasGameData = liveEntry && (liveEntry.games || []).length > 0;
        const newLiveData = hasGameData ? liveEntry : null;
        if (!newLiveData && !venue.live_data) return venue; // no change
        if (liveCashGameEntrySignature(venue.live_data) === liveCashGameEntrySignature(newLiveData)) return venue;
        // GAP FIX: the old policy was "never replace existing live_data with
        // null", full stop — so a card kept rendering the last-seen table counts
        // forever once a venue dropped out of the feed. Now a scraper blip is
        // still absorbed (data that is still within the feed's stale window is
        // kept), but data older than that window is cleared rather than shown
        // as current.
        if (!newLiveData && venue.live_data) {
          if (isLiveEntryFresh(venue.live_data)) return venue; // transient miss — keep
          changed = true;
          return { ...venue, live_data: null }; // aged out — stop advertising it
        }
        changed = true;
        return { ...venue, live_data: newLiveData };
      });
      return changed ? next : prev; // referential equality guard
    });
  }, [liveDataMap, isLiveEntryFresh, venueLiveMergeRevision]);

  const [checkinCounts, setCheckinCounts] = useState({});
  useEffect(() => {
    fetch('/api/poker/checkins?today=true')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const counts = {};
          json.data.forEach((c) => {
            counts[String(c.venue_id)] = (counts[String(c.venue_id)] || 0) + 1;
          });
          setCheckinCounts(counts);
        }
      })
      .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, []);

  // ─── Listen for review submissions to refresh review stats for that venue ───
  useEffect(() => {
    const handleReviewSubmitted = (e) => {
      const venueId = e?.detail?.venueId;
      if (!venueId) return;
      fetch('/api/poker/reviews?stats_only=true&venue_ids=' + venueId)
        .then((r) => r.json())
        .then((j) => {
          if (j.success && j.stats) setPnmReviewStatsMap((prev) => ({ ...prev, ...j.stats }));
        })
        .catch((e) => {
          console.warn('[App] Handled promise rejection:', e?.message || e);
        });
    };
    window.addEventListener('pnm:review-submitted', handleReviewSubmitted);
    return () => window.removeEventListener('pnm:review-submitted', handleReviewSubmitted);
  }, []);

  // Review panel state (Feature #9)
  const [reviewVenue, setReviewVenue] = useState(null);

  // ─── Session JWT for authenticated child components ───
  // `user` from AvatarContext is a Supabase User object; Supabase puts the JWT on
  // the SESSION, so `user?.access_token` is undefined here. Resolve the real token
  // through the sanctioned authUtils helper (repo rule: never call the Supabase
  // client's auth session getters directly from page/client code). Same workaround
  // MoreTabPanel documents — VenueReviews had no fallback of its own.
  const [sessionToken, setSessionToken] = useState(null);
  useEffect(() => {
    if (user?.access_token) {
      setSessionToken(user.access_token);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getFreshAccessToken } = await import('../../../src/lib/authUtils');
        const token = await getFreshAccessToken();
        if (!cancelled) setSessionToken(token || null);
      } catch (e) {
        console.warn('[App] Handled promise rejection:', e?.message || e);
        if (!cancelled) setSessionToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.access_token, userId]);

  // Pin-to-card highlight state
  const [highlightedVenueId, setHighlightedVenueId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  // GPS 20s-failsafe timeout — kept in a ref so unmount can clear it
  const gpsFailsafeTimeoutRef = useRef(null);
  // LEAK FIX: the mount GPS auto-request timer and the post-GPS refetch timer were
  // never cancelled, and the reverseGeocode continuation had no cancellation at
  // all — all three could setState (and re-fetch) on an unmounted tree.
  const gpsMountTimerRef = useRef(null);
  const gpsRefetchTimerRef = useRef(null);
  const pageUnmountedRef = useRef(false);
  // Clear pending timeouts on unmount (highlight + GPS failsafe + GPS timers)
  useEffect(() => {
    pageUnmountedRef.current = false;
    return () => {
      pageUnmountedRef.current = true;
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (gpsFailsafeTimeoutRef.current) clearTimeout(gpsFailsafeTimeoutRef.current);
      if (gpsMountTimerRef.current) clearTimeout(gpsMountTimerRef.current);
      if (gpsRefetchTimerRef.current) clearTimeout(gpsRefetchTimerRef.current);
    };
  }, []);

  const contentRef = useRef(null);

  // Loading rules from the standard: an 8s failsafe clears a stuck skeleton,
  // and background refreshes (the 5-minute poll, pull to refresh, filter
  // changes after the first load) never flash the skeleton over content.
  useLoadFailsafe(loading, setLoading);
  const isInitialLoad = useInitialLoadRef();

  // Push notification state
  const [pushPermission, setPushPermission] = useState('default');

  // Fetch error state for retry UI
  const [fetchError, setFetchError] = useState(null);

  // Hamburger menu preferences
  const [preferences, setPreferences] = useState({
    geofenceAlerts: true,
    locationEnabled: true,
    showNewcomerFriendly: true,
  });
  // STUB FIX: the hamburger toggles were persisted but never honoured. The
  // mount GPS auto-request fires from a `[]` effect whose timer can outrun the
  // async Supabase preferences load, so the timer callback reads the CURRENT
  // preferences through this ref rather than the mount-time snapshot.
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  // Intro video state - ONLY show when navigated directly from World Hub card click
  // NOT when navigating via lobby pods (which add ?tab= params)
  // HYDRATION FIX: server HTML always renders without the intro overlay, so the
  // sessionStorage read must happen in an effect — reading it in the useState
  // initializer caused a client/server hydration mismatch, and the render-phase
  // sessionStorage.removeItem consumed the from-hub flag twice under StrictMode.
    useEffect(() => {
    try {
      // If there's a tab param in the URL, user came from lobby — never play intro
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tab')) {
        // Consume the flag so it doesn't stick around
        sessionStorage.removeItem('poker-near-me-from-hub');
        return;
      }
      // Only play intro when user came from World Hub page (flag set by WorldHub.tsx)
      const fromHub = sessionStorage.getItem('poker-near-me-from-hub');
      if (fromHub === '1' && !sessionStorage.getItem('poker-near-me-intro-seen')) {
        // Consume the flag immediately so it doesn't replay on refresh
        sessionStorage.removeItem('poker-near-me-from-hub');
              }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);
  
  // ─── Page tutorial ───
  // The tour is owned by TutorialProvider (pages/_app.js) and registered in
  // src/tutorials/poker-near-me.js; the hamburger menu's "Page Tutorial" row
  // and the three-second prompt are its only entry points. This page never
  // launches it. When the tour is about to open, the page returns to the top
  // and closes anything that would sit over the spotlight.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onWillOpen = (e) => {
      if (e && e.detail && e.detail.id && e.detail.id !== 'poker-near-me') return;
      setShowGlobalSearch(false);
      setReviewVenue(null);
      setMenuOpen(false);
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch (_) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
    return () => window.removeEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
  }, []);


  // HYDRATION FIX: initialize with server-safe defaults and hydrate the saved blob
  // in an effect — reading localStorage in the useState initializer made the first
  // client render differ from the server HTML (controlled <select> values).
  const [filters, setFilters] = useState({
    radius: 50,
    venueType: 'all',
    gameType: 'all',
    stakes: 'all',
    hasNLH: false,
    hasPLO: false,
    hasMixed: false,
    tourType: 'all',
    seriesTimeframe: 90,
    seriesType: 'all',
    selectedDay: getCurrentDay(),
    minBuyin: '',
    maxBuyin: '',
    selectedState: 'all',
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem('poker-near-me-search-filters');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      // ENFORCE venueType=all so tour pins + all venues always show on map
      // Also sanitize stale 'undefined' string values from the ?filter=undefined bug
      // BUG FIX: 'poker_tour' used to be whitelisted here, so one voice search for
      // "poker tour" persisted a venue type that no filter path recognises and the
      // page stayed permanently empty across reloads. normalizeVenueType folds it
      // (and legacy 'card_room') onto the real domain instead.
      parsed.venueType =
        parsed.venueType === 'all' ? 'all' : normalizeVenueType(parsed.venueType) || 'all';
      // REMOVED gameType and stakes forced resets to allow user preference persistence.
      // Sanitize old cached 'tournaments' value back to 'all'
      if (['tournament', 'mtt', 'tournaments'].includes(String(parsed.gameType).toLowerCase())) {
        parsed.gameType = 'all';
      }
      // Normalize stakes: 'any' means no filter — treat same as 'all'
      // BUG FIX: 'any' was stored as default but !== 'all', causing the client-side
      // stakes filter to fire with s.includes('any') → zero venues matched → blank page.
      parsed.stakes =
        parsed.stakes &&
        !['any', 'all', 'undefined', 'null', ''].includes(String(parsed.stakes).toLowerCase())
          ? parsed.stakes
          : 'all';
      // To safeguard tour pins from being filtered out entirely, the map will ignore cash filters for pins.
      // Keep the user's saved radius — do NOT override it to 50mi
      // Default to 50mi only if no saved radius exists.
      // BUG FIX: clamp saved 200/500/'any' radii down to the server's real 150mi
      // ceiling so the select shows a value the option list actually contains and
      // "Load More" stops expanding into tiers the API silently truncates.
      if (!parsed.radius) parsed.radius = DEFAULT_RADIUS_MILES;
      else parsed.radius = normalizeRadiusMiles(parsed.radius);
      parsed.gameType = parsed.gameType || 'all';
      // BUG FIX: selectedDay was persisted forever, so returning users saw a stale
      // day's daily tournaments presented as today's. Always reset it to today.
      parsed.selectedDay = getCurrentDay();
      // Write sanitized filters BACK to localStorage to prevent stale 'any' from persisting
      try {
        localStorage.setItem('poker-near-me-search-filters', JSON.stringify(parsed));
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
      setFilters((prev) => ({ ...prev, ...parsed }));
    } catch (e) {
      console.warn(e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global search mode: when true, GPS/city useEffect skips re-fetching so text search results persist
  // CRITICAL: Must be declared BEFORE allVenuesWithTours useMemo which references globalSearchModeRef.current
  const globalSearchModeRef = useRef(false);

  // ═══ MERGE TOUR STOPS INTO MAP VENUES — ONE pin per tour at current/next stop ═══
  // Mirrors the poker-tours page approach: find current or next-upcoming stop per tour,
  // resolve coordinates by matching venue name against allVenuesForMap (real venue DB),
  // then fall back to TOUR_CITY_COORDS, then tour.latitude/longitude.
  // Tour pins offset slightly from venue pins so both are visible simultaneously.
  //
  // STUB FIX: centerLat/centerLng/effRad plus three fresh Sets, an empty array
  // and a `filteredVenues` alias used to be recomputed on every render and passed
  // in — and useTourMapStops shadows every one of them internally (it recomputes
  // effRad with a DIFFERENT 'any' value, recomputes centerLat/centerLng, and
  // declares its own tourPins / consumedVenueNames / consumedVenueStems /
  // charityBestIds / filteredVenues). Pure dead code plus per-render allocations,
  // so they are gone; the hook's real inputs are the seven below.
  //
  // BUG FIX (map vs list divergence): the hook ALSO applies its own gameType and
  // stakes filters, branching on 'cash'|'mtt' (the filter bar emits 'nlh'|'plo')
  // and on `stakes_cash`, a field most venues lack — so choosing '$1/2' silently
  // removed most pins while the card list underneath was untouched. Game/stakes
  // filtering now happens in exactly one place: the shared predicates, applied to
  // the hook's OUTPUT (the hook still sees the full venue list, which it needs to
  // resolve tour-stop coordinates) and to venueCardList.
  const mapStopFilters = useMemo(
    () => ({ ...filters, gameType: 'all', stakes: 'all' }),
    [filters]
  );
  const rawVenuesWithTours = useTourMapStops({
    tours,
    allVenuesForMap,
    userLocation,
    selectedCity,
    filters: mapStopFilters,
    globalSearchModeRef,
    hasSearched,
  });
  const allVenuesWithTours = useMemo(() => {
    const list = Array.isArray(rawVenuesWithTours) ? rawVenuesWithTours : [];
    if (
      (!filters.gameType || filters.gameType === 'all') &&
      (!filters.stakes || filters.stakes === 'all')
    ) {
      return list;
    }
    return list.filter(
      (v) =>
        venueMatchesGameType(v, filters.gameType) && venueMatchesStakes(v, filters.stakes)
    );
  }, [rawVenuesWithTours, filters.gameType, filters.stakes]);

  const filterSyncPrevStrRef = useRef(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentStr = JSON.stringify(filters);
      if (filterSyncPrevStrRef.current !== currentStr) {
        try {
          localStorage.setItem('poker-near-me-search-filters', currentStr);
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            console.warn('[PNM] Storage quota exceeded, skipping filter persistence.');
          }
        }
        window.dispatchEvent(new CustomEvent('poker-near-me-filters-sync', { detail: filters }));
        // Fulfill hard rule: Wire Real-Time pushes to the Global Event Bus
        eventBus.emit('PNM_FILTERS_UPDATED', filters);
        filterSyncPrevStrRef.current = currentStr;
      }
    }
  }, [filters]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    const handleSync = (e) => {
      if (e && e.detail && typeof window !== 'undefined') {
        const currentStr = JSON.stringify(filtersRef.current);
        const newStr = JSON.stringify(e.detail);
        if (currentStr !== newStr) {
          setFilters(e.detail);
        }
      }
    };
    // BUG FIX: eventBus.on() delivers the full envelope — { type, payload,
    // timestamp, source } — not the bare payload (see UniversalHeader.js and
    // lobby.js, which both unwrap it). This handler treated the envelope AS the
    // filters object, so setFilters() replaced `filters` with the envelope:
    // radius/venueType/gameType all became undefined, the localStorage blob was
    // poisoned for the next visit, and because this page also LISTENS to its own
    // PNM_FILTERS_UPDATED emission each corrupted write produced a new, deeper
    // envelope that differed again — a self-feeding re-render loop with
    // exponentially growing JSON.
    const handleBusSync = (event) => {
      if (typeof window === 'undefined') return;
      const next = event?.payload || event;
      if (!next || typeof next !== 'object' || Array.isArray(next)) return;
      // Shape guard: a real filters payload always carries at least one known key.
      if (next.radius === undefined && next.venueType === undefined && next.gameType === undefined)
        return;
      const newStr = JSON.stringify(next);
      // Ignore our own emission (filterSyncPrevStrRef holds what we last emitted).
      if (newStr === filterSyncPrevStrRef.current) return;
      if (JSON.stringify(filtersRef.current) !== newStr) {
        setFilters(next);
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'poker-near-me-search-filters' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const currentStr = JSON.stringify(filtersRef.current);
          if (currentStr !== e.newValue) {
            setFilters(parsed);
          }
        } catch (err) {
          console.warn('[App] Handled exception:', err?.message || err);
        }
      }
    };
    window.addEventListener('poker-near-me-filters-sync', handleSync);
    window.addEventListener('storage', handleStorage);
    const unsubFilters = eventBus?.on('PNM_FILTERS_UPDATED', handleBusSync);
    return () => {
      window.removeEventListener('poker-near-me-filters-sync', handleSync);
      window.removeEventListener('storage', handleStorage);
      if (unsubFilters) unsubFilters();
    };
  }, []);

  // NOTE: the old page-level live-venue-search cluster (liveGames, liveVenueList,
  // selectedLiveVenue, fetchLiveGames, etc.) was removed — the Live tab renders
  // LiveGamesFeed, which does its own fetching and polling.
  // HYDRATION FIX: `favorites` is read during render (the FavLiveToast block), so
  // seeding it from localStorage in the useState initializer made the first client
  // render differ from the server HTML — the exact React #418 hazard this file
  // already fixed for `filters`. Server-safe default + mount hydration instead.
  // `favoritesPersistSkipRef` makes the persist effect below ignore its first run
  // so the empty default is never written back over the stored blob.
  const [favorites, setFavorites] = useState({});
  const favoritesPersistSkipRef = useRef(true);
  useEffect(() => {
    let favs = {};
    try {
      favs = JSON.parse(localStorage.getItem('sp-favorites') || '{}') || {};
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
      favs = {};
    }
    try {
      const seriesIds = JSON.parse(localStorage.getItem('followed-series') || '[]');
      (seriesIds || []).forEach((id) => {
        favs['series-' + id] = true;
      });
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    // Merge rather than replace — Supabase favorites may have landed already.
    setFavorites((prev) => ({ ...favs, ...prev }));
  }, []);
  const [displayCount, setDisplayCount] = useState({
    venues: INITIAL_VISIBLE,
    tours: INITIAL_VISIBLE,
    series: INITIAL_VISIBLE,
    daily: PAGE_SIZE_DAILY,
    live: INITIAL_VISIBLE_LIVE,
  });
  // HYDRATION FIX: same pattern — server-safe default, hydrate on mount.
  const [searchHistory, setSearchHistory] = useState([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('sp-search-history') || '[]');
      // Prune entries older than 30 days (if stored with timestamps)
      const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const pruned = (raw || []).filter((entry) => {
        if (typeof entry === 'object' && entry.ts) return now - entry.ts < MAX_AGE_MS;
        return true; // Legacy string entries are kept
      });
      if (pruned.length !== (raw || []).length) {
        safeSetItem('sp-search-history', JSON.stringify(pruned));
      }
      if (pruned.length > 0) setSearchHistory(pruned);
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);
  const [promotionVenueIds, setPromotionVenueIds] = useState(new Set());

  // Map view filters (for enhanced map-first experience)
  // HYDRATION FIX: server-safe default, hydrated on mount. mapFiltersPersistSkipRef
  // makes the persist effect below ignore its first run so the default is never
  // written over the saved blob before hydration lands.
  const [mapFilters, setMapFilters] = useState({
    cashGames: false,
    tournaments: false,
    is24Hours: false,
    lowStakes: false,
    topRated: false,
  });
  const mapFiltersPersistSkipRef = useRef(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('poker-near-me-map-filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') setMapFilters(parsed);
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Skip the very first run: it fires with the server-safe default, BEFORE the
      // hydration effect above has applied the saved blob, and would overwrite it.
      if (mapFiltersPersistSkipRef.current) {
        mapFiltersPersistSkipRef.current = false;
        return;
      }
      safeSetItem('poker-near-me-map-filters', JSON.stringify(mapFilters));
      window.dispatchEvent(
        new CustomEvent('poker-near-me-map-filters-sync', { detail: mapFilters })
      );
    }
  }, [mapFilters]);

  const mapFiltersRef = useRef(mapFilters);
  mapFiltersRef.current = mapFilters;
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail && typeof window !== 'undefined') {
        const currentStr = JSON.stringify(mapFiltersRef.current);
        const newStr = JSON.stringify(e.detail);
        if (currentStr !== newStr) {
          setMapFilters(e.detail);
        }
      }
    };
    window.addEventListener('poker-near-me-map-filters-sync', handleSync);
    return () => window.removeEventListener('poker-near-me-map-filters-sync', handleSync);
  }, []);

  // WIRING FIX: `selectedRoom`/`setSelectedRoom` used to live here purely to feed
  // MapTabPanel props that MapTabPanel never destructures — no component ever
  // implemented the "selected room detail panel", and nothing else in this file
  // read the state. Removed along with the other six dead map props
  // (liveTableCount, dailyTournaments, setHasSearched, fetchAllData, router).

  // ═══ MAP CENTER — Compute center for map zoom (GPS or city venue centroid) ═══
  const mapCenter = useMemo(() => {
    // Priority 1: GPS location
    if (userLocation) return userLocation;
    // Priority 2: Centroid of returned venues (city search)
    if (selectedCity && venues.length > 0) {
      const withCoords = venues.filter((v) => v.latitude && v.longitude);
      if (withCoords.length > 0) {
        const sumLat = withCoords.reduce((s, v) => s + v.latitude, 0);
        const sumLng = withCoords.reduce((s, v) => s + v.longitude, 0);
        return { lat: sumLat / withCoords.length, lng: sumLng / withCoords.length };
      }
    }
    return null;
  }, [userLocation, selectedCity, venues]);

  // ═══ AUTO-REFETCH on radius change — re-searches with new radius ═══
  const prevRadiusRef = useRef(filters.radius);
  useEffect(() => {
    if (prevRadiusRef.current === filters.radius) return;
    prevRadiusRef.current = filters.radius;
    // Only re-fetch if user has already searched (has location or city)
    if (userLocation || selectedCity || hasSearched) {
      setDisplayCount((prev) => ({
        ...prev,
        venues: INITIAL_VISIBLE,
        tours: INITIAL_VISIBLE,
        series: INITIAL_VISIBLE,
        daily: PAGE_SIZE_DAILY,
      }));
      // Radius only affects the venues query — tours/series/daily don't use it.
      // (Previously called fetchAllData, which duplicated 3-4 requests on every
      // radius change / "Load More" radius-tier expansion.)
      if (fetchVenuesRef.current) fetchVenuesRef.current();
    }
  }, [filters.radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ AUTO-REFETCH on venueType change — dropdown auto-submit (no button needed) ═══
  const prevVenueTypeRef = useRef(filters.venueType);
  useEffect(() => {
    if (prevVenueTypeRef.current === filters.venueType) return;
    prevVenueTypeRef.current = filters.venueType;
    // Re-fetch venues with new type filter whenever user has a location/city context
    // Use fetchVenuesRef.current to avoid temporal dead zone (fetchVenues declared later)
    if (userLocation || selectedCity || hasSearched) {
      setDisplayCount((prev) => ({ ...prev, venues: INITIAL_VISIBLE }));
      if (fetchVenuesRef.current) fetchVenuesRef.current();
    }
  }, [filters.venueType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the integrity-assessed API directory for the map on mount, with an
  // integrity-versioned offline cache. The static export remains a degraded
  // fallback, but it must never masquerade as boundary-verified data.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const CACHE_KEY = 'sp-offline-venues-integrity-v2';
    let hadCacheHit = false;
    let cancelled = false;
    const idleHandles = new Set();
    const timers = new Set();
    const controller = new AbortController();

    const setGlobalVenues = (activeArr) => {
      setAllVenuesForMap(activeArr);
      const realPlayableVenues = activeArr.filter(
        (v) => !['series', 'tour'].includes(v.venue_type)
      );
      if (realPlayableVenues.length > 0) {
        setDbStats((prev) => {
          if (prev.total === realPlayableVenues.length) return prev;
          return { ...prev, total: realPlayableVenues.length };
        });
      }
      if (!userLocationRef.current && !selectedCityRef.current && !globalSearchModeRef.current) {
        setVenues(activeArr);
      }
    };

    const scheduleIdle = (task, timeout = 1500) => {
      if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(() => {
          idleHandles.delete(handle);
          if (!cancelled) task();
        }, { timeout });
        idleHandles.add(handle);
      } else {
        const handle = setTimeout(() => {
          timers.delete(handle);
          if (!cancelled) task();
        }, Math.min(timeout, 300));
        timers.add(handle);
      }
    };

    const scheduleCacheWrite = (activeArr, revision, snapshot) => {
      const writeCache = () => {
        if (cancelled) return;
        try {
          safeSetItem(CACHE_KEY, JSON.stringify({
            venues: activeArr,
            revision: revision || null,
            snapshot: snapshot || null,
            time: Date.now(),
          }));
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      };
      scheduleIdle(writeCache, 5000);
    };

    const activeVenues = (input, fallback = false) => (Array.isArray(input) ? input : [])
      .filter((venue) => venue?.is_active !== false && venue?.id !== 3109)
      .map((venue) => fallback && !venue.location_quality
        ? {
            ...venue,
            location_quality: {
              status: 'unverified',
              mappable: true,
              reason: 'offline_snapshot',
            },
          }
        : venue);

    // Try offline cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.venues && parsed.time && Date.now() - parsed.time < 3600000) {
          // 1hr TTL
          // Filter inactive venues — e.g. Ameristar East Chicago (no permanent cash games)
          const activeFromCache = parsed.venues.filter(
            (v) => v.is_active !== false && v.id !== 3109
          );
          setGlobalVenues(activeFromCache);
          setDirectorySnapshot(parsed.snapshot || null);
          setDirectoryProgress({ loaded: activeFromCache.length, total: activeFromCache.length, complete: true });
          hadCacheHit = true;
        }
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    const loadStaticFallback = () => {
      // The daily token prevents an old static snapshot from staying frozen
      // indefinitely without destroying Vercel edge-cache reuse.
      const dailyBuster = new Date().toISOString().split('T')[0];
      return fetch(`/data/poker-venue-directory-snapshot.json?v=${dailyBuster}`)
        .then(function (response) {
          if (!response.ok) throw new Error(`Static venue snapshot returned ${response.status}`);
          return response.json();
        })
        .then(function (json) {
          const snapshot = activeVenues(json.venues || json.data || json || [], true);
          setGlobalVenues(snapshot);
          setDirectorySnapshot(json.metadata || null);
          setDirectoryProgress({ loaded: snapshot.length, total: snapshot.length, complete: true });
          setDirectorySource('static_snapshot');
          capturePokerNearMeEvent('directory_loaded', {
            route: window.location.pathname,
            route_family: 'discovery',
            source: 'static_snapshot',
            result_count: snapshot.length,
            candidate_count: snapshot.length,
            data_revision: json.metadata?.data_revision,
            snapshot_age_days: snapshotAgeDays(json.metadata?.generated_at),
            complete: true,
          });
        });
    };

    const mergePages = (current, incoming) => {
      const byId = new Map(current.map((venue) => [String(venue.id), venue]));
      incoming.forEach((venue) => byId.set(String(venue.id), venue));
      return [...byId.values()];
    };

    const loadDirectoryPage = async (offset = 0, accumulated = []) => {
      try {
        const response = await fetch(
          `/api/poker/venues?view=directory&limit=${DIRECTORY_PAGE_SIZE}&offset=${offset}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`Venue directory returned ${response.status}`);
        const json = await response.json();
        const directory = Array.isArray(json.data) ? json.data : [];
        const carriesIntegrity = directory.every((venue) => venue?.location_quality?.status);
        if (!json.success || !json.data_integrity || !carriesIntegrity) {
          throw new Error('Venue directory did not include signal integrity metadata');
        }
        const next = mergePages(accumulated, activeVenues(directory));
        const candidateTotal = Math.max(Number(json.total) || 0, next.length);
        const nextOffset = offset + DIRECTORY_PAGE_SIZE;
        const complete = nextOffset >= candidateTotal;
        const source = json.degraded ? 'static_snapshot' : 'supabase';
        setGlobalVenues(next);
        setDirectorySource(source);
        setDirectorySnapshot(json.snapshot || null);
        setDirectoryProgress({ loaded: next.length, total: candidateTotal, complete });

        if (complete) {
          scheduleCacheWrite(next, json.data_revision, json.snapshot);
          capturePokerNearMeEvent('directory_loaded', {
            route: window.location.pathname,
            route_family: 'discovery',
            source,
            result_count: next.length,
            candidate_count: candidateTotal,
            data_revision: json.data_revision,
            snapshot_age_days: snapshotAgeDays(json.snapshot?.generated_at),
            complete: true,
          });
          return;
        }
        scheduleIdle(() => loadDirectoryPage(nextOffset, next), 1000);
      } catch (error) {
        if (error?.name === 'AbortError' || cancelled) return;
        console.warn('[Poker Near Me] Integrity directory unavailable:', error?.message || error);
        if (accumulated.length > 0) {
          setDirectorySource('partial_live');
          setDirectoryProgress((current) => ({ ...current, loaded: accumulated.length, complete: false }));
          capturePokerNearMeEvent('directory_load_interrupted', {
            route: window.location.pathname,
            route_family: 'discovery',
            source: 'partial_live',
            result_count: accumulated.length,
            complete: false,
          });
          return;
        }
        if (hadCacheHit) {
          setDirectorySource('browser_cache');
          return;
        }
        loadStaticFallback().catch(function () {
          setDirectorySource('unavailable');
          setFetchError('Unable to load venue data. Check your connection.');
        });
      }
    };

    loadDirectoryPage();

    return () => {
      cancelled = true;
      controller.abort();
      if (typeof window.cancelIdleCallback === 'function') {
        idleHandles.forEach((handle) => window.cancelIdleCallback(handle));
      }
      timers.forEach((handle) => clearTimeout(handle));
    };
  }, []);

  const fetchLiveCount = useCallback(async () => {
    try {
      const res = await fetch('/api/poker/platform-counts');
      if (!res.ok) return;
      const json = await res.json();
      const directory = json?.directory;
      if (directory) {
        if (Number.isFinite(directory.public_playable)) {
          setDbStats((previous) => ({ ...previous, total: directory.public_playable }));
        }
        if (Number.isFinite(directory.mapped_public)) setMappedVenueCount(directory.mapped_public);
      }

      const tableSourceFailed = json?.degraded_sources?.includes('current_tables');
      const tables = json?.current_tables;
      if (!tableSourceFailed && tables) {
        if (tables.data_mode) setLiveDataMode(tables.data_mode);
        if (typeof tables.age_minutes === 'number' || tables.age_minutes === null) {
          setLiveDataAgeMinutes(tables.age_minutes);
        }
        if (typeof tables.published === 'number') {
          // POLICY (retained): a transient scraper blip does not blank the badge.
          // BUG FIX: but 'none' data must be allowed to fall to 0. The old
          // rule "never decrease to 0" kept a stale non-zero figure on screen under
          // the plain "Live Tables" label indefinitely after the feed had emptied,
          // because setLiveDataMode always overwrote while the count never could.
          const feedEmpty = tables.data_mode === 'none';
          setLiveTableCount((prev) => {
            if (tables.published > 0) return tables.published;
            if (feedEmpty) return 0;
            return prev > 0 ? prev : 0; // transient 0 — keep last known
          });
        }
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);

  // Ref mirror so the useVenueRealtime poll callback (declared above fetchLiveCount)
  // can trigger a live-count refresh without a temporal-dead-zone reference.
  fetchLiveCountRef.current = fetchLiveCount;

  // Fetch live table count for map stats header
  useEffect(() => {
    fetchLiveCount();
  }, [fetchLiveCount]);

  // ─── Initial data load on mount ───
  // ALWAYS include venues so the page is never blank regardless of GPS state.
  // If GPS restores a location, the useEffect below re-fetches with lat/lng/radius.
  useEffect(() => {
    fetchAllData({ includeVenues: initialVenues.length === 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When city or GPS location is set, re-fetch venues with proximity filter
  // GUARD: skip if globalSearchModeRef is active — user did a text search, don't overwrite results
  useEffect(() => {
    if ((selectedCity || userLocation) && !globalSearchModeRef.current) {
      setHasSearched(true);
      fetchVenues();
    }
  }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-request GPS on mount — restore saved location first for instant display
  const gpsAutoRequestedRef = useRef(false);
  useEffect(() => {
    if (gpsAutoRequestedRef.current) return;

    // Safety check: if deep-linking a search query, DO NOT load GPS as it overwrites searchQuery state
    if (typeof window !== 'undefined' && window.location.search.includes('q=')) {
      gpsAutoRequestedRef.current = true;
      return;
    }

    gpsAutoRequestedRef.current = true;

    // Restore saved GPS location from localStorage for instant venue display
    // Check BOTH keys: sp-user-gps (main page) AND pnm_last_location (lobby page)
    let hasSavedLocation = false;
    let hasSavedCity = false;
    try {
      const saved = localStorage.getItem('sp-user-gps');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Use saved location if less than 24 hours old
        if (parsed.lat && parsed.lng && parsed.time && Date.now() - parsed.time < 86400000) {
          setUserLocation({ lat: parsed.lat, lng: parsed.lng });
          setGpsLocationLabel(parsed.label || `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
          setHasSearched(true);
          hasSavedLocation = true;
          // Persist last known state to gpsStateRef so fetchVenues always sends user_state
          if (parsed.label) {
            const parts = parsed.label.split(',');
            const s = parts.length >= 2 ? parts[parts.length - 1].trim().toUpperCase() : '';
            if (/^[A-Z]{2}$/.test(s)) gpsStateRef.current = s;
          }
        }
      }
      // Fallback: check lobby page's GPS key if main page key is missing/expired
      if (!hasSavedLocation) {
        const lobbyLoc = localStorage.getItem('pnm_last_location');
        const lobbyEnabled = localStorage.getItem('pnm_location_enabled');
        if (lobbyLoc && lobbyEnabled === '1') {
          const parsed = JSON.parse(lobbyLoc);
          if (parsed.lat && parsed.lng) {
            setUserLocation({ lat: parsed.lat, lng: parsed.lng });
            const city = localStorage.getItem('pnm_last_city') || '';
            const state = localStorage.getItem('pnm_last_state') || '';
            setGpsLocationLabel(
              city && state
                ? `${city}, ${state}`
                : `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`
            );
            setHasSearched(true);
            hasSavedLocation = true;
            // Set gpsStateRef so fetchVenues always has user_state even before geocoding
            if (state && /^[A-Z]{2}$/i.test(state)) gpsStateRef.current = state.toUpperCase();
            // Migrate to sp-user-gps for future consistency
            safeSetItem(
              'sp-user-gps',
              JSON.stringify({
                lat: parsed.lat,
                lng: parsed.lng,
                time: Date.now(),
                label: city && state ? `${city}, ${state}` : null,
              })
            );
            window.dispatchEvent(new Event('sp_user_gps_updated'));
          }
        }
      }
      // Fallback 3: check for a previously-selected city (user chose from city list)
      if (!hasSavedLocation) {
        const savedCity = localStorage.getItem('pnm_last_selected_city');
        if (savedCity) {
          try {
            const city = JSON.parse(savedCity);
            if (city && city.name) {
              setSelectedCity(city);
              setSearchQuery(city.name + (city.state ? ', ' + city.state : ''));
              setHasSearched(true);
              hasSavedLocation = true; // skip GPS auto-request
              hasSavedCity = true; // city-based — do NOT request GPS
            }
          } catch (e) {
            console.warn('[App] Handled exception:', e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }

    // Request fresh GPS — silent refresh if we already have saved GPS location
    // SKIP entirely if a saved city was restored (user chose a city, not GPS)
    if (hasSavedLocation && !hasSavedCity && typeof navigator !== 'undefined' && navigator.geolocation) {
      // LEAK FIX: this timer (up to 2s) and the geolocation callback it schedules
      // used to survive unmount — navigating away inside the window still fired
      // requestGpsLocation()/getCurrentPosition, whose success handler called
      // setSearchQuery/setUserLocation/setGpsLoading on an unmounted tree. The
      // timer is now cleared on cleanup and the callbacks are guarded.
      gpsMountTimerRef.current = setTimeout(
        () => {
          gpsMountTimerRef.current = null;
          if (pageUnmountedRef.current) return;
          // STUB FIX: honour the "Location Services" hamburger toggle. This is the
          // AUTOMATIC path only — an explicit tap on the GPS button still works,
          // because that is an unambiguous user request.
          if (preferencesRef.current && preferencesRef.current.locationEnabled === false) return;
          if (hasSavedLocation) {
            // Silent refresh — don't show alerts, just update if GPS is available
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (pageUnmountedRef.current) return;
                handleGpsSuccess(pos, true);
              },
              () => {
                /* silent fail — saved location is still active */
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
            );
          }
          // Privacy and UX: do not request geolocation on mount when no saved
          // location exists. A browser denial used to open the instruction modal
          // over every secondary/tertiary route before the user interacted with
          // the page. First-time permission requests now happen only from an
          // explicit location control; saved GPS users still get a silent refresh.
        },
        2000
      );
    }

    return () => {
      if (gpsMountTimerRef.current) {
        clearTimeout(gpsMountTimerRef.current);
        gpsMountTimerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS fallback — if GPS loading finishes without a location, show all venues
  const gpsFallbackRef = useRef(false);
  useEffect(() => {
    // Only trigger once: when gpsLoading transitions true→false without a location
    if (gpsFallbackRef.current && !gpsLoading && !userLocation && !selectedCity) {
      // [GAP 2.2] Removed fetchVenues() when no location to avoid 750-venue payload
    }
    if (gpsLoading) gpsFallbackRef.current = true;
  }, [gpsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Geofence monitoring ----------
  const [geofenceStatus, setGeofenceStatus] = useState(null); // 'active' | 'denied' | 'error'
  const gfModulesRef = useRef(null); // Cache dynamic imports to avoid re-importing

  // WIRING FIX: every geofence arrival ping used to POST to /api/venues/record-geofence
  // with no Authorization header. pages/api/venues/[...slug].js mounts a blanket auth
  // middleware that 401s when no user resolves, and this app keeps the session in the
  // `smarter-poker-auth` localStorage key (not a cookie), so an unauthenticated fetch
  // could never succeed: the 12-hour cooldown row was never written and no push ever
  // fired. `.catch(console.warn)` only catches network errors, so a 401 was invisible.
  // The JWT now comes from the sanctioned authUtils helper and non-2xx is reported.
  const recordGeofenceArrival = useCallback(async (venue) => {
    if (!venue || !venue.id) return;
    try {
      const { getFreshAccessToken } = await import('../../../src/lib/authUtils');
      const token = await getFreshAccessToken();
      if (!token) {
        console.warn('[PNM] Geofence ping skipped - no signed-in session');
        return;
      }
      const res = await fetch('/api/venues/record-geofence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn('[PNM] Geofence ping rejected:', res.status, String(detail).slice(0, 200));
      }
    } catch (e) {
      console.warn('[PNM] Geofence ping error:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userLocation) return;
    if (allVenuesForMap.length === 0) return;
    // STUB FIX: honour the "Geofence Alerts" hamburger toggle. Turning it off used
    // to leave the GPS watcher running, still fire showVenueAlert, still render the
    // banner and still POST arrivals to /api/venues/record-geofence. Because
    // preferences.geofenceAlerts is now a dependency, flipping it off re-runs this
    // effect: the previous run's cleanup stops the service, then we bail out here.
    if (preferences && preferences.geofenceAlerts === false) {
      setGeofenceStatus(null);
      setGeofenceAlert(null);
      return;
    }

    // LEAK FIX: `cancelled` guards the async dynamic-import init — without it,
    // gfService.start() could fire AFTER this effect was cleaned up (or the page
    // unmounted) and the GPS watcher would never be stopped.
    let cancelled = false;

    // If geofence service already exists, just update the venue list
    if (geofenceRef.current && gfModulesRef.current) {
      const { pushMod } = gfModulesRef.current;
      geofenceRef.current.stop();
      geofenceRef.current.start(allVenuesForMap, function (venue) {
        if (pushMod) pushMod.showVenueAlert(venue, 'checkin');
        setGeofenceAlert(venue);
        recordGeofenceArrival(venue);
      });
    } else {
      // First initialization — dynamic import (SSR safe)
      import('../../../src/lib/geofence')
        .then(function (mod) {
          if (cancelled) return;
          var GeofenceService = mod.default;
          var gfService = new GeofenceService();
          // Register the ref BEFORE the nested import resolves so cleanup can stop it
          geofenceRef.current = gfService;

          import('../../../src/lib/pushAlerts')
            .then(function (pushMod) {
              if (cancelled) return;
              gfModulesRef.current = { pushMod };
              pushMod
                .requestPermission()
                .then(function (permission) {
                  if (permission === 'denied') {
                    setGeofenceStatus('denied');
                  }
                })
                .catch(function () {
                  setGeofenceStatus('denied');
                });

              gfService.start(allVenuesForMap, function (venue) {
                pushMod.showVenueAlert(venue, 'checkin');
                setGeofenceAlert(venue);

                recordGeofenceArrival(venue);
              });

              setGeofenceStatus('active');
            })
            .catch(function () {
              if (cancelled) return;
              gfModulesRef.current = { pushMod: null };
              gfService.start(allVenuesForMap, function (venue) {
                setGeofenceAlert(venue);
                recordGeofenceArrival(venue);
              });
              setGeofenceStatus('active');
            });
        })
        .catch(function (err) {
          setGeofenceStatus('error');
        });
    }

    // LEAK FIX: this cleanup now covers BOTH paths — the update path previously
    // returned early without a cleanup, leaving the GPS watcher running after unmount.
    return function () {
      cancelled = true;
      if (geofenceRef.current) {
        geofenceRef.current.stop();
      }
    };
  }, [userLocation, allVenuesForMap, preferences.geofenceAlerts]);

  useEffect(() => {
    if (router.isReady && router.query.q) {
      setShowGlobalSearch(true);
    }
  }, [router.isReady, router.query.q]);

  // --- Merge real-time venue updates and social pages into map feed ---
  useEffect(() => {
    if (!venues || venues.length === 0) return;

    // Extract social pages
    const socialWithCoords = venues.filter((v) => v.is_social_page && v.latitude && v.longitude);
    // GAP FIX (home groups): standalone home games arrive from the venues API's
    // top-level `home_groups` key and are tagged `is_home_group` by fetchVenues.
    // They are absent from the static all-venues.json the map is built from, so
    // without this they showed on the card list but never got a pin.
    const homeGroupsWithCoords = venues.filter(
      (v) => v.is_home_group && v.latitude && v.longitude
    );

    // Build a map of updated standard venues from the live fetch
    const liveUpdates = {};
    venues.forEach((v) => {
      if (!v.is_social_page && !v.is_home_group && v.id) {
        liveUpdates[String(v.id)] = v;
      }
    });

    setAllVenuesForMap((prev) => {
      // 1. Remove previously merged social pages and home groups
      const withoutSocial = prev.filter(
        (v) => !String(v.id).startsWith('sp-') && !v.is_home_group
      );

      // 2. Overwrite standard venues with fresh live data (to sync has_tournaments, etc)
      const syncedStandard = withoutSocial.map((v) => {
        const fresh = liveUpdates[String(v.id)];
        return fresh ? { ...v, ...fresh } : v;
      });

      // 3. Append fresh social pages + standalone home groups
      return [...syncedStandard, ...socialWithCoords, ...homeGroupsWithCoords];
    });
  }, [venues]);

  // --- NEW: Persist favorites to localStorage + bus sync ---
  const lastSavedFavoritesRef = useRef('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Favorites now start empty and hydrate from localStorage in a mount effect
      // (hydration-mismatch fix). Skip the very first run — it fires with the empty
      // default, before hydration has applied, and would erase the stored blob.
      if (favoritesPersistSkipRef.current) {
        favoritesPersistSkipRef.current = false;
        return;
      }
      const spFavs = {};
      const seriesFavs = [];
      Object.keys(favorites || {}).forEach((k) => {
        if (k.startsWith('venue-') && favorites[k]) spFavs[k] = favorites[k];
        if (k.startsWith('series-') && favorites[k]) seriesFavs.push(k.split('-')[1]);
      });
      const newFavoritesState = JSON.stringify({ spFavs, seriesFavs });
      if (lastSavedFavoritesRef.current !== newFavoritesState) {
        lastSavedFavoritesRef.current = newFavoritesState;
        safeSetItem('sp-favorites', JSON.stringify(spFavs));
        safeSetItem('followed-series', JSON.stringify(seriesFavs));
      }
    }
  }, [favorites]);

  // Listen for favorites changes from other tabs via native 'storage' event
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  useEffect(() => {
    const handleStorageSync = (e) => {
      if (e.key === 'sp-favorites' && e.newValue) {
        try {
          const newFavs = JSON.parse(e.newValue);
          setFavorites((prev) => {
            const next = { ...prev };
            let changed = false;
            const newFavIds = Object.keys(newFavs || {});
            Object.keys(next || {}).forEach((k) => {
              if (k.startsWith('venue-') && !newFavIds.includes(k)) {
                delete next[k];
                changed = true;
              }
            });
            newFavIds.forEach((k) => {
              if (!next[k]) {
                next[k] = newFavs[k];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
      }
      if (e.key === 'followed-series' && e.newValue) {
        try {
          const rawSeriesIds = JSON.parse(e.newValue);
          setFavorites((prev) => {
            const next = { ...prev };
            let changed = false;
            Object.keys(next || {}).forEach((k) => {
              if (k.startsWith('series-') && !rawSeriesIds.includes(k.split('-')[1])) {
                delete next[k];
                changed = true;
              }
            });
            rawSeriesIds.forEach((id) => {
              if (!next[`series-${id}`]) {
                next[`series-${id}`] = true;
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
      }
    };
    window.addEventListener('storage', handleStorageSync);

    // Map global EventBus events to our local state (Intra-tab SPA sync)
    const handleBusFavSync = (event) => {
      const data = event.payload;
      if (data && data.venueId) {
        setFavorites((prev) => {
          const next = { ...prev };
          next['venue-' + data.venueId] = Date.now();
          return next;
        });
      }
    };
    const handleBusUnfavSync = (event) => {
      const data = event.payload;
      if (data && data.venueId) {
        setFavorites((prev) => {
          const next = { ...prev };
          delete next['venue-' + data.venueId];
          return next;
        });
      }
    };

    // [GAP 4.3 FIX] Debounce DATA_MUTATED to prevent redundant fetches from rapid-fire events
    // FIXED: mutateDebounce was a local let — not cleared on unmount. Timer would fire
    // fetchVenuesRef/fetchLiveCount AFTER unmount → setState on unmounted component.
    // FIXED: live_tables entity was triggering fetchVenuesRef (full DB re-fetch of poker_venues)
    // on every scraper cycle. live_tables mutations should only refresh live counts, not venues.
    let mutateDebounce = null;
    const handleBusDataMutated = (event) => {
      const { entity } = event.payload || {};
      if (entity === 'live_tables') {
        // Live data changed — only refresh live counts, NOT the full venue list
        if (mutateDebounce) clearTimeout(mutateDebounce);
        mutateDebounce = setTimeout(() => {
          if (typeof fetchLiveCount === 'function') fetchLiveCount();
        }, 1000);
      } else if (entity === 'venues') {
        // Venue metadata changed — refresh venue list + live counts
        if (mutateDebounce) clearTimeout(mutateDebounce);
        mutateDebounce = setTimeout(() => {
          // backgroundFetchArgs() — background revalidation must not silently re-run
          // half-typed overlay text over the location-browse list (but it does keep
          // a committed voice search).
          if (fetchVenuesRef.current) fetchVenuesRef.current(backgroundFetchArgs());
          if (typeof fetchLiveCount === 'function') fetchLiveCount();
        }, 1000);
      }
    };

    const handleBusCheckinCreated = (event) => {
      const data = event.payload;
      if (data && data.venueId) {
        setCheckinCounts((prev) => ({
          ...prev,
          [String(data.venueId)]: (prev[String(data.venueId)] || 0) + 1,
        }));
      }
    };

    let unsubFav, unsubUnfav, unsubMutate, unsubCheckin;
    if (bus && bus.on) {
      unsubFav = bus.on(EventType.VENUE_SAVED, handleBusFavSync);
      unsubUnfav = bus.on(EventType.VENUE_UNSAVED, handleBusUnfavSync);
      unsubMutate = bus.on(EventType.DATA_MUTATED, handleBusDataMutated);
      unsubCheckin = bus.on(EventType.VENUE_CHECKIN_CREATED, handleBusCheckinCreated);
    }

    return () => {
      window.removeEventListener('storage', handleStorageSync);
      if (mutateDebounce) clearTimeout(mutateDebounce); // FIXED: prevent post-unmount setState
      if (unsubFav) unsubFav();
      if (unsubUnfav) unsubUnfav();
      if (unsubMutate) unsubMutate();
      if (unsubCheckin) unsubCheckin();
    };
  }, []);

  // --- NEW: Fetch promotion venue IDs on mount ---
  useEffect(() => {
    // BUG FIX: this asked for limit=200 but /api/poker/promotions clamps to 100
    // (Math.min(parseInt(rawLimit), 100)), so 100 of the requested rows were
    // silently dropped — and because the request was unfiltered, tour/series
    // promotions consumed slots in a set that is only ever compared against
    // VENUE ids. Ask the server for venue promotions only, at its real ceiling,
    // and still guard the page_type client-side.
    fetch('/api/poker/promotions?page_type=venue&limit=100')
      .then((r) => r.json())
      .then((json) => {
        const ids = new Set();
        (json.promotions || json.data || []).forEach((p) => {
          if (p.page_id && p.page_type === 'venue') ids.add(String(p.page_id));
        });
        setPromotionVenueIds(ids);
      })
      .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, []);

  // --- NEW: Helper functions ---
  const toggleFavorite = useCallback(
    async (type, id, e, itemData = {}) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (!id) return;
      if (!requireOnline()) return;
      haptic('light');
      const key = type + '-' + id;
      const isCurrentlyFavorited = favorites[key];

      // Update local state immediately
      // Synchronous optimistic update
      setFavorites((prev) => {
        const next = { ...prev };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = Date.now();
        }
        return next;
      });

      // Sync venue favorites to Supabase
      if (type === 'venue' && userId) {
        try {
          if (isCurrentlyFavorited) {
            await removeVenueFavorite(userId, id);
            busEmit.venueUnsaved(id);
          } else {
            await addVenueFavorite(userId, id, {
              name: itemData.name,
              address: itemData.address,
              city: itemData.city,
              state: itemData.state,
            });
            busEmit.venueSaved(id, itemData.name);
          }
        } catch (err) {
          console.warn('Error syncing favorite:', err);
          // Rollback on failure
          setFavorites((prev) => {
            const next = { ...prev };
            if (isCurrentlyFavorited) {
              next[key] = Date.now();
            } else {
              delete next[key];
            }
            return next;
          });
        }
      }
    },
    [favorites, userId, requireOnline, haptic]
  );

  const isFavorited = (type, id) => !!favorites[type + '-' + id];

  const addToSearchHistory = (query) => {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();
    setSearchHistory((prev) => {
      const filtered = prev.filter((s) => s !== trimmed);
      const next = [trimmed, ...filtered].slice(0, SEARCH_HISTORY_MAX);
      safeSetItem('sp-search-history', JSON.stringify(next));
      return next;
    });
    // Async sync to Supabase if logged in.
    // WIRING FIX: this used to pass { location, filters }. The service only reads
    // `type`/`search_type` and poker_near_me_search_history has exactly
    // (id, user_id, search_query, search_type, searched_at) — there is nowhere to
    // store location or filters, so both were serialized and thrown away while
    // search_type was always written as NULL. Pass the one field that persists.
    if (userId) {
      addSearchHistoryToDb(userId, query.trim(), {
        type: 'poker_near_me_global',
      }).catch((e) => {
        console.warn('[App] Handled promise rejection:', e?.message || e);
      });
    }
  };

  const getSortedVenues = (venueList) => {
    // When GPS is active and sort is 'default', auto-sort by distance
    const effectiveSort = sortBy === 'default' && userLocation ? 'distance' : sortBy;
    // Default sort: casinos first, then card rooms, then by trust score descending
    if (effectiveSort === 'default') {
      const VENUE_PRIORITY = { casino: 0, card_room: 1, poker_club: 1, home_game: 2, charity: 3 };
      return [...venueList].sort((a, b) => {
        const typeDiff = (VENUE_PRIORITY[a.venue_type] ?? 5) - (VENUE_PRIORITY[b.venue_type] ?? 5);
        if (typeDiff !== 0) return typeDiff;
        return (b.trust_score || 0) - (a.trust_score || 0);
      });
    }
    const sorted = [...venueList];
    const VENUE_TYPE_ORDER = { casino: 0, card_room: 1, poker_club: 1, charity: 2, home_game: 3 };
    switch (effectiveSort) {
      case 'trust-desc':
        return sorted.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
      case 'trust-asc':
        return sorted.sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0));
      case 'distance':
        return sorted.sort((a, b) => (a.distance_mi || 9999) - (b.distance_mi || 9999));
      case 'name-az':
        return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-za':
        return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'venue-type':
        return sorted.sort(
          (a, b) => (VENUE_TYPE_ORDER[a.venue_type] ?? 99) - (VENUE_TYPE_ORDER[b.venue_type] ?? 99)
        );
      case 'state-az':
        return sorted.sort((a, b) => (a.state || '').localeCompare(b.state || ''));
      case 'most-tables':
        return sorted.sort((a, b) => (b.poker_tables || 0) - (a.poker_tables || 0));
      case 'most-games':
        return sorted.sort(
          (a, b) => (b.games_offered || []).length - (a.games_offered || []).length
        );
      case 'city-az':
        return sorted.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
      default:
        return sorted;
    }
  };

  const loadMore = (tab) => {
    if (tab === 'venues') {
      // If there are still un-rendered venues, just show more
      if (displayCount.venues < venues.length) {
        setDisplayCount((prev) => ({ ...prev, venues: prev.venues + PAGE_SIZE }));
      } else if (userLocation) {
        // All current results shown — expand radius to next tier and re-fetch
        // RADIUS_TIERS now stops at the server's real 150mi cap, so once the user
        // is already at 150 there is no next tier and no pointless extra request.
        const currentRadius = normalizeRadiusMiles(filters.radius);
        const nextTier = RADIUS_TIERS.find((r) => r > currentRadius);
        if (nextTier) {
          // Update radius in state, then trigger a re-fetch
          setFilters((prev) => {
            const updated = { ...prev, radius: nextTier };
            // Persist to localStorage immediately
            try {
              localStorage.setItem('poker-near-me-search-filters', JSON.stringify(updated));
            } catch (e) {
              console.warn('[App] Handled exception:', e?.message || e);
            }
            return updated;
          });
          // Reset display count for fresh batch
          setDisplayCount((prev) => ({ ...prev, venues: INITIAL_VISIBLE }));
          // NOTE: no explicit fetch here — the radius-change effect fires on the
          // filters.radius update and re-fetches venues with the new tier.
          // (An explicit setTimeout fetch here caused a duplicate fetch cascade.)
        }
      }
    } else {
      setDisplayCount((prev) => ({ ...prev, [tab]: prev[tab] + PAGE_SIZE }));
    }
  };

  // Pin→Card sync: scroll to and highlight venue card when map pin is clicked
  const onMapVenueClick = useCallback(
    (venue) => {
      if (!venue || !venue.id) return;
      // Keep an expanded map open while the player explores ordinary pins.
      // The underlying card is still selected and staged for when fullscreen
      // exits; only the popup's explicit profile action closes the map.
      // The venues section is always on the page (mobile phase 3); name it as
      // the current surface so the URL and the anchor row follow the pin.
      setShowLiveTab(false);
      if (activeTab !== 'venues') {
        pushDiscoverySurface({ showLiveTab: false, activeTab: 'venues' });
        setActiveTab('venues');
      }

      // Try to find the card immediately.
      // BUG FIX: VenuesTabPanel renders tour stops as `tour-card-<tour_code>`, not
      // `venue-card-<id>` (tour pins carry id 'tour-stop-<code>'), so clicking a
      // tour pin — the flagship traveling-tours surface — always missed, expanded
      // displayCount to the full list for nothing and left the user with no scroll
      // and no highlight. Try both ids before falling back.
      const tryScroll = () => {
        const cardEl =
          document.getElementById('venue-card-' + venue.id) ||
          (venue.tour_code ? document.getElementById('tour-card-' + venue.tour_code) : null);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedVenueId(venue.id);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => setHighlightedVenueId(null), 3000);
          return true;
        }
        return false;
      };

      if (!tryScroll()) {
        // Card not in DOM yet — expand display count to show all venues, then retry
        setDisplayCount((prev) => ({ ...prev, venues: Math.max(prev.venues, venues.length) }));
        // Wait for React to re-render with expanded list
        setTimeout(() => tryScroll(), 150);
      }
    },
    [activeTab, venues.length]
  );

  const openVenueModal = useCallback(
    (path) => {
      if (!path) return;
      if (path.includes('/hub/venues/')) {
        setIframeModal({
          isOpen: true,
          url: path,
          title: 'Venue Details',
        });
      } else {
        router.push(path);
      }
    },
    [router]
  );

  // Reverse geocode lat/lng to city, state using OpenStreetMap Nominatim (free, no API key)
  // [GAP 2.3 FIX] Rate limit to 1 request/second to comply with Nominatim usage policy
  const lastGeocodeTime = useRef(0);
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const now = Date.now();
      const timeSinceLast = now - lastGeocodeTime.current;
      if (timeSinceLast < 1100) {
        await new Promise((r) => setTimeout(r, 1100 - timeSinceLast));
      }
      lastGeocodeTime.current = Date.now();
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=12`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en-US,en' } });
      if (!resp.ok) return null;
      const data = await resp.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
      const state = addr.state || '';
      // Abbreviate US state names
      const STATE_ABBREVS = {
        Alabama: 'AL',
        Alaska: 'AK',
        Arizona: 'AZ',
        Arkansas: 'AR',
        California: 'CA',
        Colorado: 'CO',
        Connecticut: 'CT',
        Delaware: 'DE',
        Florida: 'FL',
        Georgia: 'GA',
        Hawaii: 'HI',
        Idaho: 'ID',
        Illinois: 'IL',
        Indiana: 'IN',
        Iowa: 'IA',
        Kansas: 'KS',
        Kentucky: 'KY',
        Louisiana: 'LA',
        Maine: 'ME',
        Maryland: 'MD',
        Massachusetts: 'MA',
        Michigan: 'MI',
        Minnesota: 'MN',
        Mississippi: 'MS',
        Missouri: 'MO',
        Montana: 'MT',
        Nebraska: 'NE',
        Nevada: 'NV',
        'New Hampshire': 'NH',
        'New Jersey': 'NJ',
        'New Mexico': 'NM',
        'New York': 'NY',
        'North Carolina': 'NC',
        'North Dakota': 'ND',
        Ohio: 'OH',
        Oklahoma: 'OK',
        Oregon: 'OR',
        Pennsylvania: 'PA',
        'Rhode Island': 'RI',
        'South Carolina': 'SC',
        'South Dakota': 'SD',
        Tennessee: 'TN',
        Texas: 'TX',
        Utah: 'UT',
        Vermont: 'VT',
        Virginia: 'VA',
        Washington: 'WA',
        'West Virginia': 'WV',
        Wisconsin: 'WI',
        Wyoming: 'WY',
        'District of Columbia': 'DC',
      };
      const stateAbbrev = STATE_ABBREVS[state] || state;
      if (city && stateAbbrev) return `${city}, ${stateAbbrev}`;
      if (city) return city;
      if (stateAbbrev) return stateAbbrev;
      return null;
    } catch (e) {
      console.warn('Reverse geocode failed:', e);
      return null;
    }
  }, []);

  const handleGpsSuccess = useCallback(
    (pos, keepSearch = false) => {
      if (!keepSearch) {
        setSearchQuery('');
      }
      setSelectedCity(null);
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
      // Show coordinates immediately while geocoding resolves
      setGpsLocationLabel(`${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`);
      setHasSearched(true);
      setDisplayCount({
        venues: INITIAL_VISIBLE,
        tours: INITIAL_VISIBLE,
        series: INITIAL_VISIBLE,
        daily: PAGE_SIZE_DAILY,
        live: INITIAL_VISIBLE_LIVE,
      });
      setGpsLoading(false);
      // Save GPS to localStorage for instant restore on next visit
      // Write to BOTH keys: sp-user-gps (main page) + pnm_last_location (lobby page)
      try {
        localStorage.setItem(
          'sp-user-gps',
          JSON.stringify({ lat: loc.lat, lng: loc.lng, time: Date.now() })
        );
        localStorage.setItem('pnm_last_location', JSON.stringify(loc));
        localStorage.setItem('pnm_location_enabled', '1');
        window.dispatchEvent(new Event('sp_user_gps_updated'));
        // GPS takes priority — clear any saved city selection
        localStorage.removeItem('pnm_last_selected_city');
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
      // Re-fetch location-dependent data (daily tournaments, tours); venues handled by userLocation useEffect
      // LEAK FIX: this timer and the reverseGeocode continuation below (which can
      // resolve ~2s later and re-fetch venues) used to run unconditionally after
      // unmount. Both are now cancellable: the timer via gpsRefetchTimerRef, the
      // geocode continuation via pageUnmountedRef.
      if (gpsRefetchTimerRef.current) clearTimeout(gpsRefetchTimerRef.current);
      gpsRefetchTimerRef.current = setTimeout(() => {
        gpsRefetchTimerRef.current = null;
        if (pageUnmountedRef.current) return;
        // BUG FIX: handleGpsSuccess is a useCallback with [reverseGeocode] deps and
        // reverseGeocode is [], so this closure is built ONCE on the first render.
        // Calling `fetchAllData` directly therefore invoked render-1's copy, which
        // closes over userLocation===null / selectedCity===null / the default
        // filters — the state that exists before GPS resolves. That is exactly the
        // state the daily-tournaments WIRING FIX below needs, so a GPS user always
        // got the nationwide list (and the day chip snapped back to today). Go
        // through the ref that is reassigned on every render, the same indirection
        // this function already uses for fetchVenuesRef.
        if (fetchAllDataRef.current) {
          fetchAllDataRef.current({ includeVenues: false, overrideLocation: loc });
        }
      }, 0);
      // Resolve city/state asynchronously and persist label
      reverseGeocode(loc.lat, loc.lng).then((label) => {
        if (pageUnmountedRef.current) return;
        if (label) {
          setGpsLocationLabel(label);
          // Update gpsStateRef with confirmed state so future fetchVenues always have user_state
          const labelParts = label.split(', ');
          const stateCode =
            labelParts.length >= 2 ? labelParts[labelParts.length - 1].trim().toUpperCase() : '';
          if (/^[A-Z]{2}$/.test(stateCode)) gpsStateRef.current = stateCode;
          // Update saved GPS with human-readable label + lobby page keys
          try {
            const saved = JSON.parse(localStorage.getItem('sp-user-gps') || '{}');
            saved.label = label;
            localStorage.setItem('sp-user-gps', JSON.stringify(saved));
            window.dispatchEvent(new Event('sp_user_gps_updated'));
            // Also write lobby-compatible keys for cross-page sync
            const parts = label.split(', ');
            if (parts.length >= 2) {
              localStorage.setItem('pnm_last_city', parts[0]);
              localStorage.setItem('pnm_last_state', parts[parts.length - 1]);
            }
          } catch (e) {
            console.warn('[App] Handled exception:', e?.message || e);
          }
          // Trigger a silent venue refetch now that we have the proper "City, ST" label.
          // The initial GPS-triggered fetch runs while label is still coordinates ("41.7, -87.7"),
          // which means user_state can't be extracted and the API returns 0 local venues.
          // This corrective refetch ensures venues appear once geocoding completes (~1-2s later).
          if (fetchVenuesRef.current) fetchVenuesRef.current(backgroundFetchArgs());
          // BUG FIX: daily tournaments have the SAME problem — the API ignores
          // lat/lng and keys off the 2-letter state, which is still unknown when
          // the GPS-triggered fetch runs. Without this the "N Tournaments" figure
          // and the Daily tab stayed on the nationwide list for every GPS user.
          if (fetchDailyRef.current) fetchDailyRef.current();
        }
      });
    },
    [reverseGeocode]
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const requestGpsLocation = () => {
    haptic('light');
    if (!navigator.geolocation) {
      window.dispatchEvent(new Event('pnm:close-map-fullscreen'));
      setShowLocationModal(true);
      return;
    }
    setGpsLoading(true);
    setGpsLocationLabel('Locating...');
    // Tier 1: High accuracy (GPS/cellular)
    if (gpsFailsafeTimeoutRef.current) clearTimeout(gpsFailsafeTimeoutRef.current);
    const gpsTimeoutId = setTimeout(() => {
      // Failsafe: if GPS hasn't responded in 20s, stop loading
      // Read location via ref — the closure's `userLocation` could be 20s stale
      setGpsLoading(false);
      if (!userLocationRef.current) {
        setGpsLocationLabel(null);
      }
    }, 20000);
    gpsFailsafeTimeoutRef.current = gpsTimeoutId;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(gpsTimeoutId);
        handleGpsSuccess(pos);
      },
      (highAccErr) => {
        if (highAccErr.code === 1) {
          clearTimeout(gpsTimeoutId);
          window.dispatchEvent(new Event('pnm:close-map-fullscreen'));
          setShowLocationModal(true);
          setGpsLoading(false);
          setGpsLocationLabel(null);
          return;
        }
        // Tier 2: Fallback to WiFi/IP-based (works on desktops)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(gpsTimeoutId);
            handleGpsSuccess(pos);
          },
          () => {
            clearTimeout(gpsTimeoutId);
            window.dispatchEvent(new Event('pnm:close-map-fullscreen'));
            setShowLocationModal(true);
            setGpsLoading(false);
            setGpsLocationLabel(null);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  // Load preferences, venue favorites, and search history from Supabase on mount
  useEffect(() => {
    if (userId) {
      getPokerNearMePreferences(userId).then(setPreferences);

      // Load venue favorites from Supabase
      getVenueFavorites(userId)
        .then((data) => {
          const favMap = {};
          data.forEach((f) => {
            favMap['venue-' + f.venue_id] = Date.now();
          });
          setFavorites((prev) => ({ ...prev, ...favMap }));
        })
        .catch((err) => console.warn('Error loading venue favorites:', err));

      // Merge search history from Supabase with localStorage
      getSearchHistoryFromDb(userId, SEARCH_HISTORY_MAX)
        .then((dbHistory) => {
          if (dbHistory && dbHistory.length > 0) {
            setSearchHistory((prev) => {
              const merged = [...new Set([...prev, ...dbHistory.map((h) => h.search_query)])].slice(
                0,
                SEARCH_HISTORY_MAX
              );
              localStorage.setItem('sp-search-history', JSON.stringify(merged));
              return merged;
            });
          }
        })
        .catch((e) => {
          console.warn('[App] Handled promise rejection:', e?.message || e);
        });
    }
  }, [userId]);

  // Hamburger menu handlers - save to Supabase
  const updatePreference = useCallback(
    async (key, value) => {
      if (!requireOnline()) return;
      setPreferences((prev) => ({ ...prev, [key]: value }));

      if (userId) {
        try {
          await updatePokerNearMePreferences(userId, { [key]: value });
        } catch (error) {
          console.warn('Failed to save preference:', error);
        }
      }
    },
    [userId, requireOnline]
  );

  const menuConfig = getMenuConfig('poker-near-me', null, preferences, {
    setGeofenceAlerts: (val) => updatePreference('geofenceAlerts', val),
    setLocationEnabled: (val) => updatePreference('locationEnabled', val),
    setShowNewcomerFriendly: (val) => updatePreference('showNewcomerFriendly', val),
    openGlobalSearch: () => {
      setMenuOpen(false);
      setTimeout(() => setShowGlobalSearch(true), 50);
    },
  });

  const fetchAllData = async ({
    includeVenues = false,
    silent = false,
    overrideLocation = null,
  } = {}) => {
    // The skeleton is for the FIRST load only. Later user-driven refetches
    // (filter changes, a new search) keep the content on screen while the
    // request runs; background polls were already silent.
    const showSkeleton = !silent && isInitialLoad.current;
    if (showSkeleton) setLoading(true);
    const fetches = [fetchTours(overrideLocation), fetchSeries(), fetchDailyTournaments()];
    if (includeVenues) {
      fetches.push(fetchVenues({ silent }));
    }
    try {
      await Promise.allSettled(fetches); // allSettled: one failing fetch never blocks tours/series/venues
    } finally {
      isInitialLoad.current = false;
      setLoading(false);
    }
  };

  // Pull to refresh (src/components/ui/PullToRefresh.jsx): the page's own
  // reload, never a document reload. Silent so the content stays on screen
  // under the spinner.
  const refreshDiscovery = useCallback(async () => {
    if (!requireOnline()) return;
    if (fetchAllDataRef.current) await fetchAllDataRef.current({ includeVenues: true, silent: true });
    if (fetchLiveCountRef.current) fetchLiveCountRef.current();
  }, [requireOnline]);

  const fetchVenues = async ({
    silent = false,
    radiusOverride = null,
    searchOverride = null,
    globalSearch = false,
  } = {}) => {
    if (!silent) setVenueLoading(true);
    setFetchError(null);
    // Sequence guard — declared outside the try so the catch block can also
    // discard stale failures (a slow failing request must not wipe fresh results).
    const currentSeq = ++fetchSequenceRef.current;
    try {
      // [PNM4 FIX] Was limit=1000 which exactly equals Supabase project-level max_rows cap.
      // Any query returning >1000 rows was silently truncated. Lowered to 500 which covers
      // ~99% of filtered queries; unfiltered queries are capped gracefully.
      const params = new URLSearchParams({ limit: '500' });

      // Use searchOverride when provided (avoids stale closure from React async state)
      const effectiveSearch = searchOverride !== null ? searchOverride : searchQuery;

      if (!globalSearch) {
        // Location-browse mode: send GPS/city/state/radius params
        if (selectedCity) {
          params.set('city', selectedCity.name);
          params.set('state', selectedCity.state);
        }
        if (userLocation) {
          params.set('lat', userLocation.lat.toString());
          params.set('lng', userLocation.lng.toString());
          // BUG FIX: 'any' used to be sent as radius=5000, which the API silently
          // clamped to 150 anyway. Send the real ceiling so the request, the
          // "Load More" tier list and the select all agree with the server.
          const effectiveRadius = radiusOverride || filters.radius;
          params.set('radius', String(normalizeRadiusMiles(effectiveRadius)));
          // Determine user_state for API (ensures IL venues don't get cut off by global top-500 limit).
          // Priority: gpsStateRef (in-memory, never cleared) → gpsLocationLabel extraction → pnm_last_state localStorage
          // gpsStateRef persists the last geocoded state even when gpsLocationLabel temporarily
          // shows raw coordinates ("41.716, -87.742") while fresh GPS reverseGeocode is running.
          let stateForApi = gpsStateRef.current || '';
          if (!stateForApi) {
            // Try label extraction: "Oak Lawn, IL" → "IL"
            const labelParts = (gpsLocationLabel || '').split(',');
            const stateFromLabel =
              labelParts.length >= 2 ? labelParts[labelParts.length - 1].trim().toUpperCase() : '';
            if (stateFromLabel && /^[A-Z]{2}$/.test(stateFromLabel)) stateForApi = stateFromLabel;
          }
          if (!stateForApi) {
            // Fallback: read from localStorage (set by lobby or GPS restore)
            try {
              const s = (localStorage.getItem('pnm_last_state') || '').trim().toUpperCase();
              if (s.length === 2 && /^[A-Z]{2}$/.test(s)) stateForApi = s;
            } catch (e) {
              console.warn('[App] Handled exception:', e?.message || e);
            }
          }
          if (stateForApi) params.set('user_state', stateForApi);
        }
        if (filters.venueType !== 'all') {
          params.set('type', filters.venueType);
        }
        if (filters.selectedState && filters.selectedState !== 'all') {
          params.set('state', filters.selectedState);
        }
        if (filters.hasNLH) params.set('hasNLH', 'true');
        if (filters.hasPLO) params.set('hasPLO', 'true');
        if (filters.hasMixed) params.set('hasMixed', 'true');
      }
      // Always send the search term (both modes)
      if (effectiveSearch) {
        params.set('search', effectiveSearch);
      }

      const url = '/api/poker/venues?' + params;
      const json = await fetchWithRetry(url);

      // [HARDENING] Prevent Race Condition: discard if a newer fetch was initiated
      // IMPORTANT: must set venueLoading=false before returning so skeletons don't get stuck
      if (fetchSequenceRef.current !== currentSeq) {
        if (!silent) setVenueLoading(false);
        return;
      }

      const data = json.data;
      let filteredData = data || [];

      // GAP FIX: /api/poker/venues returns standalone home games under a separate
      // top-level `home_groups` key (its own comment says the key exists precisely
      // because "standalone groups (no linked social page) never reached the
      // frontend"). Nothing read it, so the API-side fix was inert and those home
      // games appeared on neither the list nor the map. They already arrive in
      // venue shape (name, venue_type:'home_game', latitude/longitude, stakes_cash,
      // games_offered), so they only need appending — minus the ones that are
      // already present via their linked social page, which would otherwise show
      // up twice.
      const homeGroups = Array.isArray(json.home_groups) ? json.home_groups : [];
      if (homeGroups.length > 0) {
        const presentIds = new Set(filteredData.map((v) => String(v.id)));
        // The API ALSO folds standalone groups straight into `data` (see the
        // "Standalone home groups" block in /api/poker/venues.js) — but without a
        // discriminator the map-merge effect below cannot tell them apart from
        // static poker_venues rows, so they still get no pin. Tag the ones that
        // arrived that way; the append below then only handles what `data` missed.
        const homeGroupIds = new Set(
          homeGroups.filter((g) => g && g.id).map((g) => String(g.id))
        );
        if (homeGroupIds.size > 0) {
          filteredData = filteredData.map((v) =>
            v && !v.is_social_page && homeGroupIds.has(String(v.id))
              ? { ...v, is_home_group: true }
              : v
          );
        }
        const newHomeGroups = homeGroups.filter((g) => {
          if (!g || !g.id) return false;
          if (presentIds.has(String(g.id))) return false;
          if (g.social_page_id && presentIds.has('sp-' + g.social_page_id)) return false;
          return true;
        });
        if (newHomeGroups.length > 0) {
          filteredData = filteredData.concat(
            newHomeGroups.map((g) => ({
              ...g,
              venue_type: g.venue_type || 'home_game',
              // Tag so the map-merge effect can append (and later replace) them.
              is_home_group: true,
            }))
          );
        }
      }

      // Merge live data immediately to prevent extra renders
      filteredData = filteredData.map((venue) => {
        const liveEntry = findLiveCashGameEntry(venue, liveDataMapRef.current);
        if (liveEntry && (liveEntry.games || []).length > 0) {
          return { ...venue, _liveMerged: true, live_data: liveEntry };
        }
        return { ...venue, _liveMerged: true };
      });

      setVenues(filteredData);

      // Update stats from response (only update states, leave global total alone)
      if (json.total) {
        const stateSet = new Set(filteredData.map((v) => v.state).filter(Boolean));
        setDbStats((prev) => {
          const newStates = stateSet.size || prev.states;
          if (prev.states === newStates) return prev;
          return { ...prev, states: newStates };
        });
      }
      if (filteredData.length > 0 && filteredData[0].distance_mi) {
        setNearestDistance(filteredData[0].distance_mi);
      }
    } catch (e) {
      // [HARDENING] A stale (older) request that fails late must not clobber the
      // state of a newer request that already succeeded (fetchWithRetry can take
      // ~3.5s of backoff before rejecting).
      if (fetchSequenceRef.current !== currentSeq) {
        if (!silent) setVenueLoading(false);
        return;
      }
      if (!silent) setLoading(false);
      console.warn('Fetch venues error:', e);
      setFetchError('Failed to load venues. Tap to retry.');
      setVenues([]);
    }
    if (!silent) setVenueLoading(false);
  };

  const fetchTours = async (overrideLocation = null) => {
    try {
      const loc = overrideLocation || userLocation;
      const params = new URLSearchParams({ include_series: 'true', limit: '999' });
      // Guard against stale 'undefined' string values stored in localStorage breaking the API
      if (filters.tourType && filters.tourType !== 'all' && filters.tourType !== 'undefined') {
        params.set('type', filters.tourType);
      }
      if (searchQuery && searchQuery !== 'undefined') {
        params.set('search', searchQuery);
      }

      // Add location for distance-based sorting on the backend. Hardened against malformed loc objects.
      if (loc && typeof loc.lat !== 'undefined' && typeof loc.lng !== 'undefined') {
        params.set('lat', loc.lat.toString());
        params.set('lng', loc.lng.toString());
      } else if (selectedCity && selectedCity.latitude && selectedCity.longitude) {
        params.set('lat', selectedCity.latitude.toString());
        params.set('lng', selectedCity.longitude.toString());
      }

      const url = '/api/poker/tours?' + params;
      const currentSeq = ++fetchToursSeqRef.current;
      const json = await cachedFetch(url);

      if (fetchToursSeqRef.current !== currentSeq) return;

      setTours(json.data || []);
    } catch (e) {
      console.warn('Fetch tours error:', e);
      setTours([]);
    }
  };

  const fetchSeries = async () => {
    try {
      const params = new URLSearchParams({ upcoming: 'true', limit: '999' });

      const today = new Date();
      const endDate = new Date();
      // Guard: seriesTimeframe must be a valid positive number — fallback to 90 days
      const seriesTimeframeDays = Number(filters.seriesTimeframe);
      endDate.setDate(
        today.getDate() +
          (isNaN(seriesTimeframeDays) || seriesTimeframeDays <= 0 ? 90 : seriesTimeframeDays)
      );
      params.set('end_date', endDate.toISOString().split('T')[0]);

      if (filters.seriesType !== 'all') {
        params.set('type', filters.seriesType);
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const url = '/api/poker/series?' + params;
      const currentSeq = ++fetchSeriesSeqRef.current;
      const json = await cachedFetch(url);

      if (fetchSeriesSeqRef.current !== currentSeq) return;

      setSeries(json.data || []);
    } catch (e) {
      console.warn('Fetch series error:', e);
      setSeries([]);
    }
  };

  const fetchDailyTournaments = async (dayOverride) => {
    try {
      const params = new URLSearchParams({ limit: '999' });
      params.set('day', dayOverride || filters.selectedDay);

      if (selectedCity && selectedCity.state) {
        params.set('state', selectedCity.state);
      }
      if (filters.selectedState && filters.selectedState !== 'all') {
        params.set('state', filters.selectedState);
      }
      // WIRING FIX: the daily-tournaments API ignores lat/lng — pass the GPS-derived
      // 2-letter state instead (same resolution chain fetchVenues uses), so GPS-only
      // users get their state's schedule rather than a nationwide unsorted list.
      if (
        !selectedCity &&
        (!filters.selectedState || filters.selectedState === 'all') &&
        userLocation
      ) {
        let stateForApi = gpsStateRef.current || '';
        if (!stateForApi) {
          // Try label extraction: "Oak Lawn, IL" → "IL"
          const labelParts = (gpsLocationLabel || '').split(',');
          const stateFromLabel =
            labelParts.length >= 2 ? labelParts[labelParts.length - 1].trim().toUpperCase() : '';
          if (stateFromLabel && /^[A-Z]{2}$/.test(stateFromLabel)) stateForApi = stateFromLabel;
        }
        if (!stateForApi) {
          // Fallback: read from localStorage (set by lobby or GPS restore)
          try {
            const s = (localStorage.getItem('pnm_last_state') || '').trim().toUpperCase();
            if (s.length === 2 && /^[A-Z]{2}$/.test(s)) stateForApi = s;
          } catch (e) {
            console.warn('[App] Handled exception:', e?.message || e);
          }
        }
        if (stateForApi) params.set('state', stateForApi);
      }
      if (searchQuery) {
        params.set('venue', searchQuery);
      }
      if (filters.minBuyin) {
        params.set('minBuyin', filters.minBuyin);
      }
      if (filters.maxBuyin) {
        params.set('maxBuyin', filters.maxBuyin);
      }
      if (filters.gameType && filters.gameType !== 'all') {
        params.set('game_type', filters.gameType === 'cash' ? 'NLH' : filters.gameType);
      }

      const url = '/api/poker/daily-tournaments?' + params;
      const currentSeq = ++fetchDailySeqRef.current;
      const json = await cachedFetch(url);

      if (fetchDailySeqRef.current !== currentSeq) return;

      const tournamentList = json.tournaments || [];
      setDailyTournaments(tournamentList);
      // Update dbStats with tournament count.
      // BUG FIX: this used to be gated on `tournamentList.length > 0`, so switching
      // to a day with no tournaments left the PREVIOUS day's figure on screen.
      // Write it unconditionally, and record which day it belongs to so the
      // subtitle can stop calling every day's count "Today".
      setDbStats((prev) => ({
        ...prev,
        tournaments: json.stats?.total ?? tournamentList.length,
        tournamentsDay: dayOverride || filters.selectedDay,
      }));
    } catch (e) {
      console.warn('Fetch daily tournaments error:', e);
      setDailyTournaments([]);
    }
  };

  // Pre-compute venueId → maxGuaranteed lookup (eliminates O(n*m) per-card computation)
  const venueMaxGtd = useMemo(() => {
    const map = {};
    (dailyTournaments || []).forEach((t) => {
      if (t.guaranteed) {
        const vid = String(t.venue_id);
        map[vid] = Math.max(map[vid] || 0, Number(t.guaranteed));
      }
    });
    return map;
  }, [dailyTournaments]);

  // NOTE: the old page-level search plumbing (handleSearch, city autocomplete,
  // live-venue search) was removed — search now lives in GlobalSearchOverlay,
  // which does its own fetching. The overlay is wired to page state below
  // (searchQuery / searchHistory / addToSearchHistory).

  // ═══ DEEP LINK PERSISTENCE: write tab + search to URL (debounced) ═══
  const deepLinkRef = useRef(null);
  const paramsAbsorbed = useRef(false);
  const landingSectionRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !router.isReady || !paramsAbsorbed.current) return;
    if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
    deepLinkRef.current = setTimeout(() => {
      if (discoveryPageExitingRef.current) return;
      // SEO FIX: the slug table now lives in the module-scope getTabSlug helper,
      // shared with the canonical tag below. They used to derive slugs
      // independently ('daily' vs 'daily-tournaments'), so the crawled URL
      // declared a canonical pointing at a DIFFERENT URL that renders the same
      // content — creating a duplicate instead of consolidating it.
      const { pathSlug, url: newUrl } = buildDiscoveryUrl({
        showLiveTab,
        activeTab,
        activeEventTab,
        activeMoreTab,
        searchQuery,
        venueType: filters.venueType,
      });

      // A Back followed quickly by Forward can outpace React's effect cleanup,
      // especially in WebKit. Never let a delayed writer from the prior history
      // entry replace the address that the browser has already restored.
      const addressSlug = normalizeRouteSlug(
        window.location.pathname.split('/').filter(Boolean).at(-1)
      );
      if (addressSlug !== pathSlug) return;

      // Keep the route-sync effect in agreement with UI-driven URL rewrites
      // (native history writes don't update router.query.pnmTab).
      lastRouteTabRef.current = pathSlug;

      // router.asPath stays stale after a native History API write. Compare the
      // actual address bar so later filter changes cannot duplicate an entry.
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== newUrl) {
        // IMPORTANT: Use the native History API, NOT router.replace.
        // router.replace can cause a re-render cycle that resets component state,
        // which wipes out searchQuery and causes an empty URL to be pushed immediately after.
        window.history.replaceState(
          {
            ...window.history.state,
            as: newUrl,
            url: newUrl,
            options: { ...window.history.state?.options, shallow: true, scroll: false },
          },
          '',
          newUrl
        );
      }
    }, 500);
    return () => {
      if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
    };
  }, [
    activeTab,
    activeEventTab,
    activeMoreTab,
    showLiveTab,
    searchQuery,
    filters.venueType,
    router.isReady,
    router.asPath,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read deep link params on mount (Bypass Next.js router.query hydration delays)
  useEffect(() => {
    if (typeof window === 'undefined' || paramsAbsorbed.current) return;

    const target = resolveDiscoveryDeepLink({
      pathname: window.location.pathname,
      search: window.location.search,
    });

    if (target.query) setSearchQuery(target.query);
    if (target.openSearch) setShowGlobalSearch(true);

    if (target.showLiveTab) {
      setShowLiveTab(true);
      if (target.canonicalLiveUrl) {
        window.history.replaceState(
          { ...window.history.state, as: target.canonicalLiveUrl, url: target.canonicalLiveUrl },
          '',
          target.canonicalLiveUrl
        );
      }
    } else if (target.activeTab) {
      setShowLiveTab(false);
      if (target.activeTab === 'more' && target.activeMoreTab) {
        setUiFilter('activeTab', 'more');
        setActiveMoreTab(target.activeMoreTab);
      } else {
        setActiveTab(target.activeTab);
      }
      if (target.activeEventTab) setActiveEventTab(target.activeEventTab);
    }

    if (target.venueType) {
      setFilters((previous) => ({ ...previous, venueType: target.venueType }));
    }
    // Set unconditionally so the writer effect can activate when router is ready
    paramsAbsorbed.current = true;

    // Arriving on /hub/poker-near-me/<slug> lands on that section after paint.
    // Every slug names one stacked section; the bare route (no slug) stays at
    // the top so the reader sees the title, the anchor row and the filters.
    const landingSlug = window.location.pathname.split('/').filter(Boolean).at(-1);
    const landingSection = sectionForSlug(landingSlug);
    if (landingSection) {
      landingSectionRef.current = landingSection;
      scrollToSurface(landingSection, { behavior: 'auto' });
    }
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Content above a deep-linked section keeps growing after the initial data
  // request settles: dynamic chunks mount, images acquire dimensions and
  // near-viewport LazyPanels exchange skeletons for their real content. A
  // one-shot correction still leaves destinations such as /map several
  // screens away from the viewport. Keep the requested section anchored for a
  // short, bounded hydration window, but stop immediately when the visitor
  // expresses scroll/navigation intent so the page never fights them.
  useEffect(() => {
    if (loading || !landingSectionRef.current || typeof window === 'undefined') return undefined;
    const key = landingSectionRef.current;
    let cancelled = false;
    let resizeTimer = null;
    let observer = null;
    const timers = [];

    const cleanup = () => {
      if (cancelled) return;
      cancelled = true;
      if (landingSectionRef.current === key) landingSectionRef.current = null;
      timers.forEach((timer) => window.clearTimeout(timer));
      if (resizeTimer) window.clearTimeout(resizeTimer);
      observer?.disconnect();
      window.removeEventListener('wheel', cleanup, true);
      window.removeEventListener('touchstart', cleanup, true);
      window.removeEventListener('pointerdown', cleanup, true);
      window.removeEventListener('keydown', cleanup, true);
    };

    const realign = () => {
      if (!cancelled && landingSectionRef.current === key) {
        scrollToSurface(key, { behavior: 'auto' });
      }
    };

    [0, 140, 360, 760, 1400, 2400, 3800, 5600].forEach((delay) => {
      timers.push(window.setTimeout(realign, delay));
    });
    timers.push(window.setTimeout(cleanup, 6400));

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(realign, 72);
      });
      observer.observe(document.querySelector('.pnm-page-container') || document.body);
    }

    window.addEventListener('wheel', cleanup, { capture: true, passive: true });
    window.addEventListener('touchstart', cleanup, { capture: true, passive: true });
    window.addEventListener('pointerdown', cleanup, { capture: true, passive: true });
    window.addEventListener('keydown', cleanup, true);

    return cleanup;
  }, [loading, scrollToSurface]);

  // Native pushState keeps the page mounted, so Next.js does not restore our
  // React state when the user traverses browser history. Re-absorb the canonical
  // URL on popstate. The writer observes that the address already matches, and
  // the polite route announcer below reports the restored surface to assistive
  // technology.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const restoreDiscoveryState = () => {
      const target = resolveDiscoveryDeepLink({
        pathname: window.location.pathname,
        search: window.location.search,
      });
      setShowGlobalSearch(false);
      setSearchQuery(target.query || '');
      setShowLiveTab(Boolean(target.showLiveTab));
      if (target.activeTab === 'more') {
        setUiFilter('activeTab', 'more');
        setActiveMoreTab(target.activeMoreTab || 'overview');
      } else if (target.activeTab) {
        setActiveTab(target.activeTab);
        if (target.activeEventTab) setActiveEventTab(target.activeEventTab);
      }
      setFilters((previous) => ({
        ...previous,
        venueType: target.venueType || 'all',
      }));
      const restoredSlug = window.location.pathname.split('/').filter(Boolean).at(-1);
      const previousSlug = lastRouteTabRef.current;
      lastRouteTabRef.current = normalizeRouteSlug(restoredSlug);
      // A modal closing through the back gesture (useModalHistory) also fires
      // popstate on the SAME surface; only a real surface change scrolls.
      const restoredSection = sectionForSlug(restoredSlug);
      if (restoredSection && lastRouteTabRef.current !== previousSlug) scrollToSurface(restoredSection);
    };
    window.addEventListener('popstate', restoreDiscoveryState);
    return () => window.removeEventListener('popstate', restoreDiscoveryState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  fetchAllDataRef.current = fetchAllData;
  fetchVenuesRef.current = fetchVenues;
  fetchDailyRef.current = fetchDailyTournaments;

  // ═══ PUSH NOTIFICATION REGISTRATION ═══
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);
  // NOTE: Realtime subscription on 'tables' was removed — it fired fetchAllData
  // on every single postgres UPDATE, causing constant page glitching/flickering.
  // Users can pull-to-refresh or search to get fresh data instead.

  const requestPushPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPushPermission(result);
      if (result === 'granted') {
        trackSearchEvent('push_enabled', {});
      }
    } catch (e) {
      console.warn('Push permission error:', e);
    }
  }, []);

  // BUG FIX: clearing the location used to wipe React state only. 'sp-user-gps',
  // 'pnm_last_location' and 'pnm_location_enabled' survived, so the mount restore
  // effect re-applied the very same location on the next visit (and fired a fresh
  // silent getCurrentPosition) — a user who deliberately cleared their location to
  // browse another city found it snapped back with no explanation. Both the X
  // button on the location pill and clearFilters now go through this.
  const clearPersistedLocation = useCallback(() => {
    try {
      localStorage.removeItem('sp-user-gps');
      localStorage.removeItem('pnm_last_location');
      localStorage.removeItem('pnm_last_city');
      localStorage.removeItem('pnm_last_state');
      localStorage.removeItem('pnm_last_selected_city');
      localStorage.setItem('pnm_location_enabled', '0');
      // Tell the other pages that read these keys (lobby etc.) to follow.
      window.dispatchEvent(new Event('sp_user_gps_updated'));
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    // Stop sending a stale user_state on the next fetch.
    gpsStateRef.current = '';
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCity(null);
    setUserLocation(null);
    setGpsLocationLabel(null);
    setSearchQuery('');
    setHasSearched(false);
    setVenues([]);
    setFetchError(null);
    setNearestDistance(null);
    setSortBy('default');
    setDisplayCount((prev) => ({ ...prev, venues: INITIAL_VISIBLE }));
    setFilters({
      radius: 50,
      venueType: 'all',
      hasNLH: false,
      hasPLO: false,
      hasMixed: false,
      tourType: 'all',
      seriesTimeframe: 90,
      seriesType: 'all',
      selectedDay: getCurrentDay(),
      minBuyin: '',
      maxBuyin: '',
      stakes: 'all',
      gameType: 'all',
      selectedState: 'all',
    });
    // Clear the persisted city AND GPS keys so nothing ghost-restores next visit
    clearPersistedLocation();
  }, [clearPersistedLocation]);

  // Loading skeleton component
  const renderSkeletons = (count = 8) => (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="entity-card skeleton-card">
          <div className="skel skel-header"></div>
          <div className="skel skel-title"></div>
          <div className="skel skel-text"></div>
          <div className="skel skel-tags"></div>
          <div className="skel skel-footer"></div>
        </div>
      ))}
    </div>
  );

  // Render content based on active tab

  // ─── CARD LIST: Use API-filtered `venues` (server-side GPS+radius filtered) ───
  // Tour stops come from allVenuesWithTours since the venues API doesn't serve them.
  // This prevents Las Vegas venues from appearing in an Oak Lawn 50mi search.
  const venueCardList = React.useMemo(() => {
    const tourStops = allVenuesWithTours.filter((v) => v.venue_type === 'tour_stop');
    // Dedupe: don't add a tour stop if a matching venue is already in `venues`
    const venueIds = new Set(venues.map((v) => String(v.id)));
    const uniqueTourStops = tourStops.filter((t) => !venueIds.has(String(t.id)));
    let combined = [...venues, ...uniqueTourStops];

    // ─── CLIENT-SIDE: gameType + stakes ───
    // venueType is server-side; gameType and stakes are applied client-side.
    // BUG FIX: this block used to hold its own copy of the game-type matching
    // logic while useTourMapStops applied a DIFFERENT one to the map (and the
    // stakes block right below it was commented out entirely, making the Stakes
    // dropdown a no-op for the list while it silently deleted most map pins).
    // Both surfaces now share venueMatchesGameType / venueMatchesStakes, which
    // treat missing games_offered / stakes_cash as "unknown — do not exclude"
    // rather than "no match" (that is what used to hide every charity and home
    // game from the map).
    if (
      (filters.gameType && filters.gameType !== 'all') ||
      (filters.stakes && filters.stakes !== 'all')
    ) {
      combined = combined.filter(
        (v) =>
          venueMatchesGameType(v, filters.gameType) && venueMatchesStakes(v, filters.stakes)
      );
    }

    return combined;
  }, [venues, allVenuesWithTours, filters.gameType, filters.stakes]);

  // Shared VenuesTabPanel JSX — single definition for 3 render paths
  const venuesTabJsx = (
    <VenuesTabPanel
      venues={venueCardList}
      venueLoading={venueLoading}
      loading={loading}
      sortBy={sortBy}
      setSortBy={setSortBy}
      getSortedVenues={getSortedVenues}
      displayCount={displayCount}
      loadMore={loadMore}
      mapCenter={mapCenter}
      userLocation={userLocation}
      isFavorited={isFavorited}
      toggleFavorite={toggleFavorite}
      venueMaxGtd={venueMaxGtd}
      promotionVenueIds={promotionVenueIds}
      highlightedVenueId={highlightedVenueId}
      nearestDistance={nearestDistance}
      filters={filters}
      clearFilters={clearFilters}
      pnmReviewStatsMap={pnmReviewStatsMap}
      router={router}
      openVenueModal={openVenueModal}
      onMapVenueClick={onMapVenueClick}
      iframeModal={iframeModal}
      setIframeModal={setIframeModal}
      checkinCounts={checkinCounts}
    />
  );

  // ═══ STACKED SECTIONS (mobile phase 3) ═══
  // Every surface renders, in PRIMARY_SECTIONS order, under its own heading.
  // The old renderContent() switch that unmounted all but one surface is gone:
  // a hidden-content tab is "slide to see" with extra steps (mobile standard,
  // rule 2). Heavy panels sit inside LazyPanel and mount when scrolled near.
  const firstPaintSkeleton = loading && isInitialLoad.current;

  const liveSection = (
    <section
      id={sectionId('live')}
      className="pnm-section pnm-section--live"
      aria-labelledby="pnm-section-live-title"
      data-tutorial="live"
    >
      <div className="pnm-section__head">
        <span className="pnm-live-dot pnm-section__live-dot" aria-hidden="true" />
        <h2 id="pnm-section-live-title" className="pnm-section__title">Cash Games Near Me</h2>
        <p className="pnm-section__hint">
          {liveDataMode === 'estimated' || liveDataMode === 'mixed'
            ? 'Estimated Counts Use Qualified Saved Observations, Not A Current Live Report.'
            : liveDataMode === 'catalog'
              ? 'Listed Games Are Available, But Current Table Counts Are Unknown.'
            : 'Table Counts Come From The Live Games Feed.'}
        </p>
      </div>
      <LazyPanel minHeight={320}>
        <TabErrorBoundary>
          {/* WIRING FIX: LiveGamesFeed declares `checkinCounts = {}` and the page
              holds a populated map, but it was never passed — the Live tab showed
              no check-in activity while the Venues tab did. */}
          <LiveGamesFeed
            venues={allVenuesWithTours.length > 0 ? allVenuesWithTours : venues}
            userLocation={userLocation}
            selectedCity={selectedCity}
            globalFilters={filters}
            setGlobalFilters={setFilters}
            favorites={favorites}
            handleToggleFavorite={(venueId, venueData) =>
              toggleFavorite('venue', venueId, null, venueData)
            }
            checkinCounts={checkinCounts}
            router={router}
            openVenueModal={openVenueModal}
            setSelectedVenueForReview={setReviewVenue}
            user={user}
          />
        </TabErrorBoundary>
      </LazyPanel>
    </section>
  );

  const mapSection = (
    <section
      id={sectionId('map')}
      className="pnm-section pnm-section--map"
      aria-labelledby="pnm-section-map-title"
      data-tutorial="map"
    >
      <div className="pnm-section__head">
        <h2 id="pnm-section-map-title" className="pnm-section__title">Poker Room Map</h2>
        <p className="pnm-section__hint">Every Pin Is A Room. Tap One For Details, Or Use My Location To Centre The Map.</p>
      </div>
      <LazyPanel minHeight={360}>
        <TabErrorBoundary>
          <MapTabPanel
            allVenuesForMap={allVenuesWithTours}
            mapFilters={mapFilters}
            setMapFilters={setMapFilters}
            filters={filters}
            setFilters={setFilters}
            userLocation={userLocation}
            mapCenter={mapCenter}
            onMapVenueClick={onMapVenueClick}
            requestGpsLocation={requestGpsLocation}
            openVenueModal={openVenueModal}
            setIframeModal={setIframeModal}
          />
        </TabErrorBoundary>
      </LazyPanel>
    </section>
  );

  const savedSection = (
    <section
      id={sectionId('saved')}
      className="pnm-section pnm-section--saved"
      aria-labelledby="pnm-section-saved-title"
      data-tutorial="saved"
    >
      <div className="pnm-section__head">
        <h2 id="pnm-section-saved-title" className="pnm-section__title">Saved Poker Places</h2>
        <p className="pnm-section__hint">Rooms, Tours And Series You Have Favourited, In One Place.</p>
      </div>
      <TabErrorBoundary>
        <FavoritesTabPanel
          allVenuesForMap={allVenuesForMap}
          venues={venues}
          isFavorited={isFavorited}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          venueMaxGtd={venueMaxGtd}
          promotionVenueIds={promotionVenueIds}
          pnmReviewStatsMap={pnmReviewStatsMap}
          setActiveTab={navigateActiveTab}
          router={router}
          openVenueModal={openVenueModal}
        />
      </TabErrorBoundary>
    </section>
  );

  const venuesSection = (
    <section
      id={sectionId('venues')}
      className="pnm-section pnm-section--venues"
      aria-labelledby="pnm-section-venues-title"
      data-tutorial="venues"
    >
      <div className="pnm-section__head">
        <h2 id="pnm-section-venues-title" className="pnm-section__title">Rooms And Venues</h2>
        <p className="pnm-section__hint">Casinos, Card Rooms, Clubs And Home Games Sorted By Distance. Tap The Heart To Save One.</p>
      </div>
      <TabErrorBoundary>
        {hasSearched && (venueLoading || firstPaintSkeleton) ? renderSkeletons(8) : venuesTabJsx}
      </TabErrorBoundary>
    </section>
  );

  const eventsSection = (
    <section
      id={sectionId('events')}
      className="pnm-section pnm-section--events"
      aria-labelledby="pnm-section-events-title"
      data-tutorial="events"
    >
      <div className="pnm-section__head">
        <h2 id="pnm-section-events-title" className="pnm-section__title">Events And Tournaments</h2>
        <p className="pnm-section__hint">The Daily List, Travelling Tours, Festival Series And The Calendar.</p>
      </div>
      <nav className="pnm-sub-tabs" aria-label="Events sections">
        {EVENT_SECTIONS.map((sub) => {
          const selected = activeTab === 'events' && !showLiveTab && activeEventTab === sub.key;
          return (
            <button
              key={sub.key}
              type="button"
              className={'pnm-sub-tab' + (selected ? ' active' : '')}
              aria-current={selected ? 'true' : undefined}
              onClick={() => {
                haptic('light');
                navigateActiveEventTab(sub.key);
              }}
            >
              {sub.label}
            </button>
          );
        })}
      </nav>
      <div id={sectionId('daily')} className="pnm-subsection">
        <h3 className="pnm-subsection__title">Daily Tournaments</h3>
        <TabErrorBoundary>
          {firstPaintSkeleton ? (
            renderSkeletons(4)
          ) : (
            <LazyPanel>
              <DailyTournamentsTabPanel
                dailyTournaments={dailyTournaments}
                filters={filters}
                setFilters={setFilters}
                fetchDailyTournaments={fetchDailyTournaments}
              />
            </LazyPanel>
          )}
        </TabErrorBoundary>
      </div>
      <div id={sectionId('tours')} className="pnm-subsection">
        <h3 className="pnm-subsection__title">Poker Tours</h3>
        <TabErrorBoundary>
          <LazyPanel>
            <ToursTabPanel
              tours={tours}
              filters={filters}
              setFilters={setFilters}
              displayCount={displayCount}
              loadMore={loadMore}
              isFavorited={isFavorited}
              toggleFavorite={toggleFavorite}
              router={router}
              openVenueModal={openVenueModal}
            />
          </LazyPanel>
        </TabErrorBoundary>
      </div>
      <div id={sectionId('series')} className="pnm-subsection">
        <h3 className="pnm-subsection__title">Poker Series</h3>
        <TabErrorBoundary>
          <LazyPanel>
            <SeriesTabPanel
              series={series}
              filters={filters}
              setFilters={setFilters}
              displayCount={displayCount}
              loadMore={loadMore}
              seriesViewMode={seriesViewMode}
              setSeriesViewMode={setSeriesViewMode}
              isFavorited={isFavorited}
              toggleFavorite={toggleFavorite}
              router={router}
              openVenueModal={openVenueModal}
            />
          </LazyPanel>
        </TabErrorBoundary>
      </div>
      <div id={sectionId('calendar')} className="pnm-subsection">
        <h3 className="pnm-subsection__title">Events Calendar</h3>
        <TabErrorBoundary>
          <LazyPanel>
            {/* WIRING FIX: SeasonalCalendar's signature is ({ series, tours }) —
                dailyTournaments was silently dropped, so the prop only implied a
                daily schedule that was never rendered. Removed rather than faked;
                folding daily tournaments into the calendar needs a change in
                SeasonalCalendar.jsx, which is outside this file. */}
            <SeasonalCalendar series={series} tours={tours} />
          </LazyPanel>
        </TabErrorBoundary>
      </div>
    </section>
  );

  const moreSection = (
    <section
      id={sectionId('more')}
      className="pnm-section pnm-section--more"
      aria-labelledby="pnm-section-more-title"
      data-tutorial="more"
    >
      <div className="pnm-section__head">
        <h2 id="pnm-section-more-title" className="pnm-section__title">Discovery Tools</h2>
        <p className="pnm-section__hint">Best Time To Go, Road Trips, The Social Feed, Game Alerts, Near Me Now And Trip Costs.</p>
      </div>
      <TabErrorBoundary>
        <MoreTabPanel
          activeMoreTab={activeMoreTab}
          setActiveMoreTab={navigateActiveMoreTab}
          allVenuesForMap={allVenuesForMap}
          venues={venues}
          userLocation={userLocation}
          userId={userId}
          user={user}
          dailyTournaments={dailyTournaments}
          series={series}
          gpsLocationLabel={gpsLocationLabel}
          geofenceStatus={geofenceStatus}
          pushPermission={pushPermission}
          requestPushPermission={requestPushPermission}
          setPushPermission={setPushPermission}
          guardAction={guardAction}
          requestGpsLocation={requestGpsLocation}
          setActiveTab={navigateActiveTab}
          router={router}
          openVenueModal={openVenueModal}
          authToken={user?.access_token || sessionToken || undefined}
          requireOnline={requireOnline}
        />
      </TabErrorBoundary>
    </section>
  );

  const stackedSections = {
    venues: venuesSection,
    events: eventsSection,
    live: liveSection,
    map: mapSection,
    saved: savedSection,
    more: moreSection,
  };

  // Overlays this page owns: the phone back gesture closes them first.
  // GlobalSearchOverlay and VenueReviews push their own history entry
  // (they call useModalHistory themselves, so they behave the same from the
  // lobby); the venue-detail overlay is page state, so its entry lives here.
  const closeReviewPanel = useCallback(() => setReviewVenue(null), []);
  const closeIframeModal = useCallback(() => setIframeModal((prev) => ({ ...prev, isOpen: false })), []);
  useModalHistory(iframeModal.isOpen, closeIframeModal);
  const anySheetOpen = showGlobalSearch || !!reviewVenue || iframeModal.isOpen || showLocationModal || menuOpen;

  // ═══ SEO: canonical slug + structured data ═══
  // Both the canonical tag and the deep-link writer read the same slug table.
  const stateCanonicalSlug = getTabSlug({ showLiveTab, activeTab, activeEventTab, activeMoreTab });
  // The server render cannot read local persisted tab state. Use the requested
  // dynamic route until the mount parser has absorbed it, then let UI state own
  // the canonical URL. This prevents /venues, /series, etc. from initially
  // publishing the persisted/default /map identity to crawlers.
  const requestedCanonicalSlug = normalizeRouteSlug(router.query.pnmTab);
  const canonicalSlug = !paramsAbsorbed.current && requestedCanonicalSlug
    ? requestedCanonicalSlug
    : stateCanonicalSlug;
  const routeMeta = ROUTE_META[canonicalSlug] || ROUTE_META.venues;

  // SEO FIX: the highest-intent commercial query on the platform shipped a title,
  // a meta description, an H1 and an empty shell — every content panel is
  // dynamic({ ssr: false }) and all data is fetched after mount, so crawlers saw
  // no venue names, no cities and no markup. SEOHead already supports a `jsonLd`
  // prop and nothing was passing it. Emit BreadcrumbList + WebSite SearchAction
  // (both static, so they are correct even on the very first paint) plus an
  // ItemList of the resolved location's top venues once they have loaded.
  // The first directory page is server-rendered below; client-only panels then
  // progressively hydrate around that crawlable venue rail.
  const jsonLdLocationLabel = gpsLocationLabel || (selectedCity ? selectedCity.name : null);
  // SEOHead injects the graph with dangerouslySetInnerHTML + JSON.stringify, which
  // does NOT escape '<'. Venue names/cities are scraped third-party strings, so a
  // literal '</script>' in one would break out of the ld+json block. Strip the two
  // characters that can close it — nothing else is meaningful in a business name.
  const jsonLdText = (v) => String(v == null ? '' : v).replace(/[<>]/g, '');
  // Only real venue rows belong here. venueCardList also carries synthetic tour
  // stops (id 'tour-stop-<code>' — see useTourMapStops), which have no
  // /hub/venues/<id> page and are tournament series, not LocalBusinesses; emitting
  // them would publish 404 URLs as structured data. Social pages live at /club/<id>
  // and home games with a slug at /hub/home-games/<slug> (see VenueCard.getVenueUrl),
  // so they are excluded rather than given the wrong URL.
  const jsonLdVenues = (venueCardList || [])
    .filter(
      (v) =>
        v &&
        v.name &&
        v.id != null &&
        v.venue_type !== 'tour_stop' &&
        !v.is_social_page &&
        !String(v.id).startsWith('tour-stop-') &&
        !(v.venue_type === 'home_game' && (v.slug || v.host_social_page_slug))
    )
    .slice(0, 10);
  const pageJsonLd = {
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Smarter.Poker',
        url: 'https://smarter.poker',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://smarter.poker/hub/poker-near-me/venues?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Hub',
            item: 'https://smarter.poker/hub',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Poker Near Me',
            item: 'https://smarter.poker/hub/poker-near-me/venues',
          },
          ...(canonicalSlug !== 'venues'
            ? [{
                '@type': 'ListItem',
                position: 3,
                name: routeMeta.breadcrumb,
                item: `https://smarter.poker/hub/poker-near-me/${canonicalSlug}`,
              }]
            : []),
        ],
      },
      {
        '@type': 'ItemList',
        name: jsonLdLocationLabel
          ? `Poker Rooms Near ${jsonLdText(jsonLdLocationLabel)}`
          : 'Poker Rooms And Card Rooms In The United States',
        numberOfItems: jsonLdVenues.length,
        itemListElement: jsonLdVenues.map((v, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'LocalBusiness',
            name: jsonLdText(v.name),
            url: `https://smarter.poker/hub/venues/${encodeURIComponent(String(v.id))}`,
            ...(v.city || v.state
              ? {
                  address: {
                    '@type': 'PostalAddress',
                    ...(v.city ? { addressLocality: jsonLdText(v.city) } : {}),
                    ...(v.state ? { addressRegion: jsonLdText(v.state) } : {}),
                    addressCountry: 'US',
                  },
                }
              : {}),
            ...(v.latitude &&
            v.longitude &&
            Number.isFinite(Number(v.latitude)) &&
            Number.isFinite(Number(v.longitude))
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    // poker_venues.latitude/longitude are `numeric`, which PostgREST
                    // serialises as strings — schema.org wants numbers.
                    latitude: Number(v.latitude),
                    longitude: Number(v.longitude),
                  },
                }
              : {}),
          },
        })),
      },
    ],
  };
  const snapshotGeneratedLabel = directorySnapshot?.generated_at
    ? new Date(directorySnapshot.generated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <>
      {/* SEO FIX: the canonical used to be built from the INTERNAL sub-tab key
          ('/daily', '/calendar') while the deep-link writer that owns the address
          bar emitted '/daily-tournaments' and '/events-calendar'. Both now read the
          same getTabSlug table, so the crawled URL is the canonical URL. The page
          also shipped no structured data at all — see pageJsonLd above. */}
      <SEOHead
        title={routeMeta.title}
        description={routeMeta.description}
        canonical={`/hub/poker-near-me/${canonicalSlug}`}
        noindex={!isPokerDiscoveryRouteIndexable(canonicalSlug)}
        jsonLd={pageJsonLd}
      />

      <HubPageShell
        className="pnm"
        maxWidth={1080}
        header={
          <UniversalHeader
            pageDepth={2}
            showSearch={true}
            onSearchClick={() => setShowGlobalSearch(true)}
            onBackClick={() => {
              // Bug 4: Implement a robust fallback for the "BACK" button
              if (typeof window !== 'undefined' && window.history.length > 2) {
                router.back();
              } else {
                router.push('/hub');
              }
            }}
            onMenuClick={() => setMenuOpen(true)}
          />
        }
        onMenuClick={() => setMenuOpen(true)}
      >
        <PokerNearMeFamilyNav />
        {/* Hamburger Menu */}
        <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          direction="left"
          theme="dark"
          user={null}
          showProfile={false}
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        {/* Global Search Overlay — opened from hamburger menu */}
        {showGlobalSearch && (
          <GlobalSearchOverlay
            isOpen={showGlobalSearch}
            onClose={() => {
              setShowGlobalSearch(false);
              // BUG FIX: GlobalSearchOverlay fires onSearchChange on EVERY keystroke
              // and closing it only used to strip ?q= from the address bar. The page
              // kept the text in `searchQuery`, which fetchVenues / fetchTours /
              // fetchSeries / fetchDailyTournaments all apply as an implicit
              // search=/venue= filter — so the next background refresh (5-minute
              // poll, radius change, venue-type change, pull-to-refresh) silently
              // replaced the user's location-browse results with search matches,
              // with nothing on screen saying a search was active. It also let the
              // deep-link writer re-append ?q= ~500ms after this handler cleaned it,
              // which re-opened the overlay on the next load.
              setSearchQuery('');
              // BUG FIX: strip only the ?q= param from the CURRENT url — this
              // previously hardcoded /lobby, rewriting the address bar away from
              // whichever tab was actually on screen (and matched ?faq=1 etc.).
              if (typeof window !== 'undefined') {
                const sp = new URLSearchParams(window.location.search);
                if (sp.has('q')) {
                  sp.delete('q');
                  const qs = sp.toString();
                  const cleanUrl = window.location.pathname + (qs ? '?' + qs : '');
                  window.history.replaceState(
                    { ...window.history.state, as: cleanUrl, url: cleanUrl },
                    '',
                    cleanUrl
                  );
                }
              }
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onHistorySelect={addToSearchHistory}
            trackSearchEvent={trackSearchEvent}
            allTours={tours || []}
            allSeries={series || []}
            searchHistory={searchHistory}
            cachedFetch={cachedFetch}
          />
        )}

        <PullToRefresh onRefresh={refreshDiscovery} disabled={anySheetOpen}>
          <div className="pnm-page" data-pnm-realism="machined-v2" data-pnm-hydrated={isHydrated ? 'true' : 'false'}>
            <div className="space-bg"></div>
            <div className="space-overlay"></div>

            {/* ═══ PAGE TITLE ═══ */}
            <div className="pnm-title-bar">
              <h1 className="pnm-title">{routeMeta.heading}</h1>
              <p className="pnm-subtitle">
                {dbStats.total === 0 && liveTableCount === 0 ? (
                  'Loading Live Data...'
                ) : (
                  <>
                    {dbStats.total > 0 ? dbStats.total.toLocaleString() : '-'} Public Venues &nbsp;&bull;&nbsp;
                    {/* UX FIX: 'mixed' means the published total is real observations
                        PLUS simulator output, so it must carry the approximate label
                        too. Pending and offline feeds cannot prove a zero count, so
                        they render a dash instead of a misleading zero. */}
                    {liveDataMode == null || liveDataMode === 'none'
                      ? '-'
                      : liveDataMode === 'catalog'
                        ? 'Unknown'
                      : liveTableCount.toLocaleString()}{' '}
                    {liveDataMode === 'estimated' || liveDataMode === 'mixed'
                      ? 'Tables (Approx.)'
                      : liveDataMode === 'catalog'
                        ? 'Live Table Count'
                        : 'Live Tables'}
                    {typeof liveDataAgeMinutes === 'number' && liveDataAgeMinutes > 60 && (
                      <span style={{ opacity: 0.6 }}>
                        {' '}
                        ({Math.round(liveDataAgeMinutes / 60)}h Old)
                      </span>
                    )}
                    {/* BUG FIX: this figure is for filters.selectedDay, which the day
                        selector lets the user change, but it always read "Today" — so
                        after picking Saturday the header claimed that many tournaments
                        were running today. Label it with the day it actually counts. */}
                    {dbStats.tournaments > 0 && (
                      <>
                        &nbsp;&bull;&nbsp;
                        {dbStats.tournaments.toLocaleString()} Tournaments{' '}
                        {!dbStats.tournamentsDay || dbStats.tournamentsDay === getCurrentDay()
                          ? 'Today'
                          : dbStats.tournamentsDay}
                      </>
                    )}
                  </>
                )}
              </p>
              <DiscoveryStatusRail
                venueCount={dbStats.total}
                mappedVenueCount={mappedVenueCount}
                liveTableCount={liveTableCount}
                liveDataMode={liveDataMode}
                liveDataAgeMinutes={liveDataAgeMinutes}
                tournamentCount={dbStats.tournaments}
                tournamentDay={
                  !dbStats.tournamentsDay || dbStats.tournamentsDay === getCurrentDay()
                    ? 'today'
                    : dbStats.tournamentsDay
                }
              />
              {(directorySource !== 'supabase' || !directoryProgress.complete) && (
                <div className="pnm-directory-source" role="status" aria-live="polite" data-directory-source={directorySource}>
                  <span>
                    {directorySource === 'supabase'
                      ? `Loading live venue registry - ${directoryProgress.loaded} rooms ready.`
                      : directorySource === 'unavailable'
                      ? 'The venue registry is temporarily unavailable.'
                      : directorySource === 'partial_live'
                        ? `Live registry refresh stopped after ${directoryProgress.loaded} rooms. Existing results remain available.`
                      : directorySource === 'browser_cache'
                        ? 'Live registry refresh is unavailable. Showing your most recent verified directory cache.'
                        : `Live registry refresh is unavailable. Showing the published venue snapshot${snapshotGeneratedLabel ? ` from ${snapshotGeneratedLabel}` : ''}.`}
                  </span>
                  {directorySource !== 'supabase' && (
                    <button type="button" onClick={() => router.reload()}>Retry Live Registry</button>
                  )}
                </div>
              )}
              {initialVenues.length > 0 && (
                <section className="pnm-ssr-directory" aria-labelledby="pnm-ssr-directory-title">
                  <div className="pnm-ssr-directory-heading">
                    <div>
                      <span>National Room Registry</span>
                      <h2 id="pnm-ssr-directory-title">Featured Poker Rooms</h2>
                    </div>
                    <a href="/hub/poker-near-me/in">Browse By State</a>
                  </div>
                  <div className="pnm-ssr-directory-grid">
                    {initialVenues.slice(0, 8).map((venue) => (
                      <a className="pnm-ssr-venue" href={`/hub/venues/${encodeURIComponent(String(venue.id))}`} key={venue.id}>
                        <span
                          className="pnm-ssr-venue-art"
                          style={venue.cover_photo_url || venue.profile_photo_url
                            ? { backgroundImage: `url(${JSON.stringify(venue.cover_photo_url || venue.profile_photo_url).slice(1, -1)})` }
                            : undefined}
                          aria-hidden="true"
                        />
                        <span className="pnm-ssr-venue-copy">
                          <small>{venue.venue_type?.replace(/_/g, ' ') || 'Poker room'}</small>
                          <strong>{venue.name}</strong>
                          <span>{[venue.city, venue.state].filter(Boolean).join(', ') || 'Location pending'}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* ═══ SECTION ANCHOR ROW ═══
                Mobile phase 3: this is an in-page jump list, not a tab bar. Every
                section below is always rendered; a tap scrolls its section under
                the sticky header and the URL names the surface for deep links.
                All six labels are visible at every width (no display:none). */}
            <nav
              className="pnm-top-tabs"
              aria-label="Poker Near Me sections"
              data-tutorial="nav"
            >
              {PRIMARY_SECTIONS.map((tab) => {
                const selected = tab.key === activePrimaryTab;
                return (
                  <button
                    key={tab.key}
                    id={`pnm-tab-${tab.key}`}
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    className={
                      'pnm-top-tab' +
                      (tab.live && (liveDataMode === 'live' || liveDataMode === 'mixed') ? ' live' : '') +
                      (selected ? ' active' : '')
                    }
                    onClick={() => activateTab(tab.key)}
                  >
                    {tab.live && (liveDataMode === 'live' || liveDataMode === 'mixed') && (
                      <span className="pnm-live-dot" aria-hidden="true" />
                    )}
                    {tab.label}
                    {tab.key === 'live' && liveTableCount > 0 && ['live', 'mixed', 'estimated'].includes(liveDataMode) && (
                      <span className="pnm-tab-badge">{liveTableCount}</span>
                    )}
                    {tab.key === 'venues' && venues.length > 0 && (
                      <span className="pnm-tab-badge">{venues.length}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* ═══ FAVORITE VENUE LIVE TOAST (5s delay, 2s visible) ═══ */}
            {(() => {
              const favKeys = Object.keys(favorites || {}).filter((k) => k.startsWith('venue-'));
              if (favKeys.length === 0) return null;
              const favIds = new Set(favKeys.map((k) => k.replace('venue-', '')));
              const liveFavs = allVenuesWithTours.filter(
                (v) => favIds.has(String(v.id)) && v.live_data && v.live_data.tables_running > 0
              );
              if (liveFavs.length === 0) return null;
              const estimatedFavorites = liveFavs.filter((venue) => venue.live_data?.data_mode !== 'live');
              const toastMsg =
                liveFavs.length === 1
                  ? `${liveFavs[0].name}: ${cashGameCountLabel(liveFavs[0].live_data)}`
                  : estimatedFavorites.length > 0
                    ? `${liveFavs.length} Favorites Have Cash-Game Activity Estimates`
                    : `${liveFavs.length} Of Your Favorites Have Live Tables Running!`;
              return (
                <FavLiveToast
                  message={toastMsg}
                  onClick={() => {
                    navigateActiveTab('saved');
                  }}
                />
              );
            })()}

            {/* ═══ TOP FILTER BAR: Location + Dropdowns + Live Games ═══
                Always rendered (it drives the venues list, the map and the live
                feed) and it wraps at every width. */}
            <div className="pnm-filter-bar">
              {/* Location pill / GPS button — left of Radius */}
              <div className="pnm-location-area">
                {userLocation && gpsLocationLabel ? (
                  <div className="pnm-location-pill">
                    <div className="pnm-location-dot" />
                    <span className="pnm-location-label">Location Active</span>
                    <span className="pnm-location-city">{gpsLocationLabel}</span>
                    <button
                      className="pnm-location-clear sp-icon-btn"
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setUserLocation(null);
                        setGpsLocationLabel(null);
                        setHasSearched(false);
                        setVenues([]);
                        setNearestDistance(null);
                        // BUG FIX: also drop the persisted GPS keys — clearing only
                        // React state let the mount restore effect snap the same
                        // location back on the next visit.
                        clearPersistedLocation();
                      }}
                      aria-label="Clear location"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={'pnm-gps-btn' + (gpsLoading ? ' loading' : '')}
                    onClick={requestGpsLocation}
                    disabled={gpsLoading}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    </svg>
                    {gpsLoading ? 'Locating...' : 'Enable GPS'}
                  </button>
                )}
              </div>
              {/* A11Y FIX: each filter label is now tied to its select with
                  htmlFor/id (plus an aria-label fallback) — previously they were
                  bare <label> elements and screen readers announced four
                  unlabelled comboboxes. */}
              <div className="pnm-filter-group">
                <label className="pnm-filter-label" htmlFor="pnm-filter-radius">
                  Radius
                </label>
                <select
                  id="pnm-filter-radius"
                  aria-label="Search radius"
                  className="pnm-filter-select"
                  value={normalizeRadiusMiles(filters.radius)}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      radius: normalizeRadiusMiles(e.target.value),
                    }))
                  }
                >
                  <option value={25}>25 Miles</option>
                  <option value={50}>50 Miles</option>
                  <option value={100}>100 Miles</option>
                  {/* BUG FIX: 200 Miles / 500 Miles / "Any Distance" used to be
                      offered here, but /api/poker/venues hard-caps the radius at
                      150mi in both query paths — all three returned exactly the
                      150mi result set while the UI implied the search had widened.
                      150 is the real ceiling, so that is what we offer. */}
                  <option value={150}>150 Miles (Max)</option>
                </select>
              </div>
              <div className="pnm-filter-group">
                <label className="pnm-filter-label" htmlFor="pnm-filter-venue-type">
                  Venue Type
                </label>
                <select
                  id="pnm-filter-venue-type"
                  aria-label="Venue type"
                  className="pnm-filter-select"
                  value={filters.venueType}
                  onChange={(e) => setFilters((f) => ({ ...f, venueType: e.target.value }))}
                >
                  <option value="all">All Locations</option>
                  <option value="casino">Casino</option>
                  <option value="poker_club">Poker Club</option>
                  <option value="charity">Charity</option>
                  <option value="tour_stop">Poker Tour</option>
                </select>
              </div>
              <div className="pnm-filter-group">
                <label className="pnm-filter-label" htmlFor="pnm-filter-game-type">
                  Game Type
                </label>
                <select
                  id="pnm-filter-game-type"
                  aria-label="Game type"
                  className="pnm-filter-select"
                  value={filters.gameType}
                  onChange={(e) => setFilters((f) => ({ ...f, gameType: e.target.value }))}
                >
                  <option value="all">All Games</option>
                  <option value="nlh">No Limit Hold'em</option>
                  <option value="plo">Pot Limit Omaha</option>
                  <option value="mixed">Mixed Games</option>
                </select>
              </div>
              <div className="pnm-filter-group">
                <label className="pnm-filter-label" htmlFor="pnm-filter-stakes">
                  Stakes
                </label>
                <select
                  id="pnm-filter-stakes"
                  aria-label="Stakes"
                  className="pnm-filter-select"
                  value={filters.stakes}
                  onChange={(e) => setFilters((f) => ({ ...f, stakes: e.target.value }))}
                >
                  <option value="all">All Stakes</option>
                  <option value="$1/2">$1/2</option>
                  <option value="$2/5">$2/5</option>
                  <option value="$5/10+">$5/10+</option>
                </select>
              </div>

              {/* Live Games jump: scrolls to the live section (a destination now,
                  not a toggle). aria-current mirrors the anchor row. */}
              <button
                type="button"
                aria-current={showLiveTab ? 'true' : undefined}
                className={
                  'pnm-top-tab live pnm-live-games-inline' + (showLiveTab ? ' active' : '')
                }
                onClick={() => activateTab('live')}
              >
                <span className="pnm-live-dot" />
                Live Games
                {liveTableCount > 0 && ['live', 'mixed', 'estimated'].includes(liveDataMode) && <span className="pnm-tab-badge">{liveTableCount}</span>}
              </button>
            </div>

            {/* ═══ MAIN CONTENT — every section, stacked ═══ */}
            <section className="pnm-layout" aria-label="Poker Near Me discovery results">
              <p className="pnm-route-announcer" role="status" aria-live="polite" aria-atomic="true">
                Showing {routeMeta.breadcrumb}
              </p>
              <div className="pnm-main">
                <div className="pnm-content" ref={contentRef}>
                  {/* Fetch error retry banner — A11Y FIX: this was a clickable <div>,
                      which made the page's primary recovery affordance unreachable by
                      keyboard. aria-live announces the failure without overriding the
                      button role (role="alert" would have replaced it). */}
                  {fetchError && (
                    <button
                      type="button"
                      aria-live="assertive"
                      className="fetch-error-banner"
                      style={{ font: 'inherit', cursor: 'pointer', width: '100%' }}
                      onClick={() => {
                        setFetchError(null);
                        fetchAllData({ includeVenues: true });
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {fetchError}
                    </button>
                  )}

                  {PRIMARY_SECTIONS.map((tab) => (
                    <React.Fragment key={tab.key}>{stackedSections[tab.key]}</React.Fragment>
                  ))}
                </div>
                {/* end pnm-content */}
              </div>
              {/* end pnm-main */}
            </section>
            {/* end pnm-layout */}

            {/* WHAT THIS TAB IS (AEO phase 3, 2026-09-19).
                Every tab of this route served the same 351 words of venue
                lobby chrome to a crawler with no JavaScript, differing only
                in the title, the h1 and one label in the nav. ROUTE_META
                gave each tab a name; nothing gave it a body. This is the
                body, and it renders on the server for the tab the URL asks
                for. */}
            {HUB_PAGE_SUMMARIES[`pnm-${canonicalSlug}`] && (
              <HubPageSummary page={`pnm-${canonicalSlug}`} />
            )}
          </div>
        </PullToRefresh>

        {/* Geofence Alert Banner */}
        {geofenceAlert && (
          <GeofenceAlertBanner
            venue={geofenceAlert}
            onCheckin={() => {
              const gfUrl = geofenceAlert.is_social_page
                ? '/club/' + geofenceAlert.social_page_id
                : '/hub/venues/' + geofenceAlert.id;
              router.push(gfUrl + '?action=checkin');
              setGeofenceAlert(null);
            }}
            onReview={() => {
              const gfUrl = geofenceAlert.is_social_page
                ? '/club/' + geofenceAlert.social_page_id
                : '/hub/venues/' + geofenceAlert.id;
              router.push(gfUrl + '?action=review');
              setGeofenceAlert(null);
            }}
            onDismiss={() => setGeofenceAlert(null)}
          />
        )}

        {/* Voice Search Floating Button (Feature #11) */}
        <VoiceSearch
          onResult={(parsed) => {
            if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
            // BUG FIX: normalize VoiceSearch output to the page's filter domains.
            // VoiceSearch emits 'NLH'/'PLO'/'Mixed'/'Stud' and stakes like '1/2',
            // but the selects/filters use lowercase 'nlh' etc. and '$1/2'/'$2/5'/'$5/10+'
            // — unnormalized values silently matched nothing.
            if (parsed.filters.gameType)
              setFilters((f) => ({
                ...f,
                gameType: String(parsed.filters.gameType).toLowerCase(),
              }));
            if (parsed.filters.radius)
              setFilters((f) => ({ ...f, radius: normalizeRadiusMiles(parsed.filters.radius) }));
            if (parsed.filters.stakes) {
              const stakesMatch = String(parsed.filters.stakes).match(/(\d+)\s*\/\s*(\d+)/);
              if (stakesMatch) {
                const smallBlind = Number(stakesMatch[1]);
                const normStakes = smallBlind <= 1 ? '$1/2' : smallBlind < 5 ? '$2/5' : '$5/10+';
                setFilters((f) => ({ ...f, stakes: normStakes }));
              }
            }
            // BUG FIX: VoiceSearch emits venueType 'poker_tour' for any transcript
            // containing "tour", and this used to apply it verbatim. Nothing
            // downstream understands 'poker_tour' — the Venue Type select offers
            // 'tour_stop', useTourMapStops only special-cases 'tour_stop', and
            // /api/poker/venues matches no venue_type row — so one voice query left
            // the user on a permanently blank map AND blank list, persisted to the
            // URL and to localStorage. Fold it onto the real domain first.
            if (parsed.filters.venueType) {
              const normalizedVenueType = normalizeVenueType(parsed.filters.venueType);
              if (normalizedVenueType) {
                setFilters((f) => ({ ...f, venueType: normalizedVenueType }));
              }
            }
            // WIRING FIX: VoiceSearch sets useMyLocation for "poker near me" /
            // "casinos around me" — the single most natural phrase for this product
            // — and the page ignored it entirely, so the flagship voice query never
            // triggered GPS. This IS an explicit user request for their location.
            if (parsed.filters.useMyLocation && !userLocation) {
              requestGpsLocation();
            }
            if (parsed.filters.minBuyin)
              setFilters((f) => ({ ...f, minBuyin: parsed.filters.minBuyin }));
            if (parsed.filters.maxBuyin)
              setFilters((f) => ({ ...f, maxBuyin: parsed.filters.maxBuyin }));
            // BUG FIX: VoiceSearch emits filters.tab = 'daily' for any
            // tournament/tourney/mtt transcript, and this used to set activeTab
            // straight to it. 'daily' is not in TAB_ORDER, so the bad value was
            // persisted and survived reload. Voice tab hints now go through the
            // same slug table the router uses, and anything unrecognised is
            // ignored. Every surface is on the page, so a hint scrolls to it.
            if (parsed.filters.tab) {
              const VOICE_TAB_SLUGS = {
                venues: { tab: 'venues' },
                map: { tab: 'map' },
                saved: { tab: 'saved' },
                favorites: { tab: 'saved' },
                more: { tab: 'more' },
                events: { tab: 'events' },
                tours: { tab: 'events', sub: 'tours' },
                series: { tab: 'events', sub: 'series' },
                daily: { tab: 'events', sub: 'daily' },
                'daily-tournaments': { tab: 'events', sub: 'daily' },
                calendar: { tab: 'events', sub: 'calendar' },
                'events-calendar': { tab: 'events', sub: 'calendar' },
              };
              const target = VOICE_TAB_SLUGS[String(parsed.filters.tab).toLowerCase()];
              if (target && TAB_ORDER.includes(target.tab)) {
                if (target.sub) navigateActiveEventTab(target.sub);
                else navigateActiveTab(target.tab);
              } else if (
                String(parsed.filters.tab).toLowerCase() === 'live' ||
                String(parsed.filters.tab).toLowerCase() === 'live-games'
              ) {
                activateTab('live');
              }
            }
            setHasSearched(true);
            fetchAllData({ includeVenues: true });
          }}
        />

        {/* Full Screen Venue Detail overlay */}
        <FullScreenPageOverlay
          isOpen={iframeModal.isOpen}
          onClose={closeIframeModal}
          url={iframeModal.url}
          title={iframeModal.title}
        />

        {/* Venue Reviews Panel (Feature #9)
            BUG FIX: authToken used to be `user?.access_token`. `user` comes from
            AvatarContext and is a Supabase User object — the JWT lives on the
            SESSION, not the user, so that expression is always undefined.
            VenueReviews sends the Authorization header unconditionally on POST, so
            the server received the literal "Bearer undefined" and returned 401
            ("Could not submit review (401)"); the PATCH vote path omitted the
            header entirely and the optimistic vote was silently rolled back. The
            token now comes from getFreshAccessToken (see sessionToken above), the
            same workaround MoreTabPanel documents. */}
        <VenueReviews
          venueId={reviewVenue?.id}
          venueName={reviewVenue?.name}
          userId={userId}
          userName={user?.display_name || user?.email}
          authToken={user?.access_token || sessionToken || undefined}
          isOpen={!!reviewVenue}
          onClose={closeReviewPanel}
        />

        {/* CSS moved to styles/poker-near-me.css */}

        {UpgradePopup}

        {/* ═══ SMART LOCATION ENABLE MODAL ═══ */}
        <LocationEnableModal
          isOpen={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          onRetry={() => {
            setShowLocationModal(false);
            requestGpsLocation();
          }}
          onManualEntry={() => {
            // Focus the search input for manual city entry
            setTimeout(() => {
              const searchEl = document.querySelector('.sidebar-search-input');
              if (searchEl) {
                searchEl.focus();
                searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 200);
          }}
        />
      </HubPageShell>
    </>
  );
}

export async function getServerSideProps({ res, params, query }) {
  const requestedSlug = String(params?.pnmTab || '');
  const canonicalSlug = normalizeRouteSlug(requestedSlug) || 'venues';
  if (requestedSlug !== canonicalSlug) {
    const search = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (key === 'pnmTab') return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => {
        if (entry !== undefined && entry !== null) search.append(key, String(entry));
      });
    });
    const suffix = search.toString();
    return {
      redirect: {
        destination: `/hub/poker-near-me/${canonicalSlug}${suffix ? `?${suffix}` : ''}`,
        permanent: true,
      },
    };
  }
  try {
    const directory = await fetchVenueDirectoryResilient({
      supabase: createClient(),
      params: { limit: 24, offset: 0 },
      fallbackVenues: directorySnapshotData.venues || [],
      fallbackMetadata: directorySnapshotData.metadata || {},
      onFallback: (error) => {
        console.warn('[poker-near-me] SSR database directory unavailable; using snapshot:', error?.message || error);
      },
    });
    res.setHeader('Cache-Control', directory.degraded
      ? 'no-store'
      : 'public, s-maxage=120, stale-while-revalidate=900');
    return { props: { initialDirectory: directory } };
  } catch (error) {
    console.warn('[poker-near-me] SSR directory unavailable:', error?.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return { props: { initialDirectory: null } };
  }
}
