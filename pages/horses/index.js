/**
 * 🐴 HORSES ADMIN PAGE
 * Integrated into hub-vanguard Next.js app at /horses
 */

import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { eventBus, EventType } from '../../src/engine/EventBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import PokerBrainLaunchButton from '../../src/components/poker-brain/LaunchButton';
import styles from './horses.module.css';

// Sync Channel Name
const SYNC_CHANNEL = 'horses-admin-sync';

// Demo personas for development
const DEMO_PERSONAS = [
  {
    id: 1,
    name: 'Marcus Chen',
    alias: 'VegasGrinder85',
    gender: 'male',
    location: 'Las Vegas, NV',
    specialty: 'cash_games',
    stakes: '2/5 NLH',
    bio: 'Started playing in underground LA games in 2008. Now a full-time 2/5 grinder at the Bellagio.',
    voice: 'analytical',
    is_active: true,
  },
  {
    id: 2,
    name: 'Sarah Mitchell',
    alias: 'TexasQueen92',
    gender: 'female',
    location: 'Austin, TX',
    specialty: 'tournaments',
    stakes: '$200-$500 MTTs',
    bio: 'Former accountant who discovered poker during COVID. Cashed in 12 WSOP Circuit events.',
    voice: 'enthusiastic',
    is_active: true,
  },
  {
    id: 3,
    name: 'Derek Williams',
    alias: 'LANitOwl',
    gender: 'male',
    location: 'Los Angeles, CA',
    specialty: 'high_stakes',
    stakes: '5/10+ PLO',
    bio: '15-year veteran of the Commerce Casino. Specializes in mixed games and PLO.',
    voice: 'experienced',
    is_active: true,
  },
  {
    id: 4,
    name: 'Jennifer Park',
    alias: 'SeattleSolver',
    gender: 'female',
    location: 'Seattle, WA',
    specialty: 'gto',
    stakes: 'Online NL200',
    bio: 'Software engineer by day, GTO nerd by night. Runs solver analysis for study groups.',
    voice: 'technical',
    is_active: false,
  },
  {
    id: 5,
    name: 'Michael Torres',
    alias: 'MiamiMike305',
    gender: 'male',
    location: 'Miami, FL',
    specialty: 'live_reads',
    stakes: '1/3 to 5/10',
    bio: 'Cuban-American poker pro who learned the game in Hialeah home games.',
    voice: 'street_smart',
    is_active: true,
  },
  {
    id: 6,
    name: 'Ashley Rivera',
    alias: 'ChipQueenATL',
    gender: 'female',
    location: 'Atlanta, GA',
    specialty: 'tournaments',
    stakes: '$100-$300 MTTs',
    bio: 'Started with homegame Wednesdays. Now chasing bracelets full-time.',
    voice: 'passionate',
    is_active: true,
  },
  {
    id: 7,
    name: "James O'Connor",
    alias: 'BostonJim77',
    gender: 'male',
    location: 'Boston, MA',
    specialty: 'cash_games',
    stakes: '1/2 to 2/5',
    bio: 'Retired firefighter who plays 40 hours a week at the local card room.',
    voice: 'experienced',
    is_active: true,
  },
  {
    id: 8,
    name: 'David Kim',
    alias: 'SFBayGrinder',
    gender: 'male',
    location: 'San Francisco, CA',
    specialty: 'online',
    stakes: 'NL100-NL500',
    bio: 'Tech worker by day, online grinder by night. Runs a Discord study group.',
    voice: 'analytical',
    is_active: true,
  },
];

export default function HorsesAdmin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stable');
  // Scraper Health state
  const [scraperHealth, setScraperHealth] = useState(null);
  const [scraperHealthLoading, setScraperHealthLoading] = useState(false);
  const [scraperHealthLastFetch, setScraperHealthLastFetch] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [settings, setSettings] = useState({
    posts_per_day: 20,
    min_delay_minutes: 30,
    max_delay_minutes: 120,
    ai_model: 'gpt-4o',
    temperature: 0.8,
    engine_enabled: true,
    auto_publish: true,
    peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  });
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [abuseLoaded, setAbuseLoaded] = useState(false);
  const [economyLoaded, setEconomyLoaded] = useState(false);
  // Club Arena admin state
  const [caLoaded, setCaLoaded] = useState(false);
  const [caLoading, setCaLoading] = useState(false);
  const [caSection, setCaSection] = useState('overview'); // top-level section
  // Overview stats
  const [caStats, setCaStats] = useState(null);
  // Clubs
  const [caClubs, setCaClubs] = useState([]);
  const [caSelectedClub, setCaSelectedClub] = useState(null);
  const [caClubDetail, setCaClubDetail] = useState(null); // { members, agents, tables, pending_cashouts, flags, sessions }
  const [caClubSubTab, setCaClubSubTab] = useState('overview');
  // Finance
  const [caFinance, setCaFinance] = useState(null);
  const [caPendingCashouts, setCaPendingCashouts] = useState([]);
  // Users
  const [caUserSearch, setCaUserSearch] = useState('');
  const [caUserResults, setCaUserResults] = useState([]);
  const [caUserSearching, setCaUserSearching] = useState(false);
  const [caSelectedUser, setCaSelectedUser] = useState(null);
  // Unions
  const [caUnions, setCaUnions] = useState([]);
  // Union Applications
  const [caApplications, setCaApplications] = useState([]);
  const [caAppLoading, setCaAppLoading] = useState(false);
  const [caAppTab, setCaAppTab] = useState('pending'); // 'pending' | 'all'
  const [caAppCommission, setCaAppCommission] = useState({}); // { [appId]: '90' }
  const [caAppReason, setCaAppReason] = useState(''); // rejection reason text
  // Union Leave Requests
  const [caLeaveRequests, setCaLeaveRequests] = useState([]);
  const [caLeaveLoading, setCaLeaveLoading] = useState(false);
  const [caLeaveTab, setCaLeaveTab] = useState('pending'); // 'pending' | 'all'
  // Club detail sub-tab and anti-cheat data
  const [caTab, setCaTab] = useState('overview');
  // Processing
  const [caProcessing, setCaProcessing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  // Geeves Analytics State
  const [geevesAnalytics, setGeevesAnalytics] = useState({ summary: null, questions: [] });
  const [geevesAnalyticsLoaded, setGeevesAnalyticsLoaded] = useState(false);
  const [geevesAnalyticsLoading, setGeevesAnalyticsLoading] = useState(false);
  const [geevesMarkingId, setGeevesMarkingId] = useState(null);

  // ── EventBus Listeners — Geeves real-time updates ──
  // When a new question is missed (answered by Grok anywhere on the platform),
  // this handler live-appends it to the Geeves KB tab so admins see it instantly.
  useEffect(() => {
    // GEEVES_QUESTION_MISSED: live-append new missed questions to the table
    const unsubMissed = eventBus.on(EventType.GEEVES_QUESTION_MISSED, (event) => {
      const { question, page } = event.payload;
      if (!question) return;
      setGeevesAnalytics(prev => {
        // Don't duplicate if already in the list
        const exists = prev.questions.some(q => q.question === question);
        if (exists) {
          return {
            ...prev,
            questions: prev.questions.map(q =>
              q.question === question
                ? { ...q, asked_count: (q.asked_count || 1) + 1, last_asked: new Date().toISOString() }
                : q
            ),
          };
        }
        return {
          ...prev,
          questions: [
            {
              id: `live-${Date.now()}`,
              question,
              page: page || null,
              asked_count: 1,
              last_asked: new Date().toISOString(),
              grok_answer: null,
            },
            ...prev.questions,
          ],
        };
      });
    });

    // GEEVES_KB_UPDATED: remove question from list when marked resolved from another context
    const unsubKB = eventBus.on(EventType.GEEVES_KB_UPDATED, (event) => {
      const { questionId } = event.payload;
      if (!questionId) return;
      setGeevesAnalytics(prev => ({
        ...prev,
        questions: prev.questions.filter(q => q.id !== questionId),
      }));
    });

    return () => {
      unsubMissed();
      unsubKB();
    };
  }, []);

  // Promo Code State
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: '',
    description: '',
    type: 'signup_bonus',
    value: 100,
    maxUses: '',
    expiresAt: '',
  });

  // Economy State
  const [economyData, setEconomyData] = useState(null);
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economyError, setEconomyError] = useState(null);
  const [promoCreating, setPromoCreating] = useState(false);

  // Anti-Abuse State
  const [abuseData, setAbuseData] = useState(null);
  const [abuseLoading, setAbuseLoading] = useState(false);
  const [abuseError, setAbuseError] = useState(null);
  const [newPersona, setNewPersona] = useState({
    name: '',
    gender: 'male',
    location: '',
    specialty: 'cash_games',
    stakes: '',
    bio: '',
    voice: 'casual',
  });

  // Review Moderation State
  const [reviewsData, setReviewsData] = useState([]);
  const [reviewsStats, setReviewsStats] = useState({ total: 0, flagged: 0, avg_rating: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsFilter, setReviewsFilter] = useState('newest');
  const [reviewsRatingFilter, setReviewsRatingFilter] = useState('all');
  const [reviewsFlaggedOnly, setReviewsFlaggedOnly] = useState(false);
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [reviewsDeleteConfirm, setReviewsDeleteConfirm] = useState(null); // review id pending confirm
  const [reviewsProcessing, setReviewsProcessing] = useState(false);

  // Grinder State
  const [grinderData, setGrinderData] = useState(null);
  const [grinderLoading, setGrinderLoading] = useState(false);

  useEffect(() => {
    const _c = new AbortController();

    checkAuth();
    return () => _c.abort();
  }, []);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        // BUG 1 FIX: Verify admin/superadmin role safely
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          console.warn('Failed to verify admin role:', error);
          setLoginError('Network error checking admin status. Try again.');
          setLoading(false);
          return;
        }

        if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          setLoginError('Access denied. Administrator privileges required.');
          setLoading(false);
          return;
        }

        setUser(session.user);
        loadData();
      }
    } catch (err) {
      console.log('Auth check failed');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (error) {
        setLoginError(error.message);
        return;
      }

      // BUG 1 FIX: Verify admin/superadmin role after login
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileErr) {
        setLoginError('Network error checking admin status.');
        return;
      }

      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
        setLoginError('Access denied. Admin privileges required.');
        return;
      }

      setUser(data.user);
      loadData();
    } catch (err) {
      setLoginError('Connection failed');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const loadData = async (signal) => {
    try {
      const { data: personaData } = await supabase
        .from('content_authors')
        .select('*')
        .order('name');

      const { data: settingsData } = await supabase.from('content_settings').select('*').maybeSingle();

      const { data: runsData } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      setPersonas(personaData?.length > 0 ? personaData : DEMO_PERSONAS);
      if (settingsData) setSettings(settingsData);
      setPipelineRuns(runsData || []);
    } catch (err) {
      console.log('Using demo data');
      setPersonas(DEMO_PERSONAS);
    }

    // Load promo codes
    await loadPromoCodes();

    // Load economy data
    await loadEconomyData();
  };

  const loadPromoCodes = async (signal) => {
    setPromoLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/promo/admin-promo-codes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: signal,
      });
      if (res.ok) {
        const data = await res.json();
        setPromoCodes(data.codes || []);
      }
    } catch (err) {
      console.warn('Failed to load promo codes:', err);
    } finally {
      setPromoLoading(false);
    }
  };

  const loadEconomyData = async (signal) => {
    setEconomyLoading(true);
    setEconomyError(null);
    try {
      // BUG 2 FIX: Add auth header
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setEconomyLoading(false);
        return;
      }
      const res = await fetch('/api/horses/economy-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEconomyData(data);
          setEconomyLoaded(true);
        } else {
          setEconomyError(data.error || 'Unknown error');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setEconomyError(errData.error || `Error ${res.status}`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setEconomyError(err.message);
    } finally {
      setEconomyLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // 🌐 REAL-TIME SYNCHRONIZATION (Cross-Tab & Supabase)
  // ─────────────────────────────────────────────────────────────────
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (!user) return;

    // 1. Cross-Tab BroadcastChannel setup
    const cleanupBc = listenBroadcast(SYNC_CHANNEL, (msg) => {
      if (msg?.type === 'sync_update') {
        console.log('[Horses Sync] Received cross-tab broadcast, refreshing data...');
        loadDataRef.current();
      }
    });

    // 2. Local Window Event Listener (for internal component changes)
    const handleLocalSync = () => {
      console.log('[Horses Sync] Internal event detected, refreshing data...');
      loadDataRef.current();
    };
    window.addEventListener('horses-updated', handleLocalSync);
    window.addEventListener('horses-grinder-updated', handleLocalSync);
    window.addEventListener('horses-settings-updated', handleLocalSync);

    // 3. Supabase Realtime DB Listeners (Catches Backend/Cron Changes)
    const channel = supabase
      .channel('horses-db-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_authors' }, () => {
        console.log('[Horses Sync] Supabase content_authors changed, refreshing...');
        loadDataRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_settings' }, () => {
        console.log('[Horses Sync] Supabase content_settings changed, refreshing...');
        loadDataRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_runs' }, () => {
        console.log('[Horses Sync] Supabase pipeline_runs changed, refreshing...');
        loadDataRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        console.log('[Horses Sync] tables changed, refreshing Club Arena data...');
        if (caLoaded) loadClubArenaData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_seats' }, () => {
        console.log('[Horses Sync] table_seats changed, refreshing...');
        loadDataRef.current();
        if (caLoaded) loadClubArenaData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        console.log('[Horses Sync] profiles changed, refreshing status...');
        loadDataRef.current();
      })
      .subscribe();

    // 4. EventBus Listeners for real-time diamond/mutation events
    const unsubDiamondsEarned = eventBus.on(EventType.DIAMONDS_EARNED, () => {
      loadDataRef.current();
    });
    const unsubDiamondsSpent = eventBus.on(EventType.DIAMONDS_SPENT, () => {
      loadDataRef.current();
    });
    const unsubMutated = eventBus.on(EventType.DATA_MUTATED, () => {
      loadDataRef.current();
    });

    return () => {
      cleanupBc();
      window.removeEventListener('horses-updated', handleLocalSync);
      window.removeEventListener('horses-grinder-updated', handleLocalSync);
      window.removeEventListener('horses-settings-updated', handleLocalSync);
      supabase.removeChannel(channel);
      unsubDiamondsEarned();
      unsubDiamondsSpent();
      unsubMutated();
    };
  }, [user]);

  // Used by mutation functions to trigger both local and cross-tab syncs
  const broadcastUpdate = (eventType = 'horses-updated') => {
    window.dispatchEvent(new CustomEvent(eventType));
    broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now() });
  };

  const [analyticsError, setAnalyticsError] = useState(null);
  const loadAnalytics = async (signal) => {
    setAnalyticsError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/horses/analytics?type=summary', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setAnalyticsData(json.data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAnalyticsError(errData.error || `Error ${res.status}`);
      }
      setAnalyticsLoaded(true);
    } catch (e) {
      if (e.name !== 'AbortError') setAnalyticsError(e.message);
      setAnalyticsLoaded(true);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadGeevesAnalytics = async () => {
    setGeevesAnalyticsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [summaryRes, missedRes] = await Promise.all([
        fetch('/api/geeves/analytics?action=summary', { headers }).catch(() => ({ ok: false })),
        fetch('/api/geeves/analytics?action=top_missed', { headers }).catch(() => ({ ok: false })),
      ]);
      if (!summaryRes.ok) throw new Error(`Request failed (${summaryRes.status})`);
      const [summaryData, missedData] = await Promise.all([summaryRes.json(), missedRes.json()]);
      setGeevesAnalytics({
        summary: summaryData.success ? summaryData.summary : null,
        questions: missedData.success ? missedData.questions : [],
      });
      setGeevesAnalyticsLoaded(true);
    } catch (err) {
      console.warn('Failed to load Geeves analytics:', err);
    } finally {
      setGeevesAnalyticsLoading(false);
    }
  };

  const markGeevesQuestionResolved = async (id, addedToKB) => {
    setGeevesMarkingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/geeves/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'mark_resolved', id, added_to_kb: addedToKB }),
      });
      if (res.ok) {
        setGeevesAnalytics(prev => ({
          ...prev,
          questions: prev.questions.filter(q => q.id !== id),
        }));
        // Emit bus event so other listeners (cross-tab, other components) can react
        eventBus.emit(EventType.GEEVES_KB_UPDATED, { questionId: id, addedToKB }, 'GeevesAdmin');
        showNotification(addedToKB ? 'Marked as added to KB' : 'Marked as resolved');
      }
    } catch (err) {
      showNotification('Failed to mark question', 'error');
    } finally {
      setGeevesMarkingId(null);
    }
  };

  const EMPTY_ABUSE_DATA = {
    abuse: { log: [], stats: { totalSignups: 0, blocked: 0, disposable: 0 }, topIPs: [] },
    audit: [],
    alerts: [],
    economy: { sourceBreakdown: {}, totalGranted: 0, totalSpent: 0, topHolders: [] },
  };

  const loadAntiAbuseData = async (signal) => {
    setAbuseLoading(true);
    setAbuseError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setAbuseError('Session expired. Please re-login.');
        setAbuseLoading(false);
        return;
      }
      const res = await fetch('/api/horses/anti-abuse?section=all', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAbuseData(data);
          setAbuseLoaded(true);
        } else {
          setAbuseError('API returned failure');
          setAbuseData(EMPTY_ABUSE_DATA);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setAbuseError(errData.error || `Error ${res.status}`);
        setAbuseData(EMPTY_ABUSE_DATA);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setAbuseError(err.message);
      setAbuseData(EMPTY_ABUSE_DATA);
    } finally {
      setAbuseLoading(false);
    }
  };

  // ── Club Arena Admin helpers ──────────────────────────────────────────
  const caFetch = async (endpoint, body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  // Safe query wrapper — returns fallback on error instead of crashing Promise.all
  const safeQuery = async (queryPromise, fallback = { data: [] }) => {
    try {
      const result = await queryPromise;
      if (result.error) { console.warn('[safeQuery] Supabase error:', result.error.message); return fallback; }
      return result;
    } catch (err) { console.warn('[safeQuery] Query failed:', err.message); return fallback; }
  };

  const loadClubArenaData = async () => {
    setCaLoading(true);
    try {
      const [clubsCountRes, membersCountRes, tablesCountRes, cashoutsRes, clubsRes, unionsRes, mintsRes, txnsRes] = await Promise.all([
        safeQuery(supabase.from('clubs').select('*', { count: 'exact', head: true }), { count: 0 }),
        safeQuery(supabase.from('club_members').select('*', { count: 'exact', head: true }), { count: 0 }),
        safeQuery(supabase.from('tables').select('*', { count: 'exact', head: true }).eq('status', 'active'), { count: 0 }),
        safeQuery(supabase.from('cashout_requests').select('id, amount, created_at, club_id, clubs(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(100)),
        safeQuery(supabase.from('clubs').select('id, name, club_id, member_count, status, created_at, owner_id').order('created_at', { ascending: false }).limit(200)),
        safeQuery(supabase.from('unions').select('id, name, code, created_at').order('created_at', { ascending: false }).limit(100)),
        safeQuery(supabase.from('chip_transactions').select('amount, created_at').eq('transaction_type', 'mint').gte('created_at', new Date(Date.now() - 86400000).toISOString()).limit(200)),
        safeQuery(supabase.from('chip_transactions').select('id, amount, transaction_type, created_at, club_id').order('created_at', { ascending: false }).limit(50)),
      ]);

      const clubs = clubsRes?.data || [];
      const pendingCashouts = cashoutsRes?.data || [];
      const recentMints = mintsRes?.data || [];
      const recentTxns = txnsRes?.data || [];
      const totalMinted24h = recentMints.reduce((s, t) => s + (t.amount || 0), 0);
      const pendingCashoutTotal = pendingCashouts.reduce((s, c) => s + (c.amount || 0), 0);

      setCaStats({ totalClubs: clubsCountRes?.count || 0, totalMembers: membersCountRes?.count || 0, totalTables: tablesCountRes?.count || 0, pendingCashouts: pendingCashouts.length, pendingCashoutTotal, totalMinted24h });
      setCaClubs(clubs);
      setCaUnions(unionsRes?.data || []);
      setCaPendingCashouts(pendingCashouts);
      setCaFinance({ recentTxns, totalMinted24h, pendingCashoutTotal });
      setCaLoaded(true);
    } catch (err) {
      showNotification('Failed to load Club Arena data', 'error');
    } finally {
      setCaLoading(false);
    }
  };

  const loadApplications = async (statusFilter = 'pending') => {
    setCaAppLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/club-arena/union-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'list', statusFilter }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) setCaApplications(data.applications || []);
    } catch (err) {
      showNotification('Failed to load applications', 'error');
    } finally {
      setCaAppLoading(false);
    }
  };

  const loadLeaveRequests = async (statusFilter = 'pending') => {
    setCaLeaveLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/club-arena/union-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'list_leave_requests', statusFilter }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) setCaLeaveRequests(data.leaveRequests || []);
    } catch (err) {
      showNotification('Failed to load leave requests', 'error');
    } finally {
      setCaLeaveLoading(false);
    }
  };

  const loadCaClubDetail = async (club) => {
    setCaSelectedClub(club);
    setCaTab('overview');
    setCaClubDetail(null);
    setCaLoading(true);
    try {
      const [membersRes, agentsRes, tablesRes, cashoutsRes, flagsRes, sessionsRes, txnsRes] = await Promise.all([
        safeQuery(supabase.from('club_members').select('*, profiles(display_name, username, player_number)').eq('club_id', club.id).order('created_at', { ascending: false }).limit(200)),
        safeQuery(supabase.from('agents').select('id, user_id, club_id, commission_rate, credit_limit, credit_used, status, created_at').eq('club_id', club.id)),
        safeQuery(supabase.from('tables').select('*').eq('club_id', club.id).order('created_at', { ascending: false })),
        safeQuery(supabase.from('cashout_requests').select('id, club_id, player_id, amount, status, agent_note, created_at').eq('club_id', club.id).eq('status', 'pending').order('created_at', { ascending: false })),
        caFetch('/api/club-arena/anti-cheat', { action: 'get_flags', clubId: club.id }).catch(() => ({ flags: [] })),
        caFetch('/api/club-arena/anti-cheat', { action: 'get_sessions', clubId: club.id }).catch(() => ({ sessions: [] })),
        safeQuery(supabase.from('chip_transactions').select('id, amount, transaction_type, notes, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(50)),
      ]);
      setCaClubDetail({
        members: membersRes?.data || [],
        agents: agentsRes?.data || [],
        tables: tablesRes?.data || [],
        pendingCashouts: cashoutsRes?.data || [],
        flags: flagsRes?.flags || [],
        sessions: sessionsRes?.sessions || [],
        recentTxns: txnsRes?.data || [],
      });
    } catch (err) {
      showNotification('Failed to load club detail', 'error');
    } finally {
      setCaLoading(false);
    }
  };

  const searchCaUsers = async (query) => {
    if (!query.trim()) return;
    setCaUserSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username, email, player_number, created_at, role')
        .or(`display_name.ilike.%${query}%,username.ilike.%${query}%,email.ilike.%${query}%,player_number.eq.${parseInt(query) || 0}`)
        .limit(20);
      setCaUserResults(data || []);
    } catch (err) {
      showNotification('Search failed', 'error');
    } finally {
      setCaUserSearching(false);
    }
  };

  const loadCaUserDetail = async (profile) => {
    setCaSelectedUser({ ...profile, loading: true });
    try {
      const [membershipsRes, txnsRes, cashoutsRes] = await Promise.all([
        safeQuery(supabase.from('club_members').select('*, clubs(name, club_id)').eq('user_id', profile.id)),
        safeQuery(supabase.from('chip_transactions').select('id, amount, transaction_type, notes, created_at, club_id').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30)),
        safeQuery(supabase.from('cashout_requests').select('id, club_id, amount, status, agent_note, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20)),
      ]);
      setCaSelectedUser({ ...profile, memberships: membershipsRes?.data || [], txns: txnsRes?.data || [], cashouts: cashoutsRes?.data || [], loading: false });
    } catch (err) {
      setCaSelectedUser(prev => ({ ...prev, loading: false }));
    }
  };

  const toggleClubStatus = async (club, newStatus) => {
    setCaProcessing(true);
    try {
      await supabase.from('clubs').update({ status: newStatus }).eq('id', club.id);
      setCaClubs(prev => prev.map(c => c.id === club.id ? { ...c, status: newStatus } : c));
      if (caSelectedClub?.id === club.id) setCaSelectedClub(prev => ({ ...prev, status: newStatus }));
      showNotification(`Club ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`);
    } catch (err) {
      showNotification('Failed to update club status', 'error');
    } finally {
      setCaProcessing(false);
    }
  };

  const forceCashoutApprove = async (cashout) => {
    setCaProcessing(true);
    try {
      await caFetch('/api/club-arena/approve-cashout', { cashoutId: cashout.id, clubId: cashout.club_id, action: 'approve' });
      setCaPendingCashouts(prev => prev.filter(c => c.id !== cashout.id));
      if (caClubDetail) setCaClubDetail(prev => ({ ...prev, pendingCashouts: prev.pendingCashouts.filter(c => c.id !== cashout.id) }));
      showNotification('Cashout approved');
    } catch (err) {
      showNotification(err.message || 'Failed', 'error');
    } finally {
      setCaProcessing(false);
    }
  };

  const forceAcAction = async (action, body) => {
    setCaProcessing(true);
    try {
      await caFetch('/api/club-arena/anti-cheat', { action, ...body });
      showNotification(action === 'kick_player' ? 'Player kicked' : `Flag ${body.verdict || 'actioned'}`);
      if (caSelectedClub) loadCaClubDetail(caSelectedClub);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  };

  const togglePersona = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    setPersonas(personas.map((p) => (p.id === id ? { ...p, is_active: newStatus } : p)));

    try {
      await supabase.from('content_authors').update({ is_active: newStatus }).eq('id', id);
      showNotification(`Persona ${newStatus ? 'activated' : 'deactivated'}`);
      broadcastUpdate('horses-updated');
    } catch (err) {
      showNotification('Demo mode - changes not saved', 'info');
    }
  };

  const toggleAllPersonas = async (activate) => {
    setPersonas(personas.map((p) => ({ ...p, is_active: activate })));
    try {
      await supabase.from('content_authors').update({ is_active: activate }).neq('id', 0);
      showNotification(`All personas ${activate ? 'activated' : 'deactivated'}`);
      broadcastUpdate('horses-updated');
    } catch (err) {
      showNotification('Failed to persist bulk toggle', 'error');
    }
  };

  const updateSetting = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    // BUG 4 + BUG 5 FIX: Persist all settings (including grinder_*) to Supabase
    try {
      const upsertPayload = { ...newSettings, updated_at: new Date().toISOString() };
      if (!upsertPayload.id) {
        const { data } = await supabase.from('content_settings').select('id').maybeSingle();
        if (data?.id) upsertPayload.id = data.id;
      }

      const { error } = await supabase.from('content_settings').upsert(upsertPayload);

      if (error) throw error;
      broadcastUpdate('horses-settings-updated');
    } catch (err) {
      console.warn('Settings save error:', err);
      showNotification('Failed to save setting', 'error');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const alias = newPersona.name.replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 1000);

    const personaToCreate = {
      ...newPersona,
      alias,
      avatar_seed: alias.toLowerCase(),
      timezone: 'America/New_York',
      is_active: true,
    };

    try {
      const { data, error } = await supabase
        .from('content_authors')
        .insert([personaToCreate])
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        console.warn('Failed to create persona: no data returned');
        throw new Error('Persona creation returned null');
      }

      setPersonas([data, ...personas]);
      setShowCreateModal(false);
      setNewPersona({
        name: '',
        gender: 'male',
        location: '',
        specialty: 'cash_games',
        stakes: '',
        bio: '',
        voice: 'casual',
      });
      showNotification('New horse stabled! 🐴', 'success');
      broadcastUpdate('horses-updated');
    } catch (err) {
      console.warn(err);
      // Demo fallback
      const demoP = { ...personaToCreate, id: Date.now() };
      setPersonas([demoP, ...personas]);
      setShowCreateModal(false);
      showNotification('Horse created (fallback)', 'success');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to retire ${name}?`)) return;

    setPersonas(personas.filter((p) => p.id !== id));

    try {
      await supabase.from('content_authors').delete().eq('id', id);
      showNotification(`${name} retired`, 'info');
      broadcastUpdate('horses-updated');
    } catch (err) {
      console.log('Delete error (likely demo mode)', err);
    }
  };

  const triggerPipeline = async (type) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showNotification('Session expired. Please re-login.', 'error');
        return;
      }

      showNotification(`Starting pipeline: ${type}...`, 'info');

      const res = await fetch('/api/horses/trigger-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.run) {
          showNotification(`Pipeline ${type} completed!`);
          broadcastUpdate('horses-updated');
        } else {
          showNotification(data.error || 'Pipeline execution failed', 'error');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        showNotification(errData.error || `Error ${res.status}: Pipeline failed`, 'error');
      }
    } catch (err) {
      console.warn('Pipeline Trigger Error:', err);
      showNotification('Network error triggering pipeline', 'error');
    }
  };

  const filteredPersonas = personas.filter((p) => {
    const matchesSearch =
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.location?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filter === 'active') return matchesSearch && p.is_active;
    if (filter === 'inactive') return matchesSearch && !p.is_active;
    return matchesSearch;
  });

  const activeCount = personas.filter((p) => p.is_active).length;

  const loadGrinderData = async (signal) => {
    setGrinderLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/horses/grinder-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGrinderData(data.stats);
        }
      }
    } catch (err) {
      console.warn('Failed to load grinder data:', err);
    } finally {
      setGrinderLoading(false);
    }
  };

  /** Launch or shutdown ENTIRE horse fleet via horse-launch API */
  const handleFleetLaunch = async (fleetAction) => {
    try {
      setGrinderLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { showNotification('Session expired.', 'error'); return; }

      showNotification(fleetAction === 'launch_all' ? '🚀 Launching full fleet deployment...' : '⏹️ Shutting down fleet...', 'info');

      const res = await fetch('/api/club-arena/horse-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: fleetAction }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (fleetAction === 'launch_all') {
          showNotification(`🐎 Fleet deployed! ${data.cashTables} tables, ${data.tournaments} tournaments, ${data.sngs} SNGs, ${data.spins} Spins — ${data.cashSeats} seats filled`, 'success');
        } else {
          showNotification(`Fleet shutdown complete. ${data.horsesRemoved} horses removed.`, 'success');
        }
        broadcastUpdate('horses-grinder-updated');
        // Refresh grinder data
        const _c = new AbortController();
        loadGrinderData(_c.signal);
      } else {
        showNotification(data.error || 'Fleet action failed', 'error');
      }
    } catch (err) {
      console.warn('Fleet launch error:', err);
      showNotification('Network error during fleet launch', 'error');
    } finally {
      setGrinderLoading(false);
    }
  };

  const handleGrinderAction = async (action, club) => {
    try {
      setGrinderLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showNotification('Session expired.', 'error');
        return;
      }

      // Define chips to give if adding to club
      const bodyPayload = { action };
      if (club) bodyPayload.club = club;
      if (action === 'add_to_club') {
        bodyPayload.chips = settings.grinder_starting_chips || 10000;
      }

      const res = await fetch('/api/horses/grinder-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          showNotification(data.message || `Action ${action} successful!`);
          broadcastUpdate('horses-grinder-updated');
        } else {
          showNotification(data.error || 'Action failed', 'error');
        }
      }
    } catch (err) {
      console.warn('Grinder action error:', err);
      showNotification('Network error executing action', 'error');
    } finally {
      setGrinderLoading(false);
    }
  };

  // Load Grinder data when Grinder tab is selected
  useEffect(() => {
    if (activeTab === 'grinder' && !grinderData && !grinderLoading) {
      const _c = new AbortController();
      loadGrinderData(_c.signal);
      return () => _c.abort();
    }
  }, [activeTab]);

  // ── REVIEW MODERATION FUNCTIONS ──────────────────────────────────────────
  const loadAdminReviews = async () => {
    setReviewsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const params = new URLSearchParams({
        sort: reviewsFilter,
        limit: '200',
        ...(reviewsRatingFilter !== 'all' ? { rating: reviewsRatingFilter } : {}),
        ...(reviewsFlaggedOnly ? { flagged: 'true' } : {}),
      });
      const res = await fetch(`/api/horses/admin-reviews?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setReviewsData(data.reviews || []);
          setReviewsStats(data.stats || { total: 0, flagged: 0, avg_rating: 0 });
          setReviewsLoaded(true);
        }
      }
    } catch (err) {
      console.warn('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (reviewsDeleteConfirm !== reviewId) { setReviewsDeleteConfirm(reviewId); return; }
    setReviewsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/horses/admin-reviews?review_id=${reviewId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setReviewsData(prev => prev.filter(r => r.id !== reviewId));
        setReviewsStats(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        showNotification('Review deleted', 'success');
      } else {
        showNotification(data.error || 'Delete failed', 'error');
      }
    } catch (err) {
      showNotification('Network error', 'error');
    } finally {
      setReviewsProcessing(false);
      setReviewsDeleteConfirm(null);
    }
  };

  const handleFlagReview = async (reviewId, action) => {
    setReviewsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/horses/admin-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ review_id: reviewId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setReviewsData(prev => prev.map(r =>
          r.id === reviewId ? { ...r, is_flagged: action === 'flag', flag_reason: action === 'flag' ? 'Admin flagged' : null } : r
        ));
        showNotification(action === 'flag' ? 'Review flagged' : 'Flag removed', 'success');
      } else {
        showNotification(data.error || 'Action failed', 'error');
      }
    } catch (err) {
      showNotification('Network error', 'error');
    } finally {
      setReviewsProcessing(false);
    }
  };

  // Load reviews when tab is activated
  useEffect(() => {
    if (activeTab === 'reviews' && !reviewsLoaded) {
      loadAdminReviews();
    }
  }, [activeTab]);

  // Reload reviews when filters change (only if tab is active)
  useEffect(() => {
    if (activeTab === 'reviews') {
      loadAdminReviews();
    }
  }, [reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly]);

  // Load scraper health when tab is activated, then poll every 60s
  const loadScraperHealth = async () => {
    setScraperHealthLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/admin/scraper-health', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setScraperHealth(data);
          setScraperHealthLastFetch(new Date());
        }
      }
    } catch (err) {
      console.warn('Failed to load scraper health:', err);
    } finally {
      setScraperHealthLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'scrapers') return;
    loadScraperHealth();
    const interval = setInterval(loadScraperHealth, 60000);
    return () => clearInterval(interval);
  }, [activeTab]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.logo}>{'🐴'}</span>
        <p>Loading Stable...</p>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!user) {
    return (
      <>
        <SEOHead
          title="Poker Horses — Fantasy Poker Game"
          description="Smarter.Poker Admin Panel — Content Engine, Economy, and Security Management."
          canonical="/horses"
        >
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
            rel="stylesheet"
          />
        </SEOHead>
        <div className={styles.loginContainer}>
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}>
              <span className={styles.logo}>{'🐴'}</span>
              <h1>HORSES</h1>
              <p>Content Stable Admin</p>
            </div>
            <form onSubmit={handleLogin}>
              <div className={styles.inputGroup}>
                <label>Email</label>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="admin@smarter.poker"
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Password</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
              {loginError && <div className={styles.error}>{loginError}</div>}
              <button type="submit" className={styles.loginBtn}>
                Enter The Stable
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // MAIN DASHBOARD
  return (
    <>
      <Head>
        <title>HORSES | Content Stable</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.dashboard}>
        {/* Notification */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.message}
          </div>
        )}

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.logo}>{'🐴'}</span>
            <h1>STABLE ADMIN V1.0</h1>
            <span className={styles.subtitle}>Content Stable & Search</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.engineStatus}>
              <span
                className={`${styles.statusDot} ${settings.engine_enabled ? styles.active : ''}`}
              ></span>
              <span>{settings.engine_enabled ? 'Engine Running' : 'Engine Stopped'}</span>
            </div>
            <span className={styles.userInfo}>{user?.email}</span>
            <button
              onClick={() => { setActiveTab('geeves'); if (!geevesAnalyticsLoaded) loadGeevesAnalytics(); }}
              style={{ marginRight: 8, background: 'rgba(0,180,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Ask Geeves
            </button>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </header>

        {/* Navigation */}
        <nav className={styles.nav}>
          <button
            className={activeTab === 'stable' ? styles.active : ''}
            onClick={() => setActiveTab('stable')}
          >
            {'💬'} Social Horses
          </button>
          <button
            className={activeTab === 'grinder' ? styles.active : ''}
            onClick={() => setActiveTab('grinder')}
          >
            {'🎲'} Grinder Horses
          </button>
          <button
            className={activeTab === 'pipeline' ? styles.active : ''}
            onClick={() => setActiveTab('pipeline')}
          >
            {'🚀'} Pipeline
          </button>
          <button
            className={activeTab === 'settings' ? styles.active : ''}
            onClick={() => setActiveTab('settings')}
          >
            {'⚙️'} Settings
          </button>
          <button
            className={activeTab === 'stats' ? styles.active : ''}
            onClick={() => {
              setActiveTab('stats');
              if (!analyticsLoaded) loadAnalytics();
            }}
          >
            {'📊'} Statistics
          </button>
          <button
            className={activeTab === 'promo' ? styles.active : ''}
            onClick={() => setActiveTab('promo')}
          >
            {'🎟️'} Promo Codes
          </button>
          <button
            onClick={() => window.location.href = '/horses/sql-console'}
            style={{ fontWeight: 'bold', color: '#10b981' }}
          >
            {'🧠'} SQL Console
          </button>
          <button
            className={activeTab === 'economy' ? styles.active : ''}
            onClick={() => {
              setActiveTab('economy');
              if (!economyLoaded) loadEconomyData();
            }}
          >
            {'💎'} Economy
          </button>
          <button
            className={activeTab === 'antiabuse' ? styles.active : ''}
            onClick={() => {
              setActiveTab('antiabuse');
              if (!abuseLoaded) loadAntiAbuseData();
            }}
          >
            {'🛡️'} Anti-Abuse
          </button>
          <button
            className={activeTab === 'clubarena' ? styles.active : ''}
            onClick={() => {
              setActiveTab('clubarena');
              if (!caLoaded) loadClubArenaData();
              loadApplications('pending');
              loadLeaveRequests('pending');
            }}
          >
            Club Arena Admin
          </button>
          <button
            className={activeTab === 'geeves' ? styles.active : ''}
            onClick={() => {
              setActiveTab('geeves');
              if (!geevesAnalyticsLoaded) loadGeevesAnalytics();
            }}
          >
            Geeves KB
          </button>
          <button
            className={activeTab === 'reviews' ? styles.active : ''}
            onClick={() => {
              setActiveTab('reviews');
              if (!reviewsLoaded) loadAdminReviews();
            }}
          >
            ⭐ Reviews
          </button>
          <button
            className={activeTab === 'scrapers' ? styles.active : ''}
            onClick={() => setActiveTab('scrapers')}
            style={scraperHealth && scraperHealth.summary.deadCount > 0 ? { color: '#ef4444', fontWeight: 700 } : {}}
          >
            {scraperHealth && scraperHealth.summary.deadCount > 0 ? '!' : '>'} Scrapers
          </button>
        </nav>

        {/* Main Content */}
        <main className={styles.content}>
          {/* STABLE TAB */}
          {activeTab === 'stable' && (
            <div className={styles.stableView}>
              <div className={styles.stableHeader}>
                <div className={styles.stableStats}>
                  <div className={styles.statBox}>
                    <span className={styles.statNumber}>{personas.length}</span>
                    <span className={styles.statLabel}>Total Horses</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.activeBox}`}>
                    <span className={styles.statNumber}>{activeCount}</span>
                    <span className={styles.statLabel}>Active</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.inactiveBox}`}>
                    <span className={styles.statNumber}>{personas.length - activeCount}</span>
                    <span className={styles.statLabel}>Resting</span>
                  </div>
                </div>

                <div className={styles.stableControls}>
                  <input
                    type="text"
                    placeholder="Search Horses..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                  />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={styles.filterSelect}
                  >
                    <option value="all">All Horses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Resting Only</option>
                  </select>
                  <PokerBrainLaunchButton />
                  <button className={styles.btnSuccess} onClick={() => toggleAllPersonas(true)}>
                    Activate All
                  </button>
                  <button className={styles.btnCreate} onClick={() => setShowCreateModal(true)}>
                    {'➕'} New Horse
                  </button>
                </div>
              </div>

              <div className={styles.personaGrid}>
                {filteredPersonas.map((persona) => (
                  <div
                    key={persona.id}
                    className={`${styles.personaCard} ${persona.is_active ? styles.active : styles.inactive}`}
                  >
                    <div className={styles.personaHeader}>
                      <div className={styles.personaAvatar}>
                        {persona.avatar_url ? (
                          <img
                            src={persona.avatar_url}
                            alt={persona.name}
                            className={styles.avatarImage}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          className={styles.avatarFallback}
                          style={{ display: persona.avatar_url ? 'none' : 'flex' }}
                        >
                          {persona.gender === 'female' ? '👩' : '👨'}
                        </span>
                      </div>
                      <div className={styles.personaInfo}>
                        <h3>{persona.name}</h3>
                        <span className={styles.alias}>@{persona.alias}</span>
                      </div>
                      <label className={styles.toggleSwitch}>
                        <input
                          type="checkbox"
                          checked={persona.is_active}
                          onChange={() => togglePersona(persona.id, persona.is_active)}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <div className={styles.personaDetails}>
                      <p>{'📍'} {persona.location}</p>
                      <p>{'🎯'} {persona.specialty?.replace('_', ' ')}</p>
                      <p>{'💰'} {persona.stakes}</p>
                    </div>
                    <div className={styles.personaBio}>{persona.bio}</div>
                    <div className={styles.personaVoice}>
                      <span className={styles.voiceTag}>{persona.voice}</span>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(persona.id, persona.name)}
                        title="Retire"
                      >
                        {'🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GRINDER HORSES TAB */}
          {activeTab === 'grinder' && (
            <div className={styles.grinderView}>
              <div className={styles.grinderHeader}>
                <h2>{'🎲'} Grinder Horses - Poker AI</h2>
                <p className={styles.grinderSubtitle}>
                  Same Horses, Second Job: Playing Poker 16hrs/day Across 4 Tables Max in Shark Club
                  & Club JAQK
                </p>
              </div>

              <div className={styles.grinderStats}>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{personas.length}</span>
                  <span className={styles.statLabel}>Total Grinders</span>
                </div>
                <div className={`${styles.statBox} ${styles.activeBox}`}>
                  <span className={styles.statNumber}>{grinderData?.currentlyPlaying || 0}</span>
                  <span className={styles.statLabel}>Currently Playing</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{grinderData?.activeTables || 0}</span>
                  <span className={styles.statLabel}>Active Tables</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNumber}>{settings.grinder_daily_hours || 16}h</span>
                  <span className={styles.statLabel}>Daily Playtime</span>
                </div>
              </div>

              <div className={styles.grinderControls}>
                <h3>{'🚀'} Fleet Deployment — Midway Union</h3>
                <div className={styles.clubActions}>
                  <button
                    className={styles.btnSuccess}
                    onClick={() => handleFleetLaunch('launch_all')}
                    disabled={grinderLoading}
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: 15, padding: '12px 24px' }}
                  >
                    {'🚀'} Launch Full Fleet (Cash + Tournaments + SNGs + Spins)
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleFleetLaunch('shutdown')}
                    disabled={grinderLoading}
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', fontSize: 15, padding: '12px 24px', color: '#fff' }}
                  >
                    {'💀'} Shutdown Entire Fleet
                  </button>
                </div>

                <h3 style={{ marginTop: 24 }}>{'🏠'} Club Management — Shark Club & Club JAQK</h3>
                <div className={styles.clubActions}>
                  <button
                    className={styles.btnSuccess}
                    onClick={() => handleGrinderAction('add_to_club', 'shark_club')}
                    disabled={grinderLoading}
                  >
                    {'🦈'} Add All Horses to Shark Club ({settings.grinder_starting_chips || 10000}{' '}
                    chips)
                  </button>
                  <button
                    className={styles.btnSuccess}
                    onClick={() => handleGrinderAction('add_to_club', 'club_jaqk')}
                    disabled={grinderLoading}
                  >
                    🃏 Add All Horses to Club JAQK ({settings.grinder_starting_chips || 10000}{' '}
                    chips)
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleGrinderAction('start')}
                    disabled={grinderLoading}
                  >
                    {'🎮'} Start Auto-Join (Both Clubs)
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleGrinderAction('stop')}
                    disabled={grinderLoading}
                  >
                    ⏹{'️'} Stop All Horses (Both Clubs)
                  </button>
                </div>
              </div>

              <div className={styles.grinderSettings}>
                <h3>{'⚙️'} Grinder Settings</h3>
                <div className={styles.settingsRow}>
                  <div className={styles.settingItem}>
                    <label>Max Tables Per Horse</label>
                    <select
                      value={settings.grinder_max_tables ?? 4}
                      onChange={(e) =>
                        updateSetting('grinder_max_tables', parseInt(e.target.value))
                      }
                    >
                      <option value="1">1 Table</option>
                      <option value="2">2 Tables</option>
                      <option value="3">3 Tables</option>
                      <option value="4">4 Tables (Max)</option>
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label>Daily Play Hours</label>
                    <select
                      value={settings.grinder_daily_hours ?? 16}
                      onChange={(e) =>
                        updateSetting('grinder_daily_hours', parseInt(e.target.value))
                      }
                    >
                      <option value="8">8 Hours</option>
                      <option value="12">12 Hours</option>
                      <option value="16">16 Hours</option>
                      <option value="24">24 Hours</option>
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label>Starting Chips</label>
                    <input
                      type="number"
                      value={settings.grinder_starting_chips ?? 10000}
                      onChange={(e) =>
                        updateSetting('grinder_starting_chips', parseInt(e.target.value) || 10000)
                      }
                      min="1000"
                      max="100000"
                    />
                  </div>
                  <div className={styles.settingItem}>
                    <label>AI Model</label>
                    <select
                      value={settings.grinder_ai_model ?? 'gpt-4o'}
                      onChange={(e) => updateSetting('grinder_ai_model', e.target.value)}
                    >
                      <option value="gpt-4o">GPT-4o (Best)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.grinderTable}>
                <h3>{'🐴'} Horse Roster - Poker Mode</h3>
                <table className={styles.runsTable}>
                  <thead>
                    <tr>
                      <th>Horse</th>
                      <th>Club</th>
                      <th>Specialty</th>
                      <th>Play Style</th>
                      <th>Tables</th>
                      <th>Hands</th>
                      <th>Profit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPersonas.slice(0, 20).map((persona) => (
                      <tr key={persona.id}>
                        <td>
                          <div className={styles.horseCell}>
                            {persona.avatar_url ? (
                              <img
                                src={persona.avatar_url}
                                alt={persona.name}
                                className={styles.tableCellAvatar}
                                loading="lazy"
                              />
                            ) : (
                              <span>{persona.gender === 'female' ? '👩' : '👨'}</span>
                            )}
                            <div>
                              <strong>{persona.name}</strong>
                              <small>@{persona.alias}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(59,130,246,0.15)',
                              color: '#60a5fa',
                            }}
                          >
                            {'🦈'} Shark
                          </span>{' '}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(168,85,247,0.15)',
                              color: '#c084fc',
                            }}
                          >
                            🃏 JAQK
                          </span>
                        </td>
                        <td>{persona.specialty?.replace('_', ' ')}</td>
                        <td>
                          <span className={styles.voiceTag}>{persona.voice}</span>
                        </td>
                        <td>
                          {grinderData?.roster?.find((r) => r.horse_id === persona.id)?.tables || 0}
                          /{settings.grinder_max_tables || 4}
                        </td>
                        <td>
                          {grinderData?.roster?.find((r) => r.horse_id === persona.id)?.hands || 0}
                        </td>
                        <td className={styles.profitCell}>
                          $
                          {grinderData?.roster?.find((r) => r.horse_id === persona.id)?.profit || 0}
                        </td>
                        <td>
                          {grinderData?.roster?.find((r) => r.horse_id === persona.id)?.status ===
                            'playing' ? (
                            <span
                              className={styles.statusActive}
                              style={{ color: '#22c55e', fontWeight: 'bold' }}
                            >
                              Playing
                            </span>
                          ) : (
                            <span className={styles.statusIdle}>Idle</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPersonas.length > 20 && (
                  <p className={styles.moreHorses}>
                    + {filteredPersonas.length - 20} more horses in the stable
                  </p>
                )}
              </div>

              <div className={styles.schedulePreview}>
                <h3>{'🕐'} Daily Schedule (Rotating Shifts)</h3>
                <div className={styles.scheduleGrid}>
                  <div className={styles.shift}>
                    <h4>{'🌅'} Morning Shift</h4>
                    <p>8 AM - 4 PM</p>
                    <span>40 Horses</span>
                  </div>
                  <div className={styles.shift}>
                    <h4>{'☀️'} Day Shift</h4>
                    <p>12 PM - 8 PM</p>
                    <span>35 Horses</span>
                  </div>
                  <div className={styles.shift}>
                    <h4>{'🌙'} Night Shift</h4>
                    <p>4 PM - 12 AM</p>
                    <span>25 Horses</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PIPELINE TAB */}
          {activeTab === 'pipeline' && (
            <div className={styles.pipelineView}>
              <h2>{'🚀'} Content Pipeline</h2>

              <div className={styles.pipelineActions}>
                <h3>Quick Actions</h3>
                <div className={styles.actionButtons}>
                  <button onClick={() => triggerPipeline('test')} className={styles.actionBtn}>
                    <span className={styles.icon}>{'🧪'}</span>
                    <span className={styles.label}>Test Run</span>
                    <span className={styles.desc}>3 Posts, No Video</span>
                  </button>
                  <button onClick={() => triggerPipeline('cycle')} className={styles.actionBtn}>
                    <span className={styles.icon}>{'🔄'}</span>
                    <span className={styles.label}>Quick Cycle</span>
                    <span className={styles.desc}>10 Posts + 2 Videos</span>
                  </button>
                  <button
                    onClick={() => triggerPipeline('daily')}
                    className={`${styles.actionBtn} ${styles.featured}`}
                  >
                    <span className={styles.icon}>{'📅'}</span>
                    <span className={styles.label}>Full Daily</span>
                    <span className={styles.desc}>{settings.posts_per_day} posts</span>
                  </button>
                  <button onClick={() => triggerPipeline('publish')} className={styles.actionBtn}>
                    <span className={styles.icon}>{'📤'}</span>
                    <span className={styles.label}>Publish Due</span>
                    <span className={styles.desc}>Post Scheduled</span>
                  </button>
                </div>
              </div>

              <div className={styles.rssSources}>
                <h3>RSS Sources</h3>
                <div className={styles.sourceList}>
                  {['PokerNews', 'Card Player', 'PocketFives', 'Upswing Poker', '2+2 Forums'].map(
                    (name, i) => (
                      <div key={i} className={styles.sourceItem}>
                        <span>{name}</span>
                        <span>{'🟢'}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className={styles.recentRuns}>
                <h3>{'📊'} Recent Pipeline Runs</h3>
                {pipelineRuns.length === 0 ? (
                  <p className={styles.noData}>No Pipeline Runs Yet</p>
                ) : (
                  <table className={styles.runsTable}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Posts</th>
                        <th>Videos</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineRuns.map((run) => (
                        <tr key={run.id}>
                          <td>{new Date(run.started_at).toLocaleString()}</td>
                          <td>
                            <span className={`${styles.runType} ${styles[run.run_type]}`}>
                              {run.run_type}
                            </span>
                          </td>
                          <td>{run.text_posts_created}</td>
                          <td>{run.videos_created}</td>
                          <td>{run.duration_seconds}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className={styles.settingsView}>
              <h2>{'⚙️'} Engine Settings</h2>

              <div className={styles.settingsGrid}>
                <div className={styles.settingCard}>
                  <h3>{'📅'} Posting Schedule</h3>
                  <div className={styles.settingItem}>
                    <label>Posts Per Day</label>
                    <input
                      type="number"
                      value={settings.posts_per_day}
                      onChange={(e) => updateSetting('posts_per_day', parseInt(e.target.value))}
                      min="1"
                      max="100"
                    />
                  </div>
                  <div className={styles.settingItem}>
                    <label>Min Delay (minutes)</label>
                    <input
                      type="number"
                      value={settings.min_delay_minutes}
                      onChange={(e) => updateSetting('min_delay_minutes', parseInt(e.target.value))}
                      min="5"
                      max="180"
                    />
                  </div>
                  <div className={styles.settingItem}>
                    <label>Max Delay (minutes)</label>
                    <input
                      type="number"
                      value={settings.max_delay_minutes}
                      onChange={(e) => updateSetting('max_delay_minutes', parseInt(e.target.value))}
                      min="15"
                      max="300"
                    />
                  </div>
                </div>

                <div className={styles.settingCard}>
                  <h3>{'🤖'} AI Settings</h3>
                  <div className={styles.settingItem}>
                    <label>Model</label>
                    <select
                      value={settings.ai_model}
                      onChange={(e) => updateSetting('ai_model', e.target.value)}
                    >
                      <option value="gpt-4o">GPT-4o (Best)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label>Temperature: {settings.temperature}</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.temperature * 100}
                      onChange={(e) => updateSetting('temperature', e.target.value / 100)}
                    />
                  </div>
                </div>

                <div className={`${styles.settingCard} ${styles.fullWidth}`}>
                  <h3>{'🔌'} System Controls</h3>
                  <div className={styles.systemControls}>
                    <div className={styles.controlItem}>
                      <label>Content Engine</label>
                      <label className={styles.toggleSwitch}>
                        <input
                          type="checkbox"
                          checked={settings.engine_enabled}
                          onChange={(e) => updateSetting('engine_enabled', e.target.checked)}
                        />
                        <span className={styles.slider}></span>
                      </label>
                      <span>{settings.engine_enabled ? '🟢 Running' : '🔴 Stopped'}</span>
                    </div>
                    <div className={styles.controlItem}>
                      <label>Auto-Publish</label>
                      <label className={styles.toggleSwitch}>
                        <input
                          type="checkbox"
                          checked={settings.auto_publish}
                          onChange={(e) => updateSetting('auto_publish', e.target.checked)}
                        />
                        <span className={styles.slider}></span>
                      </label>
                      <span>{settings.auto_publish ? '🟢 Active' : '🔴 Manual'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <div className={styles.statsView}>
              <h2>{'📊'} Content Statistics</h2>

              {!analyticsLoaded ? (
                <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                  Loading Analytics...
                </p>
              ) : analyticsError ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ color: '#ef4444', marginBottom: 12 }}>Failed to load analytics: {analyticsError}</p>
                  <button onClick={() => { setAnalyticsLoaded(false); setAnalyticsError(null); loadAnalytics(); }} className={styles.actionBtn}>Retry</button>
                </div>
              ) : (
                <>
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{personas.length}</span>
                      <span className={styles.statLabel}>Total Authors</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>
                        {analyticsData?.activeHorses || activeCount}
                      </span>
                      <span className={styles.statLabel}>Active Authors (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{pipelineRuns.length}</span>
                      <span className={styles.statLabel}>Pipeline Runs</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{analyticsData?.totalPosts || 0}</span>
                      <span className={styles.statLabel}>Posts Created (7d)</span>
                    </div>
                  </div>

                  <div className={styles.contentBreakdown}>
                    <h3>Content Type Breakdown (Last 7 Days)</h3>
                    <div className={styles.breakdownGrid}>
                      {analyticsData &&
                        Object.keys(analyticsData.sourceDistribution || {}).length > 0 ? (
                        Object.entries(analyticsData.sourceDistribution || {}).map(
                          ([source, count], i) => (
                            <div key={i} className={styles.breakdownItem}>
                              <div
                                className={styles.breakdownBar}
                                style={{
                                  width: `${Math.min((count / 50) * 100, 100)}%`,
                                  backgroundColor: [
                                    '#8b5cf6',
                                    '#22c55e',
                                    '#f59e0b',
                                    '#3b82f6',
                                    '#ef4444',
                                  ][i % 5],
                                }}
                              ></div>
                              <span className={styles.breakdownLabel}>{source}</span>
                              <span className={styles.breakdownCount}>{count}</span>
                            </div>
                          )
                        )
                      ) : (
                        <p className={styles.noData}>
                          No data for the last 7 days. Once the pipeline runs, statistics will
                          appear here.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PROMO CODES TAB */}
          {activeTab === 'promo' && (
            <div className={styles.statsView}>
              <h2>{'🎟️'} Promo Code Manager</h2>

              {/* Stats Bar */}
              <div className={styles.statsOverview}>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>{promoCodes.length}</span>
                  <span className={styles.statLabel}>Total Codes</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>
                    {promoCodes.filter((c) => c.is_active).length}
                  </span>
                  <span className={styles.statLabel}>Active</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>
                    {promoCodes.reduce((sum, c) => sum + c.current_uses, 0)}
                  </span>
                  <span className={styles.statLabel}>Total Redemptions</span>
                </div>
              </div>

              {/* Create Promo Code Form */}
              <div className={styles.contentBreakdown} style={{ marginBottom: '24px' }}>
                <h3>Create New Promo Code</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setPromoCreating(true);
                    try {
                      const {
                        data: { session },
                      } = await supabase.auth.getSession();
                      const res = await fetch('/api/promo/admin-promo-codes', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify(promoForm),
                      });
                      if (!res.ok) throw new Error(`Request failed (${res.status})`);
                      const data = await res.json();
                      if (res.ok) {
                        showNotification(`Promo code ${data.code.code} created! 🎟️`);
                        setPromoForm({
                          code: '',
                          description: '',
                          type: 'signup_bonus',
                          value: 100,
                          maxUses: '',
                          expiresAt: '',
                        });
                        await loadPromoCodes();
                        window.dispatchEvent(new CustomEvent('promo-codes-updated'));
                      } else {
                        showNotification(data.error || 'Failed to create code', 'error');
                      }
                    } catch (err) {
                      showNotification('Error creating code', 'error');
                    } finally {
                      setPromoCreating(false);
                    }
                  }}
                >
                  <div className={styles.formRow} style={{ marginBottom: '12px' }}>
                    <div className={styles.formGroup}>
                      <label>Code (leave Blank To Auto-generate)</label>
                      <input
                        type="text"
                        value={promoForm.code}
                        onChange={(e) =>
                          setPromoForm({
                            ...promoForm,
                            code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                          })
                        }
                        placeholder="Auto-generated"
                        maxLength={20}
                        style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Description</label>
                      <input
                        type="text"
                        value={promoForm.description}
                        onChange={(e) =>
                          setPromoForm({ ...promoForm, description: e.target.value })
                        }
                        placeholder="e.g. Welcome Bonus For New Users"
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: '12px' }}>
                    <div className={styles.formGroup}>
                      <label>Type</label>
                      <select
                        value={promoForm.type}
                        onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
                      >
                        <option value="signup_bonus">Signup Bonus (Diamonds)</option>
                        <option value="diamonds">Diamond Bonus</option>
                        <option value="vip_trial">VIP Trial (Days)</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Value ({promoForm.type === 'vip_trial' ? 'Days' : 'Diamonds'})</label>
                      <input
                        type="number"
                        value={promoForm.value}
                        onChange={(e) =>
                          setPromoForm({ ...promoForm, value: parseInt(e.target.value) || 0 })
                        }
                        min="1"
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: '16px' }}>
                    <div className={styles.formGroup}>
                      <label>Max Uses (blank = Unlimited)</label>
                      <input
                        type="number"
                        value={promoForm.maxUses}
                        onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })}
                        placeholder="Unlimited"
                        min="1"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Expires At (optional)</label>
                      <input
                        type="datetime-local"
                        value={promoForm.expiresAt}
                        onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className={styles.btnSubmit}
                    disabled={promoCreating}
                    style={{ width: '100%' }}
                  >
                    {promoCreating ? 'Creating...' : '🎟️ Create Promo Code'}
                  </button>
                </form>
              </div>

              {/* Active Codes Table */}
              <div className={styles.contentBreakdown}>
                <h3>All Promo Codes ({promoCodes.length})</h3>
                {promoLoading ? (
                  <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    Loading Codes...
                  </p>
                ) : promoCodes.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    No Promo Codes Yet. Create One Above!
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Code
                          </th>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Type
                          </th>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Value
                          </th>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Uses
                          </th>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Status
                          </th>
                          <th
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: '#aaa',
                              fontWeight: 600,
                            }}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {promoCodes.map((code) => (
                          <tr
                            key={code.id}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontWeight: 700,
                                  letterSpacing: '1px',
                                  color: code.is_active ? '#00E0FF' : '#666',
                                  fontSize: '15px',
                                }}
                              >
                                {code.code}
                              </span>
                              {code.description && (
                                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                  {code.description}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background:
                                    code.type === 'vip_trial'
                                      ? 'rgba(139, 92, 246, 0.2)'
                                      : 'rgba(59, 130, 246, 0.2)',
                                  color: code.type === 'vip_trial' ? '#a78bfa' : '#60a5fa',
                                }}
                              >
                                {code.type === 'signup_bonus'
                                  ? '💎 Signup'
                                  : code.type === 'diamonds'
                                    ? '💎 Diamonds'
                                    : '👑 VIP Trial'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                              {code.value} {code.type === 'vip_trial' ? 'days' : '💎'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {code.current_uses}
                              {code.max_uses ? `/${code.max_uses}` : '/∞'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: code.is_active
                                    ? 'rgba(34, 197, 94, 0.2)'
                                    : 'rgba(239, 68, 68, 0.2)',
                                  color: code.is_active ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {code.is_active ? '● Active' : '● Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(code.code);
                                    showNotification(`Copied: ${code.code}`);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                  }}
                                  title="Copy Code"
                                >
                                  {'📋'}
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const {
                                        data: { session },
                                      } = await supabase.auth.getSession();
                                      const res = await fetch('/api/promo/admin-promo-codes', {
                                        method: 'PATCH',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          Authorization: `Bearer ${session.access_token}`,
                                        },
                                        body: JSON.stringify({
                                          id: code.id,
                                          is_active: !code.is_active,
                                        }),
                                      });
                                      if (!res.ok) throw new Error('Toggle failed');
                                      showNotification(
                                        `Code ${code.is_active ? 'deactivated' : 'activated'}`
                                      );
                                      await loadPromoCodes();
                                      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
                                    } catch (err) {
                                      showNotification('Failed to toggle promo code', 'error');
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: code.is_active
                                      ? 'rgba(239, 68, 68, 0.2)'
                                      : 'rgba(34, 197, 94, 0.2)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: code.is_active ? '#ef4444' : '#22c55e',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                  }}
                                  title={code.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  {code.is_active ? '⏸️' : '▶️'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ECONOMY TAB */}
          {activeTab === 'economy' && (
            <div className={styles.statsView}>
              <h2>{'💎'} Diamond Economy Dashboard</h2>

              {economyLoading ? (
                <div className={styles.loadingSpinner}>Loading Economy Data...</div>
              ) : economyError ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ color: '#ef4444', marginBottom: 12 }}>Failed to load economy data: {economyError}</p>
                  <button onClick={() => { setEconomyError(null); loadEconomyData(); }} className={styles.actionBtn}>Retry</button>
                </div>
              ) : !economyData ? (
                <div className={styles.loadingSpinner}>No Data Available</div>
              ) : (
                <>
                  {/* Stat Cards */}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>
                        {economyData.stats.totalUsers.toLocaleString()}
                      </span>
                      <span className={styles.statLabel}>Total Users</span>
                    </div>
                    <div className={`${styles.statCardLarge} ${styles.activeBox}`}>
                      <span className={styles.statNumber}>
                        +{economyData.stats.newUsers7d.toLocaleString()}
                      </span>
                      <span className={styles.statLabel}>New Users (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#22c55e' }}>
                        +{economyData.stats.totalDiamondsEarned.toLocaleString()}
                      </span>
                      <span className={styles.statLabel}>{'💎'} Total Earned</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#ef4444' }}>
                        -{economyData.stats.totalDiamondsSpent.toLocaleString()}
                      </span>
                      <span className={styles.statLabel}>{'💎'} Total Spent</span>
                    </div>
                  </div>

                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>
                        {economyData.stats.totalRewardClaims.toLocaleString()}
                      </span>
                      <span className={styles.statLabel}>Reward Claims</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#8b5cf6' }}>
                        {economyData.stats.diamondPurchaseCount}
                      </span>
                      <span className={styles.statLabel}>{'💎'} Purchases</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#f59e0b' }}>
                        ${(economyData.stats.diamondPurchaseRevenue / 100).toFixed(2)}
                      </span>
                      <span className={styles.statLabel}>Purchase Revenue</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#00d4ff' }}>
                        {economyData.stats.activeVipCount}/{economyData.stats.vipSubscriptionCount}
                      </span>
                      <span className={styles.statLabel}>VIP Active/Total</span>
                    </div>
                  </div>

                  {/* Recent Users */}
                  {economyData.recentUsers?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'👤'} Recent Signups</h3>
                      <table className={styles.runsTable}>
                        <thead>
                          <tr>
                            <th>Username</th>
                            <th>Name</th>
                            <th>Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {economyData.recentUsers.map((u) => (
                            <tr key={u.id}>
                              <td>{u.username || '—'}</td>
                              <td>{u.full_name || '—'}</td>
                              <td>{new Date(u.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Diamond Transaction Log */}
                  <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                    <h3>{'💎'} Diamond Transaction Log (Last 100)</h3>
                    <div
                      style={{
                        maxHeight: '500px',
                        overflowY: 'auto',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <table className={styles.runsTable}>
                        <thead
                          style={{ position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 1 }}
                        >
                          <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Source</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {economyData.transactions.map((tx, i) => (
                            <tr key={tx.id || i}>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                {new Date(tx.created_at).toLocaleString()}
                              </td>
                              <td
                                style={{
                                  fontSize: '0.8rem',
                                  maxWidth: '120px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {tx.user_id?.slice(0, 8)}...
                              </td>
                              <td>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background:
                                      tx.type === 'earned' || tx.type === 'reward'
                                        ? 'rgba(34, 197, 94, 0.2)'
                                        : tx.type === 'spent' || tx.type === 'purchase'
                                          ? 'rgba(239, 68, 68, 0.2)'
                                          : 'rgba(139, 92, 246, 0.2)',
                                    color:
                                      tx.type === 'earned' || tx.type === 'reward'
                                        ? '#22c55e'
                                        : tx.type === 'spent' || tx.type === 'purchase'
                                          ? '#ef4444'
                                          : '#a78bfa',
                                  }}
                                >
                                  {tx.type}
                                </span>
                              </td>
                              <td
                                style={{
                                  fontWeight: 700,
                                  color: tx.amount > 0 ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {tx.amount > 0 ? '+' : ''}
                                {tx.amount}{'💎'}
                              </td>
                              <td style={{ fontSize: '0.85rem' }}>{tx.source || '—'}</td>
                              <td
                                style={{
                                  fontSize: '0.8rem',
                                  maxWidth: '200px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {tx.description || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Diamond Purchases */}
                  {economyData.recentPurchases?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'🛒'} Recent Diamond Purchases</h3>
                      <table className={styles.runsTable}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Paid</th>
                            <th>Diamonds</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {economyData.recentPurchases.map((p, i) => (
                            <tr key={p.id || i}>
                              <td>{new Date(p.created_at).toLocaleDateString()}</td>
                              <td style={{ fontSize: '0.8rem' }}>{p.user_id?.slice(0, 8)}...</td>
                              <td style={{ color: '#22c55e', fontWeight: 600 }}>
                                ${((p.amount_paid || 0) / 100).toFixed(2)}
                              </td>
                              <td>{p.diamonds_received?.toLocaleString() || '—'}{'💎'}</td>
                              <td>{p.status || 'completed'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* VIP Subscriptions */}
                  {economyData.vipSubscriptions?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'🏆'} VIP Subscriptions</h3>
                      <table className={styles.runsTable}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {economyData.vipSubscriptions.map((s, i) => (
                            <tr key={s.id || i}>
                              <td>{new Date(s.created_at).toLocaleDateString()}</td>
                              <td style={{ fontSize: '0.8rem' }}>{s.user_id?.slice(0, 8)}...</td>
                              <td>
                                <span className={styles.voiceTag}>{s.plan || 'VIP'}</span>
                              </td>
                              <td style={{ color: s.status === 'active' ? '#22c55e' : '#ef4444' }}>
                                {s.status}
                              </td>
                              <td>
                                {s.current_period_end
                                  ? new Date(s.current_period_end).toLocaleDateString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Refresh Button */}
                  <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                      onClick={loadEconomyData}
                      className={styles.actionBtn}
                      disabled={economyLoading}
                    >
                      {'🔄'} Refresh Economy Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {/* ANTI-ABUSE TAB */}
          {activeTab === 'antiabuse' && (
            <div className={styles.statsView}>
              <h2>{'🛡️'} Anti-Abuse Command Center</h2>

              {abuseLoading ? (
                <div className={styles.loadingSpinner}>Loading Anti-Abuse Data...</div>
              ) : abuseError ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ color: '#ef4444', marginBottom: 12 }}>Failed to load anti-abuse data: {abuseError}</p>
                  <button onClick={() => { setAbuseError(null); loadAntiAbuseData(); }} className={styles.actionBtn}>Retry</button>
                </div>
              ) : !abuseData ? (
                <div className={styles.loadingSpinner}>No Data Available</div>
              ) : (
                <>
                  {/* Stats Overview */}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>
                        {abuseData.abuse?.stats?.totalSignups || 0}
                      </span>
                      <span className={styles.statLabel}>Tracked Signups</span>
                    </div>
                    <div className={`${styles.statCardLarge}`} style={{ borderColor: '#ef4444' }}>
                      <span className={styles.statNumber} style={{ color: '#ef4444' }}>
                        {abuseData.abuse?.stats?.blocked || 0}
                      </span>
                      <span className={styles.statLabel}>Blocked/Flagged</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#f59e0b' }}>
                        {abuseData.abuse?.stats?.disposable || 0}
                      </span>
                      <span className={styles.statLabel}>Disposable Emails</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: '#8b5cf6' }}>
                        {abuseData.alerts?.length || 0}
                      </span>
                      <span className={styles.statLabel}>Alerts (24h)</span>
                    </div>
                  </div>

                  {/* Real-Time Alerts Feed */}
                  {abuseData.alerts?.length > 0 && (
                    <div
                      className={styles.contentBreakdown}
                      style={{ marginTop: '1.5rem', borderLeft: '3px solid #ef4444' }}
                    >
                      <h3>{'🚨'} Real-Time Alerts (Last 24h)</h3>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {abuseData.alerts.map((alert, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '10px 14px',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '13px' }}>
                                {'⚠️'} {alert.reason}
                              </div>
                              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                {alert.email} — IP: {alert.ip} — Deletions: {alert.deletions}
                              </div>
                            </div>
                            <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>
                              {new Date(alert.at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Signup Abuse Log */}
                  <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                    <h3>{'📋'} Signup Abuse Log</h3>
                    <div
                      style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <table className={styles.runsTable}>
                        <thead
                          style={{ position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 1 }}
                        >
                          <tr>
                            <th>Email</th>
                            <th>IP</th>
                            <th>Signups</th>
                            <th>Deletions</th>
                            <th>Welcome Pkg</th>
                            <th>Flags</th>
                            <th>Last Signup</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(abuseData.abuse?.log || []).map((entry, i) => (
                            <tr
                              key={entry.id || i}
                              style={{
                                background:
                                  entry.deleted_account_count > 0
                                    ? 'rgba(239,68,68,0.05)'
                                    : 'transparent',
                              }}
                            >
                              <td
                                style={{
                                  fontSize: '12px',
                                  maxWidth: '180px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {entry.raw_email ||
                                  (entry.email_hash
                                    ? entry.email_hash.slice(0, 12) + '...'
                                    : 'Unknown')}
                              </td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                                {entry.ip_address || '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>{entry.signup_count || 1}</td>
                              <td
                                style={{
                                  textAlign: 'center',
                                  color: entry.deleted_account_count > 0 ? '#ef4444' : '#888',
                                  fontWeight: entry.deleted_account_count > 0 ? 700 : 400,
                                }}
                              >
                                {entry.deleted_account_count || 0}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {entry.welcome_package_granted ? '✅' : '❌'}
                              </td>
                              <td style={{ fontSize: '11px', maxWidth: '200px' }}>
                                {(entry.abuse_flags || []).map((f, j) => (
                                  <span
                                    key={j}
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 6px',
                                      borderRadius: '3px',
                                      background: 'rgba(239,68,68,0.15)',
                                      color: '#f87171',
                                      fontSize: '10px',
                                      margin: '1px 2px',
                                    }}
                                  >
                                    {f.reason || 'flagged'}
                                  </span>
                                ))}
                              </td>
                              <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                {entry.last_signup_at
                                  ? new Date(entry.last_signup_at).toLocaleString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top IPs */}
                  {abuseData.abuse?.topIPs?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'🌐'} Top IPs by Signup Volume</h3>
                      <div className={styles.breakdownGrid}>
                        {abuseData.abuse.topIPs.map((ip, i) => (
                          <div key={i} className={styles.breakdownItem}>
                            <div
                              className={styles.breakdownBar}
                              style={{
                                width: `${Math.min((ip.count / Math.max(...abuseData.abuse.topIPs.map((x) => x.count))) * 100, 100)}%`,
                                backgroundColor:
                                  ip.count > 3 ? '#ef4444' : ip.count > 1 ? '#f59e0b' : '#22c55e',
                              }}
                            ></div>
                            <span
                              className={styles.breakdownLabel}
                              style={{ fontFamily: 'monospace' }}
                            >
                              {ip.ip}
                            </span>
                            <span className={styles.breakdownCount}>{ip.count} signups</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diamond Source Breakdown */}
                  {abuseData.economy?.sourceBreakdown && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'💎'} Diamond Source Breakdown</h3>
                      <div className={styles.statsOverview}>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: '#22c55e' }}>
                            +{(abuseData.economy.totalGranted || 0).toLocaleString()}
                          </span>
                          <span className={styles.statLabel}>Total Granted</span>
                        </div>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: '#ef4444' }}>
                            -{(abuseData.economy.totalSpent || 0).toLocaleString()}
                          </span>
                          <span className={styles.statLabel}>Total Spent</span>
                        </div>
                      </div>
                      <div className={styles.breakdownGrid} style={{ marginTop: '12px' }}>
                        {Object.entries(abuseData.economy.sourceBreakdown || {})
                          .sort((a, b) => b[1] - a[1])
                          .map(([source, amount], i) => (
                            <div key={i} className={styles.breakdownItem}>
                              <div
                                className={styles.breakdownBar}
                                style={{
                                  width: `${Math.min((amount / Math.max(...Object.values(abuseData.economy.sourceBreakdown || {}))) * 100, 100)}%`,
                                  backgroundColor: [
                                    '#8b5cf6',
                                    '#3b82f6',
                                    '#22c55e',
                                    '#f59e0b',
                                    '#ef4444',
                                    '#06b6d4',
                                  ][i % 6],
                                }}
                              ></div>
                              <span className={styles.breakdownLabel}>{source}</span>
                              <span className={styles.breakdownCount}>
                                {amount.toLocaleString()}{'💎'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Top Diamond Holders */}
                  {abuseData.economy?.topHolders?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'🏆'} Top Diamond Holders</h3>
                      <table className={styles.runsTable}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Username</th>
                            <th>Email</th>
                            <th>Diamonds</th>
                            <th>VIP</th>
                            <th>Phone {'✓'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {abuseData.economy.topHolders.map((user, i) => (
                            <tr key={user.id}>
                              <td style={{ fontWeight: 700, color: i < 3 ? '#f59e0b' : '#888' }}>
                                {i + 1}
                              </td>
                              <td>{user.username || '—'}</td>
                              <td
                                style={{
                                  fontSize: '12px',
                                  maxWidth: '180px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {user.email || '—'}
                              </td>
                              <td style={{ fontWeight: 700, color: '#00E0FF' }}>
                                {(user.diamonds || 0).toLocaleString()}{'💎'}
                              </td>
                              <td>{user.is_vip ? `👑 ${user.vip_tier || 'VIP'}` : '—'}</td>
                              <td>{user.phone_verified ? '✅' : '❌'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Admin Audit Log */}
                  {abuseData.audit?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                      <h3>{'📝'} Admin Audit Log</h3>
                      <div
                        style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <table className={styles.runsTable}>
                          <thead
                            style={{ position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 1 }}
                          >
                            <tr>
                              <th>Time</th>
                              <th>Action</th>
                              <th>Target</th>
                              <th>Details</th>
                              <th>IP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {abuseData.audit.map((entry, i) => (
                              <tr key={entry.id || i}>
                                <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                  {new Date(entry.created_at).toLocaleString()}
                                </td>
                                <td>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      background: 'rgba(139,92,246,0.2)',
                                      color: '#a78bfa',
                                    }}
                                  >
                                    {entry.action}
                                  </span>
                                </td>
                                <td style={{ fontSize: '12px' }}>
                                  {entry.target_type}{' '}
                                  {entry.target_id ? String(entry.target_id).slice(0, 8) : '—'}
                                </td>
                                <td
                                  style={{
                                    fontSize: '11px',
                                    maxWidth: '200px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {JSON.stringify(entry.details || {}).slice(0, 60)}
                                </td>
                                <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                                  {entry.ip_address || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Refresh */}
                  <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                      onClick={loadAntiAbuseData}
                      className={styles.actionBtn}
                      disabled={abuseLoading}
                    >
                      {'🔄'} Refresh Anti-Abuse Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* CLUB ARENA ADMIN TAB */}
          {activeTab === 'clubarena' && (
            <div className={styles.statsView}>
              <h2>🃏 Club Arena Admin</h2>
              <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
                Platform-level oversight of all Club Arena clubs. Select a club to inspect anti-cheat flags and active sessions.
              </p>

              {/* ── UNION APPLICATIONS ──────────────────────────────── */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0, color: '#e4e6eb', fontSize: 16 }}>{'🏛️'} Midway Union Applications</h3>
                    {caApplications.filter(a => a.status === 'pending').length > 0 && (
                      <span style={{ background: '#FF453A', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                        {caApplications.filter(a => a.status === 'pending').length} pending
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['pending', 'all'].map(f => (
                      <button key={f} onClick={() => { setCaAppTab(f); loadApplications(f); }} style={{
                        background: caAppTab === f ? '#2374E1' : '#2d2d44',
                        color: caAppTab === f ? '#fff' : '#aaa',
                        border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}>{f === 'pending' ? 'Pending' : 'All'}</button>
                    ))}
                    <button onClick={() => loadApplications(caAppTab)} disabled={caAppLoading} style={{
                      background: '#2d2d44', color: '#aaa', border: 'none', borderRadius: 6,
                      padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                    }}>{'🔄'}</button>
                  </div>
                </div>

                {caAppLoading ? (
                  <div style={{ color: '#888', fontSize: 13, padding: '12px 0' }}>Loading applications...</div>
                ) : caApplications.length === 0 ? (
                  <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 20, textAlign: 'center', color: '#666', fontSize: 13, border: '1px solid #2d2d44' }}>
                    {caAppTab === 'pending' ? '✅ No pending applications.' : 'No applications found.'}
                  </div>
                ) : caApplications.map(app => (
                  <div key={app.id} style={{
                    background: '#1a1a2e', borderRadius: 12, padding: 18, marginBottom: 12,
                    border: `1px solid ${app.status === 'pending' ? '#FFD70044' : app.status === 'approved' ? '#31a24c44' : '#2d2d44'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: '#e4e6eb' }}>{app.club_name}</span>
                          <span style={{ fontSize: 12, color: '#888' }}>Club #{app.club_code}</span>
                          <span style={{
                            background: app.status === 'pending' ? '#FFD70022' : app.status === 'approved' ? '#31a24c22' : '#63636622',
                            color: app.status === 'pending' ? '#FFD700' : app.status === 'approved' ? '#31a24c' : '#888',
                            borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                          }}>{app.status.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {app.member_count} members • Applied {new Date(app.applied_at).toLocaleDateString()}
                          {app.profiles?.display_name && <> • Owner: <strong style={{ color: '#aaa' }}>{app.profiles.display_name}</strong></>}
                          {app.profiles?.email && <> ({app.profiles.email})</>}
                        </div>
                        {app.message && (
                          <div style={{ marginTop: 8, background: '#12121e', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b0b3b8', borderLeft: '3px solid #2374E1', fontStyle: 'italic' }}>
                            &ldquo;{app.message}&rdquo;
                          </div>
                        )}
                        {app.review_note && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                            Review note: {app.review_note}
                          </div>
                        )}
                      </div>
                    </div>
                    {app.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#888' }}>Commission %</label>
                          <input
                            type="number" min="0" max="100" step="1"
                            value={caAppCommission[app.id] ?? '90'}
                            onChange={e => setCaAppCommission(prev => ({ ...prev, [app.id]: e.target.value }))}
                            style={{ width: 60, background: '#12121e', border: '1px solid #3d3d5c', borderRadius: 6, color: '#e4e6eb', fontSize: 13, padding: '4px 8px', textAlign: 'center' }}
                          />
                        </div>
                        <button disabled={caProcessing} onClick={async () => {
                          setCaProcessing(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const rate = parseFloat(caAppCommission[app.id] ?? 90) / 100;
                            const r = await fetch('/api/club-arena/union-application', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                              body: JSON.stringify({ action: 'approve', applicationId: app.id, commissionRate: rate }),
                            });
                            if (!r.ok) throw new Error(`Request failed (${r.status})`);
                            const d = await r.json();
                            if (d.success) {
                              showNotification(`✅ ${d.message}`, 'success');
                              loadApplications(caAppTab);
                            } else {
                              showNotification(d.error || 'Approval failed', 'error');
                            }
                          } catch (e) { showNotification(e.message, 'error'); }
                          finally { setCaProcessing(false); }
                        }} style={{
                          background: '#31a24c', color: '#fff', border: 'none', borderRadius: 8,
                          padding: '7px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}>
                          {'✅'} Approve & Add to Union
                        </button>
                        <input
                          placeholder="Rejection reason (optional)"
                          value={caAppReason}
                          onChange={e => setCaAppReason(e.target.value)}
                          style={{ flex: 1, minWidth: 160, background: '#12121e', border: '1px solid #3d3d5c', borderRadius: 6, color: '#e4e6eb', fontSize: 12, padding: '6px 10px' }}
                        />
                        <button disabled={caProcessing} onClick={async () => {
                          setCaProcessing(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const r = await fetch('/api/club-arena/union-application', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                              body: JSON.stringify({ action: 'reject', applicationId: app.id, reason: caAppReason }),
                            });
                            if (!r.ok) throw new Error(`Request failed (${r.status})`);
                            const d = await r.json();
                            if (d.success) {
                              showNotification(`Application rejected`, 'success');
                              setCaAppReason('');
                              loadApplications(caAppTab);
                            } else {
                              showNotification(d.error || 'Rejection failed', 'error');
                            }
                          } catch (e) { showNotification(e.message, 'error'); }
                          finally { setCaProcessing(false); }
                        }} style={{
                          background: '#FF453A22', color: '#FF453A', border: '1px solid #FF453A44',
                          borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          {'✗'} Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* ── END UNION APPLICATIONS ──────────────────────────── */}

              {/* ── UNION LEAVE REQUESTS ─────────────────────────────── */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0, color: '#e4e6eb', fontSize: 16 }}>{'🚪'} Union Leave Requests</h3>
                    {caLeaveRequests.filter(r => r.status === 'pending').length > 0 && (
                      <span style={{ background: '#FF9500', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                        {caLeaveRequests.filter(r => r.status === 'pending').length} pending
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['pending', 'all'].map(f => (
                      <button key={f} onClick={() => { setCaLeaveTab(f); loadLeaveRequests(f); }} style={{
                        background: caLeaveTab === f ? '#FF9500' : '#2d2d44',
                        color: caLeaveTab === f ? '#fff' : '#aaa',
                        border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}>{f === 'pending' ? 'Pending' : 'All'}</button>
                    ))}
                    <button onClick={() => loadLeaveRequests(caLeaveTab)} disabled={caLeaveLoading} style={{
                      background: '#2d2d44', color: '#aaa', border: 'none', borderRadius: 6,
                      padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                    }}>{'🔄'}</button>
                  </div>
                </div>

                {caLeaveLoading ? (
                  <div style={{ color: '#888', fontSize: 13, padding: '12px 0' }}>Loading leave requests...</div>
                ) : caLeaveRequests.length === 0 ? (
                  <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 20, textAlign: 'center', color: '#666', fontSize: 13, border: '1px solid #2d2d44' }}>
                    {caLeaveTab === 'pending' ? '✅ No pending leave requests.' : 'No leave requests found.'}
                  </div>
                ) : caLeaveRequests.map(req => (
                  <div key={req.id} style={{
                    background: '#1a1a2e', borderRadius: 12, padding: 18, marginBottom: 12,
                    border: `1px solid ${req.status === 'pending' ? '#FF950044' : req.status === 'approved' ? '#31a24c44' : '#2d2d44'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: '#e4e6eb' }}>{req.club_name}</span>
                          {req.club_code && <span style={{ fontSize: 12, color: '#888' }}>Club #{req.club_code}</span>}
                          <span style={{
                            background: req.status === 'pending' ? '#FF950022' : req.status === 'approved' ? '#31a24c22' : '#63636622',
                            color: req.status === 'pending' ? '#FF9500' : req.status === 'approved' ? '#31a24c' : '#888',
                            borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                          }}>{req.status.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          Requested {new Date(req.requested_at).toLocaleDateString()}
                          {req.profiles?.display_name && <> • Owner: <strong style={{ color: '#aaa' }}>{req.profiles.display_name}</strong></>}
                          {req.profiles?.email && <> ({req.profiles.email})</>}
                          {req.unions?.name && <> • Union: <strong style={{ color: '#aaa' }}>{req.unions.name}</strong></>}
                        </div>
                        {req.reason && (
                          <div style={{ marginTop: 8, background: '#12121e', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b0b3b8', borderLeft: '3px solid #FF9500', fontStyle: 'italic' }}>
                            &ldquo;{req.reason}&rdquo;
                          </div>
                        )}
                        {req.reviewed_at && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                            Reviewed {new Date(req.reviewed_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    {req.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button disabled={caProcessing} onClick={async () => {
                          if (!window.confirm(`Remove ${req.club_name} from ${req.unions?.name || 'the union'}? This cannot be undone.`)) return;
                          setCaProcessing(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const r = await fetch('/api/club-arena/union-application', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                              body: JSON.stringify({ action: 'approve_leave', leaveRequestId: req.id }),
                            });
                            if (!r.ok) throw new Error(`Request failed (${r.status})`);
                            const d = await r.json();
                            if (d.success) {
                              showNotification(`✅ ${req.club_name} removed from union`, 'success');
                              loadLeaveRequests(caLeaveTab);
                            } else {
                              showNotification(d.error || 'Failed', 'error');
                            }
                          } catch (e) { showNotification(e.message, 'error'); }
                          finally { setCaProcessing(false); }
                        }} style={{
                          background: '#31a24c', color: '#fff', border: 'none', borderRadius: 8,
                          padding: '7px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}>
                          {'✅'} Approve — Remove from Union
                        </button>
                        <button disabled={caProcessing} onClick={async () => {
                          setCaProcessing(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const r = await fetch('/api/club-arena/union-application', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                              body: JSON.stringify({ action: 'reject', applicationId: req.id }),
                            });
                            if (!r.ok) throw new Error(`Request failed (${r.status})`);
                            const d = await r.json();
                            if (d.success) {
                              showNotification('Leave request denied', 'success');
                              loadLeaveRequests(caLeaveTab);
                            } else {
                              showNotification(d.error || 'Failed', 'error');
                            }
                          } catch (e) { showNotification(e.message, 'error'); }
                          finally { setCaProcessing(false); }
                        }} style={{
                          background: '#FF453A22', color: '#FF453A', border: '1px solid #FF453A44',
                          borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          {'✗'} Deny
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* ── END UNION LEAVE REQUESTS ─────────────────────────── */}

              {caLoading ? (
                <div className={styles.loadingSpinner}>Loading Club Arena data...</div>
              ) : !caSelectedClub ? (
                <>
                  {/* Clubs Overview */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {caClubs.length === 0 ? (
                      <p style={{ color: '#888' }}>No clubs found.</p>
                    ) : caClubs.map(club => (
                      <div key={club.id} style={{
                        background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 12,
                        padding: 16, cursor: 'pointer', transition: 'border-color 0.2s',
                      }}
                        onClick={() => { setCaTab('flags'); loadCaClubDetail(club); }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#4a9eff'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#2d2d44'}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#e4e6eb', marginBottom: 4 }}>{club.name}</div>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Code: {club.club_id} • {club.member_count || 0} members</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ background: club.status === 'active' ? '#31a24c22' : '#636366', color: club.status === 'active' ? '#31a24c' : '#aaa', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                            {club.status || 'active'}
                          </span>
                          <span style={{ fontSize: 11, color: '#666' }}>
                            {new Date(club.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className={styles.actionBtn}
                    style={{ marginTop: 20 }}
                    onClick={() => loadClubArenaData(null)}
                    disabled={caLoading}
                  >
                    {'🔄'} Refresh Clubs
                  </button>
                </>
              ) : (
                <>
                  {/* Back + Club Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <button
                      onClick={() => { setCaSelectedClub(null); setCaClubDetail(null); }}
                      style={{ background: '#2d2d44', color: '#aaa', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
                    >
                      ← All Clubs
                    </button>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#e4e6eb' }}>{caSelectedClub.name}</span>
                      <span style={{ fontSize: 12, color: '#888', marginLeft: 10 }}>Code: {caSelectedClub.club_id} • {caSelectedClub.member_count || 0} members</span>
                    </div>
                  </div>

                  {/* Sub-tab bar */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    {[
                      ['overview', `📊 Overview`],
                      ['members', `👥 Members (${(caClubDetail?.members || []).length})`],
                      ['tables', `🎰 Tables (${(caClubDetail?.tables || []).length})`],
                      ['flags', `🚩 Flags (${(caClubDetail?.flags || []).length})`],
                      ['sessions', `👁️ Sessions (${(caClubDetail?.sessions || []).length})`],
                    ].map(([id, label]) => (
                      <button key={id} onClick={() => setCaTab(id)} style={{
                        background: caTab === id ? '#FF453A' : '#2d2d44',
                        color: caTab === id ? '#fff' : '#aaa',
                        border: 'none', borderRadius: 8, padding: '8px 18px',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}>{label}</button>
                    ))}
                    <button onClick={() => loadCaClubDetail(caSelectedClub)} disabled={caLoading}
                      style={{ marginLeft: 'auto', background: '#2d2d44', color: '#aaa', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
                      {'🔄'} Refresh
                    </button>
                  </div>

                  {caLoading ? (
                    <div className={styles.loadingSpinner}>Loading...</div>
                  ) : caTab === 'overview' ? (
                    <>
                      {/* Stats Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                        {[
                          ['Members', (caClubDetail?.members || []).length, '#4a9eff'],
                          ['Agents', (caClubDetail?.agents || []).length, '#FF9500'],
                          ['Tables', (caClubDetail?.tables || []).length, '#31a24c'],
                          ['Pending Cashouts', (caClubDetail?.pendingCashouts || []).length, '#FF453A'],
                          ['Open Flags', (caClubDetail?.flags || []).length, '#ef4444'],
                          ['Active Sessions', (caClubDetail?.sessions || []).length, '#a855f7'],
                        ].map(([label, value, color]) => (
                          <div key={label} style={{ background: '#1a1a2e', borderRadius: 10, padding: 16, textAlign: 'center', border: '1px solid #2d2d44' }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      {/* Recent Transactions */}
                      <h4 style={{ color: '#e4e6eb', margin: '20px 0 12px', fontSize: 14 }}>Recent Transactions</h4>
                      {(caClubDetail?.recentTxns || []).length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>No recent transactions.</div>
                      ) : (
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          {(caClubDetail?.recentTxns || []).slice(0, 20).map((txn, i) => (
                            <div key={txn.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: i % 2 === 0 ? '#1a1a2e' : 'transparent', borderRadius: 6, fontSize: 13 }}>
                              <span style={{ color: '#aaa' }}>{txn.transaction_type || 'unknown'}</span>
                              <span style={{ color: txn.amount > 0 ? '#31a24c' : '#FF453A', fontWeight: 600 }}>{txn.amount > 0 ? '+' : ''}{txn.amount}</span>
                              <span style={{ color: '#666', fontSize: 11 }}>{txn.created_at ? new Date(txn.created_at).toLocaleString() : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : caTab === 'members' ? (
                    <>
                      {(caClubDetail?.members || []).length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No members in this club.</div>
                      ) : (
                        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                          {(caClubDetail?.members || []).map((m, i) => (
                            <div key={m.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: i % 2 === 0 ? '#1a1a2e' : 'transparent', borderRadius: 6, marginBottom: 2 }}>
                              <div>
                                <span style={{ fontWeight: 600, color: '#e4e6eb', fontSize: 14 }}>{m.profiles?.display_name || m.profiles?.username || 'Unknown'}</span>
                                {m.profiles?.email && <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>{m.profiles.email}</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ background: m.role === 'owner' ? '#FF9500' : m.role === 'agent' ? '#4a9eff' : '#2d2d44', color: m.role === 'owner' ? '#fff' : m.role === 'agent' ? '#fff' : '#aaa', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{m.role || 'member'}</span>
                                <span style={{ color: '#666', fontSize: 11 }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : caTab === 'tables' ? (
                    <>
                      {(caClubDetail?.tables || []).length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No tables in this club.</div>
                      ) : (caClubDetail?.tables || []).map((table, i) => (
                        <div key={table.id || i} style={{ background: '#1a1a2e', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid #2d2d44', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: '#e4e6eb', fontSize: 14 }}>{table.name || `Table ${table.id}`}</div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                              {table.game_type || 'NLH'} • {table.stakes || 'Unknown stakes'} • Seats: {table.max_seats || '?'}
                            </div>
                          </div>
                          <span style={{ background: table.status === 'active' ? '#31a24c22' : '#636366', color: table.status === 'active' ? '#31a24c' : '#aaa', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{table.status || 'inactive'}</span>
                        </div>
                      ))}
                    </>
                  ) : caTab === 'flags' ? (
                    (caClubDetail?.flags || []).length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>{'✅'} No open flags for this club.</div>
                    ) : (caClubDetail?.flags || []).map((flag, i) => (
                      <div key={flag.id || i} style={{
                        background: '#1a1a2e', borderRadius: 10, padding: 16, marginBottom: 12,
                        border: `1px solid ${flag.severity === 'high' ? '#FF453A' : flag.severity === 'medium' ? '#FF9500' : '#2d2d44'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ background: flag.severity === 'high' ? '#FF453A' : flag.severity === 'medium' ? '#FF9500' : '#636366', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                              {(flag.severity || 'LOW').toUpperCase()}
                            </span>
                            <span style={{ fontWeight: 600, color: '#e4e6eb', fontSize: 14 }}>{flag.flag_type || flag.type}</span>
                          </div>
                          <span style={{ fontSize: 11, color: '#666' }}>{flag.created_at ? new Date(flag.created_at).toLocaleString() : ''}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>
                          Player: <strong style={{ color: '#e4e6eb' }}>{flag.player_name || flag.user_id}</strong>
                          {flag.description && <> — {flag.description}</>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {['dismiss', 'reviewed', 'kick'].map(verdict => (
                            <button key={verdict} disabled={caProcessing} onClick={async () => {
                              setCaProcessing(true);
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const action = verdict === 'kick' ? 'kick_player' : 'review_flag';
                                const body = verdict === 'kick'
                                  ? { action, clubId: caSelectedClub.id, targetUserId: flag.user_id, reason: flag.flag_type }
                                  : { action, clubId: caSelectedClub.id, flagId: flag.id, verdict };
                                await fetch('/api/club-arena/anti-cheat', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                                  body: JSON.stringify(body),
                                });
                                showNotification(verdict === 'kick' ? 'Player kicked' : `Flag marked ${verdict}`);
                                loadCaClubDetail(caSelectedClub);
                              } catch (e) { showNotification(e.message, 'error'); }
                              finally { setCaProcessing(false); }
                            }} style={{
                              background: verdict === 'kick' ? '#FF453A22' : '#2d2d44',
                              color: verdict === 'kick' ? '#FF453A' : '#aaa',
                              border: verdict === 'kick' ? '1px solid #FF453A44' : 'none',
                              borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                              {verdict === 'kick' ? '⛔ Kick' : verdict === 'dismiss' ? 'Dismiss' : '✓ Reviewed'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    (caClubDetail?.sessions || []).length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No active sessions at this club right now.</div>
                    ) : (caClubDetail?.sessions || []).map((session, i) => (
                      <div key={session.id || i} style={{
                        background: '#1a1a2e', borderRadius: 10, padding: 16, marginBottom: 12,
                        border: '1px solid #2d2d44', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#e4e6eb', fontSize: 14 }}>{session.player_name || session.user_id}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            Table: {session.table_name || session.table_id} • {session.duration_minutes ? `${session.duration_minutes}m` : 'Active'}
                          </div>
                        </div>
                        <button disabled={caProcessing} onClick={async () => {
                          setCaProcessing(true);
                          try {
                            const { data: { session: s } } = await supabase.auth.getSession();
                            await fetch('/api/club-arena/anti-cheat', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token}` },
                              body: JSON.stringify({ action: 'kick_player', clubId: caSelectedClub.id, targetUserId: session.user_id, reason: 'admin_kick' }),
                            });
                            showNotification('Player kicked');
                            loadCaClubDetail(caSelectedClub);
                          } catch (e) { showNotification(e.message, 'error'); }
                          finally { setCaProcessing(false); }
                        }} style={{ background: '#FF453A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          {'⛔'} Kick
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}

          {/* ── GEEVES KB ANALYTICS TAB ── */}
          {activeTab === 'geeves' && (
            <div style={{ padding: '24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Geeves Knowledge Base Analytics</h2>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                    Questions that fell through to Grok — add them to the KB to make Geeves smarter.
                  </p>
                </div>
                <button
                  onClick={loadGeevesAnalytics}
                  disabled={geevesAnalyticsLoading}
                  style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {geevesAnalyticsLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {/* KPI Cards */}
              {geevesAnalytics.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
                  {[
                    { label: 'Missed (this week)', value: geevesAnalytics.summary.missedThisWeek, color: '#ff6b6b' },
                    { label: 'Resolved (this week)', value: geevesAnalytics.summary.resolvedThisWeek, color: '#51cf66' },
                    { label: 'Total Added to KB', value: geevesAnalytics.summary.totalAddedToKB, color: '#00d4ff' },
                    { label: 'Cache Answers Served', value: geevesAnalytics.summary.cacheAnswersServedThisWeek, color: '#ffd43b' },
                    { label: 'Avg Cache Rating', value: geevesAnalytics.summary.avgCacheRating ? `${geevesAnalytics.summary.avgCacheRating}/5` : 'N/A', color: '#cc5de8' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value ?? '—'}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Missed Questions Table */}
              {geevesAnalyticsLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading Geeves analytics...</div>
              ) : geevesAnalytics.questions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                  No unanswered questions — Geeves is handling everything locally!
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Question', 'Page', 'Asked', 'Last Asked', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {geevesAnalytics.questions.map((q, i) => (
                        <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: '#fff', maxWidth: 340, wordBreak: 'break-word' }}>
                            <div>{q.question}</div>
                            {q.grok_answer && (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ fontSize: 11, color: 'rgba(0,212,255,0.6)', cursor: 'pointer' }}>View Grok answer</summary>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.5, maxHeight: 120, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 6 }}>{q.grok_answer}</div>
                              </details>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{q.page ? q.page.replace('/hub/', '') : '—'}</td>
                          <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: q.asked_count >= 5 ? '#ff6b6b' : '#ffd43b', textAlign: 'center' }}>{q.asked_count}x</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{new Date(q.last_asked).toLocaleDateString()}</td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => markGeevesQuestionResolved(q.id, true)}
                              disabled={geevesMarkingId === q.id}
                              style={{ marginRight: 8, background: 'rgba(81,207,102,0.15)', border: '1px solid rgba(81,207,102,0.35)', color: '#51cf66', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                            >
                              {geevesMarkingId === q.id ? '...' : 'Added to KB'}
                            </button>
                            <button
                              onClick={() => markGeevesQuestionResolved(q.id, false)}
                              disabled={geevesMarkingId === q.id}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
                            >
                              Dismiss
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ⭐ REVIEW MODERATION TAB */}
          {activeTab === 'reviews' && (
            <div style={{ padding: '24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Venue Review Moderation</h2>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                    Manage all player-submitted venue reviews across the platform.
                  </p>
                </div>
                <button
                  onClick={loadAdminReviews}
                  disabled={reviewsLoading}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {reviewsLoading ? 'Loading...' : '↺ Refresh'}
                </button>
              </div>

              {/* Stats Bar */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                {(() => {
                  const visibleCount = (reviewsData || []).filter(r => {
                    if (!reviewsSearch.trim()) return true;
                    const q = reviewsSearch.toLowerCase();
                    return (r.reviewer_name || '').toLowerCase().includes(q) ||
                      (r.venue_name || '').toLowerCase().includes(q) ||
                      (r.review_text || '').toLowerCase().includes(q);
                  }).length;
                  return [
                    { label: 'Total Reviews', value: reviewsStats.total, color: '#60a5fa' },
                    { label: 'Flagged', value: reviewsStats.flagged, color: '#f59e0b' },
                    { label: 'Avg Rating', value: reviewsStats.avg_rating ? `${Number(reviewsStats.avg_rating).toFixed(1)} ★` : '—', color: '#22c55e' },
                    { label: 'Showing', value: visibleCount, color: '#a78bfa' },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 18px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ));
                })()}
              </div>

              {/* Filter Bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
                <select
                  value={reviewsFilter}
                  onChange={e => setReviewsFilter(e.target.value)}
                  style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                  <option value="flagged">Flagged First</option>
                </select>
                <select
                  value={reviewsRatingFilter}
                  onChange={e => setReviewsRatingFilter(e.target.value)}
                  style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                >
                  <option value="all">All Ratings</option>
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="2">2 Stars</option>
                  <option value="1">1 Star</option>
                </select>
                <button
                  onClick={() => setReviewsFlaggedOnly(f => !f)}
                  style={{ padding: '8px 14px', background: reviewsFlaggedOnly ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${reviewsFlaggedOnly ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, color: reviewsFlaggedOnly ? '#f59e0b' : 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  {'🚩'} Flagged Only
                </button>
                <input
                  type="text"
                  value={reviewsSearch}
                  onChange={e => setReviewsSearch(e.target.value)}
                  placeholder="Search reviewer name or venue..."
                  style={{ flex: 1, minWidth: 200, padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                />
              </div>

              {/* Reviews Table */}
              {reviewsLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
                  <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                  Loading reviews...
                </div>
              ) : (() => {
                // Client-side search filter
                const filtered = (reviewsData || []).filter(r => {
                  if (!reviewsSearch.trim()) return true;
                  const q = reviewsSearch.toLowerCase();
                  return (r.reviewer_name || '').toLowerCase().includes(q) ||
                    (r.venue_name || '').toLowerCase().includes(q) ||
                    (r.review_text || '').toLowerCase().includes(q);
                });
                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
                      No reviews match the current filters.
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filtered.map(review => (
                      <div
                        key={review.id}
                        style={{
                          background: review.is_flagged ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${review.is_flagged ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.07)'}`,
                          borderRadius: 12,
                          padding: '16px 20px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          {/* Avatar */}
                          <div style={{ width: 38, height: 38, borderRadius: '50%', background: `hsl(${Math.abs((review.reviewer_name || '?').charCodeAt(0) * 37) % 360}, 55%, 45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0 }}>
                            {(review.reviewer_name || '?')[0].toUpperCase()}
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{review.reviewer_name || 'Anonymous'}</span>
                              {review.is_flagged && <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>{'🚩'} FLAGGED</span>}
                              {review.metadata?.verified_player && <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{'✓'} Verified Player</span>}
                              <span style={{ color: '#fbbf24', fontSize: 13 }}>{'★'.repeat(review.rating || 0)}{'☆'.repeat(5 - (review.rating || 0))}</span>
                              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginLeft: 'auto' }}>
                                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                              {'📍'} {review.venue_name || review.venue_id}
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                              {review.review_text}
                            </p>
                            {review.flag_reason && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '4px 10px', borderRadius: 6 }}>
                                Flag reason: {review.flag_reason}
                              </div>
                            )}
                            <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                              ID: {review.id} · {'👍'} {review.helpful_count || 0} · {'👎'} {review.unhelpful_count || 0}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => handleFlagReview(review.id, review.is_flagged ? 'unflag' : 'flag')}
                              disabled={reviewsProcessing}
                              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: review.is_flagged ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', color: review.is_flagged ? '#f59e0b' : 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              {review.is_flagged ? '✓ Unflag' : '🚩 Flag'}
                            </button>
                            <button
                              onClick={() => handleDeleteReview(review.id)}
                              disabled={reviewsProcessing}
                              style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${reviewsDeleteConfirm === review.id ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.2)'}`, background: reviewsDeleteConfirm === review.id ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.03)', color: reviewsDeleteConfirm === review.id ? '#ef4444' : 'rgba(239,68,68,0.6)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              {reviewsDeleteConfirm === review.id ? '⚠️ Confirm' : '🗑️ Delete'}
                            </button>
                            {reviewsDeleteConfirm === review.id && (
                              <button
                                onClick={() => setReviewsDeleteConfirm(null)}
                                style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* SCRAPER HEALTH TAB */}
          {activeTab === 'scrapers' && (() => {
            const statusColor = { healthy: '#10b981', warning: '#f59e0b', dead: '#ef4444', unknown: '#6b7280' };
            const statusLabel = { healthy: 'Healthy', warning: 'Warning', dead: 'Dead', unknown: 'Unknown' };
            const typeIcon = { live: 'LIVE', tournament: 'TOUR', charity: 'CHAR', monitor: 'MON' };
            return (
              <div style={{ padding: '24px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Scraper Health Dashboard</h2>
                    <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                      Live status of all 9 data collection daemons. Auto-refreshes every 60s.
                      {scraperHealthLastFetch && (
                        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.35)' }}>
                          Last fetched: {scraperHealthLastFetch.toLocaleTimeString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={loadScraperHealth}
                    disabled={scraperHealthLoading}
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    {scraperHealthLoading ? '⟳ Loading...' : '⟳ Refresh'}
                  </button>
                </div>

                {/* Summary Bar */}
                {scraperHealth?.summary && (
                  <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Healthy', count: scraperHealth.summary.healthyCount, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
                      { label: 'Warning', count: scraperHealth.summary.warningCount, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                      { label: 'Dead', count: scraperHealth.summary.deadCount, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                      { label: 'Unknown', count: scraperHealth.summary.unknownCount, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
                    ].map(item => (
                      <div key={item.label} style={{ background: item.bg, border: `1px solid ${item.color}40`, borderRadius: 12, padding: '12px 24px', minWidth: 100, textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: item.color }}>{item.count}</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{item.label}</div>
                      </div>
                    ))}
                    <div style={{ background: scraperHealth.summary.dataFresh ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${scraperHealth.summary.dataFresh ? '#10b98140' : '#ef444440'}`, borderRadius: 12, padding: '12px 24px', minWidth: 140, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: scraperHealth.summary.dataFresh ? '#10b981' : '#ef4444' }}>
                        {scraperHealth.summary.dataFresh ? '✅ Fresh' : '🚨 Stale'}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Supabase Data</div>
                    </div>
                  </div>
                )}

                {/* Daemon Cards */}
                {scraperHealthLoading && !scraperHealth && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: 40 }}>Loading scraper status...</div>
                )}

                {scraperHealth && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                    {scraperHealth.daemons.map(daemon => {
                      const color = statusColor[daemon.status];
                      const hb = daemon.heartbeat;
                      return (
                        <div key={daemon.id} style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${color}50`,
                          borderLeft: `4px solid ${color}`,
                          borderRadius: 12,
                          padding: 20,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
                                {typeIcon[daemon.type]} {daemon.label}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                Interval: {daemon.interval}
                              </div>
                            </div>
                            <span style={{ background: `${color}20`, color, border: `1px solid ${color}40`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {statusLabel[daemon.status]}
                            </span>
                          </div>

                          {hb ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)' }}>Status</div>
                              <div style={{ color: '#fff', fontWeight: 600 }}>{hb.daemonStatus}</div>
                              {hb.pid && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>PID</div><div style={{ color: '#fff' }}>{hb.pid}</div></>)}
                              {hb.cycle !== undefined && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Cycle</div><div style={{ color: '#fff' }}>#{hb.cycle}</div></>)}
                              {hb.recordsSaved !== undefined && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Records Saved</div><div style={{ color: '#10b981', fontWeight: 700 }}>{hb.recordsSaved.toLocaleString()}</div></>)}
                              {hb.venuesWithData !== undefined && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Venues</div><div style={{ color: '#fff' }}>{hb.venuesWithData}</div></>)}
                              {hb.progress && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Progress</div><div style={{ color: '#fff' }}>{hb.progress}</div></>)}
                              {hb.errors !== undefined && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Errors</div><div style={{ color: hb.errors > 0 ? '#ef4444' : '#10b981' }}>{hb.errors}</div></>)}
                              {hb.durationSeconds !== undefined && (<><div style={{ color: 'rgba(255,255,255,0.5)' }}>Last Duration</div><div style={{ color: '#fff' }}>{Math.round(hb.durationSeconds)}s</div></>)}
                              <div style={{ color: 'rgba(255,255,255,0.5)' }}>Heartbeat Age</div>
                              <div style={{ color: hb.staleMinutes > 25 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                {hb.staleMinutes}m ago
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontStyle: 'italic' }}>
                              No heartbeat data — daemon may be interval-based or not running
                            </div>
                          )}

                          {daemon.database?.staleMinutes !== null && daemon.database?.staleMinutes !== undefined && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
                              <span style={{ color: 'rgba(255,255,255,0.45)' }}>DB Data Age: </span>
                              <span style={{ color: daemon.database.staleMinutes > 25 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                {daemon.database.staleMinutes}m
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </main>


        {showCreateModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>{'🐴'} New Horse</h2>
                <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={handleCreate}>
                <div className={styles.formGroup}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={newPersona.name}
                    onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                    placeholder="e.g. Johnny Sticks"
                    required
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Gender</label>
                    <select
                      value={newPersona.gender}
                      onChange={(e) => setNewPersona({ ...newPersona, gender: e.target.value })}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Location</label>
                    <input
                      type="text"
                      value={newPersona.location}
                      onChange={(e) => setNewPersona({ ...newPersona, location: e.target.value })}
                      placeholder="e.g. Austin, TX"
                      required
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>Bio</label>
                  <textarea
                    value={newPersona.bio}
                    onChange={(e) => setNewPersona({ ...newPersona, bio: e.target.value })}
                    placeholder="Brief Backstory..."
                    rows="3"
                    required
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Specialty</label>
                    <select
                      value={newPersona.specialty}
                      onChange={(e) => setNewPersona({ ...newPersona, specialty: e.target.value })}
                    >
                      <option value="cash_games">Cash Games</option>
                      <option value="tournaments">Tournaments</option>
                      <option value="plo">PLO</option>
                      <option value="online">Online</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Stakes</label>
                    <input
                      type="text"
                      value={newPersona.stakes}
                      onChange={(e) => setNewPersona({ ...newPersona, stakes: e.target.value })}
                      placeholder="e.g. 2/5 NLH"
                      required
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnSubmit}>
                    Stable Horse
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
