/**
 * HORSES ADMIN — /horses
 *
 * Platform staff console: content stable, grinder fleet, pipeline, economy,
 * anti-abuse, Club Arena oversight, bug reports, Geeves KB, review moderation
 * and scraper health.
 *
 * ─── 2026-08-26 DEEP AUDIT — what changed and why ───────────────────────────
 *
 * 1. NO MORE DEMO DATA. The old file shipped 8 hardcoded DEMO_PERSONAS and fell
 *    back to them whenever a query failed OR returned zero rows. On an admin
 *    console that is worse than an error: it renders confident fiction. A
 *    failure now says so.
 *
 * 2. NO MORE FAKE SUCCESS. Every mutation used to apply an optimistic update,
 *    console.warn the real Supabase error, and still toast "saved". Persona
 *    create even fabricated a local row and said "Horse created (fallback)".
 *    Mutations now revert the optimistic update and surface the failure.
 *
 * 3. CLUB ARENA DATA MOVED SERVER-SIDE. Those queries ran in the browser with
 *    the operator's JWT against tables whose RLS has no admin bypass — verified
 *    in production: 0 of 1501 club_members, 0 of 113 agents, 0 of 200,978
 *    chip_transactions readable. They also used four column names that do not
 *    exist (cashout_requests.user_id, chip_transactions.user_id,
 *    tables.max_seats, club_members.id). Everything now goes through
 *    /api/horses/club-arena-admin, which is service-role behind an admin gate.
 *
 * 4. THE DEAD HALF OF THE CLUB ARENA TAB IS NOW WIRED. caStats, caFinance,
 *    caUnions, caPendingCashouts, searchCaUsers, loadCaUserDetail,
 *    toggleClubStatus and forceCashoutApprove were all implemented and NONE of
 *    them were reachable from the UI. They have sections now.
 *
 * 5. SETTINGS NO LONGER WRITE PER KEYSTROKE. Every input called updateSetting
 *    on change, so dragging the temperature slider fired one upsert per pixel
 *    and clearing a number field wrote NaN. Writes are debounced and validated.
 *
 * 6. NO EMOJI. House rule 7 — bare emoji break the SWC compiler.
 *
 * 7. NO RAW HEX. Colours come from ./adminTokens, which points at the CSS
 *    custom properties in horses.module.css. smarter.poker schema only.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { eventBus, EventType } from '../../src/engine/EventBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import PokerBrainLaunchButton from '../../src/components/poker-brain/LaunchButton';
import styles from './horses.module.css';
import { T, num, signed, when } from '../../src/lib/horsesAdminTokens';

const SYNC_CHANNEL = 'horses-admin-sync';
const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

/** 593 horses in the stable. Rendering every card at once was the heaviest
 *  thing this page did; the roster is paginated now. */
const HORSES_PER_PAGE = 48;

const SPECIALTIES = [
  ['cash_games', 'Cash Games'],
  ['tournaments', 'Tournaments'],
  ['high_stakes', 'High Stakes'],
  ['plo', 'PLO'],
  ['online', 'Online'],
  ['gto', 'GTO'],
  ['live_reads', 'Live Reads'],
];

const VOICES = [
  'casual', 'analytical', 'enthusiastic', 'experienced',
  'technical', 'street_smart', 'passionate', 'academic',
];

const EMPTY_PERSONA = {
  name: '', gender: 'male', location: '', specialty: 'cash_games',
  stakes: '', bio: '', voice: 'casual',
};

const EMPTY_ABUSE_DATA = {
  abuse: { log: [], stats: { totalSignups: 0, blocked: 0, disposable: 0 }, topIPs: [] },
  audit: [], alerts: [],
  economy: { sourceBreakdown: {}, totalGranted: 0, totalSpent: 0, topHolders: [] },
};

/** Nav is data-driven so a tab cannot be added to the bar and forgotten in the
 *  body (or vice versa) — which is how /horses/hg-moderation ended up an
 *  orphan page with no link to it from anywhere. */
const TABS = [
  { id: 'stable', label: 'Social Horses' },
  { id: 'grinder', label: 'Grinder Horses' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'settings', label: 'Settings' },
  { id: 'stats', label: 'Statistics' },
  { id: 'promo', label: 'Promo Codes' },
  { id: 'economy', label: 'Economy' },
  { id: 'antiabuse', label: 'Anti-Abuse' },
  { id: 'clubarena', label: 'Club Arena' },
  { id: 'bugreports', label: 'Bug Reports' },
  { id: 'geeves', label: 'Geeves KB' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'scrapers', label: 'Scrapers' },
];

/** Pages that live outside this SPA but belong to the same console.
 *  /horses/hg-moderation and /horses/hand-reviews had NO link from anywhere —
 *  you could only reach them by typing the URL. */
const EXTERNAL_LINKS = [
  { href: '/horses/sql-console', label: 'SQL Console' },
  { href: '/horses/hg-moderation', label: 'HG Moderation' },
  { href: '/horses/hand-reviews', label: 'Hand Reviews' },
];

const CA_SECTIONS = [
  ['overview', 'Overview'],
  ['clubs', 'Clubs'],
  ['finance', 'Finance'],
  ['users', 'Users'],
  ['unions', 'Unions'],
  ['approvals', 'Approvals'],
];

/** Read a JSON body without exploding on an HTML error page. */
async function readJson(res) {
  try { return await res.json(); } catch { return {}; }
}

export default function HorsesAdmin() {
  const router = useRouter();

  // ── Session ──
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState('stable');
  const [notification, setNotification] = useState(null);

  // ── Stable ──
  const [personas, setPersonas] = useState([]);
  const [personasError, setPersonasError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [personaForm, setPersonaForm] = useState(EMPTY_PERSONA);
  const [savingPersona, setSavingPersona] = useState(false);

  // ── Settings ──
  const [settings, setSettings] = useState({
    posts_per_day: 20, min_delay_minutes: 30, max_delay_minutes: 120,
    ai_model: 'gpt-4o', temperature: 0.8, engine_enabled: true, auto_publish: true,
    peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ── Pipeline ──
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [pipelineBusy, setPipelineBusy] = useState(false);

  // ── Analytics ──
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  // ── Geeves ──
  const [geevesAnalytics, setGeevesAnalytics] = useState({ summary: null, questions: [] });
  const [geevesLoaded, setGeevesLoaded] = useState(false);
  const [geevesLoading, setGeevesLoading] = useState(false);
  const [geevesError, setGeevesError] = useState(null);
  const [geevesMarkingId, setGeevesMarkingId] = useState(null);

  // ── Promo ──
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [promoCreating, setPromoCreating] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: '', description: '', type: 'signup_bonus', value: 100, maxUses: '', expiresAt: '',
  });

  // ── Economy ──
  const [economyData, setEconomyData] = useState(null);
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economyLoaded, setEconomyLoaded] = useState(false);
  const [economyError, setEconomyError] = useState(null);

  // ── Anti-abuse ──
  const [abuseData, setAbuseData] = useState(null);
  const [abuseLoading, setAbuseLoading] = useState(false);
  const [abuseLoaded, setAbuseLoaded] = useState(false);
  const [abuseError, setAbuseError] = useState(null);

  // ── Reviews ──
  const [reviewsData, setReviewsData] = useState([]);
  const [reviewsStats, setReviewsStats] = useState({ total: null, flagged: null, avg_rating: null });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [reviewsFilter, setReviewsFilter] = useState('newest');
  const [reviewsRatingFilter, setReviewsRatingFilter] = useState('all');
  const [reviewsFlaggedOnly, setReviewsFlaggedOnly] = useState(false);
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [reviewsDeleteConfirm, setReviewsDeleteConfirm] = useState(null);
  const [reviewsProcessing, setReviewsProcessing] = useState(false);

  // ── Grinder ──
  const [grinderData, setGrinderData] = useState(null);
  const [grinderLoading, setGrinderLoading] = useState(false);
  const [grinderError, setGrinderError] = useState(null);

  // ── Bug reports ──
  const [bugReports, setBugReports] = useState([]);
  const [bugReportsLoading, setBugReportsLoading] = useState(false);
  const [bugReportsError, setBugReportsError] = useState(null);
  const [bugReportsFilter, setBugReportsFilter] = useState('open');

  // ── Scrapers ──
  const [scraperHealth, setScraperHealth] = useState(null);
  const [scraperHealthLoading, setScraperHealthLoading] = useState(false);
  const [scraperHealthError, setScraperHealthError] = useState(null);
  const [scraperHealthLastFetch, setScraperHealthLastFetch] = useState(null);

  // ── Club Arena ──
  const [caSection, setCaSection] = useState('overview');
  const [caLoaded, setCaLoaded] = useState(false);
  const [caLoading, setCaLoading] = useState(false);
  const [caError, setCaError] = useState(null);
  const [caWarnings, setCaWarnings] = useState(null);
  const [caStats, setCaStats] = useState(null);
  const [caClubs, setCaClubs] = useState([]);
  const [caUnions, setCaUnions] = useState([]);
  const [caFinance, setCaFinance] = useState(null);
  const [caPendingCashouts, setCaPendingCashouts] = useState([]);
  const [caSelectedClub, setCaSelectedClub] = useState(null);
  const [caClubDetail, setCaClubDetail] = useState(null);
  const [caClubTab, setCaClubTab] = useState('overview');
  const [caUserSearch, setCaUserSearch] = useState('');
  const [caUserResults, setCaUserResults] = useState([]);
  const [caUserSearching, setCaUserSearching] = useState(false);
  const [caSelectedUser, setCaSelectedUser] = useState(null);
  const [caProcessing, setCaProcessing] = useState(false);
  const [caApplications, setCaApplications] = useState([]);
  const [caAppLoading, setCaAppLoading] = useState(false);
  const [caAppTab, setCaAppTab] = useState('pending');
  const [caAppCommission, setCaAppCommission] = useState({});
  const [caAppReason, setCaAppReason] = useState('');
  const [caLeaveRequests, setCaLeaveRequests] = useState([]);
  const [caLeaveLoading, setCaLeaveLoading] = useState(false);
  const [caLeaveTab, setCaLeaveTab] = useState('pending');

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // The old showNotification never cleared its timeout, so two toasts in quick
  // succession cancelled each other and the timer kept running after unmount.
  // ═══════════════════════════════════════════════════════════════════════════
  const notifyTimer = useRef(null);
  const showNotification = useCallback((message, type = 'success') => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    setNotification({ message, type });
    notifyTimer.current = setTimeout(() => setNotification(null), 4000);
  }, []);
  useEffect(() => () => { if (notifyTimer.current) clearTimeout(notifyTimer.current); }, []);

  /** Authorized fetch. Returns the parsed body and throws a usable message on
   *  any non-2xx — the old code called res.json() blind and threw a parse
   *  error on every HTML error page. */
  const authFetch = useCallback(async (url, options = {}) => {
    // getFreshAccessToken reads the token out of storage and only hits the
    // network when it is close to expiry. The argument-less
    // client session read is banned repo-wide (pre-commit CHECK C):
    // it makes a round trip on every call and hangs when GoTrue is slow, which
    // on this page meant every tab silently stopped loading.
    const token = await getFreshAccessToken();
    if (!token) throw new Error('Session expired. Please sign in again.');
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const body = await readJson(res);
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    if (body.success === false) throw new Error(body.error || 'Request failed');
    return body;
  }, []);

  const broadcastUpdate = useCallback((eventType = 'horses-updated') => {
    window.dispatchEvent(new CustomEvent(eventType));
    broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now() });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  const checkAuth = useCallback(async () => {
    try {
      const authUser = getAuthUser();
      if (!authUser?.id) { setLoading(false); return; }

      const { data: profile, error } = await supabase
        .from('profiles').select('role').eq('id', authUser.id).maybeSingle();

      if (error) {
        setLoginError('Could not verify admin status. Check your connection and try again.');
        setLoading(false);
        return;
      }
      if (!profile || !ADMIN_ROLES.includes(profile.role)) {
        setLoginError('Access denied. Administrator privileges required.');
        setLoading(false);
        return;
      }
      setUser(authUser);
      setRole(profile.role);
    } catch {
      setLoginError('Could not reach the authentication service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email, password: loginForm.password,
      });
      if (error) { setLoginError(error.message); return; }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('role').eq('id', data.user.id).maybeSingle();

      if (profileErr) { setLoginError('Could not verify admin status.'); return; }
      if (!profile || !ADMIN_ROLES.includes(profile.role)) {
        // Do not leave a non-admin holding an authenticated session on a staff page.
        await supabase.auth.signOut();
        setLoginError('Access denied. Administrator privileges required.');
        return;
      }
      setUser(data.user);
      setRole(profile.role);
    } catch {
      setLoginError('Connection failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Clear every cached surface — signing out used to leave the previous
    // admin's clubs, members and transactions in memory for the next sign-in.
    setUser(null); setRole(null);
    setPersonas([]); setPipelineRuns([]); setPromoCodes([]);
    setEconomyData(null); setEconomyLoaded(false);
    setAbuseData(null); setAbuseLoaded(false);
    setAnalyticsData(null); setAnalyticsLoaded(false);
    setGeevesAnalytics({ summary: null, questions: [] }); setGeevesLoaded(false);
    setReviewsData([]); setReviewsLoaded(false);
    setGrinderData(null); setBugReports([]); setScraperHealth(null);
    setCaLoaded(false); setCaStats(null); setCaClubs([]); setCaUnions([]);
    setCaFinance(null); setCaPendingCashouts([]); setCaSelectedClub(null);
    setCaClubDetail(null); setCaSelectedUser(null); setCaUserResults([]);
    setActiveTab('stable');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE DATA
  // ═══════════════════════════════════════════════════════════════════════════
  const loadData = useCallback(async () => {
    // Every one of these used to be destructured as `{ data }` only, so a failed
    // query was indistinguishable from an empty table and silently fell through
    // to hardcoded demo personas.
    const [authorsRes, settingsRes, runsRes] = await Promise.all([
      supabase.from('content_authors').select('*').order('name'),
      supabase.from('content_settings').select('*').limit(1).maybeSingle(),
      supabase.from('pipeline_runs').select('*').order('started_at', { ascending: false }).limit(10),
    ]);

    if (authorsRes.error) {
      setPersonasError(authorsRes.error.message);
      setPersonas([]);
    } else {
      setPersonasError(null);
      setPersonas(authorsRes.data || []);
    }
    if (settingsRes.data) setSettings((prev) => ({ ...prev, ...settingsRes.data }));
    setPipelineRuns(runsRes.data || []);
  }, []);

  const loadPromoCodes = useCallback(async () => {
    setPromoLoading(true);
    setPromoError(null);
    try {
      const data = await authFetch('/api/promo/admin-promo-codes');
      setPromoCodes(data.codes || []);
    } catch (err) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  }, [authFetch]);

  const loadEconomyData = useCallback(async () => {
    setEconomyLoading(true);
    setEconomyError(null);
    try {
      const data = await authFetch('/api/horses/economy-stats');
      setEconomyData(data);
      setEconomyLoaded(true);
    } catch (err) {
      setEconomyError(err.message);
    } finally {
      setEconomyLoading(false);
    }
  }, [authFetch]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsError(null);
    try {
      const json = await authFetch('/api/horses/analytics?type=summary');
      setAnalyticsData(json.data || null);
    } catch (err) {
      setAnalyticsError(err.message);
    } finally {
      setAnalyticsLoaded(true);
    }
  }, [authFetch]);

  const loadAntiAbuseData = useCallback(async () => {
    setAbuseLoading(true);
    setAbuseError(null);
    try {
      const data = await authFetch('/api/horses/anti-abuse?section=all');
      setAbuseData(data);
      setAbuseLoaded(true);
    } catch (err) {
      setAbuseError(err.message);
      setAbuseData(EMPTY_ABUSE_DATA);
    } finally {
      setAbuseLoading(false);
    }
  }, [authFetch]);

  const loadGrinderData = useCallback(async () => {
    setGrinderLoading(true);
    setGrinderError(null);
    try {
      const data = await authFetch('/api/horses/grinder-stats');
      setGrinderData(data.stats || null);
    } catch (err) {
      setGrinderError(err.message);
    } finally {
      setGrinderLoading(false);
    }
  }, [authFetch]);

  const loadBugReports = useCallback(async (statusFilter) => {
    setBugReportsLoading(true);
    setBugReportsError(null);
    try {
      let query = supabase
        .from('live_help_tickets')
        .select('id, subject, description, priority, status, created_at, user_id, conversation_id, profiles:user_id (display_name, username, avatar_url)')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setBugReports(data || []);
    } catch (err) {
      setBugReportsError(err.message || 'Failed to load tickets');
      setBugReports([]);
    } finally {
      setBugReportsLoading(false);
    }
  }, []);

  const loadGeevesAnalytics = useCallback(async () => {
    setGeevesLoading(true);
    setGeevesError(null);
    try {
      // The old version put `.catch(() => ({ ok: false }))` on each fetch and
      // then called .json() on the result — on a network failure that plain
      // object has no .json and threw a TypeError instead of showing an error.
      const [summary, missed] = await Promise.all([
        authFetch('/api/geeves/analytics?action=summary'),
        authFetch('/api/geeves/analytics?action=top_missed').catch(() => ({ questions: [] })),
      ]);
      setGeevesAnalytics({
        summary: summary.summary || null,
        questions: missed.questions || [],
      });
      setGeevesLoaded(true);
    } catch (err) {
      setGeevesError(err.message);
    } finally {
      setGeevesLoading(false);
    }
  }, [authFetch]);

  const loadAdminReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const params = new URLSearchParams({
        sort: reviewsFilter,
        limit: '200',
        ...(reviewsRatingFilter !== 'all' ? { rating: reviewsRatingFilter } : {}),
        ...(reviewsFlaggedOnly ? { flagged: 'true' } : {}),
      });
      const data = await authFetch(`/api/horses/admin-reviews?${params}`);
      setReviewsData(data.reviews || []);
      setReviewsStats(data.stats || { total: null, flagged: null, avg_rating: null });
      setReviewsLoaded(true);
    } catch (err) {
      setReviewsError(err.message);
    } finally {
      setReviewsLoading(false);
    }
  }, [authFetch, reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly]);

  const loadScraperHealth = useCallback(async () => {
    setScraperHealthLoading(true);
    setScraperHealthError(null);
    try {
      const data = await authFetch('/api/admin/scraper-health');
      setScraperHealth(data);
      setScraperHealthLastFetch(new Date());
    } catch (err) {
      setScraperHealthError(err.message);
    } finally {
      setScraperHealthLoading(false);
    }
  }, [authFetch]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLUB ARENA — all of this now goes through the service-role admin route.
  // ═══════════════════════════════════════════════════════════════════════════
  const loadClubArenaData = useCallback(async () => {
    setCaLoading(true);
    setCaError(null);
    setCaWarnings(null);
    try {
      const d = await authFetch('/api/horses/club-arena-admin?section=overview');
      setCaStats(d.stats || null);
      setCaClubs(d.clubs || []);
      setCaUnions(d.unions || []);
      setCaPendingCashouts(d.pendingCashouts || []);
      setCaFinance(d.finance || null);
      setCaWarnings(d.failedSources || null);
      setCaLoaded(true);
    } catch (err) {
      setCaError(err.message);
    } finally {
      setCaLoading(false);
    }
  }, [authFetch]);

  const loadCaClubDetail = useCallback(async (club) => {
    setCaSelectedClub(club);
    setCaClubTab('overview');
    setCaClubDetail(null);
    setCaLoading(true);
    try {
      const d = await authFetch(`/api/horses/club-arena-admin?section=club&clubId=${encodeURIComponent(club.id)}`);
      setCaClubDetail(d);
      if (d.failedSources) setCaWarnings(d.failedSources);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaLoading(false);
    }
  }, [authFetch, showNotification]);

  const searchCaUsers = useCallback(async (query) => {
    const q = (query || '').trim();
    if (q.length < 2) { setCaUserResults([]); return; }
    setCaUserSearching(true);
    try {
      // The query is sanitized server-side. It used to be interpolated straight
      // into a PostgREST .or() filter string in the browser, where a comma or a
      // parenthesis rewrote the whole filter tree.
      const d = await authFetch(`/api/horses/club-arena-admin?section=user_search&q=${encodeURIComponent(q)}`);
      setCaUserResults(d.results || []);
    } catch (err) {
      showNotification(err.message, 'error');
      setCaUserResults([]);
    } finally {
      setCaUserSearching(false);
    }
  }, [authFetch, showNotification]);

  const loadCaUserDetail = useCallback(async (profile) => {
    setCaSelectedUser({ ...profile, loading: true });
    try {
      const d = await authFetch(`/api/horses/club-arena-admin?section=user&userId=${encodeURIComponent(profile.id)}`);
      setCaSelectedUser({ ...profile, ...d, loading: false });
    } catch (err) {
      showNotification(err.message, 'error');
      setCaSelectedUser((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }, [authFetch, showNotification]);

  const toggleClubStatus = useCallback(async (club, newStatus) => {
    setCaProcessing(true);
    const previous = club.status;
    setCaClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, status: newStatus } : c)));
    try {
      await authFetch('/api/horses/club-arena-admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_club_status', clubId: club.id, status: newStatus }),
      });
      if (caSelectedClub?.id === club.id) setCaSelectedClub((p) => ({ ...p, status: newStatus }));
      showNotification(newStatus === 'suspended' ? 'Club Suspended' : 'Club Reactivated');
    } catch (err) {
      // Revert. The old code logged the failure and still said it worked.
      setCaClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, status: previous } : c)));
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, showNotification]);

  const forceCashoutApprove = useCallback(async (cashout) => {
    if (!window.confirm(`Force approve a cashout of ${num(cashout.amount)} chips? This moves real chips.`)) return;
    setCaProcessing(true);
    try {
      await authFetch('/api/club-arena/approve-cashout', {
        method: 'POST',
        body: JSON.stringify({ cashoutId: cashout.id, clubId: cashout.club_id, action: 'approve' }),
      });
      setCaPendingCashouts((prev) => prev.filter((c) => c.id !== cashout.id));
      setCaClubDetail((prev) => (prev
        ? { ...prev, pendingCashouts: (prev.pendingCashouts || []).filter((c) => c.id !== cashout.id) }
        : prev));
      showNotification('Cashout Approved');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, showNotification]);

  const loadApplications = useCallback(async (statusFilter = 'pending') => {
    setCaAppLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list', statusFilter }),
      });
      setCaApplications(d.applications || []);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaAppLoading(false);
    }
  }, [authFetch, showNotification]);

  const loadLeaveRequests = useCallback(async (statusFilter = 'pending') => {
    setCaLeaveLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list_leave_requests', statusFilter }),
      });
      setCaLeaveRequests(d.leaveRequests || []);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaLeaveLoading(false);
    }
  }, [authFetch, showNotification]);

  const reviewApplication = useCallback(async (app, decision) => {
    setCaProcessing(true);
    try {
      const rate = parseFloat(caAppCommission[app.id] ?? 90);
      const body = decision === 'approve'
        ? { action: 'approve', applicationId: app.id, commissionRate: Number.isFinite(rate) ? rate / 100 : 0.9 }
        : { action: 'reject', applicationId: app.id, reason: caAppReason };
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      showNotification(d.message || (decision === 'approve' ? 'Application Approved' : 'Application Rejected'));
      setCaAppReason('');
      loadApplications(caAppTab);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caAppCommission, caAppReason, caAppTab, loadApplications, showNotification]);

  const reviewLeaveRequest = useCallback(async (req, decision) => {
    if (decision === 'approve'
      && !window.confirm(`Remove ${req.club_name} from ${req.unions?.name || 'the union'}? This cannot be undone.`)) return;
    setCaProcessing(true);
    try {
      // The deny button used to send { action: 'reject', applicationId } with a
      // union_leave_requests id, which the route looked up in union_applications
      // and always 404'd. There is a reject_leave action now.
      const body = decision === 'approve'
        ? { action: 'approve_leave', leaveRequestId: req.id }
        : { action: 'reject_leave', leaveRequestId: req.id };
      await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      showNotification(decision === 'approve' ? 'Club Removed From Union' : 'Leave Request Denied');
      loadLeaveRequests(caLeaveTab);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caLeaveTab, loadLeaveRequests, showNotification]);

  const reviewFlag = useCallback(async (flag, verdict) => {
    setCaProcessing(true);
    try {
      const body = verdict === 'kick'
        ? { action: 'kick_player', clubId: caSelectedClub.id, playerId: flag.user_id, targetUserId: flag.user_id, reason: flag.flag_type }
        : { action: 'review_flag', clubId: caSelectedClub.id, flagId: flag.id, newStatus: verdict === 'dismiss' ? 'dismissed' : 'reviewed', verdict };
      await authFetch('/api/club-arena/anti-cheat', { method: 'POST', body: JSON.stringify(body) });
      showNotification(verdict === 'kick' ? 'Player Kicked' : `Flag Marked ${verdict === 'dismiss' ? 'Dismissed' : 'Reviewed'}`);
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, loadCaClubDetail, showNotification]);

  const kickSession = useCallback(async (session) => {
    setCaProcessing(true);
    try {
      await authFetch('/api/club-arena/anti-cheat', {
        method: 'POST',
        body: JSON.stringify({
          action: 'kick_player', clubId: caSelectedClub.id,
          playerId: session.user_id, targetUserId: session.user_id, reason: 'admin_kick',
        }),
      });
      showNotification('Player Kicked');
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, loadCaClubDetail, showNotification]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MUTATIONS — every one of these reverts its optimistic update on failure.
  // ═══════════════════════════════════════════════════════════════════════════
  const togglePersona = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: newStatus } : p)));
    const { error } = await supabase.from('content_authors').update({ is_active: newStatus }).eq('id', id);
    if (error) {
      setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: currentStatus } : p)));
      showNotification(`Could Not Save: ${error.message}`, 'error');
      return;
    }
    showNotification(`Horse ${newStatus ? 'Activated' : 'Rested'}`);
    broadcastUpdate('horses-updated');
  };

  const toggleAllPersonas = async (activate) => {
    const snapshot = personas;
    setPersonas((prev) => prev.map((p) => ({ ...p, is_active: activate })));
    // `.neq('id', 0)` was a no-op-shaped way of saying "all rows"; keep the
    // intent explicit but guard against a bare unfiltered update.
    const ids = snapshot.map((p) => p.id).filter((id) => id !== undefined && id !== null);
    if (ids.length === 0) return;
    const { error } = await supabase.from('content_authors').update({ is_active: activate }).in('id', ids);
    if (error) {
      setPersonas(snapshot);
      showNotification(`Bulk Update Failed: ${error.message}`, 'error');
      return;
    }
    showNotification(`All Horses ${activate ? 'Activated' : 'Rested'}`);
    broadcastUpdate('horses-updated');
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Retire ${name}? This deletes the horse permanently.`)) return;
    const snapshot = personas;
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from('content_authors').delete().eq('id', id);
    if (error) {
      setPersonas(snapshot);
      showNotification(`Could Not Retire ${name}: ${error.message}`, 'error');
      return;
    }
    showNotification(`${name} Retired`, 'info');
    broadcastUpdate('horses-updated');
  };

  const openCreateModal = () => { setEditingPersona(null); setPersonaForm(EMPTY_PERSONA); setShowCreateModal(true); };
  const openEditModal = (persona) => {
    setEditingPersona(persona);
    setPersonaForm({
      name: persona.name || '', gender: persona.gender || 'male',
      location: persona.location || '', specialty: persona.specialty || 'cash_games',
      stakes: persona.stakes || '', bio: persona.bio || '', voice: persona.voice || 'casual',
    });
    setShowCreateModal(true);
  };

  const handleSavePersona = async (e) => {
    e.preventDefault();
    setSavingPersona(true);
    try {
      if (editingPersona) {
        // There was no way to edit a horse at all. 593 of them, create and
        // delete only.
        const { data, error } = await supabase
          .from('content_authors').update(personaForm).eq('id', editingPersona.id)
          .select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('The horse could not be found. It may have been retired in another tab.');
        setPersonas((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        showNotification(`${data.name} Updated`);
      } else {
        const alias = personaForm.name.replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 1000);
        const { data, error } = await supabase
          .from('content_authors')
          .insert([{ ...personaForm, alias, avatar_seed: alias.toLowerCase(), timezone: 'America/New_York', is_active: true }])
          .select().maybeSingle();
        if (error) throw error;
        // The old catch fabricated a local row and toasted "Horse created
        // (fallback)" — the horse did not exist and the next refresh lost it.
        if (!data) throw new Error('The horse was not created. Nothing was saved.');
        setPersonas((prev) => [data, ...prev]);
        showNotification(`${data.name} Stabled`);
      }
      setShowCreateModal(false);
      setEditingPersona(null);
      setPersonaForm(EMPTY_PERSONA);
      broadcastUpdate('horses-updated');
    } catch (err) {
      showNotification(err.message || 'Could Not Save Horse', 'error');
    } finally {
      setSavingPersona(false);
    }
  };

  // ── Settings ──
  // Writes are debounced. Previously every keystroke and every tick of the
  // temperature slider fired its own content_settings upsert, and clearing a
  // number input wrote NaN straight to the row.
  const settingsTimer = useRef(null);
  const pendingSettings = useRef(null);

  const flushSettings = useCallback(async () => {
    const payload = pendingSettings.current;
    if (!payload) return;
    pendingSettings.current = null;
    setSettingsSaving(true);
    try {
      const upsert = { ...payload, updated_at: new Date().toISOString() };
      if (!upsert.id) {
        const { data } = await supabase.from('content_settings').select('id').limit(1).maybeSingle();
        if (data?.id) upsert.id = data.id;
      }
      const { error } = await supabase.from('content_settings').upsert(upsert);
      if (error) throw error;
      broadcastUpdate('horses-settings-updated');
    } catch (err) {
      showNotification(`Setting Not Saved: ${err.message}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  }, [broadcastUpdate, showNotification]);

  const updateSetting = useCallback((key, value) => {
    // Reject NaN before it reaches state, let alone the database.
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      pendingSettings.current = next;
      return next;
    });
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(flushSettings, 700);
  }, [flushSettings]);

  useEffect(() => () => {
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
  }, []);

  const triggerPipeline = async (type) => {
    setPipelineBusy(true);
    try {
      showNotification(`Starting Pipeline: ${type}`, 'info');
      const data = await authFetch('/api/horses/trigger-pipeline', {
        method: 'POST', body: JSON.stringify({ type }),
      });
      showNotification(data.message || `Pipeline ${type} Completed`);
      broadcastUpdate('horses-updated');
      loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setPipelineBusy(false);
    }
  };

  const handleFleetLaunch = async (fleetAction) => {
    if (fleetAction === 'launch_all'
      && !window.confirm('Deploy the full fleet? This creates every cash table, tournament, SNG and Spin, and seats hundreds of horses.')) return;
    if (fleetAction === 'shutdown'
      && !window.confirm('Shut down the entire fleet? Every horse will be removed from every table.')) return;
    setGrinderLoading(true);
    try {
      const data = await authFetch('/api/club-arena/horse-launch', {
        method: 'POST', body: JSON.stringify({ action: fleetAction }),
      });
      if (fleetAction === 'launch_all') {
        showNotification(
          `Fleet Deployed. ${num(data.cashTables, 0)} Tables, ${num(data.tournaments, 0)} Tournaments, `
          + `${num(data.sngs, 0)} SNGs, ${num(data.spins, 0)} Spins, ${num(data.cashSeats, 0)} Seats Filled`
          + (data.warnings ? ` (${data.warnings} Warnings)` : ''),
        );
      } else {
        showNotification(`Fleet Shutdown Complete. ${num(data.horsesRemoved, 0)} Horses Removed.`);
      }
      broadcastUpdate('horses-grinder-updated');
      loadGrinderData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setGrinderLoading(false);
    }
  };

  const handleGrinderAction = async (action, club) => {
    setGrinderLoading(true);
    try {
      const body = { action, ...(club ? { club } : {}) };
      if (action === 'add_to_club') body.chips = settings.grinder_starting_chips || 10000;
      const data = await authFetch('/api/horses/grinder-stats', { method: 'POST', body: JSON.stringify(body) });
      showNotification(data.message || `${action} Completed`);
      broadcastUpdate('horses-grinder-updated');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setGrinderLoading(false);
    }
  };

  const updateBugReportStatus = async (ticketId, newStatus) => {
    const snapshot = bugReports;
    setBugReports((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
    const { error } = await supabase.from('live_help_tickets').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : { resolved_at: null }),
    }).eq('id', ticketId);
    if (error) {
      setBugReports(snapshot);
      showNotification(`Could Not Update Ticket: ${error.message}`, 'error');
      return;
    }
    showNotification(`Ticket Marked ${newStatus === 'resolved' ? 'Resolved' : 'Open'}`);
    loadBugReports(bugReportsFilter);
  };

  const markGeevesQuestionResolved = async (id, addedToKB) => {
    setGeevesMarkingId(id);
    try {
      await authFetch('/api/geeves/analytics', {
        method: 'POST',
        body: JSON.stringify({ action: 'mark_resolved', id, added_to_kb: addedToKB }),
      });
      setGeevesAnalytics((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== id) }));
      eventBus.emit(EventType.GEEVES_KB_UPDATED, { questionId: id, addedToKB }, 'GeevesAdmin');
      showNotification(addedToKB ? 'Marked As Added To KB' : 'Marked As Resolved');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setGeevesMarkingId(null);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (reviewsDeleteConfirm !== reviewId) { setReviewsDeleteConfirm(reviewId); return; }
    setReviewsProcessing(true);
    try {
      await authFetch(`/api/horses/admin-reviews?review_id=${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
      setReviewsData((prev) => prev.filter((r) => r.id !== reviewId));
      setReviewsStats((prev) => ({ ...prev, total: prev.total === null ? null : Math.max(0, prev.total - 1) }));
      showNotification('Review Deleted');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setReviewsProcessing(false);
      setReviewsDeleteConfirm(null);
    }
  };

  const handleFlagReview = async (reviewId, action) => {
    setReviewsProcessing(true);
    try {
      await authFetch('/api/horses/admin-reviews', {
        method: 'PATCH', body: JSON.stringify({ review_id: reviewId, action }),
      });
      setReviewsData((prev) => prev.map((r) => (r.id === reviewId
        ? { ...r, is_flagged: action === 'flag', flag_reason: action === 'flag' ? 'Admin flagged' : null }
        : r)));
      showNotification(action === 'flag' ? 'Review Flagged' : 'Flag Removed');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setReviewsProcessing(false);
    }
  };

  const createPromoCode = async (e) => {
    e.preventDefault();
    setPromoCreating(true);
    try {
      const data = await authFetch('/api/promo/admin-promo-codes', {
        method: 'POST', body: JSON.stringify(promoForm),
      });
      showNotification(`Promo Code ${data.code?.code || ''} Created`.trim());
      setPromoForm({ code: '', description: '', type: 'signup_bonus', value: 100, maxUses: '', expiresAt: '' });
      await loadPromoCodes();
      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setPromoCreating(false);
    }
  };

  const togglePromoCode = async (code) => {
    try {
      await authFetch('/api/promo/admin-promo-codes', {
        method: 'PATCH', body: JSON.stringify({ id: code.id, is_active: !code.is_active }),
      });
      showNotification(`Code ${code.is_active ? 'Deactivated' : 'Activated'}`);
      await loadPromoCodes();
      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECTS — realtime, lazy tab loads, polling
  // ═══════════════════════════════════════════════════════════════════════════

  // Refs so the realtime handlers never close over a stale value. The old
  // subscription read `caLoaded` from the closure created at mount, where it
  // was always false, so Club Arena data never auto-refreshed.
  const loadDataRef = useRef(loadData);
  const caLoadedRef = useRef(caLoaded);
  const loadCaRef = useRef(loadClubArenaData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);
  useEffect(() => { caLoadedRef.current = caLoaded; }, [caLoaded]);
  useEffect(() => { loadCaRef.current = loadClubArenaData; }, [loadClubArenaData]);

  useEffect(() => {
    if (!user) return undefined;
    loadData();
    loadPromoCodes();
  }, [user, loadData, loadPromoCodes]);

  useEffect(() => {
    if (!user) return undefined;

    // Coalescing matters here: `tables` and `table_seats` change constantly on
    // a live poker platform (88,000+ table rows, seats turning over every
    // hand). The old handlers called a full reload on EVERY row event, which
    // meant a sustained request storm for as long as the tab was open.
    let coreTimer = null;
    let caTimer = null;
    const refreshCore = () => {
      if (coreTimer) return;
      coreTimer = setTimeout(() => { coreTimer = null; loadDataRef.current(); }, 2000);
    };
    const refreshCa = () => {
      if (!caLoadedRef.current || caTimer) return;
      caTimer = setTimeout(() => { caTimer = null; loadCaRef.current(); }, 5000);
    };

    const cleanupBc = listenBroadcast(SYNC_CHANNEL, (msg) => {
      if (msg?.type === 'sync_update') refreshCore();
    });
    window.addEventListener('horses-updated', refreshCore);
    window.addEventListener('horses-grinder-updated', refreshCore);
    window.addEventListener('horses-settings-updated', refreshCore);

    const channel = supabase
      .channel('horses-db-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_authors' }, refreshCore)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_settings' }, refreshCore)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_runs' }, refreshCore)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, refreshCa)
      .subscribe();

    const unsubMutated = eventBus.on(EventType.DATA_MUTATED, refreshCore);

    return () => {
      if (coreTimer) clearTimeout(coreTimer);
      if (caTimer) clearTimeout(caTimer);
      cleanupBc();
      window.removeEventListener('horses-updated', refreshCore);
      window.removeEventListener('horses-grinder-updated', refreshCore);
      window.removeEventListener('horses-settings-updated', refreshCore);
      supabase.removeChannel(channel);
      unsubMutated();
    };
  }, [user]);

  // Geeves live feed
  useEffect(() => {
    const unsubMissed = eventBus.on(EventType.GEEVES_QUESTION_MISSED, (event) => {
      const { question, page: fromPage } = event.payload || {};
      if (!question) return;
      setGeevesAnalytics((prev) => {
        const exists = prev.questions.some((q) => q.question === question);
        if (exists) {
          return {
            ...prev,
            questions: prev.questions.map((q) => (q.question === question
              ? { ...q, asked_count: (q.asked_count || 1) + 1, last_asked: new Date().toISOString() }
              : q)),
          };
        }
        return {
          ...prev,
          questions: [{
            id: `live-${Date.now()}`, question, page: fromPage || null,
            asked_count: 1, last_asked: new Date().toISOString(), grok_answer: null,
          }, ...prev.questions],
        };
      });
    });
    const unsubKB = eventBus.on(EventType.GEEVES_KB_UPDATED, (event) => {
      const { questionId } = event.payload || {};
      if (!questionId) return;
      setGeevesAnalytics((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== questionId) }));
    });
    return () => { unsubMissed(); unsubKB(); };
  }, []);

  // Lazy tab loads, in one place instead of scattered across 14 onClick handlers.
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'grinder' && !grinderData && !grinderLoading) loadGrinderData();
    if (activeTab === 'stats' && !analyticsLoaded) loadAnalytics();
    if (activeTab === 'economy' && !economyLoaded && !economyLoading) loadEconomyData();
    if (activeTab === 'antiabuse' && !abuseLoaded && !abuseLoading) loadAntiAbuseData();
    if (activeTab === 'geeves' && !geevesLoaded && !geevesLoading) loadGeevesAnalytics();
    if (activeTab === 'reviews' && !reviewsLoaded && !reviewsLoading) loadAdminReviews();
    if (activeTab === 'bugreports' && bugReports.length === 0 && !bugReportsLoading) loadBugReports(bugReportsFilter);
    if (activeTab === 'clubarena' && !caLoaded && !caLoading) {
      loadClubArenaData();
      loadApplications('pending');
      loadLeaveRequests('pending');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  useEffect(() => {
    if (activeTab === 'reviews' && reviewsLoaded) loadAdminReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly]);

  useEffect(() => {
    if (activeTab !== 'scrapers' || !user) return undefined;
    loadScraperHealth();
    const interval = setInterval(loadScraperHealth, 60000);
    return () => clearInterval(interval);
  }, [activeTab, user, loadScraperHealth]);

  // ── Derived ──
  const filteredPersonas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return personas.filter((p) => {
      const matches = !q
        || p.name?.toLowerCase().includes(q)
        || p.alias?.toLowerCase().includes(q)
        || p.location?.toLowerCase().includes(q);
      if (!matches) return false;
      if (filter === 'active') return p.is_active;
      if (filter === 'inactive') return !p.is_active;
      return true;
    });
  }, [personas, searchTerm, filter]);

  const activeCount = useMemo(() => personas.filter((p) => p.is_active).length, [personas]);
  const totalPages = Math.max(1, Math.ceil(filteredPersonas.length / HORSES_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedPersonas = filteredPersonas.slice(safePage * HORSES_PER_PAGE, (safePage + 1) * HORSES_PER_PAGE);
  useEffect(() => { setPage(0); }, [searchTerm, filter]);

  const visibleReviews = useMemo(() => {
    const q = reviewsSearch.trim().toLowerCase();
    if (!q) return reviewsData;
    return reviewsData.filter((r) => (r.reviewer_name || '').toLowerCase().includes(q)
      || (r.venue_name || '').toLowerCase().includes(q)
      || (r.review_text || '').toLowerCase().includes(q));
  }, [reviewsData, reviewsSearch]);

  const pendingAppCount = caApplications.filter((a) => a.status === 'pending').length;
  const pendingLeaveCount = caLeaveRequests.filter((r) => r.status === 'pending').length;
  const deadScrapers = scraperHealth?.summary?.deadCount || 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.logo}>SP</span>
        <p>Loading Stable</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEOHead
          title="Stable Admin"
          description="Smarter.Poker staff console."
          canonical="/horses"
        >
          <meta name="robots" content="noindex, nofollow" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        </SEOHead>
        <div className={styles.loginContainer}>
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}>
              <h1>STABLE</h1>
              <p>Smarter.Poker Staff Console</p>
            </div>
            <form onSubmit={handleLogin}>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-email">Email</label>
                <input
                  id="admin-email" type="email" autoComplete="username"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="admin@smarter.poker" required
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-password">Password</label>
                <input
                  id="admin-password" type="password" autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Password" required
                />
              </div>
              {loginError && <div className={styles.error}>{loginError}</div>}
              <button type="submit" className={styles.loginBtn} disabled={signingIn}>
                {signingIn ? 'Signing In' : 'Enter The Stable'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Stable Admin | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.dashboard}>
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type] || ''}`}>
            {notification.message}
          </div>
        )}

        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>STABLE ADMIN</h1>
            <span className={styles.subtitle}>Smarter.Poker Staff Console</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.engineStatus}>
              <span className={`${styles.statusDot} ${settings.engine_enabled ? styles.active : ''}`} />
              <span>{settings.engine_enabled ? 'Engine Running' : 'Engine Stopped'}</span>
            </div>
            {settingsSaving && <span style={{ color: T.accent, fontSize: 12 }}>Saving</span>}
            <span className={styles.userInfo}>
              {user?.email}
              {role && <span style={{ color: T.accent, marginLeft: 6, fontSize: 11, textTransform: 'uppercase' }}>{role}</span>}
            </span>
            <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
          </div>
        </header>

        <nav className={styles.nav}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? styles.active : ''}
              onClick={() => setActiveTab(tab.id)}
              style={tab.id === 'scrapers' && deadScrapers > 0 ? { color: T.danger, fontWeight: 700 } : undefined}
            >
              {tab.label}
              {tab.id === 'scrapers' && deadScrapers > 0 ? ` (${deadScrapers})` : ''}
              {tab.id === 'clubarena' && pendingAppCount + pendingLeaveCount > 0
                ? ` (${pendingAppCount + pendingLeaveCount})` : ''}
            </button>
          ))}
          {EXTERNAL_LINKS.map((link) => (
            <button key={link.href} onClick={() => router.push(link.href)}>
              {link.label}
            </button>
          ))}
        </nav>

        <main className={styles.content}>
          {/* ─────────────────────────── SOCIAL HORSES ─────────────────────── */}
          {activeTab === 'stable' && (
            <div className={styles.stableView}>
              <div className={styles.stableHeader}>
                <div className={styles.stableStats}>
                  <div className={styles.statBox}>
                    <span className={styles.statNumber}>{num(personas.length, '0')}</span>
                    <span className={styles.statLabel}>Total Horses</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.activeBox}`}>
                    <span className={styles.statNumber}>{num(activeCount, '0')}</span>
                    <span className={styles.statLabel}>Active</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.inactiveBox}`}>
                    <span className={styles.statNumber}>{num(personas.length - activeCount, '0')}</span>
                    <span className={styles.statLabel}>Resting</span>
                  </div>
                </div>

                <div className={styles.stableControls}>
                  <input
                    type="search" placeholder="Search Horses" value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} className={styles.searchInput}
                    aria-label="Search horses"
                  />
                  <select value={filter} onChange={(e) => setFilter(e.target.value)} className={styles.filterSelect} aria-label="Filter horses">
                    <option value="all">All Horses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Resting Only</option>
                  </select>
                  <PokerBrainLaunchButton />
                  <button className={styles.btnSuccess} onClick={() => toggleAllPersonas(true)}>Activate All</button>
                  <button className={styles.actionBtn} onClick={() => toggleAllPersonas(false)}>Rest All</button>
                  <button className={styles.btnCreate} onClick={openCreateModal}>New Horse</button>
                </div>
              </div>

              {personasError && (
                <div className={styles.errorState}>
                  <div>The stable could not be loaded: {personasError}</div>
                  <button className={styles.actionBtn} onClick={loadData}>Retry</button>
                </div>
              )}

              {!personasError && filteredPersonas.length === 0 && (
                <div className={styles.emptyState}>
                  {personas.length === 0
                    ? 'No horses in the stable yet. Create one to get started.'
                    : 'No horses match the current search and filter.'}
                </div>
              )}

              <div className={styles.personaGrid}>
                {pagedPersonas.map((persona) => (
                  <div
                    key={persona.id}
                    className={`${styles.personaCard} ${persona.is_active ? styles.active : styles.inactive}`}
                  >
                    <div className={styles.personaHeader}>
                      <div className={styles.personaAvatar}>
                        {persona.avatar_url ? (
                          <img
                            src={persona.avatar_url} alt="" className={styles.avatarImage} loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector(`.${styles.avatarFallback}`);
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          className={styles.avatarFallback}
                          style={{ display: persona.avatar_url ? 'none' : 'flex' }}
                          aria-hidden="true"
                        >
                          {(persona.name || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.personaInfo}>
                        <h3>{persona.name || 'Unnamed'}</h3>
                        <span className={styles.alias}>@{persona.alias || 'no-alias'}</span>
                      </div>
                      <label className={styles.toggleSwitch} title={persona.is_active ? 'Rest this horse' : 'Activate this horse'}>
                        <input
                          type="checkbox" checked={!!persona.is_active}
                          onChange={() => togglePersona(persona.id, persona.is_active)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                    <div className={styles.personaDetails}>
                      <p>{persona.location || 'Location unknown'}</p>
                      <p>{persona.specialty?.replace(/_/g, ' ') || 'No specialty'}</p>
                      <p>{persona.stakes || 'No stakes set'}</p>
                    </div>
                    <div className={styles.personaBio}>{persona.bio || 'No bio.'}</div>
                    <div className={styles.personaVoice}>
                      <span className={styles.voiceTag}>{persona.voice || 'casual'}</span>
                      <div>
                        <button className={styles.editBtn} onClick={() => openEditModal(persona)}>Edit</button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(persona.id, persona.name)}
                          title="Retire this horse"
                          aria-label={`Retire ${persona.name}`}
                        >
                          Retire
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredPersonas.length > HORSES_PER_PAGE && (
                <div className={styles.pagination}>
                  <button onClick={() => setPage(0)} disabled={safePage === 0}>First</button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Previous</button>
                  <span className={styles.pageInfo}>
                    Page {safePage + 1} of {totalPages} — {num(filteredPersonas.length)} horses
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>Last</button>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────── GRINDER HORSES ─────────────────────── */}
          {activeTab === 'grinder' && (
            <div className={styles.grinderView}>
              <div className={styles.grinderHeader}>
                <h2>Grinder Horses</h2>
                <p className={styles.grinderSubtitle}>
                  The same horses, second job: playing poker across the Midway Union clubs.
                </p>
              </div>

              {grinderError && (
                <div className={styles.errorState}>
                  <div>Grinder stats unavailable: {grinderError}</div>
                  <button className={styles.actionBtn} onClick={loadGrinderData}>Retry</button>
                </div>
              )}

              {grinderData?.derivation && (
                <div className={styles.warnBanner}>{grinderData.derivation}</div>
              )}

              <div className={styles.grinderStats}>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{num(personas.length, '0')}</span>
                  <span className={styles.statLabel}>Total Grinders</span>
                </div>
                <div className={`${styles.statBox} ${styles.activeBox}`}>
                  <span className={styles.statNumber}>{num(grinderData?.currentlyPlaying)}</span>
                  <span className={styles.statLabel}>Currently Playing</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{num(grinderData?.activeTables)}</span>
                  <span className={styles.statLabel}>Active Tables</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{num(settings.grinder_daily_hours ?? 16)}h</span>
                  <span className={styles.statLabel}>Daily Playtime</span>
                </div>
              </div>

              <div className={styles.grinderControls}>
                <h3>Fleet Deployment</h3>
                <div className={styles.clubActions}>
                  <button className={styles.btnSuccess} onClick={() => handleFleetLaunch('launch_all')} disabled={grinderLoading}>
                    Launch Full Fleet
                  </button>
                  <button className={styles.btnDanger} onClick={() => handleFleetLaunch('shutdown')} disabled={grinderLoading}>
                    Shutdown Entire Fleet
                  </button>
                </div>

                <h3 style={{ marginTop: 24 }}>Club Management</h3>
                <div className={styles.warnBanner}>
                  These three actions are not implemented server-side yet. The endpoint now
                  returns an explicit error instead of reporting success, because it used to
                  claim it had added horses and granted chips without touching the database.
                </div>
                <div className={styles.clubActions}>
                  <button className={styles.actionBtn} onClick={() => handleGrinderAction('add_to_club', 'shark_club')} disabled={grinderLoading}>
                    Add All Horses To Shark Club
                  </button>
                  <button className={styles.actionBtn} onClick={() => handleGrinderAction('add_to_club', 'club_jaqk')} disabled={grinderLoading}>
                    Add All Horses To Club JAQK
                  </button>
                  <button className={styles.actionBtn} onClick={() => handleGrinderAction('start')} disabled={grinderLoading}>
                    Start Auto-Join
                  </button>
                  <button className={styles.actionBtn} onClick={() => handleGrinderAction('stop')} disabled={grinderLoading}>
                    Stop All Horses
                  </button>
                </div>
              </div>

              <div className={styles.grinderSettings}>
                <h3>Grinder Settings</h3>
                <div className={styles.settingsRow}>
                  <div className={styles.settingItem}>
                    <label htmlFor="g-max-tables">Max Tables Per Horse</label>
                    <select id="g-max-tables" value={settings.grinder_max_tables ?? 4}
                      onChange={(e) => updateSetting('grinder_max_tables', parseInt(e.target.value, 10))}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'Table' : 'Tables'}</option>)}
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label htmlFor="g-hours">Daily Play Hours</label>
                    <select id="g-hours" value={settings.grinder_daily_hours ?? 16}
                      onChange={(e) => updateSetting('grinder_daily_hours', parseInt(e.target.value, 10))}>
                      {[8, 12, 16, 24].map((n) => <option key={n} value={n}>{n} Hours</option>)}
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label htmlFor="g-chips">Starting Chips</label>
                    <input
                      id="g-chips" type="number" min="1000" max="100000" step="500"
                      value={settings.grinder_starting_chips ?? 10000}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) updateSetting('grinder_starting_chips', v);
                      }}
                    />
                  </div>
                  <div className={styles.settingItem}>
                    <label htmlFor="g-model">AI Model</label>
                    <select id="g-model" value={settings.grinder_ai_model ?? 'gpt-4o'}
                      onChange={(e) => updateSetting('grinder_ai_model', e.target.value)}>
                      <option value="gpt-4o">GPT-4o (Best)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.grinderTable}>
                <h3 className={styles.sectionTitle}>
                  Horse Roster
                  <span className={styles.countPill}>{num(filteredPersonas.length)}</span>
                </h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Horse</th><th>Specialty</th><th>Play Style</th>
                        <th>Tables</th><th>Hands</th><th>Profit</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPersonas.map((persona) => {
                        const stats = grinderData?.roster?.find((r) => r.horse_id === persona.id);
                        return (
                          <tr key={persona.id}>
                            <td>
                              <div className={styles.horseCell}>
                                {persona.avatar_url
                                  ? <img src={persona.avatar_url} alt="" className={styles.tableCellAvatar} loading="lazy" />
                                  : <span className={styles.avatarFallback}>{(persona.name || '?').charAt(0).toUpperCase()}</span>}
                                <div>
                                  <strong>{persona.name}</strong>
                                  <small>@{persona.alias}</small>
                                </div>
                              </div>
                            </td>
                            <td>{persona.specialty?.replace(/_/g, ' ') || '—'}</td>
                            <td><span className={styles.voiceTag}>{persona.voice || 'casual'}</span></td>
                            <td>{num(stats?.tables, '0')}/{num(settings.grinder_max_tables ?? 4)}</td>
                            {/* hands and profit are null, not 0, when they cannot be derived. */}
                            <td>{num(stats?.hands)}</td>
                            <td className={styles.profitCell}>{stats?.profit === null || stats?.profit === undefined ? '—' : signed(stats.profit)}</td>
                            <td>
                              {stats?.status === 'playing'
                                ? <span className={styles.statusActive}>Playing</span>
                                : <span className={styles.statusIdle}>Idle</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredPersonas.length > HORSES_PER_PAGE && (
                  <div className={styles.pagination}>
                    <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Previous</button>
                    <span className={styles.pageInfo}>Page {safePage + 1} of {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────── PIPELINE ──────────────────────────── */}
          {activeTab === 'pipeline' && (
            <div className={styles.pipelineView}>
              <h2>Content Pipeline</h2>
              <div className={styles.pipelineActions}>
                <h3>Quick Actions</h3>
                <div className={styles.actionButtons}>
                  {[
                    ['test', 'Test Run', '3 Posts, No Video'],
                    ['cycle', 'Quick Cycle', '10 Posts, 2 Videos'],
                    ['daily', 'Full Daily', `${settings.posts_per_day || 20} Posts`],
                    ['publish', 'Publish Due', 'Post Scheduled'],
                  ].map(([type, label, desc]) => (
                    <button
                      key={type} onClick={() => triggerPipeline(type)} disabled={pipelineBusy}
                      className={`${styles.actionBtn} ${type === 'daily' ? styles.featured : ''}`}
                    >
                      <span className={styles.label}>{label}</span>
                      <span className={styles.desc}>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* The RSS source list used to be five hardcoded names each with a
                  green dot next to it, wired to nothing at all. It is gone
                  rather than left as decoration that reads as a health check. */}

              <div className={styles.recentRuns}>
                <h3>Recent Pipeline Runs</h3>
                {pipelineRuns.length === 0 ? (
                  <p className={styles.noData}>No pipeline runs recorded yet.</p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Time</th><th>Type</th><th>Posts</th><th>Videos</th><th>Duration</th></tr>
                      </thead>
                      <tbody>
                        {pipelineRuns.map((run) => (
                          <tr key={run.id}>
                            <td>{when(run.started_at, true)}</td>
                            <td><span className={`${styles.runType} ${styles[run.run_type] || ''}`}>{run.run_type}</span></td>
                            <td>{num(run.text_posts_created, '0')}</td>
                            <td>{num(run.videos_created, '0')}</td>
                            <td>{run.duration_seconds !== null && run.duration_seconds !== undefined ? `${run.duration_seconds}s` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────── SETTINGS ──────────────────────────── */}
          {activeTab === 'settings' && (
            <div className={styles.settingsView}>
              <h2>Engine Settings</h2>
              <p style={{ color: T.dim, fontSize: 13, marginBottom: 20 }}>
                Changes save automatically about a second after you stop editing.
              </p>
              <div className={styles.settingsGrid}>
                <div className={styles.settingCard}>
                  <h3>Posting Schedule</h3>
                  {[
                    ['posts_per_day', 'Posts Per Day', 1, 100],
                    ['min_delay_minutes', 'Min Delay (minutes)', 5, 180],
                    ['max_delay_minutes', 'Max Delay (minutes)', 15, 300],
                  ].map(([key, label, min, max]) => (
                    <div className={styles.settingItem} key={key}>
                      <label htmlFor={`set-${key}`}>{label}</label>
                      <input
                        id={`set-${key}`} type="number" min={min} max={max}
                        value={settings[key] ?? ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          // Clearing the field used to write NaN to the row.
                          if (Number.isFinite(v)) updateSetting(key, Math.min(Math.max(v, min), max));
                        }}
                      />
                    </div>
                  ))}
                  {settings.min_delay_minutes > settings.max_delay_minutes && (
                    <div className={styles.warnBanner}>
                      Min delay is greater than max delay. The scheduler will not behave sensibly.
                    </div>
                  )}
                </div>

                <div className={styles.settingCard}>
                  <h3>AI Settings</h3>
                  <div className={styles.settingItem}>
                    <label htmlFor="set-model">Model</label>
                    <select id="set-model" value={settings.ai_model || 'gpt-4o'}
                      onChange={(e) => updateSetting('ai_model', e.target.value)}>
                      <option value="gpt-4o">GPT-4o (Best)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label htmlFor="set-temp">Temperature: {Number(settings.temperature ?? 0.8).toFixed(2)}</label>
                    <input
                      id="set-temp" type="range" min="0" max="100" step="5"
                      value={Math.round(Number(settings.temperature ?? 0.8) * 100)}
                      onChange={(e) => updateSetting('temperature', Number(e.target.value) / 100)}
                    />
                  </div>
                </div>

                <div className={`${styles.settingCard} ${styles.fullWidth}`}>
                  <h3>System Controls</h3>
                  <div className={styles.systemControls}>
                    <div className={styles.controlItem}>
                      <label htmlFor="set-engine">Content Engine</label>
                      <label className={styles.toggleSwitch}>
                        <input id="set-engine" type="checkbox" checked={!!settings.engine_enabled}
                          onChange={(e) => updateSetting('engine_enabled', e.target.checked)} />
                        <span className={styles.slider} />
                      </label>
                      <span style={{ color: settings.engine_enabled ? T.accent : T.danger }}>
                        {settings.engine_enabled ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className={styles.controlItem}>
                      <label htmlFor="set-publish">Auto-Publish</label>
                      <label className={styles.toggleSwitch}>
                        <input id="set-publish" type="checkbox" checked={!!settings.auto_publish}
                          onChange={(e) => updateSetting('auto_publish', e.target.checked)} />
                        <span className={styles.slider} />
                      </label>
                      <span style={{ color: settings.auto_publish ? T.accent : T.warn }}>
                        {settings.auto_publish ? 'Active' : 'Manual'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────── STATISTICS ────────────────────────── */}
          {activeTab === 'stats' && (
            <div className={styles.statsView}>
              <h2>Content Statistics</h2>
              {!analyticsLoaded ? (
                <div className={styles.loadingSpinner}>Loading Analytics</div>
              ) : analyticsError ? (
                <div className={styles.errorState}>
                  <div>Analytics unavailable: {analyticsError}</div>
                  <button className={styles.actionBtn} onClick={() => { setAnalyticsLoaded(false); setAnalyticsError(null); loadAnalytics(); }}>Retry</button>
                </div>
              ) : (
                <>
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(personas.length, '0')}</span>
                      <span className={styles.statLabel}>Total Authors</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(analyticsData?.activeHorses ?? activeCount)}</span>
                      <span className={styles.statLabel}>Active Authors (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(pipelineRuns.length, '0')}</span>
                      <span className={styles.statLabel}>Pipeline Runs</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(analyticsData?.totalPosts)}</span>
                      <span className={styles.statLabel}>Posts Created (7d)</span>
                    </div>
                  </div>

                  <div className={styles.contentBreakdown}>
                    <h3>Content Source Breakdown (Last 7 Days)</h3>
                    <div className={styles.breakdownGrid}>
                      {(() => {
                        const dist = analyticsData?.sourceDistribution || {};
                        const entries = Object.entries(dist);
                        if (entries.length === 0) {
                          return <p className={styles.noData}>No data for the last 7 days.</p>;
                        }
                        // Math.max of an empty list is -Infinity, which produced
                        // a NaN width. Guarded.
                        const peak = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
                        return entries.map(([source, count]) => (
                          <div key={source} className={styles.breakdownItem}>
                            <div className={styles.breakdownBar}
                              style={{ width: `${Math.min((Number(count) / peak) * 100, 100)}%`, backgroundColor: T.accent }} />
                            <span className={styles.breakdownLabel}>{source}</span>
                            <span className={styles.breakdownCount}>{num(count, '0')}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── BUG REPORTS ───────────────────────── */}
          {activeTab === 'bugreports' && (
            <div className={styles.statsView}>
              <h2>Bug Reports And Support Tickets</h2>
              <div className={styles.filterBar}>
                {['open', 'resolved', 'all'].map((f) => (
                  <button
                    key={f}
                    className={`${styles.filterBtn} ${bugReportsFilter === f ? styles.active : ''}`}
                    onClick={() => { setBugReportsFilter(f); loadBugReports(f); }}
                  >
                    {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'}
                  </button>
                ))}
                <button className={styles.filterBtn} onClick={() => loadBugReports(bugReportsFilter)} disabled={bugReportsLoading}>
                  Refresh
                </button>
              </div>

              {bugReportsError ? (
                <div className={styles.errorState}>
                  <div>Tickets unavailable: {bugReportsError}</div>
                  <button className={styles.actionBtn} onClick={() => loadBugReports(bugReportsFilter)}>Retry</button>
                </div>
              ) : bugReportsLoading ? (
                <div className={styles.loadingSpinner}>Loading Tickets</div>
              ) : bugReports.length === 0 ? (
                <div className={styles.emptyState}>No tickets in this view.</div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>User</th><th>Subject</th><th>Priority</th><th>Status</th><th>Date</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {bugReports.map((ticket) => {
                        const pColor = { high: T.danger, medium: T.warn, low: T.info }[ticket.priority] || T.dim;
                        return (
                          <tr key={ticket.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {ticket.profiles?.avatar_url && (
                                  <img src={ticket.profiles.avatar_url} alt="" loading="lazy"
                                    style={{ width: 24, height: 24, borderRadius: '50%' }} />
                                )}
                                <div>
                                  <div style={{ fontWeight: 600 }}>
                                    {ticket.profiles?.display_name || ticket.profiles?.username || 'Anonymous'}
                                  </div>
                                  <div style={{ fontSize: 11, color: T.muted }}>@{ticket.profiles?.username || 'unknown'}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{ticket.subject}</div>
                              <div style={{ fontSize: 12, color: T.dim, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ticket.description}
                              </div>
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                textTransform: 'uppercase', color: pColor, border: `1px solid ${pColor}`,
                              }}>{ticket.priority || 'medium'}</span>
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                                background: ticket.status === 'open' ? T.dangerSoft : T.accentSoft,
                                color: ticket.status === 'open' ? T.danger : T.accent,
                              }}>{ticket.status}</span>
                            </td>
                            <td style={{ fontSize: 12, color: T.dim }}>{when(ticket.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className={styles.filterBtn}
                                  onClick={() => updateBugReportStatus(ticket.id, ticket.status === 'open' ? 'resolved' : 'open')}
                                >
                                  {ticket.status === 'open' ? 'Resolve' : 'Reopen'}
                                </button>
                                {ticket.conversation_id && (
                                  <a
                                    href={`/hub/messenger?conversation=${ticket.conversation_id}`}
                                    target="_blank" rel="noreferrer"
                                    style={{
                                      background: T.accentSoft, border: `1px solid ${T.accentLine}`, color: T.accent,
                                      padding: '6px 12px', borderRadius: 8, fontSize: 12, textDecoration: 'none', fontWeight: 600,
                                    }}
                                  >Chat</a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────── PROMO CODES ───────────────────────── */}
          {activeTab === 'promo' && (
            <div className={styles.statsView}>
              <h2>Promo Code Manager</h2>

              <div className={styles.statsOverview}>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>{num(promoCodes.length, '0')}</span>
                  <span className={styles.statLabel}>Total Codes</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>{num(promoCodes.filter((c) => c.is_active).length, '0')}</span>
                  <span className={styles.statLabel}>Active</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>
                    {num(promoCodes.reduce((sum, c) => sum + (Number(c.current_uses ?? c.times_used) || 0), 0), '0')}
                  </span>
                  <span className={styles.statLabel}>Total Redemptions</span>
                </div>
              </div>

              <div className={styles.contentBreakdown} style={{ marginBottom: 24 }}>
                <h3>Create New Promo Code</h3>
                <form onSubmit={createPromoCode}>
                  <div className={styles.formRow} style={{ marginBottom: 12 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-code">Code (blank auto-generates)</label>
                      <input
                        id="promo-code" type="text" maxLength={20} placeholder="Auto-generated"
                        value={promoForm.code}
                        onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        style={{ textTransform: 'uppercase', letterSpacing: 2 }}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-desc">Description</label>
                      <input
                        id="promo-desc" type="text" required placeholder="Welcome bonus for new users"
                        value={promoForm.description}
                        onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: 12 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-type">Type</label>
                      <select id="promo-type" value={promoForm.type}
                        onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}>
                        <option value="signup_bonus">Signup Bonus (Diamonds)</option>
                        <option value="diamonds">Diamond Bonus</option>
                        <option value="vip_trial">VIP Trial (Days)</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-value">Value ({promoForm.type === 'vip_trial' ? 'Days' : 'Diamonds'})</label>
                      <input
                        id="promo-value" type="number" min="1" max="10000" required
                        value={promoForm.value}
                        onChange={(e) => setPromoForm({ ...promoForm, value: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: 16 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-max">Max Uses (blank is unlimited)</label>
                      <input id="promo-max" type="number" min="1" placeholder="Unlimited"
                        value={promoForm.maxUses}
                        onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-exp">Expires At (optional)</label>
                      <input id="promo-exp" type="datetime-local" value={promoForm.expiresAt}
                        onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} />
                    </div>
                  </div>
                  <button type="submit" className={styles.btnSubmit} disabled={promoCreating} style={{ width: '100%' }}>
                    {promoCreating ? 'Creating' : 'Create Promo Code'}
                  </button>
                </form>
              </div>

              <div className={styles.contentBreakdown}>
                <h3 className={styles.sectionTitle}>
                  All Promo Codes <span className={styles.countPill}>{num(promoCodes.length, '0')}</span>
                </h3>
                {promoError ? (
                  <div className={styles.errorState}>
                    <div>Promo codes unavailable: {promoError}</div>
                    <button className={styles.actionBtn} onClick={loadPromoCodes}>Retry</button>
                  </div>
                ) : promoLoading ? (
                  <div className={styles.loadingSpinner}>Loading Codes</div>
                ) : promoCodes.length === 0 ? (
                  <div className={styles.emptyState}>No promo codes yet. Create one above.</div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Code</th><th>Type</th><th>Value</th><th>Uses</th><th>Status</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {promoCodes.map((code) => {
                          const uses = Number(code.current_uses ?? code.times_used) || 0;
                          const max = code.max_uses;
                          return (
                            <tr key={code.id}>
                              <td>
                                <span style={{
                                  fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1,
                                  color: code.is_active ? T.accent : T.muted, fontSize: 15,
                                }}>{code.code}</span>
                                {code.description && (
                                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{code.description}</div>
                                )}
                              </td>
                              <td>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: (code.type || code.reward_type) === 'vip_trial' ? T.warnSoft : T.infoSoft,
                                  color: (code.type || code.reward_type) === 'vip_trial' ? T.warn : T.info,
                                }}>
                                  {(code.type || code.reward_type || 'unknown').replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                {num(code.value ?? code.reward_value)} {(code.type || code.reward_type) === 'vip_trial' ? 'days' : 'diamonds'}
                              </td>
                              <td>{num(uses, '0')}{max ? ` / ${num(max)}` : ' / unlimited'}</td>
                              <td>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: code.is_active ? T.accentSoft : T.dangerSoft,
                                  color: code.is_active ? T.accent : T.danger,
                                }}>{code.is_active ? 'Active' : 'Inactive'}</span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    className={styles.filterBtn}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(code.code);
                                        showNotification(`Copied ${code.code}`);
                                      } catch {
                                        showNotification('Clipboard Unavailable In This Browser', 'error');
                                      }
                                    }}
                                  >Copy</button>
                                  <button className={styles.filterBtn} onClick={() => togglePromoCode(code)}>
                                    {code.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────── ECONOMY ───────────────────────────── */}
          {activeTab === 'economy' && (
            <div className={styles.statsView}>
              <h2>Diamond Economy</h2>
              {economyLoading ? (
                <div className={styles.loadingSpinner}>Loading Economy Data</div>
              ) : economyError ? (
                <div className={styles.errorState}>
                  <div>Economy data unavailable: {economyError}</div>
                  <button className={styles.actionBtn} onClick={() => { setEconomyError(null); loadEconomyData(); }}>Retry</button>
                </div>
              ) : !economyData ? (
                <div className={styles.emptyState}>No economy data available.</div>
              ) : (
                <>
                  {economyData.failedSources?.length > 0 && (
                    <div className={styles.warnBanner}>
                      Some figures could not be read: {economyData.failedSources.join('; ')}
                    </div>
                  )}
                  {/* Every one of these used to be `stats.x.toLocaleString()`
                      with no guard, so one missing field crashed the tab. */}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(economyData.stats?.totalUsers)}</span>
                      <span className={styles.statLabel}>Total Users</span>
                    </div>
                    <div className={`${styles.statCardLarge} ${styles.activeBox}`}>
                      <span className={styles.statNumber}>{signed(economyData.stats?.newUsers7d || 0)}</span>
                      <span className={styles.statLabel}>New Users (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.accent }}>
                        {signed(economyData.stats?.totalDiamondsEarned || 0)}
                      </span>
                      <span className={styles.statLabel}>Diamonds Earned</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.danger }}>
                        -{num(economyData.stats?.totalDiamondsSpent, '0')}
                      </span>
                      <span className={styles.statLabel}>Diamonds Spent</span>
                    </div>
                  </div>

                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(economyData.stats?.totalRewardClaims)}</span>
                      <span className={styles.statLabel}>Reward Claims</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.info }}>
                        {num(economyData.stats?.diamondPurchaseCount)}
                      </span>
                      <span className={styles.statLabel}>Diamond Purchases</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        ${((Number(economyData.stats?.diamondPurchaseRevenue) || 0) / 100).toFixed(2)}
                      </span>
                      <span className={styles.statLabel}>Purchase Revenue</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.accent }}>
                        {num(economyData.stats?.activeVipCount)} / {num(economyData.stats?.vipSubscriptionCount)}
                      </span>
                      <span className={styles.statLabel}>VIP Active / Total</span>
                    </div>
                  </div>

                  {economyData.recentUsers?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Recent Signups</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead><tr><th>Username</th><th>Name</th><th>Joined</th></tr></thead>
                          <tbody>
                            {economyData.recentUsers.map((u) => (
                              <tr key={u.id}>
                                <td>{u.username || '—'}</td>
                                <td>{u.full_name || '—'}</td>
                                <td>{when(u.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                    <h3>Diamond Transaction Log</h3>
                    {(economyData.transactions || []).length === 0 ? (
                      <div className={styles.emptyState}>No transactions in range.</div>
                    ) : (
                      <div className={styles.tableWrapper} style={{ maxHeight: 500, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Source</th><th>Description</th></tr></thead>
                          <tbody>
                            {(economyData.transactions || []).map((tx, i) => {
                              const credit = tx.type === 'earned' || tx.type === 'reward' || Number(tx.amount) > 0;
                              return (
                                <tr key={tx.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(tx.created_at, true)}</td>
                                  <td style={{ fontSize: 12 }}>{tx.user_id ? `${String(tx.user_id).slice(0, 8)}...` : '—'}</td>
                                  <td>
                                    <span style={{
                                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                      background: credit ? T.accentSoft : T.dangerSoft,
                                      color: credit ? T.accent : T.danger,
                                    }}>{tx.type || 'unknown'}</span>
                                  </td>
                                  <td style={{ fontWeight: 700, color: credit ? T.accent : T.danger }}>{signed(tx.amount)}</td>
                                  <td style={{ fontSize: 12 }}>{tx.source || '—'}</td>
                                  <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {tx.description || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {economyData.vipSubscriptions?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>VIP Subscriptions</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead><tr><th>Date</th><th>User</th><th>Plan</th><th>Status</th><th>Expires</th></tr></thead>
                          <tbody>
                            {economyData.vipSubscriptions.map((s, i) => (
                              <tr key={s.id || i}>
                                <td>{when(s.created_at)}</td>
                                <td style={{ fontSize: 12 }}>{s.user_id ? `${String(s.user_id).slice(0, 8)}...` : '—'}</td>
                                <td><span className={styles.voiceTag}>{s.plan || 'VIP'}</span></td>
                                <td style={{ color: s.status === 'active' ? T.accent : T.danger }}>{s.status || '—'}</td>
                                <td>{when(s.current_period_end)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button onClick={loadEconomyData} className={styles.actionBtn} disabled={economyLoading}>
                      Refresh Economy Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── ANTI-ABUSE ────────────────────────── */}
          {activeTab === 'antiabuse' && (
            <div className={styles.statsView}>
              <h2>Anti-Abuse Command Center</h2>
              {abuseLoading ? (
                <div className={styles.loadingSpinner}>Loading Anti-Abuse Data</div>
              ) : abuseError ? (
                <div className={styles.errorState}>
                  <div>Anti-abuse data unavailable: {abuseError}</div>
                  <button className={styles.actionBtn} onClick={() => { setAbuseError(null); loadAntiAbuseData(); }}>Retry</button>
                </div>
              ) : !abuseData ? (
                <div className={styles.emptyState}>No data available.</div>
              ) : (
                <>
                  {abuseData.abuse?.disposableScope && (
                    <div className={styles.warnBanner}>
                      Disposable-email count is scoped to {abuseData.abuse.disposableScope}.
                    </div>
                  )}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(abuseData.abuse?.stats?.totalSignups)}</span>
                      <span className={styles.statLabel}>Tracked Signups</span>
                    </div>
                    <div className={styles.statCardLarge} style={{ borderColor: T.danger }}>
                      <span className={styles.statNumber} style={{ color: T.danger }}>
                        {num(abuseData.abuse?.stats?.blocked)}
                      </span>
                      <span className={styles.statLabel}>Blocked Or Flagged</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        {num(abuseData.abuse?.stats?.disposable)}
                      </span>
                      <span className={styles.statLabel}>Disposable Emails</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.info }}>
                        {num(abuseData.alerts?.length, '0')}
                      </span>
                      <span className={styles.statLabel}>Alerts (24h)</span>
                    </div>
                  </div>

                  {abuseData.alerts?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24, borderLeft: `3px solid ${T.danger}` }}>
                      <h3>Real-Time Alerts</h3>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {abuseData.alerts.map((alert, i) => (
                          <div key={i} style={{
                            padding: '10px 14px', borderBottom: `1px solid ${T.line}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                          }}>
                            <div>
                              <div style={{ fontWeight: 600, color: T.danger, fontSize: 13 }}>{alert.reason}</div>
                              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                                {alert.email} — IP {alert.ip} — Deletions {num(alert.deletions, '0')}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>{when(alert.at, true)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                    <h3>Signup Abuse Log</h3>
                    {(abuseData.abuse?.log || []).length === 0 ? (
                      <div className={styles.emptyState}>No signup abuse recorded.</div>
                    ) : (
                      <div className={styles.tableWrapper} style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th>Email</th><th>IP</th><th>Signups</th><th>Deletions</th><th>Welcome</th><th>Flags</th><th>Last Signup</th></tr>
                          </thead>
                          <tbody>
                            {(abuseData.abuse?.log || []).map((entry, i) => (
                              <tr key={entry.id || i} style={{ background: entry.deleted_account_count > 0 ? T.dangerSoft : undefined }}>
                                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {entry.raw_email || (entry.email_hash ? `${entry.email_hash.slice(0, 12)}...` : 'Unknown')}
                                </td>
                                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{entry.ip_address || '—'}</td>
                                <td style={{ textAlign: 'center' }}>{num(entry.signup_count, '1')}</td>
                                <td style={{
                                  textAlign: 'center',
                                  color: entry.deleted_account_count > 0 ? T.danger : T.muted,
                                  fontWeight: entry.deleted_account_count > 0 ? 700 : 400,
                                }}>{num(entry.deleted_account_count, '0')}</td>
                                <td style={{ textAlign: 'center', color: entry.welcome_package_granted ? T.accent : T.muted }}>
                                  {entry.welcome_package_granted ? 'Yes' : 'No'}
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 200 }}>
                                  {(entry.abuse_flags || []).map((f, j) => (
                                    <span key={j} style={{
                                      display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                                      background: T.dangerSoft, color: T.danger, fontSize: 10, margin: '1px 2px',
                                    }}>{f.reason || 'flagged'}</span>
                                  ))}
                                </td>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(entry.last_signup_at, true)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {abuseData.abuse?.topIPs?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Top IPs By Signup Volume</h3>
                      <div className={styles.breakdownGrid}>
                        {(() => {
                          const peak = Math.max(1, ...abuseData.abuse.topIPs.map((x) => Number(x.count) || 0));
                          return abuseData.abuse.topIPs.map((ip, i) => (
                            <div key={i} className={styles.breakdownItem}>
                              <div className={styles.breakdownBar} style={{
                                width: `${Math.min((Number(ip.count) / peak) * 100, 100)}%`,
                                backgroundColor: ip.count > 3 ? T.danger : ip.count > 1 ? T.warn : T.accent,
                              }} />
                              <span className={styles.breakdownLabel} style={{ fontFamily: 'monospace' }}>{ip.ip}</span>
                              <span className={styles.breakdownCount}>{num(ip.count, '0')} signups</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {abuseData.economy?.sourceBreakdown && Object.keys(abuseData.economy.sourceBreakdown).length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Diamond Source Breakdown</h3>
                      <div className={styles.statsOverview}>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: T.accent }}>
                            {signed(abuseData.economy.totalGranted || 0)}
                          </span>
                          <span className={styles.statLabel}>Total Granted</span>
                        </div>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: T.danger }}>
                            -{num(abuseData.economy.totalSpent, '0')}
                          </span>
                          <span className={styles.statLabel}>Total Spent</span>
                        </div>
                      </div>
                      <div className={styles.breakdownGrid} style={{ marginTop: 12 }}>
                        {(() => {
                          const entries = Object.entries(abuseData.economy.sourceBreakdown);
                          // Math.max(...[]) is -Infinity. This produced NaN widths.
                          const peak = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
                          return entries.sort((a, b) => b[1] - a[1]).map(([source, amount]) => (
                            <div key={source} className={styles.breakdownItem}>
                              <div className={styles.breakdownBar} style={{
                                width: `${Math.min((Number(amount) / peak) * 100, 100)}%`,
                                backgroundColor: T.accent,
                              }} />
                              <span className={styles.breakdownLabel}>{source}</span>
                              <span className={styles.breakdownCount}>{num(amount, '0')}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {abuseData.economy?.topHolders?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Top Diamond Holders</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead><tr><th>Rank</th><th>Username</th><th>Email</th><th>Diamonds</th><th>VIP</th><th>Phone</th></tr></thead>
                          <tbody>
                            {abuseData.economy.topHolders.map((holder, i) => (
                              <tr key={holder.id}>
                                <td style={{ fontWeight: 700, color: i < 3 ? T.warn : T.muted }}>{i + 1}</td>
                                <td>{holder.username || '—'}</td>
                                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {holder.email || '—'}
                                </td>
                                <td style={{ fontWeight: 700, color: T.accent }}>{num(holder.diamonds, '0')}</td>
                                <td>{holder.is_vip ? (holder.vip_tier || 'VIP') : '—'}</td>
                                <td style={{ color: holder.phone_verified ? T.accent : T.muted }}>
                                  {holder.phone_verified ? 'Verified' : 'No'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {abuseData.audit?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Admin Audit Log</h3>
                      <div className={styles.tableWrapper} style={{ maxHeight: 300, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
                          <tbody>
                            {abuseData.audit.map((entry, i) => (
                              <tr key={entry.id || i}>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(entry.created_at, true)}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: T.accentSoft, color: T.accent,
                                  }}>{entry.action}</span>
                                </td>
                                <td style={{ fontSize: 12 }}>
                                  {entry.target_type} {entry.target_id ? String(entry.target_id).slice(0, 8) : '—'}
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {JSON.stringify(entry.details || {}).slice(0, 80)}
                                </td>
                                <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{entry.ip_address || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button onClick={loadAntiAbuseData} className={styles.actionBtn} disabled={abuseLoading}>
                      Refresh Anti-Abuse Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── CLUB ARENA ────────────────────────── */}
          {activeTab === 'clubarena' && (
            <div className={styles.statsView}>
              <h2>Club Arena Admin</h2>
              <p style={{ color: T.dim, fontSize: 13, marginBottom: 20 }}>
                Platform-level oversight of every club, union, agent and chip movement.
              </p>

              {caWarnings?.length > 0 && (
                <div className={styles.warnBanner}>
                  Some sources could not be read, so the figures below are incomplete: {caWarnings.join('; ')}
                </div>
              )}

              <div className={styles.subNav}>
                {CA_SECTIONS.map(([id, label]) => (
                  <button
                    key={id}
                    className={caSection === id ? styles.active : ''}
                    onClick={() => { setCaSection(id); setCaSelectedClub(null); setCaSelectedUser(null); }}
                  >
                    {label}
                    {id === 'approvals' && pendingAppCount + pendingLeaveCount > 0
                      ? ` (${pendingAppCount + pendingLeaveCount})` : ''}
                    {id === 'finance' && caPendingCashouts.length > 0 ? ` (${caPendingCashouts.length})` : ''}
                  </button>
                ))}
                <button onClick={loadClubArenaData} disabled={caLoading} style={{ marginLeft: 'auto' }}>
                  {caLoading ? 'Refreshing' : 'Refresh'}
                </button>
              </div>

              {caError ? (
                <div className={styles.errorState}>
                  <div>Club Arena data unavailable: {caError}</div>
                  <button className={styles.actionBtn} onClick={loadClubArenaData}>Retry</button>
                </div>
              ) : caLoading && !caLoaded ? (
                <div className={styles.loadingSpinner}>Loading Club Arena Data</div>
              ) : (
                <>
                  {/* ── OVERVIEW ── (caStats was computed and never rendered) */}
                  {caSection === 'overview' && (
                    <>
                      <div className={styles.kpiGrid}>
                        {[
                          ['Clubs', caStats?.totalClubs],
                          ['Members', caStats?.totalMembers],
                          ['Live Tables', caStats?.totalTables],
                          ['Pending Cashouts', caStats?.pendingCashouts],
                          ['Cashout Total', caStats?.pendingCashoutTotal],
                          ['Chips Minted (24h)', caStats?.totalMinted24h],
                        ].map(([label, value]) => (
                          <div key={label} className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(value)}</div>
                            <div className={styles.kpiLabel}>{label}</div>
                          </div>
                        ))}
                      </div>

                      <h3 className={styles.sectionTitle}>
                        Recent Chip Movement
                        <span className={styles.countPill}>{num(caFinance?.recentTxns?.length, '0')}</span>
                      </h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No recent chip transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th>Time</th><th>Club</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead>
                            <tbody>
                              {(caFinance?.recentTxns || []).slice(0, 25).map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '—'}</td>
                                  <td><span className={styles.voiceTag}>{txn.transaction_type || 'unknown'}</span></td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {txn.notes || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── CLUBS ── */}
                  {caSection === 'clubs' && !caSelectedClub && (
                    caClubs.length === 0 ? (
                      <div className={styles.emptyState}>No clubs found.</div>
                    ) : (
                      <div className={styles.cardGrid}>
                        {caClubs.map((club) => (
                          <div key={club.id} className={`${styles.card} ${styles.clickableCard}`}
                            onClick={() => loadCaClubDetail(club)}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') loadCaClubDetail(club); }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 4 }}>{club.name}</div>
                            <div style={{ fontSize: 12, color: T.dim, marginBottom: 10 }}>
                              Code {club.club_id || club.code || '—'} — {num(club.member_count, '0')} members — {num(club.table_count, '0')} tables
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                              Owner {club.owner_name || '—'} — created {when(club.created_at)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{
                                background: club.status === 'active' ? T.accentSoft : T.dangerSoft,
                                color: club.status === 'active' ? T.accent : T.danger,
                                borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                              }}>{club.status || 'active'}</span>
                              <span style={{ fontSize: 11, color: T.muted }}>
                                Treasury {num(club.chip_treasury, '0')}
                              </span>
                              {/* toggleClubStatus existed in code with no button anywhere. */}
                              <button
                                className={styles.filterBtn}
                                disabled={caProcessing}
                                style={{ marginLeft: 'auto' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleClubStatus(club, club.status === 'suspended' ? 'active' : 'suspended');
                                }}
                              >
                                {club.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {caSection === 'clubs' && caSelectedClub && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        <button className={styles.filterBtn} onClick={() => { setCaSelectedClub(null); setCaClubDetail(null); }}>
                          All Clubs
                        </button>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{caSelectedClub.name}</span>
                          <span style={{ fontSize: 12, color: T.dim, marginLeft: 10 }}>
                            Code {caSelectedClub.club_id || '—'} — {num(caSelectedClub.member_count, '0')} members
                          </span>
                        </div>
                        <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                          onClick={() => loadCaClubDetail(caSelectedClub)} disabled={caLoading}>
                          Refresh
                        </button>
                      </div>

                      <div className={styles.subNav}>
                        {[
                          ['overview', 'Overview'],
                          ['members', `Members (${num(caClubDetail?.members?.length, '0')})`],
                          ['agents', `Agents (${num(caClubDetail?.agents?.length, '0')})`],
                          ['tables', `Tables (${num(caClubDetail?.tables?.length, '0')})`],
                          ['cashouts', `Cashouts (${num(caClubDetail?.pendingCashouts?.length, '0')})`],
                        ].map(([id, label]) => (
                          <button key={id} className={caClubTab === id ? styles.active : ''} onClick={() => setCaClubTab(id)}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {caLoading || !caClubDetail ? (
                        <div className={styles.loadingSpinner}>Loading Club</div>
                      ) : caClubTab === 'overview' ? (
                        <>
                          <div className={styles.kpiGrid}>
                            {[
                              ['Members', caClubDetail.members?.length],
                              ['Agents', caClubDetail.agents?.length],
                              ['Tables', caClubDetail.tables?.length],
                              ['Pending Cashouts', caClubDetail.pendingCashouts?.length],
                              ['Chips On Books', (caClubDetail.members || []).reduce((s, m) => s + (Number(m.chip_balance) || 0), 0)],
                            ].map(([label, value]) => (
                              <div key={label} className={styles.kpi}>
                                <div className={styles.kpiValue}>{num(value, '0')}</div>
                                <div className={styles.kpiLabel}>{label}</div>
                              </div>
                            ))}
                          </div>
                          <h3 className={styles.sectionTitle}>Recent Transactions</h3>
                          {(caClubDetail.recentTxns || []).length === 0 ? (
                            <div className={styles.emptyState}>No recent transactions.</div>
                          ) : (
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <thead><tr><th>Time</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead>
                                <tbody>
                                  {caClubDetail.recentTxns.map((txn, i) => (
                                    <tr key={txn.id || i}>
                                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                      <td>{txn.transaction_type || 'unknown'}</td>
                                      <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                        {signed(txn.amount)}
                                      </td>
                                      <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : caClubTab === 'members' ? (
                        (caClubDetail.members || []).length === 0 ? (
                          <div className={styles.emptyState}>No members in this club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th>Player</th><th>Role</th><th>Chips</th><th>Hands</th><th>Status</th><th>Joined</th></tr></thead>
                              <tbody>
                                {caClubDetail.members.map((m) => (
                                  // club_members has a COMPOSITE key and no id column;
                                  // the API returns row_key for exactly this reason.
                                  <tr key={m.row_key}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{m.player_name}</div>
                                      {m.email && <div style={{ fontSize: 11, color: T.muted }}>{m.email}</div>}
                                    </td>
                                    <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                    <td style={{ fontWeight: 600, color: T.accent }}>{num(m.chip_balance, '0')}</td>
                                    <td>{num(m.hands_played, '0')}</td>
                                    <td style={{ color: m.status === 'active' ? T.accent : T.dim }}>{m.status || '—'}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : caClubTab === 'agents' ? (
                        (caClubDetail.agents || []).length === 0 ? (
                          <div className={styles.emptyState}>No agents in this club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th>Agent</th><th>Role</th><th>Commission</th><th>Credit Used</th><th>Players</th><th>Status</th></tr></thead>
                              <tbody>
                                {caClubDetail.agents.map((a) => (
                                  <tr key={a.id}>
                                    <td style={{ fontWeight: 600 }}>{a.player_name}</td>
                                    <td><span className={styles.voiceTag}>{a.role || 'agent'}</span></td>
                                    <td>{a.commission_rate !== null && a.commission_rate !== undefined
                                      ? `${(Number(a.commission_rate) * 100).toFixed(0)}%` : '—'}</td>
                                    <td>{num(a.credit_used, '0')} / {num(a.credit_limit, '0')}</td>
                                    <td>{num(a.total_players, '0')}</td>
                                    <td style={{ color: a.status === 'active' ? T.accent : T.dim }}>{a.status || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : caClubTab === 'tables' ? (
                        (caClubDetail.tables || []).length === 0 ? (
                          <div className={styles.emptyState}>No tables in this club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th>Table</th><th>Game</th><th>Stakes</th><th>Seats</th><th>Status</th><th>Created</th></tr></thead>
                              <tbody>
                                {caClubDetail.tables.map((t) => (
                                  <tr key={t.id}>
                                    <td style={{ fontWeight: 600 }}>{t.name || `Table ${String(t.id).slice(0, 8)}`}</td>
                                    <td>{t.game_type || '—'}</td>
                                    <td>{t.stakes || '—'}</td>
                                    {/* max_players, not max_seats — the old query 42703'd on this column. */}
                                    <td>{num(t.current_players, '0')} / {num(t.max_players)}</td>
                                    <td style={{ color: ['running', 'active'].includes(t.status) ? T.accent : T.dim }}>
                                      {t.status || 'inactive'}
                                    </td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(t.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        (caClubDetail.pendingCashouts || []).length === 0 ? (
                          <div className={styles.emptyState}>No pending cashouts for this club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th>Player</th><th>Amount</th><th>Requested</th><th>Note</th><th>Action</th></tr></thead>
                              <tbody>
                                {caClubDetail.pendingCashouts.map((c) => (
                                  <tr key={c.id}>
                                    <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                    <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || c.player_note || '—'}</td>
                                    <td>
                                      <button className={styles.filterBtn} disabled={caProcessing}
                                        onClick={() => forceCashoutApprove(c)}>
                                        Force Approve
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </>
                  )}

                  {/* ── FINANCE ── (caFinance and caPendingCashouts had no UI at all) */}
                  {caSection === 'finance' && (
                    <>
                      <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.accent }}>{num(caFinance?.totalMinted24h)}</div>
                          <div className={styles.kpiLabel}>Chips Minted (24h)</div>
                        </div>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caFinance?.pendingCashoutTotal)}</div>
                          <div className={styles.kpiLabel}>Pending Cashout Total</div>
                        </div>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue}>{num(caPendingCashouts.length, '0')}</div>
                          <div className={styles.kpiLabel}>Cashout Requests</div>
                        </div>
                      </div>

                      <h3 className={styles.sectionTitle}>
                        Pending Cashouts
                        {caPendingCashouts.length > 0 && (
                          <span className={`${styles.countPill} ${styles.warnPill}`}>{caPendingCashouts.length}</span>
                        )}
                      </h3>
                      {caPendingCashouts.length === 0 ? (
                        <div className={styles.emptyState}>No pending cashouts anywhere on the platform.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th>Club</th><th>Player</th><th>Amount</th><th>Requested</th><th>Note</th><th>Action</th></tr></thead>
                            <tbody>
                              {caPendingCashouts.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.club_name || '—'}</td>
                                  <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                  <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.agent_note || c.player_note || '—'}
                                  </td>
                                  <td>
                                    <button className={styles.filterBtn} disabled={caProcessing}
                                      onClick={() => forceCashoutApprove(c)}>
                                      Force Approve
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <h3 className={styles.sectionTitle}>Recent Chip Movement</h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No recent transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper} style={{ maxHeight: 420, overflowY: 'auto' }}>
                          <table className={styles.table}>
                            <thead><tr><th>Time</th><th>Club</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead>
                            <tbody>
                              {caFinance.recentTxns.map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '—'}</td>
                                  <td>{txn.transaction_type || 'unknown'}</td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── USERS ── (searchCaUsers and loadCaUserDetail were unreachable) */}
                  {caSection === 'users' && (
                    <>
                      <form
                        onSubmit={(e) => { e.preventDefault(); searchCaUsers(caUserSearch); }}
                        style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
                      >
                        <input
                          type="search" value={caUserSearch}
                          onChange={(e) => setCaUserSearch(e.target.value)}
                          placeholder="Search by name, username, email or player number"
                          className={styles.searchInput}
                          style={{ flex: 1, minWidth: 240 }}
                          aria-label="Search players"
                        />
                        <button type="submit" className={styles.actionBtn} disabled={caUserSearching}>
                          {caUserSearching ? 'Searching' : 'Search'}
                        </button>
                      </form>

                      {caSelectedUser ? (
                        <>
                          <button className={styles.filterBtn} style={{ marginBottom: 16 }}
                            onClick={() => setCaSelectedUser(null)}>Back To Results</button>
                          <div className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 17, color: T.text }}>
                              {caSelectedUser.profile?.display_name || caSelectedUser.display_name || 'Unknown'}
                            </div>
                            <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
                              @{caSelectedUser.profile?.username || caSelectedUser.username || 'unknown'}
                              {' — '}{caSelectedUser.profile?.email || caSelectedUser.email || 'no email'}
                              {' — '}player #{num(caSelectedUser.profile?.player_number ?? caSelectedUser.player_number)}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                              Role {caSelectedUser.profile?.role || caSelectedUser.role || 'user'}
                              {' — '}diamonds {num(caSelectedUser.profile?.diamonds ?? caSelectedUser.diamonds)}
                              {' — '}joined {when(caSelectedUser.profile?.created_at || caSelectedUser.created_at)}
                            </div>
                          </div>

                          {caSelectedUser.loading ? (
                            <div className={styles.loadingSpinner}>Loading Player</div>
                          ) : (
                            <>
                              <h3 className={styles.sectionTitle}>
                                Club Memberships
                                <span className={styles.countPill}>{num(caSelectedUser.memberships?.length, '0')}</span>
                              </h3>
                              {(caSelectedUser.memberships || []).length === 0 ? (
                                <div className={styles.emptyState}>Not a member of any club.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th>Club</th><th>Role</th><th>Chips</th><th>Hands</th><th>Status</th><th>Joined</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.memberships.map((m) => (
                                        <tr key={m.row_key}>
                                          <td>{m.club_name || '—'} <span style={{ color: T.muted, fontSize: 11 }}>{m.club_code || ''}</span></td>
                                          <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                          <td style={{ color: T.accent, fontWeight: 600 }}>{num(m.chip_balance, '0')}</td>
                                          <td>{num(m.hands_played, '0')}</td>
                                          <td>{m.status || '—'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Chip Transactions</h3>
                              {(caSelectedUser.txns || []).length === 0 ? (
                                <div className={styles.emptyState}>No chip transactions.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th>Time</th><th>Club</th><th>Direction</th><th>Type</th><th>Amount</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.txns.map((t, i) => (
                                        <tr key={t.id || i}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(t.created_at, true)}</td>
                                          <td>{t.club_name || '—'}</td>
                                          <td style={{ color: t.direction === 'in' ? T.accent : T.danger }}>
                                            {t.direction === 'in' ? 'Received' : 'Sent'}
                                          </td>
                                          <td>{t.transaction_type || 'unknown'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(t.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Cashout History</h3>
                              {(caSelectedUser.cashouts || []).length === 0 ? (
                                <div className={styles.emptyState}>No cashout requests.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th>Time</th><th>Club</th><th>Amount</th><th>Status</th><th>Note</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.cashouts.map((c) => (
                                        <tr key={c.id}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(c.created_at, true)}</td>
                                          <td>{c.club_name || '—'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(c.amount)}</td>
                                          <td style={{ color: c.status === 'pending' ? T.warn : T.dim }}>{c.status || '—'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : caUserResults.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caUserSearch.trim().length >= 2 && !caUserSearching
                            ? 'No players match that search.'
                            : 'Search for a player to inspect their clubs, chips and cashouts.'}
                        </div>
                      ) : (
                        <div className={styles.cardGrid}>
                          {caUserResults.map((u) => (
                            <div key={u.id} className={`${styles.card} ${styles.clickableCard}`}
                              onClick={() => loadCaUserDetail(u)}
                              role="button" tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') loadCaUserDetail(u); }}
                            >
                              <div style={{ fontWeight: 700, color: T.text }}>{u.display_name || u.username || 'Unknown'}</div>
                              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{u.email || 'no email'}</div>
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                                Player #{num(u.player_number)} — {u.role || 'user'}
                                {u.is_vip ? ` — ${u.vip_tier || 'VIP'}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── UNIONS ── (caUnions was loaded and never rendered) */}
                  {caSection === 'unions' && (
                    caUnions.length === 0 ? (
                      <div className={styles.emptyState}>No unions found.</div>
                    ) : (
                      <div className={styles.cardGrid}>
                        {caUnions.map((u) => (
                          <div key={u.id} className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{u.name}</div>
                            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
                              Code {u.union_code || u.code || '—'}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
                              {num(u.club_count, '0')} clubs — {num(u.member_count, '0')} members
                            </div>
                            <div style={{ fontSize: 12, color: T.accent, marginTop: 4 }}>
                              Chip balance {num(u.chip_balance, '0')}
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Created {when(u.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* ── APPROVALS ── */}
                  {caSection === 'approvals' && (
                    <>
                      <h3 className={styles.sectionTitle}>
                        Union Applications
                        {pendingAppCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingAppCount} pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caAppTab === f ? styles.active : ''}`}
                            onClick={() => { setCaAppTab(f); loadApplications(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadApplications(caAppTab)} disabled={caAppLoading}>
                          Refresh
                        </button>
                      </div>

                      {caAppLoading ? (
                        <div className={styles.loadingSpinner}>Loading Applications</div>
                      ) : caApplications.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caAppTab === 'pending' ? 'No pending applications.' : 'No applications found.'}
                        </div>
                      ) : caApplications.map((app) => (
                        <div key={app.id} className={styles.card} style={{
                          borderColor: app.status === 'pending' ? 'rgba(255,215,0,0.3)' : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{app.club_name}</span>
                            <span style={{ fontSize: 12, color: T.dim }}>Club {app.club_code}</span>
                            <span style={{
                              background: app.status === 'pending' ? T.warnSoft : app.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: app.status === 'pending' ? T.warn : app.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{app.status || 'unknown'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim }}>
                            {num(app.member_count, '0')} members — applied {when(app.applied_at)}
                            {app.profiles?.display_name && <> — owner <strong style={{ color: T.text }}>{app.profiles.display_name}</strong></>}
                            {app.profiles?.email && <> ({app.profiles.email})</>}
                          </div>
                          {app.message && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.accent}`, fontStyle: 'italic',
                            }}>{app.message}</div>
                          )}
                          {app.review_note && (
                            <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>Review note: {app.review_note}</div>
                          )}
                          {app.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                              <label style={{ fontSize: 12, color: T.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Commission %
                                <input
                                  type="number" min="0" max="100" step="1"
                                  value={caAppCommission[app.id] ?? '90'}
                                  onChange={(e) => setCaAppCommission((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                  style={{
                                    width: 64, background: T.inset, border: `1px solid ${T.line}`,
                                    borderRadius: 6, color: T.text, fontSize: 13, padding: '5px 8px', textAlign: 'center',
                                  }}
                                />
                              </label>
                              <button className={styles.btnSuccess} disabled={caProcessing}
                                onClick={() => reviewApplication(app, 'approve')}>
                                Approve And Add To Union
                              </button>
                              <input
                                placeholder="Rejection reason (optional)" value={caAppReason}
                                onChange={(e) => setCaAppReason(e.target.value)}
                                style={{
                                  flex: 1, minWidth: 180, background: T.inset, border: `1px solid ${T.line}`,
                                  borderRadius: 6, color: T.text, fontSize: 12, padding: '7px 10px',
                                }}
                              />
                              <button className={styles.btnDanger} disabled={caProcessing}
                                onClick={() => reviewApplication(app, 'reject')}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      <h3 className={styles.sectionTitle}>
                        Union Leave Requests
                        {pendingLeaveCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingLeaveCount} pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caLeaveTab === f ? styles.active : ''}`}
                            onClick={() => { setCaLeaveTab(f); loadLeaveRequests(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadLeaveRequests(caLeaveTab)} disabled={caLeaveLoading}>
                          Refresh
                        </button>
                      </div>

                      {caLeaveLoading ? (
                        <div className={styles.loadingSpinner}>Loading Leave Requests</div>
                      ) : caLeaveRequests.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caLeaveTab === 'pending' ? 'No pending leave requests.' : 'No leave requests found.'}
                        </div>
                      ) : caLeaveRequests.map((req) => (
                        <div key={req.id} className={styles.card} style={{
                          borderColor: req.status === 'pending' ? 'rgba(255,215,0,0.3)' : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{req.club_name}</span>
                            {req.club_code && <span style={{ fontSize: 12, color: T.dim }}>Club {req.club_code}</span>}
                            <span style={{
                              background: req.status === 'pending' ? T.warnSoft : req.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: req.status === 'pending' ? T.warn : req.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{req.status || 'unknown'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim }}>
                            Requested {when(req.requested_at)}
                            {req.profiles?.display_name && <> — owner <strong style={{ color: T.text }}>{req.profiles.display_name}</strong></>}
                            {req.unions?.name && <> — union <strong style={{ color: T.text }}>{req.unions.name}</strong></>}
                          </div>
                          {req.reason && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.warn}`, fontStyle: 'italic',
                            }}>{req.reason}</div>
                          )}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                              <button className={styles.btnSuccess} disabled={caProcessing}
                                onClick={() => reviewLeaveRequest(req, 'approve')}>
                                Approve And Remove From Union
                              </button>
                              <button className={styles.btnDanger} disabled={caProcessing}
                                onClick={() => reviewLeaveRequest(req, 'deny')}>
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── GEEVES KB ─────────────────────────── */}
          {activeTab === 'geeves' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Geeves Knowledge Base</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    Questions that fell through to Grok. Add them to the KB to make Geeves smarter.
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadGeevesAnalytics} disabled={geevesLoading}>
                  {geevesLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              {geevesError ? (
                <div className={styles.errorState}>
                  <div>Geeves analytics unavailable: {geevesError}</div>
                  <button className={styles.actionBtn} onClick={loadGeevesAnalytics}>Retry</button>
                </div>
              ) : (
                <>
                  {geevesAnalytics.summary && (
                    <div className={styles.kpiGrid}>
                      {[
                        ['Missed This Week', geevesAnalytics.summary.missedThisWeek, T.danger],
                        ['Resolved This Week', geevesAnalytics.summary.resolvedThisWeek, T.accent],
                        ['Total Added To KB', geevesAnalytics.summary.totalAddedToKB, T.accent],
                        ['Cache Answers Served', geevesAnalytics.summary.cacheAnswersServedThisWeek, T.warn],
                        ['Avg Cache Rating', geevesAnalytics.summary.avgCacheRating
                          ? `${geevesAnalytics.summary.avgCacheRating} / 5` : null, T.info],
                      ].map(([label, value, color]) => (
                        <div key={label} className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color }}>
                            {typeof value === 'string' ? value : num(value)}
                          </div>
                          <div className={styles.kpiLabel}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {geevesLoading ? (
                    <div className={styles.loadingSpinner}>Loading Geeves Analytics</div>
                  ) : geevesAnalytics.questions.length === 0 ? (
                    <div className={styles.emptyState}>
                      No unanswered questions. Geeves is handling everything locally.
                    </div>
                  ) : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th>Question</th><th>Page</th><th>Asked</th><th>Last Asked</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                          {geevesAnalytics.questions.map((q) => (
                            <tr key={q.id}>
                              <td style={{ maxWidth: 360, wordBreak: 'break-word' }}>
                                <div>{q.question}</div>
                                {q.grok_answer && (
                                  <details style={{ marginTop: 4 }}>
                                    <summary style={{ fontSize: 11, color: T.accent, cursor: 'pointer' }}>View Grok answer</summary>
                                    <div style={{
                                      fontSize: 12, color: T.dim, marginTop: 6, lineHeight: 1.5,
                                      maxHeight: 140, overflowY: 'auto', background: T.inset,
                                      padding: '8px 10px', borderRadius: 6,
                                    }}>{q.grok_answer}</div>
                                  </details>
                                )}
                              </td>
                              <td style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>
                                {q.page ? q.page.replace('/hub/', '') : '—'}
                              </td>
                              <td style={{
                                fontWeight: 700, textAlign: 'center',
                                color: q.asked_count >= 5 ? T.danger : T.warn,
                              }}>{num(q.asked_count, '0')}</td>
                              <td style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>{when(q.last_asked)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button className={styles.filterBtn} style={{ marginRight: 6 }}
                                  onClick={() => markGeevesQuestionResolved(q.id, true)}
                                  disabled={geevesMarkingId === q.id}>
                                  {geevesMarkingId === q.id ? 'Saving' : 'Added To KB'}
                                </button>
                                <button className={styles.filterBtn}
                                  onClick={() => markGeevesQuestionResolved(q.id, false)}
                                  disabled={geevesMarkingId === q.id}>
                                  Dismiss
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── REVIEWS ───────────────────────────── */}
          {activeTab === 'reviews' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Venue Review Moderation</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    Every player-submitted venue review on the platform.
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadAdminReviews} disabled={reviewsLoading}>
                  {reviewsLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              <div className={styles.kpiGrid}>
                {[
                  ['Total Reviews', reviewsStats.total, T.info],
                  ['Flagged', reviewsStats.flagged, T.warn],
                  ['Avg Rating', reviewsStats.avg_rating !== null && reviewsStats.avg_rating !== undefined
                    ? Number(reviewsStats.avg_rating).toFixed(1) : null, T.accent],
                  ['Showing', visibleReviews.length, T.accent],
                ].map(([label, value, color]) => (
                  <div key={label} className={styles.kpi}>
                    <div className={styles.kpiValue} style={{ color }}>
                      {typeof value === 'string' ? value : num(value)}
                    </div>
                    <div className={styles.kpiLabel}>{label}</div>
                  </div>
                ))}
              </div>
              {reviewsStats.avg_rating_sampled && (
                <div className={styles.warnBanner}>
                  The average rating is sampled, not exact — the review table is larger than the sample cap.
                </div>
              )}

              <div className={styles.filterBar}>
                <select value={reviewsFilter} onChange={(e) => setReviewsFilter(e.target.value)}
                  className={styles.filterSelect} aria-label="Sort reviews">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                  <option value="flagged">Flagged First</option>
                </select>
                <select value={reviewsRatingFilter} onChange={(e) => setReviewsRatingFilter(e.target.value)}
                  className={styles.filterSelect} aria-label="Filter by rating">
                  <option value="all">All Ratings</option>
                  {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} {r === 1 ? 'Star' : 'Stars'}</option>)}
                </select>
                <button className={`${styles.filterBtn} ${reviewsFlaggedOnly ? styles.active : ''}`}
                  onClick={() => setReviewsFlaggedOnly((f) => !f)}>
                  Flagged Only
                </button>
                <input
                  type="search" value={reviewsSearch} onChange={(e) => setReviewsSearch(e.target.value)}
                  placeholder="Search reviewer, venue or text" className={styles.searchInput}
                  style={{ flex: 1, minWidth: 200 }} aria-label="Search reviews"
                />
              </div>

              {reviewsError ? (
                <div className={styles.errorState}>
                  <div>Reviews unavailable: {reviewsError}</div>
                  <button className={styles.actionBtn} onClick={loadAdminReviews}>Retry</button>
                </div>
              ) : reviewsLoading ? (
                <div className={styles.loadingSpinner}>Loading Reviews</div>
              ) : visibleReviews.length === 0 ? (
                <div className={styles.emptyState}>No reviews match the current filters.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visibleReviews.map((review) => (
                    <div key={review.id} className={styles.card} style={{
                      background: review.is_flagged ? T.warnSoft : undefined,
                      borderColor: review.is_flagged ? 'rgba(255,215,0,0.3)' : T.line,
                    }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
                              {review.reviewer_name || 'Anonymous'}
                            </span>
                            {review.is_flagged && (
                              <span style={{
                                background: T.warnSoft, color: T.warn, fontSize: 11,
                                padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                              }}>FLAGGED</span>
                            )}
                            {review.metadata?.verified_player && (
                              <span style={{
                                background: T.accentSoft, color: T.accent, fontSize: 11,
                                padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                              }}>Verified Player</span>
                            )}
                            <span style={{ color: T.warn, fontSize: 13, letterSpacing: 1 }}>
                              {'*'.repeat(Math.max(0, Math.min(5, review.rating || 0)))}
                              <span style={{ color: T.muted }}>
                                {'*'.repeat(Math.max(0, 5 - (review.rating || 0)))}
                              </span>
                            </span>
                            <span style={{ color: T.muted, fontSize: 12, marginLeft: 'auto' }}>{when(review.created_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim, marginBottom: 6 }}>
                            {review.venue_name || review.venue_id || 'Unknown venue'}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: T.dim, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {review.review_text}
                          </p>
                          {review.flag_reason && (
                            <div style={{
                              marginTop: 6, fontSize: 12, color: T.warn,
                              background: T.warnSoft, padding: '4px 10px', borderRadius: 6,
                            }}>Flag reason: {review.flag_reason}</div>
                          )}
                          <div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>
                            Helpful {num(review.helpful_count, '0')} — Unhelpful {num(review.unhelpful_count, '0')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button className={styles.filterBtn} disabled={reviewsProcessing}
                            onClick={() => handleFlagReview(review.id, review.is_flagged ? 'unflag' : 'flag')}>
                            {review.is_flagged ? 'Unflag' : 'Flag'}
                          </button>
                          <button
                            className={reviewsDeleteConfirm === review.id ? styles.btnDanger : styles.filterBtn}
                            disabled={reviewsProcessing}
                            onClick={() => handleDeleteReview(review.id)}
                          >
                            {reviewsDeleteConfirm === review.id ? 'Confirm Delete' : 'Delete'}
                          </button>
                          {reviewsDeleteConfirm === review.id && (
                            <button className={styles.filterBtn} onClick={() => setReviewsDeleteConfirm(null)}>Cancel</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────── SCRAPER HEALTH ────────────────────── */}
          {activeTab === 'scrapers' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Scraper Health</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    {/* The old copy hardcoded "all 9 daemons". */}
                    Status of the data collection daemons. Auto-refreshes every 60 seconds.
                    {scraperHealthLastFetch && (
                      <span style={{ marginLeft: 8, color: T.muted }}>
                        Last fetched {scraperHealthLastFetch.toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadScraperHealth} disabled={scraperHealthLoading}>
                  {scraperHealthLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              {scraperHealthError ? (
                <div className={styles.errorState}>
                  <div>Scraper health unavailable: {scraperHealthError}</div>
                  <button className={styles.actionBtn} onClick={loadScraperHealth}>Retry</button>
                </div>
              ) : scraperHealthLoading && !scraperHealth ? (
                <div className={styles.loadingSpinner}>Loading Scraper Status</div>
              ) : !scraperHealth ? (
                <div className={styles.emptyState}>No scraper data available.</div>
              ) : (
                <>
                  {scraperHealth.notice && <div className={styles.warnBanner}>{scraperHealth.notice}</div>}

                  {/* Optional chaining throughout: `scraperHealth.summary.deadCount`
                      with no guard used to crash the entire page, not just this tab. */}
                  {scraperHealth.summary && (
                    <div className={styles.kpiGrid}>
                      {[
                        ['Healthy', scraperHealth.summary.healthyCount, T.accent],
                        ['Warning', scraperHealth.summary.warningCount, T.warn],
                        ['Dead', scraperHealth.summary.deadCount, T.danger],
                        ['Unknown', scraperHealth.summary.unknownCount, T.muted],
                        ['Supabase Data', scraperHealth.summary.dataFresh ? 'Fresh' : 'Stale',
                          scraperHealth.summary.dataFresh ? T.accent : T.danger],
                      ].map(([label, value, color]) => (
                        <div key={label} className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color }}>
                            {typeof value === 'string' ? value : num(value)}
                          </div>
                          <div className={styles.kpiLabel}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(scraperHealth.daemons || []).length === 0 ? (
                    <div className={styles.emptyState}>No daemons registered.</div>
                  ) : (
                    <div className={styles.cardGrid}>
                      {scraperHealth.daemons.map((daemon) => {
                        const color = {
                          healthy: T.accent, warning: T.warn, dead: T.danger, unknown: T.muted,
                        }[daemon.status] || T.muted;
                        const hb = daemon.heartbeat;
                        return (
                          <div key={daemon.id} className={styles.card} style={{ borderLeft: `4px solid ${color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                              <div>
                                <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{daemon.label}</div>
                                <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                                  {daemon.type ? `${daemon.type} — ` : ''}interval {daemon.interval || 'unknown'}
                                </div>
                              </div>
                              <span style={{
                                background: `${color}22`, color, border: `1px solid ${color}`,
                                borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                                whiteSpace: 'nowrap', textTransform: 'capitalize',
                              }}>{daemon.status || 'unknown'}</span>
                            </div>

                            {hb ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 13 }}>
                                {[
                                  ['Status', hb.daemonStatus],
                                  ['PID', hb.pid],
                                  ['Cycle', hb.cycle !== undefined ? `#${hb.cycle}` : undefined],
                                  ['Records Saved', hb.recordsSaved !== undefined ? num(hb.recordsSaved) : undefined],
                                  ['Venues', hb.venuesWithData],
                                  ['Progress', hb.progress],
                                  ['Errors', hb.errors],
                                  ['Last Duration', hb.durationSeconds !== undefined ? `${Math.round(hb.durationSeconds)}s` : undefined],
                                  ['Heartbeat Age', hb.staleMinutes !== undefined ? `${hb.staleMinutes}m ago` : undefined],
                                ].filter(([, v]) => v !== undefined && v !== null).map(([label, value]) => (
                                  <React.Fragment key={label}>
                                    <div style={{ color: T.dim }}>{label}</div>
                                    <div style={{
                                      color: (label === 'Errors' && Number(value) > 0)
                                        || (label === 'Heartbeat Age' && hb.staleMinutes > 25) ? T.danger : T.text,
                                      fontWeight: 600, textAlign: 'right',
                                    }}>{value}</div>
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>
                                No heartbeat published. This daemon may be interval-based or not running.
                              </div>
                            )}

                            {daemon.database?.staleMinutes !== null && daemon.database?.staleMinutes !== undefined && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: 12 }}>
                                <span style={{ color: T.dim }}>Database data age: </span>
                                <span style={{
                                  color: daemon.database.staleMinutes > 25 ? T.danger : T.accent, fontWeight: 600,
                                }}>{daemon.database.staleMinutes}m</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>

        {/* ─────────────────────────── CREATE / EDIT HORSE ──────────────────── */}
        {showCreateModal && (
          <div
            className={styles.modalOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
            role="dialog" aria-modal="true" aria-label={editingPersona ? 'Edit horse' : 'New horse'}
          >
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>{editingPersona ? `Edit ${editingPersona.name}` : 'New Horse'}</h2>
                <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)} aria-label="Close">
                  Close
                </button>
              </div>
              <form onSubmit={handleSavePersona}>
                <div className={styles.formGroup}>
                  <label htmlFor="p-name">Name</label>
                  <input id="p-name" type="text" required placeholder="Johnny Sticks"
                    value={personaForm.name}
                    onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })} />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="p-gender">Gender</label>
                    <select id="p-gender" value={personaForm.gender}
                      onChange={(e) => setPersonaForm({ ...personaForm, gender: e.target.value })}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="p-location">Location</label>
                    <input id="p-location" type="text" required placeholder="Austin, TX"
                      value={personaForm.location}
                      onChange={(e) => setPersonaForm({ ...personaForm, location: e.target.value })} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="p-bio">Bio</label>
                  <textarea id="p-bio" rows="3" required placeholder="Brief backstory"
                    value={personaForm.bio}
                    onChange={(e) => setPersonaForm({ ...personaForm, bio: e.target.value })} />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="p-specialty">Specialty</label>
                    <select id="p-specialty" value={personaForm.specialty}
                      onChange={(e) => setPersonaForm({ ...personaForm, specialty: e.target.value })}>
                      {SPECIALTIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="p-stakes">Stakes</label>
                    <input id="p-stakes" type="text" required placeholder="2/5 NLH"
                      value={personaForm.stakes}
                      onChange={(e) => setPersonaForm({ ...personaForm, stakes: e.target.value })} />
                  </div>
                </div>
                {/* The voice field is part of the record and is shown on every
                    card, but the create form never asked for it. */}
                <div className={styles.formGroup}>
                  <label htmlFor="p-voice">Voice</label>
                  <select id="p-voice" value={personaForm.voice}
                    onChange={(e) => setPersonaForm({ ...personaForm, voice: e.target.value })}>
                    {VOICES.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className={styles.formActions}>
                  <button type="button" className={styles.btnCancel} onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnSubmit} disabled={savingPersona}>
                    {savingPersona ? 'Saving' : editingPersona ? 'Save Changes' : 'Stable Horse'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
