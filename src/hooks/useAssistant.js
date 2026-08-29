/**
 * Personal Assistant Hooks
 * Provides data fetching for Strategy Hub, Virtual Sandbox, and Leak Finder
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../lib/authUtils';
import { busEmit } from '../engine/EventBus';
import { ARCHETYPE_CONFIG } from '../lib/sandbox/VillainArchetypeRanges';

// Use the platform's lock-free token helper. It reads the canonical stored
// session, coalesces concurrent refreshes, and refreshes expiring JWTs through
// the Auth REST endpoint without invoking the SDK session-lock path.
async function getAuthToken() {
  try {
    return await getFreshAccessToken();
  } catch (e) {
    console.warn('[useAssistant] token resolution failed:', e?.message || e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// useAssistantStats — Fetch user's assistant statistics
// ═══════════════════════════════════════════════════════════════════════════

export function useAssistantStats(authState) {
  const [stats, setStats] = useState({
    sessionsReviewed: 0,
    handsAnalyzed: 0,
    leaksFound: 0,
    sandboxSessions: 0,
    avgEvLoss: 0,
  });
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  const fetchStats = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    // AvatarContext deliberately exposes an unresolved auth phase. Do not
    // fetch guest/sample stats during that window or they can win the race and
    // remain visible after the signed-in identity hydrates.
    if (!authReady) return;
    try {
      const token = await getAuthToken();

      const response = await fetch('/api/assistant/stats', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();
      if (requestId !== requestIdRef.current) return;

      // A 401/500 must not read as "no data" — surface it.
      if (!response.ok || data.success === false) {
        setError(data.error || `HTTP ${response.status}`);
        return;
      }

      if (data.success) {
        const demo = !!data.isDemo;
        // Keep the flag on the stats object too — consumers read either.
        setStats({ ...data.stats, isDemo: demo });
        setIsDemo(demo);
        setError(null);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Error fetching stats:', err);
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current && authReady) setIsLoading(false);
    }
  }, [authReady, authUserId]);

  useEffect(() => {
    fetchStats();

    // 🔄 BUS LISTENER for real-time Stat updates
    const handleUpdate = () => fetchStats();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('pa-data-updated', handleUpdate);
    };
  }, [fetchStats]);

  return { stats, isDemo, isLoading, error, refetch: fetchStats };
}

// ═══════════════════════════════════════════════════════════════════════════
// useLeaks — Fetch user's detected leaks
// ═══════════════════════════════════════════════════════════════════════════

export function useLeaks(statusFilter = null, authState) {
  const [leaks, setLeaks] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  // Onboarding sample leaks the API ships alongside an empty result set. Kept
  // separate from `leaks` so they can never be mistaken for the user's own data.
  const [demoLeaks, setDemoLeaks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  const fetchLeaks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      setError(null);
      if (!authReady) return;
      const token = await getAuthToken();

      let url = '/api/assistant/leaks';
      if (statusFilter) {
        url += `?status=${encodeURIComponent(statusFilter)}`;
      }

      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();
      if (requestId !== requestIdRef.current) return;

      // A 401/500 must not read as "no leaks" — surface it.
      if (!response.ok || data.success === false) {
        setError(data.error || `HTTP ${response.status}`);
        return;
      }

      if (data.success) {
        setIsDemo(!!data.isDemo);
        setError(null);
        // Transform API response to match UI format
        setLeaks((data.leaks || []).map(formatLeak));
        // Onboarding samples the API returns with an empty result set.
        setDemoLeaks((data.demoLeaks || []).map(formatLeak));
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Error fetching leaks:', err);
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current && authReady) setIsLoading(false);
    }
  }, [statusFilter, authReady, authUserId]);

  useEffect(() => {
    fetchLeaks();

    // 🔄 BUS LISTENER for real-time Leak updates
    const handleUpdate = () => fetchLeaks();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('pa-data-updated', handleUpdate);
    };
  }, [fetchLeaks]);

  const updateLeakStatus = async (leakId, newStatus) => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/assistant/leaks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id: leakId, status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        // 📢 Dispatch BUS LISTENER update
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
        await fetchLeaks(); // Refresh local hook state as well
      }
      return data;
    } catch (err) {
      console.warn('Error updating leak:', err);
      return { success: false, error: err.message };
    }
  };

  return { leaks, demoLeaks, isDemo, isLoading, error, refetch: fetchLeaks, updateLeakStatus };
}

/** Map an API leak row onto the shape the Leak Finder UI renders. */
function formatLeak(leak) {
  const leakType = leak.leak_type || null;
  return {
    id: leak.id,
    title: leak.situation_class || leak.leak_name || formatLeakTitle(leakType),
    status: leak.status,
    confidence: leak.confidence,
    situationClass: leak.situation_class,
    optimalFrequency: leak.optimal_frequency,
    currentFrequency: leak.current_frequency,
    evLossBB: leak.avg_ev_loss_bb,
    occurrenceCount: leak.occurrence_count,
    firstDetected: leak.first_detected_at,
    trendData: leak.trend_data || [],
    explanation: leak.explanation,
    whyLeakingEv: leak.why_leaking_ev,
    sourceSystem: leak.source_system || (leak.leak_category === 'training' ? 'training_arena' : 'live_play'),

    // Enrichment columns. The Leak Finder used to re-fetch this exact endpoint
    // a SECOND time (useLeakExtras) purely to recover these, doubling the
    // request and the parse on the page's hottest path. Every field is optional
    // and defaults to null, so a missing DB column degrades gracefully.
    leakType,
    leakCategory: leak.leak_category || null,
    recommendedDrill: leak.recommended_drill || null,
    suggestedFix: leak.suggested_fix || null,
    resolvedAt: leak.resolved_at || null,
    lastDetected: leak.last_detected_at || null,
    notes: leak.notes || null,
    frequencyIsEstimated: !!leak.frequency_is_estimated,
  };
}

function formatLeakTitle(leakType) {
  if (!leakType) return 'Unknown Leak';
  return leakType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// useArchetypes — Fetch villain archetypes
// ═══════════════════════════════════════════════════════════════════════════

// Single source of truth for the archetype id domain:
// nit | tag | lag | fish | calling_station | maniac | gto_neutral.
// (Same taxonomy the analyze API's exploit tips and getArchetypeRange use — an
// id from any other vocabulary resolves to an empty range and no exploit tips.)
const ARCHETYPE_ORDER = ['gto_neutral', 'nit', 'tag', 'lag', 'fish', 'calling_station', 'maniac'];

const DEFAULT_ARCHETYPES = ARCHETYPE_ORDER
  .filter(id => ARCHETYPE_CONFIG[id])
  .map(id => ({
    id,
    name: ARCHETYPE_CONFIG[id].name,
    color: ARCHETYPE_CONFIG[id].color,
    description: ARCHETYPE_CONFIG[id].description,
    vpip: ARCHETYPE_CONFIG[id].vpip?.BTN ?? null,
  }));

export function useArchetypes() {
  const [archetypes, setArchetypes] = useState(DEFAULT_ARCHETYPES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchArchetypes() {
      try {
        const response = await fetch('/api/assistant/archetypes');
        const data = await response.json();

        if (!cancelled && response.ok && data.success && Array.isArray(data.archetypes) && data.archetypes.length > 0) {
          setArchetypes(data.archetypes);
        }
      } catch (err) {
        console.warn('Error fetching archetypes:', err);
        // Keep the canonical defaults already in state
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchArchetypes();
    return () => { cancelled = true; };
  }, []);

  return { archetypes, isLoading };
}

// ═══════════════════════════════════════════════════════════════════════════
// useSandboxAnalysis — Run GTO analysis
// ═══════════════════════════════════════════════════════════════════════════

// Canonical verb for a free-text action label ('Check-Raise' must NOT match
// 'Check'). Mirrors the sandbox page's normalizeAction verb detection.
function actionVerb(label) {
  if (!label || typeof label !== 'string') return null;
  const raw = label.toLowerCase().trim();
  if (/all[\s-]?in|shove|jam/.test(raw)) return 'allin';
  if (/check[\s-]?raise/.test(raw)) return 'raise';
  if (/(^|\s)raise/.test(raw)) return 'raise';
  if (/(^|\s)(over)?bet/.test(raw)) return 'bet';
  if (/(^|\s)call/.test(raw)) return 'call';
  if (/(^|\s)check/.test(raw)) return 'check';
  if (/(^|\s)fold/.test(raw)) return 'fold';
  return raw.split(/[\s_]/)[0] || null;
}

// True only when the user submitted a coach pick and it matched the optimal action.
function coachPickWasCorrect(params, data) {
  const pick = params?.socratic?.userPick;
  const optimal = data?.optimalAction?.label;
  if (!pick || !optimal) return false;
  const a = actionVerb(pick);
  const b = actionVerb(optimal);
  return !!a && a === b;
}

export function useSandboxAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const activeAbortRef = useRef(null);

  const analyze = useCallback(async (params, options = {}) => {
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const superseded = () => ({ success: false, superseded: true, error: 'Analysis superseded' });
    try {
      setIsAnalyzing(true);
      setError(null);

      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const token = await getAuthToken();
      if (requestId !== requestIdRef.current) return superseded();

      const doFetch = async () => {
        const response = await fetch('/api/assistant/sandbox/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        // Guard: Check if response is actually JSON before parsing
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          // Server returned HTML (e.g. during recompilation) — not a real error
          throw new Error('SERVER_RELOADING');
        }

        let data;
        try {
          data = await response.json();
        } catch (parseErr) {
          throw new Error('SERVER_RELOADING');
        }

        // Guard: HTTP-level errors (500, 503, etc.)
        if (!response.ok) {
          if (response.status >= 502 && response.status <= 504) {
            throw new Error('SERVER_RELOADING');
          }
          return { success: false, error: data.error || `Server error (${response.status})` };
        }

        return data;
      };

      // Attempt with 1 auto-retry on transient errors
      let data;
      try {
        data = await doFetch();
      } catch (fetchErr) {
        if (fetchErr.message === 'SERVER_RELOADING') {
          // Wait 2s and retry once
          await new Promise(r => setTimeout(r, 2000));
          if (requestId !== requestIdRef.current) return superseded();
          try {
            data = await doFetch();
          } catch (retryErr) {
            if (requestId !== requestIdRef.current) return superseded();
            if (requestId === requestIdRef.current) {
              setError('Server is temporarily unavailable. Please try again in a moment.');
            }
            return { success: false, error: 'Server temporarily unavailable' };
          }
        } else {
          throw fetchErr;
        }
      }
      if (requestId !== requestIdRef.current) return superseded();

      if (data.success === false) {
        setError(data.error || 'Analysis failed');
        return data;
      }

      if (data.success) {
        setResults({
          // New enriched response fields
          heroHand: data.heroHand,
          actions: data.actions || [],
          optimalAction: data.optimalAction,
          isMixed: data.isMixed,
          ev: data.ev,
          explanation: data.explanation,
          rangeHeatmap: data.rangeHeatmap || null,

          // ICM fields (tournament mode)
          icmAdjusted: data.icmAdjusted || false,
          icmEV: data.icmEV || null,
          bubbleFactor: data.bubbleFactor || null,

          // Metadata
          source: data.source,
          matchTier: data.matchTier,
          confidence: data.confidence,
          street: data.street,
          context: data.context,
          // Caller intent belongs to this exact response. Keeping it on the
          // result removes the old global suppression flag that could be
          // consumed by the wrong request when comparisons overlapped.
          skipCoachGrade: options.skipCoachGrade === true,

          // sandbox_sessions row id for this analysis, used to link a coach
          // verdict to the exact hand. Absent on cached/guest responses —
          // consumers must treat null as "no exact link available".
          sessionId: data.sessionId || null,

          // Legacy compatibility
          primaryAction: data.optimalAction?.label,
          primaryFrequency: data.optimalAction?.frequency,
          alternatives: data.actions?.filter(a => !a.isOptimal) || [],
          whyNot: data.explanation,
        });

        // 📢 Dispatch BUS LISTENER update (Sandbox affects Stats)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));

          // Celebrate an actual achievement — the coach pick matching the
          // optimal action — not merely having exploit/ICM mode switched on.
          if (coachPickWasCorrect(params, data)) {
            busEmit.celebration('confetti');
          }
        }
      } else {
        setError(data.error || 'Analysis failed');
      }

      return data;
    } catch (err) {
      if (requestId !== requestIdRef.current) return superseded();
      console.warn('Analysis error:', err);
      setError(err.message === 'SERVER_RELOADING'
        ? 'Server is temporarily unavailable. Please try again in a moment.'
        : err.message);
      return { success: false, error: err.message };
    } finally {
      // An older request finishing must never clear the spinner for the newer
      // solve that is still in flight.
      if (requestId === requestIdRef.current) {
        activeAbortRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }, []);

  const clearResults = useCallback(() => {
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    requestIdRef.current += 1;
    setIsAnalyzing(false);
    setResults(null);
    setError(null);
  }, []);

  useEffect(() => () => {
    activeAbortRef.current?.abort();
    requestIdRef.current += 1;
  }, []);

  return { analyze, isAnalyzing, results, error, clearResults };
}

// ═══════════════════════════════════════════════════════════════════════════
// useRecentSessions — Fetch recent sandbox sessions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pull the hero's EV loss (in BB, negative = lost EV) out of a sandbox_results
 * row. Returns null when the row carries no EV data — never a fake 0.
 */
function extractEvLoss(resultRow) {
  if (!resultRow) return null;

  if (typeof resultRow.ev_loss_bb === 'number') {
    return -Math.abs(Math.round(resultRow.ev_loss_bb * 100) / 100) || null;
  }

  let analysis = resultRow.full_analysis;
  if (typeof analysis === 'string') {
    try { analysis = JSON.parse(analysis); } catch (e) { analysis = null; }
  }
  const raw = analysis?.ev?.evLoss;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) return null;
  return -Math.abs(Math.round(raw * 100) / 100);
}

export function useRecentSessions(limit = 10, authState) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  const fetchSessions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    if (!authReady) return;
    try {
      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const user = hasExplicitAuth
        ? (authUserId ? { id: authUserId } : null)
        : getAuthUser();
      if (!user) {
        // Demo sessions for non-logged-in users — tagged so the UI can label them
        setSessions([
          { id: 'demo-1', title: 'MP vs BTN Single Raised Pot', stack: '100BB', evLoss: -0.14, type: 'sandbox', isDemo: true },
          { id: 'demo-2', title: 'Post-Session Leak Analysis', date: 'Yesterday', evLoss: -0.11, type: 'leak', isDemo: true },
        ]);
        setIsDemo(true);
        setError(null);
        return;
      }
      setIsDemo(false);

      const SELECT_BASE = `
          id,
          hero_hand,
          hero_position,
          hero_stack_bb,
          game_type,
          board_flop,
          board_turn,
          board_river,
          villain_config,
          action_history,
          pot_size_bb,
          created_at
        `;

      const { data, error: queryError } = await supabase
        .from('sandbox_sessions')
        .select(SELECT_BASE)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Production intentionally has no PostgREST relationship from results to
      // sessions. The old nested select failed on every request and retried
      // without results, so Recent Sessions never displayed action or EV data.
      // Resolve the owned session ids first, then hydrate their result rows.
      const resultsBySession = new Map();
      const sessionIds = (data || []).map(session => session.id).filter(Boolean);
      if (!queryError && sessionIds.length > 0) {
        const { data: resultRows, error: resultsError } = await supabase
          .from('sandbox_results')
          .select('session_id, primary_action, primary_frequency, ev_loss_bb, full_analysis, created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false });
        if (resultsError) {
          console.warn('[useRecentSessions] Results hydration failed:', resultsError.message);
        } else {
          (resultRows || []).forEach(result => {
            const key = String(result.session_id);
            if (!resultsBySession.has(key)) resultsBySession.set(key, result);
          });
        }
      }

      if (requestId !== requestIdRef.current) return;
      if (queryError) {
        console.warn('Error fetching sessions:', queryError);
        setError(queryError.message || 'Recent sessions could not be loaded');
        setSessions([]);
      } else {
        const formatted = (data || []).map(s => {
          const result = resultsBySession.get(String(s.id)) || null;
          return ({
          id: s.id,
          title: `${s.hero_position || 'Unknown'} with ${s.hero_hand || '??'}`,
          stack: `${s.hero_stack_bb}BB`,
          hero_stack: s.hero_stack_bb, // Raw numeric value for restore
          hero_position: s.hero_position,
          hero_hand: s.hero_hand,
          game_type: s.game_type,
          // Real EV loss when the analysis recorded one, otherwise null so the
          // UI can render an em dash instead of a fabricated 0.00 BB.
          evLoss: extractEvLoss(result),
          type: 'sandbox',
          date: s.created_at,
          result: result?.primary_action,
          // Full restoration fields
          board_flop: s.board_flop,
          board_turn: s.board_turn,
          board_river: s.board_river,
          villain_config: s.villain_config,
          action_history: s.action_history,
          pot_size_bb: s.pot_size_bb,
          });
        });
        setSessions(formatted);
        setError(null);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Fetch sessions error:', err);
      setError(err.message || 'Recent sessions could not be loaded');
      setSessions([]);
    } finally {
      if (requestId === requestIdRef.current && authReady) setIsLoading(false);
    }
  }, [limit, hasExplicitAuth, authReady, authUserId]);

  useEffect(() => {
    fetchSessions();

    // 🔄 BUS LISTENER for real-time Session updates
    const handleUpdate = () => fetchSessions();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('pa-data-updated', handleUpdate);
    };
  }, [fetchSessions]);

  return { sessions, isDemo, isLoading, error, refetch: fetchSessions };
}

// ═══════════════════════════════════════════════════════════════════════════
// useBookmarks — Fetch saved sandbox bookmarks
// ═══════════════════════════════════════════════════════════════════════════

export function useBookmarks(limit = 15, authState) {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  const fetchBookmarks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      setError(null);
      if (!authReady) return;
      const user = hasExplicitAuth
        ? (authUserId ? { id: authUserId } : null)
        : getAuthUser();

      if (!user) {
        if (typeof window !== 'undefined') {
          const stored = JSON.parse(localStorage.getItem('sandbox_bookmarks') || '[]');
          const formatted = stored.slice(0, limit).map(b => ({
            ...b,
            title: b.label || 'Saved Scenario',
            stack: `${b.hero_stack || 100}BB`,
            type: 'bookmark',
            villain_config: typeof b.villains === 'string' ? JSON.parse(b.villains) : b.villains,
            action_history: typeof b.action_history === 'string' ? JSON.parse(b.action_history) : b.action_history,
          }));
          if (requestId === requestIdRef.current) setBookmarks(formatted);
        } else {
          setBookmarks([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from('sandbox_bookmarks')
        .select('id, hero_hand, hero_position, hero_stack, game_type, board_flop, board_turn, board_river, villains, action_history, pot_size_bb, label, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (requestId !== requestIdRef.current) return;
      if (error) {
        console.warn('Error fetching bookmarks:', error);
        setError(error.message || 'Bookmarks could not be loaded');
        setBookmarks([]);
      } else {
        const formatted = (data || []).map(b => ({
          id: b.id,
          title: b.label || b.hero_hand || 'Saved Scenario',
          stack: `${b.hero_stack || 100}BB`,
          hero_stack: b.hero_stack,
          hero_position: b.hero_position,
          hero_hand: b.hero_hand,
          game_type: b.game_type,
          type: 'bookmark',
          date: b.created_at,
          board_flop: b.board_flop,
          board_turn: b.board_turn,
          board_river: b.board_river,
          villain_config: typeof b.villains === 'string' ? JSON.parse(b.villains) : b.villains,
          action_history: typeof b.action_history === 'string' ? JSON.parse(b.action_history) : b.action_history,
          pot_size_bb: b.pot_size_bb,
        }));
        setBookmarks(formatted);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Fetch bookmarks error:', err);
      setError(err.message || 'Bookmarks could not be loaded');
      setBookmarks([]);
    } finally {
      if (requestId === requestIdRef.current && authReady) setIsLoading(false);
    }
  }, [limit, hasExplicitAuth, authReady, authUserId]);

  useEffect(() => {
    fetchBookmarks();

    // 🔄 BUS LISTENER for real-time Bookmark updates
    if (typeof window === 'undefined') return;
    const handleUpdate = () => fetchBookmarks();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('pa-data-updated', handleUpdate);
    };
  }, [fetchBookmarks]);

  return { bookmarks, isLoading, error, refetch: fetchBookmarks };
}

// ═══════════════════════════════════════════════════════════════════════════
// useStudyDeck — Fetch previous analyses with full_analysis for study replay
// ═══════════════════════════════════════════════════════════════════════════

export function useStudyDeck(limit = 20, authState) {
  const [studySessions, setStudySessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  const fetchStudySessions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      if (!authReady) return;
      const user = hasExplicitAuth
        ? (authUserId ? { id: authUserId } : null)
        : getAuthUser();
      if (!user) { setStudySessions([]); return; }
      // Production does not expose a PostgREST relationship from
      // sandbox_results back to sandbox_sessions. Resolve ownership first,
      // then fetch only results whose session ids belong to this user. This is
      // both schema-cache independent and safe if results RLS is permissive.
      const sessionLimit = Math.max(limit * 3, limit);
      const { data: ownedSessions, error: sessionsError } = await supabase
        .from('sandbox_sessions')
        .select(`
          id,
          hero_hand,
          hero_position,
          board_flop
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(sessionLimit);

      if (sessionsError) throw sessionsError;

      const sessionById = new Map((ownedSessions || []).map(session => [String(session.id), session]));
      const sessionIds = Array.from(sessionById.keys());
      if (sessionIds.length === 0) {
        if (requestId === requestIdRef.current) setStudySessions([]);
        return;
      }

      const { data, error } = await supabase
        .from('sandbox_results')
        .select('id, session_id, primary_action, primary_frequency, full_analysis, confidence, created_at')
        .in('session_id', sessionIds)
        .not('full_analysis', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (requestId !== requestIdRef.current) return;
      if (error) {
        console.warn('[useStudyDeck] Query error:', error.message);
        setStudySessions([]);
      } else {
        const formatted = (data || []).reduce((sessions, result) => {
          const session = sessionById.get(String(result.session_id));
          if (!session) return sessions;

          let fullAnalysis = result.full_analysis;
          if (typeof fullAnalysis === 'string') {
            try {
              fullAnalysis = JSON.parse(fullAnalysis);
            } catch {
              return sessions;
            }
          }
          if (!fullAnalysis || typeof fullAnalysis !== 'object') return sessions;

          sessions.push({
            id: result.id,
            label: `${session.hero_position || '?'} ${session.hero_hand || '??'} on ${session.board_flop || 'Preflop'}`,
            hero_position: session.hero_position,
            hero_hand: session.hero_hand,
            primary_action: result.primary_action,
            full_analysis: fullAnalysis,
            confidence: result.confidence,
            date: result.created_at,
          });
          return sessions;
        }, []);
        setStudySessions(formatted);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('[useStudyDeck] Error:', err);
      setStudySessions([]);
    } finally {
      if (requestId === requestIdRef.current && authReady) setIsLoading(false);
    }
  }, [limit, hasExplicitAuth, authReady, authUserId]);

  useEffect(() => {
    fetchStudySessions();
    if (typeof window === 'undefined') return;
    const handleUpdate = () => fetchStudySessions();
    window.addEventListener('pa-data-updated', handleUpdate);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('pa-data-updated', handleUpdate);
    };
  }, [fetchStudySessions]);

  return { studySessions, isLoading, refetch: fetchStudySessions };
}

// ═══════════════════════════════════════════════════════════════════════════
// useQuizLeaderboard — Aggregate quiz results for leaderboard display
// ═══════════════════════════════════════════════════════════════════════════

export function useQuizLeaderboard(limit = 10, authState) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasExplicitAuth = authState !== undefined;
  const authReady = !hasExplicitAuth || authState?.ready !== false;
  const authUserId = hasExplicitAuth ? (authState?.userId || null) : undefined;

  useEffect(() => {
    let cancelled = false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    async function fetchLeaderboard() {
      try {
        setIsLoading(true);
        setError(null);
        if (!authReady) return;
        // Aggregated server-side (service-role) so the browser never reads
        // other users' quiz rows — and so the board isn't just the viewer.
        const token = await getAuthToken();
        if (!token) {
          if (!cancelled) setEntries([]);
          return;
        }

        const response = await fetch(`/api/sandbox/quiz-leaderboard?limit=${encodeURIComponent(limit)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          ...(controller ? { signal: controller.signal } : {}),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || data?.success === false) {
          if (!cancelled) {
            setEntries([]);
            setError(data?.error || `Leaderboard unavailable (${response.status})`);
          }
          return;
        }

        if (!cancelled) setEntries(Array.isArray(data?.entries) ? data.entries : []);
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.warn('[useQuizLeaderboard] Error:', err);
        setEntries([]);
        setError('Leaderboard unavailable');
      } finally {
        if (!cancelled && authReady) setIsLoading(false);
      }
    }

    fetchLeaderboard();
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [limit, authReady, authUserId]);

  return { entries, isLoading, error };
}

// ═══════════════════════════════════════════════════════════════════════════
// useLeakDetection — Trigger leak detection analysis
// ═══════════════════════════════════════════════════════════════════════════

export function useLeakDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  const runDetection = useCallback(async () => {
    abortRef.current?.abort();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      setIsDetecting(true);
      setError(null);

      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const token = await getAuthToken();
      if (!token) {
        setError('Must be logged in to run leak detection');
        return { success: false, error: 'Not logged in' };
      }

      const response = await fetch('/api/assistant/leaks/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({}),
        ...(controller ? { signal: controller.signal } : {}),
      });

      const data = await response.json();
      if (requestId !== requestIdRef.current) return { success: false, superseded: true };

      if (!response.ok) {
        setError(data?.error || `Detection failed (${response.status})`);
        return { success: false, error: data?.error || `HTTP ${response.status}` };
      }

      if (data.success) {
        setDetectionResult(data);

        // 📢 Dispatch BUS LISTENER update (Leak finding affects Stats and Leak lists)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      } else {
        setError(data.error || 'Detection failed');
      }

      return data;
    } catch (err) {
      if (err?.name === 'AbortError' || requestId !== requestIdRef.current) {
        return { success: false, superseded: true };
      }
      console.warn('Leak detection error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      if (requestId === requestIdRef.current) setIsDetecting(false);
    }
  }, []);

  useEffect(() => () => {
    requestIdRef.current += 1;
    try { abortRef.current?.abort(); } catch (e) { /* already settled */ }
  }, []);

  return { runDetection, isDetecting, detectionResult, error };
}

// ═══════════════════════════════════════════════════════════════════════════
// useLeakHandExamples — Fetch hand examples for a specific leak
// ═══════════════════════════════════════════════════════════════════════════

export function useLeakHandExamples(leakId) {
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const fetchExamples = useCallback(async () => {
    if (!leakId) return;
    const requestId = ++requestIdRef.current;

    try {
      setIsLoading(true);
      setError(null);

      // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
      const user = getAuthUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('leak_hand_examples')
        .select(`
          id,
          situation_snapshot:hand_data,
          ev_loss_bb:ev_loss,
          created_at,
          hand_history_id
        `)
        .eq('leak_id', leakId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchError) {
        if (requestId !== requestIdRef.current) return;
        console.warn('Error fetching leak examples:', fetchError);
        setError(fetchError.message);
        return;
      }

      const formatted = (data || []).map(ex => ({
        id: ex.id,
        snapshot: ex.situation_snapshot,
        evLoss: ex.ev_loss_bb,
        date: ex.created_at,
        handId: ex.hand_history_id,
      }));

      if (requestId === requestIdRef.current) setExamples(formatted);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Fetch examples error:', err);
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [leakId]);

  useEffect(() => {
    if (leakId) {
      fetchExamples();
    }
    return () => { requestIdRef.current += 1; };
  }, [leakId, fetchExamples]);

  return { examples, isLoading, error, refetch: fetchExamples };
}

// ═══════════════════════════════════════════════════════════════════════════
// useTrainingStats — Fetch user's GTO Training progress from training_sessions
// ═══════════════════════════════════════════════════════════════════════════

export function useTrainingStats() {
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    totalAccuracy: 0,
    bestStreak: 0,
    weakestCategory: 'Not enough data',
    strongestCategory: 'Not enough data',
    recentSessions: [],
    categoryProgress: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTrainingStats() {
      try {
        // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
        const user = getAuthUser();
        if (!user) {
          // Demo data for non-logged-in users
          setStats({
            gamesPlayed: 12,
            totalAccuracy: 68,
            bestStreak: 5,
            weakestCategory: 'River Play',
            strongestCategory: 'Preflop Ranges',
            recentSessions: [
              { date: 'Today', gameId: 'demo1', gameName: 'Opening Ranges', accuracy: 75, duration: 10 },
              { date: 'Yesterday', gameId: 'demo2', gameName: 'C-Bet Strategy', accuracy: 62, duration: 8 },
            ],
            categoryProgress: [
              { category: 'Preflop', accuracy: 78, gamesPlayed: 5 },
              { category: 'Flop', accuracy: 65, gamesPlayed: 4 },
              { category: 'Turn', accuracy: 60, gamesPlayed: 2 },
              { category: 'River', accuracy: 52, gamesPlayed: 1 },
            ]
          });
          setIsLoading(false);
          return;
        }

        // Fetch from training_sessions table
        const { data: sessions, error: sessionsError } = await supabase
          .from('training_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (sessionsError) {
          console.warn('Training sessions fetch error:', sessionsError);
          throw sessionsError;
        }

        if (!sessions || sessions.length === 0) {
          setStats({
            gamesPlayed: 0,
            totalAccuracy: 0,
            bestStreak: 0,
            weakestCategory: 'Start training!',
            strongestCategory: 'Start training!',
            recentSessions: [],
            categoryProgress: []
          });
          setIsLoading(false);
          return;
        }

        // Calculate stats from sessions
        const gamesPlayed = sessions.length;
        const totalAccuracy = Math.round(
          sessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / gamesPlayed
        );
        const bestStreak = sessions.reduce((max, s) => Math.max(max, s.streak || 0), 0);

        // Group by category
        const categoryMap = {};
        sessions.forEach(s => {
          const cat = s.category || 'General';
          if (!categoryMap[cat]) {
            categoryMap[cat] = { total: 0, count: 0 };
          }
          categoryMap[cat].total += (s.accuracy || 0);
          categoryMap[cat].count += 1;
        });

        const categoryProgress = Object.entries(categoryMap || {}).map(([category, data]) => ({
          category,
          accuracy: Math.round(data.total / data.count),
          gamesPlayed: data.count
        })).sort((a, b) => b.gamesPlayed - a.gamesPlayed);

        // Find weakest and strongest
        const sorted = [...categoryProgress].sort((a, b) => a.accuracy - b.accuracy);
        const weakestCategory = sorted[0]?.category || 'Not enough data';
        const strongestCategory = sorted[sorted.length - 1]?.category || 'Not enough data';

        // Recent sessions (last 5)
        const recentSessions = sessions.slice(0, 5).map(s => ({
          date: new Date(s.created_at).toLocaleDateString(),
          gameId: s.game_id || s.id,
          gameName: s.game_name || s.category || 'Training Session',
          accuracy: s.accuracy || 0,
          duration: s.duration_seconds ? Math.round(s.duration_seconds / 60) : 0
        }));

        setStats({
          gamesPlayed,
          totalAccuracy,
          bestStreak,
          weakestCategory,
          strongestCategory,
          recentSessions,
          categoryProgress
        });
      } catch (err) {
        console.warn('Error fetching training stats:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTrainingStats();
  }, []);

  return { stats, isLoading, error };
}
